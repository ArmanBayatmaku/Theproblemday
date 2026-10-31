import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { STATUS_COLOR, JOB_STATUS_COLOR } from '@/lib/colors';
import type { AssetStatus, JobStatus } from '@shared/types';
import { titleCase } from '@/lib/format';

export function Card({ title, actions, children, className, bodyClass, sub }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx('card flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            {title && <h2 className="label-caps text-[15px] text-text truncate">{title}</h2>}
            {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-h-0', bodyClass ?? 'px-5 pb-5')}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, color, sub, onClick }: { label: string; value: ReactNode; color?: string; sub?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={clsx('text-left min-w-0', onClick && 'hover:opacity-90')}>
      <div className="text-[13px] font-display font-semibold border-b border-line pb-1.5" style={{ color: color ?? '#d6dbe0' }}>
        {label}
      </div>
      <div className="num text-[30px] leading-tight mt-1.5" style={{ color: color ?? '#f2f4f6' }}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </button>
  );
}

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle' | 'success' | 'outline';
export function Button({ variant = 'subtle', size = 'md', icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-[13px]',
        size === 'lg' && 'h-11 px-5 text-sm',
        variant === 'primary' && 'bg-blue text-[#0d1520] hover:bg-[#74acf3] font-semibold',
        variant === 'success' && 'bg-green text-[#11200a] hover:bg-[#9fe068] font-semibold',
        variant === 'danger' && 'bg-red text-white hover:bg-[#f06e6e] font-semibold',
        variant === 'subtle' && 'bg-panel-2 text-text hover:bg-panel-3 border border-line',
        variant === 'outline' && 'border border-line text-text hover:bg-panel-2',
        variant === 'ghost' && 'text-muted hover:text-text hover:bg-panel-2',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Badge({ children, color = '#9aa2ab', solid, className }: { children: ReactNode; color?: string; solid?: boolean; className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', className)}
      style={solid ? { background: color, color: '#101317' } : { background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: AssetStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status === 'estop' ? 'E-STOP' : titleCase(status)}
    </span>
  );
}

export function JobStatusPill({ status }: { status: JobStatus }) {
  const c = JOB_STATUS_COLOR[status];
  const label: Record<JobStatus, string> = {
    scheduled: 'Scheduled',
    recurring: 'Recurring',
    assigned: 'Assigned',
    to_pickup: 'To pickup',
    loading: 'Loading',
    in_transit: 'In transit',
    delivered: 'Delivered',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return <Badge color={c}>{label[status]}</Badge>;
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-[#1a1d21] border border-line p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
            value === o.value ? 'bg-panel-3 text-text shadow' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; sub?: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      {(label || sub) && (
        <span className="min-w-0">
          <span className="block text-[13px] text-text">{label}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-green' : 'bg-panel-3')}
      >
        <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-dim mt-1">{hint}</span>}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx('input', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx('input', p.className)} />;

export function Modal({ open, onClose, title, children, footer, width = 640 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="card fade-in max-h-[84vh] flex flex-col shadow-2xl" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="label-caps text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <aside className="absolute right-0 top-0 h-full bg-panel border-l border-line shadow-2xl flex flex-col fade-in" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="label-caps text-sm truncate">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Bar({ value, color = '#8bd450', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1.5 rounded-full bg-[#1a1d21] overflow-hidden', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Battery({ value }: { value: number }) {
  const c = value < 20 ? '#ec5b5b' : value < 45 ? '#f0a33a' : '#8bd450';
  return (
    <div className="flex items-center gap-2 min-w-[86px]">
      <Bar value={value} color={c} className="flex-1" />
      <span className="text-xs tabular-nums w-8 text-right" style={{ color: c }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

/** Three-or-more segment bar like the "user happiness" widget. */
export function SegmentBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[3px]">
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <div className="grid mt-4 gap-4" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0,1fr))` }}>
        {segments.map((s) => (
          <div key={s.label}>
            <div className="text-[13px] font-display font-semibold border-b border-line pb-1.5" style={{ color: s.color }}>
              {s.label}
            </div>
            <div className="num text-[28px] mt-1" style={{ color: s.color }}>
              {Math.round((s.value / total) * 100)}%
            </div>
            <div className="text-xs text-muted">{s.value} machines</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bars + smoothed line, like the LCP widget. */
export function SparkBars({ values, line, height = 92, color = '#8bd450' }: { values: number[]; line?: number[]; height?: number; color?: string }) {
  const w = 600;
  const max = Math.max(1, ...values, ...(line ?? []));
  const bw = w / values.length;
  const pts = (line ?? values).map((v, i) => [i * bw + bw / 2, height - 6 - (v / max) * (height - 16)]);
  const d = pts.map((p, i) => (i ? `L${p[0].toFixed(1)},${p[1].toFixed(1)}` : `M${p[0].toFixed(1)},${p[1].toFixed(1)}`)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {values.map((v, i) => (
        <rect key={i} x={i * bw + bw * 0.22} width={bw * 0.56} y={height - (v / max) * (height - 16) - 4} height={(v / max) * (height - 16)} fill="#3a4047" rx={1.5} />
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={5} fill={color} stroke="#23272c" strokeWidth={2} />}
    </svg>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 text-muted gap-2">
      {icon}
      <div className="text-text font-medium">{title}</div>
      {children && <div className="text-xs max-w-sm">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1.5 py-0.5 rounded border border-line bg-[#1a1d21] text-[10px] text-muted font-mono">{children}</kbd>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-line min-w-0 overflow-x-auto">
      {tabs.map((t) => (
        <button
          type="button"
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
            value === t.value ? 'border-blue text-text' : 'border-transparent text-muted hover:text-text',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[11px] text-dim tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
