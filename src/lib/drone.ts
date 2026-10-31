// The Hive drone network: aircraft limits, drone ports and the payload-bay fit check.
import type { LngLat } from '@shared/types';

export const DRONE = {
  model: 'Hive Skylift H5',
  /** Inside of the payload box (cm). */
  bay: { l: 45, w: 35, h: 25 },
  maxKg: 5,
  cruiseKmh: 55,
  /** Fragile items fly slower and avoid gusty air. */
  fragileCruiseKmh: 38,
  rangeKm: 28,
  limits: { maxWindMs: 12, tempMinC: -10, tempMaxC: 40, ipRating: 'IP55' },
  fragileLimits: { maxWindMs: 10.5, tempMinC: -10, tempMaxC: 40, ipRating: 'IP55' },
};

export interface Port {
  id: string;
  name: string;
  position: LngLat;
}

export const PORTS: Port[] = [
  { id: 'P-CAM', name: 'Hive port Camden', position: [-0.13, 51.539] },
  { id: 'P-NE', name: 'Hive port Nine Elms', position: [-0.1335, 51.4818] },
  { id: 'P-BER', name: 'Hive port Bermondsey', position: [-0.0595, 51.493] },
  { id: 'P-STR', name: 'Hive port Stratford', position: [-0.0005, 51.5375] },
  { id: 'P-WC', name: 'Hive port White City', position: [-0.2265, 51.5095] },
];

export type SizeId = 'pocket' | 'shoebox' | 'custom';

export const SIZES: { id: SizeId; title: string; hint: string; kg?: number }[] = [
  { id: 'pocket', title: 'Pocket', hint: 'Keys, phone, documents · up to 300 g', kg: 0.3 },
  { id: 'shoebox', title: 'Shoebox', hint: 'Shoes, clothes, a book · up to 2 kg', kg: 2 },
  { id: 'custom', title: 'Custom size', hint: 'Enter the size and weight' },
];

export interface Dims {
  l: number;
  w: number;
  h: number;
  kg: number;
}

export interface Fit {
  fits: boolean;
  /** Missing or impossible numbers — nothing to check yet. */
  incomplete: boolean;
  reasons: string[];
  /** Item sides, longest first (cm). */
  item: [number, number, number];
  /** Bay sides, longest first (cm). */
  bay: [number, number, number];
}

const sorted = (a: number[]) => [...a].sort((x, y) => y - x) as [number, number, number];

/** Does a box of these outside dimensions fit in the payload bay, turned any way round? */
export function checkFit(d: Dims): Fit {
  const item = sorted([d.l, d.w, d.h].map((v) => (Number.isFinite(v) ? v : 0)));
  const bay = sorted([DRONE.bay.l, DRONE.bay.w, DRONE.bay.h]);
  const incomplete = item.some((v) => v <= 0) || !(d.kg > 0);
  const reasons: string[] = [];
  if (!incomplete) {
    if (item[0] > bay[0]) reasons.push(`The longest side (${item[0]} cm) is longer than the bay (${bay[0]} cm)`);
    else if (item[1] > bay[1]) reasons.push(`It’s too wide: ${item[1]} cm, the bay is ${bay[1]} cm`);
    else if (item[2] > bay[2]) reasons.push(`It’s too deep: ${item[2]} cm, the bay is ${bay[2]} cm`);
    if (d.kg > DRONE.maxKg) reasons.push(`${d.kg} kg is over the ${DRONE.maxKg} kg limit`);
  }
  return { fits: !incomplete && reasons.length === 0, incomplete, reasons, item, bay };
}
