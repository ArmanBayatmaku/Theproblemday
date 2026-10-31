import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Ban, Copy, MapPinned, Plus, Repeat, Search, Shuffle } from 'lucide-react';
import type { Job, JobDraft, JobStatus, LngLat, QuoteOption } from '@shared/types';
import { describeRecurrence, describeTiming, formatWhen, hhmm, nextOccurrence } from '@shared/schedule';
import { useStore } from '@/store/useStore';
import { Badge, Bar, Button, Card, Drawer, Empty, Input, JobStatusPill, Select, Stat, Tabs } from '@/components/ui';
import { FleetMap } from '@/components/map/FleetMap';
import type { FocusPoint } from '@/components/map/layers';
import { OptionIcon, optionColor } from '@/pages/RequestJob';
import { kg, mins, money, money0 } from '@/lib/format';
import { JOB_STATUS_COLOR } from '@/lib/colors';
import { toast } from '@/components/ui/toast';
import { PROVIDERS } from '@shared/providers';

type Tab = 'active' | 'scheduled' | 'recurring' | 'completed' | 'all';
const ACTIVE: JobStatus[] = ['assigned', 'to_pickup', 'loading', 'in_transit'];
const inTab = (j: Job, t: Tab) =>
  t === 'all' ||
  (t === 'active' && ACTIVE.includes(j.status)) ||
  (t === 'scheduled' && j.status === 'scheduled') ||
  (t === 'recurring' && j.status === 'recurring') ||
  (t === 'completed' && ['delivered', 'failed', 'cancelled'].includes(j.status));

function whenLabel(j: Job, now: number) {
  if (j.status === 'recurring') return describeTiming(j.timing, now);
  if (j.status === 'delivered' && j.completedAt) return `Delivered ${formatWhen(j.completedAt, now)}`;
  if (ACTIVE.includes(j.status) && j.etaAt) return `ETA ${hhmm(j.etaAt)}`;
  return formatWhen(j.startAt, now);
}

function Progress({ job }: { job: Job }) {
  const asset = useStore((s) => (job.assetId ? s.assets.find((a) => a.id === job.assetId) : undefined));
  if (!ACTIVE.includes(job.status)) return null;
  const r = asset?.route;
  const leg = r ? r.progressM / Math.max(1, r.totalM) : 0;
  const pct = job.status === 'in_transit' ? 50 + leg * 50 : job.status === 'loading' ? 50 : leg * 50;
  return <Bar value={pct} color={JOB_STATUS_COLOR[job.status]} className="w-24" />;
}

