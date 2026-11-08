import { buildResources, type Resources } from './resources.js';

/** Every translation file, bundled at build time. */
export const bundledResources: Resources = buildResources(
  import.meta.glob('./*/*.json', { eager: true }),
);
