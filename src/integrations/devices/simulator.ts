import type { Asset, CommandName, LngLat, Site } from '@shared/types';
import { distanceM, pointInZone } from '@shared/geo';
import { buildRoute, isIndoor, type RouteCtx } from '@/sim/routes';
import { capabilitiesFor } from './capabilities';

export interface CommandCtx extends RouteCtx {
  sites: Site[];
}

export interface CommandOutcome {
  ok: boolean;
  message: string;
  patch?: Partial<Asset>;
  requeueJobId?: string;
  cancelJobId?: string;
}

const homeOf = (a: Asset, sites: Site[]) => sites.find((s) => s.id === a.siteId);

function nearestCharger(a: Asset, sites: Site[]): Site | undefined {
  const kinds = a.kind === 'drone' ? ['drone_port'] : ['charging_hub', 'warehouse', 'depot', 'store'];
  const home = homeOf(a, sites);
  if (home && kinds.includes(home.kind)) return home;
  return sites
    .filter((s) => kinds.includes(s.kind))
    .sort((x, y) => distanceM(x.position, a.position) - distanceM(y.position, a.position))[0];
}

/**
 * Applies a command to a simulated machine. Real adapters (MAVLink, ROS 2, VDA 5050, vendor APIs)
 * would send the protocol message instead; until they're connected every command lands here.
 */
