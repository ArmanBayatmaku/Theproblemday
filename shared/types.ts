// Domain types shared by the web app and the API server.

export type LngLat = [number, number];
export type Pos3 = [number, number, number]; // lng, lat, altitude (m)

export interface Place {
  name: string;
  position: LngLat;
  address?: string;
}

// ---------- Airspace ----------
export type ZoneKind = 'frz' | 'restricted' | 'prison' | 'heliport' | 'temporary' | 'royal_park';
export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  shape: { type: 'circle'; center: LngLat; radiusM: number } | { type: 'polygon'; coords: LngLat[] };
  ceilingM: number;
  active: boolean;
  activeHours?: string;
  note?: string;
}

/** A tall structure the drones fly around. */
export interface Landmark {
  id: string;
  name: string;
  position: LngLat;
  heightM: number;
  footprintM: [number, number]; // width, depth
}

// ---------- Weather ----------
export interface WeatherHour {
  time: number;
  tempC: number;
  windMs120: number;
  gustMs: number;
  precipMm: number;
}

export interface Weather {
  fetchedAt: number;
  source: 'open-meteo' | 'simulated' | 'override';
  tempC: number;
  windMs10: number;
  windMs80: number;
  windMs120: number;
  gustMs: number;
  /** Direction the wind blows FROM, degrees clockwise from north. */
  windDirDeg: number;
  precipMm: number;
  visibilityM: number;
  code: number;
  summary: string;
  hourly: WeatherHour[];
}

export type Flyability = 'go' | 'caution' | 'no_go';

/** Weather limits of an aircraft. */
export interface FlightLimits {
  maxWindMs?: number;
  tempMinC?: number;
  tempMaxC?: number;
  ipRating?: string;
}

// ---------- Prices ----------
export interface PriceLine {
  label: string;
  amount: number;
}
