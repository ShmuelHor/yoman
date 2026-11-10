import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WINDOW_INTERVAL_MS } from '../../../src/collectors/window/collector.js';
import { loadRegistry } from '../../../src/core/registry.js';

const COLLECTORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'collectors');

describe('window plugin', () => {
  it('is picked up by the collector registry under its folder name', async () => {
    // Act
    const registry = await loadRegistry({ dir: COLLECTORS_DIR, kind: 'collector' });

    // Assert
    expect(registry.get('window')).toMatchObject({
      kind: 'collector',
      name: 'window',
      intervalMs: WINDOW_INTERVAL_MS,
    });
  });
});
