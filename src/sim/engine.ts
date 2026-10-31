// Simulation loop: dispatches jobs, moves machines, runs machine tasks and automations.
import type { Asset, Automation, CostSettings, Job, Landmark, MachineTask, PricingContext, Site, Weather, Zone } from '@shared/types';
import { distanceM, destination, positionAlong } from '@shared/geo';
import { droneFlyability } from '@shared/weather';
import { quoteAll } from '@shared/pricing';
import { describeRecurrence, nextOccurrence } from '@shared/schedule';
import { buildRoute, isIndoor, jitterAround, type RouteCtx } from './routes';
import { MODEL_TEMPLATES, DEMO_ROUTES } from '@/data/seed';
import { resolvePlace } from '@shared/parser';

export interface World {
  now: number;
  dtMs: number;
  assets: Asset[];
  jobs: Job[];
  tasks: MachineTask[];
  sites: Site[];
  zones: Zone[];
  landmarks: Landmark[];
  automations: Automation[];
  weather: Weather;
  costs: CostSettings;
  demoTraffic: boolean;
  counters: { job: number; lastDemoAt: number };
}

export interface NewEvent {
  level: 'info' | 'success' | 'warning' | 'danger';
  text: string;
  ref?: { type: 'asset' | 'job' | 'task'; id: string };
}

const LOAD_MIN: Partial<Record<Asset['kind'], number>> = { drone: 1.5, robotaxi: 3, car: 3, van: 6, truck: 12, cargo_bike: 2, sidewalk_robot: 1 };
const DRAIN_PER_KM: Partial<Record<Asset['kind'], number>> = { drone: 2.2, sidewalk_robot: 3, van: 0.3, truck: 0.12, robotaxi: 0.3, car: 0.15, cargo_bike: 1, humanoid: 4, amr: 4 };
const CHARGE_PER_MIN: Partial<Record<Asset['kind'], number>> = { drone: 3, sidewalk_robot: 1.5, humanoid: 1.2, amr: 1.6, van: 0.8, robotaxi: 0.8 };

