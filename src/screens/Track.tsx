// Live tracking: the drone flies from its port to you, picks up, and flies around no-fly zones to the drop-off.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Clock3, FastForward, Footprints, Gauge, Hand, LifeBuoy, MapPin, Mountain, Route, Share2, Star, Store, Wind, X } from 'lucide-react';
import type { LngLat } from '@shared/types';
import { droneFlyability } from '@shared/weather';
import { useApp, useWeather } from '@/store';
import { useMapScene } from '@/map/scene';
import { hoursText, openingHours } from '@/lib/collect';
import { DRONE, portShort } from '@/lib/drone';
import { compass, dayLabel, hhmm, mph, money, useNow } from '@/lib/format';
import { STEPS, isActive, isCollect, live, remaining, stepIndex } from '@/lib/orders';
import { shortZone } from '@/lib/quotes';
import type { Order } from '@/lib/types';
import { Btn, Note, TopBar } from '@/ui/kit';
import { DroneArt } from '@/ui/art';

function headline(o: Order, minutesLeft: number): { title: string; sub: string } {
  const shop = o.form.shop;
  const to = isCollect(o) && shop ? shop.name : o.form.to?.name ?? 'the drop-off';
  const m = Math.max(1, Math.ceil(minutesLeft));
  switch (o.phase) {
    case 'scheduled':
      return { title: 'Scheduled', sub: `The drone leaves ${portShort(o.portName)} ${dayLabel(o.startAt).toLowerCase()} at ${hhmm(o.startAt)}` };
    case 'matching':
      return { title: 'Finding your drone…', sub: `Checking the route and weather at ${o.portName}` };
    case 'to_pickup':
      return { title: 'Your drone is on its way', sub: `Arrives in ${m} min · take the parcel outside` };
    case 'at_pickup':
      return { title: 'Your drone is here', sub: 'Clip the parcel onto the hook' };
    case 'to_dropoff':
      return { title: `Flying to ${to}`, sub: `${m} min to go` };
    case 'done':
      if (isCollect(o)) return o.collectedAt ? { title: 'Collected', sub: `From ${to} at ${hhmm(o.collectedAt)}` } : { title: 'Ready to collect', sub: `At ${to} · held for 3 days` };
      return { title: 'Delivered', sub: `At ${hhmm(o.completedAt ?? Date.now())} · ${o.form.to?.name}` };
    default:
      return { title: 'Cancelled', sub: 'You haven’t been charged' };
  }
}

function instruction(o: Order): string | undefined {
  switch (o.phase) {
    case 'scheduled':
    case 'matching':
    case 'to_pickup':
      return 'Put it in a bag or box and take it outside. Find a clear spot of about 2 × 2 m. The drone hovers above and lowers a hook. It doesn’t land.';
    case 'at_pickup':
      return 'Clip the bag onto the hook and step back. It’s winched up and the drone heads off.';
    case 'to_dropoff':
      return isCollect(o)
        ? `${o.form.shop?.name} takes it from the drone. We’ll text you when it’s ready to collect.`
        : 'We’ve texted the recipient a tracking link. The parcel is lowered to the doorstep on a line.';
    default:
      return undefined;
  }
}

