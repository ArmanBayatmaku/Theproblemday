// Prices for people (not businesses): every delivery provider plus rides and drone shoots.
// Deliveries reuse the platform's quote engine; the consumer extras sit on top.
import type { Asset, JobDraft, LngLat, Pos3, PriceLine, PricingContext, QuoteOption, Weather } from '@shared/types';
import { quoteAll } from '@shared/pricing';
import { approxRoadRoute, roadSpeedKmh } from '@shared/routing';
import { distanceM, pointInZone } from '@shared/geo';
import { DEMO_ZONES, LANDMARKS } from '@shared/data/london';
import { droneFlyability } from '@shared/weather';
import { DEFAULT_COSTS } from '@shared/costs';
import { SEED_SITES, seedAssets } from '@/data/seed';
import { MOVE_ITEMS, sizeById } from './services';
import type { Mode, Option, OrderForm } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const total = (lines: PriceLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));
const BOOKING_FEE: PriceLine = { label: 'Booking fee', amount: 0.79 };
const WAYMO_AREA = { center: [-0.12, 51.505] as LngLat, radiusM: 10500 };

export const MODE_TEXT: Record<Mode, { title: string; provider: string; tagline: string }> = {
  drone: { title: 'Drone', provider: 'Hive Air', tagline: 'Fastest for small things · lowered to the door' },
  waymo: { title: 'Waymo', provider: 'Waymo', tagline: 'Driverless car · pop it in the boot' },
  courier: { title: 'Courier', provider: 'Uber', tagline: 'A driver picks it up from you' },
  bike: { title: 'Cargo bike', provider: 'CityHop', tagline: 'Zero emissions · great for short hops' },
  van: { title: 'Van', provider: 'Thames Express', tagline: 'For big or heavy things' },
  ride_waymo: { title: 'Waymo', provider: 'Waymo', tagline: 'Driverless · up to 4 people' },
  ride_uber: { title: 'Uber', provider: 'Uber', tagline: 'Affordable rides · up to 4 people' },
  ride_xl: { title: 'Uber XL', provider: 'Uber', tagline: 'Up to 6 people or big bags' },
  aerial: { title: 'Drone + pilot', provider: 'Hive Air', tagline: 'Photos and a short video by a licensed pilot' },
  aerial_pro: { title: 'Drone pro', provider: 'Hive Air', tagline: '4K film, edited and sent the next day' },
};

const PROVIDER_MODE: Record<string, Mode> = { 'hive-air': 'drone', waymo: 'waymo', 'uber-courier': 'courier', cityhop: 'bike', 'thames-express': 'van' };
const BADGE: Record<string, string> = { cheapest: 'Cheapest', fastest: 'Fastest', greenest: 'Greenest', recommended: 'Best pick' };

let cache: { at: number; assets: Asset[] } | null = null;
/** Hive's network drones and marketplace vehicles — a person has no fleet of their own. */
function marketAssets(now: number): Asset[] {
  if (!cache || now - cache.at > 10 * 60_000) cache = { at: now, assets: seedAssets(now).filter((a) => a.ownership !== 'own') };
  return cache.assets;
}
export const nearbyVehicles = () => marketAssets(Date.now());

export function consumerContext(weather: Weather): PricingContext {
  const now = Date.now();
  return { now, weather, zones: DEMO_ZONES, landmarks: LANDMARKS, assets: marketAssets(now), sites: SEED_SITES.filter((s) => s.kind === 'drone_port'), costs: DEFAULT_COSTS };
}

const toLngLat = (path?: Pos3[]): LngLat[] => (path ?? []).map((p) => [p[0], p[1]] as LngLat);

function fromQuote(q: QuoteOption): Option {
  const mode = PROVIDER_MODE[q.providerId] ?? 'courier';
  const t = MODE_TEXT[mode];
  const breakdown = [...q.breakdown, BOOKING_FEE];
  const price = total(breakdown);
  return {
    id: q.id,
    mode,
    title: t.title,
    provider: t.provider,
    tagline: t.tagline,
    price,
    youPay: price,
    etaPickupMin: Math.max(2, Math.round(q.pickupEtaMin)),
    durationMin: Math.max(2, Math.round(q.durationMin)),
    available: q.available,
    reason: q.reasons[0],
    badges: q.badges.filter((b) => b !== 'your_fleet').map((b) => BADGE[b]).filter(Boolean),
    co2g: q.co2g,
    route: toLngLat(q.route),
    breakdown,
    notes: q.notes.filter((n) => !/Simulated quote/.test(n)),
    simulated: q.simulated,
  };
}

