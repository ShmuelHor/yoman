import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../../src/core/registry.js';

const COLLECTORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'collectors');

describe('battery plugin', () => {
  it('is picked up by the collector registry under its folder name', async () => {
    // Act
    const registry = await loadRegistry({ dir: COLLECTORS_DIR, kind: 'collector' });

    // Assert
    expect(registry.get('battery')).toMatchObject({ kind: 'collector', name: 'battery' });
  });
});
