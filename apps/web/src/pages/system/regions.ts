import type { Incident } from '@yoman/shared/system';

export interface Region {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
}

/**
 * The stretches of the chart's time axis to shade for incidents. An incident is
 * clipped to the day shown, an open one runs to `now` (or the end of the day),
 * and one entirely outside the day is dropped.
 */
export function incidentRegions(
  incidents: readonly Incident[],
  bounds: { start: Date; end: Date },
  now: Date,
): Region[] {
  const regions: Region[] = [];
  for (const incident of incidents) {
    const start = new Date(Math.max(Date.parse(incident.start), bounds.start.getTime()));
    const rawEnd = incident.end === null ? now.getTime() : Date.parse(incident.end);
    const end = new Date(Math.min(rawEnd, bounds.end.getTime()));
    if (start.getTime() < end.getTime()) {
      regions.push({ id: incident.id, start, end });
    }
  }
  return regions;
}