function withExtra(o: Option, lines: PriceLine[]): Option {
  if (!lines.length) return o;
  const breakdown = [...o.breakdown, ...lines];
  const price = total(breakdown);
  return { ...o, breakdown, price, youPay: price };
}

function deliveryDraft(f: OrderForm, weightKg: number, size: JobDraft['cargo']['size']): JobDraft {
  return {
    pickup: f.from,
    dropoff: f.to,
    cargo: { description: f.itemNote || f.itemKind, weightKg, quantity: 1, size, fragile: f.fragile, valueGbp: f.value },
    timing: f.when.mode === 'now' ? { mode: 'now' } : { mode: 'scheduled', at: new Date(f.when.at).toISOString() },
    priority: 'balanced',
  };
}

function quoteDelivery(f: OrderForm, ctx: PricingContext): Option[] {
  const size = sizeById(f.size);
  const quotes = quoteAll(deliveryDraft(f, size.kg, size.cargo), ctx).filter((q) => q.category !== 'own_fleet');
  return quotes.map((q) => {
    let o = fromQuote(q);
    const extra: PriceLine[] = [];
    if (f.service === 'collect' && f.checkFirst) extra.push({ label: 'Photo check at the seller', amount: 1 });
    if (f.service === 'return' && f.printLabel) extra.push({ label: 'We print your label', amount: 0.5 });
    if (f.service === 'errand' && f.buyForMe) extra.push({ label: 'We buy it for you', amount: 1.5 });
    o = withExtra(o, extra);
    if (f.service === 'sold' && f.buyerPays) o = { ...o, youPay: 0, notes: ['Your buyer gets a link to pay for delivery', ...o.notes] };
    if (f.service === 'errand' && f.buyForMe) o = { ...o, notes: [`Plus what it costs (up to £${f.budget}), paid back from the receipt`, ...o.notes] };
    return o;
  });
}

function quoteMove(f: OrderForm, ctx: PricingContext): Option[] {
  const items = MOVE_ITEMS.filter((m) => (f.moveItems[m.id] ?? 0) > 0);
  const kg = Math.max(5, items.reduce((s, m) => s + m.kg * (f.moveItems[m.id] ?? 0), 0));
  const big = items.some((m) => m.big);
  const draft = deliveryDraft({ ...f, itemNote: items.map((m) => `${f.moveItems[m.id]} × ${m.label}`).join(', ') }, kg, big ? 'pallet' : 'large');
  return quoteAll(draft, ctx)
    .filter((q) => q.category !== 'own_fleet')
    .map((q) => {
      let o = fromQuote(q);
      if (o.mode === 'van') {
        const extra: PriceLine[] = [];
        if (f.helpers) extra.push({ label: `${f.helpers} helper${f.helpers > 1 ? 's' : ''}`, amount: f.helpers * 24 });
        if (f.stairs) extra.push({ label: `Stairs · ${f.stairs} floor${f.stairs > 1 ? 's' : ''}, no lift`, amount: f.stairs * 6 });
        o = withExtra(o, extra);
        o = { ...o, tagline: f.helpers ? `Van and ${f.helpers} helper${f.helpers > 1 ? 's' : ''} · they do the lifting` : 'Van · you load, the driver helps with light things', badges: o.available ? ['Best pick'] : [] };
      } else if (o.available && (f.helpers || f.stairs)) {
        o = { ...o, available: false, reason: 'No helpers with this option — pick the van' };
      }
      return o;
    })
    .sort((a, b) => Number(b.available) - Number(a.available));
}

