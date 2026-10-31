// Light, Uber-style map for the consumer app. Real street tiles when online, a bundled London map offline.
import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import type { LngLat } from '@shared/types';
import boroughs from '@/data/geo/london-boroughs.json';
import thames from '@/data/geo/thames.json';
import { markerSvg } from './art';
import type { Mode } from './types';

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTR = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const empty = { type: 'FeatureCollection', features: [] } as const;

const road = (id: string, classes: string[], color: string, w: [number, number, number, number], minzoom = 9) => ({
  id,
  type: 'line' as const,
  source: 'omt',
  'source-layer': 'transportation',
  minzoom,
  filter: ['in', ['get', 'class'], ['literal', classes]] as any,
  layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
  paint: { 'line-color': color, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], w[0], w[1], w[2], w[3]] as any },
});

function lightStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: TILES, attribution: ATTR },
      boroughs: { type: 'geojson', data: boroughs as any },
      thames: { type: 'geojson', data: thames as any },
      route: { type: 'geojson', data: empty as any },
      approach: { type: 'geojson', data: empty as any },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#f2f2f0' } },
      { id: 'fb-fill', type: 'fill', source: 'boroughs', paint: { 'fill-color': '#ececea' } },
      { id: 'fb-line', type: 'line', source: 'boroughs', paint: { 'line-color': '#ffffff', 'line-width': 1.4 } },
      { id: 'fb-thames', type: 'line', source: 'thames', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8dcee', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 3, 12, 14, 15, 90] } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#dcefd6' } },
      { id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]], paint: { 'fill-color': '#e1f0dc' } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#c8dcee' } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#e6e6e3', 'fill-outline-color': '#dadad7' } },
      road('casing-major', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], '#dcdcda', [9, 1.2, 16, 15]),
      road('minor', ['minor', 'service'], '#ffffff', [12, 0.6, 17, 11], 12),
      road('major', ['secondary', 'tertiary', 'primary', 'trunk'], '#ffffff', [9, 0.8, 16, 12]),
      road('motorway', ['motorway'], '#f7df9f', [8, 1, 16, 13], 8),
      road('rail', ['rail'], '#d3d3d3', [10, 0.5, 16, 2], 10),
      {
        id: 'road-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 13.5,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': '#7c7c7c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'town', 'village']]],
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14] },
        paint: { 'text-color': '#8a8a8a', 'text-halo-color': '#f8f8f6', 'text-halo-width': 1.5 },
      },
      { id: 'approach', type: 'line', source: 'approach', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9a9a9a', 'line-width': 3.5, 'line-dasharray': [0.6, 1.6] } },
      { id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } },
      { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-width': 4.5 } },
    ],
  };
}

export interface MapMarker {
  id: string;
  position: LngLat;
  kind: 'pickup' | 'dropoff' | 'vehicle' | 'nearby' | 'pulse';
  mode?: Mode | 'nearby_drone' | 'nearby_car' | 'nearby_waymo' | 'nearby_bike' | 'nearby_van';
  heading?: number;
  label?: string;
}

interface Props {
  className?: string;
  fit?: LngLat[];
  route?: LngLat[];
  approach?: LngLat[];
  markers?: MapMarker[];
  padding?: { top: number; bottom: number; left: number; right: number };
  interactive?: boolean;
  center?: LngLat;
  zoom?: number;
}

function markerEl(m: MapMarker): HTMLElement {
  const el = document.createElement('div');
  if (m.kind === 'pickup' || m.kind === 'dropoff') {
    el.className = 'hv-stop';
    el.innerHTML = `<div class="hv-stop-dot ${m.kind === 'dropoff' ? 'hv-square' : ''}"></div>${m.label ? `<div class="hv-stop-label">${m.label}</div>` : ''}`;
  } else if (m.kind === 'pulse') {
    el.className = 'hv-pulse';
    el.innerHTML = '<span></span><span></span><i></i>';
  } else {
    el.className = m.kind === 'nearby' ? 'hv-veh hv-near' : 'hv-veh';
    el.innerHTML = `<div class="hv-veh-in">${markerSvg(m.mode ?? 'courier')}</div>`;
  }
  return el;
}

