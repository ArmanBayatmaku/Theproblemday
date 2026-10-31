import {
  Bike,
  Bot,
  Building,
  Car,
  Drone,
  Forklift,
  Hexagon,
  PersonStanding,
  PlugZap,
  Store,
  Truck,
  TruckElectric,
  Warehouse,
  Wrench,
  Cpu,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { AssetKind, SiteKind } from '@shared/types';
import { KIND_COLOR, SITE_COLOR } from './colors';

export const KIND_ICON: Record<AssetKind, LucideIcon> = {
  drone: Drone,
  robotaxi: Car,
  car: Car,
  van: TruckElectric,
  truck: Truck,
  cargo_bike: Bike,
  humanoid: PersonStanding,
  amr: Forklift,
  sidewalk_robot: Bot,
  robot_arm: Cpu,
};

export const SITE_ICON: Record<SiteKind, LucideIcon> = {
  warehouse: Warehouse,
  store: Store,
  drone_port: Hexagon,
  depot: Wrench,
  charging_hub: PlugZap,
  customer: Building,
};

export function AssetIcon({ kind, size = 16, tinted = true }: { kind: AssetKind; size?: number; tinted?: boolean }) {
  const I = KIND_ICON[kind] ?? Package;
  return <I size={size} style={tinted ? { color: KIND_COLOR[kind] } : undefined} strokeWidth={2} />;
}

export function SiteIcon({ kind, size = 16 }: { kind: SiteKind; size?: number }) {
  const I = SITE_ICON[kind] ?? Building;
  return <I size={size} style={{ color: SITE_COLOR[kind] }} strokeWidth={2} />;
}

export function HiveLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 6 54 18.7v26.6L32 58 10 45.3V18.7z" fill="none" stroke="#5a9bf0" strokeWidth="5" strokeLinejoin="round" />
      <path d="M32 20 42.4 26v12L32 44l-10.4-6V26z" fill="#8bd450" />
      <path d="M32 6v14M54 18.7 42.4 26M54 45.3 42.4 38M32 58V44M10 45.3 21.6 38M10 18.7 21.6 26" stroke="#5a9bf0" strokeWidth="2" opacity="0.45" />
    </svg>
  );
}
