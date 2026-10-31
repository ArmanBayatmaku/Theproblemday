// Coming soon: drone charging pads at petrol stations and EV charging hubs across London.
// Planned sites are illustrative (demo): approximate spots on main roads, no real operators named.
import type { LngLat } from '@shared/types';

export interface ChargingSite {
  id: string;
  name: string;
  kind: 'petrol' | 'ev';
  position: LngLat;
}

/** How far a freshly charged drone covers in about 3 minutes. */
export const COVERAGE_M = 2500;

export const CHARGING_SITES: ChargingSite[] = [
  // Petrol stations
  { id: 'pt-camden', name: 'Camden Road', kind: 'petrol', position: [-0.1325, 51.5455] },
  { id: 'pt-holloway', name: 'Holloway Road', kind: 'petrol', position: [-0.1135, 51.5555] },
  { id: 'pt-oldkent', name: 'Old Kent Road', kind: 'petrol', position: [-0.0745, 51.4875] },
  { id: 'pt-edgware', name: 'Edgware Road', kind: 'petrol', position: [-0.1685, 51.5205] },
  { id: 'pt-mileend', name: 'Mile End Road', kind: 'petrol', position: [-0.0405, 51.5235] },
  { id: 'pt-brixton', name: 'Brixton Road', kind: 'petrol', position: [-0.1135, 51.4705] },
  { id: 'pt-kingsland', name: 'Kingsland Road', kind: 'petrol', position: [-0.0755, 51.5385] },
  { id: 'pt-cromwell', name: 'Cromwell Road', kind: 'petrol', position: [-0.1985, 51.4945] },
  { id: 'pt-uxbridge', name: 'Uxbridge Road', kind: 'petrol', position: [-0.2335, 51.5065] },
  { id: 'pt-leabridge', name: 'Lea Bridge Road', kind: 'petrol', position: [-0.0385, 51.5635] },
  { id: 'pt-wandsworth', name: 'Wandsworth Road', kind: 'petrol', position: [-0.1345, 51.4725] },
  { id: 'pt-commercial', name: 'Commercial Road', kind: 'petrol', position: [-0.0545, 51.5135] },
  // EV charging hubs
  { id: 'ev-kingscross', name: "King's Cross", kind: 'ev', position: [-0.1215, 51.5335] },
  { id: 'ev-vauxhall', name: 'Vauxhall', kind: 'ev', position: [-0.1215, 51.4865] },
  { id: 'ev-stratford', name: 'Stratford', kind: 'ev', position: [-0.0045, 51.5435] },
  { id: 'ev-battersea', name: 'Battersea Power Station', kind: 'ev', position: [-0.1445, 51.4815] },
  { id: 'ev-whitecity', name: 'White City', kind: 'ev', position: [-0.2245, 51.5125] },
  { id: 'ev-shoreditch', name: 'Shoreditch', kind: 'ev', position: [-0.0775, 51.5255] },
  { id: 'ev-hammersmith', name: 'Hammersmith', kind: 'ev', position: [-0.2245, 51.4925] },
  { id: 'ev-greenwich', name: 'Greenwich', kind: 'ev', position: [-0.0105, 51.4805] },
  { id: 'ev-clapham', name: 'Clapham', kind: 'ev', position: [-0.1384, 51.4625] },
  { id: 'ev-brentcross', name: 'Brent Cross', kind: 'ev', position: [-0.2235, 51.5755] },
  { id: 'ev-peckham', name: 'Peckham', kind: 'ev', position: [-0.0685, 51.4735] },
  { id: 'ev-walthamstow', name: 'Walthamstow', kind: 'ev', position: [-0.0205, 51.5835] },
];
