import { resolveAgentPaths } from '../../core/paths.js';
import { createMuter } from './actuator.js';
import { runFile } from './adapters/gsettings.js';

/** Loaded by the actuator registry; the folder name is the actuator name. */
export const plugin = createMuter({
  stateDir: resolveAgentPaths(process.env).stateDir,
  run: runFile,
});
