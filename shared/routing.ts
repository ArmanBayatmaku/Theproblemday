import type { Landmark, LngLat, Pos3, Zone } from './types';
import { distanceM, fromXY, pointInPolygon, pointInZone, toXY, zoneCircle } from './geo';
import { CONGESTION_ZONE } from './data/london';

export const DRONE_CRUISE_M = 90;

export interface Avoided {
  id: string;
  name: string;
  kind: 'zone' | 'building';
}

export interface DronePlan {
  /** Ground → cruise height → ground, following `route`. */
  path: Pos3[];
  /** The flight line seen from above. */
  route: LngLat[];
  distanceKm: number;
  straightKm: number;
  detourKm: number;
  /** Active restrictions the pickup or drop-off sits inside (the drone cannot go there). */
  blockedBy: Zone[];
  /** What the straight line would have crossed, so the flight goes around it. */
  avoided: Avoided[];
}

type XY = [number, number];

interface Obstacle extends Avoided {
  c: XY;
  /** Radius of the restriction itself (m). */
  r0: number;
  /** Keep-out radius the flight line must stay outside (restriction + safety margin). */
  r: number;
}

/** Points per ring when walking around an obstacle — enough for the line to look like an arc. */
const RING = 40;

const hypot = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distance from point p to segment ab (all in metres). */
function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const clear = (a: XY, b: XY, o: Obstacle, r = o.r) => segDist(o.c, a, b) >= r - 1e-6;

/**
 * Shortest flight line from a to b that stays outside every obstacle: a visibility graph over
 * points spaced around each keep-out circle, searched with Dijkstra. Returns undefined if boxed in.
 */
function shortestAround(a: XY, b: XY, obstacles: Obstacle[]): XY[] | undefined {
  const nodes: XY[] = [a, b];
  for (const o of obstacles) {
    const R = o.r / Math.cos(Math.PI / RING) + 0.5; // chords between neighbours stay outside r
    for (let k = 0; k < RING; k++) {
      const ang = (2 * Math.PI * k) / RING;
      const p: XY = [o.c[0] + R * Math.cos(ang), o.c[1] + R * Math.sin(ang)];
      if (obstacles.every((q) => q === o || hypot(p, q.c) >= q.r)) nodes.push(p);
    }
  }
  const n = nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      // A*: straight-line distance to b keeps the search tight.
      const f = dist[i] + hypot(nodes[i], b);
      if (f < best) {
        best = f;
        u = i;
      }
    }
    if (u === -1 || dist[u] === Infinity) return undefined;
    if (u === 1) break;
    done[u] = 1;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = dist[u] + hypot(nodes[u], nodes[v]);
      if (d >= dist[v]) continue;
      if (obstacles.every((o) => clear(nodes[u], nodes[v], o))) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const out: XY[] = [];
  for (let i = 1; i !== -1; i = prev[i]) out.push(nodes[i]);
  return out.reverse();
}

/** Plans a drone flight: climb, cruise around restricted airspace and tall buildings, descend. */
export function planDroneRoute(from: LngLat, to: LngLat, zones: Zone[], landmarks: Landmark[], cruiseM = DRONE_CRUISE_M): DronePlan {
  const active = zones.filter((z) => z.active);
  const blockedBy = active.filter((z) => pointInZone(from, z) || pointInZone(to, z));
  const A = toXY(from);
  const B = toXY(to);

  const candidates: Obstacle[] = [
    ...active
      .filter((z) => !blockedBy.includes(z))
      .map((z) => {
        const { center, radiusM } = zoneCircle(z);
        return { id: z.id, name: z.name, kind: 'zone' as const, c: toXY(center), r0: radiusM, r: radiusM + Math.max(80, radiusM * 0.07) };
      }),
    ...landmarks
      .filter((l) => l.heightM > cruiseM - 30)
      .map((l) => {
        const r0 = Math.max(...l.footprintM) / 2 + 30;
        return { id: l.id, name: l.name, kind: 'building' as const, c: toXY(l.position), r0, r: r0 + 50 };
      }),
  ];
  const obstacles: Obstacle[] = [];
  for (const o of candidates) {
    const near = Math.min(hypot(A, o.c), hypot(B, o.c));
    if (near <= o.r0) continue; // the stop itself is at this building — nothing to avoid
    if (near < o.r) o.r = Math.max(o.r0, near - 1); // stop sits in the safety margin: tighten it
    obstacles.push(o);
  }

  const straightKm = distanceM(from, to) / 1000;
  const crossed = obstacles.filter((o) => !clear(A, B, o, o.r0));
  let line: XY[] = [A, B];
  let used = obstacles.filter((o) => !clear(A, B, o));
  for (let guard = 0; used.length && guard < 8; guard++) {
    const found = shortestAround(A, B, used);
    if (!found) break;
    line = found;
    const extra = obstacles.filter((o) => !used.includes(o) && line.some((p, i) => i > 0 && !clear(line[i - 1], p, o)));
    if (!extra.length) break;
    used = [...used, ...extra];
  }

  const route = line.map((p) => fromXY(p[0], p[1]));
  route[0] = from;
  route[route.length - 1] = to;
  let m = 0;
  for (let i = 1; i < line.length; i++) m += hypot(line[i - 1], line[i]);
  const distanceKm = m / 1000;
  const path: Pos3[] = [
    [from[0], from[1], 0],
    ...route.map((p) => [p[0], p[1], cruiseM] as Pos3),
    [to[0], to[1], 0],
  ];
  return {
    path,
    route,
    distanceKm,
    straightKm,
    detourKm: Math.max(0, distanceKm - straightKm),
    blockedBy,
    avoided: crossed.map(({ id, name, kind }) => ({ id, name, kind })),
  };
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Offline approximation of a road route: a gentle curve with London's typical circuity. */
export function approxRoadRoute(from: LngLat, to: LngLat): { path: LngLat[]; distanceKm: number } {
  const straight = distanceM(from, to);
  const [ax, ay] = toXY(from);
  const [bx, by] = toXY(to);
  const sign = hash(`${from.join()}${to.join()}`) % 2 ? 1 : -1;
  const nx = -(by - ay);
  const ny = bx - ax;
  const nlen = Math.hypot(nx, ny) || 1;
  const off = Math.min(straight * 0.12, 1500) * sign;
  const mx = (ax + bx) / 2 + (nx / nlen) * off;
  const my = (ay + by) / 2 + (ny / nlen) * off;
  const path: LngLat[] = [];
  const steps = Math.max(6, Math.min(24, Math.round(straight / 400)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx;
    const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by;
    path.push(fromXY(x, y));
  }
  return { path, distanceKm: (straight / 1000) * 1.35 };
}

export function inCongestionZone(p: LngLat): boolean {
  return pointInPolygon(p, CONGESTION_ZONE);
}

/** Typical London road speeds (km/h) by area and time of day. */
export function roadSpeedKmh(from: LngLat, to: LngLat, date: Date): number {
  const h = date.getHours();
  const peak = (h >= 7 && h < 10) || (h >= 16 && h < 19);
  const night = h >= 22 || h < 6;
  const central = inCongestionZone(from) || inCongestionZone(to);
  if (night) return central ? 26 : 34;
  if (central) return peak ? 12 : 16;
  return peak ? 19 : 25;
}
