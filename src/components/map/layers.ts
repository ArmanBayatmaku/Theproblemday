import { LineLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { Asset, Job, Landmark, LngLat, Pos3, Site, Weather, Zone } from '@shared/types';
import { destination, positionAlong, zonePolygon } from '@shared/geo';
import { droneFlyability } from '@shared/weather';
import { KIND_COLOR, SITE_COLOR, ZONE_COLOR, hexToRgb, type RGB } from '@/lib/colors';
import type { LayerToggles } from '@/store/useStore';

export interface FocusPoint {
  position: LngLat;
  label: string;
  color: RGB;
}

export interface LayerInput {
  variant: 'full' | 'overview' | 'mini';
  assets: Asset[];
  jobs: Job[];
  sites: Site[];
  zones: Zone[];
  landmarks: Landmark[];
  weather: Weather;
  selection: Set<string>;
  is3d: boolean;
  toggles: LayerToggles;
  now: number;
  focusRoute?: Pos3[];
  focusPoints?: FocusPoint[];
}

const zoneCache = new Map<string, LngLat[]>();
const polyFor = (z: Zone) => {
  const key = `${z.id}:${JSON.stringify(z.shape)}`;
  if (!zoneCache.has(key)) zoneCache.set(key, zonePolygon(z));
  return zoneCache.get(key)!;
};

const rect = (c: LngLat, w: number, d: number): LngLat[] => {
  const n = destination(c, 0, d / 2);
  const s = destination(c, 180, d / 2);
  const e = destination(c, 90, w / 2)[0];
  const wl = destination(c, 270, w / 2)[0];
  return [[wl, s[1]], [e, s[1]], [e, n[1]], [wl, n[1]], [wl, s[1]]];
};

/** ETA colour ramp for overview bubbles (mint → teal → blue → navy). */
export function etaColor(min: number): RGB {
  const stops: [number, RGB][] = [
    [0, [143, 214, 160]],
    [10, [79, 184, 196]],
    [20, [61, 127, 209]],
    [32, [52, 82, 170]],
  ];
  if (min <= 0) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (min <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (min - a) / (b - a);
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t)) as RGB;
    }
  }
  return stops[stops.length - 1][1];
}

function remaining(a: Asset): Pos3[] | undefined {
  const r = a.route;
  if (!r) return undefined;
  const { pos } = positionAlong(r.path, r.cum, r.progressM);
  let i = 1;
  while (i < r.cum.length && r.cum[i] <= r.progressM) i++;
  return [pos, ...r.path.slice(i)];
}

