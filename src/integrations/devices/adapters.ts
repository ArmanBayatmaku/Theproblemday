import type { Asset, CommandName, Protocol } from '@shared/types';

export interface AdapterInfo {
  protocol: Protocol;
  name: string;
  transport: string;
  connected: boolean;
  envVar?: string;
  devices: string;
  docs: string;
}

/**
 * Device adapters. Only the simulator is live in this build; the others are ready-made slots.
 * To connect real hardware, implement `send()` in the matching file under server/devices and flip
 * `connected` (or read it from GET /api/integrations).
 */
export const ADAPTERS: AdapterInfo[] = [
  { protocol: 'sim', name: 'Simulator', transport: 'In-browser digital twin', connected: true, devices: 'Every registered machine', docs: 'Commands change the simulated twin immediately.' },
  { protocol: 'mavlink', name: 'MAVLink bridge', transport: 'WebSocket → MAVSDK server / mavlink2rest', connected: false, envVar: 'MAVLINK_BRIDGE_URL', devices: 'PX4 / ArduPilot drones', docs: 'Translate commands to MAV_CMD_* messages; telemetry from GLOBAL_POSITION_INT, BATTERY_STATUS, HEARTBEAT.' },
  { protocol: 'ros2', name: 'ROS 2 bridge', transport: 'rosbridge_suite WebSocket', connected: false, envVar: 'ROSBRIDGE_URL', devices: 'Humanoids, sidewalk robots, robot arms', docs: 'Nav2 actions for movement, services for pause/resume, a latched topic for E-STOP.' },
  { protocol: 'vda5050', name: 'VDA 5050', transport: 'MQTT (order, instantActions, state topics)', connected: false, envVar: 'VDA5050_MQTT_URL', devices: 'Warehouse AMRs / AGVs', docs: 'Orders become node/edge graphs; pause/resume map to instantActions.' },
  { protocol: 'vendor_api', name: 'Vendor & telematics APIs', transport: 'HTTPS through the API server', connected: false, devices: 'Vans, trucks (driver app), provider fleets', docs: 'Server-side only so API keys never reach the browser.' },
  { protocol: 'mqtt', name: 'Generic MQTT', transport: 'MQTT', connected: false, devices: 'Custom machines', docs: 'Publish commands to devices/<id>/cmd; subscribe to devices/<id>/state.' },
];

export function adapterFor(a: Asset): AdapterInfo {
  return ADAPTERS.find((x) => x.protocol === a.protocol) ?? ADAPTERS[0];
}

/** Describes where a command is routed — real adapter if connected, otherwise the simulator. */
export function routeLabel(a: Asset, _cmd: CommandName): string {
  const ad = adapterFor(a);
  if (a.protocol === 'sim') return 'Simulator';
  return ad.connected ? ad.name : `${ad.name} (not connected → simulated)`;
}
