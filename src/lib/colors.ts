import type { AssetKind, AssetStatus, JobStatus, Ownership, SiteKind, ZoneKind } from '@shared/types';

export type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export const KIND_COLOR: Record<AssetKind, string> = {
  drone: '#8bd450',
  robotaxi: '#5a9bf0',
  car: '#d6dbe0',
  van: '#f0a33a',
  truck: '#ff8a4c',
  cargo_bike: '#b48ae8',
  humanoid: '#e86fa8',
  amr: '#4fb8c4',
  sidewalk_robot: '#ffd166',
  robot_arm: '#9aa2ab',
};

export const KIND_LABEL: Record<AssetKind, string> = {
  drone: 'Drone',
  robotaxi: 'Autonomous car',
  car: 'Car',
  van: 'Van',
  truck: 'Truck',
  cargo_bike: 'Cargo bike',
  humanoid: 'Humanoid robot',
  amr: 'Warehouse AMR',
  sidewalk_robot: 'Sidewalk robot',
  robot_arm: 'Robot arm',
};

export const SITE_COLOR: Record<SiteKind, string> = {
  warehouse: '#5a9bf0',
  store: '#8bd450',
  drone_port: '#b48ae8',
  depot: '#f0a33a',
  charging_hub: '#4fb8c4',
  customer: '#d6dbe0',
};

export const SITE_LABEL: Record<SiteKind, string> = {
  warehouse: 'Warehouse',
  store: 'Store',
  drone_port: 'Drone port',
  depot: 'Depot',
  charging_hub: 'Charging hub',
  customer: 'Customer site',
};

export const ZONE_COLOR: Record<ZoneKind, string> = {
  frz: '#ec5b5b',
  restricted: '#ff8a4c',
  prison: '#b48ae8',
  heliport: '#f0a33a',
  temporary: '#ffd166',
  royal_park: '#6fcf7c',
};

export const ZONE_LABEL: Record<ZoneKind, string> = {
  frz: 'Airport FRZ',
  restricted: 'Restricted area',
  prison: 'Prison zone',
  heliport: 'Heliport',
  temporary: 'Temporary (NOTAM)',
  royal_park: 'Royal Park',
};

export const STATUS_COLOR: Record<AssetStatus, string> = {
  idle: '#9aa2ab',
  en_route: '#5a9bf0',
  working: '#8bd450',
  charging: '#4fb8c4',
  returning: '#b48ae8',
  paused: '#f0a33a',
  holding: '#f0a33a',
  offline: '#6c747d',
  estop: '#ec5b5b',
  maintenance: '#ff8a4c',
};

export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  scheduled: '#9aa2ab',
  recurring: '#b48ae8',
  assigned: '#5a9bf0',
  to_pickup: '#5a9bf0',
  loading: '#f0a33a',
  in_transit: '#4fb8c4',
  delivered: '#8bd450',
  failed: '#ec5b5b',
  cancelled: '#6c747d',
};

export const OWNERSHIP_LABEL: Record<Ownership, string> = { own: 'Own fleet', network: 'Hive network', external: 'Marketplace' };
