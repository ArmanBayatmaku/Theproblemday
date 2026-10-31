import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BatteryFull, Signal, Wifi } from 'lucide-react';
import { fetchLondonWeather } from '@/integrations/weather';
import { useApp } from './store';
import { TabBar, hhmm, useNow } from './ui';
import { HiveMark } from './art';
import { Home } from './screens/Home';
import { Search } from './screens/Search';
import { NewOrder } from './screens/NewOrder';
import { Choose } from './screens/Choose';
import { Track } from './screens/Track';
import { Account, Activity, Services } from './screens/Tabs';

function TabLayout() {
  return (
    <div className="relative h-full">
      <Outlet />
      <TabBar />
    </div>
  );
}

function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/account" element={<Account />} />
        </Route>
        <Route path="/search" element={<Search />} />
        <Route path="/new/:service" element={<NewOrder />} />
        <Route path="/new/:service/choose" element={<Choose />} />
        <Route path="/order/:id" element={<Track />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

/** Keeps orders moving and loads live London weather (drone go/no-go). */
function useBackground() {
  useEffect(() => {
    const id = window.setInterval(() => useApp.getState().tick(), 400);
    fetchLondonWeather().then((w) => w && useApp.getState().setWeather(w));
    return () => window.clearInterval(id);
  }, []);
}

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
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
    <div className="absolute top-0 inset-x-0 h-[50px] z-[60] flex items-end justify-between px-8 pb-2 text-[15px] font-semibold pointer-events-none">
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
    <div className="min-h-full w-full bg-[#e8e8e6] flex items-center justify-center gap-16 px-8 py-4">
      <aside className="hidden lg:block max-w-[380px]">
        <div className="flex items-center gap-2">
          <HiveMark className="w-9 h-9" />
          <span className="text-[30px] font-extrabold tracking-[-0.03em]">Hive</span>
        </div>
        <h1 className="mt-6 text-[40px] leading-[1.08] font-bold tracking-[-0.025em]">Send, sell, collect and move. Without leaving home.</h1>
        <p className="mt-4 text-[17px] text-[#5e5e5e] leading-relaxed">One app for drones, Waymo, couriers, cargo bikes and vans. Sold something online? We collect it from your door and get it to your buyer, no post office needed.</p>
        <ul className="mt-6 space-y-2 text-[15px]">
          {['Prices from every option, side by side', 'Live tracking with a link for whoever is receiving it', 'Rides, house moves and aerial photos too'].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-black shrink-0" /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3 text-[14px]">
          <a href="/" className="h-11 px-4 rounded-full bg-black text-white font-semibold inline-flex items-center">
            Operations dashboard →
          </a>
          <span className="h-11 px-4 rounded-full bg-white text-[#5e5e5e] inline-flex items-center">On a phone? Open this page there.</span>
        </div>
        <p className="mt-6 text-[12px] text-[#8f8f8f]">Hackathon preview. Providers, prices and vehicles are simulated.</p>
      </aside>
      <div style={{ width: 400 * scale, height: H * scale }} className="shrink-0">
        <div className="relative w-[400px] h-[860px] rounded-[58px] bg-[#111] p-[11px] shadow-[0_30px_80px_rgba(0,0,0,0.35)] origin-top-left" style={{ transform: `scale(${scale})` }}>
          <div className="relative w-full h-full rounded-[48px] overflow-hidden bg-white">
            <StatusBar />
            <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[118px] h-[34px] rounded-full bg-black z-[70]" />
            <div className="absolute inset-0 pt-[50px]">{children}</div>
            <div className="absolute bottom-[7px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] rounded-full bg-black z-[70] pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileApp() {
  useBackground();
  const desktop = useMedia('(min-width: 700px)');
  const app = (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <AppRoutes />
    </div>
  );
  if (desktop) return <PhoneFrame>{app}</PhoneFrame>;
  return <div className="h-full pt-[env(safe-area-inset-top)]">{app}</div>;
}
