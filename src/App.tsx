import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { Toaster } from '@/components/ui/toast';
import { Modal, Kbd } from '@/components/ui';
import { useStore } from '@/store/useStore';
import { fetchLondonWeather } from '@/integrations/weather';
import { Overview } from '@/pages/Overview';
import { LiveMapPage } from '@/pages/LiveMapPage';
import { RequestJob } from '@/pages/RequestJob';
import { Jobs } from '@/pages/Jobs';
import { Fleet } from '@/pages/Fleet';
import { Tasks } from '@/pages/Tasks';
import { ControlPanel } from '@/pages/ControlPanel';
import { Integrations } from '@/pages/Integrations';
import { Settings } from '@/pages/Settings';

const TITLES: Record<string, [string, string?]> = {
  '/': ['Live:', 'London operations'],
  '/map': ['Live map:', 'London'],
  '/request': ['Request:', 'New job'],
  '/jobs': ['Jobs:', 'Deliveries'],
  '/fleet': ['Fleet:', 'Registry'],
  '/locations': ['Locations:', 'Sites'],
  '/tasks': ['Machine tasks:', 'Today'],
  '/control': ['Control panel'],
  '/integrations': ['Integrations'],
  '/settings': ['Settings'],
};

function useSimulation() {
  const tick = useStore((s) => s.tick);
  useEffect(() => {
    // Fresh demo if the saved simulation is from another day.
    const s = useStore.getState();
    if (Math.abs(s.sim.now - Date.now()) > 12 * 3600_000) s.resetDemo();
    let last = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      tick(t - last);
      last = t;
    }, 500);
    return () => window.clearInterval(id);
  }, [tick]);
}

function useLiveWeather() {
  const setWeatherLive = useStore((s) => s.setWeatherLive);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const w = await fetchLondonWeather();
      if (alive) setWeatherLive(w);
    };
    load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [setWeatherLive]);
}

export function App() {
  const loc = useLocation();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  useSimulation();
  useLiveWeather();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const key = Object.keys(TITLES).find((p) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))) ?? '/';
  const [title, accent] = TITLES[key];

  return (
    <div className="flex h-full">
      <Sidebar onHelp={() => setHelp(true)} />
      <main className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} accent={accent} onSearch={() => setPalette(true)} />
        <div className="flex-1 min-h-0 overflow-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/map" element={<LiveMapPage />} />
            <Route path="/request" element={<RequestJob />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/locations" element={<Fleet initialTab="locations" />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/control" element={<ControlPanel />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
      <Modal open={help} onClose={() => setHelp(false)} title="Quick guide" width={560}>
        <div className="space-y-3 text-[13px] text-muted leading-relaxed">
          <p><b className="text-text">Request Job</b> — tell the assistant what to move (“3 crates from Park Royal warehouse to King’s Cross store tomorrow 9am”) or fill the form. Every method is priced side by side, including your own fleet.</p>
          <p><b className="text-text">Live Map</b> — switch to <b className="text-text">3D</b> for the skyline, no-fly zones and wind. Drag with Shift (or the box tool) to select machines.</p>
          <p><b className="text-text">Control Panel</b> — send any command to any selection. Commands route through the matching adapter (MAVLink, ROS 2, VDA 5050, vendor APIs) — in this build they run in the simulator.</p>
          <p><b className="text-text">Machine Tasks</b> — give robots work between, before or after deliveries.</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs"><span><Kbd>⌘K</Kbd> search & commands</span><span><Kbd>Shift</Kbd>+drag box select</span><span><Kbd>Esc</Kbd> close</span></div>
          <p className="text-xs text-dim">Waymo, Uber and partner couriers are simulated until their APIs are connected. Airspace data is illustrative — never use it for real flight planning.</p>
        </div>
      </Modal>
    </div>
  );
}
