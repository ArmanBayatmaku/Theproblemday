import type { Asset, JobDraft, LngLat, PriceLine, PricingContext, QuoteBadge, QuoteOption, Site } from './types';
import { distanceM, pointInZone } from './geo';
import { approxRoadRoute, congestionChargeApplies, planDroneRoute, roadSpeedKmh } from './routing';
import { droneFlyability } from './weather';
import { timingStart } from './schedule';
import { providerById } from './providers';

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: PriceLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

const SIMULATED_WAYMO_AREA: { center: LngLat; radiusM: number } = { center: [-0.12, 51.505], radiusM: 10500 };

function nearest<T extends { position: LngLat }>(items: T[], p: LngLat): { item?: T; dist: number } {
  let best: T | undefined;
  let dist = Infinity;
  for (const it of items) {
    const d = distanceM(it.position, p);
    if (d < dist) {
      dist = d;
      best = it;
    }
  }
  return { item: best, dist };
}

function base(
  providerId: string,
  partial: Partial<QuoteOption> & Pick<QuoteOption, 'price' | 'pickupEtaMin' | 'durationMin' | 'distanceKm' | 'co2g' | 'breakdown'>,
): QuoteOption {
  const p = providerById(providerId);
  return {
    id: `${providerId}:${partial.assetId ?? 'any'}`,
    providerId,
    providerName: p?.name ?? providerId,
    serviceName: p?.service ?? '',
    category: p?.category ?? 'courier',
    available: true,
    reasons: [],
    notes: [],
    badges: [],
    simulated: p ? p.integration === 'simulated' : false,
    ...partial,
  };
}

// ---------------- Hive Air (our drones) ----------------
function quoteHiveAir(d: Required<Pick<JobDraft, 'pickup' | 'dropoff'>> & JobDraft, ctx: PricingContext): QuoteOption {
  const drones = ctx.assets.filter(
    (a) => a.kind === 'drone' && a.ownership !== 'external' && !['offline', 'estop', 'maintenance'].includes(a.status),
  );
  const reasons: string[] = [];
  const notes: string[] = [];
  const weight = d.cargo.weightKg;
  const suitable = drones.filter((a) => a.specs.payloadKg >= weight);
  const ports = ctx.sites.filter((s) => s.kind === 'drone_port');
  if (d.cargo.size === 'pallet' || d.cargo.size === 'large') reasons.push('Too large for a drone payload bay');
  if (!suitable.length) reasons.push(`${weight} kg exceeds the largest drone payload (${Math.max(0, ...drones.map((a) => a.specs.payloadKg))} kg)`);
  if (d.cargo.temperature === 'frozen') reasons.push('Frozen goods need a refrigerated vehicle');

  const plan = planDroneRoute(d.pickup.position, d.dropoff.position, ctx.zones, ctx.landmarks);
  for (const z of plan.blockedBy) {
    const side = pointInZone(d.pickup.position, z) ? 'pickup' : 'drop-off';
    reasons.push(`${side === 'pickup' ? 'Pickup' : 'Drop-off'} is inside ${z.name} — needs airspace permission`);
  }
  if (plan.avoided.length) {
    notes.push(`Routed around ${plan.avoided.slice(0, 3).join(', ')} (+${Math.max(0, plan.distanceKm - plan.straightKm).toFixed(1)} km)`);
  }

  const idle = suitable.filter((a) => a.status === 'idle' || a.status === 'charging');
  const pool = idle.length ? idle : suitable;
  const { item: drone, dist: toPickupM } = nearest(pool, d.pickup.position);
  const specs = drone?.specs ?? { maxWindMs: 12, payloadKg: 5, rangeKm: 25, maxSpeedKmh: 70, energy: 'electric' as const };
  const fly = droneFlyability(ctx.weather, specs);
  if (fly.status === 'no_go') reasons.push(...fly.reasons);
  else if (fly.status === 'caution') notes.push(...fly.reasons);

  const { item: homePort } = nearest(ports, d.dropoff.position);
  const legKm = toPickupM / 1000 + plan.distanceKm + (homePort ? distanceM(d.dropoff.position, homePort.position) / 1000 : 0);
  const usableKm = (specs.rangeKm * (drone?.battery ?? 100)) / 100;
  if (drone && legKm > usableKm) reasons.push(`Round trip ${legKm.toFixed(1)} km exceeds remaining range (${usableKm.toFixed(0)} km)`);
  if (drone && !idle.length) notes.push('All drones busy — waits for the next free aircraft');

  const cruise = 55;
  const pickupEtaMin = 2 + (toPickupM / 1000 / cruise) * 60 + (idle.length ? 0 : 12);
  const durationMin = (plan.distanceKm / cruise) * 60 + 3;
  const breakdown: PriceLine[] = [
    { label: 'Base fare', amount: 3.9 },
    { label: `Flight ${plan.distanceKm.toFixed(1)} km × £1.15`, amount: round2(plan.distanceKm * 1.15) },
  ];
  if (weight > 2) breakdown.push({ label: `Weight surcharge ${(weight - 2).toFixed(1)} kg`, amount: round2((weight - 2) * 0.6) });
  if (d.priority === 'fastest') breakdown.push({ label: 'Priority dispatch', amount: 1.5 });
  notes.push('Lowered by winch — recipient collects from the marked spot');
  return base('hive-air', {
    assetId: drone?.id,
    assetKind: 'drone',
    price: sum(breakdown),
    breakdown,
    pickupEtaMin,
    durationMin,
    distanceKm: plan.distanceKm,
    co2g: Math.round(plan.distanceKm * 8),
    available: reasons.length === 0,
    reasons,
    notes,
    route: plan.path,
  });
}

