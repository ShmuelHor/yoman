import type { Profile } from '@yoman/shared/focus';
import { describe, expect, it } from 'vitest';

import {
  appLabel,
  NEW_PROFILE_FORM,
  newAppIds,
  ProfileForm,
  selectableApps,
} from '../../../src/pages/focus/profile-form.js';

const PROFILE: Profile = {
  id: '3f8a3c1e-6a43-4a43-9f0c-6a1d8a0e8a10',
  name: 'Deep work',
  mutedApps: ['slack'],
  exceptions: ['calendar'],
  muteNewApps: true,
};

describe('profile form', () => {
  it('rejects a blank name', () => {
    expect(ProfileForm.safeParse(NEW_PROFILE_FORM).success).toBe(false);
  });

  it('tags only the apps no profile mentions', () => {
    const known = [{ appId: 'slack' }, { appId: 'calendar' }, { appId: 'discord' }];

    expect([...newAppIds(known, [PROFILE])]).toEqual(['discord']);
  });

  it('keeps an app that is no longer installed selectable', () => {
    const ids = selectableApps([{ appId: 'slack' }], { mutedApps: ['gone'], exceptions: [] });

    expect(ids).toEqual(['gone', 'slack']);
  });

  it('falls back to the app id when there is no name', () => {
    expect(appLabel([{ appId: 'discord', name: null }], 'discord')).toBe('discord');
  });
});
