// The one map shared by every screen: 2D/3D, demo no-fly zones, wind, the drone's flight line and
// the live drone (drawn at its real flying height in 3D).
import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { LocateFixed } from 'lucide-react';
import clsx from 'clsx';
import type { Flyability, LngLat, Pos3, Weather } from '@shared/types';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { destination, zoneCircle, zonePolygon } from '@shared/geo';
import { droneFlyability, effectiveWindMs } from '@shared/weather';
import { useApp, useWeather } from '@/store';
import { DRONE, PORTS } from '@/lib/drone';
import { compass, mph } from '@/lib/format';
import { shortZone } from '@/lib/quotes';
import { DRONE_ICON_URL, PORT_SVG, SHOP_SVG } from '@/ui/art';
import { arrowImage, EMPTY, lightStyle } from './style';
import { useScene, type Scene } from './scene';

const START: LngLat = [-0.128, 51.522];
const PITCH_3D = 58;
const BEARING_3D = -18;

// ---------- data for map sources ----------
function zonesData(hot: Set<string>) {
  return {
    type: 'FeatureCollection',
    features: DEMO_ZONES.filter((z) => z.active).map((z) => ({
      type: 'Feature',
      properties: { id: z.id, hot: hot.has(z.id), height: Math.min(z.ceilingM, 240) },
      geometry: { type: 'Polygon', coordinates: [zonePolygon(z)] },
    })),
  };
}

const rect = (c: LngLat, w: number, d: number): LngLat[] => {
  const n = destination(c, 0, d / 2)[1];
  const s = destination(c, 180, d / 2)[1];
  const e = destination(c, 90, w / 2)[0];
  const wl = destination(c, 270, w / 2)[0];
  return [[wl, s], [e, s], [e, n], [wl, n], [wl, s]];
};

const SKYLINE = {
  type: 'FeatureCollection',
  features: LANDMARKS.map((l) => ({ type: 'Feature', properties: { height: l.heightM }, geometry: { type: 'Polygon', coordinates: [rect(l.position, l.footprintM[0], l.footprintM[1])] } })),
};

function windData(map: maplibregl.Map, w: Weather, compact: boolean) {
  const b = map.getBounds();
  const toward = (w.windDirDeg + 180) % 360;
  const [W, E, S, N] = [b.getWest(), b.getEast(), b.getSouth(), b.getNorth()];
  const cols = compact ? 4 : 6;
  const rows = compact ? 4 : 5;
  const features = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = W + (E - W) * ((i + (j % 2 ? 0.75 : 0.25)) / cols);
      const y = S + (N - S) * ((j + 0.5) / rows);
      features.push({ type: 'Feature', properties: { rot: toward }, geometry: { type: 'Point', coordinates: [x, y] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

function setLine(map: maplibregl.Map, id: string, path?: Pos3[]) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(
    path && path.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map((p) => [p[0], p[1]]) } } : (EMPTY as any),
  );
}

// ---------- deck.gl layers (3D flight line and the drone) ----------
function deckLayers(s: Scene, is3d: boolean): Layer[] {
  const out: Layer[] = [];
  const z = (p: Pos3): [number, number, number] => [p[0], p[1], is3d ? p[2] : 0];
  if (is3d && s.approach && s.approach.length > 1) {
    out.push(new PathLayer<Pos3[]>({ id: 'approach-3d', data: [s.approach], getPath: (d) => d.map(z), getColor: [120, 120, 120, 230], getWidth: 3, widthUnits: 'pixels', capRounded: true, jointRounded: true }));
  }
  if (is3d && s.route && s.route.length > 1) {
    out.push(new PathLayer<Pos3[]>({ id: 'route-3d', data: [s.route], getPath: (d) => d.map(z), getColor: [0, 0, 0, 255], getWidth: 5, widthUnits: 'pixels', capRounded: true, jointRounded: true }));
  }
  if (s.drone) {
    const p = s.drone.pos;
    if (is3d && p[2] > 1) {
      out.push(
        new LineLayer<Pos3>({ id: 'drone-stalk', data: [p], getSourcePosition: (d) => [d[0], d[1], 0], getTargetPosition: (d) => [d[0], d[1], d[2]], getColor: [0, 0, 0, 120], getWidth: 1.5 }),
        new ScatterplotLayer<Pos3>({ id: 'drone-shadow', data: [p], getPosition: (d) => [d[0], d[1], 0], getRadius: 6, radiusUnits: 'pixels', getFillColor: [0, 0, 0, 60] }),
      );
    }
    out.push(
      new IconLayer<Pos3>({
        id: 'drone',
        data: [p],
        getPosition: (d) => z(d),
        getIcon: () => ({ url: DRONE_ICON_URL, width: 128, height: 128, anchorY: 64 }),
        getSize: 46,
        sizeUnits: 'pixels',
        billboard: true,
        parameters: { depthCompare: 'always' } as any,
      }),
    );
  }
  return out;
}

// ---------- HTML markers ----------
interface MarkerItem {
  id: string;
  position: LngLat;
  sig: string;
  make: () => HTMLElement;
  onClick?: () => void;
}

class MarkerSet {
  private m = new Map<string, { mk: maplibregl.Marker; sig: string }>();
  constructor(private map: maplibregl.Map) {}
  sync(items: MarkerItem[]) {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      const cur = this.m.get(it.id);
      if (cur && cur.sig === it.sig) {
        cur.mk.setLngLat(it.position);
        continue;
      }
      cur?.mk.remove();
      const el = it.make();
      if (it.onClick) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          it.onClick?.();
        });
      }
      this.m.set(it.id, { mk: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(it.position).addTo(this.map), sig: it.sig });
    }
    for (const [id, v] of this.m) {
      if (!seen.has(id)) {
        v.mk.remove();
        this.m.delete(id);
      }
    }
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function el(html: string, className: string, title?: string) {
  const d = document.createElement('div');
  d.className = className;
  d.innerHTML = html;
  if (title) d.title = title;
  return d;
}

