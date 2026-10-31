// Coming soon: drone charging at petrol stations and EV charging hubs, so drones are ready anywhere in the city.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryCharging, Bell, Check, Fuel, MapPinned, Timer, Zap } from 'lucide-react';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { CHARGING_SITES, COVERAGE_M } from '@/lib/stations';
import { Badge, Btn, Section, TopBar } from '@/ui/kit';

export const COMING_SOON_TEXT =
  'We will have charging stations for our drones at petrol stations and EV charging stations, so that the drones will be ready to deploy whenever needed in the city.';

export function ComingSoon() {
  const nav = useNavigate();
  const notify = useApp((s) => s.notifyCharging);
  const setNotify = useApp((s) => s.setNotifyCharging);
  const petrol = CHARGING_SITES.filter((s) => s.kind === 'petrol').length;
  const ev = CHARGING_SITES.length - petrol;

  useMapScene(
    {
      fit: CHARGING_SITES.map((s) => s.position),
      fitKey: 'coming-soon',
      stations: CHARGING_SITES,
      coverage: CHARGING_SITES.map((s) => ({ center: s.position, radiusM: COVERAGE_M })),
      ports: true,
    },
    [],
  );

  return (
    <>
      <TopBar title="Coming soon" onBack={() => nav('/')} />
      <div className="flex-1 pb-8">
        <div className="px-5">
          <Badge tone="green">Coming soon</Badge>
          <h1 className="mt-3 text-[28px] font-bold tracking-[-0.02em] leading-tight">Relay charging stations</h1>
          <p className="mt-2 text-[16px] text-[#333] leading-relaxed">{COMING_SOON_TEXT}</p>
        </div>

        <div className="mx-5 mt-5 rounded-2xl bg-[#f3f3f3] overflow-hidden">
          <ChargingArt />
        </div>

        <div className="mx-5 mt-4 grid grid-cols-3 gap-2">
          <Stat icon={<MapPinned size={16} />} value={CHARGING_SITES.length} label="planned sites" />
          <Stat icon={<Fuel size={16} className="text-[#c2410c]" />} value={petrol} label="petrol stations" />
          <Stat icon={<Zap size={16} className="text-[#1f8f55]" />} value={ev} label="EV charging hubs" />
        </div>

        <Section title="How it will work" className="pt-6">
          <ol className="space-y-4">
            <Step n={1} icon={<Fuel size={18} />} title="Pads on forecourts and charging hubs">
              Landing pads on petrol station canopies and at EV charging hubs around the city.
            </Step>
            <Step n={2} icon={<BatteryCharging size={18} />} title="Always topped up">
              Drones recharge between jobs, so there’s always a charged one waiting nearby.
            </Step>
            <Step n={3} icon={<Timer size={18} />} title="Ready whenever you need one">
              The nearest ready drone takes your delivery or rental, so waits get shorter wherever you are.
            </Step>
          </ol>
        </Section>

        <div className="mx-5 rounded-xl bg-[#e6f4ec] text-[#05944f] px-4 py-3 text-[14px] font-medium leading-snug">
          Our goal: a charged drone within about 5 minutes of most of London. The green circles on the map show the area each site would cover.
        </div>

        <div className="px-5 mt-5">
          <Btn className="w-full" variant={notify ? 'secondary' : 'primary'} onClick={() => setNotify(!notify)}>
            {notify ? (
              <>
                <Check size={18} /> We’ll let you know when it launches
              </>
            ) : (
              <>
                <Bell size={18} /> Notify me when it launches
              </>
            )}
          </Btn>
          <p className="mt-3 text-[12px] text-[#8f8f8f] leading-snug">Planned sites are illustrative for this demo. No petrol station or charging network is named or involved yet.</p>
        </div>
      </div>
    </>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl border border-[#e2e2e2] px-3 py-3">
      {icon}
      <div className="mt-1.5 text-[22px] font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[12px] text-[#6b6b6b] leading-tight">{label}</div>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-9 h-9 rounded-full bg-black text-white grid place-items-center shrink-0" aria-label={`Step ${n}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[14px] text-[#545454] leading-snug">{children}</span>
      </span>
    </li>
  );
}

/** A petrol station canopy with a drone pad, and an EV hub with a drone charging. */
function ChargingArt() {
  const drone = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-17" cy="-6" rx="10" ry="2" fill="#cfcfcf" />
      <ellipse cx="17" cy="-6" rx="10" ry="2" fill="#cfcfcf" />
      <rect x="-18" y="-6" width="2" height="5" fill="#2a2a2a" />
      <rect x="16" y="-6" width="2" height="5" fill="#2a2a2a" />
      <rect x="-21" y="-2" width="42" height="3.5" rx="1.75" fill="#2a2a2a" />
      <rect x="-8" y="-5" width="16" height="9" rx="4.5" fill="#111" />
      <circle cx="3.5" cy="-0.5" r="1.4" fill="#7fd45a" />
    </g>
  );
  return (
    <svg viewBox="0 0 360 150" className="block w-full h-auto" role="img" aria-label="A drone landing on a petrol station canopy and another charging at an EV hub">
      <rect width="360" height="150" fill="#f3f3f3" />
      <circle cx="318" cy="30" r="14" fill="#ffffff" />
      <line x1="10" y1="128" x2="350" y2="128" stroke="#d6d6d6" strokeWidth="2" />
      {/* petrol station */}
      <rect x="40" y="66" width="8" height="62" fill="#cfcfcf" />
      <rect x="152" y="66" width="8" height="62" fill="#cfcfcf" />
      <rect x="30" y="48" width="140" height="13" rx="2" fill="#1b1b1b" />
      <rect x="30" y="61" width="140" height="5" fill="#c2410c" />
      <rect x="74" y="94" width="18" height="34" rx="2" fill="#fff" stroke="#bdbdbd" />
      <rect x="78" y="99" width="10" height="7" rx="1" fill="#2a2a2a" />
      <rect x="108" y="94" width="18" height="34" rx="2" fill="#fff" stroke="#bdbdbd" />
      <rect x="112" y="99" width="10" height="7" rx="1" fill="#2a2a2a" />
      <ellipse cx="100" cy="47" rx="28" ry="3.5" fill="#1f8f55" opacity=".45" />
      <line x1="100" y1="33" x2="100" y2="44" stroke="#1f8f55" strokeWidth="1.5" strokeDasharray="2 2" />
      {drone(100, 24, 1.1)}
      {/* EV hub */}
      <rect x="214" y="80" width="16" height="48" rx="3" fill="#fff" stroke="#bdbdbd" />
      <rect x="214" y="80" width="16" height="6" rx="3" fill="#1f8f55" />
      <path d="M223 92 l-4 7 h4 l-2 7 l6 -9 h-4 l2 -5 z" fill="#1f8f55" />
      <rect x="244" y="80" width="16" height="48" rx="3" fill="#fff" stroke="#bdbdbd" />
      <rect x="244" y="80" width="16" height="6" rx="3" fill="#1f8f55" />
      <path d="M253 92 l-4 7 h4 l-2 7 l6 -9 h-4 l2 -5 z" fill="#1f8f55" />
      <rect x="296" y="66" width="5" height="62" fill="#cfcfcf" />
      <rect x="272" y="60" width="54" height="7" rx="3.5" fill="#1b1b1b" />
      {drone(299, 53, 1)}
      <path d="M326 38 l-5 9 h5 l-3 9 l8 -12 h-5 l3 -6 z" fill="#1f8f55" />
    </svg>
  );
}
