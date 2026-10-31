import type { Place, Site } from '@shared/types';
import { resolvePlace } from '@shared/parser';

const POSTCODE = /^\s*([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})?\s*$/i;

/**
 * Geocoder: known sites and London places first (offline), then UK postcodes via postcodes.io
 * (free, no key) when online.
 */
export async function geocode(query: string, sites: Site[]): Promise<Place | undefined> {
  const local = resolvePlace(query, sites);
  if (local) return local;
  const m = query.match(POSTCODE) ?? query.match(/\b([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})\b/i);
  if (!m) return undefined;
  try {
    const url = m[2]
      ? `https://api.postcodes.io/postcodes/${encodeURIComponent(`${m[1]}${m[2]}`)}`
      : `https://api.postcodes.io/outcodes/${encodeURIComponent(m[1])}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const j = await res.json();
    const r = j.result;
    if (!r?.longitude) return undefined;
    const name = m[2] ? `${m[1]} ${m[2]}`.toUpperCase() : m[1].toUpperCase();
    return { name, position: [r.longitude, r.latitude], address: r.admin_district ? `${name}, ${r.admin_district}` : name };
  } catch {
    return undefined;
  }
}
