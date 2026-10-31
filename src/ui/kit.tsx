// Small UI kit: black-and-white, Uber-style controls shared by the website and the phone app.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, CircleUser, Receipt, Send } from 'lucide-react';
import { useApp } from '@/store';
import { isActive } from '@/lib/orders';

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

export function Chip({ active, children, onClick, className, disabled }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'h-10 px-4 rounded-full text-[15px] font-medium whitespace-nowrap transition active:scale-95 disabled:opacity-35',
        active ? 'bg-black text-white' : 'bg-[#f3f3f3] text-black',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Two or three equal options side by side. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 p-1 rounded-xl bg-[#f3f3f3]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx('h-11 rounded-[10px] text-[15px] font-semibold transition inline-flex items-center justify-center gap-2', o.value === value ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.14)]' : 'text-[#545454]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={clsx('relative w-[51px] h-[31px] rounded-full transition shrink-0', checked ? 'bg-black' : 'bg-[#e2e2e2]')}>
      <span className={clsx('absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
    </button>
  );
}

export const TextInput = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={clsx('w-full h-12 rounded-xl bg-[#f3f3f3] px-4 text-[16px] outline-none placeholder:text-[#8f8f8f] focus:ring-2 focus:ring-black', className)} />
);

export function Section({ title, children, aside, className }: { title?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={clsx('px-5 py-4', className)}>
      {title && (
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export const Divider = () => <div className="h-px bg-[#eeeeee] mx-5" />;

export function TopBar({ title, onBack, right }: { title?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="h-14 px-3 flex items-center gap-1 shrink-0 bg-white sticky top-0 z-20">
      <button type="button" aria-label="Back" onClick={onBack ?? (() => nav(-1))} className="w-11 h-11 grid place-items-center rounded-full hover:bg-[#f3f3f3] active:bg-[#eeeeee]">
        <ArrowLeft size={24} />
      </button>
      <div className="flex-1 min-w-0 text-[17px] font-semibold truncate">{title}</div>
      {right}
    </header>
  );
}

/** Bottom bar that stays visible while the panel scrolls. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-20 bg-white px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] border-t border-[#eeeeee]">{children}</div>;
}

export const NAV = [
  { to: '/', label: 'Send', icon: Send },
  { to: '/activity', label: 'Activity', icon: Receipt },
  { to: '/account', label: 'Account', icon: CircleUser },
];

export function useActiveCount() {
  return useApp((s) => s.orders.filter(isActive).length);
}

export function TabBar() {
  const active = useActiveCount();
  return (
    <nav className="shrink-0 bg-white border-t border-[#eeeeee] pb-[max(6px,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-3 h-[56px]">
        {NAV.map((t) => (
          <NavLink key={t.to} to={t.to} end className={({ isActive: on }) => clsx('flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium relative', on ? 'text-black' : 'text-[#8f8f8f]')}>
            {({ isActive: on }) => (
              <>
                <t.icon size={22} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
                {t.to === '/activity' && active > 0 && (
                  <span className="absolute top-1.5 left-[calc(50%+6px)] min-w-[17px] h-[17px] px-1 rounded-full bg-[#276ef1] text-white text-[10px] font-bold grid place-items-center">{active}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'green' | 'blue' | 'black' | 'amber' | 'red' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center h-[22px] px-2 rounded-md text-[12px] font-semibold whitespace-nowrap',
        tone === 'grey' && 'bg-[#eeeeee] text-black',
        tone === 'green' && 'bg-[#e6f4ec] text-[#05944f]',
        tone === 'blue' && 'bg-[#e8f0fe] text-[#1e5bd1]',
        tone === 'black' && 'bg-black text-white',
        tone === 'amber' && 'bg-[#fff3df] text-[#9a5b00]',
        tone === 'red' && 'bg-[#fdecea] text-[#c5221f]',
      )}
    >
      {children}
    </span>
  );
}

/** Note line with a small icon (route detours, weather, fragile…). */
export function Note({ icon, children, tone = 'grey' }: { icon: ReactNode; children: ReactNode; tone?: 'grey' | 'red' | 'amber' | 'green' }) {
  return (
    <div
      className={clsx(
        'flex gap-2.5 text-[14px] leading-snug',
        tone === 'grey' && 'text-[#4b4b4b]',
        tone === 'red' && 'text-[#c5221f]',
        tone === 'amber' && 'text-[#9a5b00]',
        tone === 'green' && 'text-[#05944f]',
      )}
    >
      <span className="mt-[1px] shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
