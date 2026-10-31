import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import type { Asset } from '@shared/types';
import { useStore } from '@/store/useStore';
import { AssetIcon } from '@/lib/icons';
import { STATUS_COLOR } from '@/lib/colors';
import { Select } from '@/components/ui';

type Group = 'all' | 'drones' | 'vehicles' | 'robots' | 'market';
const GROUPS: { v: Group; label: string; test: (a: Asset) => boolean }[] = [
  { v: 'all', label: 'All', test: (a) => a.ownership !== 'external' },
  { v: 'drones', label: 'Drones', test: (a) => a.kind === 'drone' },
  { v: 'vehicles', label: 'Vehicles', test: (a) => ['van', 'truck', 'car', 'robotaxi'].includes(a.kind) && a.ownership !== 'external' },
  { v: 'robots', label: 'Robots', test: (a) => ['humanoid', 'amr', 'sidewalk_robot', 'robot_arm'].includes(a.kind) },
  { v: 'market', label: 'Marketplace', test: (a) => a.ownership === 'external' },
];

export function SelectionPanel({ className }: { className?: string }) {
  const assets = useStore((s) => s.assets);
  const sites = useStore((s) => s.sites);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const [site, setSite] = useState('');
  const [status, setStatus] = useState('');

  const list = useMemo(() => {
    const g = GROUPS.find((x) => x.v === group)!;
    const t = q.trim().toLowerCase();
    return assets
      .filter(g.test)
      .filter((a) => !site || a.siteId === site)
      .filter((a) => {
        if (!status) return true;
        if (status === 'active') return ['en_route', 'working', 'returning'].includes(a.status);
        if (status === 'idle') return ['idle', 'holding', 'charging'].includes(a.status);
        return ['paused', 'estop', 'offline', 'maintenance'].includes(a.status);
      })
      .filter((a) => !t || `${a.id} ${a.name} ${a.model} ${a.kind}`.toLowerCase().includes(t))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [assets, group, site, status, q]);

  const sel = new Set(selection);
  const allSelected = list.length > 0 && list.every((a) => sel.has(a.id));

  return (
    <div className={clsx('flex flex-col min-h-0 bg-panel', className)}>
      <div className="p-3 space-y-2.5 border-b border-line">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search machines" className="input pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <button
              type="button"
              key={g.v}
              onClick={() => setGroup(g.v)}
              className={clsx('px-2 py-1 rounded-md text-[11.5px] font-medium border', group === g.v ? 'bg-blue/15 border-blue/50 text-blue' : 'border-line text-muted hover:text-text')}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">All locations</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.replace(/^(FreshCo|Hive)\s+/, '')}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="idle">Idle / charging</option>
            <option value="attention">Needs attention</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-muted border-b border-line cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => setSelection(allSelected ? selection.filter((id) => !list.some((a) => a.id === id)) : [...selection, ...list.map((a) => a.id)])}
        />
        Select all {list.length}
        <span className="flex-1" />
        {selection.length > 0 && (
          <button type="button" className="text-blue hover:underline" onClick={() => setSelection([])}>
            Clear {selection.length}
          </button>
        )}
      </label>
      <div className="flex-1 overflow-auto">
        {list.map((a) => (
          <div
            key={a.id}
            onClick={(e) => toggleSelect(a.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            className={clsx('flex items-center gap-2.5 px-3.5 py-2 cursor-pointer border-b border-[#2a2f34]/60', sel.has(a.id) ? 'bg-blue/10' : 'hover:bg-panel-2')}
          >
            <input type="checkbox" checked={sel.has(a.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(a.id, true)} />
            <AssetIcon kind={a.kind} size={15} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">
                {a.id} <span className="text-muted font-normal">· {a.name}</span>
              </div>
              <div className="text-[11px] truncate" style={{ color: STATUS_COLOR[a.status] }}>
                {a.status === 'estop' ? 'E-STOP' : a.status.replace('_', ' ')}
                {a.currentJobId ? ` · ${a.currentJobId}` : a.currentTaskId ? ` · ${a.currentTaskId}` : ''}
              </div>
            </div>
            <div className="w-9 text-right text-[11px] tabular-nums" style={{ color: a.battery < 20 ? '#ec5b5b' : a.battery < 45 ? '#f0a33a' : '#9aa2ab' }}>
              {Math.round(a.battery)}%
            </div>
          </div>
        ))}
        {!list.length && <div className="p-6 text-center text-xs text-muted">No machines match</div>}
      </div>
    </div>
  );
}
