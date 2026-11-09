import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../../src/core/registry.js';

const COLLECTORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'collectors');

describe('lock plugin', () => {
  it('is picked up by the collector registry as an event-driven collector', async () => {
    // Act
    const registry = await loadRegistry({ dir: COLLECTORS_DIR, kind: 'collector' });

    // Assert
    const lock = registry.get('lock');
    expect(lock).toMatchObject({ kind: 'collector', name: 'lock' });
    expect(lock?.intervalMs).toBeUndefined();
  });
});
