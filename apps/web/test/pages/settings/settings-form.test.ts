import { settingsFixture } from '@yoman/shared/fixtures/data';
import { describe, expect, it } from 'vitest';

import {
  clockToDate,
  dateToClock,
  SettingsForm,
  settingsToForm,
} from '../../../src/pages/settings/settings-form.js';

describe('SettingsForm', () => {
  it('round-trips the saved settings', () => {
    const form = settingsToForm(settingsFixture);

    expect(SettingsForm.parse(form)).toEqual(settingsFixture);
  });

  it('reads app lists separated by lines and commas', () => {
    const form = { ...settingsToForm(settingsFixture), excludedApps: 'a, b\nc\n\n' };

    expect(SettingsForm.parse(form).privacy.excludedApps).toEqual(['a', 'b', 'c']);
  });

  it('drops the times when quiet hours are off', () => {
    const form = { ...settingsToForm(settingsFixture), quietEnabled: false, quietStart: '' };

    expect(SettingsForm.parse(form).quietHours).toEqual({ enabled: false });
  });

  it('reports a threshold above 100 on its field', () => {
    const form = { ...settingsToForm(settingsFixture), cpu: 101 };
    const result = SettingsForm.safeParse(form);

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['cpu']]);
  });

  it('reports an invalid app ID on the list it came from', () => {
    const form = { ...settingsToForm(settingsFixture), systemApps: 'ok bad/id' };
    const result = SettingsForm.safeParse(form);

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['systemApps']]);
  });

  it('reports an incomplete time when quiet hours are on', () => {
    const form = { ...settingsToForm(settingsFixture), quietEnd: '' };
    const result = SettingsForm.safeParse(form);

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['quietEnd']]);
  });
});

describe('clock conversion', () => {
  it('converts between HH:mm and a picker date', () => {
    expect(dateToClock(clockToDate('07:05'))).toBe('07:05');
  });

  it('treats an invalid value as empty', () => {
    expect(clockToDate('nope')).toBeNull();
    expect(dateToClock(null)).toBe('');
  });
});
