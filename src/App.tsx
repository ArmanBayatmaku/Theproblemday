import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import { fetchLondonWeather } from '@/lib/weather';
import { hhmm, useNow } from '@/lib/format';
import { useApp } from '@/store';
import { Shell, useMedia } from '@/ui/Shell';
import { HiveMark } from '@/ui/art';
import { Send } from '@/screens/Send';
import { Prices } from '@/screens/Prices';
import { Track } from '@/screens/Track';
import { Activity } from '@/screens/Activity';
import { Account } from '@/screens/Account';

/** Keeps deliveries moving and London's weather fresh (drones check wind before flying). */
function useBackground() {
  useEffect(() => {
    const tick = window.setInterval(() => useApp.getState().tick(), 400);
    const load = () => fetchLondonWeather().then((w) => w && useApp.getState().setLiveWeather(w));
    void load();
    const refresh = window.setInterval(load, 15 * 60_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, []);
}

function AppRoutes({ phone }: { phone?: boolean }) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell phone={phone} />}>
          <Route path="/" element={<Send />} />
          <Route path="/prices" element={<Prices />} />
          <Route path="/order/:id" element={<Track />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

/** The website (responsive: the same app as the phone, laid out for a big screen). */
export function WebApp() {
  useBackground();
  return <AppRoutes />;
}

/** /mobile/ — the phone app. On a laptop it is shown inside a phone frame for demos. */
export function PhoneApp() {
  useBackground();
  const desktop = useMedia('(min-width: 700px)');
  if (!desktop) {
    return (
      <div className="h-full pt-[env(safe-area-inset-top)]">
        <AppRoutes phone />
      </div>
    );
  }
  return (
    <PhoneFrame>
      <AppRoutes phone />
    </PhoneFrame>
  );
}

function useFitScale(h: number) {
  const [s, setS] = useState(1);
  useEffect(() => {
    const on = () => setS(Math.min(1, (window.innerHeight - 32) / h));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [h]);
  return s;
}

function StatusBar() {
  const now = useNow(15_000);
  return (
    <div className="absolute top-0 inset-x-0 h-[50px] z-[60] flex items-end justify-between px-8 pb-2 text-[15px] font-semibold pointer-events-none bg-white">
      <span className="tabular-nums w-14 text-center">{hhmm(now)}</span>
      <span className="flex items-center gap-1.5">
        <Signal size={16} strokeWidth={2.6} />
        <Wifi size={16} strokeWidth={2.6} />
        <BatteryFull size={22} strokeWidth={2} />
      </span>
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  const H = 860;
  const scale = useFitScale(H + 24);
  return (
    <div className="min-h-full w-full bg-[#ebebe9] flex items-center justify-center gap-16 px-8 py-4">
      <aside className="hidden lg:block max-w-[380px]">
        <div className="flex items-center gap-2">
          <HiveMark className="w-9 h-9" />
          <span className="text-[30px] font-extrabold tracking-[-0.04em]">Hive</span>
        </div>
        <h1 className="mt-6 text-[40px] leading-[1.08] font-bold tracking-[-0.025em]">Drone delivery across London. No post office.</h1>
        <p className="mt-4 text-[17px] text-[#5e5e5e] leading-relaxed">
          Sold something online? Book a drone from your doorstep and it’s with your buyer in minutes, or at a shop near them to collect later. You’ll see what Waymo or Uber would charge too.
        </p>
        <ul className="mt-6 space-y-2 text-[15px]">
          {['Flies around no-fly zones, live on a 2D or 3D map', 'Checks wind and weather before every flight', 'Custom sizes checked against the drone’s payload bay'].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-black shrink-0" /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3 text-[14px]">
          <a href="/" className="h-11 px-4 rounded-full bg-black text-white font-semibold inline-flex items-center">
            Open the website →
          </a>
          <span className="h-11 px-4 rounded-full bg-white text-[#5e5e5e] inline-flex items-center">On a phone? Open this page there.</span>
        </div>
        <p className="mt-6 text-[12px] text-[#8f8f8f]">Hackathon preview. Drones, shops and prices are simulated; no-fly zones are illustrative.</p>
      </aside>
      <div style={{ width: 400 * scale, height: H * scale }} className="shrink-0">
        <div className="relative w-[400px] h-[860px] rounded-[58px] bg-[#111] p-[11px] shadow-[0_30px_80px_rgba(0,0,0,0.35)] origin-top-left" style={{ transform: `scale(${scale})` }}>
          <div className="relative w-full h-full rounded-[48px] overflow-hidden bg-white">
            <StatusBar />
            <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[118px] h-[34px] rounded-full bg-black z-[70]" />
            <div className="absolute inset-0 pt-[50px] pb-[10px]">{children}</div>
            <div className="absolute bottom-[7px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] rounded-full bg-black z-[70] pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
