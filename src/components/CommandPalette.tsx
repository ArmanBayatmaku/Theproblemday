import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CornerDownLeft, Search, Zap } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { interpret } from '@shared/parser';
import { AssetIcon, SiteIcon } from '@/lib/icons';
import { COMMAND_META } from '@/integrations/devices/capabilities';
import { toast } from '@/components/ui/toast';
import { Kbd } from '@/components/ui';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const s = useStore();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      nav(to);
      onClose();
    };
    const list: Item[] = [
      { id: 'p-overview', group: 'Go to', label: 'Overview', run: go('/') },
      { id: 'p-map', group: 'Go to', label: 'Live map', run: go('/map') },
      { id: 'p-request', group: 'Go to', label: 'Request a job (AI assistant)', keywords: 'book delivery quote', run: go('/request') },
      { id: 'p-jobs', group: 'Go to', label: 'Jobs', run: go('/jobs') },
      { id: 'p-fleet', group: 'Go to', label: 'Fleet registry', keywords: 'register drones robots vehicles', run: go('/fleet') },
      { id: 'p-loc', group: 'Go to', label: 'Locations', keywords: 'warehouse store sites', run: go('/locations') },
      { id: 'p-tasks', group: 'Go to', label: 'Machine tasks', run: go('/tasks') },
      { id: 'p-control', group: 'Go to', label: 'Control panel', run: go('/control') },
      { id: 'p-int', group: 'Go to', label: 'Integrations', keywords: 'waymo uber api', run: go('/integrations') },
      { id: 'p-settings', group: 'Go to', label: 'Settings', run: go('/settings') },
      { id: 'a-3d', group: 'Actions', label: s.map.is3d ? 'Switch map to 2D' : 'Switch map to 3D skyline', run: () => { s.setMap({ is3d: !s.map.is3d }); nav('/map'); onClose(); } },
      { id: 'a-storm', group: 'Actions', label: 'Weather override: storm (ground drones)', keywords: 'wind demo', run: () => { s.setWeatherMode('storm'); onClose(); } },
      { id: 'a-live', group: 'Actions', label: 'Weather: back to live feed', run: () => { s.setWeatherMode('live'); onClose(); } },
      { id: 'a-pause', group: 'Actions', label: s.sim.running ? 'Pause simulation' : 'Resume simulation', run: () => { s.setSim({ running: !s.sim.running }); onClose(); } },
      { id: 'a-drones', group: 'Actions', label: 'Select all drones', run: () => { s.setSelection(s.assets.filter((a) => a.kind === 'drone').map((a) => a.id)); nav('/control'); onClose(); } },
      { id: 'a-estop', group: 'Actions', label: 'E-STOP all autonomous machines', keywords: 'emergency', run: () => { const r = s.estopAll(); toast.danger(`E-STOP sent to ${r.targetIds.length} machines`); onClose(); } },
    ];
    for (const a of s.assets.filter((x) => x.ownership !== 'external')) {
      list.push({
        id: `as-${a.id}`,
        group: 'Machines',
        label: `${a.id} · ${a.name}`,
        hint: a.model,
        icon: <AssetIcon kind={a.kind} size={14} />,
        keywords: `${a.kind} ${a.model}`,
        run: () => {
          s.setSelection([a.id]);
          nav('/control');
          onClose();
        },
      });
    }
    for (const site of s.sites) {
      list.push({ id: `si-${site.id}`, group: 'Locations', label: site.name, hint: site.address, icon: <SiteIcon kind={site.kind} size={14} />, run: go(`/locations?site=${site.id}`) });
    }
    for (const j of s.jobs.filter((x) => x.status !== 'delivered').slice(-30)) {
      list.push({ id: `jo-${j.id}`, group: 'Jobs', label: `${j.id} · ${j.pickup.name} → ${j.dropoff.name}`, hint: j.option.providerName, run: go(`/jobs?job=${j.id}`) });
    }
    return list;
  }, [s.assets.length, s.sites, s.jobs.length, s.map.is3d, s.sim.running, open]);

  const commandItem = useMemo<Item | undefined>(() => {
    if (q.trim().length < 4) return undefined;
    const intent = interpret(q, { now: s.sim.now, sites: s.sites, assets: s.assets, draft: s.draft });
    if (intent.type === 'command') {
      return {
        id: 'nl-cmd',
        group: 'Run command',
        label: `${COMMAND_META[intent.command].label} → ${intent.targetLabel} (${intent.targetIds.length})`,
        icon: <Zap size={14} className="text-amber" />,
        run: () => {
          const rec = s.runCommand(intent.command, intent.targetIds);
          (rec.result === 'rejected' ? toast.warning : toast.success)(rec.message || 'Done');
          onClose();
        },
      };
    }
    if (intent.type === 'job') {
      return {
        id: 'nl-job',
        group: 'Ask the assistant',
        label: `Plan job: “${q}”`,
        icon: <Zap size={14} className="text-green" />,
        run: () => {
          nav(`/request?q=${encodeURIComponent(q)}`);
          onClose();
        },
      };
    }
    return undefined;
  }, [q]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? items.filter((i) => `${i.label} ${i.hint ?? ''} ${i.keywords ?? ''} ${i.group}`.toLowerCase().includes(t)) : items.filter((i) => i.group !== 'Machines' && i.group !== 'Jobs');
    return [...(commandItem ? [commandItem] : []), ...base].slice(0, 40);
  }, [q, items, commandItem]);

  if (!open) return null;
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px] flex justify-center pt-[12vh]" onMouseDown={onClose}>
      <div className="card w-[640px] max-h-[62vh] flex flex-col shadow-2xl fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') setIdx(Math.min(idx + 1, filtered.length - 1));
              if (e.key === 'ArrowUp') setIdx(Math.max(idx - 1, 0));
              if (e.key === 'Enter') filtered[idx]?.run();
            }}
            placeholder="Search machines, jobs, places — or type a command like “return all drones at Nine Elms”"
            className="flex-1 h-12 bg-transparent outline-none text-[14px]"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="overflow-auto py-2">
          {filtered.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : '';
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="px-4 pt-2 pb-1 text-[10.5px] uppercase tracking-wider text-dim font-semibold">{header}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setIdx(i)}
                  onClick={it.run}
                  className={clsx('w-full flex items-center gap-3 px-4 py-2 text-left text-[13px]', i === idx ? 'bg-panel-2' : '')}
                >
                  <span className="w-4 grid place-items-center">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="text-[11px] text-dim truncate max-w-[200px]">{it.hint}</span>}
                  {i === idx && <CornerDownLeft size={13} className="text-dim" />}
                </button>
              </div>
            );
          })}
          {!filtered.length && <div className="px-4 py-6 text-center text-muted text-[13px]">No matches</div>}
        </div>
      </div>
    </div>
  );
}
