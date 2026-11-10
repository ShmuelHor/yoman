import { describe, expect, it } from 'vitest';

import { handlers } from '../../../src/routes/apps/index.js';

describe('apps route module', () => {
  it('handles the app and the rule routes', () => {
    expect(Object.keys(handlers).sort()).toEqual([
      'createRule',
      'deleteRule',
      'listApps',
      'listRules',
      'updateApp',
      'updateRule',
    ]);
  });
});
