import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Place, Weather } from '@shared/types';
import { LONDON_PLACES } from '@shared/data/london';
import { applyWeatherMode, simulatedWeather, type WeatherMode } from '@shared/weather';
import { advance, createOrder, skip } from './lib/orders';
import type { DroneQuote } from './lib/quotes';
import { acceptQuote, advanceRental, createRental, newRentForm, skipRental, type RentForm, type RentOption, type RentPurpose, type Rental } from './lib/rental';
import type { Order, OrderForm } from './lib/types';

const place = (name: string, label: string, address: string): Place => ({ name: label, position: LONDON_PLACES.find((x) => x.name === name)!.position, address });

export const DEFAULT_HOME = place('Camden', 'Home', 'Camden Town, NW1');
export const DEFAULT_WORK = place('Shoreditch', 'Work', 'Shoreditch, EC2A');

export const newForm = (home: Place): OrderForm => ({
  from: home,
  dropoff: 'door',
  size: 'shoebox',
  custom: { l: '', w: '', h: '', kg: '' },
  fragile: false,
  when: { mode: 'now' },
});

interface State {
  name: string;
  home: Place;
  work: Place;
  payment: 'visa' | 'apple';
  orders: Order[];
  rentals: Rental[];
  recents: Place[];
  view3d: boolean;
  weatherMode: WeatherMode;
  notifyCharging: boolean;
  // not persisted
  form: OrderForm;
  rentForm: RentForm;
  liveWeather?: Weather;
}

interface Actions {
  setForm: (patch: Partial<OrderForm>) => void;
  resetForm: () => void;
  setRentForm: (patch: Partial<RentForm>) => void;
  startRent: (purpose: RentPurpose) => void;
  bookRental: (o: RentOption) => Rental;
  acceptRentalQuote: (id: string) => void;
  skipRental: (id: string) => void;
  cancelRental: (id: string) => void;
  rateRental: (id: string, stars: number) => void;
  setPlace: (which: 'home' | 'work', p: Place) => void;
  remember: (p: Place) => void;
  book: (q: DroneQuote) => Order;
  tick: () => void;
  skip: (id: string) => void;
  cancel: (id: string) => void;
  markCollected: (id: string) => void;
  rate: (id: string, stars: number) => void;
  clearHistory: () => void;
  setPayment: (p: State['payment']) => void;
  setView3d: (v: boolean) => void;
  setWeatherMode: (m: WeatherMode) => void;
  setNotifyCharging: (v: boolean) => void;
  setLiveWeather: (w?: Weather) => void;
}

