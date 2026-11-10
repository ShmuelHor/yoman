import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessSample } from '@yoman/shared/ingest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPressureCollector } from '../../apps/agent/src/collectors/pressure/collector.js';
import { createLogger } from '../../apps/agent/src/core/logger.js';
import type { CollectorContext } from '../../apps/agent/src/core/plugin.js';
import { SessionBusError } from '../../apps/agent/src/core/session-bus.js';

// Distinctive markers, so a match can only mean a leak. Built at runtime and
// low-entropy, so gitleaks never sees a token-shaped literal (ST02).
const CMDLINE_MARKER = ['st17', 'cmdline', 'marker'].join('-');
const ENVIRON_MARKER = ['st17', 'environ', 'marker'].join('-');
const COMM = 'st17-worker';
const PIDS = ['101', '202'];

const PRESSURE_UNDER_LOAD = [
  'some avg10=95.00 avg60=90.00 avg300=50.00 total=1',
  'full avg10=50.00 avg60=40.00 avg300=20.00 total=1',
  '',
].join('\n');

/** A `/proc/<pid>/stat` line with some CPU time, so the process ranks. */
function stat(pid: string): string {
  return `${pid} (${COMM}) R 1 1 1 0 -1 4194304 1 0 0 0 5000 0 0 0 20 0 1 0 0 1 64 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0\n`;
}

/** A loaded `/proc` look-alike whose processes carry secrets in their arguments and environment. */
async function procTree(root: string): Promise<void> {
  await mkdir(join(root, 'pressure'));
  await Promise.all(
    ['cpu', 'memory', 'io'].map((resource) =>
      writeFile(join(root, 'pressure', resource), PRESSURE_UNDER_LOAD),
    ),
  );
  await writeFile(
    join(root, 'meminfo'),
    'MemTotal: 1000 kB\nMemAvailable: 500 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n',
  );
  await writeFile(join(root, 'uptime'), '1000.00 0.00\n');
  for (const pid of PIDS) {
    const dir = join(root, pid);
    await mkdir(dir);
    await writeFile(join(dir, 'stat'), stat(pid));
    await writeFile(join(dir, 'io'), 'read_bytes: 4096\nwrite_bytes: 4096\n');
    await writeFile(join(dir, 'status'), `Name:\t${COMM}\nVmRSS:\t256 kB\n`);
    await writeFile(join(dir, 'cmdline'), `/usr/bin/${COMM}\0--flag=${CMDLINE_MARKER}\0`);
    await writeFile(join(dir, 'environ'), `YOMAN_ST17=${ENVIRON_MARKER}\0`);
  }
}

function context(): CollectorContext {
  const unavailable = (): Promise<never> =>
    Promise.reject(new SessionBusError('UNAVAILABLE', 'no session bus in ST17'));
  return {
    logger: createLogger({ level: 'silent' }),
    sessionBus: { call: unavailable, subscribe: unavailable, close: (): void => undefined },
    presence: { idleMs: 0, locked: false },
    reportPresence: (): void => undefined,
    emit: (): Promise<void> => Promise.resolve(),
  };
}

/** One poll of the process collector, serialized the way the buffer stores it. */
async function collectPayload(root: string): Promise<string> {
  const collector = createPressureCollector({ root });
  if (collector.collect === undefined) {
    throw new Error('the pressure collector polls');
  }
  const samples = await collector.collect(context());
  expect(samples.map((sample) => sample.kind)).toEqual(['pressure', 'processes']);
  return JSON.stringify(samples);
}

describe('ST17 agent payload privacy', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yoman-st17-'));
    await procTree(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('the agent never sends a process cmdline', async () => {
    // Act
    const payload = await collectPayload(root);

    // Assert: the processes are there, named by comm, with no trace of their arguments.
    expect(payload).toContain(`"comm":"${COMM}"`);
    expect(payload).not.toContain(CMDLINE_MARKER);
    expect(payload).not.toContain(ENVIRON_MARKER);
    expect(payload).not.toContain('/usr/bin/');
    expect(payload).not.toMatch(/cmdline|environ|args/i);
  });

  it('the agent never opens a process cmdline or environ', async () => {
    // Arrange: as directories, any read of them throws EISDIR and fails the poll.
    for (const pid of PIDS) {
      for (const file of ['cmdline', 'environ']) {
        await rm(join(root, pid, file));
        await mkdir(join(root, pid, file));
      }
    }

    // Act / Assert
    await expect(collectPayload(root)).resolves.toContain(`"comm":"${COMM}"`);
  });

  it('the ingest contract rejects a process that carries a cmdline', () => {
    // Arrange
    const sample = {
      kind: 'processes',
      ts: '2026-11-09T08:00:00.000Z',
      processes: [
        {
          pid: 101,
          comm: COMM,
          cpuPct: 1,
          rssBytes: 1,
          ioBytesPerSec: 0,
          cmdline: `/usr/bin/${COMM} --flag=${CMDLINE_MARKER}`,
        },
      ],
    };

    // Act / Assert
    expect(ProcessSample.safeParse(sample).success).toBe(false);
  });

  it.todo('[T47] the agent sends no window title when title collection is off');
});