function zoneLabel(name: string, hot: boolean, minZoom: number) {
  const d = el(`<span class="hv-zone-tag">No-fly · demo</span><span class="hv-zone-name">${esc(shortZone(name))}</span>`, `hv-zone${hot ? ' is-hot' : ''}`);
  d.dataset.min = String(hot ? 10.5 : minZoom);
  return d;
}

// ---------- component ----------
export function MapView({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const setsRef = useRef<Record<'zones' | 'ports' | 'shops' | 'stops', MarkerSet> | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const scene = useScene((s) => s.scene);
  const latest = useRef(scene);
  latest.current = scene;
  const view3d = useApp((s) => s.view3d);
  const setView3d = useApp((s) => s.setView3d);
  const weather = useWeather();
  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const fly = droneFlyability(weather, DRONE.limits);
  const wind = effectiveWindMs(weather);

  const showZoneLabels = () => {
    const map = mapRef.current;
    if (!map || !ref.current) return;
    const z = map.getZoom();
    ref.current.querySelectorAll<HTMLElement>('.hv-zone').forEach((n) => {
      n.style.display = z >= Number(n.dataset.min) ? '' : 'none';
    });
  };

  /** Frames the scene. With a tilted (3D) camera the map is zoomed out a little so nothing is cut off. */
  const fit = (animate = true, cam?: { pitch: number; bearing: number }) => {
    const map = mapRef.current;
    if (!map) return;
    const pitch = cam?.pitch ?? map.getPitch();
    const bearing = cam?.bearing ?? map.getBearing();
    const pts = latest.current.fit;
    const duration = animate ? 800 : 0;
    if (!pts?.length) return map.easeTo({ center: START, zoom: 12, pitch, bearing, duration });
    if (pts.length === 1) return map.easeTo({ center: pts[0], zoom: 14.4, pitch, bearing, duration });
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    const padding = compact ? { top: 96, bottom: 52, left: 44, right: 44 } : { top: 120, bottom: 120, left: 110, right: 110 };
    const c = map.cameraForBounds(b, { padding, bearing, maxZoom: 15 });
    if (!c) return;
    map.easeTo({ center: c.center, zoom: (c.zoom ?? 13) - (pitch > 0 ? 0.55 : 0), pitch, bearing, duration });
  };

  // Create the map once.
  useEffect(() => {
    if (!ref.current) return;
    const is3d = useApp.getState().view3d;
    const map = new maplibregl.Map({
      container: ref.current,
      style: lightStyle(),
      center: START,
      zoom: 12,
      pitch: is3d ? PITCH_3D : 0,
      bearing: is3d ? BEARING_3D : 0,
      maxPitch: 70,
      attributionControl: { compact: true },
      maxBounds: [
        [-0.9, 51.15],
        [0.6, 51.85],
      ],
    });
    mapRef.current = map;
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;
    setsRef.current = { zones: new MarkerSet(map), ports: new MarkerSet(map), shops: new MarkerSet(map), stops: new MarkerSet(map) };

    let done = false;
    let gotTile = false;
    let isOffline = false;
    const setup = () => {
      if (done) return;
      done = true;
      map.addImage('wind-go', arrowImage('#1f8f55'), { pixelRatio: 2 });
      map.addImage('wind-caution', arrowImage('#c27c0e'), { pixelRatio: 2 });
      map.addImage('wind-nogo', arrowImage('#d93025'), { pixelRatio: 2 });
      (map.getSource('skyline') as GeoJSONSource).setData(SKYLINE as any);
      map.on('zoom', showZoneLabels);
      setReady(true);
    };
    map.on('load', setup);
    map.on('sourcedata', (e: any) => {
      if (!gotTile && e.sourceId === 'omt' && e.tile) {
        gotTile = true;
        for (const id of ['fb-fill', 'fb-line', 'fb-thames']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
    });
    map.on('error', (e: any) => {
      const msg = String(e?.error?.message ?? '');
      if (isOffline || gotTile || !(e?.sourceId === 'omt' || /openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg))) return;
      isOffline = true;
      for (const l of map.getStyle().layers ?? []) if ((l as { source?: string }).source === 'omt') map.removeLayer(l.id);
      if (map.getSource('omt')) map.removeSource('omt');
      setOffline(true);
      window.setTimeout(setup, 300);
    });
    const t = window.setTimeout(setup, 6000);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      setsRef.current = null;
    };
  }, []);

  // Flight lines, drone, stops, shops and ports.
  useEffect(() => {
    const map = mapRef.current;
    const sets = setsRef.current;
    if (!ready || !map || !sets) return;
    setLine(map, 'route', scene.route);
    setLine(map, 'approach', scene.approach);
    overlayRef.current?.setProps({ layers: deckLayers(scene, view3d) });
    sets.stops.sync(
      (scene.stops ?? []).map((s) => ({
        id: s.id,
        position: s.position,
        sig: `${s.kind}|${s.label}`,
        make: () => el(`<div class="hv-stop-dot${s.kind === 'dropoff' ? ' hv-square' : ''}"></div>${s.label ? `<div class="hv-stop-label">${esc(s.label)}</div>` : ''}`, 'hv-stop'),
      })),
    );
    sets.shops.sync(
      (scene.shops ?? []).map((c) => {
        const on = c.id === scene.selectedShopId;
        return {
          id: c.id,
          position: c.position,
          sig: `${on}`,
          make: () => el(`<span class="hv-shop-ic">${SHOP_SVG}</span><span class="hv-shop-label">${esc(c.name)}</span>`, `hv-shop${on ? ' is-on' : ''}`, `${c.name} · ${c.kind}`),
          onClick: () => latest.current.onShop?.(c),
        };
      }),
    );
    sets.ports.sync(scene.ports ? PORTS.map((p) => ({ id: p.id, position: p.position, sig: 'p', make: () => el(PORT_SVG, 'hv-port', p.name) })) : []);
  }, [ready, scene, view3d]);

  // Emphasise the zones the current route goes around.
  const hotKey = (scene.hotZones ?? []).join();
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const hot = new Set(scene.hotZones ?? []);
    (map.getSource('zones') as GeoJSONSource).setData(zonesData(hot) as any);
    setsRef.current?.zones.sync(
      DEMO_ZONES.filter((z) => z.active).map((z) => {
        const { center, radiusM } = zoneCircle(z);
        return { id: z.id, position: center, sig: `${hot.has(z.id)}`, make: () => zoneLabel(z.name, hot.has(z.id), radiusM >= 650 ? 11.8 : 13.2) };
      }),
    );
    showZoneLabels();
  }, [ready, hotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2D ↔ 3D.
  const shown3d = useRef<boolean | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (shown3d.current !== null && shown3d.current !== view3d) fit(true, { pitch: view3d ? PITCH_3D : 0, bearing: view3d ? BEARING_3D : 0 });
    shown3d.current = view3d;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('building-3d', view3d && !offline);
    vis('skyline-3d', view3d && offline);
    vis('zones-3d', view3d);
    vis('building', !view3d);
    map.setPaintProperty('route', 'line-opacity', view3d ? 0.16 : 1);
    map.setPaintProperty('route-casing', 'line-opacity', view3d ? 0 : 1);
    map.setPaintProperty('approach', 'line-opacity', view3d ? 0.25 : 1);
    if (view3d) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [ready, view3d, offline]);

  // Wind arrows follow the view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const upd = () => (map.getSource('wind') as GeoJSONSource | undefined)?.setData(windData(map, weatherRef.current, compact) as any);
    upd();
    map.setLayoutProperty('wind', 'icon-image', fly.status === 'no_go' ? 'wind-nogo' : fly.status === 'caution' ? 'wind-caution' : 'wind-go');
    map.setLayoutProperty('wind', 'icon-size', 0.5 + (Math.min(wind, 20) / 20) * 0.6);
    map.on('moveend', upd);
    return () => {
      map.off('moveend', upd);
    };
  }, [ready, weather.windDirDeg, fly.status, Math.round(wind), compact]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-frame when the scene asks for it.
  useEffect(() => {
    if (ready) fit();
  }, [ready, scene.fitKey, compact]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f2f2f0]">
      {/* Inline position: maplibre's own (unlayered) CSS would otherwise override Tailwind's utilities. */}
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <WeatherChip weather={weather} status={fly.status} compact={compact} />
      <div className={clsx('absolute flex flex-col items-end gap-2', compact ? 'top-3 right-3' : 'top-4 right-4')}>
        <div className="flex rounded-full bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,0.16)]" role="group" aria-label="Map view">
          {(['2D', '3D'] as const).map((m) => {
            const on = (m === '3D') === view3d;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setView3d(m === '3D')}
                className={clsx('h-8 min-w-11 px-3 rounded-full text-[13px] font-semibold transition', on ? 'bg-black text-white' : 'text-black')}
              >
                {m}
              </button>
            );
          })}
        </div>
        <button type="button" aria-label="Recentre" title="Recentre" onClick={() => fit()} className="w-10 h-10 rounded-full bg-white grid place-items-center shadow-[0_2px_10px_rgba(0,0,0,0.16)] active:scale-95">
          <LocateFixed size={18} />
        </button>
      </div>
      <div className={clsx('absolute flex items-center gap-3 rounded-full bg-white/95 shadow-[0_1px_6px_rgba(0,0,0,0.14)] font-medium', compact ? 'left-3 bottom-5 h-7 px-2.5 text-[11px]' : 'left-3 bottom-3 h-8 px-3 text-[12px]')}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px] border-[1.5px] border-dashed border-[#e5484d] bg-[#e5484d]/15" /> No-fly zone (demo only)
        </span>
        {!compact && (
          <span className="inline-flex items-center gap-1.5 text-[#545454]">
            <WindArrow deg={weather.windDirDeg} status={fly.status} /> Wind
          </span>
        )}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<Flyability, { label: string; color: string }> = {
  go: { label: 'Good flying weather', color: '#1f8f55' },
  caution: { label: 'Breezy · flights may be slower', color: '#c27c0e' },
  no_go: { label: 'Too windy · drones grounded', color: '#d93025' },
};

function WindArrow({ deg, status, size = 14 }: { deg: number; status: Flyability; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${(deg + 180) % 360}deg)` }} aria-hidden>
      <path d="M12 3 L18 11 H14 V21 H10 V11 H6 Z" fill={STATUS_TEXT[status].color} />
    </svg>
  );
}

function WeatherChip({ weather, status, compact }: { weather: Weather; status: Flyability; compact: boolean }) {
  const s = STATUS_TEXT[status];
  return (
    <div className={clsx('absolute bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.16)]', compact ? 'top-3 left-3 px-3 py-1.5 max-w-[62%]' : 'top-4 left-4 px-4 py-2.5')}>
      <div className={clsx('flex items-center gap-1.5 font-semibold', compact ? 'text-[12px]' : 'text-[13px]')}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
        <span className="truncate">{s.label}</span>
      </div>
      <div className={clsx('flex items-center gap-1.5 text-[#545454] tabular-nums', compact ? 'text-[11px] mt-0.5' : 'text-[12px] mt-0.5')}>
        <WindArrow deg={weather.windDirDeg} status={status} size={compact ? 12 : 13} />
        <span className="truncate">
          {!compact && `${Math.round(weather.tempC)}° · `}Wind {mph(weather.windMs120)} mph {compass(weather.windDirDeg)} · gusts {mph(weather.gustMs)}
          {weather.source === 'override' ? ' · demo' : ''}
        </span>
      </div>
    </div>
  );
}