export function buildLayers(inp: LayerInput): Layer[] {
  const { assets, sites, zones, landmarks, weather, selection, is3d, toggles, variant } = inp;
  const layers: Layer[] = [];
  const z3 = (p: LngLat, alt: number): Pos3 => [p[0], p[1], is3d ? alt : 0];

  // ---- airspace ----
  if (toggles.zones) {
    const active = zones.filter((z) => z.active);
    layers.push(
      new PolygonLayer<Zone>({
        id: 'zones',
        data: active,
        getPolygon: (z) => polyFor(z),
        extruded: is3d,
        wireframe: is3d,
        getElevation: (z) => Math.min(z.ceilingM, 420),
        filled: true,
        stroked: !is3d,
        getFillColor: (z) => [...hexToRgb(ZONE_COLOR[z.kind]), variant === 'overview' ? 16 : is3d ? 26 : 30] as any,
        getLineColor: (z) => [...hexToRgb(ZONE_COLOR[z.kind]), is3d ? 120 : 190] as any,
        lineWidthMinPixels: 1.2,
        pickable: variant === 'full',
        updateTriggers: { getFillColor: [is3d, variant] },
        parameters: { depthWriteEnabled: false } as any,
      }),
    );
  }

  // ---- skyline (approximate tall buildings, always available offline) ----
  if (is3d && toggles.skyline) {
    layers.push(
      new PolygonLayer<Landmark>({
        id: 'landmarks',
        data: landmarks,
        getPolygon: (l) => rect(l.position, l.footprintM[0], l.footprintM[1]),
        extruded: true,
        getElevation: (l) => l.heightM,
        getFillColor: [104, 118, 136, 235],
        getLineColor: [160, 175, 190, 255],
        material: { ambient: 0.55, diffuse: 0.6, shininess: 24 } as any,
        pickable: true,
      }),
    );
  }

  // ---- sites ----
  if (toggles.sites) {
    layers.push(
      new ScatterplotLayer<Site>({
        id: 'sites',
        data: sites,
        getPosition: (s) => [s.position[0], s.position[1], 0],
        getRadius: variant === 'overview' ? 4 : 7,
        radiusUnits: 'pixels',
        getFillColor: (s) => [...hexToRgb(SITE_COLOR[s.kind]), 255] as any,
        getLineColor: [20, 23, 27, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        pickable: true,
      }),
    );
    if (toggles.labels && variant === 'full') {
      layers.push(
        new TextLayer<Site>({
          id: 'site-labels',
          data: sites,
          getPosition: (s) => [s.position[0], s.position[1], 0],
          getText: (s) => s.name.replace(/^(FreshCo|Hive)\s+/, ''),
          getSize: 11,
          getColor: [200, 206, 212, 255],
          getPixelOffset: [0, -16],
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          background: true,
          getBackgroundColor: [20, 23, 27, 200],
          backgroundPadding: [4, 2, 4, 2],
          characterSet: 'auto',
        }),
      );
    }
  }

  const visible = assets.filter((a) => toggles.assets && (a.ownership !== 'external' || toggles.external));

  // ---- overview bubbles (ETA coloured) ----
  if (variant === 'overview') {
    const live = inp.jobs.filter((j) => ['to_pickup', 'loading', 'in_transit'].includes(j.status) && j.assetId);
    const data = live
      .map((j) => {
        const a = assets.find((x) => x.id === j.assetId);
        if (!a) return undefined;
        return { j, a, eta: Math.max(0, ((j.etaAt ?? inp.now) - inp.now) / 60_000) };
      })
      .filter(Boolean) as { j: Job; a: Asset; eta: number }[];
    layers.push(
      new ScatterplotLayer<Asset>({
        id: 'idle-dots',
        data: visible.filter((a) => !a.currentJobId && a.ownership !== 'external'),
        getPosition: (a) => [a.position[0], a.position[1], 0],
        getRadius: 2.5,
        radiusUnits: 'pixels',
        getFillColor: [150, 160, 170, 140],
      }),
      new ScatterplotLayer<{ j: Job; a: Asset; eta: number }>({
        id: 'bubbles',
        data,
        getPosition: (d) => [d.a.position[0], d.a.position[1], 0],
        getRadius: (d) => (d.a.kind === 'drone' ? 420 : d.a.kind === 'truck' ? 700 : 560),
        radiusUnits: 'meters',
        radiusMinPixels: 7,
        getFillColor: (d) => [...etaColor(d.eta), 120] as any,
        getLineColor: (d) => [...etaColor(d.eta), 230] as any,
        lineWidthMinPixels: 1.2,
        stroked: true,
        pickable: true,
      }),
    );
    return layers;
  }

  // ---- routes ----
  if (toggles.routes) {
    const routed = visible.filter((a) => a.route && (a.currentJobId || a.currentTaskId || ['return', 'goto', 'task'].includes(a.route.purpose)));
    layers.push(
      new PathLayer<Asset>({
        id: 'routes',
        data: routed,
        getPath: (a) => (remaining(a) ?? []).map((p) => z3([p[0], p[1]], p[2])) as any,
        getColor: (a) => [...hexToRgb(KIND_COLOR[a.kind]), selection.has(a.id) ? 255 : a.ownership === 'external' ? 120 : 170] as any,
        getWidth: (a) => (selection.has(a.id) ? 4 : 2.2),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getColor: [selection.size, [...selection].join()], getWidth: [[...selection].join()], getPath: [is3d] },
      }),
    );
  }

  if (inp.focusRoute) {
    layers.push(
      new PathLayer<{ path: Pos3[] }>({
        id: 'focus-route',
        data: [{ path: inp.focusRoute }],
        getPath: (d) => d.path.map((p) => z3([p[0], p[1]], p[2])) as any,
        getColor: [255, 255, 255, 235],
        getWidth: 4,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getPath: [is3d] },
      }),
    );
  }
  if (inp.focusPoints?.length) {
    layers.push(
      new ScatterplotLayer<FocusPoint>({
        id: 'focus-points',
        data: inp.focusPoints,
        getPosition: (p) => [p.position[0], p.position[1], 0],
        getRadius: 8,
        radiusUnits: 'pixels',
        getFillColor: (p) => [...p.color, 255] as any,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        stroked: true,
      }),
      new TextLayer<FocusPoint>({
        id: 'focus-labels',
        data: inp.focusPoints,
        getPosition: (p) => [p.position[0], p.position[1], 0],
        getText: (p) => p.label,
        getSize: 12,
        getColor: [240, 242, 245, 255],
        getPixelOffset: [0, -18],
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        background: true,
        getBackgroundColor: [18, 20, 24, 220],
        backgroundPadding: [5, 3, 5, 3],
        characterSet: 'auto',
      }),
    );
  }

  // ---- drone altitude stalks ----
  if (is3d) {
    layers.push(
      new LineLayer<Asset>({
        id: 'stalks',
        data: visible.filter((a) => a.kind === 'drone' && a.altitude > 3),
        getSourcePosition: (a) => [a.position[0], a.position[1], 0],
        getTargetPosition: (a) => [a.position[0], a.position[1], a.altitude],
        getColor: [139, 212, 80, 110],
        getWidth: 1.2,
      }),
    );
  }

  // ---- machines ----
  const radius = (a: Asset) => (a.ownership === 'external' ? 4.5 : ['amr', 'humanoid', 'robot_arm', 'sidewalk_robot'].includes(a.kind) ? 4.8 : 6.2);
  layers.push(
    new ScatterplotLayer<Asset>({
      id: 'assets',
      data: visible,
      getPosition: (a) => z3(a.position, a.altitude),
      getRadius: radius,
      radiusUnits: 'pixels',
      getFillColor: (a) => {
        if (a.status === 'estop') return [236, 91, 91, 255];
        if (a.status === 'offline') return [108, 116, 125, 220];
        return [...hexToRgb(KIND_COLOR[a.kind]), a.ownership === 'external' ? 150 : 255] as any;
      },
      getLineColor: (a) => (selection.has(a.id) ? [255, 255, 255, 255] : a.status === 'paused' || a.status === 'holding' ? [240, 163, 58, 255] : [16, 18, 22, 230]),
      getLineWidth: (a) => (selection.has(a.id) ? 2.5 : 1.2),
      lineWidthUnits: 'pixels',
      stroked: true,
      pickable: true,
      updateTriggers: { getLineColor: [[...selection].join()], getLineWidth: [[...selection].join()], getPosition: [is3d] },
      transitions: { getPosition: 450 },
    }),
  );
  if (selection.size) {
    layers.push(
      new ScatterplotLayer<Asset>({
        id: 'selection-halo',
        data: visible.filter((a) => selection.has(a.id)),
        getPosition: (a) => z3(a.position, a.altitude),
        getRadius: 13,
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 150],
        lineWidthMinPixels: 1.5,
        updateTriggers: { getPosition: [is3d] },
      }),
    );
  }
  if (toggles.labels) {
    const labelled = visible.filter((a) => selection.has(a.id) || (is3d && a.kind === 'drone' && a.altitude > 3));
    layers.push(
      new TextLayer<Asset>({
        id: 'asset-labels',
        data: labelled,
        getPosition: (a) => z3(a.position, a.altitude),
        getText: (a) => (is3d && a.kind === 'drone' ? `${a.id} · ${Math.round(a.altitude)} m` : a.id),
        getSize: 11,
        getColor: [235, 238, 241, 255],
        getPixelOffset: [0, -15],
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
        background: true,
        getBackgroundColor: [18, 20, 24, 210],
        backgroundPadding: [4, 2, 4, 2],
        characterSet: 'auto',
        updateTriggers: { getText: [is3d], getPosition: [is3d] },
      }),
    );
  }

  // ---- wind field ----
  if (toggles.wind) {
    const fly = droneFlyability(weather, { maxWindMs: 12 }).status;
    const col: RGB = fly === 'no_go' ? [236, 91, 91] : fly === 'caution' ? [240, 163, 58] : [143, 214, 160];
    const toward = (weather.windDirDeg + 180) % 360;
    const grid: { from: LngLat; to: LngLat; l: LngLat; r: LngLat }[] = [];
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 6; j++) {
        const from: LngLat = [-0.43 + i * 0.075, 51.38 + j * 0.05];
        const len = 500 + weather.windMs120 * 140;
        const to = destination(from, toward, len);
        grid.push({ from, to, l: destination(to, toward + 150, len * 0.28), r: destination(to, toward - 150, len * 0.28) });
      }
    }
    const segs = grid.flatMap((g) => [
      { s: g.from, t: g.to },
      { s: g.to, t: g.l },
      { s: g.to, t: g.r },
    ]);
    layers.push(
      new LineLayer<{ s: LngLat; t: LngLat }>({
        id: 'wind',
        data: segs,
        getSourcePosition: (d) => [d.s[0], d.s[1], is3d ? 120 : 0],
        getTargetPosition: (d) => [d.t[0], d.t[1], is3d ? 120 : 0],
        getColor: [...col, 170] as any,
        getWidth: 1.6,
        updateTriggers: { getSourcePosition: [is3d, weather.windDirDeg], getTargetPosition: [is3d, weather.windDirDeg] },
      }),
    );
  }

  return layers;
}
