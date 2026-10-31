import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Bell, ChevronDown, OctagonX, Pause, Play, Search, Wind } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { clockSec, ago } from '@/lib/format';
import { droneFlyability } from '@shared/weather';
import { Button, Kbd, Modal } from '@/components/ui';
import { toast } from '@/components/ui/toast';
import type { WeatherMode } from '@shared/weather';

export function Topbar({ title, accent, onSearch }: { title: string; accent?: string; onSearch: () => void }) {
  return (
    <header className="h-[74px] shrink-0 flex items-center gap-4 px-7 border-b border-[#262a2f]">
      <h1 className="font-display font-extrabold text-[22px] tracking-wide uppercase flex items-center gap-2 min-w-0">
        <span className="text-text truncate">{title}</span>
        {accent && <span className="text-[#aeb5bc] truncate">{accent}</span>}
      </h1>
      <div className="flex-1" />
      <div className="flex items-center gap-4 shrink-0 whitespace-nowrap">
        <SimClock />
        <WeatherChip />
        <button type="button" onClick={onSearch} className="h-9 flex items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13px] text-muted hover:text-text">
          <Search size={15} /> <span className="hidden 2xl:inline">Search or command</span><span className="2xl:hidden">Search</span> <Kbd>⌘K</Kbd>
        </button>
        <EventsBell />
        <EstopButton />
      </div>
    </header>
  );
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    setTimeout(() => window.addEventListener('mousedown', h), 0);
    return () => window.removeEventListener('mousedown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={clsx('absolute right-0 top-11 z-50 card shadow-2xl fade-in', className)}>
      {children}
    </div>
  );
}

function SimClock() {
  const sim = useStore((s) => s.sim);
  const setSim = useStore((s) => s.setSim);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="h-9 flex items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13px]">
        <span className={sim.running ? 'dot-live' : 'w-2 h-2 rounded-full bg-amber'} />
        <span className="num text-[14px] tabular-nums">{clockSec(sim.now)}</span>
        <span className="text-[11px] text-muted">sim ×{sim.speed}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-64 p-3.5">
        <div className="label-caps text-[11px] text-muted mb-2">Simulation clock</div>
        <div className="flex gap-1.5 mb-3">
          {[1, 4, 10, 30].map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setSim({ speed: v })}
              className={clsx('flex-1 h-8 rounded-md text-xs font-semibold border', sim.speed === v ? 'bg-blue text-[#0d1520] border-blue' : 'border-line hover:bg-panel-2')}
            >
              ×{v}
            </button>
          ))}
        </div>
        <Button className="w-full mb-2" icon={sim.running ? <Pause size={14} /> : <Play size={14} />} onClick={() => setSim({ running: !sim.running })}>
          {sim.running ? 'Pause simulation' : 'Resume simulation'}
        </Button>
        <label className="flex items-center justify-between text-[13px] mt-2">
          Demo order traffic
          <input type="checkbox" checked={sim.demoTraffic} onChange={(e) => setSim({ demoTraffic: e.target.checked })} />
        </label>
        <p className="text-[11px] text-dim mt-2 leading-snug">The sim clock runs faster than real time so a day of operations unfolds during a demo.</p>
      </Popover>
    </div>
  );
}

