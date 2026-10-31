import type { Asset } from '@shared/types';
import { useStore } from '@/store/useStore';
import { AssetIcon } from '@/lib/icons';
import { KIND_LABEL, OWNERSHIP_LABEL } from '@/lib/colors';
import { Badge, Battery, StatusPill } from '@/components/ui';
import { adapterFor } from '@/integrations/devices/adapters';
import { droneFlyability } from '@shared/weather';

export function AssetDetail({ asset }: { asset: Asset }) {
  const s = useStore();
  const site = s.sites.find((x) => x.id === asset.siteId);
  const job = s.jobs.find((j) => j.id === asset.currentJobId);
  const task = s.tasks.find((t) => t.id === asset.currentTaskId);
  const driver = s.people.find((p) => p.id === asset.driverId);
  const ad = adapterFor(asset);
  const fly = asset.kind === 'drone' ? droneFlyability(s.weather(), asset.specs) : undefined;
  const rows: [string, React.ReactNode][] = [
    ['Location', site?.name ?? '—'],
    ['Position', `${asset.position[1].toFixed(5)}, ${asset.position[0].toFixed(5)}`],
    ['Speed', asset.speedKmh ? `${Math.round(asset.speedKmh)} km/h` : 'Stationary'],
    ...(asset.kind === 'drone' ? ([['Altitude', `${Math.round(asset.altitude)} m`]] as [string, React.ReactNode][]) : []),
    ['Heading', `${Math.round(asset.heading)}°`],
    ['Current job', job ? `${job.id} · ${job.pickup.name} → ${job.dropoff.name}` : '—'],
    ['Current task', task ? `${task.id} · ${task.title}` : '—'],
    ...(driver ? ([['Driver', `${driver.name} (${driver.status.replace('_', ' ')})`]] as [string, React.ReactNode][]) : []),
    ['Payload', `${asset.specs.payloadKg} kg`],
    ['Range', asset.specs.rangeKm ? `${asset.specs.rangeKm} km` : '—'],
    ...(asset.specs.maxWindMs ? ([['Wind limit', `${asset.specs.maxWindMs} m/s`]] as [string, React.ReactNode][]) : []),
    ['Connection', `${ad.name}${ad.connected ? '' : ' (simulated)'}`],
    ['Firmware', asset.firmware ?? '—'],
  ];
  if (asset.compliance?.operatorId) rows.push(['Operator ID', asset.compliance.operatorId]);
  if (asset.compliance?.classMark) rows.push(['Class mark / Remote ID', `${asset.compliance.classMark} · Remote ID ${asset.compliance.remoteId ?? '—'}`]);
  if (asset.compliance?.plate) rows.push(['Plate', `${asset.compliance.plate}${asset.compliance.ulezCompliant === false ? ' · not ULEZ compliant' : ''}`]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-panel-2 grid place-items-center">
          <AssetIcon kind={asset.kind} size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[17px] truncate">
            {asset.id} · {asset.name}
          </div>
          <div className="text-xs text-muted truncate">
            {KIND_LABEL[asset.kind]} · {asset.model}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <StatusPill status={asset.status} />
            <Badge color={asset.ownership === 'own' ? '#ff8a4c' : asset.ownership === 'network' ? '#8bd450' : '#5a9bf0'}>{OWNERSHIP_LABEL[asset.ownership]}</Badge>
            {fly && <Badge color={fly.status === 'go' ? '#8bd450' : fly.status === 'caution' ? '#f0a33a' : '#ec5b5b'}>{fly.status === 'go' ? 'Flyable' : fly.status === 'caution' ? 'Caution' : 'Grounded'}</Badge>}
          </div>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-muted mb-1">{asset.specs.energy === 'electric' ? 'Battery' : 'Fuel'}</div>
        <Battery value={asset.battery} />
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-text break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
