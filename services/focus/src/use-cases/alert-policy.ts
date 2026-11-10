import { AlertType } from '@yoman/shared/alerts';
import type { AlertPolicy } from '@yoman/shared/focus';

import type { FocusStore } from './store.js';

/** The policy's entries, in the order the alert types are declared. */
export function readAlertPolicy(store: FocusStore): Promise<AlertPolicy> {
  return store.transaction(async (tx) => {
    const policy = await tx.alertPolicy();
    const items = AlertType.options.flatMap((type) => {
      const level = policy.get(type);
      return level === undefined ? [] : [{ type, level }];
    });
    return { items };
  });
}

/** Replaces the whole policy. A type left out goes back to the sender's level. */
export async function replaceAlertPolicy(
  store: FocusStore,
  policy: AlertPolicy,
): Promise<AlertPolicy> {
  await store.transaction(async (tx) => {
    await tx.lock();
    await tx.replaceAlertPolicy(policy.items);
  });
  return readAlertPolicy(store);
}
