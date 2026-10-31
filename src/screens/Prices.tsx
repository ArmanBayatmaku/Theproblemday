// Prices: the Relay drone (bookable) with Waymo, Uber and others alongside as estimates to compare.
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, CircleAlert, Leaf, PackageCheck, Route, Store, Wind } from 'lucide-react';
import type { LngLat } from '@shared/types';
import { useApp, useWeather } from '@/store';
import { useMapScene } from '@/map/scene';
import { collectPointsNear } from '@/lib/collect';
import { dayLabel, hhmm, mins, money } from '@/lib/format';
import { compareProviders, destination, droneVerdict, formProblem, quoteDrone, startTime, type Comparison, type DroneQuote } from '@/lib/quotes';
import { SIZES } from '@/lib/drone';
import { Badge, Btn, Note, PaymentRow, Section, StickyFooter, TopBar } from '@/ui/kit';
import { CompareArt, DroneArt } from '@/ui/art';

export function Prices() {
  const nav = useNavigate();
  const form = useApp((s) => s.form);
  const setForm = useApp((s) => s.setForm);
  const book = useApp((s) => s.book);
  const weather = useWeather();
  const [now] = useState(() => Date.now());
  const problem = formProblem(form, now);
  const q = useMemo(() => (problem ? undefined : quoteDrone(form, weather, now)), [form, weather, now, problem]);
  const others = useMemo(() => (problem ? [] : compareProviders(form, now)), [form, now, problem]);
  const target = destination(form);

  useMapScene(
    {
      fit: [form.from?.position, target?.position].filter(Boolean) as LngLat[],
      fitKey: `prices|${form.from?.position.join()}|${target?.position.join()}`,
      route: q?.plan.path,
      stops: [
        ...(form.from ? [{ id: 'from', kind: 'pickup' as const, position: form.from.position, label: form.from.name }] : []),
        ...(target ? [{ id: 'to', kind: 'dropoff' as const, position: target.position, label: target.name }] : []),
      ],
      hotZones: q?.plan.avoided.filter((a) => a.kind === 'zone').map((a) => a.id),
    },
    [q, target?.position.join()],
  );

  if (problem || !q || !form.from || !target) return <Navigate to="/send" replace />;
  const verdict = droneVerdict(q, others);
  const later = form.when.mode === 'later';

  const fix = () => {
    if (q.fix === 'collect') {
      const shop = form.to ? collectPointsNear(form.to.position)[0] : undefined;
      setForm({ dropoff: 'collect', shop });
    }
    if (q.fix === 'later') setForm({ when: { mode: 'later', at: Date.now() + 3 * 3600_000 - (Date.now() % 1_800_000) } });
    nav('/send');
  };

  return (
    <>
      <TopBar title="Your drone delivery" onBack={() => nav('/send')} />
      <div className="flex-1">
        <div className="px-5">
          <DroneCard q={q} badges={verdict.badges} line={verdict.line} later={later} start={startTime(form, now)} />
          {!q.available && q.fix && (
            <Btn variant="secondary" size="md" className="w-full mt-3" onClick={fix}>
              {q.fix === 'collect' ? 'Collect from a shop outside the zone' : q.fix === 'later' ? 'Schedule it for later' : 'Change the size'}
            </Btn>
          )}
        </div>

        <Section title="How it compares" aside={<span className="text-[12px] text-[#8f8f8f]">Estimates</span>} className="pt-6">
          <div className="divide-y divide-[#eeeeee]">
            {others.map((o) => (
              <CompareRow key={o.id} o={o} drone={q} />
            ))}
          </div>
          <p className="mt-2 text-[12px] text-[#8f8f8f] leading-snug">
            For comparison only: typical fares for the same trip. Relay books the drone; Waymo and Uber aren’t connected yet. CityHop and Thames Express are demo names.
          </p>
        </Section>

        <Section title="Your trip">
          <div className="rounded-xl border border-[#e2e2e2] divide-y divide-[#eeeeee] text-[14px]">
            <TripRow label="From" value={form.from.name} />
            <TripRow label={form.dropoff === 'collect' ? 'Collect at' : 'To'} value={form.dropoff === 'collect' ? `${target.name} · near ${form.to?.name}` : target.name} />
            <TripRow label="Size" value={`${SIZES.find((s) => s.id === form.size)?.title}${form.size === 'custom' ? ` · ${form.custom.l}×${form.custom.w}×${form.custom.h} cm, ${form.custom.kg} kg` : ''}${form.fragile ? ' · Fragile' : ''}`} />
            <TripRow label="When" value={later ? `${dayLabel(startTime(form, now))} at ${hhmm(startTime(form, now))}` : 'Now'} />
          </div>
        </Section>
      </div>

      <StickyFooter>
        <PaymentRow />
        <Btn
          className="w-full"
          disabled={!q.available}
          onClick={() => {
            const o = book(q);
            nav(`/order/${o.id}`, { replace: true });
          }}
        >
          {q.available ? `${later ? 'Schedule' : 'Book'} drone · ${money(q.price)}` : 'Drone not available'}
        </Btn>
      </StickyFooter>
    </>
  );
}

