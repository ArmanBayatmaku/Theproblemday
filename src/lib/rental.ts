// Drone rental: a licensed pilot brings a drone to you — aerial views, events, roof & gutter checks,
// or anything else on a personalised quote.
import type { Flyability, LngLat, Place, Pos3, PriceLine, Weather } from '@shared/types';
import { approxRoadRoute, roadSpeedKmh } from '@shared/routing';
import { bearingDeg, cumulative, destination, distanceM, pointInZone, positionAlong } from '@shared/geo';
import { DEMO_ZONES } from '@shared/data/london';
import { droneFlyability, effectiveWindMs } from '@shared/weather';
import { DRONE, PORTS, type Port } from './drone';
import { mph, rng } from './format';
import { SIM_MS_PER_MIN } from './orders';
import { shortZone } from './quotes';
import type { When } from './types';

export type RentPurpose = 'aerial' | 'event' | 'roof' | 'other';
export type RentPackage = 'pilot' | 'pro';

export const PURPOSES: Record<RentPurpose, { title: string; hint: string }> = {
  aerial: { title: 'Aerial view', hint: 'Photos and video of a home, garden or view' },
  event: { title: 'Event', hint: 'Weddings, parties, sport, launches' },
  roof: { title: 'Roof & gutter check', hint: 'Roof, chimney and gutters, no ladder' },
  other: { title: 'Other', hint: 'Anything else, priced for you' },
};

export const PACKAGE_TITLE: Record<RentPackage, string> = { pilot: 'Drone + pilot', pro: 'Pro' };

export const AERIAL_MINUTES = [15, 30, 60] as const;
export const EVENT_HOURS = [1, 2, 3, 4, 5, 6, 8];
export const OTHER_HOURS: { value: number; label: string }[] = [
  { value: 0.5, label: '30 min' },
  { value: 1, label: '1 h' },
  { value: 2, label: '2 h' },
  { value: 4, label: 'Half day' },
  { value: 0, label: 'Not sure' },
];

export interface RentForm {
  purpose: RentPurpose;
  place?: Place;
  when: When;
  aerialMin: (typeof AERIAL_MINUTES)[number];
  /** Event length in hours — required to price an event. */
  eventHours?: number;
  eventNote: string;
  building: 'house' | 'large';
  /** What's needed (required for Other). */
  details: string;
  /** Rough length for Other (0 = not sure). */
  otherHours?: number;
}

export const newRentForm = (place?: Place, purpose: RentPurpose = 'aerial'): RentForm => ({
  purpose,
  place,
  when: { mode: 'now' },
  aerialMin: 30,
  eventNote: '',
  building: 'house',
  details: '',
});

// ---------- prices ----------
const AERIAL_PRICE: Record<number, number> = { 15: 29, 30: 49, 60: 89 };
const AERIAL_PRO_EXTRA = 40;
const EVENT_RATE: Record<RentPackage, number> = { pilot: 69, pro: 119 };
const ROOF_PRICE: Record<RentPackage, number> = { pilot: 59, pro: 99 };
const ROOF_LARGE: Record<RentPackage, number> = { pilot: 30, pro: 40 };
const OTHER_RATE: Record<RentPackage, [number, number]> = { pilot: [49, 69], pro: [89, 129] };
const SETUP = 15;

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (l: PriceLine[]) => round2(l.reduce((s, x) => s + x.amount, 0));
const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

/** Time on site, in minutes. */
export function onSiteMinutes(f: RentForm): number {
  switch (f.purpose) {
    case 'aerial':
      return f.aerialMin;
    case 'event':
      return (f.eventHours ?? 1) * 60;
    case 'roof':
      return f.building === 'large' ? 50 : 30;
    default:
      return (f.otherHours || 1) * 60;
  }
}

export function durationLabel(f: RentForm): string {
  switch (f.purpose) {
    case 'aerial':
      return `${f.aerialMin} min in the air`;
    case 'event':
      return f.eventHours ? `${fmtHours(f.eventHours)} event` : 'Event length not set';
    case 'roof':
      return f.building === 'large' ? 'About 50 min (larger building)' : 'About 30 min (house)';
    default:
      return f.otherHours ? `About ${fmtHours(f.otherHours)}` : 'Length to be confirmed';
  }
}

/** What still needs filling in (undefined when ready). */
export function rentProblem(f: RentForm): string | undefined {
  if (!f.place) return 'Add where to fly';
  if (f.purpose === 'event' && !f.eventHours) return 'Add how long the event lasts';
  if (f.purpose === 'other' && f.details.trim().length < 6) return 'Tell us what you need';
  return undefined;
}

