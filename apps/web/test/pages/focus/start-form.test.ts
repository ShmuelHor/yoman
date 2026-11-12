import { describe, expect, it } from 'vitest';

import { NEW_START_FORM, StartForm } from '../../../src/pages/focus/start-form.js';

const PROFILE_ID = '3f8a3c1e-6a43-4a43-9f0c-6a1d8a0e8a10';

describe('StartForm', () => {
  it('starts a duration with the default profile', () => {
    expect(StartForm.parse(NEW_START_FORM)).toEqual({ minutes: 25 });
  });

  it('starts until a time with the chosen profile', () => {
    const body = StartForm.parse({
      ...NEW_START_FORM,
      profileId: PROFILE_ID,
      mode: 'until',
      until: '17:30',
    });

    expect(body).toEqual({ profileId: PROFILE_ID, until: '17:30' });
  });

  it('rejects a duration outside the allowed range', () => {
    expect(StartForm.safeParse({ ...NEW_START_FORM, minutes: 0 }).success).toBe(false);
    expect(StartForm.safeParse({ ...NEW_START_FORM, minutes: 721 }).success).toBe(false);
  });

  it('reports an empty end time on the until field', () => {
    const result = StartForm.safeParse({ ...NEW_START_FORM, mode: 'until', until: '' });

    expect(result.error?.issues[0]?.path).toEqual(['until']);
  });
});
