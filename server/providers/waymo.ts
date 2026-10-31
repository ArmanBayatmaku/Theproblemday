// Waymo adapter — placeholder.
//
// Waymo does not publish a self-serve delivery API. Its London service is a ride-hailing launch,
// and in the US its delivery work has run through partners. A real connection here would come from
// a partnership agreement (or from a marketplace partner that dispatches Waymo vehicles), which
// would supply a base URL and key. This file keeps the same contract as the other adapters so that
// connecting it later is a matter of filling in the three calls below.
import { NotConnectedError, type BookRequest, type ProviderAdapter, type ProviderBooking, type ProviderQuote, type QuoteRequest } from './types';

const env = () => ({ key: process.env.WAYMO_PARTNER_API_KEY, base: process.env.WAYMO_PARTNER_BASE_URL });

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const { key, base } = env();
  if (!key || !base) throw new NotConnectedError('waymo', 'set WAYMO_PARTNER_API_KEY and WAYMO_PARTNER_BASE_URL once a partner API is agreed');
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Waymo partner API ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const waymo: ProviderAdapter = {
  id: 'waymo',
  name: 'Waymo (partner API)',
  env: ['WAYMO_PARTNER_API_KEY', 'WAYMO_PARTNER_BASE_URL'],
  configured: () => !!(env().key && env().base),

  // The request/response shapes below are illustrative — map them to the partner's actual schema.
  async quote(req: QuoteRequest): Promise<ProviderQuote> {
    const q = await call<{ id: string; price_gbp: number; pickup_eta_min: number; dropoff_eta: string }>('/quotes', {
      pickup: { lat: req.pickup.lat, lng: req.pickup.lng },
      dropoff: { lat: req.dropoff.lat, lng: req.dropoff.lng },
      cargo: { weight_kg: req.weightKg, items: req.quantity },
    });
    return { providerId: 'waymo', quoteId: q.id, priceGbp: q.price_gbp, pickupEtaMin: q.pickup_eta_min, dropoffEta: q.dropoff_eta, raw: q };
  },
  async book(req: BookRequest): Promise<ProviderBooking> {
    const t = await call<{ id: string; status: string; vehicle_id?: string }>('/trips', { quote_id: req.quoteId, idempotency_key: req.idempotencyKey });
    return { providerId: 'waymo', bookingId: t.id, status: 'pending', courier: { vehicle: t.vehicle_id }, raw: t };
  },
  async cancel(bookingId: string) {
    await call(`/trips/${bookingId}/cancel`, {});
  },
  async status(bookingId: string): Promise<ProviderBooking> {
    const t = await call<{ id: string; status: string; location?: { lat: number; lng: number } }>(`/trips/${bookingId}`, undefined, 'GET');
    return { providerId: 'waymo', bookingId: t.id, status: t.status === 'completed' ? 'delivered' : t.status === 'cancelled' ? 'cancelled' : 'pending', courier: t.location, raw: t };
  },
};
