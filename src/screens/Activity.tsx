import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { dayLabel, hhmm, money, useNow } from '@/lib/format';
import { isActive, isCollect, live } from '@/lib/orders';
import { liveRental, rentalActive, rentalTitle, type Rental } from '@/lib/rental';
import type { Order } from '@/lib/types';
import { Btn } from '@/ui/kit';
import { DroneArt } from '@/ui/art';

export type Item = { kind: 'order'; o: Order; at: number } | { kind: 'rental'; r: Rental; at: number };

type Status = { text: string; tone: 'live' | 'done' | 'muted' };

function orderStatus(o: Order, now: number): Status {
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

function rentalStatus(r: Rental, now: number): Status {
  const m = Math.max(1, Math.ceil(liveRental(r, now)?.minutesLeft ?? 0));
  switch (r.phase) {
    case 'quote':
      return { text: 'Getting your quote', tone: 'live' };
    case 'quoted':
      return { text: 'Quote ready: tap to accept', tone: 'live' };
    case 'scheduled':
      return { text: `Booked · ${dayLabel(r.startAt)} ${hhmm(r.startAt)}`, tone: 'live' };
    case 'matching':
      return { text: 'Finding your pilot', tone: 'live' };
    case 'travelling':
      return { text: `Pilot arriving in ${m} min`, tone: 'live' };
    case 'setup':
      return { text: 'Pilot is setting up', tone: 'live' };
    case 'flying':
      return { text: `Flying · ${m} min left`, tone: 'live' };
    case 'done':
      return { text: `Done · ${dayLabel(r.completedAt ?? r.createdAt)} ${hhmm(r.completedAt ?? r.createdAt)}`, tone: 'done' };
    default:
      return { text: 'Cancelled', tone: 'muted' };
  }
}

export const itemActive = (i: Item) => (i.kind === 'order' ? isActive(i.o) || (isCollect(i.o) && i.o.phase === 'done' && !i.o.collectedAt) : rentalActive(i.r));

export function useItems(): Item[] {
  const orders = useApp((s) => s.orders);
  const rentals = useApp((s) => s.rentals);
  return [...orders.map((o) => ({ kind: 'order' as const, o, at: o.createdAt })), ...rentals.map((r) => ({ kind: 'rental' as const, r, at: r.createdAt }))].sort((a, b) => b.at - a.at);
}

export function ActivityRow({ item, now }: { item: Item; now: number }) {
  const isOrder = item.kind === 'order';
  const s = isOrder ? orderStatus(item.o, now) : rentalStatus(item.r, now);
  const title = isOrder ? `To ${isCollect(item.o) ? item.o.form.shop?.name : item.o.form.to?.name}` : rentalTitle(item.r);
  const price = isOrder ? item.o.price : item.r.price;
  const cancelled = (isOrder ? item.o.phase : item.r.phase) === 'cancelled';
  return (
    <Link to={isOrder ? `/order/${item.o.id}` : `/rental/${item.r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa]">
      <span className="w-14 h-14 rounded-xl bg-[#f3f3f3] grid place-items-center shrink-0">
        <DroneArt camera={!isOrder} className="w-11 h-8" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-semibold truncate">{title}</span>
        <span className={clsx('block text-[13px] truncate', s.tone === 'live' ? 'text-[#276ef1] font-medium' : 'text-[#6b6b6b]')}>{s.text}</span>
      </span>
      <span className="text-right shrink-0">
        <span className={clsx('block text-[15px] font-semibold tabular-nums', cancelled && 'line-through text-[#a6a6a6]')}>{price !== undefined ? money(price) : 'Quote'}</span>
        <ChevronRight size={18} className="ml-auto text-[#a6a6a6]" />
      </span>
    </Link>
  );
}

export function Activity() {
  const nav = useNavigate();
  const items = useItems();
  const now = useNow(1000);
  useMapScene({ ports: true, fitKey: 'activity' }, []);
  const upcoming = items.filter(itemActive);
  const past = items.filter((i) => !itemActive(i));

  return (
    <div className="flex-1 pb-6">
      <div className="px-5 pt-5 pb-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Activity</h1>
      </div>
      {!items.length && (
        <div className="px-5 py-10 text-center">
          <DroneArt className="w-28 h-20 mx-auto" />
          <p className="mt-3 text-[17px] font-semibold">Nothing here yet</p>
          <p className="mt-1 text-[14px] text-[#6b6b6b]">Your deliveries and drone rentals will show up here.</p>
          <Btn size="md" className="mt-5" onClick={() => nav('/')}>
            Get started
          </Btn>
        </div>
      )}
      {upcoming.length > 0 && <List title="Now and upcoming" items={upcoming} now={now} />}
      {past.length > 0 && <List title="Past" items={past} now={now} />}
    </div>
  );
}

function List({ title, items, now }: { title: string; items: Item[]; now: number }) {
  return (
    <section className="mt-3">
      <h2 className="px-5 pb-1 text-[15px] font-bold text-[#545454]">{title}</h2>
      {items.map((i) => (
        <ActivityRow key={i.kind === 'order' ? i.o.id : i.r.id} item={i} now={now} />
      ))}
    </section>
  );
}
