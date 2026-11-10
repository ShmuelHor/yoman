import { defineHandlers } from '../../core/route-handler.js';
import { appHandlers } from './apps.js';
import { ruleHandlers } from './rules.js';

/** The apps domain: apps and the category rules that sort them, both in the sessions service. */
export const handlers = defineHandlers({ ...appHandlers, ...ruleHandlers });
