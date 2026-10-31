import type { LngLat, Pos3 } from '@shared/types';
import { cumulative, destination, positionAlong } from '@shared/geo';
import { approxRoadRoute, planDroneRoute } from '@shared/routing';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { RETURN_POINTS } from './services';
import type { Mode, Option, Order, OrderForm, Phase, Vehicle } from './types';

/** Demo speed: one simulated minute passes in 2.5 real seconds. */
export const SIM_MS_PER_MIN = 2500;
const MATCHING_MS = 2600;
const HANDOVER_MS = 4500;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const NAMES = ['Sam', 'Priya', 'Tom', 'Aisha', 'Mo', 'Lena', 'Jay', 'Kemi', 'Dan', 'Rosa'];
const CARS = ['Toyota Prius', 'Kia Niro', 'Skoda Octavia', 'Hyundai Ioniq'];

function plate(r: () => number) {
  const L = 'ABCDEFGHJKLMNPRSTUVWXY';
  const c = () => L[Math.floor(r() * L.length)];
  return `L${c()}${21 + Math.floor(r() * 5)} ${c()}${c()}${c()}`;
}

export function makeVehicle(mode: Mode, id: string, form: OrderForm): Vehicle {
  const r = rng(id);
  const name = NAMES[Math.floor(r() * NAMES.length)];
  const rating = +(4.75 + r() * 0.24).toFixed(2);
  switch (mode) {
    case 'drone':
      return { name: 'Hive Skylift H5', detail: `Drone DR-${String(1 + Math.floor(r() * 10)).padStart(2, '0')}`, person: 'Lewis · remote pilot', rating: 4.98 };
    case 'aerial':
    case 'aerial_pro':
      return { name: 'Hive Skylift H5 · camera', detail: `Drone DR-${String(1 + Math.floor(r() * 10)).padStart(2, '0')}`, person: 'Lewis · approved remote pilot', rating: 4.97 };
    case 'waymo':
    case 'ride_waymo':
      return { name: 'Waymo · Jaguar I-PACE', detail: `White · ${plate(r)}`, rating: 4.92 };
    case 'ride_xl':
      return { name: 'Ford Galaxy', detail: plate(r), person: name, rating };
    case 'bike':
      return { name: 'Cargo bike', detail: 'CityHop', person: name, rating };
    case 'van':
      return { name: 'Ford Transit', detail: `Thames Express · ${plate(r)}`, person: form.helpers ? `${name} + ${form.helpers} helper${form.helpers > 1 ? 's' : ''}` : name, rating };
    default:
      return { name: CARS[Math.floor(r() * CARS.length)], detail: plate(r), person: name, rating };
  }
}

const isAir = (m: Mode) => m === 'drone' || m === 'aerial' || m === 'aerial_pro';
const flat = (path: Pos3[]): LngLat[] => path.map((p) => [p[0], p[1]] as LngLat);

export function createOrder(form: OrderForm, option: Option): Order {
  const now = Date.now();
  const id = `HV${Math.floor(1000 + Math.random() * 9000)}`;
  const r = rng(id);
  const pick = (form.service === 'aerial' ? form.to : form.from) ?? form.to!;
  const drop = form.to ?? pick;
  const approachMin = clamp(Math.round(option.etaPickupMin), 2, 25);
  const tripMin = form.service === 'aerial' ? form.aerialMinutes : clamp(Math.round(option.durationMin), 2, 60);
  const air = isAir(option.mode);
  const startKm = air ? Math.min(6, approachMin * 0.9) : Math.min(3.5, approachMin * 0.3);
  const start = destination(pick.position, r() * 360, Math.max(350, startKm * 1000));
  const approach = flat(air ? planDroneRoute(start, pick.position, DEMO_ZONES, LANDMARKS).path : approxRoadRoute(start, pick.position).path);
  const trip = form.service === 'aerial' ? [pick.position] : option.route.length > 1 ? option.route : flat(approxRoadRoute(pick.position, drop.position).path);
  return {
    id,
    createdAt: now,
    service: form.service,
    form: { ...form },
    option,
    phase: 'matching',
    phaseStartedAt: now,
    approach,
    trip,
    approachMin,
    tripMin,
    vehicle: makeVehicle(option.mode, id, form),
    code: String(1000 + Math.floor(r() * 9000)),
  };
}

