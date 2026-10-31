import { useEffect, useState } from 'react';

export const money = (n: number) => `£${n.toFixed(2)}`;
/** Whole pounds, for estimates (e.g. £113). */
export const pounds = (n: number) => `£${Math.round(n)}`;
export const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const mph = (ms: number) => Math.round(ms * 2.237);
export const km = (v: number) => (v < 1 ? `${Math.round(v * 1000)} m` : `${v.toFixed(1)} km`);
export const mins = (m: number) => (m < 60 ? `${Math.max(1, Math.round(m))} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);

export function dayLabel(t: number) {
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() + 86400_000).toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Compass point the wind blows from (e.g. 225° → "SW"). */
export function compass(deg: number) {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return pts[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Re-renders every `ms` so live things (ETAs, the drone) keep moving. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Small deterministic random generator (same seed → same sequence). */
export function rng(seed: string | number) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
