// Domain model shared by the web app and the API server.

export type LngLat = [number, number];
export type Pos3 = [number, number, number]; // lng, lat, altitude (m)

// ---------- Fleet ----------
export type AssetKind =
  | 'drone'
  | 'robotaxi'
  | 'car'
  | 'van'
  | 'truck'
  | 'cargo_bike'
  | 'humanoid'
  | 'amr'
  | 'sidewalk_robot'
  | 'robot_arm';

export type Ownership = 'own' | 'network' | 'external';
export type Autonomy = 'autonomous' | 'remote_piloted' | 'human_driven';
export type Protocol = 'sim' | 'mavlink' | 'ros2' | 'vda5050' | 'vendor_api' | 'mqtt';

export type AssetStatus =
  | 'idle'
  | 'en_route'
  | 'working'
  | 'charging'
  | 'returning'
  | 'paused'
  | 'holding'
  | 'offline'
  | 'estop'
  | 'maintenance';

export interface AssetSpecs {
  payloadKg: number;
  rangeKm: number;
  maxSpeedKmh: number;
  maxWindMs?: number;
  tempMinC?: number;
  tempMaxC?: number;
  ipRating?: string;
  capacityL?: number;
  energy: 'electric' | 'diesel' | 'petrol' | 'hybrid';
  consumptionPer100km?: number; // kWh or litres per 100 km
}

export interface AssetCompliance {
  operatorId?: string;
  flyerId?: string;
  remoteId?: string;
  classMark?: string;
  plate?: string;
  ulezCompliant?: boolean;
  insured?: boolean;
}

export interface ActiveRoute {
  path: Pos3[];
  cum: number[]; // cumulative metres per vertex
  totalM: number;
  progressM: number;
  purpose: 'to_pickup' | 'to_dropoff' | 'return' | 'goto' | 'task' | 'patrol';
  refId?: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  model: string;
  ownership: Ownership;
  providerId?: string; // for external / network assets
  autonomy: Autonomy;
  protocol: Protocol;
  endpoint?: string;
  siteId?: string; // assigned / home location
  status: AssetStatus;
  prevStatus?: AssetStatus;
  position: LngLat;
  altitude: number;
  heading: number;
  speedKmh: number;
  battery: number; // % (fuel level for combustion vehicles)
  specs: AssetSpecs;
  compliance?: AssetCompliance;
  route?: ActiveRoute;
  currentJobId?: string;
  currentTaskId?: string;
  workUntil?: number; // sim ms when current dwell ends
  driverId?: string;
  speedLimitKmh?: number;
  lightsOn?: boolean;
  firmware?: string;
  lastSeen: number;
  tags?: string[];
}

export type PersonRole = 'driver' | 'pilot' | 'operator' | 'picker' | 'technician' | 'supervisor';
export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  siteId?: string;
  status: 'on_shift' | 'off_shift' | 'on_break' | 'driving';
  licences: string[];
  assignedAssetId?: string;
  shift?: { start: string; end: string };
  phone?: string;
}

export type SiteKind = 'warehouse' | 'store' | 'drone_port' | 'depot' | 'charging_hub' | 'customer';
export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  address: string;
  position: LngLat;
  owner: 'own' | 'network';
  capacity?: number;
  openHours?: string;
  zones?: string[]; // internal zones (warehouses)
}

