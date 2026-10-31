export const money = (n: number) => `£${n.toFixed(2)}`;
export const money0 = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export function mins(m: number): string {
  if (!Number.isFinite(m)) return '—';
  const r = Math.max(0, Math.round(m));
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const mm = r % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const clockSec = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export function ago(t: number, now: number): string {
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const kg = (n: number) => (n < 1 ? `${Math.round(n * 1000)} g` : n >= 1000 ? `${(n / 1000).toFixed(1)} t` : `${+n.toFixed(1)} kg`);
export const co2 = (g: number) => (g < 1000 ? `${Math.round(g)} g` : `${(g / 1000).toFixed(1)} kg`);
export const pct = (n: number) => `${Math.round(n)}%`;
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
