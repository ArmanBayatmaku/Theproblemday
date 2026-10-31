import type { Landmark, LngLat, Pos3, Zone } from './types';
import { distanceM, fromXY, pathLengthKm, pointInPolygon, pointInZone, pointSegment, toXY, zoneCircle } from './geo';
import { CONGESTION_ZONE } from './data/london';

export interface DronePlan {
  path: Pos3[];
  distanceKm: number;
  straightKm: number;
  blockedBy: Zone[]; // pickup or drop-off sits inside an active restriction
  avoided: string[]; // names of restrictions / obstacles routed around
}

interface Obstacle {
  name: string;
  center: LngLat;
  radiusM: number;
}

export const DRONE_CRUISE_M = 90;

/** Plans a drone flight: climb, cruise around restricted airspace and tall structures, descend. */
export function planDroneRoute(
  from: LngLat,
  to: LngLat,
  zones: Zone[],
  landmarks: Landmark[],
  cruiseM = DRONE_CRUISE_M,
): DronePlan {
  const active = zones.filter((z) => z.active);
  const blockedBy = active.filter((z) => pointInZone(from, z) || pointInZone(to, z));
  const obstacles: Obstacle[] = [
    ...active
      .filter((z) => !blockedBy.includes(z))
      .map((z) => ({ name: z.name, ...zoneCircle(z) })),
    ...landmarks
      .filter((l) => l.heightM > cruiseM - 30)
      .map((l) => ({ name: l.name, center: l.position, radiusM: Math.max(...l.footprintM) / 2 + 60 })),
  ];

  let pts: LngLat[] = [from, to];
  const avoided = new Set<string>();
  for (let guard = 0; guard < 24; guard++) {
    let changed = false;
    for (let i = 0; i < pts.length - 1 && !changed; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (const o of obstacles) {
        if (distanceM(a, o.center) < o.radiusM || distanceM(b, o.center) < o.radiusM) continue;
        const { dist, closest } = pointSegment(o.center, a, b);
        if (dist >= o.radiusM) continue;
        const [ox, oy] = toXY(o.center);
        let [cx, cy] = toXY(closest);
        let dx = cx - ox;
        let dy = cy - oy;
        let len = Math.hypot(dx, dy);
        if (len < 1) {
          const [ax, ay] = toXY(a);
          const [bx, by] = toXY(b);
          dx = -(by - ay);
          dy = bx - ax;
          len = Math.hypot(dx, dy) || 1;
        }
        const k = (o.radiusM * 1.3) / len;
        const w = fromXY(ox + dx * k, oy + dy * k);
        pts = [...pts.slice(0, i + 1), w, ...pts.slice(i + 1)];
        avoided.add(o.name);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  const path: Pos3[] = [
    [from[0], from[1], 0],
    [from[0], from[1], cruiseM],
    ...pts.slice(1, -1).map((p) => [p[0], p[1], cruiseM] as Pos3),
    [to[0], to[1], cruiseM],
    [to[0], to[1], 0],
  ];
  return {
    path,
    distanceKm: pathLengthKm(pts),
    straightKm: distanceM(from, to) / 1000,
    blockedBy,
    avoided: [...avoided],
  };
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Offline approximation of a road route: a gentle curve with London's typical circuity. */
export function approxRoadRoute(from: LngLat, to: LngLat): { path: Pos3[]; distanceKm: number } {
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
  const path: Pos3[] = [];
  const steps = Math.max(6, Math.min(24, Math.round(straight / 400)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx;
    const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by;
    const p = fromXY(x, y);
    path.push([p[0], p[1], 0]);
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

export function congestionChargeApplies(date: Date, from: LngLat, to: LngLat): boolean {
  if (!(inCongestionZone(from) || inCongestionZone(to))) return false;
  const day = date.getDay(); // 0 Sun
  const h = date.getHours() + date.getMinutes() / 60;
  const weekend = day === 0 || day === 6;
  return weekend ? h >= 12 && h < 18 : h >= 7 && h < 18;
}
