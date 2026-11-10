import { describe, expect, it } from 'vitest';
import {
  parseProcessIo,
  parseProcessStat,
  parseResidentBytes,
  parseUptime,
} from '../../../../src/collectors/pressure/domain/process-files.js';

const PID = '4321';
const COMM_LIMIT = 64;
const COUNTER_DIGITS = 15;
const KERNEL_PID_LIMIT = '4194304';

/** A real `/proc/<pid>/stat` line with utime 120, stime 30, starttime 5000 and rss 2048. */
function stat(comm: string, pid = PID): string {
  return `${pid} (${comm}) S 1 1234 1234 0 -1 4194304 503 0 0 0 120 30 0 0 20 0 1 0 5000 18276352 2048 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 8 0 0 0 0 0\n`;
}

describe('parseProcessStat', () => {
  it('reads the name and the counters the snapshot needs', () => {
    // Act / Assert
    expect(parseProcessStat(stat('node'))).toEqual({
      pid: 4321,
      comm: 'node',
      cpuTicks: 150,
      startTicks: 5000,
      rssPages: 2048,
    });
  });

  it('keeps spaces and parentheses that a process put in its own name', () => {
    // Act / Assert
    expect(parseProcessStat(stat('Web (Content) 1'))?.comm).toBe('Web (Content) 1');
  });

  it('masks control characters in the name', () => {
    // Act / Assert
    expect(parseProcessStat(stat('evil\nname\u001b'))?.comm).toBe('evil?name?');
  });

  it.each([
    ['an empty file', ''],
    ['no comm', '42 S 1 2 3\n'],
    ['an empty comm', stat('')],
    ['a pid of zero', stat('init', '0')],
    ['a pid above the kernel limit', stat('big', `${KERNEL_PID_LIMIT}1`)],
    ['a truncated line', stat('node').split(' 120 ')[0] ?? ''],
    ['a counter that is not a number', stat('node').replace(' 120 ', ' x ')],
    ['an oversized counter', stat('node').replace(' 120 ', ` ${'9'.repeat(COUNTER_DIGITS + 1)} `)],
    ['an oversized comm', stat('x'.repeat(COMM_LIMIT + 1))],
  ])('rejects %s', (_case, text) => {
    // Act / Assert
    expect(parseProcessStat(text)).toBeUndefined();
  });
});

const READ_BYTES = 4_096;
const WRITE_BYTES = 8_192;

describe('parseProcessIo', () => {
  it('adds the bytes read from and written to storage', () => {
    // Arrange
    const text = [
      'rchar: 999999',
      'wchar: 888888',
      'syscr: 10',
      'syscw: 5',
      `read_bytes: ${READ_BYTES}`,
      `write_bytes: ${WRITE_BYTES}`,
      'cancelled_write_bytes: 0',
    ].join('\n');

    // Act / Assert
    expect(parseProcessIo(text)).toEqual(READ_BYTES + WRITE_BYTES);
  });

  it.each([
    ['an empty file', ''],
    ['no write_bytes', 'read_bytes: 1\n'],
    ['a negative value', 'read_bytes: -1\nwrite_bytes: 0\n'],
  ])('rejects %s', (_case, text) => {
    // Act / Assert
    expect(parseProcessIo(text)).toBeUndefined();
  });
});

const TWO_MEBIBYTES = 2_097_152;

describe('parseResidentBytes', () => {
  it('reads VmRSS in bytes', () => {
    // Arrange
    const text = 'Name:\tnode\nVmPeak:\t  900 kB\nVmRSS:\t   2048 kB\nThreads:\t7\n';

    // Act / Assert
    expect(parseResidentBytes(text)).toEqual(TWO_MEBIBYTES);
  });

  it('reads a kernel thread, which has no VmRSS, as no memory', () => {
    // Act / Assert
    expect(parseResidentBytes('Name:\tkworker/0:1\nThreads:\t1\n')).toBe(0);
  });

  it('rejects a malformed value', () => {
    // Act / Assert
    expect(parseResidentBytes('VmRSS:\t lots kB\n')).toBeUndefined();
  });
});

const UPTIME_SEC = 16_711.94;

describe('parseUptime', () => {
  it('reads seconds since boot', () => {
    // Act / Assert
    expect(parseUptime('16711.94 120034.56\n')).toEqual(UPTIME_SEC);
  });

  it.each([
    ['an empty file', ''],
    ['a negative value', '-1.00 2.00\n'],
    ['words', 'up 3 days'],
  ])('rejects %s', (_case, text) => {
    // Act / Assert
    expect(parseUptime(text)).toBeUndefined();
  });
});
