import type { Recurrence, Timing, Weekday } from './types';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** JS getDay() (0 = Sunday) → our Weekday (0 = Monday). */
export const toWeekday = (d: Date): Weekday => (((d.getDay() + 6) % 7) as Weekday);

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function withTime(day: Date, time: string): number {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/** Next occurrence of a recurring rule at or after `after`. */
export function nextOccurrence(rule: Recurrence, startAt: number, after: number): number | undefined {
  const until = rule.until ? new Date(rule.until).getTime() : Infinity;
  const time = rule.time ?? hhmm(startAt);
  const interval = Math.max(1, rule.interval || 1);
  const from = Math.max(after, startAt);

  if (rule.freq === 'hourly') {
    const step = interval * 3600_000;
    const k = Math.max(0, Math.ceil((from - startAt) / step));
    const t = startAt + k * step;
    return t <= until ? t : undefined;
  }

  const startDay = new Date(startAt);
  startDay.setHours(0, 0, 0, 0);
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 800; i++) {
    const day = new Date(cursor.getTime() + i * 86400_000);
    const t = withTime(day, time);
    if (t < from) continue;
    if (t > until) return undefined;
    const daysSince = Math.round((day.getTime() - startDay.getTime()) / 86400_000);
    if (rule.freq === 'daily') {
      if (daysSince % interval === 0) return t;
    } else if (rule.freq === 'weekly') {
      const wd = toWeekday(day);
      const days = rule.byWeekday?.length ? rule.byWeekday : [toWeekday(new Date(startAt))];
      const weeks = Math.floor(daysSince / 7);
      if (days.includes(wd) && weeks % interval === 0) return t;
    } else if (rule.freq === 'monthly') {
      const months = (day.getFullYear() - startDay.getFullYear()) * 12 + day.getMonth() - startDay.getMonth();
      if (day.getDate() === new Date(startAt).getDate() && months % interval === 0) return t;
    }
  }
  return undefined;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function describeRecurrence(rule: Recurrence, startAt?: number): string {
  const time = rule.time ?? (startAt ? hhmm(startAt) : '09:00');
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : 'Every ';
  switch (rule.freq) {
    case 'hourly':
      return rule.interval > 1 ? `Every ${rule.interval} hours` : 'Every hour';
    case 'daily':
      return rule.interval > 1 ? `${every}days at ${time}` : `Every day at ${time}`;
    case 'weekly': {
      const days = rule.byWeekday ?? [];
      if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d as Weekday))) return `Every weekday at ${time}`;
      if (days.length === 7) return `Every day at ${time}`;
      const names = days.map((d) => WEEKDAYS_LONG[d]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? 'week';
      return `${rule.interval > 1 ? `Every ${rule.interval} weeks on` : 'Every'} ${list} at ${time}`;
    }
    case 'monthly':
      return `Monthly on the ${ordinal(new Date(startAt ?? Date.now()).getDate())} at ${time}`;
  }
}

export function formatWhen(t: number, now: number): string {
  const d = new Date(t);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(now + 86400_000).toDateString() === d.toDateString();
  if (sameDay) return `Today ${hhmm(t)}`;
  if (tomorrow) return `Tomorrow ${hhmm(t)}`;
  return `${WEEKDAYS[toWeekday(d)]} ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${hhmm(t)}`;
}

export function timingStart(timing: Timing, now: number): number {
  if (timing.mode === 'now') return now;
  if (timing.mode === 'scheduled') return new Date(timing.at).getTime();
  return nextOccurrence(timing.rule, new Date(timing.startAt).getTime(), now) ?? new Date(timing.startAt).getTime();
}

export function describeTiming(timing: Timing, now: number): string {
  if (timing.mode === 'now') return 'Now (ASAP)';
  if (timing.mode === 'scheduled') return formatWhen(new Date(timing.at).getTime(), now);
  return describeRecurrence(timing.rule, new Date(timing.startAt).getTime());
}

export const toLocalInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
