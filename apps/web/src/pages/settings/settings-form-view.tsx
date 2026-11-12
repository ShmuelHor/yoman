import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import type { Settings } from '@yoman/shared/settings';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '../../components/button.js';
import { Switch } from '../../components/switch.js';
import { Language } from '../../i18n/languages.js';
import { ThemePreference } from '../../theme/theme.js';
import { useTheme } from '../../theme/theme-provider.js';
import { SelectField, TextField } from './form-controls.js';
import {
  clockToDate,
  dateToClock,
  SettingsForm,
  type SettingsFormInput,
  settingsToForm,
} from './settings-form.js';

interface SettingsFormViewProps {
  readonly settings: Settings;
  readonly saving: boolean;
  readonly onSave: (settings: Settings) => void;
}

/** Every setting in one form. Language and theme also apply as soon as they are chosen. */
export function SettingsFormView({
  settings,
  saving,
  onSave,
}: SettingsFormViewProps): React.JSX.Element {
  const { t, i18n } = useTranslation('settings');
  const { setPreference } = useTheme();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SettingsFormInput, unknown, z.output<typeof SettingsForm>>({
    resolver: zodResolver(SettingsForm),
    defaultValues: settingsToForm(settings),
  });
  const quietEnabled = useWatch({ control, name: 'quietEnabled' });
  const invalid = (field: keyof SettingsFormInput, message: string): string | undefined =>
    errors[field] === undefined ? undefined : message;

  const languageField = register('language');
  const themeField = register('theme');

  return (
    <form onSubmit={(event): void => void handleSubmit(onSave)(event)} noValidate>
      <Stack spacing={6}>
        <Stack spacing={4} component="section" aria-labelledby="settings-appearance">
          <Typography variant="h2" id="settings-appearance">
            {t('sections.appearance')}
          </Typography>
          <SelectField
            label={t('language.label')}
            register={{
              ...languageField,
              onChange: async (event): Promise<void> => {
                await languageField.onChange(event);
                void i18n.changeLanguage(Language.parse(event.target.value));
              },
            }}
          >
            {Language.options.map((language) => (
              <option key={language} value={language}>
                {t(`language.${language}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('theme.label')}
            register={{
              ...themeField,
              onChange: async (event): Promise<void> => {
                await themeField.onChange(event);
                setPreference(ThemePreference.parse(event.target.value));
              },
            }}
          >
            {ThemePreference.options.map((theme) => (
              <option key={theme} value={theme}>
                {t(`theme.${theme}`)}
              </option>
            ))}
          </SelectField>
        </Stack>

        <Stack spacing={4} component="section" aria-labelledby="settings-privacy">
          <Typography variant="h2" id="settings-privacy">
            {t('sections.privacy')}
          </Typography>
          <Controller
            control={control}
            name="storeTitles"
            render={({ field }): React.JSX.Element => (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  label={t('privacy.storeTitles')}
                />
                <Typography>{t('privacy.storeTitles')}</Typography>
              </Stack>
            )}
          />
          <TextField
            label={t('privacy.excludedApps')}
            helper={t('listHint')}
            multiline
            register={register('excludedApps')}
            error={invalid('excludedApps', t('errors.appList'))}
          />
        </Stack>

        <Stack spacing={4} component="section" aria-labelledby="settings-thresholds">
          <Typography variant="h2" id="settings-thresholds">
            {t('sections.thresholds')}
          </Typography>
          {(['memory', 'cpu', 'io'] as const).map((name) => (
            <TextField
              key={name}
              label={t(`thresholds.${name}`)}
              type="number"
              register={register(name, { valueAsNumber: true })}
              error={invalid(name, t('errors.percent'))}
            />
          ))}
        </Stack>

        <Stack spacing={4} component="section" aria-labelledby="settings-system-apps">
          <Typography variant="h2" id="settings-system-apps">
            {t('sections.systemApps')}
          </Typography>
          <TextField
            label={t('systemApps.label')}
            helper={`${t('systemApps.hint')} ${t('listHint')}`}
            multiline
            register={register('systemApps')}
            error={invalid('systemApps', t('errors.appList'))}
          />
        </Stack>

        <Stack spacing={4} component="section" aria-labelledby="settings-quiet-hours">
          <Typography variant="h2" id="settings-quiet-hours">
            {t('sections.quietHours')}
          </Typography>
          <Controller
            control={control}
            name="quietEnabled"
            render={({ field }): React.JSX.Element => (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Switch
                  checked={field.value}
                  onChange={field.onChange}
                  label={t('quietHours.enabled')}
                />
                <Typography>{t('quietHours.enabled')}</Typography>
              </Stack>
            )}
          />
          {(['quietStart', 'quietEnd'] as const).map((name) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field }): React.JSX.Element => (
                <TimePicker
                  label={t(`quietHours.${name === 'quietStart' ? 'start' : 'end'}`)}
                  ampm={false}
                  disabled={!quietEnabled}
                  value={clockToDate(field.value)}
                  onChange={(date): void => field.onChange(dateToClock(date))}
                  slotProps={{
                    textField: {
                      size: 'small',
                      error: errors[name] !== undefined,
                      helperText: errors[name] === undefined ? undefined : t('errors.time'),
                    },
                  }}
                />
              )}
            />
          ))}
        </Stack>

        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            {t('save')}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
