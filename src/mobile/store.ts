import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Place, Weather } from '@shared/types';
import { LONDON_PLACES } from '@shared/data/london';
import { simulatedWeather } from '@shared/weather';
import { newForm } from './services';
import { advance, createOrder, skip } from './orders';
import type { Option, Order, OrderForm, ServiceId } from './types';

const place = (name: string, label?: string): Place => {
  const p = LONDON_PLACES.find((x) => x.name === name)!;
  return { name: label ?? p.name, position: p.position, address: p.name };
};

export const DEFAULT_HOME = place('Camden', 'Home');
export const DEFAULT_WORK = place('Shoreditch', 'Work');

interface State {
  name: string;
  home: Place;
  work: Place;
  payment: 'visa' | 'apple';
  later: boolean;
  orders: Order[];
  recents: Place[];
  // not persisted
  draft?: OrderForm;
  photo?: string;
  weather?: Weather;
}

interface Actions {
  startDraft: (service: ServiceId, prefill?: Partial<OrderForm>) => void;
  setDraft: (patch: Partial<OrderForm>) => void;
  setPhoto: (dataUrl?: string) => void;
  setWeather: (w?: Weather) => void;
  setLater: (v: boolean) => void;
  setPayment: (p: State['payment']) => void;
  setPlace: (which: 'home' | 'work', p: Place) => void;
  remember: (p: Place) => void;
  book: (option: Option) => Order | undefined;
  tick: () => void;
  skip: (id: string) => void;
  cancel: (id: string) => void;
  approveCheck: (id: string, ok: boolean) => void;
  rate: (id: string, stars: number, tip?: number) => void;
  clearHistory: () => void;
}

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => ({
      name: 'Arman',
      home: DEFAULT_HOME,
      work: DEFAULT_WORK,
      payment: 'visa',
      later: false,
      orders: [],
      recents: [],

      startDraft: (service, prefill) => set({ draft: { ...newForm(service, get().home, get().later), ...prefill }, photo: undefined }),
      setDraft: (patch) => {
        const d = get().draft;
        if (d) set({ draft: { ...d, ...patch } });
      },
      setPhoto: (photo) => set({ photo }),
      setWeather: (weather) => set({ weather }),
      setLater: (later) => set({ later }),
      setPayment: (payment) => set({ payment }),
      setPlace: (which, p) => set({ [which]: { ...p, name: which === 'home' ? 'Home' : 'Work', address: p.address ?? p.name } } as Partial<State>),
      remember: (p) => {
        if (p.name === 'Home' || p.name === 'Work') return;
        set({ recents: [p, ...get().recents.filter((r) => r.name !== p.name)].slice(0, 6) });
      },
      book: (option) => {
        const d = get().draft;
        if (!d) return undefined;
        const order = createOrder(d, option);
        set({ orders: [order, ...get().orders].slice(0, 30) });
        if (d.from) get().remember(d.from);
        if (d.to) get().remember(d.to);
        return order;
      },
      tick: () => {
        const now = Date.now();
        let changed = false;
        const orders = get().orders.map((o) => {
          const p = advance(o, now);
          if (!p) return o;
          changed = true;
          return { ...o, ...p };
        });
        if (changed) set({ orders });
      },
      skip: (id) => {
        const now = Date.now();
        set({ orders: get().orders.map((o) => (o.id === id ? { ...o, ...(skip(o, now) ?? {}) } : o)) });
      },
      cancel: (id) => set({ orders: get().orders.map((o) => (o.id === id ? { ...o, phase: 'cancelled', phaseStartedAt: Date.now() } : o)) }),
      approveCheck: (id, ok) =>
        set({
          orders: get().orders.map((o) => (o.id === id ? { ...o, checkApproved: ok, phase: ok ? 'to_dropoff' : 'cancelled', phaseStartedAt: Date.now() } : o)),
        }),
      rate: (id, stars, tip) => set({ orders: get().orders.map((o) => (o.id === id ? { ...o, rating: stars, tip } : o)) }),
      clearHistory: () => set({ orders: get().orders.filter((o) => !['done', 'cancelled'].includes(o.phase)) }),
    }),
    {
      name: 'hive-mobile-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ name: s.name, home: s.home, work: s.work, payment: s.payment, later: s.later, orders: s.orders, recents: s.recents }),
    },
  ),
);

export const currentWeather = () => useApp.getState().weather ?? simulatedWeather(Date.now(), 'live');