// ---------- Jobs ----------
export interface Place {
  name: string;
  position: LngLat;
  siteId?: string;
  address?: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
export interface Recurrence {
  freq: 'hourly' | 'daily' | 'weekly' | 'monthly';
  interval: number;
  byWeekday?: Weekday[];
  time?: string; // HH:mm
  until?: string; // ISO date
}

export type Timing =
  | { mode: 'now' }
  | { mode: 'scheduled'; at: string }
  | { mode: 'recurring'; rule: Recurrence; startAt: string };

export type CargoSize = 'envelope' | 'small' | 'medium' | 'large' | 'pallet';
export interface CargoSpec {
  description: string;
  weightKg: number;
  quantity: number;
  size: CargoSize;
  fragile?: boolean;
  temperature?: 'ambient' | 'chilled' | 'frozen';
  valueGbp?: number;
}

export type Priority = 'balanced' | 'fastest' | 'cheapest' | 'greenest';

export interface JobDraft {
  pickup?: Place;
  dropoff?: Place;
  cargo: CargoSpec;
  timing: Timing;
  priority: Priority;
  customer?: string;
  notes?: string;
}

export type ProviderCategory = 'drone' | 'autonomous_car' | 'courier' | 'van' | 'cargo_bike' | 'own_fleet';
export type QuoteBadge = 'cheapest' | 'fastest' | 'greenest' | 'recommended' | 'your_fleet';

export interface PriceLine {
  label: string;
  amount: number;
}

export interface QuoteOption {
  id: string;
  providerId: string;
  providerName: string;
  serviceName: string;
  category: ProviderCategory;
  assetId?: string;
  assetKind?: AssetKind;
  price: number;
  breakdown: PriceLine[];
  pickupEtaMin: number;
  durationMin: number;
  distanceKm: number;
  co2g: number;
  available: boolean;
  reasons: string[]; // why unavailable
  notes: string[]; // caveats / info
  badges: QuoteBadge[];
  simulated: boolean;
  route?: Pos3[];
  score?: number;
}

export type JobStatus =
  | 'scheduled'
  | 'assigned'
  | 'to_pickup'
  | 'loading'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'recurring';

export interface JobEvent {
  at: number;
  status: JobStatus;
  note?: string;
}

export interface Job {
  id: string;
  createdAt: number;
  customer: string;
  pickup: Place;
  dropoff: Place;
  cargo: CargoSpec;
  timing: Timing;
  priority: Priority;
  status: JobStatus;
  option: QuoteOption;
  assetId?: string;
  startAt: number; // sim ms when it should start (scheduled) or started
  nextRunAt?: number; // recurring series
  seriesId?: string; // occurrence of a recurring series
  completedAt?: number;
  etaAt?: number;
  history: JobEvent[];
  notes?: string;
}

// ---------- Machine tasks ----------
export type TaskType =
  | 'pick_pack'
  | 'restock'
  | 'load_vehicle'
  | 'unload'
  | 'inventory_scan'
  | 'inspection'
  | 'patrol'
  | 'security_sweep'
  | 'clean'
  | 'charge'
  | 'move_to_site'
  | 'maintenance'
  | 'custom';

export type TaskConstraint =
  | { kind: 'window' }
  | { kind: 'before_job'; jobId: string; offsetMin: number }
  | { kind: 'after_job'; jobId: string; offsetMin: number }
  | { kind: 'between_jobs'; jobId: string; jobId2: string }
  | { kind: 'fill_idle' };

export type TaskStatus = 'planned' | 'queued' | 'running' | 'done' | 'blocked' | 'cancelled';

export interface MachineTask {
  id: string;
  title: string;
  type: TaskType;
  assetIds: string[];
  siteId?: string;
  zone?: string;
  target?: Place;
  constraint: TaskConstraint;
  windowStart?: number; // sim ms
  windowEnd?: number;
  durationMin: number;
  recurrence?: Recurrence;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: TaskStatus;
  startedAt?: number;
  finishedAt?: number;
  createdAt: number;
  notes?: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  appliesTo: AssetKind[] | 'all';
}

// ---------- Control ----------
export type CommandName =
  | 'pause'
  | 'resume'
  | 'hold'
  | 'return_to_base'
  | 'goto'
  | 'estop'
  | 'release_estop'
  | 'takeoff'
  | 'land'
  | 'charge'
  | 'open_bay'
  | 'close_bay'
  | 'lights_on'
  | 'lights_off'
  | 'horn'
  | 'sleep'
  | 'wake'
  | 'reboot'
  | 'update_firmware'
  | 'set_speed_limit'
  | 'assign_site'
  | 'message_driver'
  | 'cancel_trip';

export interface CommandRecord {
  id: string;
  at: number;
  command: CommandName;
  targetIds: string[];
  params?: Record<string, unknown>;
  by: string;
  result: 'ok' | 'partial' | 'rejected';
  message: string;
  via: string;
}

// ---------- Airspace & weather ----------
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

export interface Landmark {
  id: string;
  name: string;
  position: LngLat;
  heightM: number;
  footprintM: [number, number]; // width, depth
}

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
  windDirDeg: number;
  precipMm: number;
  visibilityM: number;
  code: number;
  summary: string;
  hourly: WeatherHour[];
}

export type Flyability = 'go' | 'caution' | 'no_go';

// ---------- Settings ----------
export interface CostSettings {
  dieselPerLitre: number;
  petrolPerLitre: number;
  electricityPerKwh: number;
  driverWagePerHour: number;
  minBillableMinutes: number;
  congestionCharge: number;
  congestionChargeEvVan: number;
  ulezCharge: number;
  wearPerKmVan: number;
  wearPerKmTruck: number;
  robotSupervisionPerHour: number;
  handlingMinutes: number;
}

export interface PricingContext {
  now: number;
  weather: Weather;
  zones: Zone[];
  landmarks: Landmark[];
  assets: Asset[];
  sites: Site[];
  costs: CostSettings;
}
