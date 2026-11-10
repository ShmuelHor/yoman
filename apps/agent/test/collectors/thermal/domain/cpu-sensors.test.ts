import { describe, expect, it } from 'vitest';
import {
  isCpuCoolingDevice,
  isCpuHwmon,
  isCpuThermalZone,
} from '../../../../src/collectors/thermal/domain/cpu-sensors.js';

describe('isCpuHwmon', () => {
  it.each(['coretemp\n', 'k10temp\n', 'zenpower\n', 'cpu_thermal\n'])(
    'takes %j for a CPU driver',
    (name) => {
      // Act / Assert
      expect(isCpuHwmon(name)).toBe(true);
    },
  );

  it.each(['acpitz\n', 'nvme\n', 'BAT0\n', 'iwlwifi_1\n', 'amdgpu\n', '', undefined])(
    'does not take %j for the CPU',
    (name) => {
      // Act / Assert
      expect(isCpuHwmon(name)).toBe(false);
    },
  );
});

describe('isCpuThermalZone', () => {
  it.each(['x86_pkg_temp\n', 'TCPU\n', 'cpu-thermal\n', 'cpu0-thermal\n', 'cpu-big0-thermal\n'])(
    'takes %j for the CPU',
    (type) => {
      // Act / Assert
      expect(isCpuThermalZone(type)).toBe(true);
    },
  );

  it.each(['acpitz\n', 'TCPU_PCI\n', 'INT3400 Thermal\n', 'gpu-thermal\n', 'SEN1\n', undefined])(
    'does not take %j for the CPU',
    (type) => {
      // Act / Assert
      expect(isCpuThermalZone(type)).toBe(false);
    },
  );

  it('rejects a type longer than any real one', () => {
    // Act / Assert
    expect(isCpuThermalZone(`cpu-${'x'.repeat(Number('64'))}-thermal`)).toBe(false);
  });
});

describe('isCpuCoolingDevice', () => {
  it.each(['Processor\n', 'intel_powerclamp\n', 'thermal-cpufreq-0\n', 'cpufreq-cpu4\n'])(
    'takes %j as CPU throttling',
    (type) => {
      // Act / Assert
      expect(isCpuCoolingDevice(type)).toBe(true);
    },
  );

  it.each(['Fan\n', 'PCIe_Port_Link_Speed_0000:00:06.0\n', 'devfreq-gpu\n', undefined])(
    'does not take %j as CPU throttling',
    (type) => {
      // Act / Assert
      expect(isCpuCoolingDevice(type)).toBe(false);
    },
  );
});
