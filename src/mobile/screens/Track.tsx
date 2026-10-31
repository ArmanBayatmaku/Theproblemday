import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Camera, Check, Copy, FastForward, MessageCircle, Phone, Share2, Star, X } from 'lucide-react';
import type { LngLat } from '@shared/types';
import { useApp } from '../store';
import { headline, instruction, isActive, live, stepIndex, steps } from '../orders';
import { serviceById } from '../services';
import { ModeArt, ServiceArt } from '../art';
import { MobileMap, type MapMarker } from '../MobileMap';
import { Btn, hhmm, money, RoundBtn, useNow } from '../ui';
import type { Order } from '../types';

const SKY = ['from-[#9cc9f2] to-[#e9f3fb]', 'from-[#7fb0de] to-[#d7e9f7]', 'from-[#a8d1b0] to-[#e7f2e2]', 'from-[#f2c58c] to-[#fbe9d1]', 'from-[#8fb4c9] to-[#dfeaf0]', 'from-[#b8c7d9] to-[#eef2f7]'];

function copy(text: string) {
  try {
    void navigator.clipboard?.writeText(text);
  } catch {
    /* ignore */
  }
}

function Progress({ o }: { o: Order }) {
  const idx = o.phase === 'done' ? 4 : stepIndex(o.phase);
  const labels = steps(o);
  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 gap-1.5">
        {labels.map((_, i) => (
          <div key={i} className="h-1 rounded-full bg-[#e8e8e8] overflow-hidden">
            <div className={clsx('h-full bg-black', i < idx ? 'w-full' : i === idx ? 'w-1/2 progress-pulse' : 'w-0')} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
        {labels.map((l, i) => (
          <div key={l} className={clsx('text-[11px] leading-tight', i <= idx ? 'text-black font-semibold' : 'text-[#9a9a9a]')}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Done({ o }: { o: Order }) {
  const nav = useNavigate();
  const rate = useApp((s) => s.rate);
  const startDraft = useApp((s) => s.startDraft);
  const [stars, setStars] = useState(o.rating ?? 0);
  const [tip, setTip] = useState<number | undefined>(o.tip);
  const aerial = o.service === 'aerial';
  return (
    <div className="fade-in">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-full bg-[#05944f] text-white grid place-items-center">
          <Check size={26} strokeWidth={3} />
        </span>
        <div>
          <div className="text-[22px] font-bold tracking-tight">{headline(o)}</div>
          <div className="text-[14px] text-[#5e5e5e]">
            {o.completedAt ? hhmm(o.completedAt) : ''} · {money(o.option.youPay)}
            {o.option.youPay !== o.option.price ? ' (your buyer paid)' : ''}
          </div>
        </div>
      </div>

      {aerial ? (
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {SKY.map((g, i) => (
            <div key={g} className={clsx('aspect-square rounded-lg bg-gradient-to-b relative overflow-hidden', g)}>
              <div className="absolute bottom-0 inset-x-0 h-1/3 bg-[#7c8f6a]/50" />
              <div className="absolute bottom-[30%] left-[20%] w-[35%] h-[25%] bg-white/70 rounded-sm" />
              <span className="absolute bottom-1 right-1.5 text-[10px] font-semibold text-white drop-shadow">IMG_{String(101 + i)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 h-28 rounded-xl bg-[#f3f3f3] flex items-center gap-4 px-4">
          <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[#e9e2d6] to-[#cfc3ad] grid place-items-center">
            <Camera size={22} className="text-[#6b5d45]" />
          </div>
          <div className="text-[14px] text-[#5e5e5e] leading-snug">
            <div className="font-semibold text-black">Proof of {o.service === 'ride' ? 'drop-off' : 'delivery'}</div>
            {o.service === 'ride' ? 'Trip receipt sent to your email.' : `Photo taken at ${o.form.to?.name ?? 'the drop-off'}${o.option.mode === 'drone' ? ' after the line released' : ''}.`}
          </div>
        </div>
      )}

      <div className="mt-6 text-[17px] font-bold">How did it go?</div>
      <div className="mt-2 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setStars(n)}>
            <Star size={34} className={n <= stars ? 'fill-black text-black' : 'text-[#cfcfcf]'} />
          </button>
        ))}
      </div>
      {!aerial && o.option.mode !== 'drone' && o.option.mode !== 'waymo' && o.option.mode !== 'ride_waymo' && (
        <div className="mt-4 flex gap-2">
          {[0, 1, 2, 5].map((t) => (
            <button key={t} type="button" onClick={() => setTip(t)} className={clsx('h-10 px-4 rounded-full text-[15px] font-medium', tip === t ? 'bg-black text-white' : 'bg-[#f3f3f3]')}>
              {t ? `£${t} tip` : 'No tip'}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Btn
          variant="secondary"
          onClick={() => {
            startDraft(o.service, { ...o.form });
            nav(`/new/${o.service}`);
          }}
        >
          Book again
        </Btn>
        <Btn
          onClick={() => {
            rate(o.id, stars || 5, tip);
            nav('/');
          }}
        >
          Done
        </Btn>
      </div>
    </div>
  );
}

export function Track() {
  const { id } = useParams();
  const nav = useNavigate();
  const order = useApp((s) => s.orders.find((o) => o.id === id));
  const skip = useApp((s) => s.skip);
  const cancel = useApp((s) => s.cancel);
  const approveCheck = useApp((s) => s.approveCheck);
  const now = useNow(250);
  const [copied, setCopied] = useState(false);

  if (!order) {
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div>
          <div className="text-[18px] font-semibold">We can’t find that order</div>
          <Link to="/" className="mt-3 inline-block text-[15px] font-semibold underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const o = order;
  const l = live(o, now);
  const aerial = o.service === 'aerial';
  const pick = (aerial ? o.form.to : o.form.from)?.position ?? o.approach[o.approach.length - 1];
  const drop = aerial ? undefined : o.trip[o.trip.length - 1];
  const active = isActive(o);
  const link = `hive.app/t/${o.id.toLowerCase()}`;
  const sold = o.service === 'sold';

  const fit: LngLat[] =
    o.phase === 'matching' || o.phase === 'to_pickup' ? [o.approach[0], pick, ...(drop ? [drop] : [])] : drop ? [pick, drop] : [pick];
  const markers: MapMarker[] = [
    { id: 'pick', position: pick, kind: 'pickup', label: aerial ? 'Shoot' : o.form.from?.name },
    ...(drop ? [{ id: 'drop', position: drop, kind: 'dropoff' as const, label: o.form.to?.name }] : []),
    ...(o.phase === 'matching' ? [{ id: 'pulse', position: pick, kind: 'pulse' as const }] : []),
    ...(o.phase !== 'matching' && o.phase !== 'cancelled' && o.phase !== 'done' ? [{ id: 'veh', position: l.pos, kind: 'vehicle' as const, mode: o.option.mode, heading: l.heading }] : []),
  ];
  const minutes = Math.max(1, Math.round(l.minutesLeft));
  const sub =
    o.phase === 'matching'
      ? `Matching you with the nearest ${o.option.title.toLowerCase()}`
      : o.phase === 'to_pickup'
        ? `${aerial ? 'Arrives' : o.service === 'collect' ? 'At the seller' : o.service === 'errand' ? 'At the pickup' : 'With you'} by ${hhmm(now + Math.max(0, l.minutesLeft) * 60_000)}`
        : o.phase === 'to_dropoff'
          ? aerial
            ? `${minutes} min of flying left`
            : `Arrives ${hhmm(now + Math.max(0, l.minutesLeft) * 60_000)} at ${o.form.to?.name ?? 'the drop-off'}`
          : o.phase === 'at_pickup'
            ? 'Just a moment'
            : '';

  return (
    <div className="h-full relative bg-[#f2f2f0]">
      <div className="absolute inset-x-0 top-0 h-[52%]">
        <MobileMap fit={fit} approach={o.phase === 'to_pickup' || o.phase === 'matching' ? o.approach : undefined} route={!aerial && o.phase !== 'done' && o.phase !== 'cancelled' ? o.trip : undefined} markers={markers} padding={{ top: 80, bottom: 50, left: 60, right: 60 }} />
      </div>
      <RoundBtn label="Home" onClick={() => nav('/')} className="absolute top-3 left-4 z-10">
        <ArrowLeft size={22} />
      </RoundBtn>
      {active && (
        <RoundBtn
          label="Share"
          onClick={() => {
            copy(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          className="absolute top-3 right-4 z-10"
        >
          <Share2 size={20} />
        </RoundBtn>
      )}
      {copied && <div className="absolute top-16 right-4 z-10 bg-black text-white text-[13px] font-medium px-3 py-1.5 rounded-lg fade-in">Tracking link copied</div>}

      <div className="absolute inset-x-0 bottom-0 max-h-[58%] min-h-[50%] bg-white rounded-t-[22px] shadow-[0_-6px_24px_rgba(0,0,0,0.12)] flex flex-col z-20">
        <div className="pt-2 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-[#d6d6d6]" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6 no-scrollbar">
          {o.phase === 'done' ? (
            <Done o={o} />
          ) : o.phase === 'cancelled' ? (
            <div>
              <div className="text-[22px] font-bold">{o.checkApproved === false ? 'Not collected' : 'Cancelled'}</div>
              <div className="text-[15px] text-[#5e5e5e] mt-1">{o.checkApproved === false ? 'You said it wasn’t right, so we left it with the seller. You haven’t been charged.' : 'You haven’t been charged.'}</div>
              <Btn
                className="w-full mt-5"
                onClick={() => {
                  useApp.getState().startDraft(o.service, { ...o.form });
                  nav(`/new/${o.service}`);
                }}
              >
                Book again
              </Btn>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[21px] font-bold leading-tight tracking-tight">{headline(o)}</div>
                  {sub && <div className="text-[14px] text-[#5e5e5e] mt-1">{sub}</div>}
                </div>
                {(o.phase === 'to_pickup' || o.phase === 'to_dropoff') && (
                  <div className="shrink-0 rounded-xl bg-black text-white px-3 py-1.5 text-center">
                    <div className="text-[20px] font-bold leading-none tabular-nums">{minutes}</div>
                    <div className="text-[11px] font-medium text-white/80">min</div>
                  </div>
                )}
              </div>
              <Progress o={o} />

              {o.phase === 'check' && (
                <div className="mt-5 rounded-2xl border-2 border-black p-4 fade-in">
                  <div className="text-[16px] font-bold">Is this the right item?</div>
                  <div className="text-[14px] text-[#5e5e5e]">
                    {o.option.mode === 'drone' ? 'The drone' : o.option.mode === 'waymo' ? 'The Waymo' : o.vehicle.person?.split(' ')[0] ?? 'Your courier'} is at {o.form.sellerName ? `${o.form.sellerName}’s` : 'the seller’s'} door. These photos are from just now.
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[0, 1].map((i) => (
                      <div key={i} className="aspect-[4/3] rounded-xl bg-gradient-to-br from-[#ece6dc] to-[#d6cbb8] grid place-items-center">
                        <ServiceArt id="collect" className="w-12 h-12 opacity-80" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Btn variant="secondary" size="md" onClick={() => approveCheck(o.id, false)}>
                      Not right
                    </Btn>
                    <Btn size="md" onClick={() => approveCheck(o.id, true)}>
                      Looks right
                    </Btn>
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                <div className="w-[72px] shrink-0">
                  <ModeArt mode={o.option.mode} className="w-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold truncate">{o.vehicle.person ?? o.vehicle.name}</div>
                  <div className="text-[14px] text-[#5e5e5e] truncate">{o.vehicle.person ? `${o.vehicle.name} · ${o.vehicle.detail}` : o.vehicle.detail}</div>
                  {o.vehicle.rating && (
                    <div className="text-[13px] flex items-center gap-1">
                      <Star size={12} className="fill-black" /> {o.vehicle.rating.toFixed(2)}
                    </div>
                  )}
                </div>
                {!aerial && (
                  <div className="text-center shrink-0 rounded-xl bg-[#f3f3f3] px-3 py-1.5">
                    <div className="text-[11px] text-[#6b6b6b] font-medium">{o.option.mode === 'waymo' || o.option.mode === 'ride_waymo' ? 'Code' : 'PIN'}</div>
                    <div className="text-[18px] font-bold tracking-[0.12em] tabular-nums">{o.code}</div>
                  </div>
                )}
              </div>

              {instruction(o) && <div className="mt-4 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px] leading-snug">{instruction(o)}</div>}

              {sold && (
                <div className="mt-4 rounded-xl border border-[#e6e6e6] px-4 py-3">
                  <div className="text-[14px] font-semibold">{o.form.buyerName ? `${o.form.buyerName}’s tracking link` : 'Your buyer’s tracking link'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex-1 text-[14px] text-[#276ef1] truncate">{link}</span>
                    <button type="button" onClick={() => copy(link)} className="h-8 px-3 rounded-full bg-[#f3f3f3] text-[13px] font-semibold inline-flex items-center gap-1">
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                  {o.form.buyerPays && <div className="text-[13px] text-[#05944f] font-semibold mt-1">{o.phase === 'matching' ? 'Waiting for your buyer to pay…' : `Buyer paid ${money(o.option.price)}`}</div>}
                </div>
              )}

              <div className="mt-5 grid grid-cols-4 gap-2">
                {[
                  { icon: MessageCircle, label: 'Message', on: () => undefined },
                  { icon: Phone, label: 'Call', on: () => undefined },
                  { icon: Share2, label: 'Share', on: () => copy(link) },
                  ...(o.phase === 'matching' || o.phase === 'to_pickup' ? [{ icon: X, label: 'Cancel', on: () => cancel(o.id) }] : []),
                ].map((a) => (
                  <button key={a.label} type="button" onClick={a.on} className="flex flex-col items-center gap-1 text-[12px] font-medium">
                    <span className="w-12 h-12 rounded-full bg-[#f3f3f3] grid place-items-center">
                      <a.icon size={20} />
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#5e5e5e]">{serviceById(o.service).title}</span>
                  <span className="font-semibold">{o.option.youPay === 0 ? 'Buyer pays' : money(o.option.youPay)}</span>
                </div>
                {!aerial && (
                  <div className="text-[#5e5e5e] mt-0.5 truncate">
                    {o.form.from?.name} → {o.form.to?.name}
                  </div>
                )}
                <div className="text-[#5e5e5e] mt-0.5">
                  {o.option.provider} · order {o.id}
                </div>
              </div>

              <button type="button" onClick={() => skip(o.id)} className="mt-4 mx-auto flex items-center gap-1.5 text-[12px] text-[#8f8f8f]">
                <FastForward size={13} /> Demo: skip ahead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
