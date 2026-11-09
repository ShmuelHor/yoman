import type { BatterySample } from '@yoman/shared/ingest';

import type { SampleResult } from '../contracts.js';
import { advanceAlerts } from '../domain/battery-alerts.js';
import { summarizeDay } from '../domain/daily.js';
import { healthPct } from '../domain/health.js';
import { sampleDate } from '../domain/sample-date.js';
import type { BatteryStore, StoredSample } from './store.js';

function toStored(sample: BatterySample): StoredSample {
  return {
    ts: sample.ts,
    tsMs: Date.parse(sample.ts),
    date: sampleDate(sample.ts),
    energyFullWh: sample.energyFullWh,
    energyFullDesignWh: sample.energyFullDesignWh,
    cycleCount: sample.cycleCount,
    powerW: sample.powerW,
    capacityPct: sample.capacityPct,
    status: sample.status,
    healthPct: healthPct(sample.energyFullWh, sample.energyFullDesignWh),
  };
}

/**
 * Stores a batch in one transaction: the new samples, the summaries of every
 * day they touch, and the alert rules' state. Returns the alerts the batch
 * raised. Samples already stored are dropped, so a retried batch is harmless.
 */
export function recordSamples(
  store: BatteryStore,
  samples: readonly BatterySample[],
): Promise<SampleResult> {
  const stored = samples.map(toStored);
  return store.transaction(async (tx) => {
    await tx.lockSamples();
    const accepted = await tx.insertSamples(stored);

    const before = await tx.alertState();
    const { state, alerts } = advanceAlerts(before, stored);
    if (state !== before) {
      await tx.saveAlertState(state);
    }

    // A day is summarized from all its stored samples, so the result never depends on batching.
    const dates = [...new Set(stored.map((sample) => sample.date))];
    const onDates = await tx.samplesOn(dates);
    const days = dates.flatMap(
      (date) =>
        summarizeDay(
          date,
          onDates.filter((sample) => sample.date === date),
        ) ?? [],
    );
    await tx.saveDays(days);

    return { accepted, duplicates: samples.length - accepted, alerts };
  });
}
