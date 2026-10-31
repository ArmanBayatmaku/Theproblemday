import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, SegmentBar, SparkBars, Stat, Badge } from '@/components/ui';
import { FleetMap } from '@/components/map/FleetMap';
import { droneFlyability } from '@shared/weather';
import { ago, clock, money } from '@/lib/format';
import { providerById } from '@shared/providers';

export function Overview() {
  const nav = useNavigate();
  const s = useStore();
  const now = s.sim.now;
  const weather = s.weather();

  const stats = useMemo(() => {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const active = s.jobs.filter((j) => ['to_pickup', 'loading', 'in_transit'].includes(j.status));
    const delivered = s.jobs.filter((j) => j.status === 'delivered' && (j.completedAt ?? 0) >= dayStart.getTime());
    const lastHour = delivered.filter((j) => (j.completedAt ?? 0) > now - 3600_000).length;
    const onTime = delivered.filter((j) => !j.etaAt || (j.completedAt ?? 0) <= j.etaAt + 2 * 60_000).length;
    const pickup = [...active, ...delivered.slice(-20)].map((j) => j.option.pickupEtaMin);
    const avgPickup = pickup.length ? pickup.reduce((a, b) => a + b, 0) / pickup.length : 0;
    const buckets = Array.from({ length: 14 }, (_, i) => {
      const end = now - (13 - i) * 3600_000;
      return delivered.filter((j) => (j.completedAt ?? 0) <= end && (j.completedAt ?? 0) > end - 3600_000).length;
    });
    const smooth = buckets.map((_, i) => {
      const w = buckets.slice(Math.max(0, i - 1), i + 2);
      return w.reduce((a, b) => a + b, 0) / w.length;
    });
    const spend = delivered.reduce((a, j) => a + j.option.price, 0);
    const mix = new Map<string, { n: number; spend: number; color: string }>();
    for (const j of [...delivered, ...active]) {
      const key = j.option.category === 'own_fleet' ? 'Own fleet' : j.option.providerName;
      const color = j.option.category === 'own_fleet' ? '#ff8a4c' : providerById(j.option.providerId)?.color ?? '#9aa2ab';
      const m = mix.get(key) ?? { n: 0, spend: 0, color };
      m.n++;
      m.spend += j.option.price;
      mix.set(key, m);
    }
    return { active, delivered, lastHour, onTimePct: delivered.length ? (onTime / delivered.length) * 100 : 100, avgPickup, buckets, smooth, spend, mix };
  }, [s.jobs, now]);

  const fleet = s.assets.filter((a) => a.ownership !== 'external');
  const seg = {
    active: fleet.filter((a) => ['en_route', 'working', 'returning'].includes(a.status)).length,
    idle: fleet.filter((a) => ['idle', 'holding'].includes(a.status)).length,
    charging: fleet.filter((a) => a.status === 'charging').length,
    attention: fleet.filter((a) => ['paused', 'estop', 'offline', 'maintenance'].includes(a.status)).length,
  };
  const fly = droneFlyability(weather, { maxWindMs: 12, ipRating: 'IP55' });
  const flyCol = fly.status === 'go' ? '#8bd450' : fly.status === 'caution' ? '#f0a33a' : '#ec5b5b';
  const evCol = { info: '#5a9bf0', success: '#8bd450', warning: '#f0a33a', danger: '#ec5b5b' };

  return (
    <div className="p-6 space-y-5 max-w-[1500px]">
      <div className="card px-6 py-5">
        <div className="grid grid-cols-5 gap-8">
          <Stat label="Active jobs" value={stats.active.length} color="#8bd450" sub={`${s.jobs.filter((j) => j.status === 'scheduled').length} scheduled`} onClick={() => nav('/jobs')} />
          <Stat label="Deliveries today" value={stats.delivered.length} color="#a873e8" sub={`${money(stats.spend)} spend`} onClick={() => nav('/jobs')} />
          <Stat label="Deliveries / hour" value={stats.lastHour} color="#b48ae8" sub="last 60 min" />
          <Stat label="Avg pickup ETA" value={`${stats.avgPickup.toFixed(1)}m`} color="#f2f4f6" sub="across all methods" />
          <Stat label="On-time" value={`${Math.round(stats.onTimePct)}%`} color="#5a9bf0" sub="vs quoted ETA" />
        </div>
      </div>

      <Card
        title={
          <span className="flex items-center gap-1.5">
            Live operations <ChevronDown size={15} />
          </span>
        }
        sub="Bubbles are machines on a job, coloured by time to drop-off"
        actions={
          <button type="button" onClick={() => nav('/map')} className="text-xs text-blue hover:underline">
            Open live map →
          </button>
        }
        bodyClass="px-0 pb-0"
      >
        <FleetMap variant="overview" className="h-[470px] rounded-b-xl" />
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Fleet status" sub={`${fleet.length} own & network machines`}>
          <div className="pt-2">
            <SegmentBar
              segments={[
                { label: 'Active', value: seg.active, color: '#8bd450' },
                { label: 'Idle', value: seg.idle, color: '#9aa2ab' },
                { label: 'Charging', value: seg.charging, color: '#4fb8c4' },
                { label: 'Attention', value: seg.attention, color: '#ec5b5b' },
              ]}
            />
          </div>
        </Card>
        <Card
          title={
            <span className="flex items-center gap-1.5">
              Deliveries / hour <ChevronDown size={15} />
            </span>
          }
          actions={<span className="num text-[28px] text-green">{stats.lastHour}</span>}
        >
          <SparkBars values={stats.buckets} line={stats.smooth} height={118} />
          <div className="flex justify-between text-[11px] text-dim mt-1">
            <span>{clock(now - 13 * 3600_000)}</span>
            <span>{clock(now - 7 * 3600_000)}</span>
            <span>now</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card title="Delivery mix" sub="Today, by method">
          <div className="space-y-3 pt-1">
            {[...stats.mix.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([k, v]) => {
                const total = [...stats.mix.values()].reduce((a, b) => a + b.n, 0) || 1;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-[13px]">
                      <span>{k}</span>
                      <span className="text-muted tabular-nums">
                        {v.n} · {money(v.spend)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#1a1d21] mt-1.5">
                      <div className="h-full rounded-full" style={{ width: `${(v.n / total) * 100}%`, background: v.color }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
        <Card title="Airspace & weather" sub={weather.source === 'open-meteo' ? 'Open-Meteo · London' : weather.source === 'override' ? 'Demo override' : 'Simulated (live feed offline)'}>
          <div className="flex items-end justify-between pt-1">
            <div>
              <div className="num text-[34px] leading-none" style={{ color: flyCol }}>
                {fly.status === 'go' ? 'GO' : fly.status === 'caution' ? 'CAUTION' : 'NO-FLY'}
              </div>
              <div className="text-xs text-muted mt-1">{fly.reasons[0] ?? 'Within limits for Skylift H5 drones'}</div>
            </div>
            <div className="text-right text-xs text-muted space-y-0.5">
              <div>
                Wind 120 m <b className="text-text">{weather.windMs120.toFixed(1)} m/s</b>
              </div>
              <div>
                Gusts <b className="text-text">{weather.gustMs.toFixed(1)} m/s</b>
              </div>
              <div>
                {weather.summary} · <b className="text-text">{Math.round(weather.tempC)}°C</b>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-[11px] text-dim mb-1">Wind at 120 m, next 12 h (limit 12 m/s)</div>
            <div className="flex items-end gap-1 h-14">
              {weather.hourly.slice(0, 12).map((h) => (
                <div key={h.time} className="flex-1 rounded-sm" title={`${clock(h.time)} · ${h.windMs120.toFixed(1)} m/s`} style={{ height: `${Math.min(100, (h.windMs120 / 18) * 100)}%`, background: h.windMs120 > 12 ? '#ec5b5b' : h.windMs120 > 9.6 ? '#f0a33a' : '#4fb8c4' }} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Badge color="#ec5b5b">{s.zones.filter((z) => z.active && z.kind === 'frz').length} airport FRZs</Badge>
            <Badge color="#ff8a4c">{s.zones.filter((z) => z.active && z.kind === 'restricted').length} restricted</Badge>
            <Badge color="#ffd166">{s.zones.filter((z) => z.active && z.kind === 'temporary').length} temporary</Badge>
          </div>
        </Card>
        <Card title="Live events" bodyClass="px-3 pb-3">
          <div className="space-y-0.5 max-h-[230px] overflow-auto">
            {s.events.slice(0, 14).map((e) => (
              <div key={e.id} className="flex gap-2.5 px-2 py-1.5 text-[12.5px] rounded-md hover:bg-panel-2">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: evCol[e.level] }} />
                <div className="flex-1 min-w-0 leading-snug">{e.text}</div>
                <span className="text-[10.5px] text-dim shrink-0">{ago(e.at, now)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
