import type { ProviderCategory } from './types';

export type IntegrationState = 'internal' | 'simulated' | 'connected';

export interface ProviderInfo {
  id: string;
  name: string;
  service: string;
  category: ProviderCategory;
  integration: IntegrationState;
  color: string;
  description: string;
  limits: string;
  /** How a real connection would be made (shown on the Integrations page). */
  howToConnect: string;
  envVars: string[];
}

/**
 * Marketplace providers. Waymo and Uber quotes are SIMULATED until their adapters are connected
 * (see src/integrations/providers and server/providers). Thames Express and CityHop are fictional
 * demo partners standing in for any courier that lists itself on the platform.
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'hive-air',
    name: 'Hive Air',
    service: 'Drone · Express',
    category: 'drone',
    integration: 'internal',
    color: '#8bd450',
    description: 'Our own drone network flying from Hive drone ports. Winch-lowered drop-off, no landing needed.',
    limits: 'Up to 5 kg · small/medium parcels · weather & airspace dependent',
    howToConnect: 'Runs on the platform. Real aircraft connect through the MAVLink bridge (Control → Adapters).',
    envVars: ['MAVLINK_BRIDGE_URL'],
  },
  {
    id: 'waymo',
    name: 'Waymo',
    service: 'Autonomous car',
    category: 'autonomous_car',
    integration: 'simulated',
    color: '#5ab0ff',
    description: 'Driverless car — sender loads the boot at the kerb, recipient unlocks with a code.',
    limits: 'Up to 60 kg · boot-sized loads · simulated service area',
    howToConnect: 'Waymo has no public self-serve delivery API; a partner agreement would supply a base URL and key for server/providers/waymo.ts.',
    envVars: ['WAYMO_PARTNER_API_KEY', 'WAYMO_PARTNER_BASE_URL'],
  },
  {
    id: 'uber-courier',
    name: 'Uber',
    service: 'Courier',
    category: 'courier',
    integration: 'simulated',
    color: '#e8eaed',
    description: 'On-demand car courier for small items.',
    limits: 'Up to 6.8 kg (15 lb) · items under £200',
    howToConnect: 'Uber Direct (business delivery API): OAuth client credentials, then quotes and deliveries under /v1/customers/{id}. Adapter ready in server/providers/uber-direct.ts — add the three keys to switch it on.',
    envVars: ['UBER_DIRECT_CLIENT_ID', 'UBER_DIRECT_CLIENT_SECRET', 'UBER_DIRECT_CUSTOMER_ID'],
  },
  {
    id: 'thames-express',
    name: 'Thames Express',
    service: 'Same-day van',
    category: 'van',
    integration: 'simulated',
    color: '#f0a33a',
    description: 'Demo partner courier with vans and a tail-lift truck. (Fictional listing.)',
    limits: 'Up to 800 kg · pallets OK · booked within 30–45 min',
    howToConnect: 'Partners list themselves through the provider API (POST /api/providers/:id/quote).',
    envVars: [],
  },
  {
    id: 'cityhop',
    name: 'CityHop',
    service: 'E-cargo bike',
    category: 'cargo_bike',
    integration: 'simulated',
    color: '#b48ae8',
    description: 'Demo partner e-cargo bikes — quickest through congestion for short central trips. (Fictional listing.)',
    limits: 'Up to 80 kg · under 9 km',
    howToConnect: 'Partners list themselves through the provider API (POST /api/providers/:id/quote).',
    envVars: [],
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);
