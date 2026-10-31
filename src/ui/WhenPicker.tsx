// Pick a day and a half-hour slot (used for scheduled deliveries and drone rentals).
import { dayLabel, hhmm } from '@/lib/format';
import { Chip } from './kit';

/** Next half-hour slot at least 45 minutes away. */
export function firstSlot(now: number) {
  const t = new Date(now + 45 * 60_000);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() <= 30 ? 30 : 60);
  return t.getTime();
}

export function WhenPicker({ at, onChange }: { at: number; onChange: (t: number) => void }) {
  const now = Date.now();
  const days = [0, 1, 2].map((d) => {
    const x = new Date(now + d * 86400_000);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  });
  const dayOf = (t: number) => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const day = dayOf(at);
  const slots: number[] = [];
  for (let h = 7; h <= 21; h += 0.5) {
    const t = day + h * 3600_000;
    if (t >= firstSlot(now)) slots.push(t);
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2">
        {days.map((d) => (
          <Chip
            key={d}
            active={d === day}
            onClick={() => {
              const keep = new Date(at);
              const n = new Date(d);
              n.setHours(keep.getHours(), keep.getMinutes());
              onChange(Math.max(n.getTime(), firstSlot(now)));
            }}
          >
            {dayLabel(d)}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {slots.map((t) => (
          <Chip key={t} active={Math.abs(t - at) < 60_000} onClick={() => onChange(t)} className="tabular-nums">
            {hhmm(t)}
          </Chip>
        ))}
        {!slots.length && <span className="text-[14px] text-[#6b6b6b] py-2">No more slots today — pick another day.</span>}
      </div>
    </div>
  );
}