function WeatherChip() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const w = s.weather();
  const fly = droneFlyability(w, { maxWindMs: 12, ipRating: 'IP55' }).status;
  const col = fly === 'go' ? '#8bd450' : fly === 'caution' ? '#f0a33a' : '#ec5b5b';
  const modes: { v: WeatherMode; label: string; sub: string }[] = [
    { v: 'live', label: 'Live', sub: w.source === 'open-meteo' ? 'Open-Meteo, London' : 'Live feed unavailable — simulated' },
    { v: 'calm', label: 'Calm', sub: '3 m/s, dry' },
    { v: 'breezy', label: 'Breezy', sub: '10 m/s — smaller drones grounded' },
    { v: 'storm', label: 'Storm', sub: '18 m/s + rain — all drones grounded' },
  ];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="h-9 flex items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13px]">
        <Wind size={15} style={{ color: col }} />
        <span className="tabular-nums">{w.windMs120.toFixed(1)} m/s</span>
        <span className="text-muted">{Math.round(w.tempC)}°C</span>
        <span className="text-[11px] font-bold" style={{ color: col }}>
          {fly === 'go' ? 'DRONES GO' : fly === 'caution' ? 'CAUTION' : 'NO-FLY'}
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-72 p-2">
        <div className="label-caps text-[11px] text-muted px-2 pt-1.5 pb-2">Weather source (demo control)</div>
        {modes.map((m) => (
          <button
            type="button"
            key={m.v}
            onClick={() => {
              s.setWeatherMode(m.v);
              setOpen(false);
              if (m.v === 'storm') toast.warning('Storm override on — waiting drone jobs will fall back to other methods.');
            }}
            className={clsx('w-full text-left px-2.5 py-2 rounded-md hover:bg-panel-2', s.weatherMode === m.v && 'bg-panel-2')}
          >
            <div className="text-[13px] font-medium">{m.label}</div>
            <div className="text-[11px] text-muted">{m.sub}</div>
          </button>
        ))}
      </Popover>
    </div>
  );
}

function EventsBell() {
  const events = useStore((s) => s.events);
  const now = useStore((s) => s.sim.now);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const unseen = events.filter((e) => e.at > seen && (e.level === 'warning' || e.level === 'danger')).length;
  const col = { info: '#5a9bf0', success: '#8bd450', warning: '#f0a33a', danger: '#ec5b5b' };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSeen(now);
        }}
        className="relative h-9 w-9 grid place-items-center rounded-lg border border-line bg-panel text-muted hover:text-text"
      >
        <Bell size={16} />
        {unseen > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber text-[10px] font-bold text-[#1d1405] grid place-items-center">{unseen}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[380px] max-h-[440px] overflow-auto p-2">
        <div className="label-caps text-[11px] text-muted px-2 pt-1.5 pb-2">Live events</div>
        {events.slice(0, 40).map((e) => (
          <div key={e.id} className="flex gap-2.5 px-2 py-1.5 text-[12.5px]">
            <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: col[e.level] }} />
            <div className="flex-1 min-w-0">
              <div className="leading-snug">{e.text}</div>
              <div className="text-[10.5px] text-dim">{ago(e.at, now)}</div>
            </div>
          </div>
        ))}
      </Popover>
    </div>
  );
}

function EstopButton() {
  const [open, setOpen] = useState(false);
  const [hold, setHold] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const estopAll = useStore((s) => s.estopAll);
  const count = useStore((s) => s.assets.filter((a) => a.ownership !== 'external' && a.autonomy !== 'human_driven' && a.status !== 'estop').length);
  const start = () => {
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 1200);
      setHold(p);
      if (p >= 1) {
        window.clearInterval(timer.current);
        const rec = estopAll();
        toast.danger(`E-STOP sent to ${rec.targetIds.length} autonomous machines`);
        setOpen(false);
        setHold(0);
      }
    }, 30);
  };
  const cancel = () => {
    window.clearInterval(timer.current);
    setHold(0);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="estop-pulse h-9 flex items-center gap-1.5 rounded-lg bg-red px-3 text-[13px] font-bold text-white">
        <OctagonX size={16} /> E-STOP
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Emergency stop — all autonomous machines" width={480}>
        <p className="text-[13px] text-muted leading-relaxed">
          Stops <b className="text-text">{count}</b> autonomous and remote-piloted machines immediately. Airborne drones perform an emergency landing. Human-driven vehicles get a message instead.
          Machines stay stopped until released and resumed from the Control Panel.
        </p>
        <button
          type="button"
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          className="relative mt-5 w-full h-14 rounded-xl bg-red/15 border border-red text-red font-display font-extrabold tracking-wide overflow-hidden select-none"
        >
          <span className="absolute inset-y-0 left-0 bg-red/40" style={{ width: `${hold * 100}%` }} />
          <span className="relative">HOLD TO STOP EVERYTHING</span>
        </button>
      </Modal>
    </>
  );
}
