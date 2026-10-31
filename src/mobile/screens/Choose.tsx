import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, ChevronDown, ChevronRight, Info, Leaf, Smartphone, User } from 'lucide-react';
import type { LngLat } from '@shared/types';
import { useApp, currentWeather } from '../store';
import { quoteForm } from '../quotes';
import { ModeArt } from '../art';
import { MobileMap, type MapMarker } from '../MobileMap';
import { Badge, badgeTone, Btn, hhmm, money, RoundBtn } from '../ui';
import type { Option } from '../types';

function arrival(o: Option, startAt: number, service: string) {
  if (service === 'aerial') return `Pilot there by ${hhmm(startAt + o.etaPickupMin * 60_000)}`;
  const eta = hhmm(startAt + (o.etaPickupMin + o.durationMin) * 60_000);
  return service === 'ride' ? `${eta} drop-off · ${o.etaPickupMin} min away` : `${eta} drop-off · pickup in ${o.etaPickupMin} min`;
}

export function Choose() {
  const { service = 'send' } = useParams();
  const nav = useNavigate();
  const draft = useApp((s) => s.draft);
  const weather = useApp((s) => s.weather);
  const payment = useApp((s) => s.payment);
  const setPayment = useApp((s) => s.setPayment);
  const book = useApp((s) => s.book);
  const [sel, setSel] = useState<string>();
  const [details, setDetails] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => (draft ? quoteForm(draft, currentWeather()) : []), [draft, weather]);
  if (!draft || draft.service !== service) return <Navigate to={`/new/${service}`} replace />;

  const avail = options.filter((o) => o.available);
  const selected = options.find((o) => o.id === sel && o.available) ?? avail[0];
  const startAt = draft.when.mode === 'later' ? draft.when.at : Date.now();
  const pick = draft.service === 'aerial' ? draft.to : draft.from;
  const drop = draft.service === 'aerial' ? undefined : draft.to;
  const fit = [pick?.position, drop?.position].filter(Boolean) as LngLat[];
  const markers: MapMarker[] = [
    ...(pick ? [{ id: 'pick', position: pick.position, kind: 'pickup' as const, label: draft.service === 'aerial' ? 'Shoot here' : pick.name }] : []),
    ...(drop ? [{ id: 'drop', position: drop.position, kind: 'dropoff' as const, label: drop.name }] : []),
  ];
  const buyerPays = draft.service === 'sold' && draft.buyerPays;
  const title = draft.service === 'ride' ? 'Choose a ride' : draft.service === 'aerial' ? 'Choose your shoot' : draft.service === 'move' ? 'Choose your van' : 'Choose how it goes';

  return (
    <div className="h-full relative bg-[#f2f2f0]">
      <div className="absolute inset-x-0 top-0 h-[42%]">
        <MobileMap fit={fit} route={selected?.route && selected.route.length > 1 ? selected.route : undefined} markers={markers} padding={{ top: 70, bottom: 40, left: 60, right: 60 }} />
      </div>
      <RoundBtn label="Back" onClick={() => nav(-1)} className="absolute top-3 left-4 z-10">
        <ArrowLeft size={22} />
      </RoundBtn>

      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-white rounded-t-[22px] shadow-[0_-6px_24px_rgba(0,0,0,0.12)] flex flex-col z-20 slide-up">
        <div className="pt-2 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-[#d6d6d6]" />
        </div>
        <div className="px-5 pt-2 pb-1 text-center text-[16px] font-semibold">{title}</div>

        <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2 no-scrollbar">
          {!avail.length && (
            <div className="mx-2 my-3 rounded-xl bg-[#fff3df] px-4 py-3 text-[14px] text-[#7a4a00] leading-snug">Nothing can take this right now. Try a smaller size, fewer helpers or a later time.</div>
          )}
          {options.map((o) => {
            const on = selected?.id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => o.available && setSel(o.id)}
                className={clsx('w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left border-2 transition', on ? 'border-black' : 'border-transparent', !o.available && 'opacity-45')}
              >
                <div className="w-[76px] shrink-0">
                  <ModeArt mode={o.mode} className="w-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[17px] font-bold leading-tight">{o.title}</span>
                    {o.mode.startsWith('ride') && (
                      <span className="inline-flex items-center text-[13px] font-medium">
                        <User size={13} />
                        {o.mode === 'ride_xl' ? 6 : 4}
                      </span>
                    )}
                    {o.available && o.badges[0] && <Badge tone={badgeTone(o.badges[0]) as never}>{o.badges[0]}</Badge>}
                  </div>
                  <div className="text-[14px] leading-snug mt-0.5">{o.available ? arrival(o, startAt, draft.service) : <span className="text-[#5e5e5e]">{o.reason}</span>}</div>
                  {on && <div className="text-[13px] text-[#6b6b6b] leading-snug mt-0.5">{o.tagline}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[17px] font-bold">{buyerPays && o.available ? money(o.price) : money(o.youPay)}</div>
                  {buyerPays && o.available && <div className="text-[12px] font-semibold text-[#05944f]">Buyer pays</div>}
                  {o.available && o.co2g < 60 && !buyerPays && (
                    <div className="text-[11px] text-[#0e8345] inline-flex items-center gap-0.5">
                      <Leaf size={11} /> Low CO₂
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {selected && (
            <div className="px-3 pt-2">
              <button type="button" onClick={() => setDetails(!details)} className="flex items-center gap-1.5 text-[14px] font-semibold">
                <Info size={15} /> Price details <ChevronDown size={15} className={clsx('transition', details && 'rotate-180')} />
              </button>
              {details && (
                <div className="mt-2 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px] fade-in">
                  {selected.breakdown.map((l) => (
                    <div key={l.label} className="flex justify-between py-0.5">
                      <span className="text-[#5e5e5e]">{l.label}</span>
                      <span className="tabular-nums">{money(l.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 mt-1.5 border-t border-[#e6e6e6] font-semibold">
                    <span>Total</span>
                    <span>{money(selected.price)}</span>
                  </div>
                  {selected.notes.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[13px] text-[#6b6b6b]">
                      {selected.notes.slice(0, 4).map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                    </ul>
                  )}
                  {selected.simulated && <div className="mt-2 text-[12px] text-[#8f8f8f]">Simulated price for this preview. No real booking is made.</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[#eeeeee] px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => !buyerPays && setPayment(payment === 'visa' ? 'apple' : 'visa')} className="w-full flex items-center gap-3 pb-3 text-left">
            {buyerPays ? (
              <>
                <Smartphone size={20} />
                <span className="flex-1 text-[15px] font-semibold">Buyer pays · we’ll text them a link</span>
              </>
            ) : payment === 'visa' ? (
              <>
                <span className="w-8 h-5 rounded-[4px] bg-[#1a1f71] text-white text-[9px] font-extrabold italic grid place-items-center">VISA</span>
                <span className="flex-1 text-[15px] font-semibold">Visa •••• 4242</span>
              </>
            ) : (
              <>
                <span className="w-8 h-5 rounded-[4px] bg-black text-white text-[10px] font-semibold grid place-items-center">Pay</span>
                <span className="flex-1 text-[15px] font-semibold">Apple Pay</span>
              </>
            )}
            {!buyerPays && <ChevronRight size={18} className="text-[#8f8f8f]" />}
          </button>
          <Btn
            className="w-full"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const o = book(selected);
              if (o) nav(`/order/${o.id}`, { replace: true });
            }}
          >
            {selected ? (draft.when.mode === 'later' ? `Schedule ${selected.title}` : `Choose ${selected.title}`) : 'Nothing available'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
