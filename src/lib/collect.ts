// "Collect" — local shops that take the parcel from the drone and hold it until you pick it up.
// Demo data: shops are generated around the drop-off (fictional names), away from no-fly zones.
import type { LngLat } from '@shared/types';
import { destination, distanceM, pointInZone } from '@shared/geo';
import { DEMO_ZONES } from '@shared/data/london';
import { rng } from './format';

export interface CollectPoint {
  id: string;
  name: string;
  kind: string;
  position: LngLat;
  distanceM: number;
  walkMin: number;
  /** Opening hours, 24 h clock (e.g. 7 → 07:00, 23.5 → 23:30). */
  opens: number;
  closes: number;
  /** How the shop receives drones. */
  pad: string;
}

const KINDS: { kind: string; opens: number; closes: number }[] = [
  { kind: 'Corner shop', opens: 7, closes: 23 },
  { kind: 'Newsagent', opens: 6, closes: 21 },
  { kind: 'Mini market', opens: 7, closes: 22 },
  { kind: 'Pharmacy', opens: 9, closes: 18.5 },
  { kind: 'Dry cleaner', opens: 8, closes: 19 },
  { kind: 'Café', opens: 7.5, closes: 18 },
];

const NAMES: Record<string, string[]> = {
  'Corner shop': ['Rosebank Food & Wine', 'Corner Stop', 'Station Road Stores', 'Canal Side Stores', 'Northside Food & Wine', 'Sunrise Convenience'],
  Newsagent: ['Parkway News', 'Oak & Ivy Newsagents', 'Bridge Street News', 'Morning Post News'],
  'Mini market': ['Hillside Mini Market', 'Market Row Mini Mart', 'Greenleaf Grocers', 'Elm Tree Local'],
  Pharmacy: ['Bluebell Pharmacy', 'Kingsway Chemist', 'Greenway Pharmacy'],
  'Dry cleaner': ['Pressed & Co', 'Fresh Fold Cleaners'],
  Café: ['The Daily Grind', 'Little Pot Café'],
};

const PADS = ['Drone pad on the roof', 'Drop box in the back yard', 'Drone locker on the shopfront'];

const hourLabel = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

/** The nearest partner shops to a drop-off, closest first. Looks further out if the area is a no-fly zone. */
export function collectPointsNear(p: LngLat, count = 4): CollectPoint[] {
  const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const r = rng(key);
  const used = new Set<string>();
  const out: CollectPoint[] = [];
  const rings: [number, number][] = [
    [140, 900],
    [900, 1700],
    [1700, 2600],
  ];
  for (const [near, far] of rings) {
    for (let i = 0; i < 14; i++) {
      const t = KINDS[Math.floor(r() * KINDS.length)];
      const dist = near + r() * (far - near);
      const pos = destination(p, r() * 360, dist);
      const names = NAMES[t.kind];
      const name = names[Math.floor(r() * names.length)];
      const pad = PADS[Math.floor(r() * PADS.length)];
      if (used.has(name) || DEMO_ZONES.some((z) => z.active && pointInZone(pos, z))) continue;
      used.add(name);
      const d = distanceM(p, pos);
      out.push({ id: `${key}:${near}:${i}`, name, kind: t.kind, position: pos, distanceM: d, walkMin: Math.max(2, Math.round((d * 1.3) / 80)), opens: t.opens, closes: t.closes, pad });
    }
    if (out.length >= count) break;
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, count);
}

export function isOpen(c: CollectPoint, t: number) {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= c.opens && h < c.closes;
}

export function hoursText(c: CollectPoint, t: number) {
  return isOpen(c, t) ? `Open until ${hourLabel(c.closes)}` : `Closed · opens ${hourLabel(c.opens)}`;
}

export const openingHours = (c: CollectPoint) => `${hourLabel(c.opens)}–${hourLabel(c.closes)}`;

/** A 6-character code the shop asks for when you collect. */
export function collectCode(seed: string) {
  const r = rng(`collect:${seed}`);
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => L[Math.floor(r() * L.length)]).join('');
}
