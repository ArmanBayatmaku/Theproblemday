import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Ban, CalendarPlus, Play, Search, Trash, X } from 'lucide-react';
import type { Asset, Job, MachineTask, Recurrence, TaskConstraint, TaskStatus, TaskType } from '@shared/types';
import { describeRecurrence, formatWhen, hhmm, toLocalInput } from '@shared/schedule';
import { useStore } from '@/store/useStore';
import { Badge, Button, Card, Empty, Field, Input, Segmented, Select, Toggle } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { AssetIcon } from '@/lib/icons';
import { KIND_LABEL } from '@/lib/colors';

export const TASK_LABEL: Record<TaskType, string> = {
  pick_pack: 'Pick & pack',
  restock: 'Restock shelves',
  load_vehicle: 'Load vehicle',
  unload: 'Unload delivery',
  inventory_scan: 'Inventory scan',
  inspection: 'Inspection',
  patrol: 'Patrol',
  security_sweep: 'Security sweep',
  clean: 'Clean',
  charge: 'Charge',
  move_to_site: 'Move to location',
  maintenance: 'Maintenance',
  custom: 'Custom',
};

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  planned: '#5a9bf0',
  queued: '#f0a33a',
  running: '#8bd450',
  done: '#6c747d',
  blocked: '#ec5b5b',
  cancelled: '#4a525b',
};

type CKind = TaskConstraint['kind'];
const C_LABEL: Record<CKind, string> = { window: 'Time window', before_job: 'Before a delivery', after_job: 'After a delivery', between_jobs: 'Between deliveries', fill_idle: 'Whenever idle' };

function jobEnd(j: Job): number {
  return j.completedAt ?? j.etaAt ?? j.startAt + (j.option.pickupEtaMin + j.option.durationMin) * 60_000;
}

/** Best estimate of when a task runs, for the timeline. */
export function taskSpan(t: MachineTask, jobs: Job[], now: number): { start: number; end: number } | undefined {
  const dur = t.durationMin * 60_000;
  if (t.status === 'running' && t.startedAt) return { start: t.startedAt, end: t.startedAt + dur };
  if (t.status === 'done' && t.startedAt) return { start: t.startedAt, end: t.finishedAt ?? t.startedAt + dur };
  const c = t.constraint;
  const job = (id: string) => jobs.find((j) => j.id === id);
  if (c.kind === 'window' && t.windowStart !== undefined) return { start: t.windowStart, end: Math.max(t.windowStart + dur, t.windowEnd ?? 0) };
  if (c.kind === 'before_job') {
    const j = job(c.jobId);
    if (!j) return undefined;
    const end = j.startAt - c.offsetMin * 60_000;
    return { start: end - dur, end };
  }
  if (c.kind === 'after_job') {
    const j = job(c.jobId);
    if (!j) return undefined;
    const start = Math.max(now, jobEnd(j) + c.offsetMin * 60_000);
    return { start, end: start + dur };
  }
  if (c.kind === 'between_jobs') {
    const a = job(c.jobId);
    const b = job(c.jobId2);
    if (!a) return undefined;
    const start = Math.max(now, jobEnd(a));
    return { start, end: b ? Math.max(start + dur, b.startAt) : start + dur };
  }
  return undefined;
}

export function describeConstraint(t: MachineTask, now: number): string {
  const c = t.constraint;
  if (c.kind === 'window') {
    const w = t.windowStart !== undefined ? `${formatWhen(t.windowStart, now)}${t.windowEnd ? `–${hhmm(t.windowEnd)}` : ''}` : 'Any time';
    return t.recurrence ? `${w} · ${describeRecurrence(t.recurrence)}` : w;
  }
  if (c.kind === 'before_job') return `${c.offsetMin} min before ${c.jobId} leaves`;
  if (c.kind === 'after_job') return `${c.offsetMin} min after ${c.jobId} is delivered`;
  if (c.kind === 'between_jobs') return `Between ${c.jobId} and ${c.jobId2}`;
  return 'Whenever the machine is idle';
}