function DroneCard({ q, badges, line, later, start }: { q: DroneQuote; badges: string[]; line?: string; later: boolean; start: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={clsx('rounded-2xl border-2 p-4', q.available ? 'border-black' : 'border-[#f1b8b4] bg-[#fffafa]')}>
      <div className="flex items-center gap-3">
        <DroneArt className="w-[76px] h-[52px] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[19px] font-bold">Relay drone</span>
            {q.available && badges.map((b) => <Badge key={b} tone={b === 'Cheapest' ? 'green' : 'blue'}>{b}</Badge>)}
          </div>
          <div className="text-[14px] text-[#545454]">
            {q.available ? (
              <>
                Arrives {later ? `${hhmm(q.arriveAt)}` : `by ${hhmm(q.arriveAt)}`} · pickup in {q.pickupEtaMin} min
              </>
            ) : (
              'Not available for this trip'
            )}
          </div>
        </div>
        <div className={clsx('text-[22px] font-bold tabular-nums', !q.available && 'text-[#a6a6a6] line-through')}>{money(q.price)}</div>
      </div>

      {q.available && line && <div className="mt-3 rounded-lg bg-[#e6f4ec] text-[#05944f] text-[14px] font-semibold px-3 py-2">{line}</div>}

      <div className="mt-3 space-y-2">
        {!q.available && q.reason && (
          <Note icon={<CircleAlert size={17} />} tone="red">
            {q.reason}
          </Note>
        )}
        <Note icon={<Route size={17} />}>
          {q.plan.distanceKm.toFixed(1)} km flight · about {mins(q.durationMin)} in the air{later ? ` · leaves ${hhmm(start)}` : ''}
        </Note>
        {q.notes.map((n) => (
          <Note key={n} icon={/Fragile/.test(n) ? <PackageCheck size={17} /> : /wind|Breezy|gust/i.test(n) ? <Wind size={17} /> : /Flies around|Steers/.test(n) ? <Route size={17} /> : <Store size={17} />} tone={/no-fly/.test(n) ? 'red' : /Breezy|Fragile/.test(n) ? 'amber' : 'grey'}>
            {n}
          </Note>
        ))}
        <Note icon={<Leaf size={17} />}>
          About {q.co2g} g CO₂ — electric, no road traffic
        </Note>
      </div>

      <button type="button" onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold">
        Price details <ChevronDown size={16} className={clsx('transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 text-[14px]">
          {q.breakdown.map((l) => (
            <div key={l.label} className="flex justify-between gap-4">
              <span className="text-[#545454]">{l.label}</span>
              <span className="tabular-nums">{l.amount < 0 ? `−${money(-l.amount)}` : money(l.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-1.5 border-t border-[#eeeeee] font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(q.price)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareRow({ o, drone }: { o: Comparison; drone: DroneQuote }) {
  const diff = o.price - drone.price;
  return (
    <div className="flex items-center gap-3 py-3">
      <CompareArt id={o.id} className="w-[54px] h-[34px] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold truncate">
          {o.title} {!o.title.includes(o.provider) && <span className="text-[12px] font-normal text-[#8f8f8f]">{o.provider}</span>}
        </div>
        <div className="text-[13px] text-[#6b6b6b] truncate">{o.available ? `Arrives ${hhmm(o.arriveAt)} · ${o.tagline}` : o.reason}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={clsx('text-[15px] font-semibold tabular-nums', !o.available && 'text-[#a6a6a6]')}>{o.available ? money(o.price) : '—'}</div>
        {o.available && drone.available && Math.abs(diff) >= 0.01 && <div className={clsx('text-[12px] tabular-nums', diff > 0 ? 'text-[#05944f]' : 'text-[#6b6b6b]')}>{diff > 0 ? `drone saves ${money(diff)}` : `${money(-diff)} less`}</div>}
      </div>
    </div>
  );
}

function TripRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-3.5 py-2.5">
      <span className="w-20 shrink-0 text-[#6b6b6b]">{label}</span>
      <span className="flex-1 min-w-0 font-medium">{value}</span>
    </div>
  );
}
