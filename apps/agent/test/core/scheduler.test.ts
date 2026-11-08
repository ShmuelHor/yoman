import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  createScheduler,
  type Scheduler,
  type SchedulerOptions,
} from '../../src/core/scheduler.js';

const FIVE_SECONDS = 5_000;
const ONE_MINUTE = 60_000;
const SLOW_TASK_MS = 12_000;

describe('createScheduler', () => {
  let onError: Mock<SchedulerOptions['onError']>;
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    onError = vi.fn<SchedulerOptions['onError']>();
    scheduler = createScheduler({
      onError,
      timers: { setTimeout, clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout) },
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it('runs each task at start, then on its own interval', async () => {
    const fast = vi.fn();
    const slow = vi.fn();
    scheduler.every('fast', FIVE_SECONDS, fast);
    scheduler.every('slow', ONE_MINUTE, slow);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect([fast.mock.calls.length, slow.mock.calls.length]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(ONE_MINUTE);
    expect(fast.mock.calls.length).toBe(ONE_MINUTE / FIVE_SECONDS + 1);
    expect(slow.mock.calls.length).toBe(2);
  });

  it('never overlaps a slow task with itself', async () => {
    let active = 0;
    let maxActive = 0;
    scheduler.every('slow', FIVE_SECONDS, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, SLOW_TASK_MS));
      active -= 1;
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(ONE_MINUTE);
    expect(maxActive).toBe(1);
  });

  it('reports errors and keeps the schedule', async () => {
    const error = new Error('boom');
    const failing = vi.fn(() => Promise.reject(error));
    const throwing = vi.fn(() => {
      throw error;
    });
    scheduler.every('failing', FIVE_SECONDS, failing);
    scheduler.every('throwing', FIVE_SECONDS, throwing);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(FIVE_SECONDS);
    expect(failing).toHaveBeenCalledTimes(2);
    expect(throwing).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('failing', error);
    expect(onError).toHaveBeenCalledWith('throwing', error);
  });

  it('runs nothing while paused and resumes immediately', async () => {
    const task = vi.fn();
    scheduler.every('task', FIVE_SECONDS, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.pause();
    expect(scheduler.state).toBe('paused');
    await vi.advanceTimersByTimeAsync(ONE_MINUTE);
    expect(task).toHaveBeenCalledTimes(1);
    scheduler.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
    expect(scheduler.state).toBe('running');
  });

  it('does not reschedule a run that settles after a pause', async () => {
    let release: () => void = () => undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    scheduler.every('task', FIVE_SECONDS, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.pause();
    release();
    await vi.advanceTimersByTimeAsync(ONE_MINUTE);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('starts a task added while running', async () => {
    scheduler.start();
    const task = vi.fn();
    scheduler.every('late', FIVE_SECONDS, task);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('ignores pause and resume in the wrong state', () => {
    scheduler.resume();
    expect(scheduler.state).toBe('idle');
    scheduler.pause();
    expect(scheduler.state).toBe('idle');
  });

  it('rejects duplicate names, bad intervals and use after stop', () => {
    scheduler.every('task', FIVE_SECONDS, vi.fn());
    expect(() => scheduler.every('task', FIVE_SECONDS, vi.fn())).toThrow('already');
    expect(() => scheduler.every('zero', 0, vi.fn())).toThrow('positive');
    expect(() => scheduler.every('nan', Number.NaN, vi.fn())).toThrow('positive');
    scheduler.start();
    expect(() => scheduler.start()).toThrow('running');
    scheduler.stop();
    expect(() => scheduler.every('after', FIVE_SECONDS, vi.fn())).toThrow('stopped');
  });

  it('uses the system timers by default', async () => {
    const real = createScheduler({ onError });
    const task = vi.fn();
    real.every('task', FIVE_SECONDS, task);
    real.start();
    await vi.advanceTimersByTimeAsync(FIVE_SECONDS);
    real.stop();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
