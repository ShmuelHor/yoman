import type { Alert } from '@yoman/shared/alerts';
import type { AppId } from '@yoman/shared/common';
import { FocusState, type MuteDirective } from '@yoman/shared/focus';
import { LIMITS } from '@yoman/shared/limits';

import type { RouteHandler } from '../../core/route-handler.js';
import { degradedServices, orDegraded, type ServiceClient } from '../../core/service-client.js';
import type { ThresholdsProvider } from '../system/thresholds.js';
import {
  AlertingReply,
  type ClosedSession,
  CountedReply,
  DayUsage,
  EvaluateReply,
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
 */
async function countAndEvaluate(
  services: ServiceClient,
  closed: readonly ClosedSession[],
): Promise<{ alerts: Alert[]; degradedBy: ReturnType<typeof degradedServices> }> {
  if (closed.length === 0) {
    return { alerts: [], degradedBy: [] };
  }
  const counted = await orDegraded('reports', () =>
    services.call('reports', {
      method: 'POST',
      path: '/sessions',
      body: { sessions: closed },
      response: CountedReply,
    }),
  );
  if (counted.value === null) {
    return { alerts: [], degradedBy: ['reports'] };
  }
  const usage = await orDegraded('reports', () =>
    services.call('reports', { method: 'GET', path: '/today', response: DayUsage }),
  );
  if (usage.value === null) {
    return { alerts: [], degradedBy: ['reports'] };
  }
  const evaluated = await orDegraded('goals', () =>
    services.call('goals', {
      method: 'POST',
      path: '/evaluate',
      body: {
        date: usage.value.date,
        apps: usage.value.topApps,
        categories: usage.value.byCategory,
      },
      response: EvaluateReply,
    }),
  );
  return evaluated.value === null
    ? { alerts: [], degradedBy: ['goals'] }
    : { alerts: evaluated.value.breaches, degradedBy: [] };
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
  return buildMuteDirective(state.value, profiles.value.items, await deps.systemApps());
}

/**
 * `POST /v1/ingest` (SPEC §3): splits the batch across sessions, battery and
 * system; forwards closed sessions to reports and goals; routes every alert
 * through focus; and answers with what to notify now and what to mute.
 *
 * Sessions, battery and system are idempotent on a retried batch, so their
 * failure fails the request and the agent resends. Reports, goals and focus
 * are downstream of data that is already stored, so they degrade instead.
 */
export function createIngest(deps: IngestDeps): RouteHandler<'ingest'> {
  return async ({ services, body }) => {
    const stored = await storeSamples(services, deps, body);
    const evaluation = await countAndEvaluate(services, stored.closed);
    const decision = await decide(services, deps, [...stored.alerts, ...evaluation.alerts]);
    const degraded = degradedServices([
      ...evaluation.degradedBy.map((service) => ({ value: null, degradedBy: service })),
      ...(decision.degradedBy ? [{ value: null, degradedBy: 'focus' as const }] : []),
    ]);
    return {
      accepted: stored.accepted,
      deliver: decision.deliver,
      queued: decision.queued,
      degraded,
      ...(decision.mute === undefined ? {} : { mute: decision.mute }),
    };
  };
}
