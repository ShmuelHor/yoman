import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isCpuCoolingDevice, isCpuHwmon, isCpuThermalZone } from '../domain/cpu-sensors.js';

/** The sysfs mount; tests point the collector at a fixture tree instead. */
export const SYS_ROOT = '/sys';

const HWMON_DIR = join('class', 'hwmon');
const THERMAL_DIR = join('class', 'thermal');
const CPU_DIR = join('devices', 'system', 'cpu');
const THROTTLE_COUNTERS = ['core_throttle_count', 'package_throttle_count'] as const;

const HWMON_DEVICE = /^hwmon\d{1,4}$/;
const TEMPERATURE_INPUT = /^temp\d{1,3}_input$/;
const THERMAL_ZONE = /^thermal_zone\d{1,4}$/;
const COOLING_DEVICE = /^cooling_device\d{1,4}$/;
const CPU_DEVICE = /^cpu\d{1,4}$/;

/**
 * At most this many devices of one kind are read, so a huge machine cannot
 * turn one 30 s tick into thousands of reads (SPEC §4.4).
 */
export const MAX_DEVICES = 512;

/** A temperature, state or counter is a few bytes; anything bigger is not one. */
export const MAX_ATTRIBUTE_BYTES = 64;

/**
 * `ENOENT`: the driver does not expose it. `ENODEV`/`ENXIO`/`EIO`: the
 * device is gone or mid-reset. `ENODATA`/`EAGAIN`: a sensor with no reading
 * yet. `EACCES`: an attribute only root may read.
 */
const MISSING_CODES = new Set(['ENOENT', 'ENODEV', 'ENXIO', 'EIO', 'ENODATA', 'EAGAIN', 'EACCES']);

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

/** Where to read the CPU's temperature and throttling on this machine. */
export interface ThermalSources {
  /** CPU temperature attributes, in millidegrees. */
  readonly temperatures: readonly string[];
  /** `cur_state` of every cooling device that throttles the CPU. */
  readonly coolingStates: readonly string[];
  /** Intel's per-core and per-package hardware throttle counters. */
  readonly throttleCounters: readonly string[];
}

/** One attribute, or `undefined` when it is missing, unreadable or oversized. */
export async function readAttribute(path: string): Promise<string | undefined> {
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

/** Reads every attribute in order; a missing one is `undefined`. */
export function readAttributes(paths: readonly string[]): Promise<(string | undefined)[]> {
  return Promise.all(paths.map(readAttribute));
}

/** The entries of `dir` that match `pattern`, in natural order; a missing `dir` has none. */
async function listMatching(dir: string, pattern: RegExp): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error: unknown) {
    if (MISSING_CODES.has(String(errorCode(error))) || errorCode(error) === 'ENOTDIR') {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .slice(0, MAX_DEVICES)
    .map((name) => join(dir, name));
}

/** Devices under `dir` whose `attribute` (a `name` or `type`) passes `accept`. */
async function devicesWhere(
  dir: string,
  pattern: RegExp,
  attribute: string,
  accept: (value: string | undefined) => boolean,
): Promise<string[]> {
  const devices = await listMatching(dir, pattern);
  const values = await readAttributes(devices.map((device) => join(device, attribute)));
  return devices.filter((_device, index) => accept(values[index]));
}

async function hwmonTemperatures(root: string): Promise<string[]> {
  const devices = await devicesWhere(join(root, HWMON_DIR), HWMON_DEVICE, 'name', isCpuHwmon);
  const inputs = await Promise.all(
    devices.map((device) => listMatching(device, TEMPERATURE_INPUT)),
  );
  return inputs.flat().slice(0, MAX_DEVICES);
}

async function zoneTemperatures(root: string): Promise<string[]> {
  const zones = await devicesWhere(join(root, THERMAL_DIR), THERMAL_ZONE, 'type', isCpuThermalZone);
  return zones.map((zone) => join(zone, 'temp'));
}

async function coolingStates(root: string): Promise<string[]> {
  const devices = await devicesWhere(
    join(root, THERMAL_DIR),
    COOLING_DEVICE,
    'type',
    isCpuCoolingDevice,
  );
  return devices.map((device) => join(device, 'cur_state'));
}

/** The throttle counters this kernel exposes; Intel only, and not inside most VMs. */
async function throttleCounters(root: string): Promise<string[]> {
  const cpus = await listMatching(join(root, CPU_DIR), CPU_DEVICE);
  const candidates = cpus.flatMap((cpu) =>
    THROTTLE_COUNTERS.map((counter) => join(cpu, 'thermal_throttle', counter)),
  );
  const values = await readAttributes(candidates);
  return candidates.filter((_path, index) => values[index] !== undefined).slice(0, MAX_DEVICES);
}

/**
 * Finds the CPU's sensors once (SPEC §4.1: `/sys/class/thermal` and
 * `/sys/class/hwmon`). The CPU driver's hwmon device is preferred, since it
 * reports per core; a CPU thermal zone is the fallback, which is all most
 * ARM boards have.
 */
export async function discoverThermalSources(root: string): Promise<ThermalSources> {
  const [hwmon, zones, cooling, counters] = await Promise.all([
    hwmonTemperatures(root),
    zoneTemperatures(root),
    coolingStates(root),
    throttleCounters(root),
  ]);
  return {
    temperatures: hwmon.length > 0 ? hwmon : zones,
    coolingStates: cooling,
    throttleCounters: counters,
  };
}