export function Track() {
  const { id } = useParams();
  const nav = useNavigate();
  const order = useApp((s) => s.orders.find((o) => o.id === id));
  const skip = useApp((s) => s.skip);
  const cancel = useApp((s) => s.cancel);
  const markCollected = useApp((s) => s.markCollected);
  const rate = useApp((s) => s.rate);
  const weather = useWeather();
  const now = useNow(250);
  const [copied, setCopied] = useState(false);

  const l = order ? live(order, now) : undefined;
  const flying = order && (order.phase === 'to_pickup' || order.phase === 'to_dropoff' || order.phase === 'at_pickup');
  const pickup = order?.trip[0];
  const end = order?.trip[order.trip.length - 1];
  const hot = order?.avoided.filter((a) => a.kind === 'zone').map((a) => a.id);
  const leg = order?.phase === 'to_dropoff' || order?.phase === 'done' ? 'trip' : 'approach';

  useMapScene(
    order && l && pickup && end
      ? {
          fit:
            leg === 'approach'
              ? ([order.approach[0], pickup, end].map((p) => [p[0], p[1]]) as LngLat[])
              : order.phase === 'done'
                ? [[end[0], end[1]]]
                : (order.trip.map((p) => [p[0], p[1]]) as LngLat[]),
          fitKey: `${order.id}|${leg}|${order.phase === 'done'}`,
          route: order.phase === 'to_dropoff' ? remaining(order, l) : order.phase === 'done' ? undefined : order.trip,
          approach: order.phase === 'to_pickup' ? remaining(order, l) : order.phase === 'matching' || order.phase === 'scheduled' ? order.approach : undefined,
          drone: order.phase !== 'cancelled' ? { pos: l.pos, heading: l.heading } : undefined,
          stops: [
            { id: 'from', kind: 'pickup', position: [pickup[0], pickup[1]], label: order.form.from?.name },
            { id: 'to', kind: 'dropoff', position: [end[0], end[1]], label: isCollect(order) ? order.form.shop?.name : order.form.to?.name },
          ],
          hotZones: hot,
        }
      : {},
    [order?.id, order?.phase, Math.round(now / 250)],
  );

  if (!order || !l) return <Navigate to="/activity" replace />;
  const h = headline(order, l.minutesLeft);
  const step = stepIndex(order.phase);
  const steps = STEPS(order);
  const ins = instruction(order);
  const fly = droneFlyability(weather, order.form.fragile ? DRONE.fragileLimits : DRONE.limits);
  const zones = order.avoided.filter((a) => a.kind === 'zone');
  const share = () => {
    void navigator.clipboard?.writeText(`https://relay.example/t/${order.id.toLowerCase()}`).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <TopBar title={`Order ${order.id}`} onBack={() => nav('/activity')} />
      <div className="flex-1 pb-4">
        <div className="px-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-[24px] font-bold tracking-[-0.01em] leading-tight">{h.title}</h1>
              <p className="mt-0.5 text-[15px] text-[#545454]">{h.sub}</p>
            </div>
            {(order.phase === 'to_pickup' || order.phase === 'to_dropoff') && (
              <div className="shrink-0 rounded-xl bg-black text-white px-3 py-2 text-center leading-none">
                <div className="text-[20px] font-bold tabular-nums">{Math.max(1, Math.ceil(l.minutesLeft))}</div>
                <div className="text-[11px] mt-1">min</div>
              </div>
            )}
          </div>

          {order.phase !== 'cancelled' && (
            <div className="mt-4">
              <div className="grid grid-cols-4 gap-1.5">
                {steps.map((s, i) => (
                  <div key={s} className={clsx('h-1 rounded-full', i < step || order.phase === 'done' ? 'bg-black' : i === step ? 'bg-black progress-pulse' : 'bg-[#e2e2e2]')} />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11px]">
                {steps.map((s, i) => (
                  <span key={s} className={i <= step ? 'text-black font-semibold' : 'text-[#8f8f8f]'}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ins && <div className="mt-4 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px] leading-snug">{ins}</div>}
        </div>

        {isCollect(order) && order.phase === 'done' && order.form.shop && (
          <div className="mx-5 mt-4 rounded-2xl border-2 border-black p-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-black text-white grid place-items-center">
                <Store size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-[16px] font-bold truncate">{order.form.shop.name}</div>
                <div className="text-[13px] text-[#6b6b6b]">
                  {order.form.shop.kind} · {hoursText(order.form.shop, now)}
                </div>
              </div>
            </div>
            <div className="mt-4 text-[12px] font-semibold text-[#6b6b6b] uppercase tracking-wide">Collection code</div>
            <div className="text-[34px] font-bold tracking-[0.18em] tabular-nums">{order.collectCode}</div>
            <div className="mt-2 space-y-1.5">
              <Note icon={<Footprints size={16} />}>
                {order.form.shop.walkMin} min walk from {order.form.to?.name} · open {openingHours(order.form.shop)}
              </Note>
              <Note icon={<Clock3 size={16} />}>Held until {dayLabel((order.completedAt ?? now) + 3 * 86400_000)}</Note>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.form.shop.position[1]},${order.form.shop.position[0]}&travelmode=walking`}
                target="_blank"
                rel="noreferrer"
                className="h-11 rounded-xl bg-[#eeeeee] text-[15px] font-semibold inline-flex items-center justify-center gap-2"
              >
                <MapPin size={17} /> Directions
              </a>
              <Btn size="md" disabled={!!order.collectedAt} onClick={() => markCollected(order.id)}>
                {order.collectedAt ? (
                  <>
                    <Check size={17} /> Collected
                  </>
                ) : (
                  'I’ve collected it'
                )}
              </Btn>
            </div>
          </div>
        )}

        {order.phase === 'done' && !isCollect(order) && (
          <div className="mx-5 mt-4 rounded-2xl bg-[#f6f6f6] p-4">
            <div className="text-[13px] font-semibold text-[#6b6b6b]">Proof of delivery</div>
            <div className="mt-2 h-28 rounded-xl bg-gradient-to-br from-[#e9e4dc] to-[#d9d2c6] grid place-items-center relative overflow-hidden">
              <DroneArt className="w-24 h-16 opacity-90" />
              <span className="absolute bottom-2 left-2 text-[11px] font-semibold bg-white/85 rounded px-1.5 py-0.5">Photo from the drone · {hhmm(order.completedAt ?? now)}</span>
            </div>
          </div>
        )}

        {order.phase === 'done' && (
          <div className="mx-5 mt-4 flex items-center justify-between">
            <span className="text-[15px] font-semibold">How was it?</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} stars`} onClick={() => rate(order.id, n)}>
                  <Star size={26} className={n <= (order.rating ?? 0) ? 'fill-black text-black' : 'text-[#c4c4c4]'} />
                </button>
              ))}
            </span>
          </div>
        )}

        <div className="mx-5 mt-4 rounded-2xl border border-[#e2e2e2] p-4">
          <div className="flex items-center gap-3">
            <DroneArt className="w-16 h-11 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold">
                {DRONE.model} · {order.drone.id}
              </div>
              <div className="text-[13px] text-[#6b6b6b]">Remote pilot {order.drone.pilot} · from {portShort(order.portName)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-[#6b6b6b]">PIN</div>
              <div className="text-[18px] font-bold tracking-[0.12em] tabular-nums">{order.pin}</div>
            </div>
          </div>
          {flying && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat icon={<Mountain size={15} />} label="Height" value={`${Math.round(l.pos[2])} m`} />
              <Stat icon={<Gauge size={15} />} label="Speed" value={order.phase === 'at_pickup' ? 'Hover' : `${order.form.fragile ? DRONE.fragileCruiseKmh : DRONE.cruiseKmh} km/h`} />
              <Stat icon={<Wind size={15} />} label="Wind" value={`${mph(weather.windMs120)} mph ${compass(weather.windDirDeg)}`} warn={fly.status !== 'go'} />
            </div>
          )}
          <div className="mt-3 space-y-2">
            <Note icon={<Route size={16} />}>
              {order.distanceKm.toFixed(1)} km flight from {order.form.from?.name} to {isCollect(order) ? order.form.shop?.name : order.form.to?.name}
            </Note>
            {zones.length > 0 && (
              <Note icon={<Route size={16} />} tone="red">
                Goes around {zones.map((z) => shortZone(z.name)).join(' and ')} (no-fly, demo){order.detourKm >= 0.05 ? ` · +${order.detourKm.toFixed(1)} km` : ''}
              </Note>
            )}
            {order.form.fragile && <Note icon={<Hand size={16} />} tone="amber">Fragile: flying slower and gently</Note>}
          </div>
        </div>

        <div className="mx-5 mt-4 grid grid-cols-3 gap-2">
          <Action icon={copied ? <Check size={20} /> : <Share2 size={20} />} label={copied ? 'Link copied' : 'Share link'} onClick={share} />
          <Action icon={<LifeBuoy size={20} />} label="Help" onClick={() => undefined} />
          <Action icon={<X size={20} />} label="Cancel" disabled={!['scheduled', 'matching', 'to_pickup'].includes(order.phase)} onClick={() => cancel(order.id)} />
        </div>

        <div className="mx-5 mt-4 flex items-center justify-between text-[13px] text-[#6b6b6b]">
          <span>
            {money(order.price)} · {order.form.dropoff === 'collect' ? 'Collect' : 'Door'} delivery
          </span>
          {isActive(order) && (
            <button type="button" onClick={() => skip(order.id)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#f3f3f3] text-black font-semibold">
              <FastForward size={15} /> Demo: skip ahead
            </button>
          )}
        </div>
        {isActive(order) && <p className="mx-5 mt-2 text-[12px] text-[#8f8f8f]">Demo time runs about 24× faster than real time.</p>}
      </div>
    </>
  );
}

function Stat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[#f6f6f6] py-2">
      <div className="flex items-center justify-center gap-1 text-[11px] text-[#6b6b6b]">
        {icon} {label}
      </div>
      <div className={clsx('text-[14px] font-semibold tabular-nums', warn && 'text-[#9a5b00]')}>{value}</div>
    </div>
  );
}

function Action({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-[70px] rounded-xl bg-[#f6f6f6] flex flex-col items-center justify-center gap-1 text-[12px] font-semibold disabled:opacity-35 active:scale-[0.98]">
      {icon}
      {label}
    </button>
  );
}
