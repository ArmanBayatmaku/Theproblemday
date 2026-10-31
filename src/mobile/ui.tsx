import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, CircleUser, House, LayoutGrid, Minus, Plus, Receipt } from 'lucide-react';
import { useApp } from './store';
import { isActive } from './orders';

export const money = (n: number) => `£${n.toFixed(2)}`;
export const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Re-renders every `ms` so live things (ETAs, moving vehicles) update. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'white';
export function Btn({ variant = 'primary', size = 'lg', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition active:scale-[0.985] disabled:opacity-35 disabled:active:scale-100 select-none',
        size === 'lg' && 'h-14 px-5 text-[17px]',
        size === 'md' && 'h-11 px-4 text-[15px]',
        size === 'sm' && 'h-9 px-3.5 text-[14px] rounded-full',
        variant === 'primary' && 'bg-black text-white',
        variant === 'secondary' && 'bg-[#eeeeee] text-black',
        variant === 'white' && 'bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.12)]',
        variant === 'ghost' && 'text-black',
        variant === 'danger' && 'bg-[#e11900] text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function RoundBtn({ children, onClick, className, label }: { children: ReactNode; onClick?: () => void; className?: string; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={clsx('w-11 h-11 rounded-full bg-white grid place-items-center shadow-[0_2px_10px_rgba(0,0,0,0.16)] active:scale-95 transition', className)}>
      {children}
    </button>
  );
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('h-10 px-4 rounded-full text-[15px] font-medium whitespace-nowrap transition active:scale-95', active ? 'bg-black text-white' : 'bg-[#f3f3f3] text-black', className)}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={clsx('relative w-[51px] h-[31px] rounded-full transition shrink-0', checked ? 'bg-black' : 'bg-[#e2e2e2]')}>
      <span className={clsx('absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
    </button>
  );
}

export function Stepper({ value, min = 0, max = 9, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Less" disabled={value <= min} onClick={() => onChange(value - 1)} className="w-9 h-9 rounded-full bg-[#f3f3f3] grid place-items-center disabled:opacity-30">
        <Minus size={16} />
      </button>
      <span className="w-5 text-center text-[17px] font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)} className="w-9 h-9 rounded-full bg-[#f3f3f3] grid place-items-center disabled:opacity-30">
        <Plus size={16} />
      </button>
    </div>
  );
}

export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={clsx('w-full h-12 rounded-xl bg-[#f3f3f3] px-4 text-[16px] outline-none placeholder:text-[#8f8f8f] focus:ring-2 focus:ring-black', p.className)} />
);

export function Section({ title, children, aside, className }: { title?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={clsx('px-5 py-5', className)}>
      {title && (
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export const Divider = () => <div className="h-2 bg-[#f6f6f6]" />;

export function TopBar({ title, onBack, right }: { title?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="h-14 px-3 flex items-center gap-2 shrink-0 bg-white">
      <button type="button" aria-label="Back" onClick={onBack ?? (() => nav(-1))} className="w-11 h-11 grid place-items-center rounded-full active:bg-[#f3f3f3]">
        <ArrowLeft size={24} />
      </button>
      <div className="flex-1 min-w-0 text-[17px] font-semibold truncate">{title}</div>
      {right}
    </header>
  );
}

export function TabBar() {
  const active = useApp((s) => s.orders.filter(isActive).length);
  const tabs = [
    { to: '/', label: 'Home', icon: House },
    { to: '/services', label: 'Services', icon: LayoutGrid },
    { to: '/activity', label: 'Activity', icon: Receipt, badge: active },
    { to: '/account', label: 'Account', icon: CircleUser },
  ];
  return (
    <nav className="absolute bottom-0 inset-x-0 z-30 bg-white border-t border-[#eeeeee] pb-[max(6px,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-4 h-[58px]">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end className={({ isActive: on }) => clsx('flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium relative', on ? 'text-black' : 'text-[#8f8f8f]')}>
            {({ isActive: on }) => (
              <>
                <t.icon size={23} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
                {!!t.badge && <span className="absolute top-1.5 left-[calc(50%+6px)] min-w-[17px] h-[17px] px-1 rounded-full bg-[#276ef1] text-white text-[10px] font-bold grid place-items-center">{t.badge}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'green' | 'blue' | 'black' | 'eco' | 'amber' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center h-[22px] px-2 rounded-md text-[12px] font-semibold whitespace-nowrap',
        tone === 'grey' && 'bg-[#eeeeee] text-black',
        tone === 'green' && 'bg-[#e6f4ec] text-[#05944f]',
        tone === 'blue' && 'bg-[#e8f0fe] text-[#1e5bd1]',
        tone === 'black' && 'bg-black text-white',
        tone === 'eco' && 'bg-[#e9f6ee] text-[#0e8345]',
        tone === 'amber' && 'bg-[#fff3df] text-[#9a5b00]',
      )}
    >
      {children}
    </span>
  );
}

export const badgeTone = (b: string) => (b === 'Cheapest' ? 'green' : b === 'Fastest' ? 'blue' : b === 'Greenest' ? 'eco' : b === 'Best pick' ? 'black' : 'grey');
