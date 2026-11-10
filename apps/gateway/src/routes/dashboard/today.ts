import { BatteryNow } from '@yoman/shared/battery';
import type { TimeRangeQuery } from '@yoman/shared/common';
import { FocusState } from '@yoman/shared/focus';
import { DayReport } from '@yoman/shared/reports';
import { IncidentList } from '@yoman/shared/system';

import type { RouteHandler } from '../../core/route-handler.js';
import { degradedServices, orDegraded } from '../../core/service-client.js';

/**
 * An open incident overlaps any range that reaches the present, so a short
 * one is enough to find it. The minute ahead of the gateway's clock covers an
 * incident whose start the agent stamped a moment later than "now" here.
 */
const OPEN_INCIDENTS_LOOKAHEAD_MS = 60_000;

export interface DashboardDeps {
  /** Epoch milliseconds. */
  readonly now: () => number;
}

/** The system service's `/incidents` range that contains every incident still open at `nowMs`. */
export function openIncidentsRange(nowMs: number): TimeRangeQuery {
  return {
    from: new Date(nowMs).toISOString(),
    to: new Date(nowMs + OPEN_INCIDENTS_LOOKAHEAD_MS).toISOString(),
  };
}

function onlyOpen(list: IncidentList): IncidentList {
  return { items: list.items.filter((incident) => incident.end === null) };
}

/**
 * `GET /v1/dashboard/today` (SPEC §3): reports, battery, system and focus are
 * called in parallel. A service that is down or late leaves its section `null`
 * and is named in `degraded`; the rest of the page still renders.
 */
export function createDashboardToday(deps: DashboardDeps): RouteHandler<'dashboardToday'> {
  return async ({ services }) => {
    const [reports, battery, incidents, focus] = await Promise.all([
      orDegraded('reports', () =>
        services.call('reports', { method: 'GET', path: '/today', response: DayReport }),
      ),
      orDegraded('battery', () =>
        // `null` here is a device without a battery, not an outage.
        services.call('battery', { method: 'GET', path: '/now', response: BatteryNow.nullable() }),
      ),
      orDegraded('system', () =>
        services.call('system', {
          method: 'GET',
          path: '/incidents',
          query: openIncidentsRange(deps.now()),
          response: IncidentList,
        }),
      ),
      orDegraded('focus', () =>
        services.call('focus', { method: 'GET', path: '/state', response: FocusState }),
      ),
    ]);
    return {
      data: {
        reports: reports.value,
        battery: battery.value,
        openIncidents: incidents.value === null ? null : onlyOpen(incidents.value),
        focus: focus.value,
      },
      degraded: degradedServices([reports, battery, incidents, focus]),
    };
  };
}
