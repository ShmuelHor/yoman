import { incidentFixture } from '@yoman/shared/fixtures/data';
import type { Incident } from '@yoman/shared/system';
import { describe, expect, it } from 'vitest';

import { dayBounds } from '../../../src/pages/system/day.js';
import { incidentRegions } from '../../../src/pages/system/regions.js';

const BOUNDS = dayBounds('2026-11-08');
const NOW = new Date('2026-11-08T23:00:00');

function incident(start: string, end: string | null): Incident {
  return { ...incidentFixture, start, end };
}

describe('incidentRegions', () => {
  it('keeps an incident inside the day as it is', () => {
    const regions = incidentRegions(
      [incident('2026-11-08T08:12:00.000Z', '2026-11-08T08:14:30.000Z')],
      BOUNDS,
      NOW,
    );

    expect(regions).toEqual([
      {
        id: incidentFixture.id,
        start: new Date('2026-11-08T08:12:00.000Z'),
        end: new Date('2026-11-08T08:14:30.000Z'),
      },
    ]);
  });

  it('clips an incident that began before the day', () => {
    const [region] = incidentRegions(
      [incident('2026-11-06T00:00:00.000Z', '2026-11-08T05:00:00')],
      BOUNDS,
      NOW,
    );

    expect(region?.start).toEqual(BOUNDS.start);
  });

  it('runs an open incident to now', () => {
    const [region] = incidentRegions([incident('2026-11-08T10:00:00', null)], BOUNDS, NOW);

    expect(region?.end).toEqual(NOW);
  });

  it('drops an incident on another day', () => {
    expect(
      incidentRegions([incident('2026-11-01T10:00:00', '2026-11-01T10:05:00')], BOUNDS, NOW),
    ).toEqual([]);
  });
});
