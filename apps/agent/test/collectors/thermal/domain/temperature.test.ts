import { describe, expect, it } from 'vitest';
import {
  cpuTemperature,
  parseCelsius,
} from '../../../../src/collectors/thermal/domain/temperature.js';

describe('parseCelsius', () => {
  it.each([
    { text: '52000\n', celsius: 52 },
    { text: '44050\n', celsius: 44.05 },
    { text: '-5000\n', celsius: -5 },
    { text: '0\n', celsius: 0 },
  ])('reads $text millidegrees as $celsius °C', ({ text, celsius }) => {
    // Act / Assert
    expect(parseCelsius(text)).toBe(celsius);
  });

  it.each([
    ['a failed sensor', '-273000\n'],
    ['a stuck sensor', '255000\n'],
    ['a value past the contract', '150000\n'],
    ['text', 'N/A\n'],
    ['a fraction', '52.5\n'],
    ['an empty file', ''],
    ['more digits than any temperature', '12345678\n'],
  ])('rejects %s', (_name, text) => {
    // Act / Assert
    expect(parseCelsius(text)).toBeUndefined();
  });
});

const HOTTEST_C = 61;
const ROUNDED_C = 61.2;
const ONLY_USABLE_C = 47.5;

describe('cpuTemperature', () => {
  it('reports the hottest sensor', () => {
    // Act / Assert
    expect(cpuTemperature(['48000\n', '61000\n', '55000\n'])).toBe(HOTTEST_C);
  });

  it('rounds to a tenth of a degree', () => {
    // Act / Assert
    expect(cpuTemperature(['61237\n'])).toBe(ROUNDED_C);
  });

  it('skips unreadable and malformed sensors', () => {
    // Act / Assert
    expect(cpuTemperature([undefined, 'garbage\n', '-273000\n', '47500\n'])).toBe(ONLY_USABLE_C);
  });

  it('has no temperature when no sensor is usable', () => {
    // Act / Assert
    expect(cpuTemperature([undefined, 'garbage\n'])).toBeUndefined();
    expect(cpuTemperature([])).toBeUndefined();
  });
});
