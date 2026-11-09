import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listBatteries,
  MAX_ATTRIBUTE_BYTES,
  readBatteryFiles,
} from '../../../../src/collectors/battery/adapters/sysfs.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const OVERSIZED_ATTRIBUTE = 'x'.repeat(MAX_ATTRIBUTE_BYTES + 1);

describe('listBatteries', () => {
  it('lists BAT devices and skips AC adapters and peripheral batteries', async () => {
    // Act / Assert
    expect(await listBatteries(join(FIXTURES, 'laptop'))).toEqual(['BAT0']);
  });

  it('lists every battery in name order', async () => {
    // Act / Assert
    expect(await listBatteries(join(FIXTURES, 'dual'))).toEqual(['BAT0', 'BAT1', 'BAT2']);
  });

  it('finds nothing on a desktop', async () => {
    // Act / Assert
    expect(await listBatteries(join(FIXTURES, 'desktop'))).toEqual([]);
  });

  it('finds nothing when the power_supply class does not exist', async () => {
    // Act / Assert
    expect(await listBatteries(join(FIXTURES, 'no-such-dir'))).toEqual([]);
  });
});

describe('readBatteryFiles', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yoman-battery-'));
    await mkdir(join(dir, 'BAT0'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the attributes the driver exposes and ignores the rest', async () => {
    // Act
    const files = await readBatteryFiles(join(FIXTURES, 'laptop'), 'BAT0');

    // Assert
    expect(files).toEqual({
      present: '1\n',
      status: 'Discharging\n',
      capacity: '76\n',
      cycle_count: '312\n',
      energy_full: '45120000\n',
      energy_full_design: '57020000\n',
      power_now: '8450000\n',
      voltage_now: '11920000\n',
    });
  });

  it('drops an attribute too large to be a sysfs value', async () => {
    // Arrange
    await writeFile(join(dir, 'BAT0', 'status'), OVERSIZED_ATTRIBUTE);

    // Act / Assert
    expect(await readBatteryFiles(dir, 'BAT0')).toEqual({});
  });

  it('fails loudly on an unexpected read error', async () => {
    // Arrange: a directory where a file should be.
    await mkdir(join(dir, 'BAT0', 'status'));

    // Act / Assert
    await expect(readBatteryFiles(dir, 'BAT0')).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