// ---------------------------------------------------------------- builder
function TaskBuilder({ initialAssets, initialSite }: { initialAssets: string[]; initialSite?: string }) {
  const s = useStore();
  const now = s.sim.now;
  const machines = s.assets.filter((a) => a.ownership !== 'external');
  const upcomingJobs = s.jobs.filter((j) => ['scheduled', 'assigned', 'to_pickup', 'loading', 'in_transit'].includes(j.status)).sort((a, b) => a.startAt - b.startAt);
  const round = (t: number) => Math.ceil(t / 900_000) * 900_000;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('restock');
  const [assetIds, setAssetIds] = useState<string[]>(initialAssets);
  const [siteId, setSiteId] = useState(initialSite ?? (initialAssets.length ? s.assets.find((a) => a.id === initialAssets[0])?.siteId ?? '' : 'S-PRDC'));
  const [zone, setZone] = useState('');
  const [ck, setCk] = useState<CKind>('window');
  const [start, setStart] = useState(round(now + 15 * 60_000));
  const [end, setEnd] = useState(round(now + 75 * 60_000));
  const [jobId, setJobId] = useState(upcomingJobs[0]?.id ?? '');
  const [jobId2, setJobId2] = useState(upcomingJobs[1]?.id ?? '');
  const [offset, setOffset] = useState(10);
  const [duration, setDuration] = useState(30);
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekdays' | 'weekly'>('none');
  const [priority, setPriority] = useState<MachineTask['priority']>('normal');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (initialAssets.length) {
      setAssetIds(initialAssets);
      const site = s.assets.find((a) => a.id === initialAssets[0])?.siteId;
      if (site) setSiteId(site);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssets.join(',')]);
  useEffect(() => {
    if (initialSite) setSiteId(initialSite);
  }, [initialSite]);

  const site = s.sites.find((x) => x.id === siteId);
  const zones = site?.zones ?? [];
  const candidates = machines.filter((a) => !assetIds.includes(a.id) && (!q || `${a.id} ${a.name} ${KIND_LABEL[a.kind]}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 8);
  const siteMachines = machines.filter((a) => a.siteId === siteId && !assetIds.includes(a.id));

  const constraint: TaskConstraint =
    ck === 'window' ? { kind: 'window' } : ck === 'before_job' ? { kind: 'before_job', jobId, offsetMin: offset } : ck === 'after_job' ? { kind: 'after_job', jobId, offsetMin: offset } : ck === 'between_jobs' ? { kind: 'between_jobs', jobId, jobId2 } : { kind: 'fill_idle' };
  const recurrence: Recurrence | undefined =
    ck !== 'window' || repeat === 'none'
      ? undefined
      : repeat === 'daily'
        ? { freq: 'daily', interval: 1, time: hhmm(start) }
        : repeat === 'weekdays'
          ? { freq: 'weekly', interval: 1, byWeekday: [0, 1, 2, 3, 4], time: hhmm(start) }
          : { freq: 'weekly', interval: 1, time: hhmm(start) };

  const problems: string[] = [];
  if (!assetIds.length) problems.push('Pick at least one machine');
  if (ck === 'window' && end <= start) problems.push('The window must end after it starts');
  if (ck === 'window' && (end - start) / 60_000 < duration) problems.push(`The window is shorter than the ${duration}-minute task`);
  if ((ck === 'before_job' || ck === 'after_job' || ck === 'between_jobs') && !jobId) problems.push('Choose a delivery');
  if (ck === 'between_jobs' && (!jobId2 || jobId2 === jobId)) problems.push('Choose two different deliveries');

  const label = title.trim() || `${TASK_LABEL[type]}${zone ? ` — ${zone}` : ''}`;
  const preview = `${assetIds.length ? assetIds.join(', ') : 'Selected machines'} will ${TASK_LABEL[type].toLowerCase()}${site ? ` at ${site.name}` : ''}${zone ? ` (${zone})` : ''} for ${duration} min — ${
    ck === 'window' ? `between ${formatWhen(start, now)} and ${hhmm(end)}${recurrence ? `, ${describeRecurrence(recurrence).toLowerCase()}` : ''}` : C_LABEL[ck].toLowerCase()
  }${ck === 'before_job' ? `, finishing ${offset} min before ${jobId} leaves` : ck === 'after_job' ? `, starting ${offset} min after ${jobId} is delivered` : ck === 'between_jobs' ? ` ${jobId} and ${jobId2}` : ''}.`;

  const submit = () => {
    const t = s.addTask({
      title: label,
      type,
      assetIds,
      siteId: siteId || undefined,
      zone: zone || undefined,
      constraint,
      windowStart: ck === 'window' ? start : undefined,
      windowEnd: ck === 'window' ? end : undefined,
      durationMin: duration,
      recurrence,
      priority,
      status: ck === 'fill_idle' ? 'queued' : 'planned',
    });
    toast.success(`${t.id} planned`, label);
    setTitle('');
  };

  return (
    <Card title="Give machines a task" sub="Between times, before or after deliveries, or whenever they're idle">
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Task">
            <Select value={type} onChange={(e) => setType(e.target.value as TaskType)} className="w-full">
              {Object.entries(TASK_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title (optional)">
            <Input value={title} placeholder={label} onChange={(e) => setTitle(e.target.value)} className="w-full" />
          </Field>
        </div>

        <Field label="Machines">
          <div className="rounded-lg border border-line bg-[#1a1d21] p-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {assetIds.map((id) => {
                const a = s.assets.find((x) => x.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 text-[12px] pl-1.5 pr-1 py-0.5 rounded-md bg-panel-3">
                    {a && <AssetIcon kind={a.kind} size={12} />} {id}
                    <button type="button" onClick={() => setAssetIds(assetIds.filter((x) => x !== id))} className="text-dim hover:text-text">
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              <div className="relative flex-1 min-w-[120px]">
                <Search size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-dim" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add machine…" className="w-full bg-transparent outline-none text-[12px] pl-5 py-0.5" />
              </div>
            </div>
            {(q || !assetIds.length) && (
              <div className="flex flex-wrap gap-1">
                {(q ? candidates : siteMachines.slice(0, 8)).map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => {
                      setAssetIds([...assetIds, a.id]);
                      setQ('');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-line text-muted hover:text-text hover:border-[#4a525b]"
                  >
                    <AssetIcon kind={a.kind} size={11} /> {a.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Location">
            <Select
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setZone('');
              }}
              className="w-full"
            >
              <option value="">Where the machine is</option>
              {s.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full" disabled={!zones.length}>
              <option value="">{zones.length ? 'Any zone' : 'No zones'}</option>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="When">
          <Select value={ck} onChange={(e) => setCk(e.target.value as CKind)} className="w-full">
            {(Object.keys(C_LABEL) as CKind[]).map((k) => (
              <option key={k} value={k}>
                {C_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        {ck === 'window' && (
          <div className="grid grid-cols-1 gap-2">
            <Field label="From">
              <Input type="datetime-local" value={toLocalInput(start)} onChange={(e) => e.target.value && setStart(new Date(e.target.value).getTime())} className="w-full" />
            </Field>
            <Field label="Until">
              <Input type="datetime-local" value={toLocalInput(end)} onChange={(e) => e.target.value && setEnd(new Date(e.target.value).getTime())} className="w-full" />
            </Field>
            <Field label="Repeat">
              <Segmented
                value={repeat}
                onChange={setRepeat}
                options={[
                  { value: 'none', label: 'Once' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekdays', label: 'Weekdays' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
              />
            </Field>
          </div>
        )}
        {(ck === 'before_job' || ck === 'after_job' || ck === 'between_jobs') && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={ck === 'between_jobs' ? 'After delivery' : 'Delivery'} className={ck === 'between_jobs' ? '' : 'col-span-2'}>
              <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full">
                {upcomingJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.id} · {formatWhen(j.startAt, now)} · {j.pickup.name} → {j.dropoff.name}
                  </option>
                ))}
              </Select>
            </Field>
            {ck === 'between_jobs' ? (
              <Field label="Before delivery">
                <Select value={jobId2} onChange={(e) => setJobId2(e.target.value)} className="w-full">
                  {upcomingJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.id} · {formatWhen(j.startAt, now)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={ck === 'before_job' ? 'Finish this many minutes before it leaves' : 'Start this many minutes after delivery'} className="col-span-2">
                <Input type="number" min={0} value={offset} onChange={(e) => setOffset(Math.max(0, +e.target.value))} className="w-full" />
              </Field>
            )}
          </div>
        )}
        {ck === 'fill_idle' && <div className="text-xs text-muted">The machine picks this up the next time it has a free gap long enough — handy for scans, cleaning and restocks.</div>}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration (min)">
            <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Math.max(1, +e.target.value))} className="w-full" />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as MachineTask['priority'])} className="w-full">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
        </div>

        <div className="rounded-lg bg-panel-2 border border-line px-3 py-2.5 text-xs text-muted leading-relaxed">{preview}</div>
        {problems.length > 0 && <div className="text-xs text-amber">{problems[0]}</div>}
        <Button variant="primary" className="w-full" disabled={problems.length > 0} onClick={submit} icon={<CalendarPlus size={15} />}>
          Plan task
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- timeline
function Timeline({ highlight }: { highlight: string[] }) {
  const s = useStore();
  const now = s.sim.now;
  const from = now - 60 * 60_000;
  const to = now + 11 * 60 * 60_000;
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100))}%`;
  const w = (a: number, b: number) => `${Math.max(0.6, ((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100)}%`;

  const rows = useMemo(() => {
    const ids = new Set<string>(highlight);
    const spans = new Map<string, { kind: 'task' | 'job'; id: string; label: string; start: number; end: number; color: string; status: string }[]>();
    const push = (assetId: string, item: { kind: 'task' | 'job'; id: string; label: string; start: number; end: number; color: string; status: string }) => {
      if (item.end < from || item.start > to) return;
      ids.add(assetId);
      spans.set(assetId, [...(spans.get(assetId) ?? []), item]);
    };
    for (const t of s.tasks) {
      if (t.status === 'cancelled') continue;
      const span = taskSpan(t, s.jobs, now);
      if (!span) continue;
      for (const id of t.assetIds) push(id, { kind: 'task', id: t.id, label: t.title, ...span, color: TASK_STATUS_COLOR[t.status], status: t.status });
    }
    for (const j of s.jobs) {
      const assetId = j.assetId ?? j.option.assetId;
      if (!assetId || ['cancelled', 'recurring'].includes(j.status)) continue;
      const a = s.assets.find((x) => x.id === assetId);
      if (!a || a.ownership === 'external') continue;
      push(assetId, { kind: 'job', id: j.id, label: `${j.id} ${j.pickup.name} → ${j.dropoff.name}`, start: j.startAt, end: jobEnd(j), color: '#a873e8', status: j.status });
    }
    return [...ids]
      .map((id) => ({ asset: s.assets.find((a) => a.id === id), items: spans.get(id) ?? [] }))
      .filter((r): r is { asset: Asset; items: typeof r.items } => !!r.asset)
      .sort((a, b) => (a.asset.siteId ?? '').localeCompare(b.asset.siteId ?? '') || a.asset.id.localeCompare(b.asset.id));
  }, [s.tasks, s.jobs, s.assets, Math.floor(now / 60_000), highlight.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours: number[] = [];
  const h0 = new Date(from);
  h0.setMinutes(0, 0, 0);
  for (let t = h0.getTime() + 3600_000; t < to; t += 3600_000) hours.push(t);

  return (
    <Card title="Timeline" sub="Machine tasks and deliveries, next 11 hours" actions={<div className="flex items-center gap-3 text-[11px] text-muted"><Legend color="#5a9bf0" label="Planned" /><Legend color="#8bd450" label="Running" /><Legend color="#f0a33a" label="Queued" /><Legend color="#a873e8" label="Delivery" /></div>}>
      {rows.length === 0 ? (
        <Empty title="Nothing scheduled">Plan a task on the left — it appears here with the deliveries around it.</Empty>
      ) : (
        <div className="relative">
          <div className="relative h-6 ml-[150px] border-b border-line">
            {hours.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 text-[10px] text-dim tabular-nums" style={{ left: x(t) }}>
                {hhmm(t)}
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="absolute top-0 bottom-0 left-[150px] right-0 pointer-events-none">
              {hours.map((t) => (
                <span key={t} className="absolute top-0 bottom-0 border-l border-line/50" style={{ left: x(t) }} />
              ))}
              <span className="absolute top-0 bottom-0 border-l-2 border-red z-10" style={{ left: x(now) }}>
                <span className="absolute -top-1 -translate-x-1/2 text-[9px] font-bold text-red bg-panel px-1">NOW</span>
              </span>
            </div>
            {rows.map(({ asset, items }) => (
              <div key={asset.id} className={clsx('flex items-center h-9 border-b border-line/60', highlight.includes(asset.id) && 'bg-blue/[0.05]')}>
                <div className="w-[150px] shrink-0 flex items-center gap-2 pr-2 text-[12px] min-w-0">
                  <AssetIcon kind={asset.kind} size={13} />
                  <span className="font-semibold whitespace-nowrap shrink-0">{asset.id}</span>
                  <span className="text-dim truncate text-[11px] min-w-0">{s.sites.find((x) => x.id === asset.siteId)?.name.replace(/^(FreshCo|Hive) /, '')}</span>
                </div>
                <div className="relative flex-1 h-full">
                  {items.map((it) => (
                    <div
                      key={`${it.kind}-${it.id}`}
                      title={`${it.id} · ${it.label} · ${hhmm(it.start)}–${hhmm(it.end)} · ${it.status}`}
                      className={clsx('absolute top-1.5 bottom-1.5 rounded-md px-1.5 text-[10.5px] font-semibold truncate leading-6', it.kind === 'job' && 'border border-dashed')}
                      style={{ left: x(it.start), width: w(it.start, it.end), background: it.kind === 'job' ? `${it.color}22` : `${it.color}cc`, borderColor: it.color, color: it.kind === 'job' ? it.color : '#101317' }}
                    >
                      {it.kind === 'job' ? it.id : it.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);

// ---------------------------------------------------------------- page
export function Tasks() {
  const [params] = useSearchParams();
  const s = useStore();
  const now = s.sim.now;
  const initialAssets = useMemo(() => (params.get('assets') ?? '').split(',').filter(Boolean), [params]);
  const initialSite = params.get('site') ?? undefined;
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  const list = s.tasks
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? ['done', 'cancelled'].includes(t.status) : !['done', 'cancelled'].includes(t.status)))
    .sort((a, b) => (taskSpan(a, s.jobs, now)?.start ?? Infinity) - (taskSpan(b, s.jobs, now)?.start ?? Infinity));

  return (
    <div className="p-5 flex gap-4 items-start">
      <div className="w-[380px] shrink-0 space-y-4 sticky top-0">
        <TaskBuilder initialAssets={initialAssets} initialSite={initialSite} />
        <Card title="Automations" sub="Rules that run across the whole fleet">
          <div className="space-y-3">
            {s.automations.map((a) => (
              <Toggle key={a.id} checked={a.enabled} onChange={() => s.toggleAutomation(a.id)} label={a.name} sub={a.description} />
            ))}
          </div>
        </Card>
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        <Timeline highlight={initialAssets} />
        <Card
          title="Tasks"
          actions={
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'done', label: 'Finished' },
                { value: 'all', label: 'All' },
              ]}
            />
          }
          bodyClass="pb-2"
        >
          {list.length === 0 ? (
            <Empty title="No tasks" />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
                  <th className="font-semibold px-5 py-2">Task</th>
                  <th className="font-semibold py-2">Machines</th>
                  <th className="font-semibold py-2">Where</th>
                  <th className="font-semibold py-2">When</th>
                  <th className="font-semibold py-2">Status</th>
                  <th className="py-2 pr-5" />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const site = s.sites.find((x) => x.id === t.siteId);
                  return (
                    <tr key={t.id} className="border-t border-line">
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-[11px] text-dim">
                          {t.id} · {TASK_LABEL[t.type]} · {t.durationMin} min{t.priority !== 'normal' ? ` · ${t.priority}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {t.assetIds.map((id) => {
                            const a = s.assets.find((x) => x.id === id);
                            return (
                              <span key={id} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-panel-2">
                                {a && <AssetIcon kind={a.kind} size={11} />} {id}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 text-muted text-xs">
                        {site?.name ?? '—'}
                        {t.zone ? ` · ${t.zone}` : ''}
                      </td>
                      <td className="py-2.5 text-xs">{describeConstraint(t, now)}</td>
                      <td className="py-2.5">
                        <Badge color={TASK_STATUS_COLOR[t.status]}>{t.status}</Badge>
                      </td>
                      <td className="py-2.5 pr-5 text-right whitespace-nowrap">
                        {['planned', 'queued', 'blocked'].includes(t.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Play size={12} />}
                            title="Run as soon as the machines are free"
                            onClick={() => {
                              s.updateTask(t.id, { constraint: { kind: 'window' }, windowStart: now, windowEnd: now + (t.durationMin + 30) * 60_000, status: 'planned' });
                              toast.info(`${t.id} will start as soon as ${t.assetIds.join(', ')} ${t.assetIds.length > 1 ? 'are' : 'is'} free`);
                            }}
                          >
                            Now
                          </Button>
                        )}
                        {['planned', 'queued', 'running', 'blocked'].includes(t.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Ban size={12} />}
                            onClick={() => {
                              s.cancelTask(t.id);
                              toast.warning(`${t.id} cancelled`);
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                        {['done', 'cancelled'].includes(t.status) && (
                          <Button size="sm" variant="ghost" icon={<Trash size={12} />} onClick={() => s.removeTask(t.id)}>
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
