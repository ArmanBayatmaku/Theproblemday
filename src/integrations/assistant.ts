import type { JobDraft, QuoteOption } from '@shared/types';
import { interpret, missingFields, type AssistantIntent } from '@shared/parser';
import { compareWithOwnFleet } from '@shared/pricing';
import { describeTiming, toLocalInput, toWeekday, WEEKDAYS_LONG } from '@shared/schedule';
import { droneFlyability } from '@shared/weather';
import { useStore } from '@/store/useStore';
import { geocode } from './geocode';
import { kg, mins, money } from '@/lib/format';
import { COMMAND_META } from './devices/capabilities';

let aiStatus: { checked: boolean; ai: boolean; model?: string } = { checked: false, ai: false };

export async function assistantMode(): Promise<{ ai: boolean; model?: string }> {
  if (aiStatus.checked) return aiStatus;
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    aiStatus = { checked: true, ai: !!j.ai, model: j.model };
  } catch {
    aiStatus = { checked: true, ai: false };
  }
  return aiStatus;
}

/** Ask the server-side LLM (Claude) to interpret the message; falls back to the offline parser. */
async function understand(text: string): Promise<{ intent: AssistantIntent; via: 'claude' | 'local'; reply?: string }> {
  const s = useStore.getState();
  const ctx = { now: s.sim.now, sites: s.sites, assets: s.assets, draft: s.draft };
  const mode = await assistantMode();
  if (mode.ai) {
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: s.chat.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          draft: s.draft,
          now: `${toLocalInput(s.sim.now)} ${WEEKDAYS_LONG[toWeekday(new Date(s.sim.now))]}`,
          sites: s.sites.map((x) => ({ id: x.id, name: x.name, kind: x.kind })),
          machines: s.assets.filter((a) => a.ownership !== 'external').map((a) => ({ id: a.id, kind: a.kind, siteId: a.siteId })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.intent) return { intent: j.intent as AssistantIntent, via: 'claude', reply: j.reply };
      }
    } catch {
      /* fall through to local */
    }
  }
  return { intent: interpret(text, ctx), via: 'local' };
}

function cargoSummary(d: JobDraft) {
  const c = d.cargo;
  const what = c.description || `${c.quantity > 1 ? `${c.quantity} × ` : ''}${c.size} item${c.quantity > 1 ? 's' : ''}`;
  const extras = [kg(c.weightKg), c.temperature && c.temperature !== 'ambient' ? c.temperature : '', c.fragile ? 'fragile' : ''].filter(Boolean).join(', ');
  return `${what} (${extras})`;
}

export function pickOption(which: string, quotes: QuoteOption[]): QuoteOption | undefined {
  const w = which.toLowerCase();
  const avail = quotes.filter((q) => q.available);
  const byBadge = (b: string) => avail.find((q) => q.badges.includes(b as any));
  if (/cheap/.test(w)) return byBadge('cheapest');
  if (/fast|quick/.test(w)) return byBadge('fastest');
  if (/green|eco/.test(w)) return byBadge('greenest');
  if (/drone|hive|air/.test(w)) return avail.find((q) => q.providerId === 'hive-air');
  if (/waymo|autonomous car|robotaxi/.test(w)) return avail.find((q) => q.providerId === 'waymo');
  if (/uber|courier/.test(w)) return avail.find((q) => q.providerId === 'uber-courier');
  if (/bike|cityhop/.test(w)) return avail.find((q) => q.providerId === 'cityhop');
  if (/van|thames/.test(w) && !/own|our|my/.test(w)) return avail.find((q) => q.providerId === 'thames-express');
  if (/own|our|my|truck|fleet/.test(w)) return avail.filter((q) => q.category === 'own_fleet').sort((a, b) => a.price - b.price)[0];
  const n = w.match(/(\d+)/);
  if (n) return avail[parseInt(n[1], 10) - 1];
  return byBadge('recommended') ?? avail[0];
}

export interface AssistantResult {
  text: string;
  quotes?: QuoteOption[];
  via: 'claude' | 'local';
  command?: { command: any; targetIds: string[]; label: string };
  bookedJobId?: string;
}

