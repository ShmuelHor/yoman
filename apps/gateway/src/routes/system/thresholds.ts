import type { Settings } from '@yoman/shared/settings';

export type Thresholds = Settings['thresholds'];

/** Where the gateway reads the user's load thresholds for the system service's `POST /samples`. */
export type ThresholdsProvider = () => Promise<Thresholds>;

/** SPEC §4.1 defaults: `some avg10` percent that opens a memory, cpu or io incident. */
export const DEFAULT_THRESHOLDS: Thresholds = { memory: 10, cpu: 40, io: 30 };

/** Used until T31 serves `gateway.settings`; T31 replaces it with the stored thresholds. */
export const defaultThresholds: ThresholdsProvider = () => Promise.resolve(DEFAULT_THRESHOLDS);
