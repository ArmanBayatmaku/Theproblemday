// Simulated drone deliveries: dispatch from a Relay port, pick up, fly around no-fly zones, drop off.
import type { Pos3 } from '@shared/types';
import { bearingDeg, cumulative, positionAlong } from '@shared/geo';
import { collectCode } from './collect';
import { rng } from './format';
import { startTime, type DroneQuote } from './quotes';
import type { Order, OrderForm, Phase } from './types';

/** Demo speed: one simulated minute passes in 2.5 real seconds. */
export const SIM_MS_PER_MIN = 2500;
const MATCHING_MS = 2500;
const HANDOVER_MS = 5000;
/** The drone hovers this high while the parcel is winched up or down. */
const HOVER_M = 12;

const PILOTS = ['Lewis', 'Maya', 'Femi', 'Hannah', 'Arjun', 'Zoe'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createOrder(form: OrderForm, q: DroneQuote, now: number): Order {
  const id = `HV${Math.floor(1000 + Math.random() * 9000)}`;
  const r = rng(id);
  const approach = q.approach.path.map((p) => [...p] as Pos3);
  const trip = q.plan.path.map((p) => [...p] as Pos3);
  approach[approach.length - 1][2] = HOVER_M;
  trip[0][2] = HOVER_M;
  // Shops have a pad or drop box, so the drone lands; at a door it hovers and lowers the parcel.
  trip[trip.length - 1][2] = form.dropoff === 'collect' ? 0 : HOVER_M;
  return {
    id,
    createdAt: now,
    startAt: startTime(form, now),
    form: { ...form },
    price: q.price,
    breakdown: q.breakdown,
    notes: q.notes,
    avoided: q.plan.avoided,
    detourKm: q.plan.detourKm,
    distanceKm: q.plan.distanceKm,
    portName: q.port.name,
    approach,
    trip,
    approachMin: q.pickupEtaMin,
    tripMin: q.durationMin,
    phase: form.when.mode === 'later' ? 'scheduled' : 'matching',
    phaseStartedAt: now,
    drone: { id: `DR-${String(1 + Math.floor(r() * 24)).padStart(2, '0')}`, pilot: PILOTS[Math.floor(r() * PILOTS.length)] },
    pin: String(1000 + Math.floor(r() * 9000)),
    collectCode: form.dropoff === 'collect' ? collectCode(id) : undefined,
  };
}

const NEXT: Partial<Record<Phase, Phase>> = { scheduled: 'matching', matching: 'to_pickup', to_pickup: 'at_pickup', at_pickup: 'to_dropoff', to_dropoff: 'done' };

function to(phase: Phase, now: number): Partial<Order> {
  return { phase, phaseStartedAt: now, ...(phase === 'done' ? { completedAt: now } : {}) };
}

/** Moves an order on when its time is up. */
export function advance(o: Order, now: number): Partial<Order> | null {
  const t = now - o.phaseStartedAt;
  switch (o.phase) {
    case 'scheduled':
      return now >= o.startAt ? to('matching', now) : null;
    case 'matching':
      return t > MATCHING_MS ? to('to_pickup', now) : null;
    case 'to_pickup':
      return t > o.approachMin * SIM_MS_PER_MIN ? to('at_pickup', now) : null;
    case 'at_pickup':
      return t > HANDOVER_MS ? to('to_dropoff', now) : null;
    case 'to_dropoff':
      return t > o.tripMin * SIM_MS_PER_MIN ? to('done', now) : null;
    default:
      return null;
  }
}

/** Jumps to the next step (demo control). */
export function skip(o: Order, now: number): Partial<Order> | null {
  const next = NEXT[o.phase];
  return next ? to(next, now) : null;
}

const cache = new WeakMap<Pos3[], { cum: number[]; total: number }>();
function along(path: Pos3[], frac: number) {
  let c = cache.get(path);
  if (!c) {
    c = cumulative(path);
    cache.set(path, c);
  }
  return positionAlong(path, c.cum, c.total * clamp(frac, 0, 1));
}

export interface Live {
  pos: Pos3;
  heading: number;
  /** Simulated minutes until it reaches the next stop. */
  minutesLeft: number;
  /** 0–1 progress through the current leg. */
  frac: number;
}

export function live(o: Order, now: number): Live {
  const t = now - o.phaseStartedAt;
  const first = o.approach[0];
  const pickup = o.trip[0];
  const end = o.trip[o.trip.length - 1];
  switch (o.phase) {
    case 'scheduled':
    case 'matching':
      return { pos: [first[0], first[1], 0], heading: bearingDeg(first, pickup), minutesLeft: o.approachMin, frac: 0 };
    case 'to_pickup': {
      const frac = clamp(t / (o.approachMin * SIM_MS_PER_MIN), 0, 1);
      const { pos, heading } = along(o.approach, frac);
      return { pos, heading, minutesLeft: o.approachMin * (1 - frac), frac };
    }
    case 'at_pickup':
      return { pos: [pickup[0], pickup[1], HOVER_M], heading: 0, minutesLeft: o.tripMin, frac: clamp(t / HANDOVER_MS, 0, 1) };
    case 'to_dropoff': {
      const frac = clamp(t / (o.tripMin * SIM_MS_PER_MIN), 0, 1);
      const { pos, heading } = along(o.trip, frac);
      return { pos, heading, minutesLeft: o.tripMin * (1 - frac), frac };
    }
    default:
      return { pos: end, heading: 0, minutesLeft: 0, frac: 1 };
  }
}

/** Remaining part of the flight line (for drawing), starting at the drone. */
export function remaining(o: Order, l: Live): Pos3[] {
  const path = o.phase === 'to_pickup' ? o.approach : o.trip;
  const c = cache.get(path) ?? cumulative(path);
  cache.set(path, c);
  const m = c.total * l.frac;
  let i = 1;
  while (i < c.cum.length && c.cum[i] <= m) i++;
  return [l.pos, ...path.slice(i)];
}

export const isActive = (o: Order) => o.phase !== 'done' && o.phase !== 'cancelled';
export const isCollect = (o: Order) => o.form.dropoff === 'collect';

export const STEPS = (o: Order) => ['Booked', 'Picked up', 'Flying', isCollect(o) ? 'At the shop' : 'Delivered'];

export function stepIndex(p: Phase): number {
  if (p === 'at_pickup') return 1;
  if (p === 'to_dropoff') return 2;
  if (p === 'done') return 3;
  return 0;
}