function quoteRide(f: OrderForm, now: number): Option[] {
  if (!f.from || !f.to) return [];
  const road = approxRoadRoute(f.from.position, f.to.position);
  const km = road.distanceKm;
  const mins = (km / roadSpeedKmh(f.from.position, f.to.position, new Date(now))) * 60 + 2;
  const inArea = (p: LngLat) => distanceM(p, WAYMO_AREA.center) <= WAYMO_AREA.radiusM;
  const make = (mode: Mode, baseFare: number, perKm: number, perMin: number, min: number, eta: number, seats: number): Option => {
    const breakdown: PriceLine[] = [
      { label: 'Base fare', amount: baseFare },
      { label: `${km.toFixed(1)} km`, amount: round2(km * perKm) },
      { label: `${Math.round(mins)} min`, amount: round2(mins * perMin) },
    ];
    let price = total(breakdown);
    if (price < min) {
      breakdown.push({ label: 'Minimum fare top-up', amount: round2(min - price) });
      price = min;
    }
    breakdown.push(BOOKING_FEE);
    price = total(breakdown);
    let reason: string | undefined;
    if (f.passengers > seats) reason = `Seats ${seats} — you need ${f.passengers}`;
    if (mode === 'ride_waymo' && (!inArea(f.from!.position) || !inArea(f.to!.position))) reason = 'Outside Waymo’s (simulated) service area';
    const t = MODE_TEXT[mode];
    return {
      id: mode,
      mode,
      title: t.title,
      provider: t.provider,
      tagline: t.tagline,
      price,
      youPay: price,
      etaPickupMin: eta,
      durationMin: Math.round(mins),
      available: !reason,
      reason,
      badges: [],
      co2g: Math.round(km * (mode === 'ride_waymo' ? 45 : 120)),
      route: road.path.map((p) => [p[0], p[1]] as LngLat),
      breakdown,
      notes: mode === 'ride_waymo' ? ['No driver — unlock with the app when it arrives'] : [],
      simulated: true,
    };
  };
  const out = [make('ride_waymo', 3, 1.3, 0.25, 6.5, 5, 4), make('ride_uber', 2.5, 1.15, 0.2, 6, 3, 4), make('ride_xl', 4, 1.6, 0.28, 9, 7, 6)];
  const avail = out.filter((o) => o.available);
  const cheapest = avail.slice().sort((a, b) => a.price - b.price)[0];
  const fastest = avail.slice().sort((a, b) => a.etaPickupMin - b.etaPickupMin)[0];
  if (cheapest) cheapest.badges.push('Cheapest');
  if (fastest && fastest !== cheapest) fastest.badges.push('Fastest');
  return out.sort((a, b) => Number(b.available) - Number(a.available));
}

function quoteAerial(f: OrderForm, weather: Weather): Option[] {
  const place = f.to ?? f.from;
  if (!place) return [];
  const zone = DEMO_ZONES.find((z) => z.active && pointInZone(place.position, z));
  const fly = droneFlyability(weather, { maxWindMs: 12, ipRating: 'IP55', tempMinC: -10, tempMaxC: 40 });
  const ports = SEED_SITES.filter((s) => s.kind === 'drone_port');
  const portKm = Math.min(...ports.map((p) => distanceM(p.position, place.position))) / 1000;
  const base: Record<number, number> = { 15: 29, 30: 49, 60: 89 };
  const make = (mode: Mode, extra: number): Option => {
    const breakdown: PriceLine[] = [{ label: `${f.aerialMinutes} min flight with a pilot`, amount: base[f.aerialMinutes] }];
    if (extra) breakdown.push({ label: '4K film, edited', amount: extra });
    breakdown.push(BOOKING_FEE);
    const price = total(breakdown);
    let reason: string | undefined;
    if (zone) reason = `Inside ${zone.name} — needs a permission first (3–5 working days)`;
    else if (fly.status === 'no_go' && f.when.mode === 'now') reason = 'Too windy to fly right now — pick a later time';
    const t = MODE_TEXT[mode];
    return {
      id: mode,
      mode,
      title: t.title,
      provider: t.provider,
      tagline: t.tagline,
      price,
      youPay: price,
      etaPickupMin: Math.max(12, Math.round(8 + (portKm / 55) * 60)),
      durationMin: f.aerialMinutes,
      available: !reason,
      reason,
      badges: mode === 'aerial' ? ['Best pick'] : [],
      co2g: Math.round(portKm * 16),
      route: [place.position],
      breakdown,
      notes: [
        'Flown by an approved remote pilot; we check airspace and weather first',
        ...(fly.status === 'caution' ? [`Weather: ${fly.reasons[0] ?? 'gusty'} — we may shorten the flight`] : []),
      ],
      simulated: false,
    };
  };
  return [make('aerial', 0), make('aerial_pro', 40)];
}

export function quoteForm(f: OrderForm, weather: Weather): Option[] {
  const ctx = consumerContext(weather);
  if (f.service === 'ride') return quoteRide(f, ctx.now);
  if (f.service === 'aerial') return quoteAerial(f, weather);
  if (!f.from || !f.to) return [];
  if (f.service === 'move') return quoteMove(f, ctx);
  return quoteDelivery(f, ctx);
}

export function formReady(f: OrderForm): string | undefined {
  if (f.service === 'aerial') return f.to ? undefined : 'Choose where to fly';
  if (!f.from) return f.service === 'collect' ? 'Add the seller’s address' : f.service === 'errand' ? 'Where should we pick it up?' : 'Add a pickup';
  if (!f.to) return f.service === 'sold' ? 'Add your buyer’s address' : f.service === 'ride' ? 'Where are you going?' : 'Add a drop-off';
  if (f.service === 'move' && !Object.values(f.moveItems).some((n) => (n ?? 0) > 0)) return 'Add what you’re moving';
  if (f.service === 'errand' && !f.errandText.trim()) return 'Tell us what to pick up';
  return undefined;
}
