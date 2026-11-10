import { z } from 'zod';

/** A sysfs `name` or `type` attribute: one short word, like `coretemp` or `x86_pkg_temp`. */
const DeviceName = z
  .string()
  .trim()
  .regex(/^[\w .:+-]{1,64}$/);

/**
 * hwmon drivers that report the CPU itself: Intel (`coretemp`), AMD
 * (`k10temp`, `zenpower`), and ARM boards that register their CPU zone as
 * hwmon (`cpu_thermal`). Board sensors (`acpitz`) and disks (`nvme`) are
 * not the CPU, and their heat does not mean the CPU is hot.
 */
const CPU_HWMON_NAMES: ReadonlySet<string> = new Set([
  'coretemp',
  'k10temp',
  'zenpower',
  'cpu_thermal',
]);

/**
 * Thermal zones that measure the CPU: Intel's package sensor
 * (`x86_pkg_temp`), the firmware's CPU zone (`TCPU`), and the ARM device
 * tree names (`cpu-thermal`, `cpu0-thermal`, `cpu-big0-thermal`). `TCPU_PCI`
 * is the PCI bridge next to it.
 */
const CPU_ZONE_TYPE = /^(?:x86_pkg_temp|TCPU|cpu[\w-]*[-_]thermal)$/;

/**
 * Cooling devices that slow the CPU down: ACPI processor states
 * (`Processor`), forced idle (`intel_powerclamp`), and frequency capping
 * (`thermal-cpufreq-0` on older kernels, `cpufreq-cpu0` on newer ones). Fans
 * cool without slowing anything.
 */
const CPU_COOLING_TYPE = /^(?:Processor|intel_powerclamp|thermal-cpufreq-\d+|cpufreq-cpu\d+)$/;

function deviceName(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const result = DeviceName.safeParse(raw);
  return result.success ? result.data : undefined;
}

/** Whether a hwmon device's `name` is a CPU temperature driver. */
export function isCpuHwmon(name: string | undefined): boolean {
  const parsed = deviceName(name);
  return parsed !== undefined && CPU_HWMON_NAMES.has(parsed);
}

/** Whether a thermal zone's `type` is the CPU. */
export function isCpuThermalZone(type: string | undefined): boolean {
  const parsed = deviceName(type);
  return parsed !== undefined && CPU_ZONE_TYPE.test(parsed);
}

/** Whether a cooling device's `type` throttles the CPU when it is active. */
export function isCpuCoolingDevice(type: string | undefined): boolean {
  const parsed = deviceName(type);
  return parsed !== undefined && CPU_COOLING_TYPE.test(parsed);
}
