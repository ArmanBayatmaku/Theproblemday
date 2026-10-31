// /api/devices — the hand-off point between the control panel and real hardware.
//
// Each protocol gets a bridge with the same `send()` contract. None are connected in this build:
// the browser runs every command against its digital twin (src/integrations/devices/simulator.ts)
// and calls this route so the server is ready to forward once a bridge URL is configured.
import { Router } from 'express';

export type Protocol = 'mavlink' | 'ros2' | 'vda5050' | 'vendor_api' | 'mqtt';

export interface DeviceCommand {
  assetId: string;
  endpoint?: string;
  command: string;
  params?: Record<string, unknown>;
}

interface Bridge {
  protocol: Protocol;
  name: string;
  env: string;
  /** What a real implementation sends for each command (kept short here; see README). */
  mapping: Record<string, string>;
}

export const BRIDGES: Bridge[] = [
  {
    protocol: 'mavlink',
    name: 'MAVLink (PX4 / ArduPilot)',
    env: 'MAVLINK_BRIDGE_URL',
    mapping: {
      pause: 'MAV_CMD_DO_PAUSE_CONTINUE param1=0',
      resume: 'MAV_CMD_DO_PAUSE_CONTINUE param1=1',
      return_to_base: 'MAV_CMD_NAV_RETURN_TO_LAUNCH',
      land: 'MAV_CMD_NAV_LAND',
      takeoff: 'MAV_CMD_NAV_TAKEOFF',
      goto: 'MAV_CMD_DO_REPOSITION',
      estop: 'MAV_CMD_COMPONENT_ARM_DISARM param2=21196 (force disarm — only safe on the ground; use flight termination in the air)',
      open_bay: 'MAV_CMD_DO_GRIPPER param2=0 (release)',
      set_speed_limit: 'MAV_CMD_DO_CHANGE_SPEED',
    },
  },
  {
    protocol: 'ros2',
    name: 'ROS 2 (rosbridge)',
    env: 'ROSBRIDGE_URL',
    mapping: {
      goto: 'nav2_msgs/action/NavigateToPose',
      pause: 'std_srvs/srv/Trigger on /<ns>/pause',
      resume: 'std_srvs/srv/Trigger on /<ns>/resume',
      estop: 'std_msgs/msg/Bool true on latched /<ns>/estop',
      return_to_base: 'NavigateToPose → home pose',
    },
  },
  {
    protocol: 'vda5050',
    name: 'VDA 5050 (MQTT)',
    env: 'VDA5050_MQTT_URL',
    mapping: {
      goto: 'order topic: nodes/edges to the target station',
      pause: 'instantActions: startPause',
      resume: 'instantActions: stopPause',
      estop: 'instantActions: cancelOrder + safety field (hardware e-stop stays primary)',
      charge: 'order with startCharging action at the charger node',
    },
  },
  { protocol: 'vendor_api', name: 'Vendor & telematics APIs', env: 'VENDOR_API_BASE_URL', mapping: { message_driver: 'Driver-app push message', goto: 'Navigation hand-off to the driver app' } },
  { protocol: 'mqtt', name: 'Generic MQTT', env: 'DEVICE_MQTT_URL', mapping: { '*': 'publish devices/<id>/cmd { command, params }' } },
];

export function deviceStatus() {
  return Object.fromEntries(BRIDGES.map((b) => [b.protocol, { name: b.name, configured: !!process.env[b.env], env: b.env }]));
}

export const deviceRouter = Router();

deviceRouter.get('/', (_req, res) => res.json(deviceStatus()));

deviceRouter.post('/:protocol/command', (req, res) => {
  const bridge = BRIDGES.find((b) => b.protocol === req.params.protocol);
  if (!bridge) return res.status(404).json({ error: `Unknown protocol ${req.params.protocol}` });
  const cmd = req.body as DeviceCommand;
  const wouldSend = bridge.mapping[cmd?.command] ?? bridge.mapping['*'] ?? 'custom mapping';
  if (!process.env[bridge.env]) {
    return res.json({ simulated: true, message: `${bridge.name} bridge not configured (${bridge.env}). Ran on the digital twin instead.`, wouldSend });
  }
  // A configured bridge would forward here, e.g. a WebSocket message to mavlink2rest / rosbridge,
  // or an MQTT publish for VDA 5050. Left unimplemented on purpose until real hardware is attached.
  return res.status(501).json({ simulated: true, message: `${bridge.name} is configured but the forwarder is not implemented yet.`, wouldSend });
});
