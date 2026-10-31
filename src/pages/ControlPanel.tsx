import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { BatteryCharging, CloudLightning, House, Moon, Pause, Play, PlaneLanding, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Asset, CommandName, LngLat } from '@shared/types';
import { useStore } from '@/store/useStore';
import { SelectionPanel } from '@/components/fleet/SelectionPanel';
import { CommandConsole } from '@/components/control/CommandConsole';
import { FleetMap } from '@/components/map/FleetMap';
import { Badge, Battery, Button, Card, Empty, StatusPill } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { capabilitiesFor, COMMAND_META } from '@/integrations/devices/capabilities';
import { routeLabel } from '@/integrations/devices/adapters';
import { AssetIcon } from '@/lib/icons';
import { KIND_LABEL, STATUS_COLOR } from '@/lib/colors';
import { ago, clockSec } from '@/lib/format';

const ROBOTS = ['humanoid', 'amr', 'sidewalk_robot', 'robot_arm'];
const airborne = (a: Asset) => a.kind === 'drone' && a.altitude > 5;
const mine = (a: Asset) => a.ownership !== 'external';

interface Step {
  command: CommandName;
  filter: (a: Asset) => boolean;
  params?: Record<string, unknown>;
}
interface Playbook {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  confirm?: string;
  steps: Step[];
}

const PLAYBOOKS: Playbook[] = [
  {
    id: 'storm',
    name: 'Storm protocol',
    description: 'Drones in the air return to base; moving sidewalk robots pause. Waiting drone jobs fall back to road methods.',
    icon: CloudLightning,
    color: '#f0a33a',
    confirm: 'Run the storm protocol now?',
    steps: [
      { command: 'return_to_base', filter: (a) => a.kind === 'drone' && mine(a) && ['en_route', 'working', 'holding'].includes(a.status) },
      { command: 'pause', filter: (a) => a.kind === 'sidewalk_robot' && ['en_route', 'working'].includes(a.status) },
    ],
  },
  { id: 'ground', name: 'Ground all drones', description: 'Every airborne drone lands where it is.', icon: PlaneLanding, color: '#ec5b5b', confirm: 'Land every airborne drone at its current position?', steps: [{ command: 'land', filter: (a) => airborne(a) && mine(a) }] },
  {
    id: 'pause-robots',
    name: 'Pause all robots',
    description: 'Humanoids, AMRs, sidewalk robots and arms pause in place.',
    icon: Pause,
    color: '#5a9bf0',
    steps: [{ command: 'pause', filter: (a) => ROBOTS.includes(a.kind) && !['paused', 'estop', 'offline', 'holding'].includes(a.status) }],
  },
  { id: 'resume', name: 'Resume operations', description: 'Everything paused or holding carries on.', icon: Play, color: '#8bd450', steps: [{ command: 'resume', filter: (a) => mine(a) && ['paused', 'holding'].includes(a.status) }] },
  {
    id: 'recall',
    name: 'Recall to base',
    description: 'Every machine that is out heads home. Their jobs are re-queued.',
    icon: House,
    color: '#b48ae8',
    confirm: 'Recall every machine that is out? Their jobs are re-queued for dispatch.',
    steps: [{ command: 'return_to_base', filter: (a) => mine(a) && ['en_route', 'working', 'holding'].includes(a.status) && !['amr', 'humanoid', 'robot_arm'].includes(a.kind) }],
  },
  { id: 'charge', name: 'Top up batteries', description: 'Idle machines under 40% go and charge.', icon: BatteryCharging, color: '#3fc1b0', steps: [{ command: 'charge', filter: (a) => mine(a) && a.status === 'idle' && a.battery < 40 }] },
  {
    id: 'night',
    name: 'Night mode',
    description: 'Lights on for drones and sidewalk robots, sidewalk robots limited to 6 km/h.',
    icon: Moon,
    color: '#9aa2ab',
    steps: [
      { command: 'lights_on', filter: (a) => ['drone', 'sidewalk_robot'].includes(a.kind) && mine(a) && !a.lightsOn },
      { command: 'set_speed_limit', filter: (a) => a.kind === 'sidewalk_robot', params: { speedKmh: 6 } },
    ],
  },
  { id: 'release', name: 'Release all E-STOPs', description: 'Releases emergency stops — machines stay paused until resumed.', icon: ShieldCheck, color: '#8bd450', confirm: 'Release every E-STOP? Make sure the area is safe first.', steps: [{ command: 'release_estop', filter: (a) => a.status === 'estop' }] },
];

