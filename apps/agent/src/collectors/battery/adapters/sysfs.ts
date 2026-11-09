import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BATTERY_ATTRIBUTES,
  type BatteryAttribute,
  type BatteryFiles,
} from '../domain/battery-reading.js';

/** Where the kernel exposes batteries, AC adapters and peripheral batteries. */
export const POWER_SUPPLY_ROOT = '/sys/class/power_supply';

/** Laptop batteries only: `BAT0`, `BAT1`. Mice and headsets are `hid-*` and stay out. */
const BATTERY_DEVICE = /^BAT\d+$/;

/** A sysfs attribute is a few bytes; anything bigger is not a battery value. */
export const MAX_ATTRIBUTE_BYTES = 64;

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

/** `ENOENT`: the driver does not expose it. `ENODEV`/`EIO`: the battery is mid-update or gone. */
const MISSING_CODES = new Set(['ENOENT', 'ENODEV', 'EIO']);

/**
 * Battery device names under `root`, sorted. A missing `root` (a container,
 * or a kernel without power_supply) means no batteries.
 */
export async function listBatteries(root: string): Promise<string[]> {
  try {
    const names = await readdir(root);
    return names.filter((name) => BATTERY_DEVICE.test(name)).sort();
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readAttribute(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path, 'utf8');
    return content.length > MAX_ATTRIBUTE_BYTES ? undefined : content;
  } catch (error: unknown) {
    if (MISSING_CODES.has(String(errorCode(error)))) {
      return undefined;
    }
    throw error;
  }
}

/** Reads every attribute the domain knows; an attribute the driver lacks is left out. */
export async function readBatteryFiles(root: string, battery: string): Promise<BatteryFiles> {
  const dir = join(root, battery);
  const values = await Promise.all(
    BATTERY_ATTRIBUTES.map(
      async (attribute): Promise<[BatteryAttribute, string | undefined]> => [
        attribute,
        await readAttribute(join(dir, attribute)),
      ],
    ),
  );
  return Object.fromEntries(values.filter(([, value]) => value !== undefined));
}
