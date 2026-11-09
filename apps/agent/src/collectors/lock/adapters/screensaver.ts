import type {
  MethodCall,
  SessionBus,
  SignalHandler,
  SignalMatch,
  Unsubscribe,
} from '../../../core/session-bus.js';

const SCREENSAVER = {
  path: '/org/gnome/ScreenSaver',
  interface: 'org.gnome.ScreenSaver',
} as const;
const SCREENSAVER_NAME = 'org.gnome.ScreenSaver';

const GET_ACTIVE: MethodCall = {
  ...SCREENSAVER,
  destination: SCREENSAVER_NAME,
  member: 'GetActive',
};

const ACTIVE_CHANGED: SignalMatch = {
  ...SCREENSAVER,
  sender: SCREENSAVER_NAME,
  member: 'ActiveChanged',
};

/** Asks GNOME Shell whether the screen is locked now. The reply body is unparsed. */
export function requestActive(bus: SessionBus): Promise<readonly unknown[]> {
  return bus.call(GET_ACTIVE);
}

/** Calls `handler` with each unparsed `ActiveChanged` body from GNOME Shell. */
export function subscribeActiveChanged(
  bus: SessionBus,
  handler: SignalHandler,
): Promise<Unsubscribe> {
  return bus.subscribe(ACTIVE_CHANGED, handler);
}
