import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LoaderCircle, Search as SearchIcon, Sparkles } from 'lucide-react';
import type { Place } from '@shared/types';
import { interpret } from '@shared/parser';
import { geocode } from '@/integrations/geocode';
import { useApp } from '../store';
import { inferService, serviceById, SIZES } from '../services';
import { ServiceArt } from '../art';
import type { OrderForm, ServiceId, SizeId } from '../types';
import { dayLabel, hhmm } from '../ui';

const EXAMPLES = [
  'Sold my jacket, buyer is in Hackney',
  'Return a parcel this afternoon',
  'Collect a bike from a seller in Brixton',
  'Move a sofa to Clapham on Saturday',
  'Get my keys from work',
  'Ride to King’s Cross',
  'Drone photos of my house',
];

const empty = { cargo: { description: '', weightKg: 2, quantity: 1, size: 'small' as const }, timing: { mode: 'now' as const }, priority: 'balanced' as const };

function sizeFromKg(kg?: number): SizeId | undefined {
  if (kg === undefined) return undefined;
  return kg <= 0.5 ? 'pocket' : kg <= 3 ? 'shoebox' : kg <= 12 ? 'suitcase' : 'bulky';
}

/** Turns a sentence into a service plus whatever details it mentions. */
function understand(text: string) {
  const service = inferService(text);
  const intent = interpret(text, { now: Date.now(), sites: [], assets: [], draft: empty });
  const prefill: Partial<OrderForm> = {};
  const unresolved: { field: 'from' | 'to'; query: string }[] = [];
  if (intent.type === 'job') {
    const p = intent.patch;
    // "…buyer is in Hackney" / "Ride to King's Cross": a single place is where it goes, except when collecting.
    const single = p.pickup && !p.dropoff ? p.pickup : undefined;
    if (single) {
      if (service === 'collect' || service === 'errand') prefill.from = single;
      else prefill.to = single;
    } else {
      if (p.pickup) prefill.from = p.pickup;
      if (p.dropoff) prefill.to = p.dropoff;
    }
    for (const u of intent.unresolved) unresolved.push({ field: u.field === 'pickup' ? (service === 'collect' || service === 'errand' ? 'from' : 'to') : 'to', query: u.query });
    const size = sizeFromKg(p.cargo?.weightKg);
    if (size && p.cargo?.weightKg !== 2) prefill.size = size;
    if (p.cargo?.description) prefill.itemNote = p.cargo.description;
    if (p.cargo?.fragile) prefill.fragile = true;
    if (p.timing?.mode === 'scheduled' && new Date(p.timing.at).getTime() > Date.now() + 15 * 60_000) prefill.when = { mode: 'later', at: new Date(p.timing.at).getTime() };
  } else {
    const m = text.match(/\b(?:to|in|from)\s+([A-Za-z' ]{3,30})$/i);
    if (m) unresolved.push({ field: service === 'collect' || service === 'errand' ? 'from' : 'to', query: m[1] });
  }
  if (/\bbike\b/i.test(text) && service !== 'ride') prefill.size = 'bulky';
  if (/\bsofa|couch\b/i.test(text)) prefill.moveItems = { sofa: 1 };
  if (/\bwork\b/i.test(text) && service === 'errand') prefill.from = useApp.getState().work;
  if (service === 'errand') prefill.errandText = text;
  if (/\b(house|home|flat)\b/i.test(text) && service === 'aerial') prefill.to = useApp.getState().home;
  return { service, prefill, unresolved };
}

export function Search() {
  const nav = useNavigate();
  const startDraft = useApp((s) => s.startDraft);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim().length > 2 ? understand(text) : undefined), [text]);

  const go = async (t = text) => {
    const r = t === text && parsed ? parsed : understand(t);
    setBusy(true);
    const prefill = { ...r.prefill };
    for (const u of r.unresolved) {
      const p: Place | undefined = await geocode(u.query, []);
      if (p) prefill[u.field] = p;
    }
    setBusy(false);
    startDraft(r.service, prefill);
    nav(`/new/${r.service}`, { replace: true });
  };

  const svc = parsed ? serviceById(parsed.service) : undefined;
  const bits = parsed
    ? [
        parsed.prefill.size ? SIZES.find((s) => s.id === parsed.prefill.size)?.label : undefined,
        parsed.prefill.from ? `from ${parsed.prefill.from.name}` : undefined,
        parsed.prefill.to ? `to ${parsed.prefill.to.name}` : parsed.unresolved.find((u) => u.field === 'to') ? `to ${parsed.unresolved.find((u) => u.field === 'to')!.query}` : undefined,
        parsed.prefill.when?.mode === 'later' ? `${dayLabel(parsed.prefill.when.at)} ${hhmm(parsed.prefill.when.at)}` : undefined,
      ].filter(Boolean)
    : [];

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-3 pt-2 pb-3 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        <button type="button" aria-label="Back" onClick={() => nav(-1)} className="w-11 h-11 grid place-items-center rounded-full active:bg-[#f3f3f3]">
          <ArrowLeft size={24} />
        </button>
        <form
          className="mx-2 mt-1 flex items-center gap-3 h-14 rounded-xl bg-[#f3f3f3] px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed) void go();
          }}
        >
          <SearchIcon size={20} className="shrink-0" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you need?" className="flex-1 bg-transparent outline-none text-[17px] font-medium placeholder:text-[#8f8f8f]" />
          {busy && <LoaderCircle size={18} className="animate-spin" />}
        </form>
      </div>

      <div className="flex-1 overflow-y-auto">
        {parsed && svc && (
          <button type="button" onClick={() => void go()} className="mx-5 mt-5 w-[calc(100%-40px)] flex items-center gap-3 p-4 rounded-2xl border-2 border-black text-left fade-in">
            <span className="w-14 h-14 rounded-xl bg-[#f3f3f3] grid place-items-center shrink-0">
              <ServiceArt id={svc.id} className="w-9 h-9" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6b6b6b]">
                <Sparkles size={13} /> Sounds like
              </span>
              <span className="block text-[17px] font-bold">{svc.headline}</span>
              {bits.length > 0 && <span className="block text-[14px] text-[#5e5e5e] truncate">{bits.join(' · ')}</span>}
            </span>
            <ArrowRight size={20} />
          </button>
        )}

        <div className="px-5 pt-6 pb-2 text-[13px] font-semibold text-[#6b6b6b]">Try saying</div>
        {EXAMPLES.map((e) => {
          const s = inferService(e);
          return (
            <button key={e} type="button" onClick={() => setText(e)} className="w-full flex items-center gap-4 px-5 py-3 text-left active:bg-[#f6f6f6]">
              <span className="w-10 h-10 rounded-full bg-[#f3f3f3] grid place-items-center shrink-0">
                <ServiceArt id={s} className="w-6 h-6" />
              </span>
              <span className="text-[16px]">{e}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { ServiceId };
