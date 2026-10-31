import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info, OctagonX } from 'lucide-react';

type Tone = 'info' | 'success' | 'warning' | 'danger';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

const useToasts = create<{ items: Toast[]; push: (tone: Tone, text: string) => void; drop: (id: number) => void }>((set, get) => ({
  items: [],
  push: (tone, text) => {
    const id = Date.now() + Math.random();
    set({ items: [...get().items, { id, tone, text }].slice(-4) });
    setTimeout(() => get().drop(id), 4200);
  },
  drop: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

const join = (t: string, sub?: string) => (sub ? `${t} — ${sub}` : t);
export const toast = {
  info: (t: string, sub?: string) => useToasts.getState().push('info', join(t, sub)),
  success: (t: string, sub?: string) => useToasts.getState().push('success', join(t, sub)),
  warning: (t: string, sub?: string) => useToasts.getState().push('warning', join(t, sub)),
  danger: (t: string, sub?: string) => useToasts.getState().push('danger', join(t, sub)),
};

const ICON = { info: Info, success: CircleCheck, warning: CircleAlert, danger: OctagonX };
const COLOR = { info: '#5a9bf0', success: '#8bd450', warning: '#f0a33a', danger: '#ec5b5b' };

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-[360px]">
      {items.map((t) => {
        const I = ICON[t.tone];
        return (
          <div key={t.id} className="card fade-in flex items-start gap-2.5 px-3.5 py-3 shadow-xl" style={{ borderColor: `${COLOR[t.tone]}55` }}>
            <I size={17} style={{ color: COLOR[t.tone] }} className="mt-0.5 shrink-0" />
            <div className="text-[13px] leading-snug">{t.text}</div>
          </div>
        );
      })}
    </div>
  );
}
