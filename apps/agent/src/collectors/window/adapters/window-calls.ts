import type { MethodCall, SessionBus } from '../../../core/session-bus.js';

/** The Window Calls GNOME Shell extension (SPEC §1, §4.1). */
const LIST_WINDOWS: MethodCall = {
  destination: 'org.gnome.Shell',
  path: '/org/gnome/Shell/Extensions/Windows',
  interface: 'org.gnome.Shell.Extensions.Windows',
  member: 'List',
};

/** Asks Window Calls for every window. The reply body is unparsed. */
export function requestWindowList(bus: SessionBus): Promise<readonly unknown[]> {
  return bus.call(LIST_WINDOWS);
}
