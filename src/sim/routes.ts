import type { ActiveRoute, Asset, Landmark, LngLat, Pos3, Zone } from '@shared/types';
import { cumulative, destination, distanceM } from '@shared/geo';
import { approxRoadRoute, planDroneRoute, roadSpeedKmh } from '@shared/routing';

export const INDOOR_KINDS = ['amr', 'humanoid', 'robot_arm'] as const;
export const isIndoor = (a: Pick<Asset, 'kind'>) => (INDOOR_KINDS as readonly string[]).includes(a.kind);

export interface RouteCtx {
  now: number;
  zones: Zone[];
  landmarks: Landmark[];
  geofence: boolean;
}

export function cruiseSpeedKmh(a: Asset, from: LngLat, to: LngLat, now: number): number {
  switch (a.kind) {
    case 'drone':
      return Math.min(a.speedLimitKmh ?? 999, 55);
    case 'cargo_bike':
      return 16;
    case 'sidewalk_robot':
      return Math.min(a.speedLimitKmh ?? 999, 6);
    case 'humanoid':
      return 4;
    case 'amr':
      return Math.min(a.speedLimitKmh ?? 999, 6);
    case 'robot_arm':
      return 0;
    default:
      return roadSpeedKmh(from, to, new Date(now)) * (a.kind === 'truck' ? 0.9 : 1);
  }
}

/** Builds a route for an asset; returns an error string when airspace rules forbid it. */
export function buildRoute(
  a: Asset,
  to: LngLat,
  purpose: ActiveRoute['purpose'],
  ctx: RouteCtx,
  refId?: string,
  preset?: Pos3[],
): { route?: ActiveRoute; speedKmh: number; error?: string } {
  let path: Pos3[];
  if (a.kind === 'drone') {
    const plan = planDroneRoute(a.position, to, ctx.zones, ctx.landmarks);
    if (ctx.geofence && plan.blockedBy.length && purpose === 'goto') {
      return { speedKmh: 0, error: `Target is inside ${plan.blockedBy[0].name}` };
    }
    path = preset && distanceM(preset[0], a.position) < 80 ? preset : plan.path;
    if (a.altitude > 5) path = [[a.position[0], a.position[1], a.altitude], ...path.slice(1)];
    if (purpose === 'goto') path = path.slice(0, -1); // hover at cruise height on arrival
  } else if (isIndoor(a)) {
    path = [
      [a.position[0], a.position[1], 0],
      [to[0], to[1], 0],
    ];
  } else {
    path = preset && distanceM(preset[0], a.position) < 150 ? preset : approxRoadRoute(a.position, to).path;
    path = [[a.position[0], a.position[1], 0], ...path.slice(1)];
  }
  const { cum, total } = cumulative(path);
  return {
    route: { path, cum, totalM: total, progressM: 0, purpose, refId },
    speedKmh: cruiseSpeedKmh(a, a.position, to, ctx.now),
  };
}

/** A small wander inside a site footprint (indoor robots). */
export function jitterAround(center: LngLat, seed: number, radiusM = 35): LngLat {
  return destination(center, (seed * 137.5) % 360, ((seed * 7919) % 1000) / 1000 * radiusM);
}
