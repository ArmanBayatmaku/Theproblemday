import type { StyleSpecification } from 'maplibre-gl';
import boroughs from '@/data/geo/london-boroughs.json';
import thames from '@/data/geo/thames.json';

// OpenFreeMap: free OpenMapTiles-schema vector tiles, no API key (attribution required).
const OFM_TILES = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const roads = (id: string, classes: string[], color: string, w: [number, number, number, number], minzoom = 8) => ({
  id,
  type: 'line' as const,
  source: 'openmaptiles',
  'source-layer': 'transportation',
  minzoom,
  filter: ['in', ['get', 'class'], ['literal', classes]] as any,
  layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
  paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], w[0], w[1], w[2], w[3]] as any },
});

/** Dark street map with 3D buildings, plus bundled borough outlines/Thames that show when offline. */
export function streetStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: OFM_TILES, attribution: ATTRIBUTION },
      boroughs: { type: 'geojson', data: boroughs as any },
      thames: { type: 'geojson', data: thames as any },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1a1d21' } },
      { id: 'boroughs-fill', type: 'fill', source: 'boroughs', paint: { 'fill-color': '#2a2e34' } },
      { id: 'boroughs-line', type: 'line', source: 'boroughs', paint: { 'line-color': '#3a4047', 'line-width': 1 } },
      {
        id: 'fallback-thames',
        type: 'line',
        source: 'thames',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#16202b', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 3, 12, 14, 15, 90] },
      },
      { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': '#243029', 'fill-opacity': 0.85 } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland', 'wetland']]],
        paint: { 'fill-color': '#25302a', 'fill-opacity': 0.55 },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['industrial', 'commercial', 'retail', 'railway']]],
        paint: { 'fill-color': '#2c3036', 'fill-opacity': 0.55 },
      },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#15202c' } },
      { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#15202c', 'line-width': 1.2 } },
      {
        id: 'aeroway',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'aeroway',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#30343a' },
      },
      roads('roads-minor', ['minor', 'service'], '#30353b', [13, 0.4, 17, 4], 13),
      roads('roads-secondary', ['secondary', 'tertiary'], '#393e46', [10, 0.5, 17, 6], 10),
      roads('roads-primary', ['primary', 'trunk'], '#454b54', [8, 0.6, 17, 8]),
      roads('roads-motorway', ['motorway'], '#565e68', [7, 0.8, 17, 9]),
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': '#3a3f46', 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': '#2f343a', 'fill-outline-color': '#3a4047' },
      },
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 12.5,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#2c3138', 40, '#363d46', 120, '#46505b', 250, '#5a6673'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.94,
        },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 11 },
        paint: { 'text-color': '#4d6a86' },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
        paint: { 'text-color': '#79828c', 'text-halo-color': '#1a1d21', 'text-halo-width': 1.2 },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood', 'town', 'city']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9.5, 14, 12],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
        },
        paint: { 'text-color': '#828b95', 'text-halo-color': '#1a1d21', 'text-halo-width': 1.4 },
      },
    ],
  };
}

/** Flat, tile-free London silhouette (like the world map in a monitoring dashboard). */
export function stylizedStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      boroughs: { type: 'geojson', data: boroughs as any },
      thames: { type: 'geojson', data: thames as any },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#23272c' } },
      { id: 'boroughs-fill', type: 'fill', source: 'boroughs', paint: { 'fill-color': '#3a3e44' } },
      { id: 'boroughs-line', type: 'line', source: 'boroughs', paint: { 'line-color': '#2d3136', 'line-width': 1.2 } },
      {
        id: 'thames',
        type: 'line',
        source: 'thames',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#23272c', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 3, 12, 14, 15, 90] },
      },
    ],
  };
}
