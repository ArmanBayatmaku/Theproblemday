import { useState } from 'react';
import { Briefcase, ChevronRight, CreditCard, House } from 'lucide-react';
import type { WeatherMode } from '@shared/weather';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { Btn, Section, Segmented } from '@/ui/kit';
import { PlacePicker } from '@/ui/PlacePicker';

export function Account() {
  const s = useApp();
  const [picker, setPicker] = useState<null | 'home' | 'work'>(null);
  useMapScene({ ports: true, fitKey: 'account' }, []);
  const done = [...s.orders, ...s.rentals].filter((o) => o.phase === 'done' || o.phase === 'cancelled').length;

  return (
    <div className="flex-1 pb-8">
      <div className="px-5 pt-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-black text-white grid place-items-center text-[22px] font-bold">{s.name[0]}</div>
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">{s.name}</h1>
          <p className="text-[14px] text-[#6b6b6b]">
            {s.orders.length} {s.orders.length === 1 ? 'delivery' : 'deliveries'} · {s.rentals.length} drone {s.rentals.length === 1 ? 'rental' : 'rentals'}
          </p>
        </div>
      </div>

      <Section title="Saved places" className="pt-6">
        {([
          ['home', House, s.home],
          ['work', Briefcase, s.work],
        ] as const).map(([k, Icon, p]) => (
          <button key={k} type="button" onClick={() => setPicker(k)} className="w-full flex items-center gap-4 py-2.5 text-left">
            <span className="w-10 h-10 rounded-full bg-[#eeeeee] grid place-items-center">
              <Icon size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium">{p.name}</span>
              <span className="block text-[14px] text-[#6b6b6b] truncate">{p.address}</span>
            </span>
            <ChevronRight size={18} className="text-[#a6a6a6]" />
          </button>
        ))}
      </Section>

      <Section title="Payment">
        <Segmented
          value={s.payment}
          onChange={s.setPayment}
          options={[
            { value: 'visa', label: <><CreditCard size={16} /> Visa •••• 4242</> },
            { value: 'apple', label: 'Apple Pay' },
          ]}
        />
      </Section>

      <Section title="Map">
        <Segmented value={s.view3d ? '3d' : '2d'} onChange={(v) => s.setView3d(v === '3d')} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D buildings' }]} />
      </Section>

      <Section title="Demo controls">
        <p className="text-[13px] text-[#6b6b6b] mb-3">Try different weather to see how drones respond. “Storm” grounds them; “Windy” slows them down.</p>
        <Segmented<WeatherMode>
          value={s.weatherMode}
          onChange={s.setWeatherMode}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'calm', label: 'Calm' },
            { value: 'breezy', label: 'Windy' },
            { value: 'storm', label: 'Storm' },
          ]}
        />
        <Btn variant="secondary" size="md" className="w-full mt-3" disabled={!done} onClick={s.clearHistory}>
          Clear past activity
        </Btn>
      </Section>

      <Section title="About this demo">
        <p className="text-[13px] text-[#6b6b6b] leading-relaxed">
          Hackathon prototype. Drones, pilots and tracking are simulated. Waymo, Uber and other prices are estimates for comparison, and CityHop and Thames Express are made-up names. No-fly zones are illustrative (demo only) and must
          not be used for real flight planning. Weather is live from Open-Meteo when online.
        </p>
      </Section>

      {picker && (
        <PlacePicker
          title={picker === 'home' ? 'Set home' : 'Set work'}
          onPick={(p) => {
            s.setPlace(picker, p);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
