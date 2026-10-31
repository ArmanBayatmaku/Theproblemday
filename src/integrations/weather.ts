import type { Weather } from '@shared/types';
import { weatherSummary } from '@shared/weather';

/**
 * Live London weather from Open-Meteo (free, no key; free tier is for non-commercial use).
 * Wind at 80 m and 120 m matters most for drones. Returns undefined when offline.
 */
export async function fetchLondonWeather(signal?: AbortSignal): Promise<Weather | undefined> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278' +
    '&hourly=temperature_2m,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_direction_120m,wind_gusts_10m,precipitation,visibility,weather_code' +
    '&wind_speed_unit=ms&timezone=Europe%2FLondon&forecast_days=2';
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return undefined;
    const j = await res.json();
    const h = j.hourly;
    const times: number[] = h.time.map((t: string) => new Date(t).getTime());
    const now = Date.now();
    let i = times.findIndex((t) => t > now) - 1;
    if (i < 0) i = 0;
    const hourly = times.slice(i, i + 24).map((t, k) => ({
      time: t,
      tempC: h.temperature_2m[i + k],
      windMs120: h.wind_speed_120m[i + k],
      gustMs: h.wind_gusts_10m[i + k],
      precipMm: h.precipitation[i + k],
    }));
    return {
      fetchedAt: now,
      source: 'open-meteo',
      tempC: h.temperature_2m[i],
      windMs10: h.wind_speed_10m[i],
      windMs80: h.wind_speed_80m[i],
      windMs120: h.wind_speed_120m[i],
      gustMs: h.wind_gusts_10m[i],
      windDirDeg: h.wind_direction_120m[i],
      precipMm: h.precipitation[i],
      visibilityM: h.visibility?.[i] ?? 20000,
      code: h.weather_code[i],
      summary: weatherSummary(h.weather_code[i]),
      hourly,
    };
  } catch {
    return undefined;
  }
}