export async function handleMessage(text: string, opts: { selectedOptionId?: string } = {}): Promise<AssistantResult> {
  const { intent, via, reply } = await understand(text);
  const s = useStore.getState();

  switch (intent.type) {
    case 'reset':
      s.resetDraft();
      return { text: 'Cleared. What would you like to send?', via };
    case 'question': {
      const w = s.weather();
      if (intent.topic === 'weather' || intent.topic === 'airspace') {
        const f5 = droneFlyability(w, { maxWindMs: 12, ipRating: 'IP55' });
        const f2 = droneFlyability(w, { maxWindMs: 10, ipRating: 'IP54' });
        const zones = s.zones.filter((z) => z.active);
        return {
          via,
          text:
            `Wind at 120 m is ${w.windMs120.toFixed(1)} m/s (gusts ${w.gustMs.toFixed(1)}), ${w.summary.toLowerCase()}, ${Math.round(w.tempC)}°C. ` +
            `Skylift H5 drones: ${f5.status === 'go' ? 'GO' : f5.status === 'caution' ? 'caution' : 'grounded'}; Courier H2: ${f2.status === 'go' ? 'GO' : f2.status === 'caution' ? 'caution' : 'grounded'}. ` +
            `${zones.length} restrictions are active, including ${zones.filter((z) => z.kind === 'frz').map((z) => z.name).join(' and ')}. Drone routes avoid them automatically.`,
        };
      }
      if (intent.topic === 'fleet') {
        const own = s.assets.filter((a) => a.ownership !== 'external');
        const idle = own.filter((a) => a.status === 'idle');
        return { via, text: `${own.length} machines registered — ${idle.length} idle, ${own.filter((a) => ['en_route', 'working', 'returning'].includes(a.status)).length} busy, ${own.filter((a) => a.status === 'charging').length} charging. Idle drones: ${idle.filter((a) => a.kind === 'drone').map((a) => a.id).join(', ') || 'none'}.` };
      }
      if (intent.topic === 'jobs') {
        const up = s.jobs.filter((j) => ['scheduled', 'recurring'].includes(j.status)).slice(0, 6);
        return { via, text: up.length ? `Upcoming: ${up.map((j) => `${j.id} ${j.pickup.name} → ${j.dropoff.name} (${describeTiming(j.timing, s.sim.now)}, ${j.option.providerName})`).join('; ')}.` : 'Nothing scheduled.' };
      }
      return {
        via,
        text: 'Tell me what to move and where — e.g. “2 kg parcel from FreshCo Kensington to Notting Hill now”, “6 crates from Park Royal warehouse to King’s Cross store every weekday at 9am”, or “3 pallets to E14 5AB tomorrow morning, cheapest”. I can also control machines: “return all drones at Nine Elms”.',
      };
    }
    case 'command': {
      const meta = COMMAND_META[intent.command];
      return {
        via,
        text: `That's a control command: **${meta.label}** for ${intent.targetLabel} (${intent.targetIds.length} machine${intent.targetIds.length > 1 ? 's' : ''}). Confirm below to send it.`,
        command: { command: intent.command, targetIds: intent.targetIds, label: intent.targetLabel },
      };
    }
    case 'book': {
      const quotes = s.quote();
      if (!quotes.length) return { via, text: 'I need a pickup and drop-off before I can book. Where is it going?' };
      const generic = /^(recommended|it|this|that|this one|that one|now|selected|)$/.test(intent.which.trim().toLowerCase());
      const chosen = generic && opts.selectedOptionId ? quotes.find((q) => q.id === opts.selectedOptionId && q.available) : undefined;
      const opt = chosen ?? pickOption(intent.which, quotes);
      if (!opt) return { via, text: `I couldn't find an available option matching “${intent.which}”.`, quotes };
      const job = s.bookJob(s.draft, opt);
      if (!job) return { via, text: 'Something is missing — check pickup and drop-off.' };
      s.resetDraft();
      return {
        via,
        bookedJobId: job.id,
        text: `Booked **${job.id}** with ${opt.providerName} (${opt.serviceName}) for ${money(opt.price)} — ${job.timing.mode === 'now' ? `pickup in ~${mins(opt.pickupEtaMin)}, delivery in ~${mins(opt.pickupEtaMin + opt.durationMin)}` : describeTiming(job.timing, s.sim.now)}. You can track it on the Jobs page or the live map.`,
      };
    }
    case 'unknown':
      return { via, text: reply ?? "I didn't catch a delivery or command there. Try “send 3 boxes (12 kg) from Park Royal warehouse to Canary Wharf store tomorrow at 2pm”." };
    case 'job': {
      if (intent.patch && Object.keys(intent.patch).length) s.setDraft(intent.patch);
      const notFound: string[] = [];
      for (const u of intent.unresolved) {
        const place = await geocode(u.query, s.sites);
        if (place) useStore.getState().setDraft({ [u.field]: place } as Partial<JobDraft>);
        else notFound.push(`${u.field === 'pickup' ? 'pickup' : 'drop-off'} “${u.query}”`);
      }
      const draft = useStore.getState().draft;
      const missing = missingFields(draft);
      if (missing.length) {
        const ask = missing.includes('pickup') && missing.includes('dropoff') ? 'Where should it be picked up, and where is it going?' : missing.includes('pickup') ? 'Where should it be picked up from?' : 'Where is it going?';
        return { via, text: `${notFound.length ? `I couldn't place ${notFound.join(' and ')}. ` : ''}Got it — ${cargoSummary(draft)}. ${ask} (A store, warehouse, area or postcode works.)` };
      }
      const quotes = useStore.getState().quote(draft);
      const avail = quotes.filter((q) => q.available);
      const rec = avail.find((q) => q.badges.includes('recommended')) ?? avail[0];
      const cmp = compareWithOwnFleet(quotes);
      const when = describeTiming(draft.timing, s.sim.now);
      const blocked = quotes.filter((q) => !q.available && q.category !== 'own_fleet').map((q) => `${q.providerName}: ${q.reasons[0]}`);
      return {
        via,
        quotes,
        text:
          `${reply ? `${reply} ` : ''}Here are ${avail.length} ways to send ${cargoSummary(draft)} from **${draft.pickup!.name}** to **${draft.dropoff!.name}** — ${when.toLowerCase()}. ` +
          (rec ? `I'd go with **${rec.providerName} ${rec.serviceName}** at ${money(rec.price)}, arriving in about ${mins(rec.pickupEtaMin + rec.durationMin)}. ` : 'Nothing can take this right now. ') +
          (cmp ? `${cmp.message} ` : '') +
          (blocked.length ? `Not available: ${blocked.slice(0, 2).join('; ')}.` : '') +
          ' Say “book it”, “book the cheapest”, or pick one below.',
      };
    }
  }
}