// ---------------- Road-based marketplace providers ----------------
interface RoadProviderCfg {
  id: string;
  baseFare: number;
  perKm: number;
  perMin: number;
  maxKg: number;
  maxValue?: number;
  allowPallet: boolean;
  co2PerKm: number;
  fixedPickupMin?: number;
  speedKmh?: number; // fixed speed (bikes)
  maxKm?: number;
  serviceArea?: { center: LngLat; radiusM: number };
  fleetKind?: Asset['kind'];
  extraNotes?: string[];
}

const ROAD_PROVIDERS: RoadProviderCfg[] = [
  {
    id: 'waymo',
    baseFare: 3.2,
    perKm: 1.25,
    perMin: 0.3,
    maxKg: 60,
    allowPallet: false,
    co2PerKm: 45,
    serviceArea: SIMULATED_WAYMO_AREA,
    fleetKind: 'robotaxi',
    extraNotes: ['Kerbside handover — sender loads the boot, recipient unlocks with a code'],
  },
  { id: 'uber-courier', baseFare: 4.5, perKm: 1.05, perMin: 0.2, maxKg: 6.8, maxValue: 200, allowPallet: false, co2PerKm: 110, fleetKind: 'car' },
  { id: 'thames-express', baseFare: 14, perKm: 1.55, perMin: 0.1, maxKg: 800, allowPallet: true, co2PerKm: 210, fixedPickupMin: 35, fleetKind: 'van' },
  { id: 'cityhop', baseFare: 5.5, perKm: 1.4, perMin: 0, maxKg: 80, allowPallet: false, co2PerKm: 3, fixedPickupMin: 15, speedKmh: 16, maxKm: 9, fleetKind: 'cargo_bike' },
];

