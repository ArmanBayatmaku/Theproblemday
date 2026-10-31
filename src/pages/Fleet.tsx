import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarPlus, Joystick, LoaderCircle, MapPinned, Plus, Search, Trash, UserPlus, Building } from 'lucide-react';
import type { Asset, AssetKind, Autonomy, Ownership, Person, PersonRole, Protocol, Site, SiteKind } from '@shared/types';
import { useStore } from '@/store/useStore';
import { MODEL_TEMPLATES } from '@/data/seed';
import { geocode } from '@/integrations/geocode';
import { ADAPTERS } from '@/integrations/devices/adapters';
import { AssetDetail } from '@/components/fleet/AssetDetail';
import { FleetMap } from '@/components/map/FleetMap';
import { Badge, Battery, Button, Card, Drawer, Empty, Field, Input, JobStatusPill, Modal, Segmented, Select, Stat, StatusPill, Tabs, Toggle } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import { AssetIcon, KIND_ICON, SiteIcon } from '@/lib/icons';
import { KIND_COLOR, KIND_LABEL, OWNERSHIP_LABEL, SITE_COLOR, SITE_LABEL, STATUS_COLOR } from '@/lib/colors';
import { formatWhen } from '@shared/schedule';
import { titleCase } from '@/lib/format';

type Tab = 'all' | 'drones' | 'vehicles' | 'robots' | 'market' | 'people' | 'locations';
const VEHICLES: AssetKind[] = ['robotaxi', 'car', 'van', 'truck', 'cargo_bike'];
const ROBOTS: AssetKind[] = ['humanoid', 'amr', 'sidewalk_robot', 'robot_arm'];
const TEST: Record<Exclude<Tab, 'people' | 'locations'>, (a: Asset) => boolean> = {
  all: (a) => a.ownership !== 'external',
  drones: (a) => a.kind === 'drone',
  vehicles: (a) => VEHICLES.includes(a.kind) && a.ownership !== 'external',
  robots: (a) => ROBOTS.includes(a.kind),
  market: (a) => a.ownership === 'external',
};
const PREFIX: Record<AssetKind, string> = { drone: 'DR', robotaxi: 'RT', car: 'CR', van: 'VN', truck: 'TR', cargo_bike: 'CB', humanoid: 'HU', amr: 'AMR', sidewalk_robot: 'SR', robot_arm: 'RA' };
const PROTOCOL_LABEL: Record<Protocol, string> = { sim: 'Simulator', mavlink: 'MAVLink', ros2: 'ROS 2', vda5050: 'VDA 5050', vendor_api: 'Vendor API', mqtt: 'MQTT' };

