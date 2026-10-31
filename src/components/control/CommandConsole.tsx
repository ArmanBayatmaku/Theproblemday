import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Crosshair, Send, ShieldAlert, Sparkles } from 'lucide-react';
import type { Asset, CommandName, LngLat } from '@shared/types';
import { useStore } from '@/store/useStore';
import { COMMAND_META, commonCapabilities, protocolMessage, type CommandGroup } from '@/integrations/devices/capabilities';
import { routeLabel } from '@/integrations/devices/adapters';
import { interpret } from '@shared/parser';
import { Button, Input, Select } from '@/components/ui';
import { toast } from '@/components/ui/toast';

const GROUP_LABEL: Record<CommandGroup, string> = {
  motion: 'Motion',
  safety: 'Safety',
  power: 'Power',
  payload: 'Payload',
  signal: 'Signals',
  system: 'System',
  assign: 'Assignment',
  comms: 'Comms',
};

export function CommandConsole({ assets, onPickOnMap, pickedPoint, compact }: { assets: Asset[]; onPickOnMap?: () => void; pickedPoint?: LngLat; compact?: boolean }) {
  const s = useStore();
  const [pending, setPending] = useState<CommandName | null>(null);
  const [siteId, setSiteId] = useState('');
  const [gotoSite, setGotoSite] = useState('');
  const [speed, setSpeed] = useState(30);
  const [message, setMessage] = useState('Please call the ops desk');
  const [nl, setNl] = useState('');

  const caps = useMemo(() => commonCapabilities(assets), [assets]);
  const groups = useMemo(() => {
    const m = new Map<CommandGroup, { command: CommandName; count: number }[]>();
    for (const c of caps) {
      const g = COMMAND_META[c.command].group;
      m.set(g, [...(m.get(g) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => Object.keys(GROUP_LABEL).indexOf(a[0]) - Object.keys(GROUP_LABEL).indexOf(b[0]));
  }, [caps]);

  const run = (cmd: CommandName, confirmed = false) => {
    const meta = COMMAND_META[cmd];
    if (meta.confirm && !confirmed) {
      setPending(cmd);
      return;
    }
    setPending(null);
    const params: Record<string, unknown> = {};
    if (cmd === 'goto') {
      const site = s.sites.find((x) => x.id === gotoSite);
      if (site) {
        params.position = site.position;
        params.label = site.name;
      } else if (pickedPoint) {
        params.position = pickedPoint;
        params.label = `${pickedPoint[1].toFixed(4)}, ${pickedPoint[0].toFixed(4)}`;
      }
    }
    if (cmd === 'assign_site') params.siteId = siteId;
    if (cmd === 'set_speed_limit') params.speedKmh = speed;
    if (cmd === 'message_driver') params.message = message;
    const targets = assets.filter((a) => (s.assets.find((x) => x.id === a.id) ? true : false)).map((a) => a.id);
    const rec = s.runCommand(cmd, targets, params);
    (rec.result === 'ok' ? toast.success : rec.result === 'partial' ? toast.warning : toast.danger)(rec.message || 'Command sent');
  };

  const runNl = () => {
    const intent = interpret(nl, { now: s.sim.now, sites: s.sites, assets: s.assets, draft: s.draft });
    if (intent.type !== 'command') {
      toast.warning('Try e.g. “pause DR-03”, “return all drones at Nine Elms”, “e-stop robots at Park Royal”');
      return;
    }
    const rec = s.runCommand(intent.command, intent.targetIds);
    (rec.result === 'ok' ? toast.success : toast.warning)(`${COMMAND_META[intent.command].label} → ${intent.targetLabel}: ${rec.message}`);
    setNl('');
  };

  const single = assets.length === 1 ? assets[0] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-violet" />
          <input
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runNl()}
            placeholder="Tell the fleet… “return all drones at Nine Elms”, “pause AMR-03”"
            className="input pl-8"
          />
        </div>
        <Button variant="subtle" icon={<Send size={14} />} onClick={runNl}>
          Run
        </Button>
      </div>

      {!assets.length && <div className="text-[13px] text-muted py-6 text-center">Select machines on the map or in the list to control them.</div>}

      {pending && (
        <div className="rounded-lg border border-red/50 bg-red/10 p-3 flex items-center gap-3 fade-in">
          <ShieldAlert size={18} className="text-red shrink-0" />
          <div className="flex-1 text-[13px]">{COMMAND_META[pending].confirm}</div>
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={() => run(pending, true)}>
            Confirm
          </Button>
        </div>
      )}

      {groups.map(([g, cmds]) => (
        <div key={g}>
          <div className="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1.5">{GROUP_LABEL[g]}</div>
          <div className={clsx('flex flex-wrap gap-1.5', compact && 'gap-1')}>
            {cmds.map(({ command, count }) => {
              const meta = COMMAND_META[command];
              return (
                <Button
                  key={command}
                  size="sm"
                  variant={meta.danger ? 'danger' : command === 'release_estop' ? 'outline' : 'subtle'}
                  onClick={() => run(command)}
                  title={single ? `${protocolMessage(single, command)} · via ${routeLabel(single, command)}` : undefined}
                >
                  {meta.label}
                  {count < assets.length && <span className="text-[10px] opacity-70">{count}/{assets.length}</span>}
                </Button>
              );
            })}
          </div>
          {g === 'motion' && cmds.some((c) => c.command === 'goto') && (
            <div className="flex gap-2 mt-2">
              <Select value={gotoSite} onChange={(e) => setGotoSite(e.target.value)} className="flex-1">
                <option value="">{pickedPoint ? `Map point ${pickedPoint[1].toFixed(4)}, ${pickedPoint[0].toFixed(4)}` : 'Go to… choose a location'}</option>
                {s.sites.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
              {onPickOnMap && (
                <Button size="md" variant="outline" icon={<Crosshair size={14} />} onClick={onPickOnMap}>
                  Pick
                </Button>
              )}
            </div>
          )}
          {g === 'assign' && (
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="mt-2">
              <option value="">Assign to… choose a location</option>
              {s.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
          {g === 'system' && cmds.some((c) => c.command === 'set_speed_limit') && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted">
              Speed limit
              <input type="range" min={2} max={70} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1" />
              <span className="tabular-nums w-14 text-right text-text">{speed} km/h</span>
            </div>
          )}
          {g === 'comms' && cmds.some((c) => c.command === 'message_driver') && <Input value={message} onChange={(e) => setMessage(e.target.value)} className="mt-2" />}
        </div>
      ))}

      {single && (
        <div className="text-[11px] text-dim border-t border-line pt-3">
          Route: <span className="text-muted">{routeLabel(single, 'pause')}</span>
        </div>
      )}
    </div>
  );
}
