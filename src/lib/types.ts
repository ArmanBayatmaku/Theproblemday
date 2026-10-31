import type { Place, PriceLine, Pos3 } from '@shared/types';
import type { Avoided } from '@shared/routing';
import type { CollectPoint } from './collect';
import type { SizeId } from './drone';

export type When = { mode: 'now' } | { mode: 'later'; at: number };

export interface OrderForm {
  from?: Place;
  to?: Place;
  /** Lowered to the door, or left at a nearby shop for you to collect. */
  dropoff: 'door' | 'collect';
  shop?: CollectPoint;
  size: SizeId;
  /** Custom size inputs as typed (cm / kg). */
  custom: { l: string; w: string; h: string; kg: string };
  fragile: boolean;
  when: When;
}

export type Phase = 'scheduled' | 'matching' | 'to_pickup' | 'at_pickup' | 'to_dropoff' | 'done' | 'cancelled';

export interface Order {
  id: string;
  createdAt: number;
  /** When the drone sets off (now, or the scheduled time). */
  startAt: number;
  form: OrderForm;
  price: number;
  breakdown: PriceLine[];
  notes: string[];
  avoided: Avoided[];
  detourKm: number;
  distanceKm: number;
  portName: string;
  approach: Pos3[];
  trip: Pos3[];
  approachMin: number;
  tripMin: number;
  phase: Phase;
  phaseStartedAt: number;
  drone: { id: string; pilot: string };
  /** PIN shown to the person handing the parcel over. */
  pin: string;
  /** Code for collecting from the shop. */
  collectCode?: string;
  completedAt?: number;
  collectedAt?: number;
  rating?: number;
}
