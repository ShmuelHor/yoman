import { defineHandlers } from '../../core/route-handler.js';

/** The settings domain: the gateway's own data, read and replaced as a whole. */
export const handlers = defineHandlers({
  getSettings: ({ settings }) => settings.read(),
  updateSettings: ({ settings, body }) => settings.write(body),
});
