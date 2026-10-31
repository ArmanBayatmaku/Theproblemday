import type { LngLat, Pos3, Zone } from './types';

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LngLat | Pos3, b: LngLat | Pos3): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LngLat | Pos3, b: LngLat | Pos3): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(p: LngLat, bearing: number, distM: number): LngLat {
  const d = distM / R;
  const b = toRad(bearing);
  const lat1 = toRad(p[1]);
  const lng1 = toRad(p[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lng2), toDeg(lat2)];
}

// Local equirectangular projection (metres) — accurate enough across Greater London.
const LAT0 = 51.5;
const MX = 111320 * Math.cos(toRad(LAT0));
const MY = 110540;
export const toXY = (p: LngLat | Pos3): [number, number] => [p[0] * MX, p[1] * MY];
export const fromXY = (x: number, y: number): LngLat => [x / MX, y / MY];

/** Distance (m) from point p to segment ab, plus the closest point. */
export function pointSegment(p: LngLat, a: LngLat, b: LngLat): { dist: number; closest: LngLat; t: number } {
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), closest: fromXY(cx, cy), t };
}

export function pointInPolygon(p: LngLat, poly: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function circlePolygon(center: LngLat, radiusM: number, steps = 48): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) out.push(destination(center, (i / steps) * 360, radiusM));
  return out;
}

export function zonePolygon(z: Zone): LngLat[] {
  return z.shape.type === 'circle' ? circlePolygon(z.shape.center, z.shape.radiusM) : z.shape.coords;
}

/** Bounding circle used for avoidance maths. */
export function zoneCircle(z: Zone): { center: LngLat; radiusM: number } {
  if (z.shape.type === 'circle') return { center: z.shape.center, radiusM: z.shape.radiusM };
  const pts = z.shape.coords;
  const c: LngLat = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const r = Math.max(...pts.map((p) => distanceM(c, p)));
  return { center: c, radiusM: r };
}

export function pointInZone(p: LngLat, z: Zone): boolean {
  if (z.shape.type === 'circle') return distanceM(p, z.shape.center) <= z.shape.radiusM;
  return pointInPolygon(p, z.shape.coords);
}

export function cumulative(path: Pos3[]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const horiz = distanceM(path[i - 1], path[i]);
    const vert = Math.abs(path[i][2] - path[i - 1][2]);
    cum.push(cum[i - 1] + Math.hypot(horiz, vert));
  }
  return { cum, total: cum[cum.length - 1] };
}

export function positionAlong(path: Pos3[], cum: number[], m: number): { pos: Pos3; heading: number } {
  if (path.length === 1 || m <= 0) {
    return { pos: path[0], heading: path.length > 1 ? bearingDeg(path[0], path[1]) : 0 };
  }
  const total = cum[cum.length - 1];
  if (m >= total) {
    const n = path.length;
    return { pos: path[n - 1], heading: bearingDeg(path[n - 2], path[n - 1]) };
  }
  let i = 1;
  while (i < cum.length && cum[i] < m) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (m - cum[i - 1]) / segLen;
  const a = path[i - 1];
  const b = path[i];
  const pos: Pos3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const heading = distanceM(a, b) > 0.5 ? bearingDeg(a, b) : 0;
  return { pos, heading };
}

export function pathLengthKm(path: (LngLat | Pos3)[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1], path[i]);
  return m / 1000;
}

export const LONDON_CENTER: LngLat = [-0.1278, 51.5074];

/** Rough Greater London bounding check (keeps the demo inside London). */
export function inGreaterLondon(p: LngLat): boolean {
  return p[0] > -0.52 && p[0] < 0.34 && p[1] > 51.28 && p[1] < 51.7;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