const INCLUDES: Record<RentPurpose, Record<RentPackage, (f: RentForm) => string[]>> = {
  aerial: {
    pilot: (f) => [`A licensed pilot and drone for ${f.aerialMin} min`, '20+ edited photos and a short video', 'Sent to you the same day'],
    pro: () => ['Everything in Drone + pilot', '4K film, colour-graded and edited', 'Sent the next morning'],
  },
  event: {
    pilot: (f) => [`Pilot and drone for the whole ${fmtHours(f.eventHours ?? 1)}`, 'Photos throughout the event', 'A 1-minute highlights clip'],
    pro: () => ['Senior pilot and 4K cinema drone', 'Edited 3-minute highlights film', 'All raw footage included'],
  },
  roof: {
    pilot: () => ['Close-up photos of the roof, chimney and gutters', 'Blocked gutters and missing tiles marked', 'Photos the same day'],
    pro: () => ['Everything in Drone + pilot', 'Thermal camera for leaks and heat loss', 'Written report with repair priorities'],
  },
  other: {
    pilot: () => ['A licensed pilot and drone', 'A quote based on what you need', 'You only pay for the time you book'],
    pro: () => ['Senior pilot and pro camera kit', 'A quote based on what you need', 'Editing and delivery included'],
  },
};

const TAGLINE: Record<RentPackage, string> = { pilot: 'A licensed pilot flies for you', pro: 'Senior pilot, 4K kit and editing' };

const nearestPort = (p: LngLat): Port => PORTS.reduce((a, b) => (distanceM(a.position, p) <= distanceM(b.position, p) ? a : b));

export interface RentOption {
  pkg: RentPackage;
  title: string;
  tagline: string;
  includes: string[];
  /** Fixed price (undefined for a personalised quote). */
  price?: number;
  /** Personalised quote: estimate range. */
  range?: [number, number];
  breakdown: PriceLine[];
  available: boolean;
  reason?: string;
  fix?: 'later' | 'place';
  pilotEtaMin: number;
  onSiteMin: number;
  startAt: number;
  endAt: number;
  port: Port;
  travel: LngLat[];
  fly: { status: Flyability; reasons: string[] };
  notes: string[];
  quote: boolean;
}

function breakdownFor(f: RentForm, pkg: RentPackage): { lines: PriceLine[]; range?: [number, number] } {
  switch (f.purpose) {
    case 'aerial': {
      const lines: PriceLine[] = [{ label: `${f.aerialMin} min flight with a pilot`, amount: AERIAL_PRICE[f.aerialMin] }];
      if (pkg === 'pro') lines.push({ label: '4K film, edited', amount: AERIAL_PRO_EXTRA });
      return { lines };
    }
    case 'event': {
      const h = f.eventHours ?? 1;
      return {
        lines: [
          { label: `${pkg === 'pro' ? 'Pro crew' : 'Pilot and drone'} · ${fmtHours(h)} × £${EVENT_RATE[pkg]}`, amount: round2(h * EVENT_RATE[pkg]) },
          { label: 'Setup and safety briefing', amount: SETUP },
        ],
      };
    }
    case 'roof': {
      const lines: PriceLine[] = [{ label: pkg === 'pro' ? 'Roof & gutter check with thermal report' : 'Roof & gutter check', amount: ROOF_PRICE[pkg] }];
      if (f.building === 'large') lines.push({ label: 'Larger building', amount: ROOF_LARGE[pkg] });
      return { lines };
    }
    default: {
      const h = f.otherHours || 1;
      const [lo, hi] = OTHER_RATE[pkg];
      return { lines: [], range: [round2(h * lo + SETUP), round2(h * hi + SETUP)] };
    }
  }
}

