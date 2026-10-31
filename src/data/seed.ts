import type { Asset, AssetKind, Automation, Job, MachineTask, Person, Site } from '@shared/types';
import { destination } from '@shared/geo';

/** Deterministic RNG so the demo looks the same every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ORG = { name: 'FreshCo Retail', user: 'Arman', role: 'Operations lead' };

export const SEED_SITES: Site[] = [
  { id: 'S-PRDC', name: 'FreshCo Park Royal DC', kind: 'warehouse', address: 'Abbey Road, Park Royal, NW10', position: [-0.2775, 51.53], owner: 'own', capacity: 24, openHours: '24/7', zones: ['Inbound', 'Ambient', 'Chilled', 'Frozen', 'Pick', 'Pack', 'Dispatch', 'Charging'] },
  { id: 'S-BRF', name: 'FreshCo Barking Riverside', kind: 'warehouse', address: 'Renwick Road, Barking, IG11', position: [0.1155, 51.5185], owner: 'own', capacity: 16, openHours: '05:00–23:00', zones: ['Inbound', 'Ambient', 'Chilled', 'Pick', 'Pack', 'Dispatch', 'Charging'] },
  { id: 'S-KEN', name: 'FreshCo Kensington', kind: 'store', address: 'Kensington High Street, W8', position: [-0.1922, 51.5012], owner: 'own', openHours: '07:00–23:00' },
  { id: 'S-KX', name: "FreshCo King's Cross", kind: 'store', address: 'York Way, N1C', position: [-0.1225, 51.5345], owner: 'own', openHours: '07:00–23:00' },
  { id: 'S-CW', name: 'FreshCo Canary Wharf', kind: 'store', address: 'Jubilee Place, E14', position: [-0.0205, 51.504], owner: 'own', openHours: '07:00–22:00' },
  { id: 'S-SHO', name: 'FreshCo Shoreditch', kind: 'store', address: 'Great Eastern Street, EC2', position: [-0.0805, 51.5255], owner: 'own', openHours: '07:00–23:00' },
  { id: 'S-BRX', name: 'FreshCo Brixton', kind: 'store', address: 'Brixton Road, SW9', position: [-0.1148, 51.4628], owner: 'own', openHours: '07:00–23:00' },
  { id: 'S-DEP', name: 'FreshCo Wandsworth Depot', kind: 'depot', address: 'York Road, SW18', position: [-0.1915, 51.4605], owner: 'own', capacity: 12 },
  { id: 'S-EVH', name: 'FreshCo EV Hub Battersea', kind: 'charging_hub', address: 'Battersea Park Road, SW8', position: [-0.147, 51.479], owner: 'own', capacity: 10 },
  { id: 'P-NE', name: 'Hive Port Nine Elms', kind: 'drone_port', address: 'Nine Elms Lane, SW8', position: [-0.1335, 51.4818], owner: 'network', capacity: 8 },
  { id: 'P-BER', name: 'Hive Port Bermondsey', kind: 'drone_port', address: 'Rotherhithe New Road, SE16', position: [-0.0595, 51.493], owner: 'network', capacity: 6 },
  { id: 'P-STR', name: 'Hive Port Stratford', kind: 'drone_port', address: 'Stratford High Street, E15', position: [-0.0005, 51.5375], owner: 'network', capacity: 6 },
  { id: 'P-WC', name: 'Hive Port White City', kind: 'drone_port', address: 'Wood Lane, W12', position: [-0.2265, 51.5095], owner: 'network', capacity: 6 },
  { id: 'P-CAM', name: 'Hive Port Camden', kind: 'drone_port', address: 'Camley Street, N1C', position: [-0.13, 51.539], owner: 'network', capacity: 6 },
];

type Template = Omit<Asset, 'id' | 'name' | 'position' | 'siteId' | 'status' | 'battery' | 'lastSeen' | 'heading' | 'altitude' | 'speedKmh'>;

export const MODEL_TEMPLATES: Record<string, Template> = {
  'Hive Skylift H5': {
    kind: 'drone', model: 'Hive Skylift H5', ownership: 'network', providerId: 'hive-air', autonomy: 'remote_piloted', protocol: 'mavlink', firmware: 'PX4 1.16.2',
    specs: { payloadKg: 5, rangeKm: 28, maxSpeedKmh: 72, maxWindMs: 12, tempMinC: -10, tempMaxC: 40, ipRating: 'IP55', energy: 'electric' },
    compliance: { operatorId: 'GBR-OP-HIVE0000AIR1', classMark: 'UK2', remoteId: 'enabled', insured: true },
  },
  'Hive Courier H2': {
    kind: 'drone', model: 'Hive Courier H2', ownership: 'network', providerId: 'hive-air', autonomy: 'remote_piloted', protocol: 'mavlink', firmware: 'PX4 1.16.2',
    specs: { payloadKg: 2.5, rangeKm: 20, maxSpeedKmh: 65, maxWindMs: 10, tempMinC: -5, tempMaxC: 40, ipRating: 'IP54', energy: 'electric' },
    compliance: { operatorId: 'GBR-OP-HIVE0000AIR1', classMark: 'UK1', remoteId: 'enabled', insured: true },
  },
  'Refrigerated 7.5t truck': {
    kind: 'truck', model: 'Refrigerated 7.5t truck', ownership: 'own', autonomy: 'human_driven', protocol: 'vendor_api', tags: ['refrigerated'],
    specs: { payloadKg: 2800, rangeKm: 600, maxSpeedKmh: 90, capacityL: 28000, energy: 'diesel', consumptionPer100km: 26 },
    compliance: { plate: 'LK24 FRC', ulezCompliant: true, insured: true },
  },
  'E-van 3.5t': {
    kind: 'van', model: 'E-van 3.5t', ownership: 'own', autonomy: 'human_driven', protocol: 'vendor_api',
    specs: { payloadKg: 900, rangeKm: 260, maxSpeedKmh: 110, capacityL: 10000, energy: 'electric', consumptionPer100km: 28 },
    compliance: { plate: 'LN25 EVF', ulezCompliant: true, insured: true },
  },
  'Diesel van 3.5t (Euro 5)': {
    kind: 'van', model: 'Diesel van 3.5t (Euro 5)', ownership: 'own', autonomy: 'human_driven', protocol: 'vendor_api',
    specs: { payloadKg: 1000, rangeKm: 700, maxSpeedKmh: 110, capacityL: 11000, energy: 'diesel', consumptionPer100km: 9.5 },
    compliance: { plate: 'LB13 DVN', ulezCompliant: false, insured: true },
  },
  'Sidewalk courier S1': {
    kind: 'sidewalk_robot', model: 'Sidewalk courier S1', ownership: 'own', autonomy: 'autonomous', protocol: 'ros2', firmware: 'ROS 2 Jazzy · nav 3.4',
    specs: { payloadKg: 25, rangeKm: 18, maxSpeedKmh: 6, capacityL: 60, energy: 'electric', consumptionPer100km: 6, ipRating: 'IP67' },
  },
  'Tote AMR T300': {
    kind: 'amr', model: 'Tote AMR T300', ownership: 'own', autonomy: 'autonomous', protocol: 'vda5050', firmware: 'VDA 5050 v2.1',
    specs: { payloadKg: 300, rangeKm: 12, maxSpeedKmh: 7, energy: 'electric' },
  },
  'Humanoid H-1': {
    kind: 'humanoid', model: 'Humanoid H-1', ownership: 'own', autonomy: 'autonomous', protocol: 'ros2', firmware: 'H-OS 2.8',
    specs: { payloadKg: 20, rangeKm: 6, maxSpeedKmh: 5, energy: 'electric' },
  },
  'Palletiser arm P6': {
    kind: 'robot_arm', model: 'Palletiser arm P6', ownership: 'own', autonomy: 'autonomous', protocol: 'ros2', firmware: 'RC-9.2',
    specs: { payloadKg: 60, rangeKm: 0, maxSpeedKmh: 0, energy: 'electric' },
  },
  'Waymo Jaguar I-PACE': {
    kind: 'robotaxi', model: 'Waymo (simulated)', ownership: 'external', providerId: 'waymo', autonomy: 'autonomous', protocol: 'vendor_api',
    specs: { payloadKg: 60, rangeKm: 300, maxSpeedKmh: 80, capacityL: 650, energy: 'electric' },
  },
  'Uber courier car': {
    kind: 'car', model: 'Uber courier (simulated)', ownership: 'external', providerId: 'uber-courier', autonomy: 'human_driven', protocol: 'vendor_api',
    specs: { payloadKg: 6.8, rangeKm: 500, maxSpeedKmh: 80, energy: 'hybrid' },
  },
  'CityHop e-cargo bike': {
    kind: 'cargo_bike', model: 'CityHop e-cargo (demo partner)', ownership: 'external', providerId: 'cityhop', autonomy: 'human_driven', protocol: 'vendor_api',
    specs: { payloadKg: 80, rangeKm: 60, maxSpeedKmh: 25, energy: 'electric' },
  },
  'Thames Express van': {
    kind: 'van', model: 'Thames Express van (demo partner)', ownership: 'external', providerId: 'thames-express', autonomy: 'human_driven', protocol: 'vendor_api',
    specs: { payloadKg: 800, rangeKm: 500, maxSpeedKmh: 100, energy: 'diesel' },
  },
};

const INDOOR: AssetKind[] = ['amr', 'humanoid', 'robot_arm'];

function make(id: string, name: string, model: string, site: Site | undefined, r: () => number, now: number, extra: Partial<Asset> = {}): Asset {
  const t = MODEL_TEMPLATES[model];
  const jitter = INDOOR.includes(t.kind) ? 35 : 25;
  const position = site ? destination(site.position, r() * 360, r() * jitter) : ([-0.12, 51.51] as [number, number]);
  return {
    ...t,
    specs: { ...t.specs },
    compliance: t.compliance ? { ...t.compliance } : undefined,
    id,
    name,
    position,
    siteId: site?.id,
    status: 'idle',
    battery: Math.round(62 + r() * 37),
    heading: Math.round(r() * 360),
    altitude: 0,
    speedKmh: 0,
    lastSeen: now,
    ...extra,
  };
}

export function seedAssets(now: number): Asset[] {
  const r = rng(42);
  const site = (id: string) => SEED_SITES.find((s) => s.id === id);
  const out: Asset[] = [];
  const drones: [string, string][] = [
    ['DR-01', 'P-NE'], ['DR-02', 'P-NE'], ['DR-03', 'P-NE'], ['DR-04', 'P-BER'], ['DR-05', 'P-BER'],
    ['DR-06', 'P-STR'], ['DR-07', 'P-STR'], ['DR-08', 'P-WC'], ['DR-09', 'P-CAM'], ['DR-10', 'P-CAM'],
  ];
  drones.forEach(([id, s], i) => out.push(make(id, `Skylift ${id.slice(3)}`, i % 4 === 3 ? 'Hive Courier H2' : 'Hive Skylift H5', site(s), r, now)));
  out.push(make('TR-01', 'Chilled truck 1', 'Refrigerated 7.5t truck', site('S-PRDC'), r, now, { driverId: 'D-01' }));
  out.push(make('TR-02', 'Chilled truck 2', 'Refrigerated 7.5t truck', site('S-BRF'), r, now, { driverId: 'D-02' }));
  out.push(make('VN-01', 'E-van 1', 'E-van 3.5t', site('S-PRDC'), r, now, { driverId: 'D-03' }));
  out.push(make('VN-02', 'E-van 2', 'E-van 3.5t', site('S-PRDC'), r, now, { driverId: 'D-04' }));
  out.push(make('VN-03', 'E-van 3', 'E-van 3.5t', site('S-BRF'), r, now));
  out.push(make('VN-04', 'E-van 4', 'E-van 3.5t', site('S-DEP'), r, now));
  out.push(make('VN-05', 'Diesel van', 'Diesel van 3.5t (Euro 5)', site('S-DEP'), r, now));
  (['S-KEN', 'S-KX', 'S-SHO', 'S-BRX'] as const).forEach((s, i) => out.push(make(`SR-0${i + 1}`, `Sidewalk bot ${i + 1}`, 'Sidewalk courier S1', site(s), r, now)));
  ['S-PRDC', 'S-PRDC', 'S-PRDC', 'S-PRDC', 'S-BRF', 'S-BRF'].forEach((s, i) => out.push(make(`AMR-0${i + 1}`, `Tote AMR ${i + 1}`, 'Tote AMR T300', site(s), r, now)));
  ['S-PRDC', 'S-PRDC', 'S-BRF', 'S-CW'].forEach((s, i) => out.push(make(`HU-0${i + 1}`, `Humanoid ${i + 1}`, 'Humanoid H-1', site(s), r, now)));
  out.push(make('RA-01', 'Palletiser', 'Palletiser arm P6', site('S-PRDC'), r, now));

  // External marketplace vehicles (read-only, simulated) roaming central London.
  const roam = (prefix: string, model: string, n: number, radius: number) => {
    for (let i = 1; i <= n; i++) {
      const p = destination([-0.115, 51.508], r() * 360, Math.sqrt(r()) * radius);
      out.push(make(`${prefix}-${String(i).padStart(2, '0')}`, `${prefix}-${String(i).padStart(2, '0')}`, model, undefined, r, now, { position: p }));
    }
  };
  roam('WY', 'Waymo Jaguar I-PACE', 12, 8000);
  roam('UB', 'Uber courier car', 8, 9000);
  roam('CB', 'CityHop e-cargo bike', 5, 5000);
  roam('TX', 'Thames Express van', 4, 11000);
  return out;
}

export const SEED_PEOPLE: Person[] = [
  { id: 'D-01', name: 'Sam Okafor', role: 'driver', siteId: 'S-PRDC', status: 'on_shift', licences: ['C1', 'B'], assignedAssetId: 'TR-01', shift: { start: '06:00', end: '15:00' } },
  { id: 'D-02', name: 'Priya Shah', role: 'driver', siteId: 'S-BRF', status: 'on_shift', licences: ['C1', 'B'], assignedAssetId: 'TR-02', shift: { start: '07:00', end: '16:00' } },
  { id: 'D-03', name: 'Tom Byrne', role: 'driver', siteId: 'S-PRDC', status: 'on_shift', licences: ['B'], assignedAssetId: 'VN-01', shift: { start: '08:00', end: '17:00' } },
  { id: 'D-04', name: 'Aisha Rahman', role: 'driver', siteId: 'S-PRDC', status: 'on_break', licences: ['B'], assignedAssetId: 'VN-02', shift: { start: '10:00', end: '19:00' } },
  { id: 'PL-01', name: 'Lewis Clark', role: 'pilot', siteId: 'P-NE', status: 'on_shift', licences: ['GVC', 'A2 CofC'], shift: { start: '07:00', end: '19:00' } },
  { id: 'OP-01', name: 'Mei Chen', role: 'operator', siteId: 'S-PRDC', status: 'on_shift', licences: ['Robot fleet supervisor'], shift: { start: '06:00', end: '14:00' } },
  { id: 'TE-01', name: 'Jonas Weber', role: 'technician', siteId: 'S-DEP', status: 'off_shift', licences: ['EV high-voltage'], shift: { start: '12:00', end: '20:00' } },
];

export const SEED_AUTOMATIONS: Automation[] = [
  { id: 'auto-charge', name: 'Auto-charge', description: 'When a machine drops below 20% battery and is idle, send it to its home charger.', enabled: true, appliesTo: 'all' },
  { id: 'weather-fallback', name: 'Weather fallback', description: 'If wind or rain grounds the drones, re-book waiting drone jobs with the next best method.', enabled: true, appliesTo: ['drone'] },
  { id: 'return-home', name: 'Return after delivery', description: 'After a drop-off, own and network machines return to their home location.', enabled: true, appliesTo: 'all' },
  { id: 'fill-idle', name: 'Fill idle time', description: 'Robots with an idle gap of 20+ min pick up queued tasks for their site.', enabled: true, appliesTo: ['amr', 'humanoid'] },
  { id: 'geofence', name: 'Airspace guard', description: 'Reject drone commands and routes that would enter active restricted airspace.', enabled: true, appliesTo: ['drone'] },
];

export function seedTasks(now: number): MachineTask[] {
  const at = (h: number, m = 0) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  return [
    { id: 'T-201', title: 'Restock chilled aisle', type: 'restock', assetIds: ['AMR-02'], siteId: 'S-PRDC', zone: 'Chilled', constraint: { kind: 'window' }, windowStart: now + 6 * 60_000, windowEnd: now + 46 * 60_000, durationMin: 35, recurrence: { freq: 'daily', interval: 1, time: '06:00' }, priority: 'normal', status: 'planned', createdAt: now },
    { id: 'T-202', title: 'Pre-load truck for King’s Cross run', type: 'load_vehicle', assetIds: ['HU-01', 'AMR-01'], siteId: 'S-PRDC', zone: 'Dispatch', constraint: { kind: 'before_job', jobId: 'J-1003', offsetMin: 10 }, durationMin: 25, priority: 'high', status: 'planned', createdAt: now },
    { id: 'T-203', title: 'Inventory scan — zone B', type: 'inventory_scan', assetIds: ['AMR-04'], siteId: 'S-PRDC', zone: 'Ambient', constraint: { kind: 'fill_idle' }, durationMin: 30, priority: 'low', status: 'queued', createdAt: now },
    { id: 'T-204', title: 'Clean loading bay after dispatch', type: 'clean', assetIds: ['HU-03'], siteId: 'S-BRF', zone: 'Dispatch', constraint: { kind: 'after_job', jobId: 'J-1002', offsetMin: 5 }, durationMin: 20, priority: 'normal', status: 'planned', createdAt: now },
    { id: 'T-205', title: 'Store security patrol after close', type: 'security_sweep', assetIds: ['SR-03'], siteId: 'S-SHO', constraint: { kind: 'window' }, windowStart: at(23, 5), windowEnd: at(23, 50), durationMin: 40, recurrence: { freq: 'daily', interval: 1, time: '23:05' }, priority: 'normal', status: 'planned', createdAt: now },
    { id: 'T-206', title: 'Shelf facing & price check', type: 'pick_pack', assetIds: ['HU-04'], siteId: 'S-CW', constraint: { kind: 'window' }, windowStart: now + 20 * 60_000, windowEnd: now + 80 * 60_000, durationMin: 45, priority: 'normal', status: 'planned', createdAt: now },
    { id: 'T-207', title: 'Palletise outbound order', type: 'pick_pack', assetIds: ['RA-01'], siteId: 'S-PRDC', zone: 'Pack', constraint: { kind: 'between_jobs', jobId: 'J-1002', jobId2: 'J-1003' }, durationMin: 30, priority: 'high', status: 'planned', createdAt: now },
  ];
}

export interface SeedJobSpec {
  id: string;
  customer: string;
  from: string; // site id or place name
  to: string;
  cargo: Job['cargo'];
  timing: 'now' | { offsetMin: number } | { tomorrowAt: string } | { recurring: import('@shared/types').Recurrence };
  provider: string; // provider id or own:<assetId>
}

export const SEED_JOBS: SeedJobSpec[] = [
  { id: 'J-1001', customer: 'Online order #88190', from: 'S-KEN', to: 'Notting Hill', cargo: { description: 'Pharmacy & essentials bag', weightKg: 1.8, quantity: 1, size: 'small' }, timing: 'now', provider: 'hive-air' },
  { id: 'J-1002', customer: 'Store replenishment', from: 'S-PRDC', to: 'S-KEN', cargo: { description: '14 crates of fresh produce', weightKg: 320, quantity: 14, size: 'large', temperature: 'chilled' }, timing: 'now', provider: 'own:VN-01' },
  { id: 'J-1003', customer: 'Store replenishment', from: 'S-PRDC', to: 'S-KX', cargo: { description: '6 pallets chilled restock', weightKg: 1200, quantity: 6, size: 'pallet', temperature: 'chilled' }, timing: { offsetMin: 95 }, provider: 'own:TR-01' },
  { id: 'J-1004', customer: 'Morning bakery run', from: 'S-BRF', to: 'S-CW', cargo: { description: '8 crates bakery & dairy', weightKg: 180, quantity: 8, size: 'large', temperature: 'chilled' }, timing: { recurring: { freq: 'weekly', interval: 1, byWeekday: [0, 1, 2, 3, 4], time: '09:00' } }, provider: 'own:VN-03' },
  { id: 'J-1005', customer: 'Catering — Bank office', from: 'S-SHO', to: 'Bank', cargo: { description: '2 boxes of catering', weightKg: 8, quantity: 2, size: 'medium' }, timing: 'now', provider: 'waymo' },
  { id: 'J-1006', customer: 'Click & collect bundle', from: 'S-KX', to: 'Camden', cargo: { description: '3 bags groceries', weightKg: 22, quantity: 3, size: 'medium' }, timing: { tomorrowAt: '10:30' }, provider: 'cityhop' },
  { id: 'J-1007', customer: 'Online order #88213', from: 'S-BRX', to: 'Clapham', cargo: { description: 'Small parcel', weightKg: 2.4, quantity: 1, size: 'small' }, timing: { offsetMin: 12 }, provider: 'hive-air' },
  { id: 'J-1008', customer: 'Online order #88217', from: 'S-SHO', to: 'Liverpool Street', cargo: { description: 'Gift box', weightKg: 3, quantity: 1, size: 'small' }, timing: { offsetMin: 4 }, provider: 'uber-courier' },
  { id: 'J-1009', customer: 'Chilled restock (Mon & Thu)', from: 'S-BRF', to: 'S-SHO', cargo: { description: '4 pallets chilled', weightKg: 950, quantity: 4, size: 'pallet', temperature: 'chilled' }, timing: { recurring: { freq: 'weekly', interval: 1, byWeekday: [0, 3], time: '06:30' } }, provider: 'own:TR-02' },
];

/** Pairs used for today's delivered history and for the optional demo traffic generator. */
export const DEMO_ROUTES: [string, string][] = [
  ['S-KEN', 'Notting Hill'], ['S-KEN', 'South Kensington'], ['S-KEN', 'Chelsea'], ['S-KX', 'Camden'], ['S-KX', 'Angel'],
  ['S-KX', 'Euston'], ['S-SHO', 'Bank'], ['S-SHO', 'Hackney'], ['S-SHO', 'Whitechapel'], ['S-SHO', 'Old Street'],
  ['S-BRX', 'Clapham'], ['S-BRX', 'Vauxhall'], ['S-BRX', 'Peckham'], ['S-CW', 'Limehouse'], ['S-CW', 'Wapping'],
  ['S-PRDC', 'Wembley'], ['S-PRDC', 'Ealing'], ['S-PRDC', 'Hammersmith'], ['S-BRF', 'Barking'], ['S-BRF', 'Stratford'],
  ['S-KEN', 'Fulham'], ['S-BRX', 'Elephant and Castle'], ['S-KX', 'Holborn'], ['S-SHO', 'Bethnal Green'],
];
