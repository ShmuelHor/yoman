import { FIXTURE_NOW, windowSampleFixture } from '@yoman/shared/fixtures/data';
import type { BatterySample, PressureSample, ThermalSample } from '@yoman/shared/ingest';

export const windowSample = windowSampleFixture;

export const batterySample: BatterySample = {
  kind: 'battery',
  ts: FIXTURE_NOW,
  energyFullWh: 50,
  energyFullDesignWh: 60,
  cycleCount: 100,
  powerW: 8,
  capacityPct: 14,
  status: 'discharging',
};

export const pressureSample: PressureSample = {
  kind: 'pressure',
  ts: FIXTURE_NOW,
  cpu: { some: 1, full: 0 },
  memory: { some: 2, full: 0 },
  io: { some: 3, full: 0 },
  memAvailablePct: 50,
  swapActive: false,
};

export const thermalSample: ThermalSample = {
  kind: 'thermal',
  ts: FIXTURE_NOW,
  cpuTempC: 60,
  throttled: false,
};