/** Moves an order to its next phase when its time is up (the photo check waits for you). */
export function advance(o: Order, now: number): Partial<Order> | null {
  const t = now - o.phaseStartedAt;
  switch (o.phase) {
    case 'matching':
      return t > MATCHING_MS ? { phase: 'to_pickup', phaseStartedAt: now } : null;
    case 'to_pickup':
      return t > o.approachMin * SIM_MS_PER_MIN ? { phase: 'at_pickup', phaseStartedAt: now } : null;
    case 'at_pickup':
      if (t <= HANDOVER_MS) return null;
      return o.service === 'collect' && o.form.checkFirst && o.checkApproved === undefined ? { phase: 'check', phaseStartedAt: now } : { phase: 'to_dropoff', phaseStartedAt: now };
    case 'to_dropoff':
      return t > o.tripMin * SIM_MS_PER_MIN ? { phase: 'done', phaseStartedAt: now, completedAt: now } : null;
    default:
      return null;
  }
}

/** Jumps straight to the next phase (demo control). */
export function skip(o: Order, now: number): Partial<Order> | null {
  const next: Partial<Record<Phase, Phase>> = { matching: 'to_pickup', to_pickup: 'at_pickup', at_pickup: o.service === 'collect' && o.form.checkFirst && o.checkApproved === undefined ? 'check' : 'to_dropoff', to_dropoff: 'done' };
  const p = next[o.phase];
  return p ? { phase: p, phaseStartedAt: now, ...(p === 'done' ? { completedAt: now } : {}) } : null;
}

function along(path: LngLat[], frac: number): { pos: LngLat; heading: number } {
  if (path.length < 2) return { pos: path[0], heading: 0 };
  const p3 = path.map((p) => [p[0], p[1], 0] as Pos3);
  const { cum, total } = cumulative(p3);
  const r = positionAlong(p3, cum, total * clamp(frac, 0, 1));
  return { pos: [r.pos[0], r.pos[1]], heading: r.heading };
}

export function live(o: Order, now: number): { pos: LngLat; heading: number; minutesLeft: number } {
  const t = now - o.phaseStartedAt;
  const end = o.trip[o.trip.length - 1] ?? o.approach[o.approach.length - 1];
  switch (o.phase) {
    case 'matching':
      return { ...along(o.approach, 0), minutesLeft: o.approachMin + o.tripMin };
    case 'to_pickup': {
      const f = clamp(t / (o.approachMin * SIM_MS_PER_MIN), 0, 1);
      return { ...along(o.approach, f), minutesLeft: o.approachMin * (1 - f) };
    }
    case 'at_pickup':
    case 'check':
      return { pos: o.approach[o.approach.length - 1] ?? o.trip[0], heading: 0, minutesLeft: o.tripMin };
    case 'to_dropoff': {
      const f = clamp(t / (o.tripMin * SIM_MS_PER_MIN), 0, 1);
      if (o.service === 'aerial') {
        const ang = (t / 9000) * 360;
        return { pos: destination(o.trip[0], ang, 70), heading: ang + 90, minutesLeft: o.tripMin * (1 - f) };
      }
      return { ...along(o.trip, f), minutesLeft: o.tripMin * (1 - f) };
    }
    default:
      return { pos: end, heading: 0, minutesLeft: 0 };
  }
}

export const isActive = (o: Order) => !['done', 'cancelled'].includes(o.phase);

export function steps(o: Order): string[] {
  if (o.service === 'ride') return ['Booked', 'Picked up', 'On your way', 'Arrived'];
  if (o.service === 'aerial') return ['Booked', 'Pilot arrived', 'Flying', 'Photos ready'];
  if (o.service === 'move') return ['Booked', 'Loaded', 'On the way', 'Moved'];
  return ['Booked', 'Picked up', 'On the way', o.service === 'return' ? 'Returned' : 'Delivered'];
}

