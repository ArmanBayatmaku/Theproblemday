// The ordering page: where from, where to, door or collect, size (with a fit check), fragile, when.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Check, ChevronRight, DoorOpen, Mail, Package, Ruler, Store, X } from 'lucide-react';
import type { LngLat, Place } from '@shared/types';
import { planDroneRoute } from '@shared/routing';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { collectPointsNear, hoursText, isOpen, type CollectPoint } from '@/lib/collect';
import { DRONE, SIZES, checkFit, type Fit, type SizeId } from '@/lib/drone';
import { dayLabel, hhmm, useNow } from '@/lib/format';
import { customDims, destination, formProblem, startTime } from '@/lib/quotes';
import type { OrderForm } from '@/lib/types';
import { Btn, Chip, Section, Segmented, StickyFooter, Switch } from '@/ui/kit';
import { PlacePicker } from '@/ui/PlacePicker';
import { useLayout } from '@/ui/Shell';

export function Send() {
  const nav = useNavigate();
  const layout = useLayout();
  const form = useApp((s) => s.form);
  const setForm = useApp((s) => s.setForm);
  const name = useApp((s) => s.name);
  const remember = useApp((s) => s.remember);
  const now = useNow(30_000);
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);

  const toKey = form.to?.position.join();
  const shops = useMemo(() => (form.to ? collectPointsNear(form.to.position) : []), [toKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = startTime(form, now);

  // Collect: keep a valid, open shop selected near the current address.
  useEffect(() => {
    if (form.dropoff !== 'collect' || !shops.length) return;
    if (form.shop && shops.some((s) => s.id === form.shop!.id)) return;
    setForm({ shop: shops.find((s) => isOpen(s, start + 30 * 60_000)) ?? shops[0] });
  }, [form.dropoff, shops]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = destination(form);
  const plan = useMemo(
    () => (form.from && target ? planDroneRoute(form.from.position, target.position, DEMO_ZONES, LANDMARKS) : undefined),
    [form.from?.position.join(), target?.position.join()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const problem = formProblem(form, now);
  const collect = form.dropoff === 'collect';

  useMapScene(
    {
      fit: [form.from?.position, form.to?.position, ...(collect ? shops.map((s) => s.position) : [])].filter(Boolean) as LngLat[],
      fitKey: `send|${form.from?.position.join()}|${toKey}|${form.dropoff}`,
      route: plan?.path,
      stops: [
        ...(form.from ? [{ id: 'from', kind: 'pickup' as const, position: form.from.position, label: form.from.name }] : []),
        ...(form.to ? [{ id: 'to', kind: 'dropoff' as const, position: form.to.position, label: form.to.name }] : []),
      ],
      shops: collect ? shops : undefined,
      selectedShopId: form.shop?.id,
      onShop: (c) => setForm({ shop: c }),
      hotZones: plan?.avoided.filter((a) => a.kind === 'zone').map((a) => a.id),
      ports: !form.to,
    },
    [form.from?.position.join(), toKey, form.dropoff, form.shop?.id, plan],
  );

  const pick = (p: Place) => {
    if (picker === 'from') setForm({ from: p });
    else setForm({ to: p, shop: undefined });
    remember(p);
    setPicker(null);
  };

  return (
    <>
      <div className="flex-1">
        <div className="px-5 pt-5">
          {layout === 'phone' && <p className="text-[15px] text-[#6b6b6b]">Hi {name}</p>}
          <h1 className={clsx('font-bold tracking-[-0.02em] leading-tight', layout === 'phone' ? 'text-[26px]' : 'text-[32px]')}>Send it by drone</h1>
          <p className="mt-1 text-[15px] text-[#545454]">Across London in minutes. No post office, no queue.</p>
        </div>

        <RouteCard from={form.from} to={form.to} onFrom={() => setPicker('from')} onTo={() => setPicker('to')} />

        <Section title="How should it arrive?">
          <Segmented
            value={form.dropoff}
            onChange={(v) => setForm({ dropoff: v })}
            options={[
              { value: 'door', label: <><DoorOpen size={17} /> To the door</> },
              { value: 'collect', label: <><Store size={17} /> Collect</> },
            ]}
          />
          {collect ? (
            <CollectList form={form} shops={shops} start={start} onPick={(c) => setForm({ shop: c })} />
          ) : (
            <p className="mt-2.5 text-[13px] text-[#6b6b6b] leading-snug">The drone hovers and lowers it on a line to the doorstep, garden or yard.</p>
          )}
        </Section>

        <Section title="How big is it?">
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <SizeCard key={s.id} id={s.id} title={s.title} hint={s.hint} on={form.size === s.id} onClick={() => setForm({ size: s.id })} />
            ))}
          </div>
          {form.size === 'custom' && <CustomSize form={form} onChange={(custom) => setForm({ custom })} />}
        </Section>

        <Section>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[17px] font-bold">Fragile</div>
              <div className="text-[14px] text-[#545454]">Glass, ceramics, electronics</div>
            </div>
            <Switch checked={form.fragile} onChange={(v) => setForm({ fragile: v })} label="Fragile" />
          </div>
          <p className={clsx('mt-2 text-[13px] leading-snug', form.fragile ? 'text-[#9a5b00]' : 'text-[#6b6b6b]')}>
            Deliveries might take longer with this on: the drone flies slower and won’t take off in gusty weather, to reduce the risk of damage.
          </p>
        </Section>

        <Section title="When">
          <div className="flex gap-2">
            <Chip active={form.when.mode === 'now'} onClick={() => setForm({ when: { mode: 'now' } })}>
              Now
            </Chip>
            <Chip active={form.when.mode === 'later'} onClick={() => form.when.mode !== 'later' && setForm({ when: { mode: 'later', at: firstSlot(Date.now()) } })}>
              Schedule
            </Chip>
          </div>
          {form.when.mode === 'later' && <WhenPicker at={form.when.at} onChange={(at) => setForm({ when: { mode: 'later', at } })} />}
        </Section>
      </div>

      <StickyFooter>
        {problem && form.to && <p className="mb-2 text-center text-[13px] font-medium text-[#6b6b6b]">{problem}</p>}
        <Btn className="w-full" disabled={!!problem} onClick={() => nav('/prices')}>
          See prices
        </Btn>
      </StickyFooter>

      {picker && <PlacePicker title={picker === 'from' ? 'Pick up from' : 'Deliver to'} onPick={pick} onClose={() => setPicker(null)} />}
    </>
  );
}

function StopRow({ label, place, square, onClick, placeholder }: { label: string; place?: Place; square?: boolean; onClick: () => void; placeholder: string }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[#fafafa]">
      <span className={clsx('w-3 h-3 shrink-0 bg-black', square ? 'rounded-[2px]' : 'rounded-full')} />
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-medium text-[#6b6b6b]">{label}</span>
        <span className={clsx('block text-[16px] truncate', place ? 'font-semibold' : 'text-[#8f8f8f]')}>{place ? place.name : placeholder}</span>
        {place?.address && place.address !== place.name && place.address !== 'London' && <span className="block text-[13px] text-[#6b6b6b] truncate">{place.address}</span>}
      </span>
      <ChevronRight size={18} className="text-[#a6a6a6]" />
    </button>
  );
}

function RouteCard({ from, to, onFrom, onTo }: { from?: Place; to?: Place; onFrom: () => void; onTo: () => void }) {
  return (
    <div className="relative mx-5 mt-5 rounded-2xl border border-[#e2e2e2] overflow-hidden">
      <StopRow label="Pick up from" place={from} onClick={onFrom} placeholder="Add a pickup" />
      <div className="h-px bg-[#eeeeee] ml-11" />
      <StopRow label="Deliver to" place={to} square onClick={onTo} placeholder="Where to?" />
      <span className="absolute left-[21.5px] top-[39px] bottom-[39px] w-px bg-black/70 pointer-events-none" />
    </div>
  );
}

function CollectList({ form, shops, start, onPick }: { form: OrderForm; shops: CollectPoint[]; start: number; onPick: (c: CollectPoint) => void }) {
  if (!form.to) return <p className="mt-2.5 text-[13px] text-[#6b6b6b]">Add where it’s going and we’ll show shops nearby that can take it from the drone.</p>;
  if (!shops.length) return <p className="mt-2.5 text-[13px] text-[#6b6b6b]">No partner shops near {form.to.name} yet. Choose door delivery instead.</p>;
  return (
    <div className="mt-3">
      <p className="text-[13px] text-[#545454] leading-snug">
        A shop near <b className="font-semibold text-black">{form.to.name}</b> takes it from the drone and keeps it for 3 days. Pick it up when it suits you with a code. <b className="font-semibold text-black">£1 cheaper.</b>
      </p>
      <div className="mt-3 space-y-2">
        {shops.map((c) => {
          const open = isOpen(c, start + 30 * 60_000);
          const on = form.shop?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!open}
              onClick={() => onPick(c)}
              className={clsx('w-full text-left rounded-xl border p-3 flex items-center gap-3 transition', on ? 'border-black ring-1 ring-black' : 'border-[#e2e2e2] hover:border-[#bdbdbd]', !open && 'opacity-45')}
            >
              <span className={clsx('w-10 h-10 rounded-full grid place-items-center shrink-0', on ? 'bg-black text-white' : 'bg-[#f3f3f3]')}>
                <Store size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold truncate">{c.name}</span>
                <span className="block text-[13px] text-[#6b6b6b] truncate">
                  {c.kind} · {c.walkMin} min walk · {hoursText(c, start)}
                </span>
              </span>
              <span className={clsx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', on ? 'border-black bg-black' : 'border-[#c4c4c4]')}>{on && <span className="w-2 h-2 rounded-full bg-white" />}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-[#8f8f8f]">Demo partner shops. Tap a shop on the map to pick it.</p>
    </div>
  );
}

const SIZE_ICON: Record<SizeId, typeof Mail> = { pocket: Mail, shoebox: Package, custom: Ruler };

function SizeCard({ id, title, hint, on, onClick }: { id: SizeId; title: string; hint: string; on: boolean; onClick: () => void }) {
  const Icon = SIZE_ICON[id];
  return (
    <button type="button" onClick={onClick} className={clsx('text-left rounded-xl border p-3 transition', on ? 'border-black ring-1 ring-black' : 'border-[#e2e2e2] hover:border-[#bdbdbd]')}>
      <Icon size={22} strokeWidth={1.8} />
      <div className="mt-2 text-[15px] font-semibold leading-tight">{title}</div>
      <div className="mt-0.5 text-[12px] text-[#6b6b6b] leading-snug">{hint}</div>
    </button>
  );
}

function CustomSize({ form, onChange }: { form: OrderForm; onChange: (c: OrderForm['custom']) => void }) {
  const fit = checkFit(customDims(form));
  const field = (key: keyof OrderForm['custom'], label: string, unit: string) => (
    <label className="block">
      <span className="block text-[12px] font-medium text-[#545454] mb-1">{label}</span>
      <span className="flex items-center h-11 rounded-lg bg-white border border-[#e2e2e2] focus-within:border-black focus-within:ring-1 focus-within:ring-black px-2.5">
        <input
          inputMode="decimal"
          value={form.custom[key]}
          onChange={(e) => onChange({ ...form.custom, [key]: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) })}
          placeholder="0"
          aria-label={`${label} in ${unit}`}
          className="w-full min-w-0 bg-transparent outline-none text-[16px] font-semibold tabular-nums"
        />
        <span className="text-[13px] text-[#8f8f8f] ml-1">{unit}</span>
      </span>
    </label>
  );
  return (
    <div className="mt-3 rounded-2xl bg-[#f6f6f6] p-4">
      <div className="grid grid-cols-4 gap-2">
        {field('l', 'Length', 'cm')}
        {field('w', 'Width', 'cm')}
        {field('h', 'Height', 'cm')}
        {field('kg', 'Weight', 'kg')}
      </div>
      <FitCheck fit={fit} kg={customDims(form).kg} />
    </div>
  );
}

/** Each side against the drone's payload bay, turned whichever way fits best. */
function FitCheck({ fit, kg }: { fit: Fit; kg: number }) {
  const rows: { label: string; v: number; max: number; unit: string }[] = [
    { label: 'Longest side', v: fit.item[0], max: fit.bay[0], unit: 'cm' },
    { label: 'Middle side', v: fit.item[1], max: fit.bay[1], unit: 'cm' },
    { label: 'Shortest side', v: fit.item[2], max: fit.bay[2], unit: 'cm' },
    { label: 'Weight', v: Number.isFinite(kg) ? kg : 0, max: DRONE.maxKg, unit: 'kg' },
  ];
  return (
    <div className="mt-4">
      <div className="space-y-2">
        {rows.map((r) => {
          const over = r.v > r.max;
          return (
            <div key={r.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[12px]">
              <span className="text-[#545454]">{r.label}</span>
              <span className="h-2 rounded-full bg-[#e2e2e2] overflow-hidden">
                <span className={clsx('block h-full rounded-full transition-all', over ? 'bg-[#d93025]' : 'bg-black')} style={{ width: `${Math.min(100, (r.v / r.max) * 100)}%` }} />
              </span>
              <span className={clsx('tabular-nums font-medium', over && 'text-[#d93025]')}>
                {r.v || '–'} / {r.max} {r.unit}
              </span>
            </div>
          );
        })}
      </div>
      {fit.incomplete ? (
        <p className="mt-3 text-[13px] text-[#6b6b6b]">
          The drone’s bay is {DRONE.bay.l} × {DRONE.bay.w} × {DRONE.bay.h} cm and carries up to {DRONE.maxKg} kg. Enter the outside size of your parcel to check.
        </p>
      ) : fit.fits ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#e6f4ec] text-[#05944f] px-3 py-2.5 text-[14px] font-semibold">
          <Check size={18} strokeWidth={2.6} /> It fits in the drone
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-[#fdecea] text-[#c5221f] px-3 py-2.5 text-[14px]">
          <div className="flex items-center gap-2 font-semibold">
            <X size={18} strokeWidth={2.6} /> Too big for the drone
          </div>
          <ul className="mt-1 ml-[26px] list-disc text-[13px]">
            {fit.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Next half-hour slot at least 45 minutes away. */
function firstSlot(now: number) {
  const t = new Date(now + 45 * 60_000);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() <= 30 ? 30 : 60);
  return t.getTime();
}

function WhenPicker({ at, onChange }: { at: number; onChange: (t: number) => void }) {
  const now = Date.now();
  const days = [0, 1, 2].map((d) => {
    const x = new Date(now + d * 86400_000);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  });
  const dayOf = (t: number) => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const day = dayOf(at);
  const slots: number[] = [];
  for (let h = 7; h <= 21; h += 0.5) {
    const t = day + h * 3600_000;
    if (t >= firstSlot(now)) slots.push(t);
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2">
        {days.map((d) => (
          <Chip
            key={d}
            active={d === day}
            onClick={() => {
              const keep = new Date(at);
              const n = new Date(d);
              n.setHours(keep.getHours(), keep.getMinutes());
              onChange(Math.max(n.getTime(), firstSlot(now)));
            }}
          >
            {dayLabel(d)}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {slots.map((t) => (
          <Chip key={t} active={Math.abs(t - at) < 60_000} onClick={() => onChange(t)} className="tabular-nums">
            {hhmm(t)}
          </Chip>
        ))}
        {!slots.length && <span className="text-[14px] text-[#6b6b6b] py-2">No more slots today — pick another day.</span>}
      </div>
    </div>
  );
}
