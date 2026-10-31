import type { Place } from '@shared/types';
import { LONDON_PLACES } from '@shared/data/london';
import { destination, distanceM } from '@shared/geo';
import type { AerialPurpose, MoveItem, OrderForm, ReturnPoint, ServiceId, SizeId } from './types';

export interface ServiceInfo {
  id: ServiceId;
  title: string;
  blurb: string;
  headline: string;
  badge?: string;
  fromLabel: string;
  toLabel: string;
  fromHome?: boolean;
  toHome?: boolean;
  /** Only one place (drone shoot). */
  single?: boolean;
  item: boolean;
}

export const SERVICES: ServiceInfo[] = [
  { id: 'send', title: 'Send', blurb: 'Get something to anyone in London, often within the hour.', headline: 'Send something', fromLabel: 'Pickup', toLabel: 'Drop-off', fromHome: true, item: true },
  { id: 'sold', title: 'Sold it?', badge: 'New', blurb: 'Sold something online? We collect from your door and take it to the buyer. No post office.', headline: 'Sold it? We’ll deliver it', fromLabel: 'Collect from', toLabel: 'Buyer’s address', fromHome: true, item: true },
  { id: 'collect', title: 'Collect', blurb: 'Bought something secondhand? We pick it up from the seller and bring it to you.', headline: 'Collect from a seller', fromLabel: 'Seller’s address', toLabel: 'Bring it to', toHome: true, item: true },
  { id: 'return', title: 'Return', blurb: 'Return an online order without the queue. We drop it off for you.', headline: 'Return a parcel', fromLabel: 'Collect from', toLabel: 'Drop it at', fromHome: true, item: true },
  { id: 'errand', title: 'Errand', blurb: 'Keys, a prescription, a forgotten charger: we pick it up.', headline: 'Pick something up', fromLabel: 'Pick up from', toLabel: 'Bring it to', toHome: true, item: true },
  { id: 'move', title: 'Move', blurb: 'A sofa, a bike or a few boxes. A van, and helpers if you want them.', headline: 'Move something big', fromLabel: 'From', toLabel: 'To', fromHome: true, item: false },
  { id: 'ride', title: 'Ride', blurb: 'Go yourself: a driverless Waymo or a car with a driver.', headline: 'Get a ride', fromLabel: 'Pickup', toLabel: 'Where to?', fromHome: true, item: false },
  { id: 'aerial', title: 'Drone shot', blurb: 'Aerial photos, a short film or a roof check by a licensed pilot.', headline: 'Book a drone shoot', fromLabel: '', toLabel: 'Where?', toHome: true, single: true, item: false },
];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];

export const ITEM_KINDS = ['Clothes', 'Shoes', 'Electronics', 'Books', 'Homeware', 'Toys & games', 'Documents', 'Other'];

export const SIZES: { id: SizeId; label: string; hint: string; kg: number; cargo: 'envelope' | 'small' | 'medium' | 'large' }[] = [
  { id: 'pocket', label: 'Pocket', hint: 'Keys, phone, papers', kg: 0.3, cargo: 'envelope' },
  { id: 'shoebox', label: 'Shoebox', hint: 'Shoes, clothes, a book', kg: 2, cargo: 'small' },
  { id: 'suitcase', label: 'Suitcase', hint: 'Lamp, console, a few things', kg: 9, cargo: 'medium' },
  { id: 'bulky', label: 'Bulky', hint: 'Chair, bike, TV', kg: 22, cargo: 'large' },
];
export const sizeById = (id: SizeId) => SIZES.find((s) => s.id === id) ?? SIZES[1];

export const MOVE_ITEMS: { id: MoveItem; label: string; kg: number; big: boolean }[] = [
  { id: 'sofa', label: 'Sofa', kg: 55, big: true },
  { id: 'armchair', label: 'Armchair', kg: 25, big: true },
  { id: 'bed', label: 'Bed frame', kg: 45, big: true },
  { id: 'wardrobe', label: 'Wardrobe', kg: 60, big: true },
  { id: 'fridge', label: 'Fridge', kg: 55, big: true },
  { id: 'desk', label: 'Desk', kg: 30, big: true },
  { id: 'bike', label: 'Bike', kg: 14, big: false },
  { id: 'boxes', label: 'Boxes', kg: 9, big: false },
];

