import type { IngestBatch } from '@yoman/shared/ingest';
import { describe, expect, it } from 'vitest';

import { splitBatch } from '../../../src/routes/ingest/split-batch.js';
import { batterySample, pressureSample, thermalSample, windowSample } from './samples.js';

const batch = (samples: IngestBatch['samples']): IngestBatch => ({
  agentVersion: '0.1.0',
  samples,
});

describe('splitBatch', () => {
  it('sends each sample kind to the service that owns it', () => {
    const split = splitBatch(
      batch([windowSample, batterySample, pressureSample, thermalSample, windowSample]),
    );

    expect(split.windows).toEqual([windowSample, windowSample]);
    expect(split.battery).toEqual([batterySample]);
    expect(split.system).toEqual([pressureSample, thermalSample]);
  });

  it('leaves a group empty when the batch has none of its samples', () => {
    const split = splitBatch(batch([windowSample]));

    expect(split.battery).toEqual([]);
    expect(split.system).toEqual([]);
  });
});