/** Both packages for this request, with availability (no-fly zones, wind). */
export function quoteRental(f: RentForm, weather: Weather, now: number): RentOption[] {
  if (!f.place) return [];
  const place = f.place.position;
  const port = nearestPort(place);
  const road = approxRoadRoute(port.position, place);
  const later = f.when.mode === 'later';
  const travelMin = Math.max(8, Math.round((road.distanceKm / roadSpeedKmh(port.position, place, new Date(now))) * 60 + 6));
  const startAt = later ? (f.when as { at: number }).at : now + travelMin * 60_000;
  const onSiteMin = onSiteMinutes(f);

  const hour = later ? weather.hourly.find((h) => Math.abs(h.time - startAt) < 45 * 60_000) : undefined;
  const w: Weather = hour ? { ...weather, windMs120: hour.windMs120, gustMs: hour.gustMs, precipMm: hour.precipMm, tempC: hour.tempC } : weather;
  const fly = droneFlyability(w, DRONE.limits);
  const zone = DEMO_ZONES.find((z) => z.active && pointInZone(place, z));

  let reason: string | undefined;
  let fix: RentOption['fix'];
  if (zone) {
    reason = `${f.place.name} is inside a no-fly zone (${shortZone(zone.name)}, demo). Flying there needs special permission.`;
    fix = 'place';
  } else if (fly.status === 'no_go') {
    reason = `Too windy to fly ${later ? 'then' : 'right now'} (gusts ${mph(w.gustMs)} mph).`;
    fix = 'later';
  }

  const notes: string[] = [];
  if (!later) notes.push(`Your pilot is about ${travelMin} min away, from ${port.name.replace('Hive port ', '')}`);
  if (fly.status === 'caution') notes.push(`Breezy (${mph(effectiveWindMs(w))} mph at 120 m): the pilot may pause in strong gusts`);
  if (f.purpose === 'event' && (f.eventHours ?? 0) > 2) notes.push('Battery swaps included: the drone lands for a few minutes about every 40 minutes');
  if (f.purpose === 'roof') notes.push('No ladders or scaffolding needed. Stay indoors or well back while the drone flies low.');
  if (f.purpose === 'other') notes.push('A pilot reviews your request and sends a fixed quote. You only pay once you accept it.');

  return (['pilot', 'pro'] as RentPackage[]).map((pkg) => {
    const { lines, range } = breakdownFor(f, pkg);
    return {
      pkg,
      title: PACKAGE_TITLE[pkg],
      tagline: TAGLINE[pkg],
      includes: INCLUDES[f.purpose][pkg](f),
      price: range ? undefined : sum(lines),
      range,
      breakdown: lines,
      available: !reason,
      reason,
      fix,
      pilotEtaMin: travelMin,
      onSiteMin,
      startAt,
      endAt: startAt + (5 + onSiteMin) * 60_000,
      port,
      travel: road.path,
      fly,
      notes,
      quote: !!range,
    };
  });
}

/** The fixed price a pilot sends back for an "Other" request (demo: inside the estimate range). */
export function personalQuote(r: Rental): { price: number; breakdown: PriceLine[] } {
  const [lo, hi] = r.range ?? [49, 69];
  const t = rng(`${r.id}|${r.form.details}`)();
  const price = Math.round((lo + (hi - lo) * (0.35 + 0.4 * t)) / 1) - 0.01;
  const h = r.form.otherHours || 1;
  const setup = SETUP;
  return {
    price,
    breakdown: [
      { label: `${PACKAGE_TITLE[r.pkg]} · ${fmtHours(h)} on site`, amount: round2(price - setup) },
      { label: 'Setup and safety briefing', amount: setup },
    ],
  };
}

// ---------- bookings ----------
export type RentPhase = 'quote' | 'quoted' | 'scheduled' | 'matching' | 'travelling' | 'setup' | 'flying' | 'done' | 'cancelled';

export interface Rental {
  id: string;
  createdAt: number;
  startAt: number;
  form: RentForm;
  pkg: RentPackage;
  price?: number;
  breakdown: PriceLine[];
  range?: [number, number];
  phase: RentPhase;
  phaseStartedAt: number;
  pilot: { name: string; rating: number };
  droneId: string;
  portName: string;
  travel: LngLat[];
  travelMin: number;
  onSiteMin: number;
  code: string;
  completedAt?: number;
  rating?: number;
}

const PILOTS = ['Lewis', 'Maya', 'Femi', 'Hannah', 'Arjun', 'Zoe', 'Callum', 'Ines'];

export function createRental(f: RentForm, o: RentOption, now: number): Rental {
  const id = `HR${Math.floor(1000 + Math.random() * 9000)}`;
  const r = rng(id);
  return {
    id,
    createdAt: now,
    startAt: o.startAt,
    form: { ...f },
    pkg: o.pkg,
    price: o.price,
    breakdown: o.breakdown,
    range: o.range,
    phase: o.quote ? 'quote' : f.when.mode === 'later' ? 'scheduled' : 'matching',
    phaseStartedAt: now,
    pilot: { name: PILOTS[Math.floor(r() * PILOTS.length)], rating: +(4.86 + r() * 0.13).toFixed(2) },
    droneId: `DR-${String(30 + Math.floor(r() * 20)).padStart(2, '0')}`,
    portName: o.port.name,
    travel: o.travel,
    travelMin: o.pilotEtaMin,
    onSiteMin: o.onSiteMin,
    code: String(1000 + Math.floor(r() * 9000)),
  };
}

const QUOTE_MS = 6000;
const MATCHING_MS = 2500;
const SETUP_MS = 4500;
/** Time in the air is compressed for the demo: 0.4 s per minute, between 15 s and 90 s. */
export const flightMs = (r: Rental) => Math.min(90_000, Math.max(15_000, r.onSiteMin * 400));

const step = (phase: RentPhase, now: number): Partial<Rental> => ({ phase, phaseStartedAt: now, ...(phase === 'done' ? { completedAt: now } : {}) });