function setLine(map: maplibregl.Map, id: string, coords?: LngLat[]) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(coords && coords.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } : (empty as any));
}

export function MobileMap({ className, fit, route, approach, markers = [], padding = { top: 60, bottom: 60, left: 50, right: 50 }, interactive = true, center, zoom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, { m: maplibregl.Marker; kind: string; mode?: string; label?: string }>());
  const readyRef = useRef(false);
  const latest = useRef({ fit, route, approach, markers, padding });
  latest.current = { fit, route, approach, markers, padding };

  const syncMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of latest.current.markers) {
      seen.add(m.id);
      const cur = markersRef.current.get(m.id);
      if (cur && cur.kind === m.kind && cur.mode === m.mode && cur.label === m.label) {
        cur.m.setLngLat(m.position);
      } else {
        cur?.m.remove();
        const mk = new maplibregl.Marker({ element: markerEl(m), anchor: 'center' }).setLngLat(m.position).addTo(map);
        markersRef.current.set(m.id, { m: mk, kind: m.kind, mode: m.mode, label: m.label });
      }
      const inner = markersRef.current.get(m.id)!.m.getElement().querySelector('.hv-veh-in') as HTMLElement | null;
      if (inner && m.heading !== undefined && !String(m.mode).includes('drone') && !String(m.mode).startsWith('aerial')) inner.style.transform = `rotate(${m.heading}deg)`;
    }
    for (const [id, v] of markersRef.current) {
      if (!seen.has(id)) {
        v.m.remove();
        markersRef.current.delete(id);
      }
    }
  };

  const syncLines = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setLine(map, 'route', latest.current.route);
    setLine(map, 'approach', latest.current.approach);
  };

  const doFit = (animate = true) => {
    const map = mapRef.current;
    const pts = latest.current.fit;
    if (!map || !pts?.length) return;
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: 15, padding: latest.current.padding, duration: animate ? 600 : 0 });
      return;
    }
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, { padding: latest.current.padding, maxZoom: 15.5, duration: animate ? 600 : 0 });
  };

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: lightStyle(),
      center: center ?? fit?.[0] ?? [-0.1426, 51.539],
      zoom: zoom ?? 13,
      attributionControl: { compact: true },
      interactive,
      dragRotate: false,
      pitchWithRotate: false,
      maxBounds: [
        [-0.9, 51.15],
        [0.6, 51.85],
      ],
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    let gotTile = false;
    let offline = false;
    const markReady = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      syncLines();
      doFit(false);
    };
    map.on('load', markReady);
    map.on('sourcedata', (e: any) => {
      if (!gotTile && e.sourceId === 'omt' && e.tile) {
        gotTile = true;
        for (const id of ['fb-fill', 'fb-thames']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
        if (map.getLayer('fb-line')) map.setLayoutProperty('fb-line', 'visibility', 'none');
      }
    });
    map.on('error', (e: any) => {
      const msg = String(e?.error?.message ?? '');
      if (offline || gotTile || !(e?.sourceId === 'omt' || /openfreemap|Failed to fetch|NetworkError|AJAXError/i.test(msg))) return;
      offline = true;
      for (const l of map.getStyle().layers ?? []) if ((l as { source?: string }).source === 'omt') map.removeLayer(l.id);
      if (map.getSource('omt')) map.removeSource('omt');
      window.setTimeout(markReady, 300);
    });
    const t = window.setTimeout(markReady, 6000);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    syncMarkers();
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      markersRef.current.forEach((v) => v.m.remove());
      markersRef.current.clear();
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(syncMarkers);
  useEffect(syncLines, [JSON.stringify(route), JSON.stringify(approach)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (readyRef.current) doFit(true);
  }, [JSON.stringify(fit), padding.bottom, padding.top]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className={className} style={{ position: 'absolute', inset: 0 }} />;
}
