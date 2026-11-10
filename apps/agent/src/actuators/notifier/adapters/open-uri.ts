import type { SessionBus } from '../../../core/session-bus.js';

/** No parent window: the agent has none. */
const NO_PARENT_WINDOW = '';

/**
 * Opens `uri` in the default browser through the desktop portal
 * (`org.freedesktop.portal.OpenURI`). The session bus is already open, so
 * this spawns no process and builds no command line.
 */
export async function openUri(bus: SessionBus, uri: string): Promise<void> {
  await bus.call({
    destination: 'org.freedesktop.portal.Desktop',
    path: '/org/freedesktop/portal/desktop',
    interface: 'org.freedesktop.portal.OpenURI',
    member: 'OpenURI',
    signature: 'ssa{sv}',
    body: [NO_PARENT_WINDOW, uri, {}],
  });
}
