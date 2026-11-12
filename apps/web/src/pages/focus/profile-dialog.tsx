import { zodResolver } from '@hookform/resolvers/zod';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { KnownApp, Profile } from '@yoman/shared/focus';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { Switch } from '../../components/switch.js';
import { AppChecklist } from './app-checklist.js';
import { TextField } from './form-controls.js';
import {
  appLabel,
  NEW_PROFILE_FORM,
  newAppIds,
  ProfileForm,
  profileToForm,
  selectableApps,
} from './profile-form.js';

interface ProfileDialogProps {
  /** The profile being edited; `undefined` creates a new one. */
  readonly profile: Profile | undefined;
  readonly profiles: readonly Profile[];
  readonly knownApps: readonly KnownApp[];
  readonly saving: boolean;
  readonly onSave: (body: ProfileForm) => void;
  readonly onClose: () => void;
}

/** Creates or edits a profile: which apps focus mutes, and which keep notifying. */
export function ProfileDialog({
  profile,
  profiles,
  knownApps,
  saving,
  onSave,
  onClose,
}: ProfileDialogProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(ProfileForm),
    defaultValues: profile === undefined ? NEW_PROFILE_FORM : profileToForm(profile),
  });
  const [mutedApps, exceptions] = useWatch({ control, name: ['mutedApps', 'exceptions'] });
  const appIds = selectableApps(knownApps, { mutedApps, exceptions });
  const fresh = newAppIds(knownApps, profiles);

  const checklist = (name: 'mutedApps' | 'exceptions', legend: string): React.JSX.Element => (
    <Controller
      control={control}
      name={name}
      render={({ field }): React.JSX.Element => (
        <AppChecklist
          legend={legend}
          appIds={appIds}
          selected={field.value}
          labelOf={(id): string => appLabel(knownApps, id)}
          isNew={(id): boolean => fresh.has(id)}
          newLabel={t('newTag')}
          onChange={field.onChange}
        />
      )}
    />
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={(event): void => void handleSubmit(onSave)(event)} noValidate>
        <DialogTitle>{profile === undefined ? t('dialog.create') : t('dialog.edit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ paddingBlockStart: 2 }}>
            <TextField
              label={t('profiles.columns.name')}
              register={register('name')}
              error={errors.name === undefined ? undefined : t('form.invalidName')}
            />
            {checklist('mutedApps', t('profiles.columns.muted'))}
            {checklist('exceptions', t('profiles.columns.exceptions'))}
            <Controller
              control={control}
              name="muteNewApps"
              render={({ field }): React.JSX.Element => (
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Switch
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('profiles.columns.muteNewApps')}
                  />
                  <Typography aria-hidden>{t('profiles.columns.muteNewApps')}</Typography>
                </Stack>
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('form.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {t('form.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
