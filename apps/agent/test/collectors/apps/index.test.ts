import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../../src/core/registry.js';

const COLLECTORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'collectors');

describe('apps plugin', () => {
  it('is picked up by the collector registry as an event-driven collector', async () => {
    // Act
    const registry = await loadRegistry({ dir: COLLECTORS_DIR, kind: 'collector' });

    // Assert
    const apps = registry.get('apps');
    expect(apps).toMatchObject({ kind: 'collector', name: 'apps' });
    expect(apps?.intervalMs).toBeUndefined();
  });
});
