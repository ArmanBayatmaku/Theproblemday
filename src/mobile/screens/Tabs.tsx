import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Briefcase, ChevronRight, CircleHelp, CreditCard, ExternalLink, House, Plane, RotateCcw, Star, Truck, Wallet } from 'lucide-react';
import type { Place } from '@shared/types';
import { useApp } from '../store';
import { SERVICES, serviceById } from '../services';
import { isActive } from '../orders';
import { ModeArt, ServiceArt } from '../art';
import { PlacePicker } from '../PlacePicker';
import { Btn, Chip, dayLabel, hhmm, money } from '../ui';
import type { ServiceId } from '../types';

// ---------------------------------------------------------------- Services
export function Services() {
  const nav = useNavigate();
  const startDraft = useApp((s) => s.startDraft);
  const start = (id: ServiceId) => {
    startDraft(id);
    nav(`/new/${id}`);
  };
  return (
    <div className="h-full overflow-y-auto pb-28 no-scrollbar">
      <div className="px-5 pt-6">
        <h1 className="text-[32px] font-bold tracking-[-0.02em]">Services</h1>
        <p className="text-[15px] text-[#5e5e5e] mt-1">Drones, Waymo, couriers, cargo bikes and vans. We pick the right one for you.</p>
      </div>
      <div className="mt-4">
        {SERVICES.map((s) => (
          <button key={s.id} type="button" onClick={() => start(s.id)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-[#f6f6f6]">
            <span className="w-16 h-16 rounded-2xl bg-[#f3f3f3] grid place-items-center shrink-0">
              <ServiceArt id={s.id} className="w-10 h-10" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-[17px] font-bold">{s.title}</span>
                {s.badge && <span className="px-1.5 h-[18px] rounded-full bg-[#05944f] text-white text-[10px] font-bold grid place-items-center">{s.badge}</span>}
              </span>
              <span className="block text-[14px] text-[#5e5e5e] leading-snug mt-0.5">{s.blurb}</span>
            </span>
            <ChevronRight size={20} className="text-[#a6a6a6] shrink-0" />
          </button>
        ))}
      </div>
      <div className="px-5 mt-6">
        <div className="text-[13px] font-semibold text-[#6b6b6b] mb-2">Coming soon</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { t: 'Store it', s: 'Keep things in a Hive locker and get them back in an hour' },
            { t: 'Lend it', s: 'Send a drill to a neighbour and get it back tomorrow' },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl bg-[#f6f6f6] p-4">
              <div className="text-[15px] font-bold">{c.t}</div>
              <div className="text-[13px] text-[#6b6b6b] mt-1 leading-snug">{c.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Activity
const statusText = (phase: string) =>
  ({ matching: 'Finding a courier', to_pickup: 'On the way', at_pickup: 'Picking up', check: 'Needs your OK', to_dropoff: 'In progress', done: 'Completed', cancelled: 'Cancelled' })[phase] ?? phase;

export function Activity() {
  const nav = useNavigate();
  const orders = useApp((s) => s.orders);
  const clear = useApp((s) => s.clearHistory);
  const [tab, setTab] = useState<'upcoming' | 'past'>(orders.some(isActive) ? 'upcoming' : 'past');
  const list = orders.filter((o) => (tab === 'upcoming' ? isActive(o) : !isActive(o)));
  return (
    <div className="h-full overflow-y-auto pb-28 no-scrollbar">
      <div className="px-5 pt-6 flex items-end justify-between">
        <h1 className="text-[32px] font-bold tracking-[-0.02em]">Activity</h1>
        {tab === 'past' && list.length > 0 && (
          <button type="button" onClick={clear} className="text-[14px] font-semibold text-[#5e5e5e] mb-2">
            Clear
          </button>
        )}
      </div>
      <div className="px-5 mt-3 flex gap-2">
        <Chip active={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
          Upcoming
        </Chip>
        <Chip active={tab === 'past'} onClick={() => setTab('past')}>
          Past
        </Chip>
      </div>
      {list.length === 0 ? (
        <div className="px-8 pt-16 text-center">
          <div className="mx-auto w-24 h-24 rounded-3xl bg-[#f3f3f3] grid place-items-center">
            <ServiceArt id="send" className="w-14 h-14" />
          </div>
          <div className="text-[18px] font-bold mt-4">{tab === 'upcoming' ? 'Nothing on the way' : 'No past orders yet'}</div>
          <div className="text-[15px] text-[#5e5e5e] mt-1">Send, sell or move something and it’ll show up here.</div>
          <Btn className="mt-5" size="md" onClick={() => nav('/')}>
            Get started
          </Btn>
        </div>
      ) : (
        <div className="mt-3">
          {list.map((o) => (
            <button key={o.id} type="button" onClick={() => nav(`/order/${o.id}`)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-[#f6f6f6]">
              <span className="w-16 h-12 rounded-xl bg-[#f3f3f3] grid place-items-center shrink-0">
                <ModeArt mode={o.option.mode} className="w-12" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-semibold truncate">
                  {serviceById(o.service).title} · {o.service === 'collect' || o.service === 'errand' ? `from ${o.form.from?.name ?? 'pickup'}` : `to ${o.form.to?.name ?? 'drop-off'}`}
                </span>
                <span className="block text-[14px] text-[#5e5e5e]">
                  {dayLabel(o.createdAt)} {hhmm(o.createdAt)} · <span className={clsx(o.phase === 'check' && 'text-[#c13515] font-semibold')}>{statusText(o.phase)}</span>
                </span>
              </span>
              <span className="text-[15px] font-semibold shrink-0">{o.option.youPay === 0 ? 'Buyer' : money(o.option.youPay)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Account
export function Account() {
  const s = useApp();
  const [editing, setEditing] = useState<'home' | 'work' | null>(null);
  const done = s.orders.filter((o) => o.phase === 'done').length;
  const Row = ({ icon, title, sub, right, onClick }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-[#f6f6f6]">
      <span className="w-10 h-10 rounded-full bg-[#f3f3f3] grid place-items-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-medium">{title}</span>
        {sub && <span className="block text-[14px] text-[#6b6b6b] truncate">{sub}</span>}
      </span>
      {right ?? <ChevronRight size={18} className="text-[#a6a6a6]" />}
    </button>
  );
  return (
    <div className="h-full overflow-y-auto pb-28 no-scrollbar relative">
      <div className="px-5 pt-6 flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-[-0.02em]">{s.name}</h1>
          <div className="mt-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#f3f3f3] text-[13px] font-semibold">
            <Star size={13} className="fill-black" /> 4.97 · {done} order{done === 1 ? '' : 's'}
          </div>
        </div>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#d9d9d9] to-[#bdbdbd] grid place-items-center text-[26px] font-bold text-white">{s.name.slice(0, 1)}</div>
      </div>

      <div className="px-5 mt-5 grid grid-cols-3 gap-2">
        {[
          { icon: CircleHelp, label: 'Help' },
          { icon: Wallet, label: 'Wallet' },
          { icon: Truck, label: 'Activity' },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl bg-[#f3f3f3] py-3.5 flex flex-col items-center gap-1.5 text-[14px] font-semibold">
            <t.icon size={22} /> {t.label}
          </div>
        ))}
      </div>

      <div className="mx-5 mt-4 rounded-2xl bg-black text-white p-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[16px] font-bold">Hive Pass</div>
          <div className="text-[13px] text-white/75 leading-snug">Free drone deliveries under 2 km and 10% off vans. £4.99 a month (demo).</div>
        </div>
        <span className="h-9 px-3.5 rounded-full bg-white text-black text-[14px] font-semibold grid place-items-center">Try</span>
      </div>

      <div className="mt-6 px-5 text-[13px] font-semibold text-[#6b6b6b]">Saved places</div>
      <Row icon={<House size={18} />} title="Home" sub={s.home.address} onClick={() => setEditing('home')} />
      <Row icon={<Briefcase size={18} />} title="Work" sub={s.work.address} onClick={() => setEditing('work')} />

      <div className="mt-5 px-5 text-[13px] font-semibold text-[#6b6b6b]">Payment</div>
      <Row icon={<CreditCard size={18} />} title="Visa •••• 4242" right={<span className={clsx('w-5 h-5 rounded-full border-2', s.payment === 'visa' ? 'border-[6px] border-black' : 'border-[#cfcfcf]')} />} onClick={() => s.setPayment('visa')} />
      <Row icon={<span className="text-[11px] font-bold">Pay</span>} title="Apple Pay" right={<span className={clsx('w-5 h-5 rounded-full border-2', s.payment === 'apple' ? 'border-[6px] border-black' : 'border-[#cfcfcf]')} />} onClick={() => s.setPayment('apple')} />

      <div className="mt-5 px-5 text-[13px] font-semibold text-[#6b6b6b]">Earn with Hive</div>
      <Row icon={<Plane size={18} />} title="List your drone or robot" sub="Earn when it’s idle. We find the jobs." />
      <Row icon={<Truck size={18} />} title="Deliver with Hive" sub="Car, bike or van. Choose your hours." />

      <div className="mt-5 px-5 text-[13px] font-semibold text-[#6b6b6b]">Hive for business</div>
      <a href="/" className="w-full flex items-center gap-4 px-5 py-3.5 active:bg-[#f6f6f6]">
        <span className="w-10 h-10 rounded-full bg-[#f3f3f3] grid place-items-center">
          <ExternalLink size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-[16px] font-medium">Open the operations dashboard</span>
          <span className="block text-[14px] text-[#6b6b6b]">Run a fleet of drones, robots and vans</span>
        </span>
      </a>
      <Row icon={<RotateCcw size={18} />} title="Clear past orders" sub="Resets this demo’s history" onClick={s.clearHistory} right={<span />} />

      {editing && (
        <PlacePicker
          title={editing === 'home' ? 'Set home' : 'Set work'}
          onClose={() => setEditing(null)}
          onPick={(p: Place) => {
            s.setPlace(editing, { ...p, address: p.address ?? p.name });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
