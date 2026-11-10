import { createNotifier } from './actuator.js';

/** Loaded by the actuator registry; the folder name is the actuator name. */
export const plugin = createNotifier();
