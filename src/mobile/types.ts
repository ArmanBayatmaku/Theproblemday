import type { LngLat, Place, PriceLine } from '@shared/types';

export type ServiceId = 'send' | 'sold' | 'collect' | 'return' | 'errand' | 'move' | 'ride' | 'aerial';

export type Mode = 'drone' | 'waymo' | 'courier' | 'bike' | 'van' | 'ride_waymo' | 'ride_uber' | 'ride_xl' | 'aerial' | 'aerial_pro';

export type SizeId = 'pocket' | 'shoebox' | 'suitcase' | 'bulky';
export type MoveItem = 'sofa' | 'armchair' | 'bed' | 'wardrobe' | 'fridge' | 'desk' | 'bike' | 'boxes';
export type ReturnPoint = 'locker' | 'shop' | 'store';
export type AerialPurpose = 'photos' | 'video' | 'inspection';

export interface OrderForm {
  service: ServiceId;
  from?: Place;
  to?: Place;
  itemKind: string;
  itemNote: string;
  size: SizeId;
  fragile: boolean;
  value?: number;
  when: { mode: 'now' } | { mode: 'later'; at: number };
  // sold it
  buyerPays: boolean;
  buyerName: string;
  // collect
  checkFirst: boolean;
  sellerName: string;
  // return
  returnPoint: ReturnPoint;
  printLabel: boolean;
  // errand
  errandText: string;
  buyForMe: boolean;
  budget: number;
  // move
  moveItems: Partial<Record<MoveItem, number>>;
  helpers: 0 | 1 | 2;
  stairs: number;
  // ride
  passengers: number;
  // drone shot
  aerialPurpose: AerialPurpose;
  aerialMinutes: 15 | 30 | 60;
}

export interface Option {
  id: string;
  mode: Mode;
  title: string;
  provider: string;
  tagline: string;
  price: number;
  /** What the user pays (differs from price when the buyer pays). */
  youPay: number;
  etaPickupMin: number;
  durationMin: number;
  available: boolean;
  reason?: string;
  badges: string[];
  co2g: number;
  route: LngLat[];
  breakdown: PriceLine[];
  notes: string[];
  simulated: boolean;
}

export type Phase = 'matching' | 'to_pickup' | 'at_pickup' | 'check' | 'to_dropoff' | 'done' | 'cancelled';

export interface Vehicle {
  name: string;
  detail: string;
  person?: string;
  rating?: number;
}

export interface Order {
  id: string;
  createdAt: number;
  service: ServiceId;
  form: OrderForm;
  option: Option;
  phase: Phase;
  phaseStartedAt: number;
  approach: LngLat[];
  trip: LngLat[];
  approachMin: number;
  tripMin: number;
  vehicle: Vehicle;
  code: string;
  completedAt?: number;
  rating?: number;
  tip?: number;
  checkApproved?: boolean;
}
