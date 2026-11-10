import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../../src/core/registry.js';

const ACTUATORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'actuators');

describe('muter plugin', () => {
  it('is picked up by the actuator registry', async () => {
    const registry = await loadRegistry({ dir: ACTUATORS_DIR, kind: 'actuator' });

    expect(registry.get('muter')).toMatchObject({ kind: 'actuator', name: 'muter' });
  });
});
