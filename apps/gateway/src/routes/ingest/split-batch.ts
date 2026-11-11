import type {
  BatterySample,
  IngestBatch,
  PressureSample,
  ProcessSample,
  ThermalSample,
  WindowSample,
} from '@yoman/shared/ingest';

export type SystemSample = PressureSample | ProcessSample | ThermalSample;

export interface SplitBatch {
  /** Window and idle samples, for sessions. */
  readonly windows: readonly WindowSample[];
  readonly battery: readonly BatterySample[];
  /** Load samples, for system. */
  readonly system: readonly SystemSample[];
}

/** Splits a batch by the service that owns each sample kind (SPEC §3, ingest flow). */
export function splitBatch(batch: IngestBatch): SplitBatch {
  const windows: WindowSample[] = [];
  const battery: BatterySample[] = [];
  const system: SystemSample[] = [];
  for (const sample of batch.samples) {
    switch (sample.kind) {
      case 'window':
        windows.push(sample);
        break;
      case 'battery':
        battery.push(sample);
        break;
      case 'pressure':
      case 'processes':
      case 'thermal':
        system.push(sample);
        break;
    }
  }
  return { windows, battery, system };
}