export function stepIndex(p: Phase): number {
  return p === 'matching' || p === 'to_pickup' ? 0 : p === 'at_pickup' || p === 'check' ? 1 : p === 'to_dropoff' ? 2 : 3;
}

export function headline(o: Order): string {
  const v = o.option.title;
  const to = o.form.to?.name ?? 'the drop-off';
  switch (o.phase) {
    case 'matching':
      return o.service === 'aerial' ? 'Booking your pilot…' : `Finding your ${v.toLowerCase()}…`;
    case 'to_pickup':
      if (o.service === 'collect') return 'Heading to the seller';
      if (o.service === 'errand') return 'Heading to pick it up';
      if (o.service === 'ride') return `Your ${v} is on the way`;
      if (o.service === 'aerial') return 'The drone is flying to you';
      return `Your ${v.toLowerCase()} is on the way to you`;
    case 'at_pickup':
      if (o.service === 'collect') return 'At the seller now';
      if (o.service === 'errand') return 'Picking it up';
      if (o.service === 'ride') return 'Your ride is here';
      if (o.service === 'aerial') return 'The pilot is getting ready';
      return o.option.mode === 'waymo' ? 'Your Waymo is outside' : 'Collecting from you now';
    case 'check':
      return 'Check it before we collect';
    case 'to_dropoff':
      if (o.service === 'sold') return 'On the way to your buyer';
      if (o.service === 'collect' || o.service === 'errand') return 'On the way to you';
      if (o.service === 'return') return `On the way to the ${RETURN_POINTS.find((r) => r.id === o.form.returnPoint)?.label.toLowerCase() ?? 'drop-off'}`;
      if (o.service === 'aerial') return 'Flying your shoot';
      return `On the way to ${to}`;
    case 'done':
      if (o.service === 'ride') return 'You’ve arrived';
      if (o.service === 'aerial') return 'Your photos are ready';
      if (o.service === 'return') return 'Returned';
      if (o.service === 'move') return 'All moved';
      return 'Delivered';
    default:
      return 'Cancelled';
  }
}

/** What to do right now — for you, wherever you are in this order. */
export function instruction(o: Order): string | undefined {
  if (o.phase === 'done' || o.phase === 'cancelled' || o.phase === 'check') return undefined;
  const m = o.option.mode;
  const code = o.code;
  if (o.service === 'ride') {
    if (m === 'ride_waymo') return `Unlock with code ${code} when it pulls up. Buckle up: there’s no driver.`;
    return `Meet ${o.vehicle.person} at the kerb. Check the plate: ${o.vehicle.detail}.`;
  }
  if (o.service === 'aerial') return 'Keep people and pets clear of the take-off spot. The pilot will say hello first.';
  const youReceive = o.service === 'collect' || o.service === 'errand';
  const early = o.phase === 'matching' || o.phase === 'to_pickup' || o.phase === 'at_pickup';
  if (!youReceive && early) {
    if (m === 'drone') return 'Put it in a bag or box and step outside. Clear a 2 × 2 m spot: the drone lowers a hook, you clip it on, and it’s off.';
    if (m === 'waymo') return `When the Waymo pulls up, open the boot with code ${code}, pop it in and close it.`;
    if (m === 'van') return o.form.helpers ? 'The team does the lifting. Just show them what’s going.' : 'You load; the driver can help with lighter things.';
    return `${o.vehicle.person} will knock when outside. Hand it over and they’ll show code ${code}.`;
  }
  if (youReceive && o.phase === 'to_dropoff') {
    if (m === 'drone') return 'Step outside when it’s close and clear a 2 × 2 m spot. It’s lowered on a line, no landing.';
    if (m === 'waymo') return `Open the boot with code ${code} when it arrives.`;
    return `${o.vehicle.person} will knock. Check code ${code} before you take it.`;
  }
  if (youReceive) return o.service === 'collect' ? 'We’ve texted the seller what to do. Sit tight.' : 'We’re on it. You’ll get a photo of the receipt.';
  return o.service === 'sold' ? 'Your buyer has a live tracking link, so no need to message them.' : 'The recipient gets a live tracking link by text.';
}
