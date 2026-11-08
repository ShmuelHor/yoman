/** The timer functions the scheduler uses, injectable so tests run on fake timers. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type Task = () => Promise<void> | void;

export type SchedulerState = 'idle' | 'running' | 'paused' | 'stopped';

export interface SchedulerOptions {
  readonly timers?: Timers;
  /** Called when a task throws or rejects. The task keeps its schedule. */
  readonly onError: (name: string, error: unknown) => void;
}

export interface Scheduler {
  /** Registers a task to run every `intervalMs`. Names are unique. */
  every(name: string, intervalMs: number, task: Task): void;
  /** Runs every task now, then on its interval. */
  start(): void;
  /** Stops all sampling, for example while the screen is locked (SPEC §4.4). */
  pause(): void;
  /** Like `start`: every task runs now, then on its interval. */
  resume(): void;
  /** Final: the scheduler cannot be started again. */
  stop(): void;
  readonly state: SchedulerState;
}

interface Job {
  readonly name: string;
  readonly intervalMs: number;
  readonly task: Task;
  handle: unknown;
}

/**
 * Each run is scheduled only after the previous one settles, so a slow task
 * never overlaps itself and a stalled system never queues a burst of runs.
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const timers = options.timers ?? systemTimers;
  const jobs = new Map<string, Job>();
  let state: SchedulerState = 'idle';
  // Bumped on every pause and stop, so a run that settles afterwards does not reschedule itself.
  let generation = 0;

  function arm(job: Job, delayMs: number): void {
    const armedIn = generation;
    job.handle = timers.setTimeout(() => {
      job.handle = undefined;
      void run(job, armedIn);
    }, delayMs);
  }

  async function run(job: Job, armedIn: number): Promise<void> {
    try {
      await job.task();
    } catch (error: unknown) {
      options.onError(job.name, error);
    }
    if (state === 'running' && armedIn === generation) {
      arm(job, job.intervalMs);
    }
  }

  function disarmAll(): void {
    generation += 1;
    for (const job of jobs.values()) {
      if (job.handle !== undefined) {
        timers.clearTimeout(job.handle);
        job.handle = undefined;
      }
    }
  }

  function startAll(): void {
    state = 'running';
    for (const job of jobs.values()) {
      arm(job, 0);
    }
  }

  return {
    every(name, intervalMs, task): void {
      if (state === 'stopped') {
        throw new Error('scheduler is stopped');
      }
      if (jobs.has(name)) {
        throw new Error(`task already scheduled: ${name}`);
      }
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error(`interval must be a positive number of ms: ${name}`);
      }
      const job: Job = { name, intervalMs, task, handle: undefined };
      jobs.set(name, job);
      if (state === 'running') {
        arm(job, 0);
      }
    },
    start(): void {
      if (state !== 'idle') {
        throw new Error(`cannot start a ${state} scheduler`);
      }
      startAll();
    },
    pause(): void {
      if (state === 'running') {
        disarmAll();
        state = 'paused';
      }
    },
    resume(): void {
      if (state === 'paused') {
        startAll();
      }
    },
    stop(): void {
      disarmAll();
      state = 'stopped';
    },
    get state(): SchedulerState {
      return state;
    },
  };
}
