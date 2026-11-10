import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import { LIMITS } from '@yoman/shared/limits';

import type { Schedule, ScheduleInput } from '../contracts.js';
import type { FocusStore, FocusTransaction } from './store.js';

/** The list contract holds at most this many schedules, so no more can be created. */
export const MAX_SCHEDULES = LIMITS.listSize;

async function requireProfile(tx: FocusTransaction, profileId: string): Promise<void> {
  if ((await tx.getProfile(profileId)) === null) {
    throw new NotFoundError('Profile not found');
  }
}

export function listSchedules(store: FocusStore): Promise<Schedule[]> {
  return store.transaction((tx) => tx.listSchedules(MAX_SCHEDULES));
}

export function createSchedule(store: FocusStore, input: ScheduleInput): Promise<Schedule> {
  return store.transaction(async (tx) => {
    await tx.lock();
    await requireProfile(tx, input.profileId);
    if ((await tx.countSchedules()) >= MAX_SCHEDULES) {
      throw new ConflictError('Schedule limit reached');
    }
    return tx.createSchedule(input);
  });
}

export function updateSchedule(
  store: FocusStore,
  id: string,
  input: ScheduleInput,
): Promise<Schedule> {
  return store.transaction(async (tx) => {
    await tx.lock();
    await requireProfile(tx, input.profileId);
    const schedule = await tx.updateSchedule(id, input);
    if (schedule === null) {
      throw new NotFoundError('Schedule not found');
    }
    return schedule;
  });
}

export function deleteSchedule(store: FocusStore, id: string): Promise<void> {
  return store.transaction(async (tx) => {
    await tx.lock();
    if (!(await tx.deleteSchedule(id))) {
      throw new NotFoundError('Schedule not found');
    }
  });
}
