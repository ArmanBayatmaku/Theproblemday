// Contract every delivery provider adapter implements. The web app talks to /api/providers/:id/*
// and never holds provider credentials.

export interface Stop {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  notes?: string;
}

export interface QuoteRequest {
  pickup: Stop;
  dropoff: Stop;
  weightKg: number;
  quantity: number;
  size: 'envelope' | 'small' | 'medium' | 'large' | 'pallet';
  valueGbp?: number;
  pickupReadyAt?: string; // ISO
  dropoffDeadline?: string; // ISO
  reference?: string;
}

export interface ProviderQuote {
  providerId: string;
  quoteId: string;
  priceGbp: number;
  pickupEtaMin: number;
  dropoffEta: string; // ISO
  expiresAt?: string;
  raw?: unknown;
}

export interface BookRequest extends QuoteRequest {
  quoteId?: string;
  idempotencyKey: string;
}

export interface ProviderBooking {
  providerId: string;
  bookingId: string;
  status: 'pending' | 'pickup' | 'dropoff' | 'delivered' | 'cancelled' | 'returned';
  trackingUrl?: string;
  courier?: { name?: string; vehicle?: string; lat?: number; lng?: number };
  raw?: unknown;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  /** True once the env vars for a real connection are present. */
  configured(): boolean;
  /** Env vars this adapter reads. */
  env: string[];
  quote(req: QuoteRequest): Promise<ProviderQuote>;
  book(req: BookRequest): Promise<ProviderBooking>;
  cancel(bookingId: string): Promise<void>;
  status(bookingId: string): Promise<ProviderBooking>;
}

export class NotConnectedError extends Error {
  constructor(public providerId: string, detail?: string) {
    super(`${providerId} is not connected${detail ? ` — ${detail}` : ''}`);
  }
}