export function simulateCommand(a: Asset, cmd: CommandName, params: Record<string, unknown>, ctx: CommandCtx): CommandOutcome {
  if (!capabilitiesFor(a).includes(cmd)) return { ok: false, message: `${a.id} does not support “${cmd}”` };
  if (a.status === 'estop' && cmd !== 'release_estop') return { ok: false, message: `${a.id} is emergency-stopped — release first` };
  if (a.status === 'offline' && !['reboot', 'assign_site'].includes(cmd)) return { ok: false, message: `${a.id} is offline` };
  const airborne = a.kind === 'drone' && a.altitude > 5;

  switch (cmd) {
    case 'pause':
      if (['paused', 'holding'].includes(a.status)) return { ok: true, message: `${a.id} already paused` };
      return { ok: true, message: airborne ? `${a.id} hovering in place` : `${a.id} paused`, patch: { prevStatus: a.status, status: airborne ? 'holding' : 'paused', speedKmh: 0 } };
    case 'hold':
      return { ok: true, message: `${a.id} holding position`, patch: { prevStatus: a.status, status: 'holding', speedKmh: 0 } };
    case 'resume': {
      const next = a.prevStatus && !['paused', 'holding', 'estop'].includes(a.prevStatus) ? a.prevStatus : a.route ? 'en_route' : 'idle';
      return { ok: true, message: `${a.id} resumed`, patch: { status: next, prevStatus: undefined } };
    }
    case 'estop':
      return {
        ok: true,
        message: airborne ? `${a.id} E-STOP — emergency landing` : `${a.id} E-STOP`,
        patch: { prevStatus: a.status, status: 'estop', speedKmh: 0, altitude: 0 },
      };
    case 'release_estop':
      if (a.status !== 'estop') return { ok: true, message: `${a.id} not in E-STOP` };
      return { ok: true, message: `${a.id} released — paused until resumed`, patch: { status: 'paused' } };
    case 'land':
      return { ok: true, message: `${a.id} landing at current position`, patch: { altitude: 0, status: 'paused', prevStatus: a.status, speedKmh: 0 } };
    case 'takeoff':
      if (airborne) return { ok: true, message: `${a.id} already airborne` };
      return { ok: true, message: `${a.id} climbing to 30 m and holding`, patch: { altitude: 30, status: 'holding' } };
    case 'return_to_base':
    case 'charge': {
      const target = cmd === 'charge' ? nearestCharger(a, ctx.sites) : homeOf(a, ctx.sites) ?? nearestCharger(a, ctx.sites);
      if (!target) return { ok: false, message: `${a.id} has no home location` };
      if (distanceM(target.position, a.position) < 60) {
        return { ok: true, message: cmd === 'charge' ? `${a.id} charging at ${target.name}` : `${a.id} is at ${target.name}`, patch: { status: cmd === 'charge' ? 'charging' : 'idle', route: undefined, altitude: 0 } };
      }
      const r = buildRoute(a, target.position, 'return', ctx, cmd === 'charge' ? 'charge' : undefined);
      if (!r.route) return { ok: false, message: r.error ?? 'No route' };
      return {
        ok: true,
        message: `${a.id} returning to ${target.name}${a.currentJobId ? ` — ${a.currentJobId} re-queued` : ''}`,
        patch: { route: r.route, speedKmh: r.speedKmh, status: 'returning', currentJobId: undefined, workUntil: undefined },
        requeueJobId: a.currentJobId,
      };
    }
    case 'goto': {
      const pos = params.position as LngLat | undefined;
      if (!pos) return { ok: false, message: 'Pick a destination on the map or choose a location' };
      if (a.kind === 'drone' && ctx.geofence) {
        const z = ctx.zones.find((zz) => zz.active && pointInZone(pos, zz));
        if (z) return { ok: false, message: `Airspace guard: target is inside ${z.name}` };
      }
      const r = buildRoute(a, pos, 'goto', ctx);
      if (!r.route) return { ok: false, message: r.error ?? 'No route' };
      return { ok: true, message: `${a.id} heading to ${String(params.label ?? 'target')}`, patch: { route: r.route, speedKmh: r.speedKmh, status: 'en_route', prevStatus: undefined } };
    }
    case 'open_bay':
      return { ok: true, message: a.kind === 'drone' ? `${a.id} winch released payload` : `${a.id} lid opened` };
    case 'close_bay':
      return { ok: true, message: `${a.id} bay closed` };
    case 'lights_on':
      return { ok: true, message: `${a.id} lights on`, patch: { lightsOn: true } };
    case 'lights_off':
      return { ok: true, message: `${a.id} lights off`, patch: { lightsOn: false } };
    case 'horn':
      return { ok: true, message: `${a.id} sounded horn` };
    case 'sleep':
      return { ok: true, message: `${a.id} sleeping`, patch: { prevStatus: a.status, status: 'paused', speedKmh: 0 } };
    case 'wake':
      return { ok: true, message: `${a.id} awake`, patch: { status: 'idle' } };
    case 'reboot':
      return { ok: true, message: `${a.id} rebooting (~20 s)`, patch: { status: 'offline', prevStatus: 'idle', workUntil: ctx.now + 20_000, speedKmh: 0 } };
    case 'update_firmware': {
      const v = (a.firmware ?? '1.0.0').replace(/(\d+)(?!.*\d)/, (m) => String(Number(m) + 1));
      return { ok: true, message: `${a.id} updated to ${v}`, patch: { firmware: v } };
    }
    case 'set_speed_limit': {
      const kmh = Number(params.speedKmh);
      if (!kmh) return { ok: false, message: 'Choose a speed limit' };
      return { ok: true, message: `${a.id} speed limit ${kmh} km/h`, patch: { speedLimitKmh: kmh } };
    }
    case 'assign_site': {
      const site = ctx.sites.find((s) => s.id === params.siteId);
      if (!site) return { ok: false, message: 'Choose a location' };
      if (isIndoor(a)) {
        return { ok: true, message: `${a.id} transferred to ${site.name}`, patch: { siteId: site.id, position: site.position, route: undefined } };
      }
      return { ok: true, message: `${a.id} now based at ${site.name}`, patch: { siteId: site.id } };
    }
    case 'message_driver':
      return { ok: true, message: `Message sent to ${a.id} driver: “${String(params.message ?? 'Please call ops')}”` };
    case 'cancel_trip':
      return { ok: true, message: `Trip cancelled with provider for ${a.id}`, cancelJobId: a.currentJobId, patch: { currentJobId: undefined, route: undefined, status: 'idle' } };
  }
}
