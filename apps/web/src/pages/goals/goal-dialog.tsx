import { zodResolver } from '@hookform/resolvers/zod';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import type { Goal, GoalInput } from '@yoman/shared/goals';
import type { App } from '@yoman/shared/sessions';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Button } from '../../components/button.js';
import { SelectField, TextField } from './form-controls.js';
import { GoalForm, type GoalFormInput, goalToForm, NEW_GOAL_FORM } from './goal-form.js';
import { WEEK, weekdayName } from './weekdays.js';

interface DaysFieldProps {
  readonly value: readonly number[];
  readonly onChange: (days: number[]) => void;
  readonly error: string | undefined;
}

/** The days of the week the goal counts on, one checkbox each. */
function DaysField({ value, onChange, error }: DaysFieldProps): React.JSX.Element {
  const { t, i18n } = useTranslation('goals');
  const toggle = (day: number, checked: boolean): void =>
    onChange(checked ? [...value, day].sort((a, b) => a - b) : value.filter((d) => d !== day));
  return (
    <Stack spacing={1} component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
      <FormLabel component="legend" sx={{ typography: 'label' }}>
        {t('columns.days')}
      </FormLabel>
      <FormGroup row>
        {WEEK.map((day) => (
          <FormControlLabel
            key={day}
            label={weekdayName(day, i18n.language, 'short')}
            control={
              <Checkbox
                checked={value.includes(day)}
                onChange={(_event, checked): void => toggle(day, checked)}
              />
            }
          />
        ))}
      </FormGroup>
      {error === undefined ? null : <FormHelperText error>{error}</FormHelperText>}
    </Stack>
  );
}

interface GoalDialogProps {
  /** The goal being edited; `undefined` creates a new one. */
  readonly goal: Goal | undefined;
  readonly apps: readonly App[];
  readonly saving: boolean;
  readonly onSave: (body: GoalInput) => void;
  readonly onClose: () => void;
}

/** Creates or edits a goal: a daily limit (`max`) or target (`min`) for an app or a category. */
export function GoalDialog({
  goal,
  apps,
  saving,
  onSave,
  onClose,
}: GoalDialogProps): React.JSX.Element {
  const { t } = useTranslation('goals');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<GoalFormInput, unknown, z.output<typeof GoalForm>>({
    resolver: zodResolver(GoalForm),
    defaultValues: goal === undefined ? NEW_GOAL_FORM : goalToForm(goal),
  });
  const kind = useWatch({ control, name: 'kind' });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={(event): void => void handleSubmit(onSave)(event)} noValidate>
        <DialogTitle>{goal === undefined ? t('dialog.create') : t('dialog.edit')}</DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ paddingBlockStart: 2 }}>
            <SelectField label={t('columns.type')} register={register('type')}>
              <option value="max">{t('type.max')}</option>
              <option value="min">{t('type.min')}</option>
            </SelectField>
            <SelectField label={t('columns.targetKind')} register={register('kind')}>
              <option value="category">{t('kind.category')}</option>
              <option value="app">{t('kind.app')}</option>
            </SelectField>
            {kind === 'app' ? (
              <SelectField label={t('kind.app')} register={register('appId')}>
                <option value="">{t('form.chooseApp')}</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                label={t('kind.category')}
                register={register('category')}
                placeholder={t('form.categoryPlaceholder')}
                error={errors.category === undefined ? undefined : t('form.invalidCategory')}
              />
            )}
            {kind === 'app' && errors.appId !== undefined ? (
              <FormHelperText error>{t('form.invalidApp')}</FormHelperText>
            ) : null}
            <TextField
              label={t('columns.minutes')}
              type="number"
              register={register('minutes', { valueAsNumber: true })}
              error={errors.minutes === undefined ? undefined : t('form.invalidMinutes')}
            />
            <Controller
              control={control}
              name="days"
              render={({ field }): React.JSX.Element => (
                <DaysField
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.days === undefined ? undefined : t('form.invalidDays')}
                />
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
