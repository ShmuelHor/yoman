import { describe, expect, it } from 'vitest';

import type { KnownApp } from '../src/focus.js';
import { appsFirstSeenAfterFirstSync } from '../src/known-apps.js';

const FIRST = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';

function app(appId: string, firstSeenAt?: string): KnownApp {
  return {
    appId,
    name: null,
    source: 'desktop',
    ...(firstSeenAt === undefined ? {} : { firstSeenAt }),
  };
}

describe('appsFirstSeenAfterFirstSync', () => {
  it('never counts the first catalog as new', () => {
    expect(appsFirstSeenAfterFirstSync([app('a', FIRST), app('b', FIRST)])).toEqual([]);
  });

  it('returns only the apps a later sync added', () => {
    expect(appsFirstSeenAfterFirstSync([app('a', FIRST), app('b', LATER)])).toEqual(['b']);
  });

  it('fails closed for apps without a first-seen time', () => {
    expect(appsFirstSeenAfterFirstSync([app('a'), app('b')])).toEqual([]);
    expect(appsFirstSeenAfterFirstSync([app('a', FIRST), app('b')])).toEqual([]);
  });

  it('is empty without apps', () => {
    expect(appsFirstSeenAfterFirstSync([])).toEqual([]);
  });
});
