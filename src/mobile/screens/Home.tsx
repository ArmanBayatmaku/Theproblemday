import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Clock, Search } from 'lucide-react';
import { useApp } from '../store';
import { SERVICES } from '../services';
import { ServiceArt, ModeArt, HiveMark, DroneArt } from '../art';
import { MobileMap, type MapMarker } from '../MobileMap';
import { nearbyVehicles } from '../quotes';
import { headline, isActive, live } from '../orders';
import { useNow } from '../ui';
import type { ServiceId } from '../types';
import { distanceM } from '@shared/geo';

const IDEAS: { service: ServiceId; title: string; sub: string; prefill?: Record<string, unknown> }[] = [
  { service: 'sold', title: 'Selling on Vinted or eBay?', sub: 'We collect from your door' },
  { service: 'errand', title: 'Left your keys at work?', sub: 'We’ll bring them home' },
  { service: 'collect', title: 'Bought a bike secondhand?', sub: 'We pick it up from the seller' },
  { service: 'move', title: 'Moving a sofa?', sub: 'A van and two helpers' },
  { service: 'aerial', title: 'Selling your home?', sub: 'Aerial photos in an afternoon' },
];

function Greeting({ name }: { name: string }) {
  const h = new Date().getHours();
  return (
    <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
      {h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, {name}
    </h1>
  );
}

function ActiveBanner() {
  const now = useNow(1000);
  const order = useApp((s) => s.orders.find(isActive));
  const nav = useNavigate();
  if (!order) return null;
  const l = live(order, now);
  return (
    <button type="button" onClick={() => nav(`/order/${order.id}`)} className="mx-5 mt-5 w-[calc(100%-40px)] flex items-center gap-3 rounded-2xl bg-black text-white px-4 py-3.5 text-left fade-in">
      <div className="w-14 h-10 shrink-0 bg-white/10 rounded-lg grid place-items-center">
        <ModeArt mode={order.option.mode} className="w-12" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold truncate">{headline(order)}</div>
        <div className="text-[13px] text-white/70">{order.phase === 'matching' ? 'Just a moment' : `${Math.max(1, Math.round(l.minutesLeft))} min · ${order.option.title}`}</div>
      </div>
      <ChevronRight size={20} className="text-white/70" />
    </button>
  );
}

function AroundYou() {
  const home = useApp((s) => s.home);
  const nav = useNavigate();
  const near = useMemo(() => {
    const vs = nearbyVehicles().filter((a) => distanceM(a.position, home.position) < 3500);
    return vs.slice(0, 18);
  }, [home]);
  const markers: MapMarker[] = [
    ...near.map((a) => ({
      id: a.id,
      position: a.position,
      kind: 'nearby' as const,
      heading: a.heading,
      mode: (a.kind === 'drone' ? 'nearby_drone' : a.kind === 'robotaxi' ? 'nearby_waymo' : a.kind === 'cargo_bike' ? 'nearby_bike' : a.kind === 'van' ? 'nearby_van' : 'nearby_car') as MapMarker['mode'],
    })),
    { id: 'me', position: home.position, kind: 'pickup', label: 'You' },
  ];
  const count = (k: string) => near.filter((a) => a.kind === k).length;
  return (
    <section className="px-5 mt-8">
      <h2 className="text-[20px] font-bold tracking-tight">Around you</h2>
      <button type="button" onClick={() => nav('/search')} className="mt-3 relative block w-full h-44 rounded-2xl overflow-hidden bg-[#eee]">
        <MobileMap center={home.position} zoom={13.6} markers={markers} interactive={false} />
      </button>
      <div className="mt-2 text-[14px] text-[#6b6b6b]">
        {count('drone')} drones · {count('robotaxi')} Waymos · {count('car') + count('van')} couriers · {count('cargo_bike')} cargo bikes near {home.address ?? 'you'}
      </div>
    </section>
  );
}

export function Home() {
  const nav = useNavigate();
  const name = useApp((s) => s.name);
  const later = useApp((s) => s.later);
  const setLater = useApp((s) => s.setLater);
  const startDraft = useApp((s) => s.startDraft);
  const start = (id: ServiceId) => {
    startDraft(id);
    nav(`/new/${id}`);
  };

  return (
    <div className="h-full overflow-y-auto pb-28 no-scrollbar">
      <header className="px-5 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <HiveMark className="w-7 h-7" />
          <span className="text-[22px] font-extrabold tracking-[-0.03em]">Hive</span>
        </div>
        <Link to="/account" aria-label="Account" className="w-9 h-9 rounded-full bg-[#eeeeee] grid place-items-center text-[15px] font-bold">
          {name.slice(0, 1)}
        </Link>
      </header>

      <div className="px-5 mt-5">
        <Greeting name={name} />
      </div>

      <div className="px-5 mt-4">
        <div className="flex items-center h-14 rounded-full bg-[#f3f3f3] pl-5 pr-2 gap-3">
          <button type="button" onClick={() => nav('/search')} className="flex-1 flex items-center gap-3 text-left min-w-0">
            <Search size={22} strokeWidth={2.4} />
            <span className="text-[17px] font-semibold text-[#5e5e5e] truncate">What do you need?</span>
          </button>
          <button type="button" onClick={() => setLater(!later)} className="h-10 px-3 rounded-full bg-white flex items-center gap-1.5 text-[14px] font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)] shrink-0">
            <Clock size={16} /> {later ? 'Later' : 'Now'} <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <ActiveBanner />

      <section className="px-5 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold tracking-tight">Suggestions</h2>
          <Link to="/services" className="text-[14px] font-semibold">
            See all
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-x-2.5 gap-y-4">
          {SERVICES.map((s) => (
            <button key={s.id} type="button" onClick={() => start(s.id)} className="flex flex-col items-center gap-1.5 active:scale-95 transition">
              <span className="relative w-full aspect-[1.08] rounded-xl bg-[#f3f3f3] grid place-items-center">
                <ServiceArt id={s.id} className="w-[62%] h-[62%]" />
                {s.badge && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 h-[18px] rounded-full bg-[#05944f] text-white text-[10px] font-bold grid place-items-center">{s.badge}</span>}
              </span>
              <span className="text-[12.5px] font-medium leading-tight text-center">{s.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 mt-8">
        <button type="button" onClick={() => start('sold')} className="w-full rounded-2xl bg-[#05944f] text-white p-5 flex items-center gap-3 text-left overflow-hidden relative">
          <div className="flex-1 min-w-0 relative z-10">
            <div className="text-[20px] font-bold leading-snug tracking-tight">Sold something online?</div>
            <div className="text-[14px] text-white/85 mt-1 leading-snug">Skip the post office. We collect from your door and take it straight to your buyer.</div>
            <div className="inline-flex items-center gap-1 mt-3 h-9 px-4 rounded-full bg-white text-black text-[14px] font-semibold">
              Send it <ChevronRight size={16} />
            </div>
          </div>
          <DroneArt className="w-28 shrink-0 -mr-2 drop-shadow-lg" />
        </button>
      </section>

      <AroundYou />

      <section className="mt-8">
        <h2 className="px-5 text-[20px] font-bold tracking-tight">Ways to use Hive</h2>
        <div className="mt-3 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar snap-x">
          {IDEAS.map((i) => (
            <button key={i.title} type="button" onClick={() => start(i.service)} className="snap-start shrink-0 w-[200px] text-left">
              <div className="h-[110px] rounded-xl bg-[#f3f3f3] grid place-items-center">
                <ServiceArt id={i.service} className="h-16 w-20" />
              </div>
              <div className="mt-2 text-[15px] font-semibold leading-snug">{i.title}</div>
              <div className="text-[13px] text-[#6b6b6b]">{i.sub}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="px-5 mt-8 text-[12px] text-[#8f8f8f] leading-relaxed">Hackathon preview. Waymo, Uber and partner prices are simulated, and nothing is really booked.</div>
    </div>
  );
}
