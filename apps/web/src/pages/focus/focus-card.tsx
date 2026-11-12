import { zodResolver } from '@hookform/resolvers/zod';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FocusStart, FocusState, Profile } from '@yoman/shared/focus';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '../../components/button.js';
import { FocusBanner } from '../../components/focus-banner.js';
import { SelectField, TextField } from './form-controls.js';
import { NEW_START_FORM, StartForm, type StartFormInput } from './start-form.js';
import { minutesLeft } from './time-left.js';

interface FocusCardProps {
  readonly state: FocusState;
  readonly profiles: readonly Profile[];
  readonly now: Date;
  readonly busy: boolean;
  readonly onStart: (body: FocusStart) => void;
  readonly onStop: () => void;
}

/** Whether focus is on, with a stop button, or the form that starts it. */
export function FocusCard({
  state,
  profiles,
  now,
  busy,
  onStart,
  onStop,
}: FocusCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation('focus');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<StartFormInput, unknown, z.output<typeof StartForm>>({
    resolver: zodResolver(StartForm),
    defaultValues: NEW_START_FORM,
  });
  const mode = useWatch({ control, name: 'mode' });

  if (state.active) {
    const name = profiles.find((profile) => profile.id === state.profileId)?.name;
    const minutes = new Intl.NumberFormat(i18n.language).format(minutesLeft(state.endsAt, now));
    return (
      <Stack spacing={4}>
        <FocusBanner>{t('banner', { minutes })}</FocusBanner>
        {name === undefined ? null : <Typography>{t('active.profile', { name })}</Typography>}
        <div>
          <Button variant="primary" disabled={busy} onClick={onStop}>
            {t('stop')}
          </Button>
        </div>
      </Stack>
    );
  }

  return (
    <form onSubmit={(event): void => void handleSubmit(onStart)(event)} noValidate>
      <Stack spacing={4} sx={{ maxInlineSize: 'sm' }}>
        <Typography>{t('inactive')}</Typography>
        <SelectField label={t('start.profile')} register={register('profileId')}>
          <option value="">{t('start.defaultProfile')}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('start.mode')} register={register('mode')}>
          <option value="minutes">{t('start.minutes')}</option>
          <option value="until">{t('start.until')}</option>
        </SelectField>
        {mode === 'minutes' ? (
          <TextField
            label={t('start.minutes')}
            type="number"
            register={register('minutes', { valueAsNumber: true })}
            error={errors.minutes === undefined ? undefined : t('form.invalidMinutes')}
          />
        ) : (
          <TextField
            label={t('start.until')}
            type="time"
            register={register('until')}
            error={errors.until === undefined ? undefined : t('form.invalidUntil')}
          />
        )}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('start.submit')}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
