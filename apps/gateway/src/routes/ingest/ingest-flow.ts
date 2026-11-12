import type { Alert } from '@yoman/shared/alerts';
import type { AppId, ServiceName } from '@yoman/shared/common';
import { FocusState, type MuteDirective, type Profile } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import type { RouteHandler } from '../../core/route-handler.js';
import { orDegraded, type ServiceClient } from '../../core/service-client.js';
import type { ThresholdsProvider } from '../system/thresholds.js';
import {
  AlertingReply,
  type ClosedSession,
  CountedReply,
  DayUsage,
  EvaluateReply,
  KnownAppsReply,
  ProfilesReply,
  RouteReply,
  SessionsReply,
} from './contracts.js';
import { buildMuteDirective } from './mute-directive.js';
import { splitBatch } from './split-batch.js';

/** The apps the user never wants muted (`Settings.systemApps`). */
export type SystemAppsProvider = () => Promise<readonly AppId[]>;

export interface IngestDeps {
  readonly thresholds: ThresholdsProvider;
  readonly systemApps: SystemAppsProvider;
}

/** Used until T31 serves `gateway.settings`, which replaces it with the stored list. */
export const noSystemApps: SystemAppsProvider = () => Promise.resolve([]);

/** Stores the batch's samples. A failure here fails the batch, so the agent keeps it and retries. */
async function storeSamples(
  services: ServiceClient,
  deps: IngestDeps,
  batch: Parameters<typeof splitBatch>[0],
): Promise<{ accepted: number; closed: readonly ClosedSession[]; alerts: Alert[] }> {
  const { windows, battery, system } = splitBatch(batch);
  const [sessions, batteryReply, systemReply] = await Promise.all([
    windows.length === 0
      ? null
      : services.call('sessions', {
          method: 'POST',
          path: '/samples',
          body: { samples: windows },
          response: SessionsReply,
        }),
    battery.length === 0
      ? null
      : services.call('battery', {
          method: 'POST',
          path: '/samples',
          body: { samples: battery },
          response: AlertingReply,
        }),
    system.length === 0
      ? null
      : deps.thresholds().then((thresholds) =>
          services.call('system', {
            method: 'POST',
            path: '/samples',
            body: { thresholds, samples: system },
            response: AlertingReply,
          }),
        ),
  ]);
  return {
    accepted:
      (sessions?.accepted ?? 0) + (batteryReply?.accepted ?? 0) + (systemReply?.accepted ?? 0),
    closed: sessions?.closed ?? [],
    alerts: [...(batteryReply?.alerts ?? []), ...(systemReply?.alerts ?? [])],
  };
}

/**
 * Hands closed sessions to reports, then asks goals to evaluate the day's
 * totals, which reports has just updated. Returns goal-breach alerts.
 *
 * Both are data owners, so a failure fails the batch. The agent resends it,
 * sessions hands the same closed sessions back, reports counts each session
 * id once and goals evaluates absolute totals, so nothing is lost or counted
 * twice.
 */
async function countAndEvaluate(
  services: ServiceClient,
  closed: readonly ClosedSession[],
): Promise<Alert[]> {
  if (closed.length === 0) {
    return [];
  }
  await services.call('reports', {
    method: 'POST',
    path: '/sessions',
    body: { sessions: closed },
    response: CountedReply,
  });
  const usage = await services.call('reports', {
    method: 'GET',
    path: '/today',
    response: DayUsage,
  });
  const evaluated = await services.call('goals', {
    method: 'POST',
    path: '/evaluate',
    body: { date: usage.date, apps: usage.topApps, categories: usage.byCategory },
    response: EvaluateReply,
  });
  return evaluated.breaches;
}

/**
 * Asks focus to decide each alert and reads its state. When focus is down the
 * alerts are delivered as they are: a missed battery warning costs more than
 * one that is not held back, and no mute decision is sent.
 */
async function decide(
  services: ServiceClient,
  deps: IngestDeps,
  alerts: readonly Alert[],
): Promise<{ deliver: Alert[]; queued: number; mute?: MuteDirective; degradedBy: boolean }> {
  // Services cap a request at one list, so a flood is cut rather than rejected.
  const routed = alerts.slice(0, LIMITS.listSize);
  const route = await orDegraded('focus', () =>
    services.call('focus', {
      method: 'POST',
      path: '/route',
      body: { alerts: routed },
      response: RouteReply,
    }),
  );
  if (route.value === null) {
    return { deliver: routed, queued: 0, degradedBy: true };
  }
  const mute = await readMute(services, deps);
  return {
    deliver: route.value.deliver,
    queued: route.value.queued,
    ...(mute === null ? {} : { mute }),
    degradedBy: mute === null,
  };
}

/** The apps "mute new apps" adds to the mute list, read only when the active profile has it on. */
async function readKnownApps(
  services: ServiceClient,
  state: FocusState,
  profiles: readonly Profile[],
): Promise<AppId[] | null> {
  const active = state.active ? profiles.find((profile) => profile.id === state.profileId) : null;
  if (active?.muteNewApps !== true) {
    return [];
  }
  const known = await orDegraded('focus', () =>
    services.call('focus', { method: 'GET', path: '/known-apps', response: KnownAppsReply }),
  );
  return known.value === null ? null : known.value.items.map((app) => app.appId);
}

async function readMute(services: ServiceClient, deps: IngestDeps): Promise<MuteDirective | null> {
  // After `/route`, which closes a session that has run out.
  const state = await orDegraded('focus', () =>
    services.call('focus', { method: 'GET', path: '/state', response: FocusState }),
  );
  if (state.value === null) {
    return null;
  }
  const profiles = state.value.active
    ? await orDegraded('focus', () =>
        services.call('focus', { method: 'GET', path: '/profiles', response: ProfilesReply }),
      )
    : { value: { items: [] } };
  if (profiles.value === null) {
    return null;
  }
  const known = await readKnownApps(services, state.value, profiles.value.items);
  if (known === null) {
    return null;
  }
  return buildMuteDirective(state.value, profiles.value.items, await deps.systemApps(), known);
}

/**
 * `POST /v1/ingest` (SPEC §3): splits the batch across sessions, battery and
 * system; forwards closed sessions to reports and goals; routes every alert
 * through focus; and answers with what to notify now and what to mute.
 *
 * Every data owner (sessions, battery, system, reports, goals) is idempotent
 * on a retried batch, so its failure fails the request with a 5xx and the
 * agent resends. Only focus degrades: its alerts fail open.
 */
export function createIngest(deps: IngestDeps): RouteHandler<'ingest'> {
  return async ({ services, body }) => {
    const stored = await storeSamples(services, deps, body);
    const goalAlerts = await countAndEvaluate(services, stored.closed);
    const decision = await decide(services, deps, [...stored.alerts, ...goalAlerts]);
    const degraded: ServiceName[] = decision.degradedBy ? ['focus'] : [];
    return {
      accepted: stored.accepted,
      deliver: decision.deliver,
      queued: decision.queued,
      degraded,
      ...(decision.mute === undefined ? {} : { mute: decision.mute }),
    };
  };
}