function targetsFor(p: Playbook, assets: Asset[]) {
  return p.steps.map((st) => ({ step: st, ids: assets.filter((a) => st.filter(a) && capabilitiesFor(a).includes(st.command)).map((a) => a.id) }));
}

function Playbooks() {
  const s = useStore();
  const [pending, setPending] = useState<Playbook | null>(null);
  const run = (p: Playbook) => {
    setPending(null);
    let n = 0;
    for (const { step, ids } of targetsFor(p, useStore.getState().assets)) {
      if (!ids.length) continue;
      s.runCommand(step.command, ids, step.params);
      n += ids.length;
    }
    s.log({ level: 'info', text: `Playbook “${p.name}” ran on ${n} machine${n === 1 ? '' : 's'}` });
    (n ? toast.success : toast.info)(`${p.name}`, n ? `${n} machine${n === 1 ? '' : 's'} commanded` : 'nothing needed doing');
  };
  return (
    <Card title="Playbooks" sub="One click, many machines — each step goes only to machines that support it">
      {pending && (
        <div className="mb-3 rounded-lg border border-amber/50 bg-amber/10 p-3 flex items-center gap-3 fade-in">
          <ShieldAlert size={18} className="text-amber shrink-0" />
          <div className="flex-1 text-[13px]">{pending.confirm}</div>
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={() => run(pending)}>
            Run
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2.5">
        {PLAYBOOKS.map((p) => {
          const n = targetsFor(p, s.assets).reduce((a, t) => a + t.ids.length, 0);
          const Icon = p.icon;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => (p.confirm ? setPending(p) : run(p))}
              className="text-left rounded-xl border border-line hover:border-[#4a525b] bg-panel-2/40 p-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${p.color}1f`, color: p.color }}>
                  <Icon size={16} />
                </span>
                <span className={clsx('text-[11px] tabular-nums', n ? 'text-text' : 'text-dim')}>{n} affected</span>
              </div>
              <div className="font-semibold text-[13px] mt-2">{p.name}</div>
              <div className="text-[11px] text-muted mt-0.5 leading-snug">{p.description}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Telemetry({ assets }: { assets: Asset[] }) {
  const s = useStore();
  const now = s.sim.now;
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {assets.slice(0, 18).map((a) => {
        const job = a.currentJobId;
        const task = s.tasks.find((t) => t.id === a.currentTaskId);
        return (
          <div key={a.id} className="rounded-xl border border-line bg-panel-2/40 p-3" style={{ boxShadow: a.status === 'estop' ? 'inset 0 0 0 1px #ec5b5b' : undefined }}>
            <div className="flex items-center gap-2">
              <AssetIcon kind={a.kind} size={15} />
              <span className="font-semibold text-[13px]">{a.id}</span>
              <span className="text-[11px] text-dim truncate flex-1">{KIND_LABEL[a.kind]}</span>
              <StatusPill status={a.status} />
            </div>
            <div className="mt-2">
              <Battery value={a.battery} />
            </div>
            <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
              <div>
                <div className="text-dim">Speed</div>
                <div className="tabular-nums">{Math.round(a.speedKmh)} km/h</div>
              </div>
              <div>
                <div className="text-dim">{a.kind === 'drone' ? 'Altitude' : 'Heading'}</div>
                <div className="tabular-nums">{a.kind === 'drone' ? `${Math.round(a.altitude)} m` : `${Math.round(a.heading)}°`}</div>
              </div>
              <div>
                <div className="text-dim">Seen</div>
                <div className="tabular-nums">{ago(a.lastSeen, now)}</div>
              </div>
            </div>
            <div className="text-[11px] text-muted mt-2 truncate">{job ? `Job ${job}` : task ? `Task: ${task.title}` : a.status === 'charging' ? 'Charging' : 'No assignment'}</div>
            <div className="text-[10px] text-dim mt-0.5 truncate">via {routeLabel(a, 'pause')}</div>
          </div>
        );
      })}
      {assets.length > 18 && <div className="col-span-3 text-xs text-dim text-center">+{assets.length - 18} more selected</div>}
    </div>
  );
}

function FleetHealth() {
  const s = useStore();
  const mineAll = s.assets.filter(mine);
  const low = mineAll.filter((a) => a.battery < 25 && a.specs.energy === 'electric').sort((a, b) => a.battery - b.battery);
  const stopped = mineAll.filter((a) => ['estop', 'offline', 'maintenance'].includes(a.status));
  const paused = mineAll.filter((a) => ['paused', 'holding'].includes(a.status));
  const groups: { label: string; list: Asset[]; color: string }[] = [
    { label: 'Needs attention', list: stopped, color: '#ec5b5b' },
    { label: 'Paused / holding', list: paused, color: '#f0a33a' },
    { label: 'Low battery', list: low, color: '#f0a33a' },
  ];
  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted">Nothing selected. Pick machines on the left, with ⌘K, or drag a box on the Live Map. Here's what needs a look:</div>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-[11px] uppercase tracking-wide font-semibold mb-1.5" style={{ color: g.color }}>
            {g.label} · {g.list.length}
          </div>
          {g.list.length === 0 ? (
            <div className="text-xs text-dim">All clear.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {g.list.slice(0, 16).map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => s.setSelection([a.id])}
                  className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md border border-line hover:bg-panel-2"
                  style={{ color: STATUS_COLOR[a.status] }}
                >
                  <AssetIcon kind={a.kind} size={12} tinted={false} /> {a.id}
                  {g.label === 'Low battery' && <span className="text-dim">{Math.round(a.battery)}%</span>}
                </button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => s.setSelection(g.list.map((a) => a.id))}>
                Select all
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditLog() {
  const commands = useStore((s) => s.commands);
  return (
    <div className="flex-1 overflow-auto">
      {commands.length === 0 ? (
        <Empty title="No commands yet">Every command — who sent it, to which machines, through which adapter and the result — is recorded here.</Empty>
      ) : (
        <div className="divide-y divide-line">
          {commands.map((c) => (
            <div key={c.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dim tabular-nums">{clockSec(c.at)}</span>
                <span className="text-[13px] font-semibold flex-1 truncate">{COMMAND_META[c.command].label}</span>
                <Badge color={c.result === 'ok' ? '#8bd450' : c.result === 'partial' ? '#f0a33a' : '#ec5b5b'}>{c.result}</Badge>
              </div>
              <div className="text-[11px] text-muted mt-0.5 truncate">
                → {c.targetIds.length > 4 ? `${c.targetIds.slice(0, 4).join(', ')} +${c.targetIds.length - 4}` : c.targetIds.join(', ')} · by {c.by}
              </div>
              <div className="text-[11px] text-dim mt-0.5 line-clamp-2">{c.message}</div>
              <div className="text-[10px] text-dim mt-0.5 truncate">via {c.via}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ControlPanel() {
  const assets = useStore((s) => s.assets);
  const selection = useStore((s) => s.selection);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<LngLat>();
  const selected = useMemo(() => assets.filter((a) => selection.includes(a.id)), [assets, selection]);
  const fit = useMemo(() => (selected.length ? selected.map((a) => a.position) : undefined), [selection.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex min-h-0">
      <SelectionPanel className="w-[290px] border-r border-line" />
      <div className="flex-1 min-w-0 overflow-auto p-5 space-y-4">
        {selected.length > 0 ? (
          <>
            <Card title={`Command ${selected.length} machine${selected.length > 1 ? 's' : ''}`} sub={[...new Set(selected.map((a) => KIND_LABEL[a.kind]))].join(' · ')}>
              <CommandConsole assets={selected} onPickOnMap={() => setPicking(true)} pickedPoint={picked} />
            </Card>
            <Card title="Where" bodyClass="p-0" className="overflow-hidden" sub={picking ? 'Click the map to set the go-to point' : 'Selected machines · use Pick to choose a go-to point'}>
              <div className="relative h-[280px]">
                <FleetMap
                  variant="mini"
                  className="absolute inset-0"
                  fitTo={fit}
                  pickMode={picking}
                  onPick={(p) => {
                    setPicked(p);
                    setPicking(false);
                  }}
                  focusPoints={picked ? [{ position: picked, label: 'Go-to target', color: [240, 163, 58] }] : undefined}
                />
              </div>
            </Card>
            <Card title="Live telemetry">
              <Telemetry assets={selected} />
            </Card>
            <Playbooks />
          </>
        ) : (
          <>
            <Playbooks />
            <Card title="Fleet health">
              <FleetHealth />
            </Card>
            <Card title="Command" sub="Type an instruction, or select machines on the left">
              <CommandConsole assets={selected} />
            </Card>
          </>
        )}
      </div>
      <aside className="w-[320px] shrink-0 border-l border-line bg-panel flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-line">
          <div className="label-caps text-[13px]">Command log</div>
          <div className="text-[11px] text-muted">Audit trail of everything sent</div>
        </div>
        <AuditLog />
      </aside>
    </div>
  );
}
