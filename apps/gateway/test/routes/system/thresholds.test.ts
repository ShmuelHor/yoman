import { Settings } from '@yoman/shared/settings';
import { describe, expect, it } from 'vitest';

import { defaultThresholds } from '../../../src/routes/system/thresholds.js';

describe('defaultThresholds', () => {
  it('provides the SPEC defaults, valid for the settings schema', async () => {
    const thresholds = await defaultThresholds();

    expect(thresholds).toEqual({ memory: 10, cpu: 40, io: 30 });
    expect(Settings.shape.thresholds.safeParse(thresholds).success).toBe(true);
  });
});
