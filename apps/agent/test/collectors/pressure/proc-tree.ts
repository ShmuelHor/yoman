import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS } from '@yoman/shared/limits';

/** One fake process; counters are in clock ticks, pages and bytes like the real files. */
export interface FakeProcess {
  readonly pid: number;
  readonly comm: string;
  readonly kernelThread?: boolean;
  readonly cpuTicks?: number;
  readonly startTicks?: number;
  readonly rssPages?: number;
  readonly rssKb?: number;
  readonly ioBytes?: number;
  /** Written to the tree so tests can prove it never leaves the agent. */
  readonly cmdline?: string;
}

export interface FakePressure {
  readonly cpu: number;
  readonly memory: number;
  readonly io: number;
}

/** `PF_RANDOMIZE`, as on a user process; with `PF_KTHREAD` for a kernel thread. */
const USER_FLAGS = '4194304';
const KTHREAD_FLAGS = '6291456';

const CALM: FakePressure = { cpu: 0, memory: 0, io: 0 };

function psi(some: number): string {
  const value = some.toFixed(2);
  return [
    `some avg10=${value} avg60=0.00 avg300=0.00 total=1`,
    'full avg10=0.00 avg60=0.00 avg300=0.00 total=0',
    '',
  ].join('\n');
}

function stat(process: FakeProcess): string {
  const { pid, comm, cpuTicks = 0, startTicks = 0, rssPages = 0 } = process;
  const flags = process.kernelThread === true ? KTHREAD_FLAGS : USER_FLAGS;
  return `${pid} (${comm}) S 1 1 1 0 -1 ${flags} 1 0 0 0 ${cpuTicks} 0 0 0 20 0 1 0 ${startTicks} 1 ${rssPages} 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0\n`;
}

/** A writable `/proc` look-alike in a temporary directory. */
export class ProcTree {
  private constructor(readonly root: string) {}

  static async create(): Promise<ProcTree> {
    return new ProcTree(await mkdtemp(join(tmpdir(), 'yoman-proc-')));
  }

  async remove(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  async setPressure(pressure: Partial<FakePressure> = {}): Promise<void> {
    const values = { ...CALM, ...pressure };
    await mkdir(join(this.root, 'pressure'), { recursive: true });
    await Promise.all(
      (['cpu', 'memory', 'io'] as const).map((resource) =>
        writeFile(join(this.root, 'pressure', resource), psi(values[resource])),
      ),
    );
  }

  async setMemory(memory: { availablePct: number; swapUsedKb?: number }): Promise<void> {
    const totalKb = 1_000_000;
    const swapTotalKb = 2_000_000;
    const lines = [
      `MemTotal:       ${totalKb} kB`,
      `MemAvailable:   ${Math.round((totalKb * memory.availablePct) / LIMITS.percent)} kB`,
      `SwapTotal:      ${swapTotalKb} kB`,
      `SwapFree:       ${swapTotalKb - (memory.swapUsedKb ?? 0)} kB`,
    ];
    await writeFile(join(this.root, 'meminfo'), `${lines.join('\n')}\n`);
  }

  async setUptime(seconds: number): Promise<void> {
    await writeFile(join(this.root, 'uptime'), `${seconds.toFixed(2)} 0.00\n`);
  }

  async setProcess(process: FakeProcess): Promise<void> {
    const dir = join(this.root, String(process.pid));
    await mkdir(dir, { recursive: true });
    const io = `rchar: 0\nwchar: 0\nread_bytes: ${process.ioBytes ?? 0}\nwrite_bytes: 0\n`;
    const status = `Name:\t${process.comm}\nVmRSS:\t${process.rssKb ?? 0} kB\n`;
    await Promise.all([
      writeFile(join(dir, 'stat'), stat(process)),
      writeFile(join(dir, 'io'), io),
      writeFile(join(dir, 'status'), status),
      writeFile(join(dir, 'cmdline'), `${process.cmdline ?? process.comm}\0`),
    ]);
  }

  async setMeminfoText(text: string): Promise<void> {
    await writeFile(join(this.root, 'meminfo'), text);
  }

  /** Makes one process's stat claim to be another process. */
  async copyStat(pids: { from: number; to: number }): Promise<void> {
    await copyFile(
      join(this.root, String(pids.from), 'stat'),
      join(this.root, String(pids.to), 'stat'),
    );
  }

  /**
   * Turns a file into a directory, so any attempt to read it throws `EISDIR`
   * and fails the test: proof that the collector never opens it.
   */
  async makeUnreadable(target: { pid: number; file: string }): Promise<void> {
    const path = join(this.root, String(target.pid), target.file);
    await rm(path, { force: true });
    await mkdir(path);
  }

  async removeFile(target: { pid: number; file: string }): Promise<void> {
    await rm(join(this.root, String(target.pid), target.file));
  }
}