const patchOrder = (orders: Order[], id: string, p: Partial<Order>) => orders.map((o) => (o.id === id ? { ...o, ...p } : o));

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => ({
      name: 'Arman',
      home: DEFAULT_HOME,
      work: DEFAULT_WORK,
      payment: 'visa',
      orders: [],
      rentals: [],
      recents: [],
      view3d: false,
      weatherMode: 'live',
      notifyCharging: false,
      form: newForm(DEFAULT_HOME),
      rentForm: newRentForm(DEFAULT_HOME),

      setForm: (patch) => set({ form: { ...get().form, ...patch } }),
      resetForm: () => set({ form: newForm(get().home) }),
      setRentForm: (patch) => set({ rentForm: { ...get().rentForm, ...patch } }),
      startRent: (purpose) => {
        const cur = get().rentForm;
        set({ rentForm: { ...cur, purpose, place: cur.place ?? get().home } });
      },
      bookRental: (o) => {
        const { rentForm } = get();
        const r = createRental(rentForm, o, Date.now());
        set({ rentals: [r, ...get().rentals].slice(0, 40) });
        if (rentForm.place) get().remember(rentForm.place);
        return r;
      },
      acceptRentalQuote: (id) => set({ rentals: get().rentals.map((r) => (r.id === id ? { ...r, ...acceptQuote(r, Date.now()) } : r)) }),
      skipRental: (id) => {
        const r = get().rentals.find((x) => x.id === id);
        const p = r && skipRental(r, Date.now());
        if (p) set({ rentals: get().rentals.map((x) => (x.id === id ? { ...x, ...p } : x)) });
      },
      cancelRental: (id) => set({ rentals: get().rentals.map((r) => (r.id === id ? { ...r, phase: 'cancelled' as const, phaseStartedAt: Date.now() } : r)) }),
      rateRental: (id, stars) => set({ rentals: get().rentals.map((r) => (r.id === id ? { ...r, rating: stars } : r)) }),
      setPlace: (which, p) => {
        const named = { ...p, name: which === 'home' ? 'Home' : 'Work', address: p.address && p.address !== 'London' ? p.address : p.name };
        const form = get().form;
        set({ [which]: named, ...(which === 'home' && form.from?.name === 'Home' ? { form: { ...form, from: named } } : {}) } as Partial<State>);
      },
      remember: (p) => {
        if (p.name === 'Home' || p.name === 'Work' || p.name === 'Current location') return;
        set({ recents: [p, ...get().recents.filter((r) => r.name !== p.name)].slice(0, 6) });
      },
      book: (q) => {
        const { form } = get();
        const order = createOrder(form, q, Date.now());
        set({ orders: [order, ...get().orders].slice(0, 40) });
        if (form.from) get().remember(form.from);
        if (form.to) get().remember(form.to);
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
        let rchanged = false;
        const rentals = get().rentals.map((r) => {
          const p = advanceRental(r, now);
          if (!p) return r;
          rchanged = true;
          return { ...r, ...p };
        });
        if (changed || rchanged) set({ ...(changed ? { orders } : {}), ...(rchanged ? { rentals } : {}) });
      },
      skip: (id) => {
        const o = get().orders.find((x) => x.id === id);
        const p = o && skip(o, Date.now());
        if (p) set({ orders: patchOrder(get().orders, id, p) });
      },
      cancel: (id) => set({ orders: patchOrder(get().orders, id, { phase: 'cancelled', phaseStartedAt: Date.now() }) }),
      markCollected: (id) => set({ orders: patchOrder(get().orders, id, { collectedAt: Date.now() }) }),
      rate: (id, stars) => set({ orders: patchOrder(get().orders, id, { rating: stars }) }),
      clearHistory: () =>
        set({
          orders: get().orders.filter((o) => o.phase !== 'done' && o.phase !== 'cancelled'),
          rentals: get().rentals.filter((r) => r.phase !== 'done' && r.phase !== 'cancelled'),
        }),
      setPayment: (payment) => set({ payment }),
      setView3d: (view3d) => set({ view3d }),
      setWeatherMode: (weatherMode) => set({ weatherMode }),
      setNotifyCharging: (notifyCharging) => set({ notifyCharging }),
      setLiveWeather: (liveWeather) => set({ liveWeather }),
    }),
    {
      // Storage key kept from the app's earlier name so saved demo bookings survive the rename.
      name: 'hive-app-v2',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ name: s.name, home: s.home, work: s.work, payment: s.payment, orders: s.orders, rentals: s.rentals, recents: s.recents, view3d: s.view3d, weatherMode: s.weatherMode, notifyCharging: s.notifyCharging }),
      onRehydrateStorage: () => (s) => {
        if (s) {
          s.form = newForm(s.home);
          s.rentForm = newRentForm(s.home);
          s.rentals = s.rentals ?? [];
        }
      },
    },
  ),
);

export function currentWeather(live: Weather | undefined, mode: WeatherMode): Weather {
  const base = live ?? simulatedWeather(Date.now(), 'live');
  return mode === 'live' ? base : applyWeatherMode(base, mode);
}

/** Flying conditions now: live London weather (or a simulation offline), with the demo override applied. */
export function useWeather(): Weather {
  const live = useApp((s) => s.liveWeather);
  const mode = useApp((s) => s.weatherMode);
  const bucket = Math.floor(Date.now() / 300_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => currentWeather(live, mode), [live, mode, bucket]);
}
