import { describe, expect, it } from 'vitest';
import {
  isSnapshotDue,
  SNAPSHOT_EVERY_MS,
} from '../../../../src/collectors/pressure/domain/snapshot-schedule.js';

const LAST = 1_000_000;

describe('isSnapshotDue', () => {
  it('takes the first snapshot right away, to set the baseline', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST, undefined)).toBe(true);
  });

  it('takes one on every tick under load', () => {
    // Act / Assert
    expect(isSnapshotDue(true, LAST + 1, LAST)).toBe(true);
  });

  it('waits five minutes between snapshots on a calm machine', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST + SNAPSHOT_EVERY_MS - 1, LAST)).toBe(false);
    expect(isSnapshotDue(false, LAST + SNAPSHOT_EVERY_MS, LAST)).toBe(true);
  });

  it('takes one when the clock went backwards rather than waiting', () => {
    // Act / Assert
    expect(isSnapshotDue(false, LAST - 1, LAST)).toBe(true);
  });
});