const PROVIDER_MODEL: Record<string, string> = {
  waymo: 'Waymo Jaguar I-PACE',
  'uber-courier': 'Uber courier car',
  cityhop: 'CityHop e-cargo bike',
  'thames-express': 'Thames Express van',
};

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export function stepWorld(w: World): {
  assets: Asset[];
  jobs: Job[];
  tasks: MachineTask[];
  events: NewEvent[];
  counters: World['counters'];
} {
  const { now, dtMs } = w;
  const events: NewEvent[] = [];
  const assets: Asset[] = w.assets.map((a) => ({ ...a, route: a.route ? { ...a.route } : undefined }));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const jobs = w.jobs.map((j) => ({ ...j }));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const tasks = w.tasks.map((t) => ({ ...t }));
  const counters = { ...w.counters };
  const auto = (id: string) => !!w.automations.find((x) => x.id === id)?.enabled;
  const rctx: RouteCtx = { now, zones: w.zones, landmarks: w.landmarks, geofence: auto('geofence') };
  const pricing = (): PricingContext => ({ now, weather: w.weather, zones: w.zones, landmarks: w.landmarks, assets, sites: w.sites, costs: w.costs });
  const site = (id?: string) => w.sites.find((s) => s.id === id);
  const push = (j: Job, status: Job['status'], note?: string) => {
    j.status = status;
    j.history = [...j.history, { at: now, status, note }];
  };

  // ---------- 1. recurring series → occurrences ----------
  for (const s of jobs.filter((j) => j.status === 'recurring' && j.nextRunAt !== undefined && j.nextRunAt <= now)) {
    if (s.timing.mode !== 'recurring') continue;
    const id = `J-${++counters.job}`;
    const occ: Job = {
      ...s,
      id,
      seriesId: s.id,
      status: 'scheduled',
      startAt: s.nextRunAt!,
      timing: { mode: 'scheduled', at: new Date(s.nextRunAt!).toISOString() },
      nextRunAt: undefined,
      assetId: undefined,
      history: [{ at: now, status: 'scheduled', note: `Created from ${s.id} · ${describeRecurrence(s.timing.rule)}` }],
    };
    jobs.push(occ);
    jobById.set(id, occ);
    s.nextRunAt = nextOccurrence(s.timing.rule, new Date(s.timing.startAt).getTime(), s.nextRunAt! + 60_000);
    events.push({ level: 'info', text: `Recurring ${s.id} created ${id} (${s.customer})`, ref: { type: 'job', id } });
  }

  // ---------- 2. dispatch due jobs ----------
  for (const j of jobs) {
    if (j.status !== 'scheduled' || j.startAt > now) continue;
    let opt = j.option;

    if (opt.providerId === 'hive-air') {
      const ready = assets.filter(
        (a) => a.kind === 'drone' && a.ownership !== 'external' && (a.status === 'idle' || a.status === 'charging') && !a.currentJobId && a.battery > 30 && a.specs.payloadKg >= j.cargo.weightKg,
      );
      const preferred = ready.find((a) => a.id === opt.assetId);
      const drone = preferred ?? ready.sort((x, y) => distanceM(x.position, j.pickup.position) - distanceM(y.position, j.pickup.position))[0];
      const fly = drone ? droneFlyability(w.weather, drone.specs) : undefined;
      if (fly?.status === 'no_go') {
        if (auto('weather-fallback')) {
          const alt = quoteAll({ pickup: j.pickup, dropoff: j.dropoff, cargo: j.cargo, timing: { mode: 'now' }, priority: j.priority }, pricing()).find(
            (o) => o.available && o.providerId !== 'hive-air',
          );
          if (alt) {
            events.push({ level: 'warning', text: `${fly.reasons[0] ?? 'Drones grounded'} — ${j.id} re-booked with ${alt.providerName} (£${alt.price.toFixed(2)})`, ref: { type: 'job', id: j.id } });
            j.history = [...j.history, { at: now, status: 'scheduled', note: `Weather fallback: Hive Air → ${alt.providerName}` }];
            j.option = alt;
            opt = alt;
          } else continue;
        } else continue;
      } else if (!drone) {
        continue; // wait for a free drone
      } else {
        assign(j, drone);
        continue;
      }
    }

    if (opt.category === 'own_fleet') {
      const a = byId.get(opt.assetId ?? '');
      if (!a || !(a.status === 'idle' || a.status === 'charging') || a.currentJobId || a.currentTaskId) continue;
      assign(j, a);
      continue;
    }
    if (opt.providerId === 'hive-air') continue;

    // external marketplace provider
    let ext = assets
      .filter((a) => a.ownership === 'external' && a.providerId === opt.providerId && !a.currentJobId && a.status !== 'offline')
      .sort((x, y) => distanceM(x.position, j.pickup.position) - distanceM(y.position, j.pickup.position))[0];
    if (!ext) {
      const model = PROVIDER_MODEL[opt.providerId];
      const t = model ? MODEL_TEMPLATES[model] : undefined;
      if (!t) continue;
      const n = assets.filter((a) => a.providerId === opt.providerId).length + 1;
      const prefix = { waymo: 'WY', 'uber-courier': 'UB', cityhop: 'CB', 'thames-express': 'TX' }[opt.providerId] ?? 'EX';
      ext = {
        ...t,
        specs: { ...t.specs },
        id: `${prefix}-${String(n).padStart(2, '0')}`,
        name: `${prefix}-${String(n).padStart(2, '0')}`,
        position: destination(j.pickup.position, (n * 97) % 360, 900),
        status: 'idle',
        battery: 80,
        heading: 0,
        altitude: 0,
        speedKmh: 0,
        lastSeen: now,
      };
      assets.push(ext);
      byId.set(ext.id, ext);
    }
    assign(j, ext);
  }

  function assign(j: Job, a: Asset) {
    a.currentJobId = j.id;
    a.currentTaskId = undefined;
    j.assetId = a.id;
    if (distanceM(a.position, j.pickup.position) < 80) {
      a.status = 'working';
      a.workUntil = now + (LOAD_MIN[a.kind] ?? 3) * 60_000;
      push(j, 'loading', `${a.id} loading at ${j.pickup.name}`);
    } else {
      const r = buildRoute(a, j.pickup.position, 'to_pickup', { ...rctx, geofence: false }, j.id);
      a.route = r.route;
      a.speedKmh = r.speedKmh;
      a.status = 'en_route';
      push(j, 'to_pickup', `${a.id} (${j.option.providerName}) heading to pickup`);
    }
    const etaMin = j.option.pickupEtaMin + j.option.durationMin + (LOAD_MIN[a.kind] ?? 3);
    j.etaAt = now + etaMin * 60_000;
    events.push({ level: 'info', text: `${j.id} dispatched — ${a.id} via ${j.option.providerName}`, ref: { type: 'job', id: j.id } });
  }

  // ---------- 3. move machines ----------
  const dtMin = dtMs / 60_000;
  for (const a of assets) {
    if (a.status === 'offline' && a.workUntil && a.workUntil <= now) {
      a.status = 'idle';
      a.workUntil = undefined;
      events.push({ level: 'info', text: `${a.id} back online`, ref: { type: 'asset', id: a.id } });
      continue;
    }
    if (['paused', 'holding', 'estop', 'offline', 'maintenance'].includes(a.status)) continue;

    if (a.status === 'charging') {
      a.battery = Math.min(100, a.battery + (CHARGE_PER_MIN[a.kind] ?? 1) * dtMin);
      if (a.battery >= 99.5) {
        a.status = 'idle';
        events.push({ level: 'success', text: `${a.id} fully charged`, ref: { type: 'asset', id: a.id } });
      }
      continue;
    }

    if (a.status === 'working') {
      if (isIndoor(a)) {
        const s = site(a.siteId);
        if (s && Math.floor(now / 9000) % 2 === 0) a.position = jitterAround(s.position, Math.floor(now / 9000) + hash(a.id));
        a.battery = Math.max(0, a.battery - 0.15 * dtMin);
      }
      if (a.workUntil && a.workUntil <= now) workDone(a);
      continue;
    }

    if ((a.status === 'en_route' || a.status === 'returning') && a.route) {
      const r = a.route;
      const factor = a.kind === 'drone' || isIndoor(a) || a.kind === 'sidewalk_robot' ? 1 : 0.76;
      const mps = (Math.max(1, a.speedKmh) / 3.6) * factor;
      const step = mps * (dtMs / 1000);
      r.progressM = Math.min(r.totalM, r.progressM + step);
      const { pos, heading } = positionAlong(r.path, r.cum, r.progressM);
      a.position = [pos[0], pos[1]];
      a.altitude = pos[2];
      if (heading) a.heading = heading;
      a.battery = Math.max(0, a.battery - ((DRAIN_PER_KM[a.kind] ?? 0.5) * step) / 1000);
      a.lastSeen = now;
      if (r.progressM >= r.totalM - 0.5) arrive(a);
      continue;
    }
    if (a.status === 'en_route' && !a.route) a.status = 'idle';

    if (a.status === 'idle') {
      if (auto('auto-charge') && a.ownership !== 'external' && a.battery < 20 && a.kind !== 'robot_arm' && a.autonomy !== 'human_driven') {
        const home = site(a.siteId);
        if (home && distanceM(home.position, a.position) < 80) {
          a.status = 'charging';
          events.push({ level: 'info', text: `${a.id} low battery (${Math.round(a.battery)}%) — charging`, ref: { type: 'asset', id: a.id } });
        } else if (home) {
          const r = buildRoute(a, home.position, 'return', rctx, 'charge');
          a.route = r.route;
          a.speedKmh = r.speedKmh;
          a.status = 'returning';
          events.push({ level: 'warning', text: `${a.id} low battery — returning to ${home.name}`, ref: { type: 'asset', id: a.id } });
        }
        continue;
      }
      // External fleets wander so the map reflects live marketplace supply.
      if (a.ownership === 'external' && !a.currentJobId && (hash(a.id) + Math.floor(now / 20_000)) % 23 === 0) {
        const target = destination([-0.115, 51.508], (hash(a.id) * 7 + now / 1000) % 360, 1500 + (hash(a.id) % 7000));
        const r = buildRoute(a, target, 'patrol', rctx);
        a.route = r.route;
        a.speedKmh = r.speedKmh;
        a.status = 'en_route';
      }
    }
  }

  function arrive(a: Asset) {
    const r = a.route!;
    a.route = undefined;
    a.speedKmh = 0;
    const j = a.currentJobId ? jobById.get(a.currentJobId) : undefined;
    switch (r.purpose) {
      case 'to_pickup':
        a.status = 'working';
        a.workUntil = now + (LOAD_MIN[a.kind] ?? 3) * 60_000;
        if (j) push(j, 'loading', `${a.id} arrived at ${j.pickup.name}`);
        break;
      case 'to_dropoff': {
        if (j) {
          j.completedAt = now;
          const late = j.etaAt ? Math.round((now - j.etaAt) / 60_000) : 0;
          push(j, 'delivered', late > 2 ? `Delivered ${late} min late` : 'Delivered on time');
          events.push({ level: 'success', text: `${j.id} delivered to ${j.dropoff.name} by ${a.id}`, ref: { type: 'job', id: j.id } });
        }
        a.currentJobId = undefined;
        const home = site(a.siteId);
        if (a.ownership !== 'external' && auto('return-home') && home) {
          const rr = buildRoute(a, home.position, 'return', rctx);
          a.route = rr.route;
          a.speedKmh = rr.speedKmh;
          a.status = 'returning';
        } else a.status = 'idle';
        break;
      }
      case 'return':
        a.altitude = 0;
        a.status = r.refId === 'charge' || (a.kind === 'drone' && a.battery < 90) || a.battery < 35 ? 'charging' : 'idle';
        break;
      case 'goto':
        a.status = a.kind === 'drone' ? 'holding' : 'idle';
        break;
      case 'task': {
        const t = tasks.find((x) => x.id === a.currentTaskId);
        a.status = 'working';
        a.workUntil = now + (t?.durationMin ?? 15) * 60_000;
        break;
      }
      default:
        a.status = 'idle';
    }
  }

  function workDone(a: Asset) {
    a.workUntil = undefined;
    const j = a.currentJobId ? jobById.get(a.currentJobId) : undefined;
    if (j && j.status === 'loading') {
      const r = buildRoute(a, j.dropoff.position, 'to_dropoff', { ...rctx, geofence: false }, j.id, j.option.route);
      a.route = r.route;
      a.speedKmh = r.speedKmh;
      a.status = 'en_route';
      push(j, 'in_transit', `${a.id} on the way to ${j.dropoff.name}`);
      return;
    }
    if (a.currentTaskId) {
      const t = tasks.find((x) => x.id === a.currentTaskId);
      a.currentTaskId = undefined;
      a.status = 'idle';
      if (t && !assets.some((o) => o.currentTaskId === t.id)) finishTask(t);
      return;
    }
    a.status = 'idle';
  }

  function finishTask(t: MachineTask) {
    t.finishedAt = now;
    events.push({ level: 'success', text: `Task ${t.id} done — ${t.title}`, ref: { type: 'task', id: t.id } });
    if (t.recurrence && t.windowStart !== undefined) {
      const len = (t.windowEnd ?? t.windowStart + t.durationMin * 60_000) - t.windowStart;
      const next = nextOccurrence(t.recurrence, t.windowStart, now + 60_000);
      if (next) {
        t.windowStart = next;
        t.windowEnd = next + len;
        t.status = 'planned';
        t.startedAt = undefined;
        return;
      }
    }
    t.status = 'done';
  }

  // ---------- 4. machine tasks ----------
  for (const t of tasks) {
    if (t.status !== 'planned' && t.status !== 'queued') continue;
    const members = t.assetIds.map((id) => byId.get(id)).filter((x): x is Asset => !!x);
    if (!members.length) continue;
    let start: number | undefined;
    let deadline: number | undefined;
    const c = t.constraint;
    if (c.kind === 'window') {
      start = t.windowStart ?? now;
      deadline = t.windowEnd;
    } else if (c.kind === 'before_job') {
      const j = jobById.get(c.jobId);
      if (!j) continue;
      if (j.status !== 'scheduled') {
        t.status = 'blocked';
        events.push({ level: 'warning', text: `Task ${t.id} missed — ${j.id} already left`, ref: { type: 'task', id: t.id } });
        continue;
      }
      deadline = j.startAt - c.offsetMin * 60_000;
      start = deadline - t.durationMin * 60_000;
    } else if (c.kind === 'after_job') {
      const j = jobById.get(c.jobId);
      if (j?.status === 'delivered' && j.completedAt) start = j.completedAt + c.offsetMin * 60_000;
    } else if (c.kind === 'between_jobs') {
      const j1 = jobById.get(c.jobId);
      const j2 = jobById.get(c.jobId2);
      if (j1?.status === 'delivered' && j1.completedAt) start = j1.completedAt;
      if (j2) deadline = j2.startAt;
    } else if (c.kind === 'fill_idle') {
      const busySoon = jobs.some(
        (j) => j.status === 'scheduled' && members.some((m) => j.option.assetId === m.id) && j.startAt < now + (t.durationMin + 10) * 60_000,
      );
      if (auto('fill-idle') && !busySoon) start = now;
    }
    if (start === undefined || start > now) continue;
    if (deadline !== undefined && now + t.durationMin * 60_000 > deadline + 10 * 60_000) {
      t.status = 'blocked';
      events.push({ level: 'warning', text: `Task ${t.id} can't finish before its deadline`, ref: { type: 'task', id: t.id } });
      continue;
    }
    const free = members.every((m) => (m.status === 'idle' || m.status === 'charging') && !m.currentJobId && !m.currentTaskId);
    if (!free) {
      t.status = 'queued';
      continue;
    }
    t.status = 'running';
    t.startedAt = now;
    for (const m of members) {
      m.currentTaskId = t.id;
      const s = site(t.siteId);
      const target = t.target?.position ?? s?.position;
      if (target && !isIndoor(m) && distanceM(target, m.position) > 80) {
        const r = buildRoute(m, target, 'task', rctx, t.id);
        m.route = r.route;
        m.speedKmh = r.speedKmh;
        m.status = 'en_route';
      } else {
        m.status = 'working';
        m.workUntil = now + t.durationMin * 60_000;
      }
    }
    events.push({ level: 'info', text: `Task ${t.id} started — ${t.title} (${t.assetIds.join(', ')})`, ref: { type: 'task', id: t.id } });
  }

  // ---------- 5. optional demo traffic ----------
  const active = jobs.filter((j) => ['scheduled', 'to_pickup', 'loading', 'in_transit'].includes(j.status) && j.startAt <= now + 60_000).length;
  if (w.demoTraffic && now - counters.lastDemoAt > 4 * 60_000 && active < 10) {
    counters.lastDemoAt = now;
    const [from, to] = DEMO_ROUTES[Math.floor((now / 1000) % DEMO_ROUTES.length)];
    const pickup = from.startsWith('S-') ? (() => { const s = site(from)!; return { name: s.name, position: s.position, siteId: s.id }; })() : resolvePlace(from, w.sites);
    const dropoff = resolvePlace(to, w.sites);
    if (pickup && dropoff) {
      const kg = [0.8, 1.6, 2.4, 4, 9, 18][Math.floor(now / 7000) % 6];
      const cargo = { description: kg < 5 ? 'Online order' : 'Grocery delivery', weightKg: kg, quantity: kg < 5 ? 1 : 3, size: kg < 5 ? 'small' : 'medium' } as Job['cargo'];
      const opts = quoteAll({ pickup, dropoff, cargo, timing: { mode: 'now' }, priority: 'balanced' }, pricing());
      const opt = opts.find((o) => o.available && o.badges.includes('recommended')) ?? opts.find((o) => o.available);
      if (opt) {
        const id = `J-${++counters.job}`;
        const j: Job = {
          id,
          createdAt: now,
          customer: `Online order #${88200 + counters.job}`,
          pickup,
          dropoff,
          cargo,
          timing: { mode: 'now' },
          priority: 'balanced',
          status: 'scheduled',
          option: opt,
          startAt: now,
          history: [{ at: now, status: 'scheduled', note: `Auto-booked (${opt.providerName})` }],
        };
        jobs.push(j);
        events.push({ level: 'info', text: `New order ${id}: ${pickup.name} → ${dropoff.name} · ${opt.providerName} £${opt.price.toFixed(2)}`, ref: { type: 'job', id } });
      }
    }
  }

  return { assets, jobs, tasks, events, counters };
}
