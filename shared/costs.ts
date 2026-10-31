import type { CostSettings } from './types';

/** Default London cost assumptions for pricing your own vehicles (editable in the dashboard's Settings). */
export const DEFAULT_COSTS: CostSettings = {
  dieselPerLitre: 1.45,
  petrolPerLitre: 1.38,
  electricityPerKwh: 0.32,
  driverWagePerHour: 18,
  minBillableMinutes: 60,
  congestionCharge: 18,
  congestionChargeEvVan: 9,
  ulezCharge: 12.5,
  wearPerKmVan: 0.18,
  wearPerKmTruck: 0.42,
  robotSupervisionPerHour: 6,
  handlingMinutes: 12,
};
