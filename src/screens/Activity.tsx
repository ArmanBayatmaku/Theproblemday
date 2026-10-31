import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { dayLabel, hhmm, money, useNow } from '@/lib/format';
import { isActive, isCollect, live } from '@/lib/orders';
import type { Order } from '@/lib/types';
import { Btn } from '@/ui/kit';
import { DroneArt } from '@/ui/art';

function status(o: Order, now: number): { text: string; tone: 'live' | 'done' | 'muted' } {
  const m = Math.max(1, Math.ceil(live(o, now).minutesLeft));
  switch (o.phase) {
    case 'scheduled':
      return { text: `Scheduled · ${dayLabel(o.startAt)} ${hhmm(o.startAt)}`, tone: 'live' };
    case 'matching':
      return { text: 'Finding a drone', tone: 'live' };
    case 'to_pickup':
      return { text: `Drone arriving in ${m} min`, tone: 'live' };
    case 'at_pickup':
      return { text: 'Picking up now', tone: 'live' };
    case 'to_dropoff':
      return { text: `Flying · ${m} min to go`, tone: 'live' };
    case 'done':
      if (isCollect(o)) return { text: o.collectedAt ? 'Collected' : 'Ready to collect', tone: o.collectedAt ? 'done' : 'live' };
      return { text: `Delivered · ${dayLabel(o.completedAt ?? o.createdAt)} ${hhmm(o.completedAt ?? o.createdAt)}`, tone: 'done' };
    default:
      return { text: 'Cancelled', tone: 'muted' };
  }
}

export function Activity() {
  const nav = useNavigate();
  const orders = useApp((s) => s.orders);
  const now = useNow(1000);
  useMapScene({ ports: true, fitKey: 'activity' }, []);
  const upcoming = orders.filter((o) => isActive(o) || (isCollect(o) && o.phase === 'done' && !o.collectedAt));
  const past = orders.filter((o) => !upcoming.includes(o));

  return (
    <div className="flex-1 pb-6">
      <div className="px-5 pt-5 pb-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Activity</h1>
      </div>
      {!orders.length && (
        <div className="px-5 py-10 text-center">
          <DroneArt className="w-28 h-20 mx-auto" />
          <p className="mt-3 text-[17px] font-semibold">No deliveries yet</p>
          <p className="mt-1 text-[14px] text-[#6b6b6b]">Your drone deliveries will show up here.</p>
          <Btn size="md" className="mt-5" onClick={() => nav('/')}>
            Send something
          </Btn>
        </div>
      )}
      {upcoming.length > 0 && <List title="Now and upcoming" orders={upcoming} now={now} />}
      {past.length > 0 && <List title="Past" orders={past} now={now} />}
    </div>
  );
}

function List({ title, orders, now }: { title: string; orders: Order[]; now: number }) {
  return (
    <section className="mt-3">
      <h2 className="px-5 pb-1 text-[15px] font-bold text-[#545454]">{title}</h2>
      {orders.map((o) => {
        const s = status(o, now);
        const to = isCollect(o) ? o.form.shop?.name : o.form.to?.name;
        return (
          <Link key={o.id} to={`/order/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa]">
            <span className="w-14 h-14 rounded-xl bg-[#f3f3f3] grid place-items-center shrink-0">
              <DroneArt className="w-11 h-8" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-semibold truncate">To {to}</span>
              <span className={clsx('block text-[13px] truncate', s.tone === 'live' ? 'text-[#276ef1] font-medium' : 'text-[#6b6b6b]')}>{s.text}</span>
            </span>
            <span className="text-right shrink-0">
              <span className={clsx('block text-[15px] font-semibold tabular-nums', o.phase === 'cancelled' && 'line-through text-[#a6a6a6]')}>{money(o.price)}</span>
              <ChevronRight size={18} className="ml-auto text-[#a6a6a6]" />
            </span>
          </Link>
        );
      })}
    </section>
  );
}
