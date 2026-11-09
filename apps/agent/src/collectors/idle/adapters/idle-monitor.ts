import type { MethodCall, SessionBus } from '../../../core/session-bus.js';

/** Mutter's idle monitor for the whole session ("Core"), not a per-device one. */
const GET_IDLETIME: MethodCall = {
  destination: 'org.gnome.Mutter.IdleMonitor',
  path: '/org/gnome/Mutter/IdleMonitor/Core',
  interface: 'org.gnome.Mutter.IdleMonitor',
  member: 'GetIdletime',
};

/** Asks Mutter how long the user has been idle. The reply body is unparsed. */
export function requestIdletime(bus: SessionBus): Promise<readonly unknown[]> {
  return bus.call(GET_IDLETIME);
}