function quoteRoad(cfg: RoadProviderCfg, d: Required<Pick<JobDraft, 'pickup' | 'dropoff'>> & JobDraft, ctx: PricingContext, start: Date): QuoteOption {
  const reasons: string[] = [];
  const notes: string[] = [...(cfg.extraNotes ?? [])];
  const road = approxRoadRoute(d.pickup.position, d.dropoff.position);
  const speed = cfg.speedKmh ?? roadSpeedKmh(d.pickup.position, d.dropoff.position, start);
  const durationMin = (road.distanceKm / speed) * 60 + 4;

  if (d.cargo.weightKg > cfg.maxKg) reasons.push(`${d.cargo.weightKg} kg exceeds the ${cfg.maxKg} kg limit`);
  if (!cfg.allowPallet && d.cargo.size === 'pallet') reasons.push('Pallets need a van or truck');
  if (cfg.maxValue && (d.cargo.valueGbp ?? 0) > cfg.maxValue) reasons.push(`Declared value over £${cfg.maxValue}`);
  if (cfg.maxKm && road.distanceKm > cfg.maxKm) reasons.push(`${road.distanceKm.toFixed(1)} km is beyond the ${cfg.maxKm} km range`);
  if (cfg.serviceArea) {
    const out = [d.pickup.position, d.dropoff.position].some((p) => distanceM(p, cfg.serviceArea!.center) > cfg.serviceArea!.radiusM);
    if (out) reasons.push('Outside the (simulated) service area');
  }
  if (d.cargo.temperature === 'frozen' && cfg.id !== 'thames-express') reasons.push('No frozen-goods capability');
  if (d.cargo.temperature === 'chilled' && cfg.id !== 'thames-express') notes.push('No refrigeration — insulated packaging recommended');
  if (cfg.id === 'cityhop' && ctx.weather.precipMm > 1) notes.push('Rain may slow bikes slightly');

  let pickupEtaMin = cfg.fixedPickupMin ?? 7;
  if (cfg.fleetKind && !cfg.fixedPickupMin) {
    const fleet = ctx.assets.filter((a) => a.ownership === 'external' && a.providerId === cfg.id && a.status !== 'offline');
    const { dist } = nearest(fleet, d.pickup.position);
    if (Number.isFinite(dist)) pickupEtaMin = 2 + ((dist / 1000) * 1.35 / roadSpeedKmh(d.pickup.position, d.pickup.position, start)) * 60;
  }

  const breakdown: PriceLine[] = [
    { label: 'Base fare', amount: cfg.baseFare },
    { label: `Distance ${road.distanceKm.toFixed(1)} km × £${cfg.perKm.toFixed(2)}`, amount: round2(road.distanceKm * cfg.perKm) },
  ];
  if (cfg.perMin) breakdown.push({ label: `Time ${Math.round(durationMin)} min × £${cfg.perMin.toFixed(2)}`, amount: round2(durationMin * cfg.perMin) });
  if (d.cargo.quantity > 3 && cfg.id !== 'thames-express') breakdown.push({ label: 'Multi-item handling', amount: 2 });

  const o = base(cfg.id, {
    price: sum(breakdown),
    breakdown,
    pickupEtaMin,
    durationMin,
    distanceKm: road.distanceKm,
    co2g: Math.round(road.distanceKm * cfg.co2PerKm),
    available: reasons.length === 0,
    reasons,
    notes,
    route: road.path,
    assetKind: cfg.fleetKind,
  });
  if (o.simulated) o.notes.push('Simulated quote — integration not connected yet');
  return o;
}

