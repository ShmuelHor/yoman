import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverThermalSources,
  MAX_ATTRIBUTE_BYTES,
  readAttribute,
  readAttributes,
} from '../../../../src/collectors/thermal/adapters/sysfs.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

function relativeTo(root: string, paths: readonly string[]): string[] {
  return paths.map((path) => path.slice(root.length + 1));
}

describe('discoverThermalSources', () => {
  it('prefers the CPU driver over thermal zones and skips board and disk sensors', async () => {
    // Arrange
    const root = join(FIXTURES, 'intel-laptop');

    // Act
    const sources = await discoverThermalSources(root);

    // Assert
    expect(relativeTo(root, sources.temperatures)).toEqual([
      'class/hwmon/hwmon2/temp1_input',
      'class/hwmon/hwmon2/temp2_input',
      'class/hwmon/hwmon2/temp3_input',
      'class/hwmon/hwmon2/temp10_input',
    ]);
  });

  it('finds the cooling devices that throttle the CPU, not the fans', async () => {
    // Arrange
    const root = join(FIXTURES, 'intel-laptop');

    // Act
    const sources = await discoverThermalSources(root);

    // Assert
    expect(relativeTo(root, sources.coolingStates)).toEqual([
      'class/thermal/cooling_device1/cur_state',
      'class/thermal/cooling_device2/cur_state',
    ]);
  });

  it('finds the hardware throttle counters of every CPU', async () => {
    // Arrange
    const root = join(FIXTURES, 'intel-laptop');

    // Act
    const sources = await discoverThermalSources(root);

    // Assert
    expect(relativeTo(root, sources.throttleCounters)).toEqual([
      'devices/system/cpu/cpu0/thermal_throttle/core_throttle_count',
      'devices/system/cpu/cpu0/thermal_throttle/package_throttle_count',
      'devices/system/cpu/cpu1/thermal_throttle/core_throttle_count',
      'devices/system/cpu/cpu1/thermal_throttle/package_throttle_count',
    ]);
  });

  it('falls back to the CPU thermal zone on a board without a CPU hwmon driver', async () => {
    // Arrange
    const root = join(FIXTURES, 'arm-board');

    // Act
    const sources = await discoverThermalSources(root);

    // Assert
    expect(relativeTo(root, sources.temperatures)).toEqual(['class/thermal/thermal_zone0/temp']);
    expect(relativeTo(root, sources.coolingStates)).toEqual([
      'class/thermal/cooling_device0/cur_state',
    ]);
    expect(sources.throttleCounters).toEqual([]);
  });

  it('finds no CPU sensor on a virtual machine', async () => {
    // Act / Assert
    expect(await discoverThermalSources(join(FIXTURES, 'virtual-machine'))).toEqual({
      temperatures: [],
      coolingStates: [],
      throttleCounters: [],
    });
  });

  it('finds nothing when sysfs is not mounted', async () => {
    // Act / Assert
    expect(await discoverThermalSources(join(FIXTURES, 'no-such-dir'))).toEqual({
      temperatures: [],
      coolingStates: [],
      throttleCounters: [],
    });
  });
});

describe('readAttribute', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-thermal-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a small attribute', async () => {
    // Arrange
    await writeFile(join(dir, 'temp'), '52000\n');

    // Act / Assert
    expect(await readAttribute(join(dir, 'temp'))).toBe('52000\n');
  });

  it('reads an oversized attribute as absent', async () => {
    // Arrange
    await writeFile(join(dir, 'temp'), '1'.repeat(MAX_ATTRIBUTE_BYTES + 1));

    // Act / Assert
    expect(await readAttribute(join(dir, 'temp'))).toBeUndefined();
  });

  it('reads a missing attribute as absent, as when a driver is unloaded', async () => {
    // Act / Assert
    expect(await readAttributes([join(dir, 'gone'), join(dir, 'also-gone')])).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('fails loudly on an error that is not a missing sensor', async () => {
    // Act / Assert: reading a directory as a file is a bug, not a missing sensor.
    await expect(readAttribute(dir)).rejects.toThrow();
  });
});