export const RETURN_POINTS: { id: ReturnPoint; label: string; hint: string; bearing: number; metres: number }[] = [
  { id: 'locker', label: 'Parcel locker', hint: 'Open 24/7 · we scan your QR code', bearing: 40, metres: 650 },
  { id: 'shop', label: 'Drop-off shop', hint: 'Shop counter for most carriers', bearing: 160, metres: 900 },
  { id: 'store', label: 'Retailer’s store', hint: 'Back to the shop it came from', bearing: 250, metres: 2400 },
];

export const AERIAL_PURPOSES: { id: AerialPurpose; label: string; hint: string }[] = [
  { id: 'photos', label: 'Photos of my place', hint: 'For selling or renting it' },
  { id: 'video', label: 'Film an event', hint: 'Garden party, sports day' },
  { id: 'inspection', label: 'Roof & gutter check', hint: 'See it without a ladder' },
];

export function nearestArea(p: Place['position']): string {
  return LONDON_PLACES.map((x) => ({ x, d: distanceM(x.position, p) })).sort((a, b) => a.d - b.d)[0]?.x.name ?? 'London';
}

/** A return drop-off point near the pickup. */
export function returnPlace(point: ReturnPoint, from: Place): Place {
  const r = RETURN_POINTS.find((x) => x.id === point)!;
  const position = destination(from.position, r.bearing, r.metres);
  return { name: `${r.label} · ${nearestArea(position)}`, position };
}

export function newForm(service: ServiceId, home: Place, later = false): OrderForm {
  const info = serviceById(service);
  const now = Date.now();
  const at = Math.ceil((now + 90 * 60_000) / 1_800_000) * 1_800_000;
  const form: OrderForm = {
    service,
    from: info.fromHome ? home : undefined,
    to: info.toHome ? home : undefined,
    itemKind: service === 'return' ? 'Clothes' : service === 'errand' ? 'Other' : 'Clothes',
    itemNote: '',
    size: 'shoebox',
    fragile: false,
    when: later || service === 'move' ? { mode: 'later', at } : { mode: 'now' },
    buyerPays: false,
    buyerName: '',
    checkFirst: true,
    sellerName: '',
    returnPoint: 'locker',
    printLabel: false,
    errandText: '',
    buyForMe: false,
    budget: 20,
    moveItems: { boxes: 4 },
    helpers: 1,
    stairs: 0,
    passengers: 1,
    aerialPurpose: 'photos',
    aerialMinutes: 30,
  };
  if (service === 'return') form.to = returnPlace('locker', home);
  return form;
}

/** Picks a service from free text ("sold my jacket…", "move a sofa…"). */
export function inferService(text: string): ServiceId {
  const t = text.toLowerCase();
  if (/\b(sold|sell|selling|buyer|vinted|ebay|depop|marketplace)\b/.test(t)) return 'sold';
  if (/\b(return|refund|send back)\b/.test(t)) return 'return';
  if (/\b(bought|collect|from (a|the) seller|pick (it )?up from (a|the) seller)\b/.test(t)) return 'collect';
  if (/\b(move|moving|sofa|couch|wardrobe|fridge|bed frame|furniture|van)\b/.test(t)) return 'move';
  if (/\b(ride|lift|take me|get me to|drive me|taxi|waymo to)\b/.test(t)) return 'ride';
  if (/\b(photo|photos|video|film|aerial|roof|gutter|drone shot)\b/.test(t)) return 'aerial';
  if (/\b(errand|prescription|pharmacy|keys|forgot|pick up|grab|buy me|get my)\b/.test(t)) return 'errand';
  return 'send';
}
