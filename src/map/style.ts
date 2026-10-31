// Light, Uber-style basemap. OpenFreeMap street tiles when online, a bundled London outline offline.
import type { StyleSpecification } from 'maplibre-gl';
import boroughs from '@/data/geo/london-boroughs.json';
import thames from '@/data/geo/thames.json';

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTR = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
export const EMPTY = { type: 'FeatureCollection', features: [] } as const;

export const ZONE_RED = '#e5484d';

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

export function lightStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: 'vector', url: TILES, attribution: ATTR },
      boroughs: { type: 'geojson', data: boroughs as any },
      thames: { type: 'geojson', data: thames as any },
      zones: { type: 'geojson', data: EMPTY as any },
      skyline: { type: 'geojson', data: EMPTY as any },
      wind: { type: 'geojson', data: EMPTY as any },
      route: { type: 'geojson', data: EMPTY as any },
      approach: { type: 'geojson', data: EMPTY as any },
      area: { type: 'geojson', data: EMPTY as any },
      coverage: { type: 'geojson', data: EMPTY as any },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#f2f2f0' } },
      { id: 'fb-fill', type: 'fill', source: 'boroughs', paint: { 'fill-color': '#ebebe8' } },
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
      // ---- no-fly zones (2D footprint, shown in both modes) ----
      { id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ZONE_RED, 'fill-opacity': ['case', ['get', 'hot'], 0.16, 0.08] } },
      {
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': ZONE_RED, 'line-width': ['case', ['get', 'hot'], 2, 1.3], 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
      },
      // ---- coming soon: charging coverage ----
      { id: 'coverage-fill', type: 'fill', source: 'coverage', paint: { 'fill-color': '#1f8f55', 'fill-opacity': 0.07 } },
      { id: 'coverage-line', type: 'line', source: 'coverage', paint: { 'line-color': '#1f8f55', 'line-width': 1.2, 'line-opacity': 0.45, 'line-dasharray': [2, 2] } },
      // ---- drone rental flight area ----
      { id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#276ef1', 'fill-opacity': 0.1 } },
      { id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#276ef1', 'line-width': 2, 'line-dasharray': [1.5, 1.2] } },
      // ---- wind arrows ----
      {
        id: 'wind',
        type: 'symbol',
        source: 'wind',
        layout: {
          'icon-image': 'wind-go',
          'icon-rotate': ['get', 'rot'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 0.8,
        },
        paint: { 'icon-opacity': 0.6 },
      },
      // ---- flight lines (on the ground in 2D; a shadow under the 3D line) ----
      { id: 'approach', type: 'line', source: 'approach', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8d8d8d', 'line-width': 3.5, 'line-dasharray': [0.6, 1.8] } },
      { id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } },
      { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-width': 4.5 } },
      // ---- 3D ----
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#ecebe8', 60, '#dddcd8', 200, '#cfcdc8'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      },
      {
        id: 'skyline-3d',
        type: 'fill-extrusion',
        source: 'skyline',
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#d3d1cc', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.95 },
      },
      {
        id: 'zones-3d',
        type: 'fill-extrusion',
        source: 'zones',
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ZONE_RED, 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.2 },
      },
    ],
  };
}

/** Wind arrow icons (pointing north, rotated on the map to where the wind blows). */
export function arrowImage(color: string): ImageData {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(32, 54);
  g.lineTo(32, 18);
  g.stroke();
  g.beginPath();
  g.moveTo(32, 6);
  g.lineTo(45, 24);
  g.lineTo(19, 24);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, s, s);
}