// ---------------- Own fleet ----------------
function quoteOwnAsset(a: Asset, d: Required<Pick<JobDraft, 'pickup' | 'dropoff'>> & JobDraft, ctx: PricingContext, start: Date, home?: Site): QuoteOption {
  const reasons: string[] = [];
  const notes: string[] = [];
  const c = ctx.costs;
  const deadhead = approxRoadRoute(a.position, d.pickup.position).distanceKm;
  const main = approxRoadRoute(d.pickup.position, d.dropoff.position);
  const back = home ? approxRoadRoute(d.dropoff.position, home.position).distanceKm : main.distanceKm;
  const totalKm = deadhead + main.distanceKm + back;
  const isRobot = a.kind === 'sidewalk_robot';
  const speed = isRobot ? 6 : roadSpeedKmh(d.pickup.position, d.dropoff.position, start) * (a.kind === 'truck' ? 0.85 : 1);
  const drivingMin = (totalKm / speed) * 60;
  const handling = c.handlingMinutes * (a.kind === 'truck' ? 1.5 : 1);
  const totalMin = drivingMin + handling;

  if (a.specs.payloadKg < d.cargo.weightKg) reasons.push(`${d.cargo.weightKg} kg exceeds ${a.specs.payloadKg} kg payload`);
  if (isRobot && main.distanceKm > 3) reasons.push('Sidewalk robots cover trips under 3 km');
  if (d.cargo.size === 'pallet' && a.kind !== 'truck' && a.kind !== 'van') reasons.push('Pallets need a van or truck');
  if (d.cargo.temperature === 'frozen' && !(a.tags ?? []).includes('refrigerated')) reasons.push('Not refrigerated');
  if (['offline', 'estop', 'maintenance'].includes(a.status)) reasons.push(`Vehicle is ${a.status}`);
  if (a.status !== 'idle' && a.status !== 'charging' && !['offline', 'estop', 'maintenance'].includes(a.status)) {
    notes.push('Currently busy — starts after its current run');
  }

  const breakdown: PriceLine[] = [];
  if (a.autonomy === 'human_driven') {
    const billable = Math.max(c.minBillableMinutes, totalMin);
    breakdown.push({ label: `Driver ${Math.round(billable)} min × £${c.driverWagePerHour}/h`, amount: round2((billable / 60) * c.driverWagePerHour) });
  } else {
    breakdown.push({ label: `Remote supervision ${Math.round(totalMin)} min`, amount: round2((totalMin / 60) * c.robotSupervisionPerHour) });
  }
  const per100 = a.specs.consumptionPer100km ?? (a.specs.energy === 'electric' ? 25 : 12);
  const unit = a.specs.energy === 'electric' ? c.electricityPerKwh : a.specs.energy === 'diesel' ? c.dieselPerLitre : c.petrolPerLitre;
  breakdown.push({
    label: `${a.specs.energy === 'electric' ? 'Charging' : 'Fuel'} ${totalKm.toFixed(1)} km incl. return`,
    amount: round2((totalKm / 100) * per100 * unit),
  });
  const wear = a.kind === 'truck' ? c.wearPerKmTruck : isRobot ? 0.05 : c.wearPerKmVan;
  breakdown.push({ label: `Wear & depreciation × ${totalKm.toFixed(1)} km`, amount: round2(totalKm * wear) });
  if (!isRobot && congestionChargeApplies(start, d.pickup.position, d.dropoff.position)) {
    const ev = a.specs.energy === 'electric';
    breakdown.push({ label: `Congestion Charge${ev ? ' (EV, Auto Pay)' : ''}`, amount: ev ? c.congestionChargeEvVan : c.congestionCharge });
    notes.push('Daily charge — shared if the vehicle makes other trips in the zone today');
  }
  if (!isRobot && a.compliance?.ulezCompliant === false) breakdown.push({ label: 'ULEZ daily charge', amount: c.ulezCharge });

  const kgCo2PerUnit = a.specs.energy === 'electric' ? 0.15 : 2.6; // per kWh grid / per litre diesel
  const o = base('own-fleet', {
    id: `own:${a.id}`,
    providerName: a.name,
    serviceName: `Your fleet · ${a.model}`,
    category: 'own_fleet',
    assetId: a.id,
    assetKind: a.kind,
    price: sum(breakdown),
    breakdown,
    pickupEtaMin: (deadhead / speed) * 60 + 5,
    durationMin: (main.distanceKm / speed) * 60 + handling / 2,
    distanceKm: main.distanceKm,
    co2g: Math.round((totalKm / 100) * per100 * kgCo2PerUnit * 1000),
    available: reasons.length === 0,
    reasons,
    notes,
    route: main.path,
    simulated: false,
  });
  o.badges.push('your_fleet');
  return o;
}

