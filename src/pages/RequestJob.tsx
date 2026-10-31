import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDownUp,
  Bot,
  CalendarClock,
  CircleCheck,
  Crosshair,
  LoaderCircle,
  MapPin,
  Repeat,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  Trash,
  X,
  Zap,
} from 'lucide-react';
import type { Job, LngLat, Place, QuoteOption, Recurrence, Timing, Weekday } from '@shared/types';
import { LONDON_PLACES } from '@shared/data/london';
import { compareWithOwnFleet, type FleetComparison } from '@shared/pricing';
import { providerById } from '@shared/providers';
import { describeRecurrence, describeTiming, formatWhen, hhmm, nextOccurrence, timingStart, toLocalInput, WEEKDAYS } from '@shared/schedule';
import { distanceM, formatDistance } from '@shared/geo';
import { useStore, type ChatMessage } from '@/store/useStore';
import { assistantMode, handleMessage } from '@/integrations/assistant';
import { geocode } from '@/integrations/geocode';
import { FleetMap } from '@/components/map/FleetMap';
import type { FocusPoint } from '@/components/map/layers';
import { Badge, Button, Card, Empty, Field, Input, Segmented, Select, Toggle } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { KIND_ICON, SiteIcon } from '@/lib/icons';
import { co2, kg, mins, money } from '@/lib/format';
import { COMMAND_META } from '@/integrations/devices/capabilities';

const OWN_COLOR = '#ff8a4c';
const PICKUP_COLOR: [number, number, number] = [139, 212, 80];
const DROPOFF_COLOR: [number, number, number] = [168, 115, 232];

const CATEGORY_ICON = {
  drone: KIND_ICON.drone,
  autonomous_car: KIND_ICON.robotaxi,
  courier: KIND_ICON.car,
  van: KIND_ICON.van,
  cargo_bike: KIND_ICON.cargo_bike,
  own_fleet: KIND_ICON.van,
} as const;

export const optionColor = (q: QuoteOption) => (q.category === 'own_fleet' ? OWN_COLOR : providerById(q.providerId)?.color ?? '#9aa2ab');
export const OptionIcon = ({ q, size = 20 }: { q: QuoteOption; size?: number }) => {
  const Icon = q.category === 'own_fleet' ? KIND_ICON[q.assetKind ?? 'van'] : CATEGORY_ICON[q.category];
  return <Icon size={size} />;
};

const SUGGESTIONS = [
  '2 kg parcel from Kensington store to Notting Hill now',
  '30 kg of catering from Shoreditch store to Bank now',
  "6 pallets chilled from Park Royal warehouse to King's Cross store tomorrow at 7am",
  '8 crates from Barking Riverside warehouse to Canary Wharf store every weekday at 9am',
  'Gift box to E14 5AB in 30 minutes, fastest',
  'Can the drones fly right now?',
];

