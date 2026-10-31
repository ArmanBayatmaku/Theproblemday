import { useEffect, useRef, useState, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { PickingInfo } from '@deck.gl/core';
import clsx from 'clsx';
import { Box, Crosshair, Layers, LocateFixed, Minus, Plus, SquareDashedMousePointer, Wind, Navigation } from 'lucide-react';
import type { Asset, Landmark, LngLat, Pos3, Site, Zone } from '@shared/types';
import { LONDON_CENTER } from '@shared/geo';
import { droneFlyability, effectiveWindMs } from '@shared/weather';
import { useStore, type LayerToggles } from '@/store/useStore';
import { buildLayers, type FocusPoint } from './layers';
import { streetStyle, stylizedStyle } from './styles';
import { KIND_COLOR, KIND_LABEL, SITE_LABEL, STATUS_COLOR, ZONE_COLOR, ZONE_LABEL } from '@/lib/colors';
import { Segmented, Toggle } from '@/components/ui';
import { titleCase } from '@/lib/format';

type Variant = 'full' | 'overview' | 'mini';

interface Props {
  variant?: Variant;
  className?: string;
  focusRoute?: Pos3[];
  focusPoints?: FocusPoint[];
  pickMode?: boolean;
  onPick?: (p: LngLat) => void;
  fitTo?: LngLat[];
  children?: ReactNode;
}

const FLY_TO: { label: string; center: LngLat; zoom: number; pitch?: number; bearing?: number }[] = [
  { label: 'All London', center: LONDON_CENTER, zoom: 10.3 },
  { label: 'City skyline', center: [-0.0835, 51.5115], zoom: 14.6, pitch: 62, bearing: -28 },
  { label: 'Canary Wharf', center: [-0.0195, 51.5045], zoom: 14.8, pitch: 60, bearing: 25 },
  { label: 'Westminster', center: [-0.125, 51.5005], zoom: 14.6, pitch: 55, bearing: -15 },
  { label: 'Nine Elms port', center: [-0.1335, 51.4818], zoom: 14.8, pitch: 55, bearing: 10 },
  { label: 'Heathrow FRZ', center: [-0.4543, 51.47], zoom: 11.4, pitch: 45 },
];

function tooltip(info: PickingInfo, now: number): { html: string } | null {
  const o = info.object as any;
  if (!o) return null;
  const id = info.layer?.id;
  if (id === 'assets') {
    const a = o as Asset;
    return {
      html: `<div style="font-weight:700">${a.id} · ${a.name}</div><div style="color:#9aa2ab">${a.model}</div>
      <div style="margin-top:4px"><span style="color:${STATUS_COLOR[a.status]}">● ${titleCase(a.status)}</span> · ${Math.round(a.battery)}%${a.altitude > 3 ? ` · ${Math.round(a.altitude)} m` : ''}${a.speedKmh ? ` · ${Math.round(a.speedKmh)} km/h` : ''}</div>
      ${a.currentJobId ? `<div>Job ${a.currentJobId}</div>` : ''}${a.currentTaskId ? `<div>Task ${a.currentTaskId}</div>` : ''}
      ${a.ownership === 'external' ? '<div style="color:#9aa2ab">Marketplace vehicle (simulated)</div>' : ''}`,
    };
  }
  if (id === 'sites') {
    const s = o as Site;
    return { html: `<div style="font-weight:700">${s.name}</div><div style="color:#9aa2ab">${SITE_LABEL[s.kind]} · ${s.address}</div>` };
  }
  if (id === 'zones') {
    const z = o as Zone;
    return {
      html: `<div style="font-weight:700;color:${ZONE_COLOR[z.kind]}">${z.name}</div><div style="color:#9aa2ab">${ZONE_LABEL[z.kind]} · up to ${z.ceilingM} m${z.activeHours ? ` · ${z.activeHours}` : ''}</div>${z.note ? `<div style="margin-top:3px">${z.note}</div>` : ''}<div style="margin-top:3px;color:#6c747d">Illustrative — not for real flight planning</div>`,
    };
  }
  if (id === 'landmarks') {
    const l = o as Landmark;
    return { html: `<div style="font-weight:700">${l.name}</div><div style="color:#9aa2ab">~${l.heightM} m · drone obstacle</div>` };
  }
  if (id === 'bubbles') {
    const d = o as { j: { id: string; pickup: { name: string }; dropoff: { name: string }; option: { providerName: string } }; a: Asset; eta: number };
    return { html: `<div style="font-weight:700">${d.j.id} · ${d.a.id}</div><div style="color:#9aa2ab">${d.j.pickup.name} → ${d.j.dropoff.name}</div><div>${d.j.option.providerName} · ETA ${Math.round(d.eta)} min</div>` };
  }
  return null;
}

export function FleetMap({ variant = 'full', className, focusRoute, focusPoints, pickMode, onPick, fitTo, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const propsRef = useRef({ focusRoute, focusPoints, pickMode, onPick });
  propsRef.current = { focusRoute, focusPoints, pickMode, onPick };
  const [ready, setReady] = useState(false);
  const [tilesOk, setTilesOk] = useState<boolean | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [panel, setPanel] = useState<'layers' | 'fly' | null>(null);
  const is3d = useStore((s) => (variant === 'full' ? s.map.is3d : false));
  const lastFollow = useRef(0);

  const render = () => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    if (!overlay || !map) return;
    const s = useStore.getState();
    const p = propsRef.current;
    const threeD = variant === 'full' ? s.map.is3d : false;
    const toggles: LayerToggles =
      variant === 'overview'
        ? { ...s.map.layers, labels: false, routes: false, wind: false, external: false, zones: false }
        : variant === 'mini'
          ? { ...s.map.layers, wind: false, external: false, labels: true }
          : s.map.layers;
    overlay.setProps({
      layers: buildLayers({
        variant,
        assets: s.assets,
        jobs: s.jobs,
        sites: s.sites,
        zones: s.zones,
        landmarks: s.landmarks,
        weather: s.weather(),
        selection: new Set(s.selection),
        is3d: threeD,
        toggles,
        now: s.sim.now,
        focusRoute: p.focusRoute,
        focusPoints: p.focusPoints,
      }),
    });
    if (variant === 'full' && s.map.follow && s.selection.length === 1 && Date.now() - lastFollow.current > 800) {
      const a = s.assets.find((x) => x.id === s.selection[0]);
      if (a) {
        lastFollow.current = Date.now();
        map.easeTo({ center: a.position, duration: 800 });
      }
    }
  };

  // ---- create map ----
  useEffect(() => {
    if (!wrapRef.current) return;
    const container = wrapRef.current.querySelector('.map-canvas') as HTMLDivElement;
    const map = new maplibregl.Map({
      container,
      style: variant === 'overview' ? stylizedStyle() : streetStyle(),
      center: variant === 'overview' ? [-0.12, 51.495] : LONDON_CENTER,
      zoom: variant === 'overview' ? 9.75 : variant === 'mini' ? 11 : 10.9,
      attributionControl: variant === 'overview' ? false : { compact: true },
      maxBounds: [
        [-0.85, 51.18],
        [0.55, 51.8],
      ],
      maxPitch: 75,
    });
    map.boxZoom.disable();
    if (variant === 'overview') map.scrollZoom.disable();
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: (info) => tooltip(info, useStore.getState().sim.now),
      onClick: (info, ev) => {
        const p = propsRef.current;
        if (p.pickMode && info.coordinate) {
          p.onPick?.([info.coordinate[0], info.coordinate[1]]);
          return;
        }
        const st = useStore.getState();
        if (info.layer?.id === 'assets' && info.object) {
          st.toggleSelect((info.object as Asset).id, !!(ev as any)?.srcEvent?.shiftKey);
        } else if (!info.object && variant === 'full') {
          st.setSelection([]);
        }
      },
    });
    map.addControl(overlay as unknown as maplibregl.IControl);
    mapRef.current = map;
    overlayRef.current = overlay;
    let isReady = false;
    const markReady = () => {
      if (isReady) return;
      isReady = true;
      setReady(true);
      render();
    };
    map.on('load', markReady);
    let gotTile = false;
    map.on('sourcedata', (e: any) => {
      if (!gotTile && e.sourceId === 'openmaptiles' && e.tile) {
        gotTile = true;
        setTilesOk(true);
      }
    });
    // Offline (no internet / tiles blocked): drop the remote source so the bundled London map
    // still loads, instead of waiting forever for tiles.
    let offline = false;
    const goOffline = () => {
      if (offline || gotTile || !map.getStyle()) return;
      offline = true;
      setTilesOk(false);
      for (const l of map.getStyle().layers ?? []) if ((l as { source?: string }).source === 'openmaptiles') map.removeLayer(l.id);
      if (map.getSource('openmaptiles')) map.removeSource('openmaptiles');
      window.setTimeout(markReady, 400);
    };
    map.on('error', (e: any) => {
      const msg = String(e?.error?.message ?? e?.message ?? '');
      if (e?.sourceId === 'openmaptiles' || /openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg)) goOffline();
    });
    const t = window.setTimeout(() => {
      if (variant === 'overview' || gotTile) return;
      setTilesOk(false);
      markReady(); // slow network: show the UI now, real tiles replace the fallback when they arrive
    }, 7000);
    const ro = new ResizeObserver(() => {
      map.resize();
      setNarrow(container.clientWidth < 900);
    });
    ro.observe(container);
    const unsub = useStore.subscribe(render);
    return () => {
      unsub();
      ro.disconnect();
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  useEffect(render, [focusRoute, focusPoints, ready]);

  // ---- 3D toggle ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || variant !== 'full') return;
    if (is3d && map.getZoom() < 13.2) {
      // Zoomed out: fly to the City so the skyline is visible straight away.
      map.flyTo({ center: [-0.0835, 51.5115], zoom: 14.6, pitch: 62, bearing: -28, duration: 1600 });
    } else {
      map.easeTo({ pitch: is3d ? 60 : 0, bearing: is3d ? -20 : 0, duration: 1100 });
    }
    if (map.getLayer('building-3d')) {
      map.setLayoutProperty('building-3d', 'visibility', is3d ? 'visible' : 'none');
      map.setLayoutProperty('building', 'visibility', is3d ? 'none' : 'visible');
    }
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is3d, ready]);

  // ---- hide offline fallback when real tiles load ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || variant === 'overview' || !tilesOk) return;
    if (map.getLayer('fallback-thames')) map.setLayoutProperty('fallback-thames', 'visibility', 'none');
    if (map.getLayer('boroughs-fill')) map.setPaintProperty('boroughs-fill', 'fill-color', '#202328');
    if (map.getLayer('boroughs-line')) map.setPaintProperty('boroughs-line', 'line-color', '#2b3036');
  }, [tilesOk, ready, variant]);

  // ---- fit to points (quote previews) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitTo?.length) return;
    const b = new maplibregl.LngLatBounds(fitTo[0], fitTo[0]);
    fitTo.forEach((p) => b.extend(p));
    map.fitBounds(b, { padding: 70, duration: 700, maxZoom: 14.5 });
  }, [ready, JSON.stringify(fitTo)]);

  // ---- shift = temporary box-select ----
  useEffect(() => {
    if (variant !== 'full') return;
    const down = (e: KeyboardEvent) => e.key === 'Shift' && setShiftHeld(true);
    const up = (e: KeyboardEvent) => e.key === 'Shift' && setShiftHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [variant]);

  const selecting = variant === 'full' && (selectMode || shiftHeld) && !pickMode;

  const finishBox = (additive: boolean) => {
    const map = mapRef.current;
    if (!map || !box) return;
    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);
    const s = useStore.getState();
    // Box selection picks your own and network machines; marketplace vehicles are selected by clicking them.
    const candidates = s.assets.filter((a) => s.map.layers.assets && a.ownership !== 'external');
    let ids: string[];
    if (x1 - x0 < 4 && y1 - y0 < 4) {
      // simple click in select mode → nearest machine within 14 px
      const hit = candidates
        .map((a) => ({ a, p: map.project(a.position) }))
        .map((o) => ({ ...o, d: Math.hypot(o.p.x - x0, o.p.y - y0) }))
        .filter((o) => o.d < 14)
        .sort((u, v) => u.d - v.d)[0];
      ids = hit ? [hit.a.id] : [];
    } else {
      ids = candidates
        .filter((a) => {
          const p = map.project(a.position);
          return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        })
        .map((a) => a.id);
    }
    s.setSelection(additive ? [...s.selection, ...ids] : ids);
    setBox(null);
  };

  const s = useStore();
  const weather = s.weather();
  const map = mapRef.current;

  return (
    <div ref={wrapRef} className={clsx(!/\b(absolute|fixed)\b/.test(className ?? '') && 'relative', 'overflow-hidden', className)}>
      <div className={clsx('map-canvas', pickMode && 'cursor-crosshair')} style={{ position: 'absolute', inset: 0 }} />

      {selecting && (
        <div
          className="absolute inset-0 z-10 cursor-crosshair select-none"
          onPointerDown={(e) => {
            e.preventDefault();
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            setBox({ x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
          }}
          onPointerMove={(e) => {
            if (!box) return;
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            setBox({ ...box, x1: e.clientX - r.left, y1: e.clientY - r.top });
          }}
          onPointerUp={(e) => finishBox(e.shiftKey && !selectMode ? true : e.shiftKey)}
        >
          {box && (
            <div
              className="absolute border border-blue bg-blue/10 rounded-sm"
              style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
            />
          )}
        </div>
      )}

      {variant === 'full' && ready && (
        <>
          <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Segmented
                value={s.map.is3d ? '3d' : '2d'}
                onChange={(v) => s.setMap({ is3d: v === '3d' })}
                options={[
                  { value: '2d', label: '2D' },
                  { value: '3d', label: <span className="inline-flex items-center gap-1"><Box size={12} />3D</span> },
                ]}
              />
              <MapBtn active={selectMode} title="Box select (or hold Shift and drag)" onClick={() => setSelectMode(!selectMode)}>
                <SquareDashedMousePointer size={16} />
              </MapBtn>
              <MapBtn active={panel === 'layers'} title="Layers" onClick={() => setPanel(panel === 'layers' ? null : 'layers')}>
                <Layers size={16} />
              </MapBtn>
              <MapBtn active={panel === 'fly'} title="Fly to" onClick={() => setPanel(panel === 'fly' ? null : 'fly')}>
                <Navigation size={16} />
              </MapBtn>
              <MapBtn active={s.map.follow} title="Follow selected" onClick={() => s.setMap({ follow: !s.map.follow })}>
                <LocateFixed size={16} />
              </MapBtn>
            </div>
            {panel === 'layers' && (
              <div className="card w-60 p-3.5 space-y-2.5 shadow-xl fade-in">
                {(
                  [
                    ['assets', 'Machines'],
                    ['external', 'Marketplace vehicles'],
                    ['routes', 'Routes'],
                    ['sites', 'Locations'],
                    ['zones', 'No-fly zones'],
                    ['wind', 'Wind field'],
                    ['skyline', '3D skyline obstacles'],
                    ['labels', 'Labels'],
                  ] as [keyof LayerToggles, string][]
                ).map(([k, label]) => (
                  <Toggle key={k} label={label} checked={s.map.layers[k]} onChange={(v) => s.setLayer(k, v)} />
                ))}
              </div>
            )}
            {panel === 'fly' && (
              <div className="card w-52 p-1.5 shadow-xl fade-in">
                {FLY_TO.map((f) => (
                  <button
                    type="button"
                    key={f.label}
                    className="w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-panel-2"
                    onClick={() => {
                      if (f.pitch && !s.map.is3d) s.setMap({ is3d: true });
                      map?.flyTo({ center: f.center, zoom: f.zoom, pitch: f.pitch ?? (s.map.is3d ? 60 : 0), bearing: f.bearing ?? 0, duration: 1600 });
                      setPanel(null);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
            <MapBtn title="Zoom in" onClick={() => map?.zoomIn()}>
              <Plus size={15} />
            </MapBtn>
            <MapBtn title="Zoom out" onClick={() => map?.zoomOut()}>
              <Minus size={15} />
            </MapBtn>
            <MapBtn title="Recentre" onClick={() => map?.flyTo({ center: LONDON_CENTER, zoom: 10.9, pitch: s.map.is3d ? 60 : 0, bearing: s.map.is3d ? -20 : 0 })}>
              <Crosshair size={15} />
            </MapBtn>
          </div>

          <Legend narrow={narrow} />
          <DroneOpsHud weather={weather} zones={s.zones} />
          {tilesOk === false && (
            <div className="absolute top-3 left-3 z-20 text-[11px] px-2.5 py-1 rounded-md bg-[#2a2f35]/90 border border-line text-muted pointer-events-none max-w-[260px]">
              Offline basemap — street tiles unreachable, showing the bundled borough map
            </div>
          )}
          {(selectMode || shiftHeld) && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 text-[12px] px-3 py-1.5 rounded-md bg-blue/90 text-[#0d1520] font-semibold">
              Drag to select machines · Shift adds to the selection
            </div>
          )}
          {pickMode && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 text-[12px] px-3 py-1.5 rounded-md bg-amber/90 text-[#1d1405] font-semibold">
              Click the map to choose a destination
            </div>
          )}
        </>
      )}

      {variant === 'overview' && ready && (
        <>
          <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
            <MapBtn title="Zoom in" onClick={() => map?.zoomIn()}>
              <Plus size={14} />
            </MapBtn>
            <MapBtn title="Zoom out" onClick={() => map?.zoomOut()}>
              <Minus size={14} />
            </MapBtn>
          </div>
          <EtaLegend />
        </>
      )}
      {children}
    </div>
  );
}

function MapBtn({ children, onClick, title, active }: { children: ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'w-8 h-8 rounded-lg grid place-items-center border transition-colors',
        active ? 'bg-blue text-[#0d1520] border-blue' : 'bg-[#23272c]/95 border-line text-text hover:bg-panel-2',
      )}
    >
      {children}
    </button>
  );
}

function EtaLegend() {
  return (
    <div className="absolute right-4 top-6 bottom-8 z-20 flex items-stretch gap-2 pointer-events-none">
      <div className="w-1.5 rounded-full" style={{ background: 'linear-gradient(#8fd6a0, #4fb8c4 40%, #3d7fd1 70%, #3452aa)' }} />
      <div className="flex flex-col justify-between text-[11px] text-muted font-display font-semibold">
        <span>0 min</span>
        <span>10 min</span>
        <span>20 min</span>
        <span>30+ min</span>
      </div>
    </div>
  );
}

function Legend({ narrow }: { narrow: boolean }) {
  const [open, setOpen] = useState(!narrow);
  useEffect(() => setOpen(!narrow), [narrow]);
  const kinds = ['drone', 'robotaxi', 'van', 'truck', 'sidewalk_robot', 'humanoid', 'amr', 'cargo_bike'] as const;
  return (
    <div className="absolute bottom-3 left-14 z-20 card px-3 py-2 text-[11px] max-w-[420px]">
      <button type="button" className="label-caps text-[10px] text-muted mb-1" onClick={() => setOpen(!open)}>
        Legend {open ? '−' : '+'}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {kinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </span>
          ))}
          {(['frz', 'restricted', 'prison', 'temporary'] as const).map((z) => (
            <span key={z} className="flex items-center gap-1.5 text-muted">
              <span className="w-2.5 h-2.5 rounded-sm border" style={{ background: `${ZONE_COLOR[z]}40`, borderColor: ZONE_COLOR[z] }} />
              {ZONE_LABEL[z]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DroneOpsHud({ weather, zones }: { weather: ReturnType<ReturnType<typeof useStore.getState>['weather']>; zones: Zone[] }) {
  const h5 = droneFlyability(weather, { maxWindMs: 12, ipRating: 'IP55', tempMinC: -10, tempMaxC: 40 });
  const h2 = droneFlyability(weather, { maxWindMs: 10, ipRating: 'IP54', tempMinC: -5, tempMaxC: 40 });
  const col = (s: string) => (s === 'go' ? '#8bd450' : s === 'caution' ? '#f0a33a' : '#ec5b5b');
  return (
    <div className="absolute bottom-3 right-3 z-20 card w-[250px] px-3.5 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="label-caps text-[11px] text-muted flex items-center gap-1.5">
          <Wind size={13} /> Drone ops
        </span>
        <span className="text-[10px] text-dim">{weather.source === 'open-meteo' ? 'Open-Meteo live' : weather.source === 'override' ? 'Override' : 'Simulated'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="num text-base">{weather.windMs120.toFixed(1)}</div>
          <div className="text-[10px] text-muted">m/s @120 m</div>
        </div>
        <div>
          <div className="num text-base">{weather.gustMs.toFixed(1)}</div>
          <div className="text-[10px] text-muted">gusts</div>
        </div>
        <div>
          <div className="num text-base">{Math.round(weather.tempC)}°</div>
          <div className="text-[10px] text-muted">{weather.summary}</div>
        </div>
      </div>
      <div className="mt-2.5 space-y-1">
        {[
          ['Skylift H5 (12 m/s)', h5.status],
          ['Courier H2 (10 m/s)', h2.status],
        ].map(([l, st]) => (
          <div key={l} className="flex justify-between">
            <span className="text-muted">{l}</span>
            <span className="font-semibold" style={{ color: col(st) }}>
              {st === 'go' ? 'GO' : st === 'caution' ? 'CAUTION' : 'NO-GO'}
            </span>
          </div>
        ))}
        <div className="flex justify-between">
          <span className="text-muted">Active restrictions</span>
          <span className="font-semibold">{zones.filter((z) => z.active).length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Effective wind</span>
          <span className="font-semibold">{effectiveWindMs(weather).toFixed(1)} m/s</span>
        </div>
      </div>
    </div>
  );
}
