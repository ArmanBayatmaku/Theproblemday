// Layout. Website: top bar, booking panel on the left, big map on the right.
// Phone: map on top, a sheet below it, tabs at the bottom — the same screens either way.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Smartphone } from 'lucide-react';
import { MapView } from '@/map/MapView';
import { RelayMark } from './art';
import { TabBar, useActiveCount } from './kit';
import { OverlayRoot } from './PlacePicker';

export type Layout = 'phone' | 'desktop';
const LayoutContext = createContext<Layout>('desktop');
export const useLayout = () => useContext(LayoutContext);

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function Shell({ phone }: { phone?: boolean }) {
  const wide = useMedia('(min-width: 900px)');
  const layout: Layout = phone || !wide ? 'phone' : 'desktop';
  return <LayoutContext.Provider value={layout}>{layout === 'desktop' ? <Desktop /> : <Phone />}</LayoutContext.Provider>;
}

/** Each screen starts at the top of the panel. */
function useScrollReset() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, 0);
  }, [pathname]);
  return ref;
}

const DESKTOP_NAV: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Home', match: (p) => p === '/' },
  { to: '/send', label: 'Send', match: (p) => p === '/send' || p === '/prices' || p.startsWith('/order/') },
  { to: '/rent', label: 'Drone rental', match: (p) => p.startsWith('/rent') },
  { to: '/activity', label: 'Activity', match: (p) => p === '/activity' },
  { to: '/coming-soon', label: 'Coming soon', match: (p) => p === '/coming-soon' },
];

function Desktop() {
  const { pathname } = useLocation();
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const active = useActiveCount();
  const scroller = useScrollReset();
  return (
    <div className="h-full flex flex-col bg-white">
      <header className="h-16 shrink-0 flex items-center gap-8 px-6 border-b border-[#eeeeee] relative z-30 bg-white">
        <NavLink to="/" className="flex items-center gap-2">
          <RelayMark className="w-8 h-8" />
          <span className="text-[24px] font-extrabold tracking-[-0.04em]">Relay</span>
        </NavLink>
        <nav className="flex items-center gap-1">
          {DESKTOP_NAV.map((t) => {
            const on = t.match(pathname);
            return (
              <NavLink key={t.to} to={t.to} className={clsx('h-10 px-4 rounded-full text-[15px] font-semibold inline-flex items-center gap-2 transition', on ? 'bg-black text-white' : 'hover:bg-[#f3f3f3]')}>
                {t.label}
                {t.to === '/activity' && active > 0 && <span className="min-w-[19px] h-[19px] px-1 rounded-full bg-[#276ef1] text-white text-[11px] font-bold grid place-items-center">{active}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[14px] text-[#6b6b6b] hidden xl:inline">Drone delivery across London</span>
          <a href="/mobile/" className="h-10 px-4 rounded-full bg-[#f3f3f3] hover:bg-[#eaeaea] text-[14px] font-semibold inline-flex items-center gap-2">
            <Smartphone size={16} /> Phone app
          </a>
          <NavLink to="/account" aria-label="Account" title="Account" className="w-10 h-10 rounded-full bg-black text-white grid place-items-center font-semibold">
            A
          </NavLink>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex">
        <aside ref={setPanel} className="relative w-[440px] shrink-0 border-r border-[#eeeeee] flex flex-col min-h-0 bg-white z-10 shadow-[4px_0_16px_rgba(0,0,0,0.04)]">
          <OverlayRoot.Provider value={panel}>
            <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              <Outlet />
            </div>
          </OverlayRoot.Provider>
        </aside>
        <main className="relative flex-1 min-w-0">
          <MapView />
        </main>
      </div>
    </div>
  );
}

/** How much of the phone screen the map takes, per screen. */
function mapHeight(path: string) {
  if (path.startsWith('/order/') || path.startsWith('/rental/')) return '48%';
  if (path.startsWith('/prices') || path === '/rent/options' || path === '/coming-soon') return '40%';
  if (path === '/send') return '38%';
  if (path === '/rent') return '34%';
  if (path === '/') return '28%';
  return '0%';
}

function Phone() {
  const { pathname } = useLocation();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const scroller = useScrollReset();
  const tabs = pathname === '/' || pathname === '/activity' || pathname === '/account';
  const h = mapHeight(pathname);
  const hidden = h === '0%';
  return (
    <div ref={setRoot} className="relative h-full flex flex-col bg-white overflow-hidden">
      <OverlayRoot.Provider value={root}>
        <div className="relative shrink-0 transition-[height] duration-300 ease-out" style={{ height: h }}>
          <MapView compact />
        </div>
        <div ref={scroller} className={clsx('relative flex-1 min-h-0 overflow-y-auto flex flex-col bg-white z-10', !hidden && 'rounded-t-[18px] -mt-3 shadow-[0_-6px_18px_rgba(0,0,0,0.08)]')}>
          <Outlet />
        </div>
        {tabs && <TabBar />}
      </OverlayRoot.Provider>
    </div>
  );
}
