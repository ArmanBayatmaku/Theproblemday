import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type {
  Asset,
  Automation,
  CommandName,
  CommandRecord,
  CostSettings,
  Job,
  JobDraft,
  Landmark,
  LngLat,
  MachineTask,
  Person,
  Place,
  PricingContext,
  QuoteOption,
  Site,
  Weather,
  Zone,
} from '@shared/types';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { quoteAll } from '@shared/pricing';
import { applyWeatherMode, simulatedWeather, type WeatherMode } from '@shared/weather';
import { resolvePlace } from '@shared/parser';
import { nextOccurrence, timingStart } from '@shared/schedule';
import { ORG, SEED_AUTOMATIONS, SEED_JOBS, SEED_PEOPLE, SEED_SITES, DEMO_ROUTES, rng, seedAssets, seedTasks } from '@/data/seed';
import { stepWorld, type NewEvent } from '@/sim/engine';
import { simulateCommand } from '@/integrations/devices/simulator';
import { routeLabel } from '@/integrations/devices/adapters';

export interface EventItem extends NewEvent {
  id: string;
  at: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  quotes?: QuoteOption[];
  via?: 'claude' | 'local';
  command?: { command: CommandName; targetIds: string[]; label: string; executed?: boolean };
  bookedJobId?: string;
}

export interface LayerToggles {
  assets: boolean;
  external: boolean;
  routes: boolean;
  sites: boolean;
  zones: boolean;
  wind: boolean;
  skyline: boolean;
  labels: boolean;
}

export const DEFAULT_COSTS: CostSettings = {
  dieselPerLitre: 1.45,
  petrolPerLitre: 1.38,
  electricityPerKwh: 0.32,
  driverWagePerHour: 18,
  minBillableMinutes: 60,
  congestionCharge: 18,
  congestionChargeEvVan: 9,
  ulezCharge: 12.5,
  wearPerKmVan: 0.18,
  wearPerKmTruck: 0.42,
  robotSupervisionPerHour: 6,
  handlingMinutes: 12,
};

export const emptyDraft = (): JobDraft => ({
  cargo: { description: '', weightKg: 2, quantity: 1, size: 'small' },
  timing: { mode: 'now' },
  priority: 'balanced',
});

interface Data {
  org: typeof ORG;
  assets: Asset[];
  sites: Site[];
  people: Person[];
  jobs: Job[];
  tasks: MachineTask[];
  automations: Automation[];
  commands: CommandRecord[];
  events: EventItem[];
  zones: Zone[];
  landmarks: Landmark[];
  costs: CostSettings;
  weatherLive?: Weather;
  weatherMode: WeatherMode;
  sim: { now: number; speed: number; running: boolean; demoTraffic: boolean };
  counters: { job: number; task: number; cmd: number; evt: number; lastDemoAt: number };
  selection: string[];
  map: { is3d: boolean; style: 'streets' | 'stylized'; layers: LayerToggles; follow: boolean };
  draft: JobDraft;
  chat: ChatMessage[];
}

interface Actions {
  weather: () => Weather;
  pricingContext: () => PricingContext;
  quote: (draft?: JobDraft) => QuoteOption[];
  tick: (realDtMs: number) => void;
  setSim: (p: Partial<Data['sim']>) => void;
  setWeatherLive: (w?: Weather) => void;
  setWeatherMode: (m: WeatherMode) => void;
  log: (e: NewEvent) => void;
  // selection & map
  setSelection: (ids: string[]) => void;
  toggleSelect: (id: string, additive?: boolean) => void;
  setMap: (p: Partial<Data['map']>) => void;
  setLayer: (k: keyof LayerToggles, v: boolean) => void;
  // jobs
  setDraft: (patch: Partial<JobDraft>) => void;
  resetDraft: () => void;
  bookJob: (draft: JobDraft, option: QuoteOption, customer?: string) => Job | undefined;
  cancelJob: (id: string) => void;
  rebookJob: (id: string, option: QuoteOption) => void;
  addChat: (m: Omit<ChatMessage, 'id' | 'at'>) => ChatMessage;
  patchChat: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;
  // fleet
  registerAsset: (a: Omit<Asset, 'lastSeen' | 'heading' | 'altitude' | 'speedKmh' | 'status' | 'position' | 'battery'> & Partial<Asset>) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAssets: (ids: string[]) => void;
  registerSite: (s: Site) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  removeSite: (id: string) => void;
  registerPerson: (p: Person) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  // tasks
  addTask: (t: Omit<MachineTask, 'id' | 'createdAt' | 'status'> & Partial<MachineTask>) => MachineTask;
  updateTask: (id: string, patch: Partial<MachineTask>) => void;
  removeTask: (id: string) => void;
  cancelTask: (id: string) => void;
  toggleAutomation: (id: string) => void;
  // control
  runCommand: (command: CommandName, targetIds: string[], params?: Record<string, unknown>) => CommandRecord;
  estopAll: () => CommandRecord;
  // settings
  setCosts: (p: Partial<CostSettings>) => void;
  resetDemo: () => void;
}

