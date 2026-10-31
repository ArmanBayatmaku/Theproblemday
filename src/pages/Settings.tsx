import { RotateCcw } from 'lucide-react';
import type { CostSettings } from '@shared/types';
import { useStore, DEFAULT_COSTS } from '@/store/useStore';
import { Button, Card, Field, Input, Segmented, Toggle } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import type { WeatherMode } from '@shared/weather';

const COST_FIELDS: { key: keyof CostSettings; label: string; unit: string; hint?: string; step?: number }[] = [
  { key: 'driverWagePerHour', label: 'Driver cost', unit: '£/h', hint: 'Loaded hourly cost of a driver' },
  { key: 'minBillableMinutes', label: 'Minimum driver time', unit: 'min', hint: 'A driver is booked for at least this long' },
  { key: 'dieselPerLitre', label: 'Diesel', unit: '£/litre', step: 0.01 },
  { key: 'petrolPerLitre', label: 'Petrol', unit: '£/litre', step: 0.01 },
  { key: 'electricityPerKwh', label: 'Electricity', unit: '£/kWh', step: 0.01 },
  { key: 'wearPerKmVan', label: 'Van wear & depreciation', unit: '£/km', step: 0.01 },
  { key: 'wearPerKmTruck', label: 'Truck wear & depreciation', unit: '£/km', step: 0.01 },
  { key: 'congestionCharge', label: 'Congestion Charge', unit: '£/day', hint: 'Mon–Fri 07:00–18:00, Sat–Sun 12:00–18:00' },
  { key: 'congestionChargeEvVan', label: 'Congestion Charge — electric van (Auto Pay)', unit: '£/day' },
  { key: 'ulezCharge', label: 'ULEZ (non-compliant vehicles)', unit: '£/day' },
  { key: 'robotSupervisionPerHour', label: 'Remote supervision of robots', unit: '£/h' },
  { key: 'handlingMinutes', label: 'Loading & handling time', unit: 'min' },
];

export function Settings() {
  const s = useStore();
  return (
    <div className="p-5 grid grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
      <Card
        title="Own-fleet cost model"
        sub="Used to price your own vehicles against the marketplace. London road charges are pre-filled; check them against TfL before relying on the numbers."
        actions={
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => s.setCosts(DEFAULT_COSTS)}>
            Defaults
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
          {COST_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label} (${f.unit})`} hint={f.hint}>
              <Input type="number" step={f.step ?? 1} min={0} value={s.costs[f.key]} onChange={(e) => s.setCosts({ [f.key]: Math.max(0, +e.target.value) })} className="w-full" />
            </Field>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Simulation">
          <div className="space-y-4">
            <Field label="Speed">
              <Segmented
                value={String(s.sim.speed)}
                onChange={(v) => s.setSim({ speed: Number(v) })}
                options={[
                  { value: '1', label: '×1 real time' },
                  { value: '4', label: '×4' },
                  { value: '10', label: '×10' },
                  { value: '30', label: '×30' },
                ]}
              />
            </Field>
            <Toggle checked={s.sim.running} onChange={(running) => s.setSim({ running })} label="Running" sub="Pause freezes every machine and job" />
            <Toggle checked={s.sim.demoTraffic} onChange={(demoTraffic) => s.setSim({ demoTraffic })} label="Demo traffic" sub="Auto-books a delivery every few minutes so the map stays busy" />
          </div>
        </Card>
        <Card title="Weather">
          <Field label="Source" hint="Live uses Open-Meteo. The others override it — handy to demo drone groundings.">
            <Segmented
              value={s.weatherMode}
              onChange={(m: WeatherMode) => s.setWeatherMode(m)}
              options={[
                { value: 'live', label: 'Live' },
                { value: 'calm', label: 'Calm' },
                { value: 'breezy', label: 'Breezy' },
                { value: 'storm', label: 'Storm' },
              ]}
            />
          </Field>
        </Card>
        <Card title="Organisation">
          <div className="text-[13px] space-y-1">
            <div>
              <span className="text-muted">Company:</span> {s.org.name}
            </div>
            <div>
              <span className="text-muted">Operator:</span> {s.org.user} · {s.org.role}
            </div>
          </div>
        </Card>
        <Card title="Demo data">
          <div className="text-xs text-muted mb-3">Everything is saved in this browser. Reset to start the demo fresh — fleet, jobs, tasks and the clock.</div>
          <Button
            variant="danger"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              if (window.confirm('Reset all demo data?')) {
                s.resetDemo();
                toast.info('Demo reset');
              }
            }}
          >
            Reset demo
          </Button>
        </Card>
      </div>
    </div>
  );
}
