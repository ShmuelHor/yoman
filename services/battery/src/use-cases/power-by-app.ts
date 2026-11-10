import type { AppPower } from '@yoman/shared/battery';
import { LIMITS } from '@yoman/shared/limits';

import type { PowerByAppRequest } from '../contracts.js';
import { attributePower } from '../domain/power-by-app.js';
import type { BatteryStore } from './store.js';

/** Twice the agent's one sample a minute over the longest range, so a backlog still fits. */
const READINGS_PER_MINUTE = 2;
const MAX_RANGE_READINGS = LIMITS.rangeDays * LIMITS.minutesPerDay * READINGS_PER_MINUTE;

/** Each app's average draw while in focus, over the gateway's session timeline. */
export function powerByApp(store: BatteryStore, request: PowerByAppRequest): Promise<AppPower[]> {
  const range = { fromMs: Date.parse(request.from), toMs: Date.parse(request.to) };
  const spans = request.sessions.map((session) => ({
    appId: session.appId,
    startMs: Date.parse(session.start),
    endMs: Date.parse(session.end),
  }));
  return store.transaction(async (tx) => {
    const readings = await tx.readingsBetween(range.fromMs, range.toMs, MAX_RANGE_READINGS);
    return attributePower(range, spans, readings);
  });
}
