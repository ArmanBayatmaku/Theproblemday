import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  ChevronRight,
  CircleQuestionMark,
  Gamepad2,
  LayoutDashboard,
  ListChecks,
  Map,
  Package,
  Plug,
  Settings,
  Sparkles,
  Warehouse,
  Drone,
} from 'lucide-react';
import { HiveLogo } from '@/lib/icons';
import { useStore } from '@/store/useStore';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/map', label: 'Live Map', icon: Map },
  { to: '/request', label: 'Request Job', icon: Sparkles },
  { to: '/jobs', label: 'Jobs', icon: Package, badge: 'jobs' as const },
  { to: '/fleet', label: 'Fleet', icon: Drone, chevron: true },
  { to: '/locations', label: 'Locations', icon: Warehouse },
  { to: '/tasks', label: 'Machine Tasks', icon: ListChecks },
  { to: '/control', label: 'Control Panel', icon: Gamepad2, chevron: true },
  { to: '/integrations', label: 'Integrations', icon: Plug, chevron: true },
];

export function Sidebar({ onHelp }: { onHelp: () => void }) {
  const loc = useLocation();
  const activeJobs = useStore((s) => s.jobs.filter((j) => ['to_pickup', 'loading', 'in_transit'].includes(j.status)).length);
  const org = useStore((s) => s.org);
  return (
    <aside className="w-[226px] shrink-0 h-full flex flex-col bg-bg border-r border-[#262a2f]">
      <div className="h-[74px] flex items-center gap-2.5 px-5">
        <HiveLogo size={34} />
        <div className="leading-tight">
          <div className="font-display font-extrabold text-[17px] tracking-wide">HIVE</div>
          <div className="text-[10px] text-muted uppercase tracking-[0.14em]">Autonomous Ops</div>
        </div>
      </div>
      <nav className="flex-1 px-3 pt-3 space-y-0.5 overflow-auto">
        {NAV.map((n) => {
          const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
          const I = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={clsx(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors',
                active ? 'bg-[#262b31] text-text' : 'text-[#c3c9cf] hover:text-text hover:bg-[#22262b]',
              )}
            >
              <I size={17} className={active ? 'text-blue' : 'text-[#9aa2ab] group-hover:text-text'} />
              <span className="flex-1">{n.label}</span>
              {n.badge === 'jobs' && activeJobs > 0 && (
                <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-blue/20 text-blue tabular-nums">{activeJobs}</span>
              )}
              {n.chevron && <ChevronRight size={14} className="text-dim" />}
            </NavLink>
          );
        })}
      </nav>
      <div className="px-3 pb-4 space-y-0.5">
        <NavLink to="/settings" className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px]', isActive ? 'bg-[#262b31] text-text' : 'text-[#c3c9cf] hover:bg-[#22262b]')}>
          <Settings size={17} className="text-[#9aa2ab]" /> Settings
        </NavLink>
        <button type="button" onClick={onHelp} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-[#c3c9cf] hover:bg-[#22262b]">
          <CircleQuestionMark size={17} className="text-[#9aa2ab]" /> <span className="flex-1 text-left">Help</span>
          <ChevronRight size={14} className="text-dim" />
        </button>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue to-violet grid place-items-center text-[12px] font-bold text-[#0d1520]">
            {org.user.slice(0, 1)}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-medium truncate">{org.user}</div>
            <div className="text-[11px] text-muted truncate">{org.name}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
