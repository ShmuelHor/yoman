import { describe, expect, it } from 'vitest';

import { logCollectorError } from '../../src/core/error-log.js';
import { recordingLogger } from '../support/logs.js';

describe('logCollectorError', () => {
  it('logs the collector name and the error class, never the message', () => {
    const { logger, logs } = recordingLogger();

    logCollectorError(logger)('window', new TypeError('title: Secret Bank Statement'));

    expect(logs).toEqual([
      expect.objectContaining({ msg: 'collector failed', collector: 'window', error: 'TypeError' }),
    ]);
    expect(JSON.stringify(logs)).not.toContain('Secret');
  });

  it('records only the type of a thrown non-error', () => {
    const { logger, logs } = recordingLogger();

    logCollectorError(logger)('idle', 'cmdline=/bin/sh -c secret');

    expect(JSON.stringify(logs)).not.toContain('secret');
  });
});
