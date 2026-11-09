import { describe, expect, it } from 'vitest';

import { BatteryConfig } from '../src/config.js';

describe('BatteryConfig', () => {
  it('counts days in UTC unless TZ names a zone', () => {
    expect(BatteryConfig.parse({}).TZ).toBe('UTC');
    expect(BatteryConfig.parse({ TZ: 'Asia/Jerusalem' }).TZ).toBe('Asia/Jerusalem');
  });

  it('rejects a TZ that is not an IANA zone', () => {
    expect(BatteryConfig.safeParse({ TZ: 'Mars/Olympus_Mons' }).success).toBe(false);
  });
});
