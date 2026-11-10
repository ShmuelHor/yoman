import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../../src/core/registry.js';

const ACTUATORS_DIR = join(import.meta.dirname, '..', '..', '..', 'src', 'actuators');

describe('notifier plugin', () => {
  it('is picked up by the actuator registry', async () => {
    // Act
    const registry = await loadRegistry({ dir: ACTUATORS_DIR, kind: 'actuator' });

    // Assert
    expect(registry.get('notifier')).toMatchObject({ kind: 'actuator', name: 'notifier' });
  });
});