export type AppState = Data & Actions;

const placeFrom = (key: string, sites: Site[]): Place | undefined => {
  const s = sites.find((x) => x.id === key);
  if (s) return { name: s.name, position: s.position, siteId: s.id, address: s.address };
  return resolvePlace(key, sites);
};

function createSeed(now: number): Data {
  const assets = seedAssets(now);
  const sites = SEED_SITES;
  const zones = DEMO_ZONES;
  const weather = simulatedWeather(now, 'calm');
  const ctx: PricingContext = { now, weather, zones, landmarks: LANDMARKS, assets, sites, costs: DEFAULT_COSTS };
  const jobs: Job[] = [];

  for (const spec of SEED_JOBS) {
    const pickup = placeFrom(spec.from, sites);
    const dropoff = placeFrom(spec.to, sites);
    if (!pickup || !dropoff) continue;
    let timing: JobDraft['timing'] = { mode: 'now' };
    let startAt = now;
    if (typeof spec.timing === 'object' && 'offsetMin' in spec.timing) {
      startAt = now + spec.timing.offsetMin * 60_000;
      timing = { mode: 'scheduled', at: new Date(startAt).toISOString() };
    } else if (typeof spec.timing === 'object' && 'tomorrowAt' in spec.timing) {
      const d = new Date(now + 86400_000);
      const [h, m] = spec.timing.tomorrowAt.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      startAt = d.getTime();
      timing = { mode: 'scheduled', at: d.toISOString() };
    } else if (typeof spec.timing === 'object' && 'recurring' in spec.timing) {
      const first = nextOccurrence(spec.timing.recurring, now, now) ?? now + 86400_000;
      timing = { mode: 'recurring', rule: spec.timing.recurring, startAt: new Date(first).toISOString() };
      startAt = first;
    }
    const draft: JobDraft = { pickup, dropoff, cargo: spec.cargo, timing, priority: 'balanced' };
    const options = quoteAll(draft, ctx);
    const option =
      options.find((o) => (spec.provider.startsWith('own:') ? o.id === spec.provider : o.providerId === spec.provider)) ?? options[0];
    if (!option) continue;
    const recurring = timing.mode === 'recurring';
    jobs.push({
      id: spec.id,
      createdAt: now - 3600_000,
      customer: spec.customer,
      pickup,
      dropoff,
      cargo: spec.cargo,
      timing,
      priority: 'balanced',
      status: recurring ? 'recurring' : 'scheduled',
      option: { ...option, available: true },
      startAt,
      nextRunAt: recurring ? startAt : undefined,
      history: [{ at: now - 3600_000, status: recurring ? 'recurring' : 'scheduled', note: `Booked with ${option.providerName}` }],
    });
  }

  // Today's delivered history (for the KPIs and charts).
  const r = rng(7);
  const dayStart = new Date(now);
  dayStart.setHours(6, 0, 0, 0);
  const span = Math.max(30 * 60_000, now - 15 * 60_000 - dayStart.getTime());
  const historyProviders = ['hive-air', 'hive-air', 'waymo', 'uber-courier', 'cityhop', 'own:VN-02', 'hive-air', 'waymo'];
  for (let i = 0; i < 34; i++) {
    const [from, to] = DEMO_ROUTES[Math.floor(r() * DEMO_ROUTES.length)];
    const pickup = placeFrom(from, sites);
    const dropoff = placeFrom(to, sites);
    if (!pickup || !dropoff) continue;
    const kg = [0.6, 1.2, 2, 2.8, 4.5, 8, 14][Math.floor(r() * 7)];
    const cargo = { description: kg < 4 ? 'Online order' : 'Grocery delivery', weightKg: kg, quantity: 1, size: kg < 4 ? 'small' : 'medium' } as Job['cargo'];
    const options = quoteAll({ pickup, dropoff, cargo, timing: { mode: 'now' }, priority: 'balanced' }, ctx);
    const want = historyProviders[Math.floor(r() * historyProviders.length)];
    const option = options.find((o) => (want.startsWith('own:') ? o.id === want : o.providerId === want) && o.available) ?? options.find((o) => o.available);
    if (!option) continue;
    const completedAt = dayStart.getTime() + r() * span;
    const total = (option.pickupEtaMin + option.durationMin + 3) * 60_000;
    const late = r() < 0.12 ? (4 + r() * 12) * 60_000 : -r() * 4 * 60_000;
    const startAt = completedAt - total - late;
    jobs.push({
      id: `J-${900 + i}`,
      createdAt: startAt,
      customer: `Online order #${87900 + i}`,
      pickup,
      dropoff,
      cargo,
      timing: { mode: 'now' },
      priority: 'balanced',
      status: 'delivered',
      option,
      assetId: option.assetId,
      startAt,
      etaAt: startAt + total,
      completedAt,
      history: [
        { at: startAt, status: 'scheduled', note: `Booked with ${option.providerName}` },
        { at: completedAt, status: 'delivered', note: late > 120_000 ? `Delivered ${Math.round(late / 60_000)} min late` : 'Delivered on time' },
      ],
    });
  }

  return {
    org: ORG,
    assets,
    sites,
    people: SEED_PEOPLE,
    jobs,
    tasks: seedTasks(now),
    automations: SEED_AUTOMATIONS,
    commands: [],
    events: [{ id: 'E-1', at: now, level: 'info', text: 'Simulation started — London operations live' }],
    zones,
    landmarks: LANDMARKS,
    costs: DEFAULT_COSTS,
    weatherLive: undefined,
    weatherMode: 'live',
    sim: { now, speed: 4, running: true, demoTraffic: true },
    counters: { job: 1100, task: 300, cmd: 0, evt: 1, lastDemoAt: now },
    selection: [],
    map: {
      is3d: false,
      style: 'streets',
      follow: false,
      layers: { assets: true, external: true, routes: true, sites: true, zones: true, wind: false, skyline: true, labels: true },
    },
    draft: emptyDraft(),
    chat: [],
  };
}

