import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { LngLat } from '@shared/types';
import { useStore } from '@/store/useStore';
import { FleetMap } from '@/components/map/FleetMap';
import { SelectionPanel } from '@/components/fleet/SelectionPanel';
import { AssetDetail } from '@/components/fleet/AssetDetail';
import { CommandConsole } from '@/components/control/CommandConsole';
import { AssetIcon } from '@/lib/icons';
import { KIND_LABEL } from '@/lib/colors';

export function LiveMapPage() {
  const selection = useStore((s) => s.selection);
  const assets = useStore((s) => s.assets);
  const setSelection = useStore((s) => s.setSelection);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<LngLat | undefined>();
  const selected = useMemo(() => assets.filter((a) => selection.includes(a.id)), [assets, selection]);
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    selected.forEach((a) => m.set(a.kind, (m.get(a.kind) ?? 0) + 1));
    return [...m.entries()];
  }, [selected]);

  return (
    <div className="h-full flex">
      <SelectionPanel className="w-[300px] border-r border-line" />
      <div className="flex-1 relative min-w-0">
        <FleetMap
          variant="full"
          className="absolute inset-0"
          pickMode={picking}
          onPick={(p) => {
            setPicked(p);
            setPicking(false);
          }}
          focusPoints={picked ? [{ position: picked, label: 'Target', color: [240, 163, 58] }] : undefined}
        />
      </div>
      {selected.length > 0 && (
        <aside className="w-[360px] border-l border-line bg-panel flex flex-col min-h-0 fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="label-caps text-[13px]">{selected.length === 1 ? 'Machine' : `${selected.length} machines selected`}</span>
            <button type="button" onClick={() => setSelection([])} className="text-muted hover:text-text">
              <X size={17} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-5">
            {selected.length === 1 ? (
              <AssetDetail asset={selected[0]} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {byKind.map(([k, n]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-panel-2 text-xs">
                    <AssetIcon kind={k as any} size={13} /> {n} × {KIND_LABEL[k as keyof typeof KIND_LABEL]}
                  </span>
                ))}
              </div>
            )}
            <div className="border-t border-line pt-4">
              <div className="label-caps text-[12px] text-muted mb-3">Commands</div>
              <CommandConsole assets={selected} compact onPickOnMap={() => setPicking(true)} pickedPoint={picked} />
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
