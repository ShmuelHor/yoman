import { describe, expect, it } from 'vitest';
import {
  isSnapshotDue,
  SNAPSHOT_EVERY_MS,
  SNAPSHOT_UNDER_LOAD_MS,
} from '../../../../src/collectors/pressure/domain/snapshot-schedule.js';

const LAST = 1_000_000;

describe('isSnapshotDue', () => {
  it('takes the first snapshot right away, to set the baseline', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST, undefined)).toBe(true);
  });

  it('waits five minutes between snapshots on a calm machine', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST + SNAPSHOT_EVERY_MS - 1, LAST)).toBe(false);
    expect(isSnapshotDue(false, LAST + SNAPSHOT_EVERY_MS, LAST)).toBe(true);
  });

  it('takes one every 15 seconds under load', () => {
    // Act / Assert
    expect(isSnapshotDue(true, LAST + SNAPSHOT_UNDER_LOAD_MS - 1, LAST)).toBe(false);
    expect(isSnapshotDue(true, LAST + SNAPSHOT_UNDER_LOAD_MS, LAST)).toBe(true);
  });

  it('takes one as soon as load starts after a calm stretch', () => {
    // Act / Assert
    expect(isSnapshotDue(true, LAST + SNAPSHOT_EVERY_MS / 2, LAST)).toBe(true);
  });

  it('takes one when the clock went backwards rather than waiting', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST - 1, LAST)).toBe(true);
  });
});
