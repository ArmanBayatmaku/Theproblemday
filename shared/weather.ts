import type { AssetSpecs, Flyability, Weather, WeatherHour } from './types';

export function weatherSummary(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

export type WeatherMode = 'live' | 'calm' | 'breezy' | 'storm';

/** Deterministic, plausible London weather used when the live feed is unavailable. */
export function simulatedWeather(now: number, mode: WeatherMode = 'live'): Weather {
  const d = new Date(now);
  const hour = d.getHours() + d.getMinutes() / 60;
  const base = 6.2 + 2.4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + 0.8 * Math.sin(now / 3.6e6);
  let windMs120 = Math.max(1.5, base);
  let gustMs = windMs120 * 1.35;
  let precip = hour > 15 && hour < 18 ? 0.3 : 0;
  let code = precip > 0 ? 61 : 3;
  if (mode === 'calm') { windMs120 = 3.1; gustMs = 4.2; precip = 0; code = 1; }
  if (mode === 'breezy') { windMs120 = 10.4; gustMs = 13.2; precip = 0; code = 3; }
  if (mode === 'storm') { windMs120 = 17.8; gustMs = 24.5; precip = 4.2; code = 63; }
  const hourly: WeatherHour[] = Array.from({ length: 24 }, (_, i) => {
    const t = now + i * 3600_000;
    const hh = new Date(t).getHours();
    const w = mode === 'live' ? Math.max(1.5, 6.2 + 2.4 * Math.sin(((hh - 9) / 24) * 2 * Math.PI)) : windMs120 * (0.9 + 0.2 * Math.sin(i));
    return { time: t, tempC: 9 + 4 * Math.sin(((hh - 9) / 24) * 2 * Math.PI), windMs120: w, gustMs: w * 1.35, precipMm: mode === 'storm' ? 3 : 0 };
  });
  return {
    fetchedAt: now,
    source: mode === 'live' ? 'simulated' : 'override',
    tempC: 9 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI),
    windMs10: windMs120 * 0.62,
    windMs80: windMs120 * 0.9,
    windMs120,
    gustMs,
    windDirDeg: 235,
    precipMm: precip,
    visibilityM: mode === 'storm' ? 3500 : 18000,
    code,
    summary: weatherSummary(code),
    hourly,
  };
}

export function applyWeatherMode(w: Weather, mode: WeatherMode): Weather {
  if (mode === 'live') return w;
  const o = simulatedWeather(Date.now(), mode);
  return { ...w, ...o, source: 'override', tempC: w.tempC, hourly: o.hourly };
}

export function effectiveWindMs(w: Weather): number {
  return Math.max(w.windMs120, w.gustMs * 0.85);
}

export function droneFlyability(w: Weather, specs: Pick<AssetSpecs, 'maxWindMs' | 'tempMinC' | 'tempMaxC' | 'ipRating'>): {
  status: Flyability;
  reasons: string[];
} {
  const reasons: string[] = [];
  let status: Flyability = 'go';
  const limit = specs.maxWindMs ?? 12;
  const wind = effectiveWindMs(w);
  if (wind > limit) {
    status = 'no_go';
    reasons.push(`Wind ${wind.toFixed(1)} m/s at flight height exceeds the ${limit} m/s limit`);
  } else if (wind > limit * 0.8) {
    status = 'caution';
    reasons.push(`Wind ${wind.toFixed(1)} m/s is close to the ${limit} m/s limit`);
  }
  if (specs.tempMinC !== undefined && w.tempC < specs.tempMinC) {
    status = 'no_go';
    reasons.push(`Temperature ${w.tempC.toFixed(0)}°C below ${specs.tempMinC}°C minimum`);
  }
  if (specs.tempMaxC !== undefined && w.tempC > specs.tempMaxC) {
    status = 'no_go';
    reasons.push(`Temperature ${w.tempC.toFixed(0)}°C above ${specs.tempMaxC}°C maximum`);
  }
  const ip = parseInt((specs.ipRating ?? 'IP43').replace(/\D/g, '').slice(1) || '3', 10);
  if (w.precipMm > 2 && ip < 5) {
    status = 'no_go';
    reasons.push(`Rain ${w.precipMm.toFixed(1)} mm/h exceeds ${specs.ipRating ?? 'IP43'} rating`);
  } else if (w.precipMm > 0.4 && status === 'go') {
    status = 'caution';
    reasons.push(`Rain ${w.precipMm.toFixed(1)} mm/h`);
  }
  if (w.visibilityM < 1500 && status === 'go') {
    status = 'caution';
    reasons.push(`Visibility ${(w.visibilityM / 1000).toFixed(1)} km`);
  }
  return { status, reasons };
}
