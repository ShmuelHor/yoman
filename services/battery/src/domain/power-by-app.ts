import type { AppPower } from '@yoman/shared/battery';
import { LIMITS } from '@yoman/shared/limits';

import { isDraining, type PowerReading } from './reading.js';

const MS_PER_SECOND = 1_000;
/** Two decimal places, like the watts the agent reports. */
const WATT_PRECISION = 100;

/** An app in focus over `[startMs, endMs)`: one session from the gateway's timeline. */
export interface FocusSpan {
  readonly appId: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface Range {
  readonly fromMs: number;
  readonly toMs: number;
}

interface Tally {
  focusMs: number;
  drawW: number;
  readings: number;
}

/** The spans inside the range, clipped to it and sorted by start; empty ones are dropped. */
function clip(spans: readonly FocusSpan[], range: Range): FocusSpan[] {
  return spans
    .map((span) => ({
      appId: span.appId,
      startMs: Math.max(span.startMs, range.fromMs),
      endMs: Math.min(span.endMs, range.toMs),
    }))
    .filter((span) => span.startMs < span.endMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/** The span holding `tsMs`, by binary search: sessions never overlap, so it is the last one starting at or before it. */
function spanAt(spans: readonly FocusSpan[], tsMs: number): FocusSpan | undefined {
  let low = 0;
  let high = spans.length - 1;
  let found: FocusSpan | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const span = spans[middle];
    if (span === undefined || span.startMs > tsMs) {
      high = middle - 1;
    } else {
      found = span;
      low = middle + 1;
    }
  }
  return found !== undefined && tsMs < found.endMs ? found : undefined;
}

function tallyOf(tallies: Map<string, Tally>, appId: string): Tally {
  const existing = tallies.get(appId);
  if (existing !== undefined) {
    return existing;
  }
  const created = { focusMs: 0, drawW: 0, readings: 0 };
  tallies.set(appId, created);
  return created;
}

/**
 * Per-app power attribution (SPEC §5 battery): each discharging reading is
 * charged to the app in focus at that moment, and an app's `averageW` is the
 * mean of its readings. `seconds` is the app's focus time in the range. Apps
 * with no discharging reading have no measured draw and are left out.
 * Highest draw first, then the longest focus, then by app id.
 */
export function attributePower(
  range: Range,
  spans: readonly FocusSpan[],
  readings: readonly PowerReading[],
): AppPower[] {
  const clipped = clip(spans, range);
  const tallies = new Map<string, Tally>();
  for (const span of clipped) {
    tallyOf(tallies, span.appId).focusMs += span.endMs - span.startMs;
  }
  for (const reading of readings) {
    if (!isDraining(reading) || reading.tsMs < range.fromMs || reading.tsMs >= range.toMs) {
      continue;
    }
    const span = spanAt(clipped, reading.tsMs);
    if (span !== undefined) {
      const tally = tallyOf(tallies, span.appId);
      tally.drawW += reading.powerW;
      tally.readings += 1;
    }
  }
  return [...tallies.entries()]
    .filter(([, tally]) => tally.readings > 0)
    .map(([appId, tally]) => ({
      appId,
      averageW: Math.round((tally.drawW / tally.readings) * WATT_PRECISION) / WATT_PRECISION,
      seconds: Math.round(tally.focusMs / MS_PER_SECOND),
    }))
    .sort(
      (a, b) => b.averageW - a.averageW || b.seconds - a.seconds || (a.appId < b.appId ? -1 : 1),
    )
    .slice(0, LIMITS.listSize);
}