export function Jobs() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const jobs = useStore((s) => s.jobs);
  const now = useStore((s) => s.sim.now);
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const openId = params.get('job');
  const open = openId ? jobs.find((j) => j.id === openId) : undefined;

  const dayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [Math.floor(now / 3600_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    const delivered = jobs.filter((j) => j.status === 'delivered' && (j.completedAt ?? 0) >= dayStart);
    const onTime = delivered.filter((j) => !j.etaAt || (j.completedAt ?? 0) <= j.etaAt + 2 * 60_000).length;
    return {
      active: jobs.filter((j) => ACTIVE.includes(j.status)).length,
      scheduled: jobs.filter((j) => j.status === 'scheduled').length,
      recurring: jobs.filter((j) => j.status === 'recurring').length,
      delivered: delivered.length,
      spend: delivered.reduce((a, j) => a + j.option.price, 0),
      onTime: delivered.length ? Math.round((onTime / delivered.length) * 100) : 100,
    };
  }, [jobs, dayStart]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, scheduled: 0, recurring: 0, completed: 0, all: jobs.length };
    for (const j of jobs) (['active', 'scheduled', 'recurring', 'completed'] as Tab[]).forEach((t) => inTab(j, t) && c[t]++);
    return c;
  }, [jobs]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return jobs
      .filter((j) => inTab(j, tab))
      .filter((j) => !provider || (provider === 'own' ? j.option.category === 'own_fleet' : j.option.providerId === provider))
      .filter((j) => !t || `${j.id} ${j.customer} ${j.pickup.name} ${j.dropoff.name} ${j.option.providerName} ${j.cargo.description}`.toLowerCase().includes(t))
      .sort((a, b) => (tab === 'completed' ? (b.completedAt ?? b.startAt) - (a.completedAt ?? a.startAt) : tab === 'active' ? (a.etaAt ?? 0) - (b.etaAt ?? 0) : a.startAt - b.startAt))
      .slice(0, 250);
  }, [jobs, tab, q, provider]);

  const setOpen = (id?: string) => setParams(id ? { job: id } : {}, { replace: true });

  return (
    <div className="p-5 space-y-4">
      <Card bodyClass="px-5 py-4">
        <div className="grid grid-cols-6 gap-6">
          <Stat label="Active now" value={kpis.active} color="#8bd450" onClick={() => setTab('active')} />
          <Stat label="Scheduled" value={kpis.scheduled} color="#5a9bf0" onClick={() => setTab('scheduled')} />
          <Stat label="Recurring series" value={kpis.recurring} color="#b48ae8" onClick={() => setTab('recurring')} />
          <Stat label="Delivered today" value={kpis.delivered} onClick={() => setTab('completed')} />
          <Stat label="Spend today" value={money0(kpis.spend)} />
          <Stat label="On time" value={`${kpis.onTime}%`} color={kpis.onTime >= 90 ? '#8bd450' : '#f0a33a'} />
        </div>
      </Card>

      <Card bodyClass="pb-2">
        <div className="flex items-center justify-between gap-3 px-5 pt-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'active', label: 'Active', count: counts.active },
              { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
              { value: 'recurring', label: 'Recurring', count: counts.recurring },
              { value: 'completed', label: 'Completed', count: counts.completed },
              { value: 'all', label: 'All', count: counts.all },
            ]}
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" className="pl-8 w-52" />
            </div>
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">All methods</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="own">Own fleet</option>
            </Select>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => nav('/request')}>
              New job
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty title="No jobs here">Book one from Request Job — or ask the assistant.</Empty>
        ) : (
          <table className="w-full text-[13px] mt-1">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
                <th className="font-semibold px-5 py-2.5">Job</th>
                <th className="font-semibold py-2.5">Route</th>
                <th className="font-semibold py-2.5">Method</th>
                <th className="font-semibold py-2.5">Cargo</th>
                <th className="font-semibold py-2.5">When</th>
                <th className="font-semibold py-2.5">Status</th>
                <th className="font-semibold py-2.5 text-right pr-5">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} onClick={() => setOpen(j.id)} className={clsx('border-t border-line cursor-pointer hover:bg-panel-2/60', open?.id === j.id && 'bg-panel-2')}>
                  <td className="px-5 py-2.5">
                    <div className="font-semibold tabular-nums">{j.id}</div>
                    <div className="text-[11px] text-muted truncate max-w-[180px]">{j.customer}</div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5 max-w-[300px]">
                      <span className="truncate">{j.pickup.name}</span>
                      <ArrowRight size={12} className="text-dim shrink-0" />
                      <span className="truncate">{j.dropoff.name}</span>
                    </div>
                    {j.seriesId && <div className="text-[11px] text-dim">from series {j.seriesId}</div>}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span style={{ color: optionColor(j.option) }}>
                        <OptionIcon q={j.option} size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate max-w-[170px]">{j.option.providerName}</div>
                        <div className="text-[11px] text-dim truncate max-w-[170px]">{j.assetId ?? j.option.serviceName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-muted">
                    <div className="truncate max-w-[170px]">{j.cargo.description}</div>
                    <div className="text-[11px] text-dim">{kg(j.cargo.weightKg)}{j.cargo.temperature && j.cargo.temperature !== 'ambient' ? ` · ${j.cargo.temperature}` : ''}</div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1.5">{j.status === 'recurring' && <Repeat size={12} className="text-violet" />}{whenLabel(j, now)}</div>
                    <Progress job={j} />
                  </td>
                  <td className="py-2.5">
                    <JobStatusPill status={j.status} />
                  </td>
                  <td className="py-2.5 pr-5 text-right num">{money(j.option.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Drawer open={!!open} onClose={() => setOpen()} title={open ? `${open.id} · ${open.customer}` : ''} width={480}>
        {open && <JobDetail job={open} onClose={() => setOpen()} />}
      </Drawer>
    </div>
  );
}

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const nav = useNavigate();
  const s = useStore();
  const now = s.sim.now;
  const asset = job.assetId ? s.assets.find((a) => a.id === job.assetId) : undefined;
  const [rebook, setRebook] = useState<QuoteOption[] | null>(null);
  const occurrences = s.jobs.filter((j) => j.seriesId === job.id).sort((a, b) => b.startAt - a.startAt);
  const canChange = job.status === 'scheduled' || job.status === 'recurring';
  const canCancel = !['delivered', 'cancelled', 'failed'].includes(job.status);

  const points: FocusPoint[] = [
    { position: job.pickup.position, label: job.pickup.name, color: [139, 212, 80] },
    { position: job.dropoff.position, label: job.dropoff.name, color: [168, 115, 232] },
  ];
  const fit: LngLat[] = [job.pickup.position, job.dropoff.position, ...(asset && ACTIVE.includes(job.status) ? [asset.position] : [])];

  const nextRuns = useMemo(() => {
    if (job.timing.mode !== 'recurring') return [];
    const out: number[] = [];
    let after = now;
    for (let i = 0; i < 3; i++) {
      const t = nextOccurrence(job.timing.rule, new Date(job.timing.startAt).getTime(), after);
      if (!t) break;
      out.push(t);
      after = t + 60_000;
    }
    return out;
  }, [job.timing, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftOf = (): JobDraft => ({ pickup: job.pickup, dropoff: job.dropoff, cargo: job.cargo, timing: job.timing, priority: job.priority, customer: job.customer, notes: job.notes });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <JobStatusPill status={job.status} />
        <span className="text-xs text-muted">Created {formatWhen(job.createdAt, now)}</span>
      </div>

      <div className="relative h-[200px] rounded-xl overflow-hidden border border-line">
        <FleetMap variant="mini" className="absolute inset-0" focusRoute={asset?.route?.path ?? job.option.route} focusPoints={points} fitTo={fit} />
      </div>

      <div className="rounded-xl border border-line divide-y divide-line text-[13px]">
        {[
          ['Route', `${job.pickup.name} → ${job.dropoff.name}`],
          ['Cargo', `${job.cargo.description} · ${kg(job.cargo.weightKg)} · ${job.cargo.quantity} item${job.cargo.quantity > 1 ? 's' : ''}${job.cargo.temperature && job.cargo.temperature !== 'ambient' ? ` · ${job.cargo.temperature}` : ''}${job.cargo.fragile ? ' · fragile' : ''}`],
          ['When', job.timing.mode === 'recurring' ? describeRecurrence(job.timing.rule, new Date(job.timing.startAt).getTime()) : formatWhen(job.startAt, now)],
          ['Method', `${job.option.providerName} · ${job.option.serviceName}`],
          ['Price', `${money(job.option.price)}${job.timing.mode === 'recurring' ? ' per run' : ''}`],
          ...(asset ? [['Machine', `${asset.id} · ${asset.name}`]] : []),
          ...(job.etaAt && ACTIVE.includes(job.status) ? [['ETA', `${hhmm(job.etaAt)} (${mins(Math.max(0, (job.etaAt - now) / 60_000))})`]] : []),
          ...(job.notes ? [['Notes', job.notes]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5">
            <span className="text-muted shrink-0">{k}</span>
            <span className="text-right">{v}</span>
          </div>
        ))}
      </div>

      {job.option.simulated && <div className="text-[11px] text-dim -mt-3">Simulated provider booking — no real request was sent.</div>}

      <div className="flex flex-wrap gap-2">
        {asset && (
          <Button
            icon={<MapPinned size={14} />}
            onClick={() => {
              s.setSelection([asset.id]);
              s.setMap({ follow: true });
              nav('/map');
            }}
          >
            Track on map
          </Button>
        )}
        {canChange && (
          <Button icon={<Shuffle size={14} />} onClick={() => setRebook(s.quote(draftOf()))}>
            Change method
          </Button>
        )}
        <Button
          icon={<Copy size={14} />}
          onClick={() => {
            s.setDraft({ ...draftOf(), timing: { mode: 'now' } });
            nav('/request');
          }}
        >
          Duplicate
        </Button>
        {canCancel && (
          <Button
            variant="danger"
            icon={<Ban size={14} />}
            onClick={() => {
              s.cancelJob(job.id);
              toast.warning(`${job.id} cancelled`);
              onClose();
            }}
          >
            {job.status === 'recurring' ? 'Stop series' : 'Cancel'}
          </Button>
        )}
      </div>

      {rebook && (
        <div className="space-y-2 fade-in">
          <div className="label-caps text-[12px] text-muted">Choose a new method</div>
          {rebook.map((q) => (
            <button
              type="button"
              key={q.id}
              disabled={!q.available}
              onClick={() => {
                s.rebookJob(job.id, q);
                toast.success(`${job.id} switched to ${q.providerName}`, money(q.price));
                setRebook(null);
              }}
              className={clsx('w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left', q.id === job.option.id ? 'border-blue' : 'border-line', q.available ? 'hover:bg-panel-2' : 'opacity-45 cursor-not-allowed')}
            >
              <span style={{ color: optionColor(q) }}>
                <OptionIcon q={q} size={16} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] truncate">{q.providerName} <span className="text-muted">· {q.serviceName}</span></span>
                <span className="block text-[11px] text-dim truncate">{q.available ? `${mins(q.pickupEtaMin + q.durationMin)} door to door` : q.reasons[0]}</span>
              </span>
              <span className="num text-[14px]">{money(q.price)}</span>
            </button>
          ))}
        </div>
      )}

      {job.timing.mode === 'recurring' && (
        <div>
          <div className="label-caps text-[12px] text-muted mb-2">Series</div>
          <div className="text-xs text-muted mb-2">Next runs: {nextRuns.length ? nextRuns.map((t) => formatWhen(t, now)).join(' · ') : '—'}</div>
          {occurrences.length > 0 && (
            <div className="space-y-1">
              {occurrences.slice(0, 6).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-md bg-panel-2">
                  <span className="tabular-nums">{o.id}</span>
                  <span className="text-muted">{formatWhen(o.startAt, now)}</span>
                  <JobStatusPill status={o.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="label-caps text-[12px] text-muted mb-2">Timeline</div>
        <ol className="relative border-l border-line ml-1.5 space-y-3">
          {[...job.history].reverse().map((h, i) => (
            <li key={i} className="pl-4 relative">
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: JOB_STATUS_COLOR[h.status] }} />
              <div className="flex items-center gap-2 text-[13px]">
                <Badge color={JOB_STATUS_COLOR[h.status]}>{h.status.replace('_', ' ')}</Badge>
                <span className="text-dim text-[11px]">{formatWhen(h.at, now)}</span>
              </div>
              {h.note && <div className="text-xs text-muted mt-0.5">{h.note}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
