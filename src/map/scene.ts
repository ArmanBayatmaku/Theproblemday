// What the one shared map shows. Each screen describes its scene; the map draws it.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { LngLat, Pos3 } from '@shared/types';
import type { CollectPoint } from '@/lib/collect';

export interface Stop {
  id: string;
  position: LngLat;
  kind: 'pickup' | 'dropoff';
  label?: string;
}

export interface Scene {
  /** Points to frame; the map re-frames when `fitKey` changes. */
  fit?: LngLat[];
  fitKey?: string;
  /** Zoom used when framing a single point. */
  fitZoom?: number;
  /** Drone flight line (with altitude). */
  route?: Pos3[];
  /** The drone's flight from its port to the pickup. */
  approach?: Pos3[];
  stops?: Stop[];
  shops?: CollectPoint[];
  selectedShopId?: string;
  onShop?: (c: CollectPoint) => void;
  drone?: { pos: Pos3; heading: number };
  /** A drone rental's flight area (circle). */
  area?: { center: LngLat; radiusM: number };
  /** No-fly zones to emphasise (the ones a route goes around). */
  hotZones?: string[];
  ports?: boolean;
}

export const useScene = create<{ scene: Scene; setScene: (s: Scene) => void }>((set) => ({
  scene: {},
  setScene: (scene) => set({ scene }),
}));

/** Sets the map scene for the current screen. */
export function useMapScene(scene: Scene, deps: unknown[]) {
  useEffect(() => {
    useScene.getState().setScene(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