export function Fleet({ initialTab = 'all' }: { initialTab?: Tab }) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const s = useStore();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [openAsset, setOpenAsset] = useState<string>();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const openSiteId = params.get('site');
  const openSite = openSiteId ? s.sites.find((x) => x.id === openSiteId) : undefined;

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (openSiteId) setTab('locations');
  }, [openSiteId]);

  const machines = useMemo(() => {
    if (tab === 'people' || tab === 'locations') return [];
    const t = q.trim().toLowerCase();
    return s.assets
      .filter(TEST[tab])
      .filter((a) => !siteFilter || a.siteId === siteFilter)
      .filter((a) => !t || `${a.id} ${a.name} ${a.model} ${KIND_LABEL[a.kind]}`.toLowerCase().includes(t));
  }, [s.assets, tab, q, siteFilter]);

  const own = s.assets.filter((a) => a.ownership !== 'external');
  const selected = s.selection.filter((id) => machines.some((m) => m.id === id));
  const allChecked = machines.length > 0 && machines.every((m) => s.selection.includes(m.id));
  const asset = openAsset ? s.assets.find((a) => a.id === openAsset) : undefined;

  const assign = (ids: string[], siteId: string) => {
    const site = s.sites.find((x) => x.id === siteId);
    if (!site) return;
    ids.forEach((id) => s.updateAsset(id, { siteId }));
    s.log({ level: 'info', text: `${ids.length > 3 ? `${ids.length} machines` : ids.join(', ')} assigned to ${site.name}` });
    toast.success(`Assigned ${ids.length} machine${ids.length > 1 ? 's' : ''}`, site.name);
  };

  return (
    <div className="p-5 space-y-4">
      <Card bodyClass="px-5 py-4">
        <div className="grid grid-cols-6 gap-6">
          <Stat label="Machines" value={own.length} sub={`${own.filter((a) => ['en_route', 'working', 'returning'].includes(a.status)).length} working now`} onClick={() => setTab('all')} />
          <Stat label="Drones" value={own.filter((a) => a.kind === 'drone').length} color={KIND_COLOR.drone} onClick={() => setTab('drones')} />
          <Stat label="Vehicles" value={own.filter((a) => VEHICLES.includes(a.kind)).length} color={KIND_COLOR.van} onClick={() => setTab('vehicles')} />
          <Stat label="Robots" value={own.filter((a) => ROBOTS.includes(a.kind)).length} color={KIND_COLOR.humanoid} onClick={() => setTab('robots')} />
          <Stat label="People" value={s.people.length} sub={`${s.people.filter((p) => p.status !== 'off_shift').length} on shift`} onClick={() => setTab('people')} />
          <Stat label="Locations" value={s.sites.length} sub={`${s.sites.filter((x) => x.kind === 'warehouse').length} warehouses · ${s.sites.filter((x) => x.kind === 'store').length} stores`} onClick={() => setTab('locations')} />
        </div>
      </Card>

      <Card bodyClass="pb-3">
        <div className="px-5 pt-3">
          <Tabs
            value={tab}
            onChange={(t) => {
              setTab(t);
              if (openSiteId) setParams({}, { replace: true });
            }}
            tabs={[
              { value: 'all', label: 'All machines', count: own.length },
              { value: 'drones', label: 'Drones', count: s.assets.filter(TEST.drones).length },
              { value: 'vehicles', label: 'Vehicles', count: s.assets.filter(TEST.vehicles).length },
              { value: 'robots', label: 'Robots', count: s.assets.filter(TEST.robots).length },
              { value: 'market', label: 'Marketplace', count: s.assets.filter(TEST.market).length },
              { value: 'people', label: 'People', count: s.people.length },
              { value: 'locations', label: 'Locations', count: s.sites.length },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 px-5 pt-3">
            {tab !== 'people' && tab !== 'locations' && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search machines" className="pl-8 w-48" />
                </div>
                <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="w-56">
                  <option value="">All locations</option>
                  {s.sites.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            <div className="flex-1" />
            {tab === 'people' ? (
              <Button variant="primary" icon={<UserPlus size={15} />} onClick={() => setPersonOpen(true)}>
                Add person
              </Button>
            ) : tab === 'locations' ? (
              <Button variant="primary" icon={<Building size={15} />} onClick={() => setSiteOpen(true)}>
                Add location
              </Button>
            ) : (
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRegisterOpen(true)}>
                Register machine
              </Button>
            )}
        </div>

        {tab !== 'people' && tab !== 'locations' && selected.length > 0 && (
          <div className="mx-5 mt-3 flex items-center gap-2 flex-wrap rounded-lg bg-blue/10 border border-blue/40 px-3 py-2 fade-in">
            <span className="text-[13px] font-semibold text-blue mr-1">{selected.length} selected</span>
            <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="h-8 text-xs">
              <option value="">Assign to location…</option>
              {s.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="primary" disabled={!assignTo} onClick={() => assign(selected, assignTo)}>
              Assign
            </Button>
            <Button size="sm" icon={<Joystick size={13} />} onClick={() => nav('/control')}>
              Control
            </Button>
            <Button size="sm" icon={<MapPinned size={13} />} onClick={() => nav('/map')}>
              Show on map
            </Button>
            <Button size="sm" icon={<CalendarPlus size={13} />} onClick={() => nav(`/tasks?assets=${selected.join(',')}`)}>
              Give a task
            </Button>
            <div className="flex-1" />
            {tab !== 'market' && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash size={13} />}
                onClick={() => {
                  if (window.confirm(`Remove ${selected.length} machine(s) from the registry?`)) s.removeAssets(selected);
                }}
              >
                Remove
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => s.setSelection([])}>
              Clear
            </Button>
          </div>
        )}

        {tab === 'people' ? (
          <PeopleTable />
        ) : tab === 'locations' ? (
          <LocationsGrid onOpen={(id) => setParams({ site: id }, { replace: true })} />
        ) : machines.length === 0 ? (
          <Empty title="No machines match">Register one, or clear the filters.</Empty>
        ) : (
          <table className="w-full text-[13px] mt-2">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
                <th className="pl-5 pr-2 py-2.5 w-12">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => s.setSelection(allChecked ? s.selection.filter((id) => !machines.some((m) => m.id === id)) : [...s.selection, ...machines.map((m) => m.id)])}
                    className="accent-[#5a9bf0]"
                  />
                </th>
                <th className="font-semibold py-2.5">Machine</th>
                <th className="font-semibold py-2.5">Type</th>
                <th className="font-semibold py-2.5">Location</th>
                <th className="font-semibold py-2.5">Status</th>
                <th className="font-semibold py-2.5">Doing</th>
                <th className="font-semibold py-2.5">Battery</th>
                <th className="font-semibold py-2.5 pr-5">Connection</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((a) => {
                const site = s.sites.find((x) => x.id === a.siteId);
                const task = a.currentTaskId ? s.tasks.find((t) => t.id === a.currentTaskId) : undefined;
                const ad = ADAPTERS.find((x) => x.protocol === a.protocol);
                return (
                  <tr key={a.id} onClick={() => setOpenAsset(a.id)} className={clsx('border-t border-line cursor-pointer hover:bg-panel-2/60', s.selection.includes(a.id) && 'bg-blue/[0.05]')}>
                    <td className="pl-5 pr-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={s.selection.includes(a.id)} onChange={() => s.toggleSelect(a.id, true)} className="accent-[#5a9bf0]" />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${KIND_COLOR[a.kind]}1c` }}>
                          <AssetIcon kind={a.kind} size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold">{a.id}</div>
                          <div className="text-[11px] text-muted truncate max-w-[180px]">{a.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <div>{KIND_LABEL[a.kind]}</div>
                      <div className="text-[11px] text-dim truncate max-w-[190px]">{a.model}</div>
                    </td>
                    <td className="py-2">
                      {site ? (
                        <span className="inline-flex items-center gap-1.5">
                          <SiteIcon kind={site.kind} size={13} />
                          <span className="truncate max-w-[170px]">{site.name}</span>
                        </span>
                      ) : (
                        <span className="text-dim">{a.ownership === 'external' ? OWNERSHIP_LABEL.external : 'Unassigned'}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="py-2 text-muted text-xs">
                      <div className="truncate max-w-[200px]">{a.currentJobId ? `Job ${a.currentJobId}` : task ? task.title : a.status === 'charging' ? 'Charging' : '—'}</div>
                    </td>
                    <td className="py-2 pr-6 w-[140px]">
                      <Battery value={a.battery} />
                    </td>
                    <td className="py-2 pr-5 text-xs">
                      <span className={clsx(ad?.connected ? 'text-green' : 'text-muted')}>{PROTOCOL_LABEL[a.protocol]}</span>
                      {!ad?.connected && a.protocol !== 'sim' && <span className="text-dim"> · simulated</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Drawer open={!!asset} onClose={() => setOpenAsset(undefined)} title={asset ? `${asset.id} · ${asset.name}` : ''} width={440}>
        {asset && <MachineDrawer asset={asset} onAssign={(siteId) => assign([asset.id], siteId)} onClose={() => setOpenAsset(undefined)} />}
      </Drawer>
      <Drawer open={!!openSite} onClose={() => setParams({}, { replace: true })} title={openSite?.name ?? ''} width={560}>
        {openSite && <SiteDrawer site={openSite} onAssign={(ids) => assign(ids, openSite.id)} />}
      </Drawer>
      <RegisterMachineModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
      <AddLocationModal open={siteOpen} onClose={() => setSiteOpen(false)} />
      <AddPersonModal open={personOpen} onClose={() => setPersonOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- machine drawer
function MachineDrawer({ asset, onAssign, onClose }: { asset: Asset; onAssign: (siteId: string) => void; onClose: () => void }) {
  const nav = useNavigate();
  const s = useStore();
  const [siteId, setSiteId] = useState(asset.siteId ?? '');
  const [driver, setDriver] = useState(asset.driverId ?? '');
  const drivers = s.people.filter((p) => p.role === 'driver' || p.role === 'pilot' || p.role === 'operator');
  const tasks = s.tasks.filter((t) => t.assetIds.includes(asset.id) && !['done', 'cancelled'].includes(t.status));
  return (
    <div className="space-y-5">
      <AssetDetail asset={asset} />
      {asset.ownership !== 'external' && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="label-caps text-[12px] text-muted">Assignment</div>
          <div className="flex gap-2">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="flex-1">
              <option value="">Unassigned</option>
              {s.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Button variant="primary" disabled={siteId === (asset.siteId ?? '')} onClick={() => onAssign(siteId)}>
              Assign
            </Button>
          </div>
          {asset.autonomy !== 'autonomous' && (
            <div className="flex gap-2">
              <Select value={driver} onChange={(e) => setDriver(e.target.value)} className="flex-1">
                <option value="">{asset.kind === 'drone' ? 'No remote pilot' : 'No driver'}</option>
                {drivers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </Select>
              <Button
                disabled={driver === (asset.driverId ?? '')}
                onClick={() => {
                  s.updateAsset(asset.id, { driverId: driver || undefined });
                  if (driver) s.updatePerson(driver, { assignedAssetId: asset.id });
                  toast.success('Crew updated');
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="border-t border-line pt-4">
          <div className="label-caps text-[12px] text-muted mb-2">Tasks</div>
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs py-1">
              <span>
                {t.id} · {t.title}
              </span>
              <Badge>{t.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          icon={<MapPinned size={14} />}
          onClick={() => {
            s.setSelection([asset.id]);
            nav('/map');
          }}
        >
          Show on map
        </Button>
        <Button
          icon={<Joystick size={14} />}
          onClick={() => {
            s.setSelection([asset.id]);
            nav('/control');
          }}
        >
          Control
        </Button>
        {asset.ownership !== 'external' && (
          <Button icon={<CalendarPlus size={14} />} onClick={() => nav(`/tasks?assets=${asset.id}`)}>
            Give a task
          </Button>
        )}
        {asset.ownership !== 'external' && (
          <Button
            variant="ghost"
            icon={<Trash size={14} />}
            onClick={() => {
              if (window.confirm(`Remove ${asset.id} from the registry?`)) {
                s.removeAssets([asset.id]);
                onClose();
              }
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- people
function PeopleTable() {
  const s = useStore();
  const ROLE_COLOR: Record<PersonRole, string> = { driver: '#ff8a4c', pilot: '#8bd450', operator: '#5a9bf0', picker: '#3fc1b0', technician: '#f0a33a', supervisor: '#b48ae8' };
  return (
    <table className="w-full text-[13px] mt-2">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
          <th className="font-semibold px-5 py-2.5">Person</th>
          <th className="font-semibold py-2.5">Role</th>
          <th className="font-semibold py-2.5">Location</th>
          <th className="font-semibold py-2.5">Shift</th>
          <th className="font-semibold py-2.5">Status</th>
          <th className="font-semibold py-2.5">Licences</th>
          <th className="font-semibold py-2.5 pr-5">Assigned machine</th>
        </tr>
      </thead>
      <tbody>
        {s.people.map((p) => {
          const site = s.sites.find((x) => x.id === p.siteId);
          return (
            <tr key={p.id} className="border-t border-line">
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold" style={{ background: `${ROLE_COLOR[p.role]}22`, color: ROLE_COLOR[p.role] }}>
                    {p.name.split(' ').map((x) => x[0]).join('')}
                  </span>
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11px] text-dim">{p.id}</div>
                  </div>
                </div>
              </td>
              <td className="py-2.5">
                <Badge color={ROLE_COLOR[p.role]}>{titleCase(p.role)}</Badge>
              </td>
              <td className="py-2.5 text-muted">{site?.name ?? '—'}</td>
              <td className="py-2.5 text-muted tabular-nums">{p.shift ? `${p.shift.start}–${p.shift.end}` : '—'}</td>
              <td className="py-2.5">
                <Select value={p.status} onChange={(e) => s.updatePerson(p.id, { status: e.target.value as Person['status'] })} className="h-8 text-xs">
                  <option value="on_shift">On shift</option>
                  <option value="driving">Driving</option>
                  <option value="on_break">On break</option>
                  <option value="off_shift">Off shift</option>
                </Select>
              </td>
              <td className="py-2.5 text-xs text-muted">{p.licences.join(', ') || '—'}</td>
              <td className="py-2.5 pr-5">
                <Select
                  value={p.assignedAssetId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || undefined;
                    s.updatePerson(p.id, { assignedAssetId: id });
                    if (id) s.updateAsset(id, { driverId: p.id });
                  }}
                  className="h-8 text-xs w-full max-w-[220px]"
                >
                  <option value="">—</option>
                  {s.assets
                    .filter((a) => a.ownership === 'own' && a.autonomy !== 'autonomous')
                    .concat(s.assets.filter((a) => a.ownership === 'network' && a.kind === 'drone' && p.role === 'pilot'))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} · {a.name}
                      </option>
                    ))}
                </Select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- locations
function LocationsGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const s = useStore();
  return (
    <div className="grid grid-cols-3 gap-3 px-5 pt-4">
      {s.sites.map((site) => {
        const here = s.assets.filter((a) => a.siteId === site.id && a.ownership !== 'external');
        const byKind = new Map<AssetKind, number>();
        here.forEach((a) => byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1));
        const busy = here.filter((a) => ['en_route', 'working', 'returning'].includes(a.status)).length;
        const tasks = s.tasks.filter((t) => t.siteId === site.id && ['planned', 'queued', 'running'].includes(t.status));
        const color = SITE_COLOR[site.kind];
        return (
          <button type="button" key={site.id} onClick={() => onOpen(site.id)} className="text-left rounded-xl border border-line hover:border-[#4a525b] bg-panel-2/40 p-4 transition-colors">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}1f`, color }}>
                <SiteIcon kind={site.kind} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{site.name}</div>
                <div className="text-[11px] text-muted truncate">
                  {SITE_LABEL[site.kind]} · {site.address}
                </div>
              </div>
              {site.owner === 'network' && <Badge color="#8bd450">Hive</Badge>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 min-h-[24px]">
              {[...byKind.entries()].map(([k, n]) => {
                const Icon = KIND_ICON[k];
                return (
                  <span key={k} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md" style={{ background: `${KIND_COLOR[k]}18`, color: KIND_COLOR[k] }}>
                    <Icon size={12} /> {n}
                  </span>
                );
              })}
              {here.length === 0 && <span className="text-[11px] text-dim">No machines assigned</span>}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted mt-3 pt-3 border-t border-line">
              <span>{here.length} machines · {busy} busy</span>
              <span>{tasks.length} open tasks</span>
              <span>{site.openHours ?? (site.capacity ? `${site.capacity} bays` : '')}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function zoneOf(a: Asset, taskZone: (id?: string) => string | undefined, zones: string[]): string {
  const z = taskZone(a.currentTaskId);
  if (z && zones.includes(z)) return z;
  if (a.currentTaskId) return 'Working';
  if (a.status === 'charging') return zones.includes('Charging') ? 'Charging' : 'Idle';
  if (['en_route', 'returning'].includes(a.status) || a.currentJobId) return 'Away';
  return 'Idle';
}

function SiteDrawer({ site, onAssign }: { site: Site; onAssign: (ids: string[]) => void }) {
  const nav = useNavigate();
  const s = useStore();
  const now = s.sim.now;
  const [adding, setAdding] = useState<string[]>([]);
  const here = s.assets.filter((a) => a.siteId === site.id);
  const tasks = s.tasks.filter((t) => t.siteId === site.id && t.status !== 'cancelled').sort((a, b) => (a.windowStart ?? 0) - (b.windowStart ?? 0));
  const jobs = s.jobs.filter((j) => (j.pickup.siteId === site.id || j.dropoff.siteId === site.id) && ['scheduled', 'recurring', 'assigned', 'to_pickup', 'loading', 'in_transit'].includes(j.status)).slice(0, 8);
  const zones = site.zones?.length ? site.zones : ['Floor', 'Dispatch', 'Charging'];
  const taskZone = (id?: string) => s.tasks.find((t) => t.id === id)?.zone;
  const byZone = new Map<string, Asset[]>();
  for (const a of here) {
    const z = zoneOf(a, taskZone, zones);
    byZone.set(z, [...(byZone.get(z) ?? []), a]);
  }
  const candidates = s.assets.filter((a) => a.ownership !== 'external' && a.siteId !== site.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={SITE_COLOR[site.kind]}>{SITE_LABEL[site.kind]}</Badge>
        <span className="text-xs text-muted">{site.address}</span>
        {site.openHours && <span className="text-xs text-dim">· {site.openHours}</span>}
      </div>
      <div className="relative h-[180px] rounded-xl overflow-hidden border border-line">
        <FleetMap variant="mini" className="absolute inset-0" fitTo={[site.position, ...here.filter((a) => a.ownership !== 'external').map((a) => a.position)]} focusPoints={[{ position: site.position, label: site.name, color: [90, 155, 240] }]} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="label-caps text-[12px] text-muted">{site.kind === 'warehouse' ? 'Floor view' : 'Machines here'}</div>
          <span className="text-[11px] text-dim">{here.length} assigned</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...zones, 'Working', 'Idle', 'Away'].map((z) => {
            const list = byZone.get(z) ?? [];
            const extra = ['Working', 'Idle', 'Away'].includes(z);
            if (extra && !list.length) return null;
            return (
              <div key={z} className={clsx('rounded-lg border p-2 min-h-[74px]', extra ? 'border-dashed border-line' : 'border-line bg-panel-2/50')}>
                <div className="text-[10px] uppercase tracking-wide text-dim font-semibold mb-1.5">{z === 'Away' ? 'Out on the road' : z === 'Idle' ? 'Idle / docked' : z}</div>
                <div className="flex flex-wrap gap-1">
                  {list.map((a) => {
                    const task = s.tasks.find((t) => t.id === a.currentTaskId);
                    return (
                      <span
                        key={a.id}
                        title={`${a.id} · ${a.name} — ${task ? task.title : a.status}`}
                        className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border"
                        style={{ borderColor: `${STATUS_COLOR[a.status]}66`, color: STATUS_COLOR[a.status] }}
                      >
                        <AssetIcon kind={a.kind} size={11} tinted={false} /> {a.id}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line divide-y divide-line">
        {here.length === 0 && <div className="text-xs text-dim px-3 py-3">Nothing assigned yet.</div>}
        {here.map((a) => {
          const task = s.tasks.find((t) => t.id === a.currentTaskId);
          return (
            <div key={a.id} className="flex items-center gap-2.5 px-3 py-2">
              <AssetIcon kind={a.kind} size={15} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate">
                  {a.id} · {a.name}
                </div>
                <div className="text-[11px] text-dim truncate">{a.currentJobId ? `On job ${a.currentJobId}` : task ? `Task: ${task.title}` : KIND_LABEL[a.kind]}</div>
              </div>
              <StatusPill status={a.status} />
            </div>
          );
        })}
      </div>

      <div>
        <div className="label-caps text-[12px] text-muted mb-2">Assign machines here</div>
        <div className="flex gap-2">
          <select
            multiple
            value={adding}
            onChange={(e) => setAdding([...e.target.selectedOptions].map((o) => o.value))}
            className="input flex-1 h-28 py-1"
          >
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} · {KIND_LABEL[a.kind]} · {s.sites.find((x) => x.id === a.siteId)?.name ?? 'unassigned'}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={!adding.length}
            onClick={() => {
              onAssign(adding);
              setAdding([]);
            }}
          >
            Assign
          </Button>
        </div>
        <div className="text-[11px] text-dim mt-1">Ctrl/⌘-click to pick several.</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="label-caps text-[12px] text-muted">Tasks at this location</div>
          <Button size="sm" icon={<CalendarPlus size={13} />} onClick={() => nav(`/tasks?site=${site.id}`)}>
            Plan task
          </Button>
        </div>
        {tasks.length === 0 ? (
          <div className="text-xs text-dim">No tasks planned.</div>
        ) : (
          <div className="space-y-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-panel-2">
                <span className="tabular-nums text-dim">{t.id}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-dim">{t.assetIds.join(', ')}</span>
                <Badge>{t.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div>
          <div className="label-caps text-[12px] text-muted mb-2">Deliveries in & out</div>
          <div className="space-y-1">
            {jobs.map((j) => (
              <button type="button" key={j.id} onClick={() => nav(`/jobs?job=${j.id}`)} className="w-full flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-panel-2 hover:bg-panel-3 text-left">
                <span className="tabular-nums">{j.id}</span>
                <span className="flex-1 truncate text-muted">
                  {j.pickup.siteId === site.id ? `→ ${j.dropoff.name}` : `← ${j.pickup.name}`}
                </span>
                <span className="text-dim">{j.status === 'recurring' ? 'series' : formatWhen(j.startAt, now)}</span>
                <JobStatusPill status={j.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- register machine
const KIND_ORDER: AssetKind[] = ['drone', 'van', 'truck', 'car', 'robotaxi', 'cargo_bike', 'humanoid', 'amr', 'sidewalk_robot', 'robot_arm'];
const DEFAULT_PROTOCOL: Record<AssetKind, Protocol> = { drone: 'mavlink', robotaxi: 'vendor_api', car: 'vendor_api', van: 'vendor_api', truck: 'vendor_api', cargo_bike: 'vendor_api', humanoid: 'ros2', amr: 'vda5050', sidewalk_robot: 'ros2', robot_arm: 'ros2' };
const DEFAULT_AUTONOMY: Record<AssetKind, Autonomy> = { drone: 'remote_piloted', robotaxi: 'autonomous', car: 'human_driven', van: 'human_driven', truck: 'human_driven', cargo_bike: 'human_driven', humanoid: 'autonomous', amr: 'autonomous', sidewalk_robot: 'autonomous', robot_arm: 'autonomous' };

function RegisterMachineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [kind, setKind] = useState<AssetKind>('drone');
  const templates = Object.entries(MODEL_TEMPLATES).filter(([, t]) => t.kind === kind && t.ownership !== 'external');
  const [template, setTemplate] = useState('');
  const nextId = (k: AssetKind) => {
    const p = PREFIX[k];
    const n = Math.max(0, ...s.assets.filter((a) => a.id.startsWith(`${p}-`)).map((a) => parseInt(a.id.split('-')[1], 10) || 0)) + 1;
    return `${p}-${String(n).padStart(2, '0')}`;
  };
  const blank = (k: AssetKind) => ({
    id: nextId(k),
    name: '',
    model: '',
    ownership: 'own' as Ownership,
    autonomy: DEFAULT_AUTONOMY[k],
    protocol: DEFAULT_PROTOCOL[k],
    endpoint: '',
    siteId: s.sites.find((x) => (k === 'drone' ? x.kind === 'drone_port' : ROBOTS.includes(k) ? x.kind === 'warehouse' : x.kind === 'depot'))?.id ?? '',
    payloadKg: k === 'drone' ? 3 : k === 'truck' ? 2500 : k === 'van' ? 900 : 20,
    rangeKm: k === 'drone' ? 20 : k === 'truck' ? 500 : 200,
    maxSpeedKmh: k === 'drone' ? 65 : ROBOTS.includes(k) ? 6 : 90,
    maxWindMs: 10,
    ipRating: k === 'drone' ? 'IP54' : '',
    energy: 'electric' as Asset['specs']['energy'],
    operatorId: '',
    flyerId: '',
    classMark: 'UK2',
    plate: '',
    ulez: true,
    firmware: '',
  });
  const [f, setF] = useState(() => blank('drone'));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (open) {
      setKind('drone');
      setTemplate('');
      setF(blank('drone'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickKind = (k: AssetKind) => {
    setKind(k);
    setTemplate('');
    setF(blank(k));
  };
  const applyTemplate = (name: string) => {
    setTemplate(name);
    const t = MODEL_TEMPLATES[name];
    if (!t) return;
    set({
      model: t.model,
      autonomy: t.autonomy,
      protocol: t.protocol,
      payloadKg: t.specs.payloadKg,
      rangeKm: t.specs.rangeKm,
      maxSpeedKmh: t.specs.maxSpeedKmh,
      maxWindMs: t.specs.maxWindMs ?? 10,
      ipRating: t.specs.ipRating ?? '',
      energy: t.specs.energy,
      classMark: t.compliance?.classMark ?? f.classMark,
      ulez: t.compliance?.ulezCompliant ?? true,
      firmware: t.firmware ?? '',
    });
  };

  const valid = f.id.trim() && f.name.trim() && f.model.trim() && !s.assets.some((a) => a.id === f.id.trim());
  const submit = () => {
    const t = template ? MODEL_TEMPLATES[template] : undefined;
    s.registerAsset({
      id: f.id.trim(),
      name: f.name.trim(),
      kind,
      model: f.model.trim(),
      ownership: f.ownership,
      autonomy: f.autonomy,
      protocol: f.protocol,
      endpoint: f.endpoint || undefined,
      siteId: f.siteId || undefined,
      firmware: f.firmware || undefined,
      tags: t?.tags,
      providerId: f.ownership === 'network' && kind === 'drone' ? 'hive-air' : undefined,
      specs: {
        ...(t?.specs ?? {}),
        payloadKg: +f.payloadKg,
        rangeKm: +f.rangeKm,
        maxSpeedKmh: +f.maxSpeedKmh,
        maxWindMs: kind === 'drone' ? +f.maxWindMs : undefined,
        ipRating: f.ipRating || undefined,
        energy: f.energy,
      },
      compliance:
        kind === 'drone'
          ? { operatorId: f.operatorId || undefined, flyerId: f.flyerId || undefined, classMark: f.classMark || undefined, remoteId: 'enabled', insured: true }
          : VEHICLES.includes(kind)
            ? { plate: f.plate || undefined, ulezCompliant: f.ulez, insured: true }
            : undefined,
    });
    toast.success(`${f.id} registered`, f.protocol === 'sim' ? 'running in the simulator' : `${PROTOCOL_LABEL[f.protocol]} adapter not connected — simulated until it is`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a machine"
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            Register {f.id}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-5 gap-2">
          {KIND_ORDER.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                type="button"
                key={k}
                onClick={() => pickKind(k)}
                className={clsx('rounded-xl border px-2 py-3 flex flex-col items-center gap-1.5 text-[12px]', kind === k ? 'border-blue bg-blue/10 text-text' : 'border-line text-muted hover:text-text hover:bg-panel-2')}
              >
                <Icon size={20} style={{ color: KIND_COLOR[k] }} />
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Start from a model">
            <Select value={template} onChange={(e) => applyTemplate(e.target.value)} className="w-full">
              <option value="">Custom</option>
              {templates.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Machine ID" hint={s.assets.some((a) => a.id === f.id.trim()) ? 'That ID is taken' : undefined}>
            <Input value={f.id} onChange={(e) => set({ id: e.target.value.toUpperCase() })} className="w-full" />
          </Field>
          <Field label="Name">
            <Input value={f.name} placeholder={kind === 'drone' ? 'e.g. Skylift Bravo' : 'e.g. Picker 7'} onChange={(e) => set({ name: e.target.value })} className="w-full" />
          </Field>
          <Field label="Make / model">
            <Input value={f.model} placeholder="e.g. DJI FlyCart 30" onChange={(e) => set({ model: e.target.value })} className="w-full" />
          </Field>
          <Field label="Home location">
            <Select value={f.siteId} onChange={(e) => set({ siteId: e.target.value })} className="w-full">
              <option value="">Unassigned</option>
              {s.sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owned by">
            <Segmented
              value={f.ownership}
              onChange={(ownership) => set({ ownership })}
              options={[
                { value: 'own', label: 'Us' },
                { value: 'network', label: 'Hive network' },
              ]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="Payload (kg)">
            <Input type="number" value={f.payloadKg} onChange={(e) => set({ payloadKg: +e.target.value })} className="w-full" />
          </Field>
          <Field label="Range (km)">
            <Input type="number" value={f.rangeKm} onChange={(e) => set({ rangeKm: +e.target.value })} className="w-full" />
          </Field>
          <Field label="Max speed (km/h)">
            <Input type="number" value={f.maxSpeedKmh} onChange={(e) => set({ maxSpeedKmh: +e.target.value })} className="w-full" />
          </Field>
          <Field label="Energy">
            <Select value={f.energy} onChange={(e) => set({ energy: e.target.value as typeof f.energy })} className="w-full">
              <option value="electric">Electric</option>
              <option value="diesel">Diesel</option>
              <option value="petrol">Petrol</option>
              <option value="hybrid">Hybrid</option>
            </Select>
          </Field>
          {kind === 'drone' && (
            <>
              <Field label="Wind limit (m/s)">
                <Input type="number" value={f.maxWindMs} onChange={(e) => set({ maxWindMs: +e.target.value })} className="w-full" />
              </Field>
              <Field label="IP rating">
                <Input value={f.ipRating} onChange={(e) => set({ ipRating: e.target.value })} className="w-full" />
              </Field>
              <Field label="UK class mark">
                <Select value={f.classMark} onChange={(e) => set({ classMark: e.target.value })} className="w-full">
                  {['UK0', 'UK1', 'UK2', 'UK3', 'UK5', 'UK6', 'Legacy / none'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Operator ID">
                <Input value={f.operatorId} placeholder="GBR-OP-…" onChange={(e) => set({ operatorId: e.target.value })} className="w-full" />
              </Field>
            </>
          )}
          {VEHICLES.includes(kind) && (
            <>
              <Field label="Number plate">
                <Input value={f.plate} placeholder="e.g. LN25 ABC" onChange={(e) => set({ plate: e.target.value.toUpperCase() })} className="w-full" />
              </Field>
              <div className="pt-5">
                <Toggle checked={f.ulez} onChange={(ulez) => set({ ulez })} label="ULEZ compliant" />
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-line p-4 space-y-3">
          <div className="label-caps text-[12px] text-muted">Connection</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Control">
              <Select value={f.autonomy} onChange={(e) => set({ autonomy: e.target.value as Autonomy })} className="w-full">
                <option value="autonomous">Autonomous</option>
                <option value="remote_piloted">Remote-piloted / supervised</option>
                <option value="human_driven">Human-driven (driver app)</option>
              </Select>
            </Field>
            <Field label="Protocol">
              <Select value={f.protocol} onChange={(e) => set({ protocol: e.target.value as Protocol })} className="w-full">
                {ADAPTERS.map((a) => (
                  <option key={a.protocol} value={a.protocol}>
                    {a.name}
                    {a.connected ? '' : ' (not connected)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Endpoint / device ID">
              <Input
                value={f.endpoint}
                placeholder={f.protocol === 'mavlink' ? 'udp://:14540 or sysid 12' : f.protocol === 'ros2' ? '/robot_7 namespace' : f.protocol === 'vda5050' ? 'manufacturer/serial' : 'optional'}
                onChange={(e) => set({ endpoint: e.target.value })}
                className="w-full"
              />
            </Field>
          </div>
          <div className="text-[11px] text-dim">{ADAPTERS.find((a) => a.protocol === f.protocol)?.docs} Until the adapter is connected the machine runs as a digital twin in the simulator.</div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- add location
function AddLocationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SiteKind>('warehouse');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('06:00–22:00');
  const [zones, setZones] = useState('Inbound, Storage, Pick, Pack, Dispatch, Charging');
  const [capacity, setCapacity] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true);
    setErr('');
    const place = await geocode(address || name, s.sites);
    setBusy(false);
    if (!place) {
      setErr('Could not find that address — try a full UK postcode.');
      return;
    }
    const base = `S-${name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'NEW'}`;
    let id = base;
    for (let i = 2; s.sites.some((x) => x.id === id); i++) id = `${base}${i}`;
    s.registerSite({
      id,
      name: name.trim(),
      kind,
      address: address.trim() || place.address || place.name,
      position: place.position,
      owner: 'own',
      capacity,
      openHours: hours || undefined,
      zones: kind === 'warehouse' ? zones.split(',').map((z) => z.trim()).filter(Boolean) : undefined,
    });
    toast.success(`${name} added`, 'assign machines to it from the Locations tab');
    setName('');
    setAddress('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a location"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={submit} icon={busy ? <LoaderCircle size={14} className="animate-spin" /> : undefined}>
            Add location
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FreshCo Croydon DC" className="w-full" />
          </Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as SiteKind)} className="w-full">
              {(['warehouse', 'store', 'depot', 'drone_port', 'charging_hub', 'customer'] as SiteKind[]).map((k) => (
                <option key={k} value={k}>
                  {SITE_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Address or postcode" hint={err || 'Postcodes are looked up with postcodes.io; known London areas work offline.'}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. CR0 4XS" className="w-full" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening hours">
            <Input value={hours} onChange={(e) => setHours(e.target.value)} className="w-full" />
          </Field>
          <Field label="Bays / capacity">
            <Input type="number" value={capacity} onChange={(e) => setCapacity(+e.target.value)} className="w-full" />
          </Field>
        </div>
        {kind === 'warehouse' && (
          <Field label="Floor zones" hint="Comma separated — robots are shown in these zones on the floor view.">
            <Input value={zones} onChange={(e) => setZones(e.target.value)} className="w-full" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- add person
function AddPersonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<PersonRole>('driver');
  const [siteId, setSiteId] = useState('S-PRDC');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [licences, setLicences] = useState('B');
  const submit = () => {
    const prefix = { driver: 'D', pilot: 'PL', operator: 'OP', picker: 'PK', technician: 'TE', supervisor: 'SU' }[role];
    const n = Math.max(0, ...s.people.filter((p) => p.id.startsWith(`${prefix}-`)).map((p) => parseInt(p.id.split('-')[1], 10) || 0)) + 1;
    s.registerPerson({ id: `${prefix}-${String(n).padStart(2, '0')}`, name: name.trim(), role, siteId, status: 'off_shift', licences: licences.split(',').map((x) => x.trim()).filter(Boolean), shift: { start, end } });
    toast.success(`${name} added`);
    setName('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a person"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>
            Add
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as PersonRole)} className="w-full">
            {(['driver', 'pilot', 'operator', 'picker', 'technician', 'supervisor'] as PersonRole[]).map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full">
            {s.sites.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Licences / certificates" hint={role === 'pilot' ? 'e.g. GVC, A2 CofC' : role === 'driver' ? 'e.g. B, C1, C' : undefined}>
          <Input value={licences} onChange={(e) => setLicences(e.target.value)} className="w-full" />
        </Field>
        <Field label="Shift start">
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full" />
        </Field>
        <Field label="Shift end">
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full" />
        </Field>
      </div>
    </Modal>
  );
}
