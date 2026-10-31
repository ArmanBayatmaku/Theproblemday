// Prices. The drone is what Hive books; Waymo, Uber and the others are shown as estimates to compare.
import type { Flyability, LngLat, Place, PriceLine, Weather } from '@shared/types';
import { approxRoadRoute, planDroneRoute, roadSpeedKmh, type DronePlan } from '@shared/routing';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { distanceM, pointInZone } from '@shared/geo';
import { droneFlyability, effectiveWindMs } from '@shared/weather';
import { DRONE, PORTS, SIZES, checkFit, type Port } from './drone';
import { isOpen } from './collect';
import { mph, rng } from './format';
import type { OrderForm } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const total = (lines: PriceLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

export const customDims = (f: OrderForm) => ({ l: parseFloat(f.custom.l), w: parseFloat(f.custom.w), h: parseFloat(f.custom.h), kg: parseFloat(f.custom.kg) });

export function itemKg(f: OrderForm): number {
  if (f.size === 'custom') return customDims(f).kg || 0;
  return SIZES.find((s) => s.id === f.size)?.kg ?? 2;
}

/** Where the drone actually goes: the recipient's door, or the chosen shop. */
export function destination(f: OrderForm): Place | undefined {
  if (!f.to) return undefined;
  if (f.dropoff === 'collect') return f.shop ? { name: f.shop.name, position: f.shop.position, address: f.shop.kind } : undefined;
  return f.to;
}

export const startTime = (f: OrderForm, now: number) => (f.when.mode === 'later' ? f.when.at : now);

/** What still needs doing before prices can be shown (undefined when ready). */
export function formProblem(f: OrderForm, now: number): string | undefined {
  if (!f.from) return 'Add where we pick it up';
  if (!f.to) return 'Add where it’s going';
  if (f.dropoff === 'collect') {
    if (!f.shop) return 'Choose a shop to collect from';
    if (!isOpen(f.shop, startTime(f, now) + 30 * 60_000)) return `${f.shop.name} is closed then — pick another shop`;
  }
  if (f.size === 'custom') {
    const fit = checkFit(customDims(f));
    if (fit.incomplete) return 'Enter the size and weight';
    if (!fit.fits) return 'Too big for the drone';
  }
  return undefined;
}

const nearestPort = (p: LngLat): Port => PORTS.reduce((a, b) => (distanceM(a.position, p) <= distanceM(b.position, p) ? a : b));

export interface DroneQuote {
  available: boolean;
  reason?: string;
  /** What would make it possible. */
  fix?: 'collect' | 'later' | 'size';
  price: number;
  breakdown: PriceLine[];
  pickupEtaMin: number;
  durationMin: number;
  arriveAt: number;
  plan: DronePlan;
  approach: DronePlan;
  port: Port;
  fly: { status: Flyability; reasons: string[] };
  notes: string[];
  co2g: number;
}

export function quoteDrone(f: OrderForm, weather: Weather, now: number): DroneQuote | undefined {
  const dest = destination(f);
  if (!f.from || !dest) return undefined;
  const start = startTime(f, now);
  const plan = planDroneRoute(f.from.position, dest.position, DEMO_ZONES, LANDMARKS);
  const port = nearestPort(f.from.position);
  const approach = planDroneRoute(port.position, f.from.position, DEMO_ZONES, LANDMARKS);
  const backKm = (distanceM(dest.position, nearestPort(dest.position).position) / 1000) * 1.1;
  const kg = itemKg(f);

  // Weather at take-off: the forecast hour for scheduled flights.
  const hour = f.when.mode === 'later' ? weather.hourly.find((h) => Math.abs(h.time - start) < 45 * 60_000) : undefined;
  const w: Weather = hour ? { ...weather, windMs120: hour.windMs120, gustMs: hour.gustMs, precipMm: hour.precipMm, tempC: hour.tempC } : weather;
  const fly = droneFlyability(w, f.fragile ? DRONE.fragileLimits : DRONE.limits);

  let reason: string | undefined;
  let fix: DroneQuote['fix'];
  const pickupZone = plan.blockedBy.find((z) => pointInZone(f.from!.position, z));
  const dropZone = plan.blockedBy.find((z) => pointInZone(dest.position, z));
  if (pickupZone) {
    reason = `The pickup is inside a no-fly zone (${shortZone(pickupZone.name)}, demo). Choose a pickup outside it.`;
  } else if (dropZone) {
    reason = `The drop-off is inside a no-fly zone (${shortZone(dropZone.name)}, demo).`;
    fix = f.dropoff === 'door' ? 'collect' : undefined;
  } else if (f.size === 'custom' && !checkFit(customDims(f)).fits) {
    reason = 'It doesn’t fit in the drone’s payload bay.';
    fix = 'size';
  } else if (kg > DRONE.maxKg) {
    reason = `${kg} kg is over the drone’s ${DRONE.maxKg} kg limit.`;
    fix = 'size';
  } else if (fly.status === 'no_go') {
    reason = `Too windy to fly ${f.when.mode === 'later' ? 'then' : 'right now'} (gusts ${mph(w.gustMs)} mph). Drones are grounded for safety.`;
    fix = 'later';
  } else if (approach.distanceKm + plan.distanceKm + backKm > DRONE.rangeKm) {
    reason = `Too far for one flight (${(approach.distanceKm + plan.distanceKm + backKm).toFixed(0)} km round trip, the limit is ${DRONE.rangeKm} km).`;
  }

  const cruise = (f.fragile ? DRONE.fragileCruiseKmh : DRONE.cruiseKmh) * (fly.status === 'caution' ? 0.88 : 1);
  const pickupEtaMin = Math.max(3, Math.round(2 + (approach.distanceKm / cruise) * 60));
  const durationMin = Math.max(3, Math.round((plan.distanceKm / cruise) * 60 + 1.5));
  const arriveAt = start + (pickupEtaMin + 1 + durationMin) * 60_000;

  const breakdown: PriceLine[] = [
    { label: 'Base fare', amount: 3.49 },
    { label: `Flight ${plan.distanceKm.toFixed(1)} km × £1.10`, amount: round2(plan.distanceKm * 1.1) },
  ];
  if (kg > 2) breakdown.push({ label: `Heavier item (${(kg - 2).toFixed(1)} kg over 2 kg)`, amount: round2((kg - 2) * 0.6) });
  if (total(breakdown) < 4.99) breakdown.push({ label: 'Minimum fare top-up', amount: round2(4.99 - total(breakdown)) });
  if (f.dropoff === 'collect') breakdown.push({ label: 'Collect from a shop', amount: -1 });

  const notes: string[] = [];
  const zones = plan.avoided.filter((a) => a.kind === 'zone');
  const buildings = plan.avoided.filter((a) => a.kind === 'building');
  if (zones.length) notes.push(`Flies around ${zones.map((z) => shortZone(z.name)).join(' and ')} (no-fly ${zones.length > 1 ? 'zones' : 'zone'}, demo)${plan.detourKm >= 0.05 ? ` · +${plan.detourKm.toFixed(1)} km` : ''}`);
  if (buildings.length && !zones.length) notes.push(`Steers clear of ${buildings.slice(0, 2).map((b) => b.name).join(' and ')}`);
  if (f.fragile) notes.push(`Fragile: flies slower and stays on the ground in gusts over ${mph(DRONE.fragileLimits.maxWindMs)} mph`);
  if (fly.status === 'caution') notes.push(`Breezy (${mph(effectiveWindMs(w))} mph at flight height): the flight may take a little longer`);

  return {
    available: !reason,
    reason,
    fix,
    price: total(breakdown),
    breakdown,
    pickupEtaMin,
    durationMin,
    arriveAt,
    plan,
    approach,
    port,
    fly,
    notes,
    co2g: Math.round(plan.distanceKm * 8),
  };
}

/** "Restricted Area — Hyde Park (illustrative)" → "Hyde Park". */
export function shortZone(name: string) {
  return name
    .replace(/^Restricted Area — /, '')
    .replace(/\s*\((illustrative|Royal Parks — no drones|Battersea)\)/, '')
    .replace(/ — temporary restriction$/, '')
    .replace(/ FRZ$/, ' airport');
}

// ---------- comparisons (estimates only) ----------
export type CompareId = 'waymo' | 'uber' | 'van' | 'bike';

export interface Comparison {
  id: CompareId;
  title: string;
  provider: string;
  tagline: string;
  price: number;
  pickupEtaMin: number;
  durationMin: number;
  arriveAt: number;
  available: boolean;
  reason?: string;
  co2g: number;
}

interface Cfg {
  id: CompareId;
  title: string;
  provider: string;
  tagline: string;
  base: number;
  perKm: number;
  perMin: number;
  maxKg: number;
  co2PerKm: number;
  pickup: [number, number];
  speedKmh?: number;
  maxKm?: number;
  area?: { center: LngLat; radiusM: number };
}

const COMPARE: Cfg[] = [
  { id: 'uber', title: 'Uber Courier', provider: 'Uber', tagline: 'A driver collects from your door', base: 4.5, perKm: 1.05, perMin: 0.2, maxKg: 6.8, co2PerKm: 110, pickup: [4, 9] },
  { id: 'waymo', title: 'Waymo', provider: 'Waymo', tagline: 'Driverless car · you load the boot', base: 3.2, perKm: 1.25, perMin: 0.3, maxKg: 60, co2PerKm: 45, pickup: [5, 11], area: { center: [-0.12, 51.505], radiusM: 10500 } },
  { id: 'bike', title: 'Cargo bike', provider: 'CityHop', tagline: 'Pedal-powered courier', base: 5.5, perKm: 1.4, perMin: 0, maxKg: 80, co2PerKm: 3, pickup: [12, 20], speedKmh: 16, maxKm: 9 },
  { id: 'van', title: 'Courier van', provider: 'Thames Express', tagline: 'Same-day van courier', base: 14, perKm: 1.55, perMin: 0.1, maxKg: 800, co2PerKm: 210, pickup: [30, 45] },
];

export function compareProviders(f: OrderForm, now: number): Comparison[] {
  const dest = destination(f);
  if (!f.from || !dest) return [];
  const start = startTime(f, now);
  const road = approxRoadRoute(f.from.position, dest.position);
  const kg = itemKg(f);
  const r = rng(`${f.from.position.join()}|${dest.position.join()}`);
  return COMPARE.map((c) => {
    const speed = c.speedKmh ?? roadSpeedKmh(f.from!.position, dest.position, new Date(start));
    const durationMin = Math.round((road.distanceKm / speed) * 60 + 4);
    const pickupEtaMin = Math.round(c.pickup[0] + r() * (c.pickup[1] - c.pickup[0]));
    let reason: string | undefined;
    if (kg > c.maxKg) reason = `Over the ${c.maxKg} kg limit`;
    else if (c.maxKm && road.distanceKm > c.maxKm) reason = `Beyond its ${c.maxKm} km range`;
    else if (c.area && [f.from!.position, dest.position].some((p) => distanceM(p, c.area!.center) > c.area!.radiusM)) reason = 'Outside its service area';
    const price = round2(c.base + road.distanceKm * c.perKm + durationMin * c.perMin);
    return {
      id: c.id,
      title: c.title,
      provider: c.provider,
      tagline: c.tagline,
      price,
      pickupEtaMin,
      durationMin,
      arriveAt: start + (pickupEtaMin + 2 + durationMin) * 60_000,
      available: !reason,
      reason,
      co2g: Math.round(road.distanceKm * c.co2PerKm),
    };
  });
}

/** How the drone stacks up against the alternatives. */
export function droneVerdict(d: DroneQuote, others: Comparison[]) {
  const avail = others.filter((o) => o.available);
  const cheapest = avail.reduce<Comparison | undefined>((a, b) => (!a || b.price < a.price ? b : a), undefined);
  const badges: string[] = [];
  if (!avail.length || d.price <= Math.min(...avail.map((o) => o.price))) badges.push('Cheapest');
  if (!avail.length || d.arriveAt <= Math.min(...avail.map((o) => o.arriveAt))) badges.push('Fastest');
  let line: string | undefined;
  if (cheapest) {
    const dp = round2(cheapest.price - d.price);
    const dt = Math.round((cheapest.arriveAt - d.arriveAt) / 60_000);
    const priceBit = dp > 0.004 ? `£${dp.toFixed(2)} less than ${cheapest.title}` : dp < -0.004 ? `£${(-dp).toFixed(2)} more than ${cheapest.title}` : `Same price as ${cheapest.title}`;
    const timeBit = dt > 0 ? `${dt} min sooner` : dt < 0 ? `${-dt} min later` : 'same time';
    line = `${priceBit} · ${timeBit}`;
  }
  return { badges, line };
}
