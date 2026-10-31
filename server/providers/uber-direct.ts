// Uber Direct (delivery-as-a-service) adapter.
//
// NOT ACTIVE YET: the app shows simulated Uber quotes until UBER_DIRECT_CLIENT_ID,
// UBER_DIRECT_CLIENT_SECRET and UBER_DIRECT_CUSTOMER_ID are set. The calls below follow the public
// Uber Direct docs (https://developer.uber.com/docs/deliveries/get-started) — OAuth client
// credentials with the `eats.deliveries` scope, then JSON calls under /v1/customers/{customer_id}.
// Uber may require account approval before production access. Check field names against the docs
// for your account before going live.
import { NotConnectedError, type BookRequest, type ProviderAdapter, type ProviderBooking, type ProviderQuote, type QuoteRequest } from './types';

const AUTH_URL = 'https://auth.uber.com/oauth/v2/token';
const API = 'https://api.uber.com/v1';

let token: { value: string; expiresAt: number } | null = null;

const env = () => ({
  clientId: process.env.UBER_DIRECT_CLIENT_ID,
  clientSecret: process.env.UBER_DIRECT_CLIENT_SECRET,
  customerId: process.env.UBER_DIRECT_CUSTOMER_ID,
});

async function accessToken(): Promise<string> {
  const { clientId, clientSecret } = env();
  if (!clientId || !clientSecret) throw new NotConnectedError('uber-courier', 'set UBER_DIRECT_CLIENT_ID and UBER_DIRECT_CLIENT_SECRET');
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'eats.deliveries' }),
  });
  if (!res.ok) throw new Error(`Uber auth failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const { customerId } = env();
  if (!customerId) throw new NotConnectedError('uber-courier', 'set UBER_DIRECT_CUSTOMER_ID');
  const res = await fetch(`${API}/customers/${customerId}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Uber Direct ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const address = (s: QuoteRequest['pickup']) => JSON.stringify({ street_address: [s.address ?? s.name], city: 'London', country: 'GB' });

const mapStatus = (s: string): ProviderBooking['status'] =>
  s === 'pickup' ? 'pickup' : s === 'dropoff' ? 'dropoff' : s === 'delivered' ? 'delivered' : s === 'canceled' ? 'cancelled' : s === 'returned' ? 'returned' : 'pending';

export const uberDirect: ProviderAdapter = {
  id: 'uber-courier',
  name: 'Uber Direct',
  env: ['UBER_DIRECT_CLIENT_ID', 'UBER_DIRECT_CLIENT_SECRET', 'UBER_DIRECT_CUSTOMER_ID'],
  configured: () => Object.values(env()).every(Boolean),

  async quote(req: QuoteRequest): Promise<ProviderQuote> {
    const q = await call<{ id: string; fee: number; currency: string; duration: number; pickup_duration: number; dropoff_eta: string; expires: string }>('/delivery_quotes', {
      pickup_address: address(req.pickup),
      dropoff_address: address(req.dropoff),
      pickup_latitude: req.pickup.lat,
      pickup_longitude: req.pickup.lng,
      dropoff_latitude: req.dropoff.lat,
      dropoff_longitude: req.dropoff.lng,
      pickup_ready_dt: req.pickupReadyAt,
      dropoff_deadline_dt: req.dropoffDeadline,
      manifest_total_value: req.valueGbp ? Math.round(req.valueGbp * 100) : undefined,
      external_store_id: req.reference,
    });
    // `fee` is in the minor unit (pence).
    return { providerId: 'uber-courier', quoteId: q.id, priceGbp: q.fee / 100, pickupEtaMin: q.pickup_duration, dropoffEta: q.dropoff_eta, expiresAt: q.expires, raw: q };
  },

  async book(req: BookRequest): Promise<ProviderBooking> {
    const d = await call<{ id: string; status: string; tracking_url?: string; courier?: { name?: string; vehicle_type?: string; location?: { lat: number; lng: number } } }>('/deliveries', {
      quote_id: req.quoteId,
      pickup_name: req.pickup.name,
      pickup_address: address(req.pickup),
      pickup_phone_number: req.pickup.phone,
      pickup_notes: req.pickup.notes,
      dropoff_name: req.dropoff.name,
      dropoff_address: address(req.dropoff),
      dropoff_phone_number: req.dropoff.phone,
      dropoff_notes: req.dropoff.notes,
      manifest_items: [{ name: req.reference ?? 'Delivery', quantity: req.quantity, weight: Math.round(req.weightKg * 1000), size: req.size === 'envelope' ? 'small' : req.size === 'pallet' ? 'xlarge' : req.size }],
      external_id: req.idempotencyKey,
    });
    return {
      providerId: 'uber-courier',
      bookingId: d.id,
      status: mapStatus(d.status),
      trackingUrl: d.tracking_url,
      courier: d.courier ? { name: d.courier.name, vehicle: d.courier.vehicle_type, lat: d.courier.location?.lat, lng: d.courier.location?.lng } : undefined,
      raw: d,
    };
  },

  async cancel(bookingId: string) {
    await call(`/deliveries/${bookingId}/cancel`, {});
  },

  async status(bookingId: string): Promise<ProviderBooking> {
    const d = await call<{ id: string; status: string; tracking_url?: string }>(`/deliveries/${bookingId}`, undefined, 'GET');
    return { providerId: 'uber-courier', bookingId: d.id, status: mapStatus(d.status), trackingUrl: d.tracking_url, raw: d };
  },
};
