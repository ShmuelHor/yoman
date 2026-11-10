import { describe, expect, it } from 'vitest';
import {
  parsePressureReading,
  parsePressureValues,
} from '../../../../src/collectors/pressure/domain/pressure.js';

const CPU = [
  'some avg10=42.17 avg60=5.51 avg300=9.30 total=591438958',
  'full avg10=0.00 avg60=0.00 avg300=0.00 total=0',
  '',
].join('\n');
const MEMORY = [
  'some avg10=3.50 avg60=1.00 avg300=0.02 total=5177581',
  'full avg10=1.25 avg60=0.40 avg300=0.00 total=3904218',
  '',
].join('\n');
const IO = [
  'some avg10=0.00 avg60=0.00 avg300=0.02 total=19852767',
  'full avg10=0.00 avg60=0.00 avg300=0.00 total=15141851',
  '',
].join('\n');

const OVERSIZED_DIGITS = 400;

describe('parsePressureValues', () => {
  it('reads the some and full avg10 values', () => {
    // Act / Assert
    expect(parsePressureValues(MEMORY)).toEqual({ some: 3.5, full: 1.25 });
  });

  it('reads a missing cpu full line as no full stall, as on kernels before 5.13', () => {
    // Arrange
    const oldKernel = 'some avg10=12.00 avg60=1.00 avg300=0.50 total=100\n';

    // Act / Assert
    expect(parsePressureValues(oldKernel)).toEqual({ some: 12, full: 0 });
  });

  it.each([
    ['an empty file', ''],
    ['no some line', 'full avg10=1.00 avg60=0.00 avg300=0.00 total=0\n'],
    ['a value above 100%', 'some avg10=100.01 avg60=0.00 avg300=0.00 total=0\n'],
    ['a negative value', 'some avg10=-1.00 avg60=0.00 avg300=0.00 total=0\n'],
    ['a value that is not a number', 'some avg10=NaN avg60=0.00 avg300=0.00 total=0\n'],
    ['an oversized number', `some avg10=${'9'.repeat(OVERSIZED_DIGITS)}.00 avg60=0.00 total=0\n`],
    [
      'a malformed full line',
      'some avg10=1.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=x avg60=0.00 total=0\n',
    ],
  ])('rejects %s', (_case, text) => {
    // Act / Assert
    expect(parsePressureValues(text)).toBeUndefined();
  });
});

describe('parsePressureReading', () => {
  it('reads all three resources', () => {
    // Act / Assert
    expect(parsePressureReading({ cpu: CPU, memory: MEMORY, io: IO })).toEqual({
      cpu: { some: 42.17, full: 0 },
      memory: { some: 3.5, full: 1.25 },
      io: { some: 0, full: 0 },
    });
  });

  it('needs every resource, so a partial reading is never sent', () => {
    // Act / Assert
    expect(parsePressureReading({ cpu: CPU, memory: MEMORY })).toBeUndefined();
    expect(parsePressureReading({ cpu: CPU, memory: 'garbage', io: IO })).toBeUndefined();
  });
});
