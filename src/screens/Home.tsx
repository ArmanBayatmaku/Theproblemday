// Home: the two things Hive does — send a parcel by drone, or rent a drone with a pilot.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Camera, ChevronRight, House, PartyPopper, Sparkles, Store } from 'lucide-react';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { useNow } from '@/lib/format';
import type { RentPurpose } from '@/lib/rental';
import { Section } from '@/ui/kit';
import { DroneArt } from '@/ui/art';
import { useLayout } from '@/ui/Shell';
import { ActivityRow, itemActive, useItems } from './Activity';

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const nav = useNavigate();
  const layout = useLayout();
  const name = useApp((s) => s.name);
  const home = useApp((s) => s.home);
  const setForm = useApp((s) => s.setForm);
  const startRent = useApp((s) => s.startRent);
  const items = useItems();
  const now = useNow(1000);

  useMapScene({ fit: [home.position], fitKey: `home|${home.position.join()}`, stops: [{ id: 'home', kind: 'pickup', position: home.position, label: 'Home' }], ports: true }, [home.position.join()]);

  const active = items.filter(itemActive).slice(0, 3);
  const recent = items.filter((i) => !itemActive(i)).slice(0, 3);
  const rent = (p: RentPurpose) => {
    startRent(p);
    nav('/rent');
  };

  return (
    <div className="flex-1 pb-6">
      <div className="px-5 pt-5">
        <p className="text-[15px] text-[#6b6b6b]">
          {greeting(now)}, {name}
        </p>
        <h1 className={clsx('font-bold tracking-[-0.02em] leading-tight', layout === 'phone' ? 'text-[26px]' : 'text-[30px]')}>What do you need today?</h1>
      </div>

      <div className="px-5 mt-4 grid grid-cols-2 gap-3">
        <ServiceCard title="Send a parcel" text="By drone, across London in minutes" art={<DroneArt className="w-[84px] h-[58px]" />} onClick={() => nav('/send')} />
        <ServiceCard title="Drone rental" text="With a pilot: aerial views, events, roof checks" art={<DroneArt camera className="w-[84px] h-[58px]" />} onClick={() => nav('/rent')} />
      </div>

      {active.length > 0 && (
        <section className="mt-5">
          <h2 className="px-5 pb-1 text-[17px] font-bold tracking-tight">In progress</h2>
          {active.map((i) => (
            <ActivityRow key={i.kind === 'order' ? i.o.id : i.r.id} item={i} now={now} />
          ))}
        </section>
      )}

      <Section title="Popular" className="pt-5">
        <div className="grid grid-cols-2 gap-2">
          <Shortcut
            icon={<Store size={20} />}
            title="Collect from a shop"
            text="Drone drops it at a local shop"
            onClick={() => {
              setForm({ dropoff: 'collect' });
              nav('/send');
            }}
          />
          <Shortcut icon={<Camera size={20} />} title="Aerial photos" text="From £29" onClick={() => rent('aerial')} />
          <Shortcut icon={<PartyPopper size={20} />} title="Event filming" text="From £69 an hour" onClick={() => rent('event')} />
          <Shortcut icon={<House size={20} />} title="Roof & gutter check" text="From £59" onClick={() => rent('roof')} />
        </div>
        <button type="button" onClick={() => rent('other')} className="mt-2 w-full flex items-center gap-3 rounded-xl border border-[#e2e2e2] px-4 py-3 text-left hover:border-[#bdbdbd]">
          <Sparkles size={20} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold">Something else?</span>
            <span className="block text-[13px] text-[#6b6b6b]">Tell us what you need and get a personalised quote</span>
          </span>
          <ChevronRight size={18} className="text-[#a6a6a6]" />
        </button>
      </Section>

      <div className="px-5 pt-2">
        <button type="button" onClick={() => nav('/send')} className="w-full text-left rounded-2xl bg-[#05944f] text-white p-5 flex items-center gap-4 overflow-hidden">
          <span className="flex-1">
            <span className="block text-[19px] font-bold leading-tight">Sold something online?</span>
            <span className="block mt-1 text-[14px] text-white/85 leading-snug">Skip the post office. A drone picks it up from your door and takes it to your buyer.</span>
            <span className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-black text-[14px] font-semibold">
              Send it <ArrowRight size={15} />
            </span>
          </span>
          <DroneArt className="w-24 h-16 shrink-0" />
        </button>
      </div>

      {recent.length > 0 && (
        <section className="mt-5">
          <h2 className="px-5 pb-1 text-[17px] font-bold tracking-tight">Recent</h2>
          {recent.map((i) => (
            <ActivityRow key={i.kind === 'order' ? i.o.id : i.r.id} item={i} now={now} />
          ))}
        </section>
      )}
    </div>
  );
}

function ServiceCard({ title, text, art, onClick }: { title: string; text: string; art: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-2xl bg-[#f3f3f3] hover:bg-[#ececec] p-4 flex flex-col transition active:scale-[0.99]">
      <span className="h-[62px] flex items-center">{art}</span>
      <span className="mt-2 text-[17px] font-bold leading-tight">{title}</span>
      <span className="mt-1 text-[13px] text-[#545454] leading-snug">{text}</span>
    </button>
  );
}

function Shortcut({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-xl border border-[#e2e2e2] p-3 hover:border-[#bdbdbd] transition">
      {icon}
      <span className="block mt-2 text-[15px] font-semibold leading-tight">{title}</span>
      <span className="block mt-0.5 text-[12px] text-[#6b6b6b] leading-snug">{text}</span>
    </button>
  );
}