// ---------------- Ranking ----------------
function rank(options: QuoteOption[], priority: JobDraft['priority']): QuoteOption[] {
  const avail = options.filter((o) => o.available);
  if (avail.length) {
    const minP = Math.min(...avail.map((o) => o.price));
    const maxP = Math.max(...avail.map((o) => o.price));
    const times = avail.map((o) => o.pickupEtaMin + o.durationMin);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const minC = Math.min(...avail.map((o) => o.co2g));
    const maxC = Math.max(...avail.map((o) => o.co2g));
    const n = (v: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo));
    const w =
      priority === 'cheapest' ? [0.75, 0.15, 0.1] : priority === 'fastest' ? [0.15, 0.75, 0.1] : priority === 'greenest' ? [0.25, 0.15, 0.6] : [0.45, 0.35, 0.2];
    for (const o of avail) {
      o.score = w[0] * n(o.price, minP, maxP) + w[1] * n(o.pickupEtaMin + o.durationMin, minT, maxT) + w[2] * n(o.co2g, minC, maxC);
    }
    const tag = (pred: (o: QuoteOption) => number, badge: QuoteBadge) => {
      const best = [...avail].sort((a, b) => pred(a) - pred(b))[0];
      if (best && !best.badges.includes(badge)) best.badges.push(badge);
    };
    tag((o) => o.price, 'cheapest');
    tag((o) => o.pickupEtaMin + o.durationMin, 'fastest');
    tag((o) => o.co2g, 'greenest');
    tag((o) => o.score ?? 0, 'recommended');
  }
  return [...options].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return (a.score ?? 0) - (b.score ?? 0);
  });
}

/** Quotes every method — our drones, marketplace partners and the customer's own fleet. */
export function quoteAll(draft: JobDraft, ctx: PricingContext): QuoteOption[] {
  if (!draft.pickup || !draft.dropoff) return [];
  const d = draft as Required<Pick<JobDraft, 'pickup' | 'dropoff'>> & JobDraft;
  const start = new Date(timingStart(draft.timing, ctx.now));
  const options: QuoteOption[] = [quoteHiveAir(d, ctx), ...ROAD_PROVIDERS.map((cfg) => quoteRoad(cfg, d, ctx, start))];

  const ownKinds: Asset['kind'][] = ['van', 'truck', 'car', 'sidewalk_robot'];
  const own = ctx.assets.filter((a) => a.ownership === 'own' && ownKinds.includes(a.kind));
  // One option per own vehicle type, using the closest available unit of that type.
  const byModel = new Map<string, Asset[]>();
  for (const a of own) byModel.set(`${a.kind}:${a.model}`, [...(byModel.get(`${a.kind}:${a.model}`) ?? []), a]);
  for (const group of byModel.values()) {
    const ready = group.filter((a) => a.status === 'idle' || a.status === 'charging');
    const { item } = nearest(ready.length ? ready : group, d.pickup.position);
    if (!item) continue;
    const home = ctx.sites.find((s) => s.id === item.siteId);
    options.push(quoteOwnAsset(item, d, ctx, start, home));
  }
  return rank(options, draft.priority);
}

export interface FleetComparison {
  own?: QuoteOption;
  market?: QuoteOption;
  savings: number;
  message: string;
}

/** Compares the best own-fleet option with the best marketplace option. */
export function compareWithOwnFleet(options: QuoteOption[]): FleetComparison | undefined {
  const own = options.filter((o) => o.category === 'own_fleet' && o.available).sort((a, b) => a.price - b.price)[0];
  const market = options.filter((o) => o.category !== 'own_fleet' && o.available).sort((a, b) => a.price - b.price)[0];
  if (!own || !market) return undefined;
  const savings = round2(own.price - market.price);
  const pct = Math.round((Math.abs(savings) / Math.max(own.price, market.price)) * 100);
  const message =
    savings > 0
      ? `Sending this with ${market.providerName} (${market.serviceName}) instead of your ${own.providerName} saves £${savings.toFixed(2)} (${pct}%).`
      : `Your ${own.providerName} is £${Math.abs(savings).toFixed(2)} cheaper than the best marketplace option (${market.providerName}).`;
  return { own, market, savings, message };
}