const uid = (p: string, n: number) => `${p}-${n}`;

/**
 * localStorage persistence that writes at most every few seconds. The simulation updates the
 * store twice a second; serialising everything on each tick would stall the UI.
 */
function throttledStorage<S>(delayMs = 4000): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: number | undefined;
  const flush = () => {
    timer = undefined;
    if (!pending) return;
    try {
      localStorage.setItem(pending.name, JSON.stringify(pending.value));
    } catch {
      /* quota exceeded or private mode — keep running in memory */
    }
    pending = null;
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer === undefined) timer = window.setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      pending = null;
      localStorage.removeItem(name);
    },
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...createSeed(Date.now()),

      weather: () => {
        const s = get();
        const base = s.weatherLive ?? simulatedWeather(s.sim.now, 'live');
        return applyWeatherMode(base, s.weatherMode);
      },
      pricingContext: () => {
        const s = get();
        return { now: s.sim.now, weather: s.weather(), zones: s.zones, landmarks: s.landmarks, assets: s.assets, sites: s.sites, costs: s.costs };
      },
      quote: (draft) => quoteAll(draft ?? get().draft, get().pricingContext()),

      tick: (realDtMs) => {
        const s = get();
        if (!s.sim.running) return;
        const dtMs = Math.min(realDtMs, 2000) * s.sim.speed;
        const now = s.sim.now + dtMs;
        const out = stepWorld({
          now,
          dtMs,
          assets: s.assets,
          jobs: s.jobs,
          tasks: s.tasks,
          sites: s.sites,
          zones: s.zones,
          landmarks: s.landmarks,
          automations: s.automations,
          weather: s.weather(),
          costs: s.costs,
          demoTraffic: s.sim.demoTraffic,
          counters: { job: s.counters.job, lastDemoAt: s.counters.lastDemoAt },
        });
        let evt = s.counters.evt;
        const newEvents = out.events.map((e) => ({ ...e, id: uid('E', ++evt), at: now }));
        set({
          sim: { ...s.sim, now },
          assets: out.assets,
          jobs: out.jobs.length > 400 ? out.jobs.filter((j, i) => i > out.jobs.length - 400 || j.status !== 'delivered') : out.jobs,
          tasks: out.tasks,
          events: newEvents.length ? [...newEvents.reverse(), ...s.events].slice(0, 160) : s.events,
          counters: { ...s.counters, job: out.counters.job, lastDemoAt: out.counters.lastDemoAt, evt },
        });
      },
      setSim: (p) => set({ sim: { ...get().sim, ...p } }),
      setWeatherLive: (w) => set({ weatherLive: w }),
      setWeatherMode: (m) => {
        set({ weatherMode: m });
        get().log({ level: m === 'storm' ? 'warning' : 'info', text: m === 'live' ? 'Weather: live feed' : `Weather override: ${m}` });
      },
      log: (e) => {
        const s = get();
        const evt = s.counters.evt + 1;
        set({ events: [{ ...e, id: uid('E', evt), at: s.sim.now }, ...s.events].slice(0, 160), counters: { ...s.counters, evt } });
      },

      setSelection: (ids) => set({ selection: [...new Set(ids)] }),
      toggleSelect: (id, additive) => {
        const sel = get().selection;
        if (!additive) set({ selection: sel.length === 1 && sel[0] === id ? [] : [id] });
        else set({ selection: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
      },
      setMap: (p) => set({ map: { ...get().map, ...p } }),
      setLayer: (k, v) => set({ map: { ...get().map, layers: { ...get().map.layers, [k]: v } } }),

      setDraft: (patch) => set({ draft: { ...get().draft, ...patch, cargo: { ...get().draft.cargo, ...(patch.cargo ?? {}) } } }),
      resetDraft: () => set({ draft: emptyDraft() }),
      bookJob: (draft, option, customer) => {
        const s = get();
        if (!draft.pickup || !draft.dropoff) return undefined;
        const n = s.counters.job + 1;
        const id = `J-${n}`;
        const now = s.sim.now;
        const recurring = draft.timing.mode === 'recurring';
        const startAt = timingStart(draft.timing, now);
        const job: Job = {
          id,
          createdAt: now,
          customer: customer ?? draft.customer ?? `${s.org.name} request`,
          pickup: draft.pickup,
          dropoff: draft.dropoff,
          cargo: { ...draft.cargo, description: draft.cargo.description || `${draft.cargo.quantity} × ${draft.cargo.size} item` },
          timing: draft.timing,
          priority: draft.priority,
          status: recurring ? 'recurring' : 'scheduled',
          option,
          startAt,
          nextRunAt: recurring ? startAt : undefined,
          notes: draft.notes,
          history: [{ at: now, status: recurring ? 'recurring' : 'scheduled', note: `Booked with ${option.providerName} · ${option.serviceName} · £${option.price.toFixed(2)}` }],
        };
        set({ jobs: [...s.jobs, job], counters: { ...s.counters, job: n } });
        get().log({ level: 'success', text: `${id} booked — ${option.providerName} ${option.serviceName}, £${option.price.toFixed(2)}`, ref: { type: 'job', id } });
        return job;
      },
      cancelJob: (id) => {
        const s = get();
        const j = s.jobs.find((x) => x.id === id);
        if (!j) return;
        set({
          jobs: s.jobs.map((x) => (x.id === id ? { ...x, status: 'cancelled', history: [...x.history, { at: s.sim.now, status: 'cancelled', note: 'Cancelled by operator' }] } : x)),
          assets: s.assets.map((a) => {
            if (a.currentJobId !== id) return a;
            const home = s.sites.find((x) => x.id === a.siteId);
            if (a.ownership === 'external' || !home) return { ...a, currentJobId: undefined, route: undefined, status: 'idle' as const, speedKmh: 0 };
            return { ...a, currentJobId: undefined, route: undefined, status: 'idle' as const, speedKmh: 0 };
          }),
        });
        get().log({ level: 'warning', text: `${id} cancelled`, ref: { type: 'job', id } });
      },
      rebookJob: (id, option) => {
        const s = get();
        set({ jobs: s.jobs.map((x) => (x.id === id ? { ...x, option, history: [...x.history, { at: s.sim.now, status: x.status, note: `Method changed to ${option.providerName}` }] } : x)) });
        get().log({ level: 'info', text: `${id} switched to ${option.providerName} (£${option.price.toFixed(2)})`, ref: { type: 'job', id } });
      },
      addChat: (m) => {
        const msg = { ...m, id: `M-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
        set({ chat: [...get().chat, msg].slice(-40) });
        return msg;
      },
      patchChat: (id, patch) => set({ chat: get().chat.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
      clearChat: () => set({ chat: [] }),

      registerAsset: (a) => {
        const s = get();
        const site = s.sites.find((x) => x.id === a.siteId);
        const asset: Asset = {
          status: 'idle',
          heading: 0,
          altitude: 0,
          speedKmh: 0,
          lastSeen: s.sim.now,
          ...a,
          position: a.position ?? site?.position ?? [-0.1278, 51.5074],
          battery: a.battery ?? 100,
        } as Asset;
        set({ assets: [...s.assets.filter((x) => x.id !== asset.id), asset] });
        get().log({ level: 'success', text: `Registered ${asset.id} — ${asset.name} (${asset.model})`, ref: { type: 'asset', id: asset.id } });
      },
      updateAsset: (id, patch) => set({ assets: get().assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
      removeAssets: (ids) => {
        set({ assets: get().assets.filter((a) => !ids.includes(a.id)), selection: get().selection.filter((x) => !ids.includes(x)) });
        get().log({ level: 'warning', text: `Removed ${ids.join(', ')}` });
      },
      registerSite: (site) => {
        set({ sites: [...get().sites.filter((x) => x.id !== site.id), site] });
        get().log({ level: 'success', text: `Location added — ${site.name}` });
      },
      updateSite: (id, patch) => set({ sites: get().sites.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      removeSite: (id) => set({ sites: get().sites.filter((x) => x.id !== id), assets: get().assets.map((a) => (a.siteId === id ? { ...a, siteId: undefined } : a)) }),
      registerPerson: (p) => set({ people: [...get().people.filter((x) => x.id !== p.id), p] }),
      updatePerson: (id, patch) => set({ people: get().people.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),

      addTask: (t) => {
        const s = get();
        const n = s.counters.task + 1;
        const task: MachineTask = { status: 'planned', createdAt: s.sim.now, ...t, id: `T-${n}` } as MachineTask;
        set({ tasks: [...s.tasks, task], counters: { ...s.counters, task: n } });
        get().log({ level: 'info', text: `Task ${task.id} planned — ${task.title}`, ref: { type: 'task', id: task.id } });
        return task;
      },
      updateTask: (id, patch) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeTask: (id) => {
        const s = get();
        set({
          tasks: s.tasks.filter((t) => t.id !== id),
          assets: s.assets.map((a) => (a.currentTaskId === id ? { ...a, currentTaskId: undefined, status: a.status === 'working' ? 'idle' : a.status, workUntil: undefined } : a)),
        });
      },
      cancelTask: (id) => {
        const s = get();
        set({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'cancelled' as const, finishedAt: s.sim.now } : t)),
          assets: s.assets.map((a) =>
            a.currentTaskId === id ? { ...a, currentTaskId: undefined, status: a.status === 'working' || a.status === 'en_route' ? ('idle' as const) : a.status, workUntil: undefined, route: a.status === 'en_route' ? undefined : a.route, speedKmh: a.status === 'en_route' ? 0 : a.speedKmh } : a,
          ),
        });
        get().log({ level: 'warning', text: `Task ${id} cancelled`, ref: { type: 'task', id } });
      },
      toggleAutomation: (id) => {
        const s = get();
        const a = s.automations.find((x) => x.id === id);
        set({ automations: s.automations.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) });
        if (a) get().log({ level: 'info', text: `Automation “${a.name}” ${a.enabled ? 'disabled' : 'enabled'}` });
      },

      runCommand: (command, targetIds, params = {}) => {
        const s = get();
        const ctx = {
          now: s.sim.now,
          zones: s.zones,
          landmarks: s.landmarks,
          sites: s.sites,
          geofence: !!s.automations.find((x) => x.id === 'geofence')?.enabled,
        };
        const msgs: string[] = [];
        let ok = 0;
        const requeue: string[] = [];
        const cancel: string[] = [];
        const vias = new Set<string>();
        const assets = s.assets.map((a) => {
          if (!targetIds.includes(a.id)) return a;
          const out = simulateCommand(a, command, params, ctx);
          vias.add(routeLabel(a, command));
          msgs.push(out.message);
          if (out.requeueJobId) requeue.push(out.requeueJobId);
          if (out.cancelJobId) cancel.push(out.cancelJobId);
          if (!out.ok) return a;
          ok++;
          return { ...a, ...out.patch, lastSeen: s.sim.now };
        });
        const jobs = s.jobs.map((j) => {
          if (requeue.includes(j.id)) return { ...j, status: 'scheduled' as const, assetId: undefined, startAt: s.sim.now, history: [...j.history, { at: s.sim.now, status: 'scheduled' as const, note: 'Re-queued after recall' }] };
          if (cancel.includes(j.id)) return { ...j, status: 'cancelled' as const, history: [...j.history, { at: s.sim.now, status: 'cancelled' as const, note: 'Trip cancelled with provider' }] };
          return j;
        });
        const n = s.counters.cmd + 1;
        const rec: CommandRecord = {
          id: `C-${n}`,
          at: s.sim.now,
          command,
          targetIds,
          params,
          by: s.org.user,
          result: ok === targetIds.length ? 'ok' : ok ? 'partial' : 'rejected',
          message: msgs.length > 3 ? `${msgs.slice(0, 3).join(' · ')} · +${msgs.length - 3} more` : msgs.join(' · '),
          via: [...vias].join(', ') || 'Simulator',
        };
        set({ assets, jobs, commands: [rec, ...s.commands].slice(0, 200), counters: { ...s.counters, cmd: n } });
        get().log({
          level: command === 'estop' ? 'danger' : rec.result === 'rejected' ? 'warning' : 'info',
          text: `${command.replace(/_/g, ' ').toUpperCase()} → ${targetIds.length > 3 ? `${targetIds.length} machines` : targetIds.join(', ')}: ${rec.result}`,
        });
        return rec;
      },
      estopAll: () => {
        const ids = get()
          .assets.filter((a) => a.ownership !== 'external' && a.autonomy !== 'human_driven' && a.status !== 'estop')
          .map((a) => a.id);
        return get().runCommand('estop', ids);
      },

      setCosts: (p) => set({ costs: { ...get().costs, ...p } }),
      resetDemo: () => {
        const seed = createSeed(Date.now());
        set({ ...seed });
      },
    }),
    {
      name: 'hive-ops-v1',
      version: 1,
      storage: throttledStorage<Partial<AppState>>(),
      partialize: (s) => {
        const { weatherLive, selection, ...rest } = s;
        const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as Partial<AppState>;
        // Finished jobs don't need their route geometry saved.
        data.jobs = s.jobs.map((j) => (['delivered', 'cancelled', 'failed'].includes(j.status) && j.option.route ? { ...j, option: { ...j.option, route: undefined } } : j));
        return data;
      },
    },
  ),
);

/** Convenience: place from a site id. */
export const siteToPlace = (s: Site): Place => ({ name: s.name, position: s.position, siteId: s.id, address: s.address });
export type { LngLat };