export function advanceRental(r: Rental, now: number): Partial<Rental> | null {
  const t = now - r.phaseStartedAt;
  switch (r.phase) {
    case 'quote': {
      if (t <= QUOTE_MS) return null;
      const q = personalQuote(r);
      return { ...step('quoted', now), price: q.price, breakdown: q.breakdown };
    }
    case 'scheduled':
      return now >= r.startAt ? step('matching', now) : null;
    case 'matching':
      return t > MATCHING_MS ? step('travelling', now) : null;
    case 'travelling':
      return t > r.travelMin * SIM_MS_PER_MIN ? step('setup', now) : null;
    case 'setup':
      return t > SETUP_MS ? step('flying', now) : null;
    case 'flying':
      return t > flightMs(r) ? step('done', now) : null;
    default:
      return null;
  }
}

/** Demo control: jump to the next step (a quote has to be accepted by you). */
export function skipRental(r: Rental, now: number): Partial<Rental> | null {
  if (r.phase === 'quote') return advanceRental({ ...r, phaseStartedAt: 0 }, now);
  const next: Partial<Record<RentPhase, RentPhase>> = { scheduled: 'matching', matching: 'travelling', travelling: 'setup', setup: 'flying', flying: 'done' };
  const p = next[r.phase];
  return p ? step(p, now) : null;
}

/** Accepting a personalised quote books it. */
export function acceptQuote(r: Rental, now: number): Partial<Rental> {
  return step(r.form.when.mode === 'later' ? 'scheduled' : 'matching', now);
}

export const rentalActive = (r: Rental) => r.phase !== 'done' && r.phase !== 'cancelled';

/** How the drone circles the spot: radius (m) and height (m) per job. */
const ORBIT: Record<RentPurpose, { r: number; alt: number }> = {
  aerial: { r: 90, alt: 60 },
  event: { r: 70, alt: 45 },
  roof: { r: 22, alt: 25 },
  other: { r: 60, alt: 50 },
};

export function orbitPath(r: Rental): Pos3[] {
  const c = r.form.place!.position;
  const o = ORBIT[r.form.purpose];
  return Array.from({ length: 49 }, (_, i) => {
    const p = destination(c, (i / 48) * 360, o.r);
    return [p[0], p[1], o.alt] as Pos3;
  });
}

export const flightArea = (f: RentForm) => ({ center: f.place!.position, radiusM: f.purpose === 'roof' ? 60 : 150 });

const travelCache = new WeakMap<LngLat[], { path: Pos3[]; cum: number[]; total: number }>();

export interface RentLive {
  pos: Pos3;
  heading: number;
  /** Simulated minutes left in the current step. */
  minutesLeft: number;
  frac: number;
}

export function liveRental(r: Rental, now: number): RentLive | undefined {
  const t = now - r.phaseStartedAt;
  const place = r.form.place!.position;
  const start = r.travel[0] ?? place;
  switch (r.phase) {
    case 'scheduled':
    case 'matching':
      return { pos: [start[0], start[1], 0], heading: 0, minutesLeft: r.travelMin, frac: 0 };
    case 'travelling': {
      let c = travelCache.get(r.travel);
      if (!c) {
        const path = r.travel.map((p) => [p[0], p[1], 0] as Pos3);
        c = { path, ...cumulative(path) };
        travelCache.set(r.travel, c);
      }
      const frac = Math.min(1, t / (r.travelMin * SIM_MS_PER_MIN));
      const { pos, heading } = positionAlong(c.path, c.cum, c.total * frac);
      return { pos, heading, minutesLeft: r.travelMin * (1 - frac), frac };
    }
    case 'setup':
      return { pos: [place[0], place[1], 0], heading: 0, minutesLeft: r.onSiteMin, frac: 0 };
    case 'flying': {
      const frac = Math.min(1, t / flightMs(r));
      const o = ORBIT[r.form.purpose];
      const ang = (t / 14_000) * 360;
      const p = destination(place, ang, o.r);
      const climb = Math.min(1, t / 3000);
      return { pos: [p[0], p[1], o.alt * climb], heading: bearingDeg(place, p) + 90, minutesLeft: r.onSiteMin * (1 - frac), frac };
    }
    case 'done':
      return { pos: [place[0], place[1], 0], heading: 0, minutesLeft: 0, frac: 1 };
    default:
      return undefined;
  }
}

export function rentalTitle(r: Rental | RentForm): string {
  const f = 'form' in r ? r.form : r;
  switch (f.purpose) {
    case 'aerial':
      return `Aerial view · ${f.aerialMin} min`;
    case 'event':
      return `Event · ${fmtHours(f.eventHours ?? 1)}`;
    case 'roof':
      return 'Roof & gutter check';
    default:
      return `Other · ${f.details.trim().slice(0, 28)}${f.details.trim().length > 28 ? '…' : ''}`;
  }
}