/** Minimal **bold** support for assistant replies. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <b key={i} className="text-text font-semibold">
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- assistant
function AssistantPanel({
  className,
  selectedOptionId,
  onSelectOption,
  onBooked,
  initial,
  onInitialSent,
}: {
  className?: string;
  selectedOptionId?: string;
  onSelectOption: (id: string) => void;
  onBooked: (jobId: string) => void;
  initial?: string;
  onInitialSent: () => void;
}) {
  const chat = useStore((s) => s.chat);
  const addChat = useStore((s) => s.addChat);
  const patchChat = useStore((s) => s.patchChat);
  const clearChat = useStore((s) => s.clearChat);
  const runCommand = useStore((s) => s.runCommand);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<{ ai: boolean; model?: string }>();
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef<string | undefined>(undefined);

  useEffect(() => {
    assistantMode().then(setMode);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, busy]);

  const send = async (msg: string) => {
    const t = msg.trim();
    if (!t || busy) return;
    setText('');
    addChat({ role: 'user', text: t });
    setBusy(true);
    try {
      const res = await handleMessage(t, { selectedOptionId });
      addChat({ role: 'assistant', text: res.text, quotes: res.quotes, via: res.via, command: res.command, bookedJobId: res.bookedJobId });
      if (res.bookedJobId) onBooked(res.bookedJobId);
    } catch {
      addChat({ role: 'assistant', text: 'Something went wrong there — please try again.', via: 'local' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initial && sentInitial.current !== initial) {
      sentInitial.current = initial;
      void send(initial);
      onInitialSent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const execute = (m: ChatMessage) => {
    if (!m.command) return;
    const rec = runCommand(m.command.command, m.command.targetIds);
    patchChat(m.id, { command: { ...m.command, executed: true } });
    addChat({ role: 'assistant', text: `${COMMAND_META[m.command.command].label}: ${rec.result === 'ok' ? 'done' : rec.result} — ${rec.message}`, via: 'local' });
    (rec.result === 'rejected' ? toast.warning : toast.success)(`${COMMAND_META[m.command.command].label} → ${m.command.label}`, rec.message);
  };

  return (
    <section className={clsx('flex flex-col min-h-0 bg-panel', className)}>
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-violet/15 text-violet">
            <Sparkles size={15} />
          </span>
          <div className="min-w-0">
            <div className="label-caps text-[13px]">Assistant</div>
            <div className="text-[11px] text-muted truncate" title={mode?.ai ? undefined : 'Add ANTHROPIC_API_KEY to .env and run the API server to use Claude'}>
              {mode === undefined ? 'Connecting…' : mode.ai ? `Claude · ${mode.model ?? 'connected'}` : 'Offline parser · add an API key for Claude'}
            </div>
          </div>
        </div>
        {chat.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Trash size={13} />} onClick={clearChat}>
            Clear
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
        {chat.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl bg-panel-2 border border-line p-3.5 text-[13px] text-muted leading-relaxed">
              Tell me what needs moving, from where, to where and when — once, at a set time, or on repeat. I'll price every method side by side: Hive drones, Waymo, couriers, partner vans and <b className="text-text">your own fleet</b>.
            </div>
            <div className="label-caps text-[11px] text-dim pt-1">Try</div>
            {SUGGESTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left text-[13px] px-3 py-2 rounded-lg border border-line hover:border-violet/60 hover:bg-violet/5 text-text/90"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={clsx('flex fade-in', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                m.role === 'user' ? 'bg-blue text-[#0d1520] rounded-br-md' : 'bg-panel-2 border border-line text-muted rounded-bl-md',
              )}
            >
              <Rich text={m.text} />
              {m.quotes && m.quotes.some((q) => q.available) && (
                <div className="mt-2.5 space-y-1.5">
                  {m.quotes
                    .filter((q) => q.available)
                    .slice(0, 4)
                    .map((q) => (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => onSelectOption(q.id)}
                        className={clsx(
                          'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 border text-left',
                          selectedOptionId === q.id ? 'border-blue bg-blue/10' : 'border-line bg-panel hover:bg-panel-3',
                        )}
                      >
                        <span style={{ color: optionColor(q) }}>
                          <OptionIcon q={q} size={15} />
                        </span>
                        <span className="flex-1 min-w-0 truncate text-text text-[12px]">
                          {q.providerName} <span className="text-dim">· {mins(q.pickupEtaMin + q.durationMin)}</span>
                        </span>
                        <span className="num text-[13px] text-text">{money(q.price)}</span>
                      </button>
                    ))}
                </div>
              )}
              {m.command && (
                <div className="mt-2.5">
                  <Button
                    size="sm"
                    variant={COMMAND_META[m.command.command].danger ? 'danger' : 'primary'}
                    disabled={m.command.executed}
                    onClick={() => execute(m)}
                    icon={<Zap size={13} />}
                  >
                    {m.command.executed ? 'Sent' : `Send: ${COMMAND_META[m.command.command].label}`}
                  </Button>
                </div>
              )}
              {m.bookedJobId && (
                <div className="mt-2 flex items-center gap-1.5 text-green text-xs font-semibold">
                  <CircleCheck size={14} /> {m.bookedJobId} booked
                </div>
              )}
              {m.role === 'assistant' && m.via && <div className="text-[10px] text-dim mt-1.5">{m.via === 'claude' ? 'via Claude' : 'offline parser'}</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <LoaderCircle size={14} className="animate-spin" /> Pricing options…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="p-3 border-t border-line"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-[#1a1d21] focus-within:border-violet/60 px-3 py-2">
          <Bot size={16} className="text-muted mb-1.5 shrink-0" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={2}
            placeholder="e.g. 3 boxes, 12 kg, Shoreditch store → Bank every Friday 4pm"
            className="flex-1 bg-transparent resize-none outline-none text-[13px] placeholder:text-dim"
          />
          <button type="submit" disabled={!text.trim() || busy} className="w-8 h-8 rounded-lg bg-violet text-[#170d24] grid place-items-center disabled:opacity-30 shrink-0">
            <Send size={15} />
          </button>
        </div>
        <div className="text-[10px] text-dim mt-1.5 px-1">Enter to send · say “book it” or “book the cheapest” when you're happy</div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- place input
function PlaceInput({
  label,
  color,
  value,
  onChange,
  onPick,
  picking,
}: {
  label: string;
  color: string;
  value?: Place;
  onChange: (p?: Place) => void;
  onPick: () => void;
  picking: boolean;
}) {
  const sites = useStore((s) => s.sites);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const siteOpts = sites
      .filter((s) => !t || s.name.toLowerCase().includes(t) || s.address.toLowerCase().includes(t) || s.id.toLowerCase() === t)
      .map((s) => ({ key: s.id, label: s.name, hint: s.address, kind: s.kind, place: { name: s.name, position: s.position, siteId: s.id, address: s.address } as Place }));
    const placeOpts = t
      ? LONDON_PLACES.filter((p) => p.name.toLowerCase().includes(t) || p.aliases?.some((a) => a.includes(t))).map((p) => ({
          key: p.name,
          label: p.name,
          hint: 'London area',
          kind: undefined,
          place: { name: p.name, position: p.position } as Place,
        }))
      : [];
    return [...siteOpts, ...placeOpts].slice(0, 9);
  }, [q, sites]);

  const choose = (p: Place) => {
    onChange(p);
    setQ('');
    setOpen(false);
    setErr('');
  };

  const lookup = async () => {
    if (!q.trim()) return;
    if (options.length && options[0].label.toLowerCase().includes(q.trim().toLowerCase())) return choose(options[0].place);
    setBusy(true);
    const p = await geocode(q, sites);
    setBusy(false);
    if (p) choose(p);
    else setErr(`Couldn't find “${q}” — try a postcode, area or one of your sites.`);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={open ? q : value?.name ?? ''}
            placeholder="Site, area or postcode (e.g. SE1 9SG)"
            onFocus={() => {
              setOpen(true);
              setQ('');
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQ(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void lookup();
              }
            }}
            className="w-full pr-8"
          />
          {busy && <LoaderCircle size={14} className="animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />}
          {!busy && value && !open && (
            <button type="button" onClick={() => onChange(undefined)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-text" title="Clear">
              <X size={14} />
            </button>
          )}
          {open && options.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-line bg-panel shadow-2xl overflow-hidden">
              {options.map((o) => (
                <button
                  type="button"
                  key={o.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o.place);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-panel-2"
                >
                  {o.kind ? <SiteIcon kind={o.kind} size={14} /> : <MapPin size={14} className="text-muted" />}
                  <span className="text-[13px] flex-1 truncate">{o.label}</span>
                  <span className="text-[11px] text-dim truncate max-w-[45%]">{o.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant={picking ? 'primary' : 'subtle'} onClick={onPick} title="Pick on the map" icon={<Crosshair size={15} />} />
      </div>
      <div className="text-[11px] mt-1 min-h-[16px]">
        {err ? <span className="text-amber">{err}</span> : value ? <span className="text-dim">{value.address ?? `${value.position[1].toFixed(4)}, ${value.position[0].toFixed(4)}`}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- timing
const presetOf = (r: Recurrence): string => {
  if (r.freq === 'hourly') return 'hourly';
  if (r.freq === 'daily') return 'daily';
  if (r.freq === 'monthly') return 'monthly';
  const d = r.byWeekday ?? [];
  if (d.length === 5 && [0, 1, 2, 3, 4].every((x) => d.includes(x as Weekday))) return 'weekdays';
  return 'weekly';
};

function TimingEditor({ timing, now, onChange }: { timing: Timing; now: number; onChange: (t: Timing) => void }) {
  const roundUp = (t: number, m: number) => Math.ceil(t / (m * 60_000)) * m * 60_000;
  const setMode = (mode: Timing['mode']) => {
    if (mode === 'now') onChange({ mode: 'now' });
    if (mode === 'scheduled') onChange({ mode: 'scheduled', at: new Date(roundUp(now + 60 * 60_000, 15)).toISOString() });
    if (mode === 'recurring') onChange({ mode: 'recurring', rule: { freq: 'weekly', interval: 1, byWeekday: [0, 1, 2, 3, 4], time: '09:00' }, startAt: new Date(now).toISOString() });
  };
  const next = useMemo(() => {
    if (timing.mode !== 'recurring') return [];
    const out: number[] = [];
    let after = now;
    const start = new Date(timing.startAt).getTime();
    for (let i = 0; i < 4; i++) {
      const t = nextOccurrence(timing.rule, start, after);
      if (!t) break;
      out.push(t);
      after = t + 60_000;
    }
    return out;
  }, [timing, now]);

  const quick = (t: number) => onChange({ mode: 'scheduled', at: new Date(t).toISOString() });
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now + dayOffset * 86400_000);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  return (
    <div className="space-y-3">
      <Segmented
        value={timing.mode}
        onChange={setMode}
        options={[
          { value: 'now', label: <span className="inline-flex items-center gap-1.5"><Zap size={12} /> Now</span> },
          { value: 'scheduled', label: <span className="inline-flex items-center gap-1.5"><CalendarClock size={12} /> Schedule</span> },
          { value: 'recurring', label: <span className="inline-flex items-center gap-1.5"><Repeat size={12} /> Repeat</span> },
        ]}
      />
      {timing.mode === 'now' && <div className="text-xs text-muted">Dispatched as soon as you book. Pickup times below are live estimates.</div>}
      {timing.mode === 'scheduled' && (
        <div className="space-y-2">
          <Input type="datetime-local" value={toLocalInput(new Date(timing.at).getTime())} onChange={(e) => e.target.value && quick(new Date(e.target.value).getTime())} className="w-full" />
          <div className="flex flex-wrap gap-1.5">
            {[
              ['In 1 hour', roundUp(now + 3600_000, 5)],
              ['Tonight 19:00', at(new Date(now).getHours() >= 19 ? 1 : 0, 19)],
              ['Tomorrow 07:00', at(1, 7)],
              ['Tomorrow 09:00', at(1, 9)],
            ].map(([l, t]) => (
              <button type="button" key={l as string} onClick={() => quick(t as number)} className="text-[11px] px-2 py-1 rounded-md border border-line text-muted hover:text-text hover:bg-panel-2">
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {timing.mode === 'recurring' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Repeats">
              <Select
                value={presetOf(timing.rule)}
                onChange={(e) => {
                  const v = e.target.value;
                  const base = { ...timing.rule };
                  const rule: Recurrence =
                    v === 'daily'
                      ? { ...base, freq: 'daily', byWeekday: undefined }
                      : v === 'weekdays'
                        ? { ...base, freq: 'weekly', byWeekday: [0, 1, 2, 3, 4] }
                        : v === 'weekly'
                          ? { ...base, freq: 'weekly', byWeekday: base.byWeekday?.length && base.byWeekday.length < 5 ? base.byWeekday : [0, 3] }
                          : v === 'hourly'
                            ? { ...base, freq: 'hourly', interval: Math.max(base.interval, 2), byWeekday: undefined }
                            : { ...base, freq: 'monthly', byWeekday: undefined };
                  onChange({ ...timing, rule });
                }}
                className="w-full"
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="weekly">Specific days</option>
                <option value="hourly">Every few hours</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>
            {timing.rule.freq === 'hourly' ? (
              <Field label="Every (hours)">
                <Input type="number" min={1} max={12} value={timing.rule.interval} onChange={(e) => onChange({ ...timing, rule: { ...timing.rule, interval: Math.max(1, +e.target.value || 1) } })} className="w-full" />
              </Field>
            ) : (
              <Field label="At">
                <Input type="time" value={timing.rule.time ?? '09:00'} onChange={(e) => onChange({ ...timing, rule: { ...timing.rule, time: e.target.value } })} className="w-full" />
              </Field>
            )}
          </div>
          {timing.rule.freq === 'weekly' && (
            <div className="flex gap-1">
              {WEEKDAYS.map((d, i) => {
                const on = timing.rule.byWeekday?.includes(i as Weekday);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => {
                      const cur = timing.rule.byWeekday ?? [];
                      const nextDays = (on ? cur.filter((x) => x !== i) : [...cur, i as Weekday]).sort();
                      if (nextDays.length) onChange({ ...timing, rule: { ...timing.rule, byWeekday: nextDays } });
                    }}
                    className={clsx('flex-1 h-8 rounded-md text-[12px] font-semibold border', on ? 'bg-blue/15 border-blue text-blue' : 'border-line text-muted hover:text-text')}
                  >
                    {d.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={toLocalInput(new Date(timing.startAt).getTime())}
                onChange={(e) => e.target.value && onChange({ ...timing, startAt: new Date(e.target.value).toISOString() })}
                className="w-full"
              />
            </Field>
            <Field label="Ends (optional)">
              <Input
                type="date"
                value={timing.rule.until?.slice(0, 10) ?? ''}
                onChange={(e) => onChange({ ...timing, rule: { ...timing.rule, until: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : undefined } })}
                className="w-full"
              />
            </Field>
          </div>
          <div className="rounded-lg bg-panel-2 border border-line px-3 py-2.5">
            <div className="text-[13px] font-medium">{describeRecurrence(timing.rule, new Date(timing.startAt).getTime())}</div>
            <div className="text-[11px] text-muted mt-1">Next: {next.length ? next.map((t) => formatWhen(t, now)).join(' · ') : 'no upcoming runs'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- options
const BADGE: Record<string, { label: string; color: string }> = {
  recommended: { label: 'Best match', color: '#b48ae8' },
  cheapest: { label: 'Cheapest', color: '#8bd450' },
  fastest: { label: 'Fastest', color: '#5a9bf0' },
  greenest: { label: 'Greenest', color: '#3fc1b0' },
  your_fleet: { label: 'Your fleet', color: OWN_COLOR },
};

function OptionRow({ q, selected, onSelect, startAt }: { q: QuoteOption; selected: boolean; onSelect: () => void; startAt: number }) {
  const color = optionColor(q);
  const arrive = startAt + (q.pickupEtaMin + q.durationMin) * 60_000;
  return (
    <div
      role="button"
      tabIndex={q.available ? 0 : -1}
      onClick={() => q.available && onSelect()}
      onKeyDown={(e) => e.key === 'Enter' && q.available && onSelect()}
      className={clsx(
        'rounded-xl border p-3 transition-colors',
        selected ? 'border-blue bg-blue/[0.07]' : 'border-line',
        q.available ? 'cursor-pointer hover:border-[#4a525b]' : 'opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}1f`, color }}>
          <OptionIcon q={q} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-semibold text-[14px] truncate">{q.providerName}</span>
            <span className="text-muted text-[12px] truncate">{q.serviceName}</span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {q.available ? (
              <>
                {mins(q.pickupEtaMin)} to pickup · arrives <span className="text-text">{hhmm(arrive)}</span> · {formatDistance(q.distanceKm)}
              </>
            ) : (
              <span className="text-amber">{q.reasons[0]}</span>
            )}
          </div>
          {(q.badges.length > 0 || q.simulated) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {q.badges.map((b) => (
                <Badge key={b} color={BADGE[b].color}>
                  {BADGE[b].label}
                </Badge>
              ))}
              {q.simulated && <Badge color="#6c747d">Simulated</Badge>}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="num text-[19px] leading-tight">{money(q.price)}</div>
          <div className="text-[11px] text-dim mt-0.5">{co2(q.co2g)} CO₂</div>
        </div>
      </div>
      {selected && (
        <div className="mt-3 pt-3 border-t border-line space-y-1 fade-in">
          {q.breakdown.map((l) => (
            <div key={l.label} className="flex justify-between text-xs">
              <span className="text-muted">{l.label}</span>
              <span className="tabular-nums">{money(l.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold pt-1">
            <span>Total</span>
            <span className="tabular-nums">{money(q.price)}</span>
          </div>
          {q.notes.length > 0 && (
            <ul className="pt-1.5 space-y-0.5">
              {q.notes.map((n) => (
                <li key={n} className="text-[11px] text-dim">
                  • {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FleetCompare({ cmp }: { cmp: FleetComparison }) {
  const own = cmp.own!;
  const market = cmp.market!;
  const marketWins = cmp.savings > 0;
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: marketWins ? '#8bd45055' : '#ff8a4c55', background: marketWins ? '#8bd4500d' : '#ff8a4c0d' }}>
      <div className="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wide">
        <Scale size={14} /> Your fleet vs marketplace
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2.5">
        <div className="min-w-0">
          <div className="text-[11px] text-muted truncate">{own.providerName} (yours)</div>
          <div className="num text-[22px]" style={{ color: marketWins ? '#f2f4f6' : '#8bd450' }}>
            {money(own.price)}
          </div>
          <div className="text-[11px] text-dim">ready in {mins(own.pickupEtaMin)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted truncate">
            {market.providerName} · {market.serviceName}
          </div>
          <div className="num text-[22px]" style={{ color: marketWins ? '#8bd450' : '#f2f4f6' }}>
            {money(market.price)}
          </div>
          <div className="text-[11px] text-dim">ready in {mins(market.pickupEtaMin)}</div>
        </div>
      </div>
      <div className="text-xs text-text/90 mt-2.5 leading-relaxed">{cmp.message}</div>
      <div className="text-[11px] text-dim mt-1">Own-fleet cost includes {own.breakdown.map((l) => l.label.split(' ')[0].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.</div>
    </div>
  );
}

function BookedPanel({ job, onNew }: { job: Job; onNew: () => void }) {
  const nav = useNavigate();
  const now = useStore((s) => s.sim.now);
  return (
    <div className="p-5 fade-in">
      <div className="w-12 h-12 rounded-full bg-green/15 text-green grid place-items-center">
        <CircleCheck size={26} />
      </div>
      <div className="label-caps text-lg mt-4">{job.id} booked</div>
      <div className="text-[13px] text-muted mt-1">
        {job.option.providerName} · {job.option.serviceName} · <span className="text-text">{money(job.option.price)}</span>
      </div>
      <div className="mt-4 rounded-xl border border-line divide-y divide-line text-[13px]">
        <div className="flex justify-between px-3.5 py-2.5"><span className="text-muted">Route</span><span className="text-right">{job.pickup.name} → {job.dropoff.name}</span></div>
        <div className="flex justify-between px-3.5 py-2.5"><span className="text-muted">Cargo</span><span>{job.cargo.description} · {kg(job.cargo.weightKg)}</span></div>
        <div className="flex justify-between px-3.5 py-2.5"><span className="text-muted">When</span><span>{describeTiming(job.timing, now)}</span></div>
        <div className="flex justify-between px-3.5 py-2.5"><span className="text-muted">Status</span><span className="capitalize">{job.status.replace('_', ' ')}</span></div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="primary" onClick={() => nav(`/jobs?job=${job.id}`)}>Track job</Button>
        <Button onClick={() => nav('/map')}>Live map</Button>
        <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={onNew}>New request</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page
export function RequestJob() {
  const [params, setParams] = useSearchParams();
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const resetDraft = useStore((s) => s.resetDraft);
  const bookJob = useStore((s) => s.bookJob);
  const quoteFn = useStore((s) => s.quote);
  const jobs = useStore((s) => s.jobs);
  const now = useStore((s) => s.sim.now);
  const tickKey = Math.floor(now / 120_000);
  const weatherKey = useStore((s) => `${s.weatherMode}:${s.weatherLive?.fetchedAt ?? 0}`);
  const [sel, setSel] = useState<string>();
  const [pickTarget, setPickTarget] = useState<'pickup' | 'dropoff' | null>(null);
  const [bookedId, setBookedId] = useState<string>();
  const initial = params.get('q') ?? undefined;

  const ready = !!draft.pickup && !!draft.dropoff;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => (ready ? quoteFn(draft) : []), [draft, tickKey, weatherKey, ready]);
  const selected = quotes.find((q) => q.id === sel && q.available) ?? quotes.find((q) => q.available && q.badges.includes('recommended')) ?? quotes.find((q) => q.available);
  const cmp = useMemo(() => compareWithOwnFleet(quotes), [quotes]);
  const booked = bookedId ? jobs.find((j) => j.id === bookedId) : undefined;
  const startAt = timingStart(draft.timing, now);

  const points = useMemo<FocusPoint[]>(
    () => [
      ...(draft.pickup ? [{ position: draft.pickup.position, label: draft.pickup.name, color: PICKUP_COLOR }] : []),
      ...(draft.dropoff ? [{ position: draft.dropoff.position, label: draft.dropoff.name, color: DROPOFF_COLOR }] : []),
    ],
    [draft.pickup, draft.dropoff],
  );
  const fit = useMemo<LngLat[] | undefined>(() => (points.length ? points.map((p) => p.position) : undefined), [points]);

  const onPick = (p: LngLat) => {
    if (!pickTarget) return;
    const near = LONDON_PLACES.map((x) => ({ x, d: distanceM(x.position, p) })).sort((a, b) => a.d - b.d)[0];
    setDraft({ [pickTarget]: { name: near && near.d < 1500 ? `Pin near ${near.x.name}` : 'Dropped pin', position: p } as Place });
    setPickTarget(null);
  };

  const book = (opt: QuoteOption) => {
    const job = bookJob(draft, opt);
    if (!job) return;
    setBookedId(job.id);
    resetDraft();
    setSel(undefined);
    toast.success(`${job.id} booked`, `${opt.providerName} · ${money(opt.price)}${job.timing.mode === 'recurring' ? ' per run' : ''}`);
  };

  const distKm = ready ? distanceM(draft.pickup!.position, draft.dropoff!.position) / 1000 : 0;
  const c = draft.cargo;

  return (
    <div className="h-full flex min-h-0">
      <AssistantPanel
        className="w-[360px] shrink-0 border-r border-line"
        selectedOptionId={selected?.id}
        onSelectOption={(id) => {
          setSel(id);
          setBookedId(undefined);
        }}
        onBooked={(id) => {
          setBookedId(id);
          setSel(undefined);
        }}
        initial={initial}
        onInitialSent={() => setParams({}, { replace: true })}
      />

      {/* ---- form ---- */}
      <div className="flex-1 min-w-0 overflow-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="label-caps text-[15px]">Job details</div>
            <div className="text-xs text-muted mt-0.5">Fill it in yourself, or let the assistant fill it for you — both stay in sync.</div>
          </div>
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => { resetDraft(); setSel(undefined); }}>
            Reset
          </Button>
        </div>

        <Card title="Route" sub={ready ? `${formatDistance(distKm)} straight line` : 'Where from, where to'}>
          <PlaceInput label="Pickup" color="#8bd450" value={draft.pickup} onChange={(p) => setDraft({ pickup: p })} onPick={() => setPickTarget(pickTarget === 'pickup' ? null : 'pickup')} picking={pickTarget === 'pickup'} />
          <div className="flex justify-center -my-1.5">
            <button type="button" title="Swap" onClick={() => setDraft({ pickup: draft.dropoff, dropoff: draft.pickup })} className="w-7 h-7 rounded-full border border-line bg-panel-2 grid place-items-center text-muted hover:text-text">
              <ArrowDownUp size={13} />
            </button>
          </div>
          <PlaceInput label="Drop-off" color="#a873e8" value={draft.dropoff} onChange={(p) => setDraft({ dropoff: p })} onPick={() => setPickTarget(pickTarget === 'dropoff' ? null : 'dropoff')} picking={pickTarget === 'dropoff'} />
        </Card>

        <Card title="Cargo">
          <div className="space-y-3">
            <Field label="What is it?">
              <Input value={c.description} placeholder="e.g. 6 crates of chilled produce" onChange={(e) => setDraft({ cargo: { ...c, description: e.target.value } })} className="w-full" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Total weight (kg)">
                <Input type="number" min={0.05} step={0.1} value={c.weightKg} onChange={(e) => setDraft({ cargo: { ...c, weightKg: Math.max(0.05, +e.target.value || 0.05) } })} className="w-full" />
              </Field>
              <Field label="Items">
                <Input type="number" min={1} value={c.quantity} onChange={(e) => setDraft({ cargo: { ...c, quantity: Math.max(1, Math.round(+e.target.value || 1)) } })} className="w-full" />
              </Field>
              <Field label="Value (£)">
                <Input type="number" min={0} value={c.valueGbp ?? ''} placeholder="optional" onChange={(e) => setDraft({ cargo: { ...c, valueGbp: e.target.value ? +e.target.value : undefined } })} className="w-full" />
              </Field>
            </div>
            <Field label="Size">
              <Segmented
                value={c.size}
                onChange={(size) => setDraft({ cargo: { ...c, size } })}
                options={[
                  { value: 'envelope', label: 'Envelope' },
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                  { value: 'pallet', label: 'Pallet' },
                ]}
              />
            </Field>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <Field label="Temperature">
                <Segmented
                  value={c.temperature ?? 'ambient'}
                  onChange={(temperature) => setDraft({ cargo: { ...c, temperature } })}
                  options={[
                    { value: 'ambient', label: 'Ambient' },
                    { value: 'chilled', label: 'Chilled' },
                    { value: 'frozen', label: 'Frozen' },
                  ]}
                />
              </Field>
              <div className="w-[140px] pb-1">
                <Toggle checked={!!c.fragile} onChange={(fragile) => setDraft({ cargo: { ...c, fragile } })} label="Fragile" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="When">
          <TimingEditor timing={draft.timing} now={now} onChange={(timing) => setDraft({ timing })} />
        </Card>

        <Card title="Preferences">
          <div className="space-y-3">
            <Field label="Optimise for">
              <Segmented
                value={draft.priority}
                onChange={(priority) => setDraft({ priority })}
                options={[
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'cheapest', label: 'Cheapest' },
                  { value: 'fastest', label: 'Fastest' },
                  { value: 'greenest', label: 'Greenest' },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Customer / reference">
                <Input value={draft.customer ?? ''} placeholder="e.g. Order #88231" onChange={(e) => setDraft({ customer: e.target.value || undefined })} className="w-full" />
              </Field>
              <Field label="Notes for the courier">
                <Input value={draft.notes ?? ''} placeholder="e.g. Goods-in bay 3" onChange={(e) => setDraft({ notes: e.target.value || undefined })} className="w-full" />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- options ---- */}
      <aside className="w-[410px] shrink-0 border-l border-line flex flex-col min-h-0 bg-panel">
        <div className="relative h-[220px] shrink-0 border-b border-line">
          <FleetMap variant="mini" className="absolute inset-0" focusRoute={selected?.route} focusPoints={points} fitTo={fit} pickMode={!!pickTarget} onPick={onPick} />
          {pickTarget && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-[12px] px-3 py-1.5 rounded-md bg-amber/90 text-[#1d1405] font-semibold whitespace-nowrap">
              Click the map to set the {pickTarget === 'pickup' ? 'pickup' : 'drop-off'}
            </div>
          )}
        </div>
        {booked ? (
          <BookedPanel job={booked} onNew={() => setBookedId(undefined)} />
        ) : !ready ? (
          <div className="flex-1 grid place-items-center px-6">
            <Empty icon={<MapPin size={26} className="text-dim" />} title="Add a pickup and drop-off">
              Every way to move it — Hive drones, Waymo, couriers, partner vans and your own vehicles — will be priced here side by side.
            </Empty>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto p-4 space-y-2.5">
              {cmp && <FleetCompare cmp={cmp} />}
              <div className="flex items-center justify-between pt-1">
                <span className="label-caps text-[12px] text-muted">{quotes.filter((q) => q.available).length} ways to send it</span>
                <span className="text-[11px] text-dim">{describeTiming(draft.timing, now)}</span>
              </div>
              {quotes.map((q) => (
                <OptionRow key={q.id} q={q} selected={selected?.id === q.id} onSelect={() => setSel(q.id)} startAt={startAt} />
              ))}
            </div>
            <div className="p-4 border-t border-line">
              <Button variant="success" size="lg" className="w-full" disabled={!selected} onClick={() => selected && book(selected)}>
                {selected
                  ? `${draft.timing.mode === 'recurring' ? 'Start series' : draft.timing.mode === 'scheduled' ? 'Schedule' : 'Book'} · ${selected.providerName} · ${money(selected.price)}`
                  : 'No method available'}
              </Button>
              <div className="text-[11px] text-dim mt-2 text-center">
                {selected?.simulated ? 'Simulated provider — no real booking is made until the integration is connected.' : 'Prices include all fees shown in the breakdown.'}
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
