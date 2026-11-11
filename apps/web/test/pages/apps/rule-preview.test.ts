import type { App } from '@yoman/shared/sessions';
import { describe, expect, it } from 'vitest';

import { appsMatching } from '../../../src/pages/apps/rule-preview.js';

const apps: App[] = [
  { id: 'Code', name: 'VS Code', icon: null, category: null },
  { id: 'code-insiders', name: 'Code Insiders', icon: null, category: null },
  { id: 'firefox', name: 'Firefox', icon: null, category: null },
];

function ids(matched: App[] | null): string[] | null {
  return matched === null ? null : matched.map((app) => app.id);
}

describe('appsMatching', () => {
  it('matches the whole app id for an exact rule, ignoring case', () => {
    const matched = appsMatching({ field: 'wmClass', match: 'exact', pattern: 'code' }, apps);

    expect(ids(matched)).toEqual(['Code']);
  });

  it('matches the start of the app id for a prefix rule', () => {
    const matched = appsMatching({ field: 'wmClass', match: 'prefix', pattern: 'CODE' }, apps);

    expect(ids(matched)).toEqual(['Code', 'code-insiders']);
  });

  it('matches anywhere in the app id for a contains rule', () => {
    const matched = appsMatching({ field: 'wmClass', match: 'contains', pattern: 'fox' }, apps);

    expect(ids(matched)).toEqual(['firefox']);
  });

  it('matches nothing while the pattern is empty', () => {
    const matched = appsMatching({ field: 'wmClass', match: 'contains', pattern: '' }, apps);

    expect(matched).toEqual([]);
  });

  it('cannot preview a title rule, because titles are not kept in the app list', () => {
    const matched = appsMatching({ field: 'title', match: 'contains', pattern: 'code' }, apps);

    expect(matched).toBeNull();
  });
});
