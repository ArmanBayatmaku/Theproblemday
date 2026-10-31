import type { Asset, AssetKind, CommandName } from '@shared/types';

export type CommandGroup = 'motion' | 'safety' | 'power' | 'payload' | 'signal' | 'system' | 'assign' | 'comms';

export const COMMAND_META: Record<CommandName, { label: string; group: CommandGroup; danger?: boolean; confirm?: string; needs?: 'position' | 'site' | 'speed' | 'message' }> = {
  pause: { label: 'Pause', group: 'motion' },
  resume: { label: 'Resume', group: 'motion' },
  hold: { label: 'Hold position', group: 'motion' },
  return_to_base: { label: 'Return to base', group: 'motion' },
  goto: { label: 'Go to…', group: 'motion', needs: 'position' },
  takeoff: { label: 'Take off', group: 'motion' },
  land: { label: 'Land now', group: 'safety', confirm: 'Land the selected drones at their current position?' },
  estop: { label: 'E-STOP', group: 'safety', danger: true, confirm: 'Emergency-stop the selected machines? They stay stopped until released and resumed.' },
  release_estop: { label: 'Release E-STOP', group: 'safety' },
  charge: { label: 'Go charge', group: 'power' },
  sleep: { label: 'Sleep', group: 'power' },
  wake: { label: 'Wake', group: 'power' },
  open_bay: { label: 'Open bay / release', group: 'payload', confirm: 'Open the payload bay? Drones release their payload.' },
  close_bay: { label: 'Close bay', group: 'payload' },
  lights_on: { label: 'Lights on', group: 'signal' },
  lights_off: { label: 'Lights off', group: 'signal' },
  horn: { label: 'Sound horn', group: 'signal' },
  reboot: { label: 'Reboot', group: 'system', confirm: 'Reboot the selected machines? They go offline briefly.' },
  update_firmware: { label: 'Update firmware', group: 'system' },
  set_speed_limit: { label: 'Speed limit', group: 'system', needs: 'speed' },
  assign_site: { label: 'Assign to location', group: 'assign', needs: 'site' },
  message_driver: { label: 'Message driver', group: 'comms', needs: 'message' },
  cancel_trip: { label: 'Cancel trip (provider)', group: 'comms', confirm: 'Cancel this trip with the provider?' },
};

const BY_KIND: Record<AssetKind, CommandName[]> = {
  drone: ['pause', 'resume', 'hold', 'return_to_base', 'goto', 'takeoff', 'land', 'estop', 'release_estop', 'charge', 'open_bay', 'close_bay', 'lights_on', 'lights_off', 'reboot', 'update_firmware', 'set_speed_limit', 'assign_site'],
  sidewalk_robot: ['pause', 'resume', 'hold', 'return_to_base', 'goto', 'estop', 'release_estop', 'charge', 'open_bay', 'close_bay', 'horn', 'lights_on', 'lights_off', 'reboot', 'update_firmware', 'set_speed_limit', 'assign_site'],
  humanoid: ['pause', 'resume', 'hold', 'return_to_base', 'goto', 'estop', 'release_estop', 'charge', 'sleep', 'wake', 'reboot', 'update_firmware', 'assign_site'],
  amr: ['pause', 'resume', 'return_to_base', 'goto', 'estop', 'release_estop', 'charge', 'reboot', 'set_speed_limit', 'assign_site'],
  robot_arm: ['pause', 'resume', 'estop', 'release_estop', 'sleep', 'wake', 'reboot', 'update_firmware', 'assign_site'],
  robotaxi: ['pause', 'resume', 'hold', 'return_to_base', 'goto', 'estop', 'release_estop', 'lights_on', 'lights_off', 'horn', 'assign_site'],
  van: ['message_driver', 'goto', 'return_to_base', 'assign_site'],
  truck: ['message_driver', 'goto', 'return_to_base', 'assign_site'],
  car: ['message_driver', 'goto', 'return_to_base', 'assign_site'],
  cargo_bike: ['message_driver', 'return_to_base', 'assign_site'],
};

export function capabilitiesFor(a: Asset): CommandName[] {
  if (a.ownership === 'external') return a.currentJobId ? ['cancel_trip'] : [];
  if (a.autonomy === 'human_driven') return BY_KIND[a.kind].filter((c) => ['message_driver', 'goto', 'return_to_base', 'assign_site'].includes(c));
  return BY_KIND[a.kind];
}

/** Union of commands supported by at least one selected machine, with how many support each. */
export function commonCapabilities(assets: Asset[]): { command: CommandName; count: number }[] {
  const counts = new Map<CommandName, number>();
  for (const a of assets) for (const c of capabilitiesFor(a)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].map(([command, count]) => ({ command, count }));
}

/** Indicative protocol translations shown in the control panel ("what would be sent"). */
export function protocolMessage(a: Asset, cmd: CommandName): string {
  switch (a.protocol) {
    case 'mavlink':
      return (
        {
          pause: 'MAV_CMD_DO_PAUSE_CONTINUE (0)',
          resume: 'MAV_CMD_DO_PAUSE_CONTINUE (1)',
          hold: 'MAV_CMD_DO_PAUSE_CONTINUE (0)',
          return_to_base: 'MAV_CMD_NAV_RETURN_TO_LAUNCH',
          goto: 'MAV_CMD_DO_REPOSITION',
          takeoff: 'MAV_CMD_NAV_TAKEOFF',
          land: 'MAV_CMD_NAV_LAND',
          estop: 'MAV_CMD_NAV_LAND (immediate) / flight termination policy',
          open_bay: 'MAV_CMD_DO_GRIPPER (release)',
          close_bay: 'MAV_CMD_DO_GRIPPER (grab)',
          reboot: 'MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN',
          set_speed_limit: 'MAV_CMD_DO_CHANGE_SPEED',
        } as Partial<Record<CommandName, string>>
      )[cmd] ?? `MAVLink: ${cmd}`;
    case 'vda5050':
      return (
        {
          pause: 'instantActions: startPause',
          resume: 'instantActions: stopPause',
          estop: 'instantActions: startPause + safety field stop',
          return_to_base: 'order: route to home node',
          goto: 'order: nodes/edges to target',
          charge: 'order: startCharging action',
          reboot: 'instantActions: factsheetRequest → restart',
        } as Partial<Record<CommandName, string>>
      )[cmd] ?? `VDA 5050: ${cmd}`;
    case 'ros2':
      return (
        {
          goto: 'action /navigate_to_pose (Nav2)',
          return_to_base: 'action /navigate_to_pose → dock',
          pause: 'service /pause',
          resume: 'service /resume',
          estop: 'topic /emergency_stop (std_msgs/Bool)',
          charge: 'action /dock_robot',
        } as Partial<Record<CommandName, string>>
      )[cmd] ?? `ROS 2: /${cmd}`;
    case 'vendor_api':
      return a.ownership === 'external' ? `Provider API: ${cmd}` : `Driver app / telematics: ${cmd}`;
    default:
      return `Simulator: ${cmd}`;
  }
}
