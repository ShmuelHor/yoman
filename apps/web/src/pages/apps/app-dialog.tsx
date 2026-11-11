import { zodResolver } from '@hookform/resolvers/zod';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import type { App } from '@yoman/shared/sessions';
import { AppUpdate } from '@yoman/shared/sessions';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '../../components/button.js';
import { TextField } from './form-controls.js';

/** The form edits the category as text; an empty field means "no category". */
const AppForm = z.object({
  name: AppUpdate.shape.name,
  category: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(AppUpdate.shape.category),
});
type AppFormInput = z.input<typeof AppForm>;
type AppFormOutput = z.output<typeof AppForm>;

interface AppDialogProps {
  readonly app: App;
  readonly saving: boolean;
  readonly onSave: (body: AppUpdate) => void;
  readonly onClose: () => void;
}

/** Renames an app or changes its category. The name is untrusted text and is only ever rendered as text. */
export function AppDialog({ app, saving, onSave, onClose }: AppDialogProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppFormInput, unknown, AppFormOutput>({
    resolver: zodResolver(AppForm),
    defaultValues: { name: app.name, category: app.category ?? '' },
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={(event): void => void handleSubmit(onSave)(event)} noValidate>
        <DialogTitle>{t('appDialog.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ paddingBlockStart: 2 }}>
            <TextField
              label={t('columns.name')}
              register={register('name')}
              error={errors.name === undefined ? undefined : t('form.invalidName')}
            />
            <TextField
              label={t('columns.category')}
              register={register('category')}
              placeholder={t('form.categoryPlaceholder')}
              error={errors.category === undefined ? undefined : t('form.invalidCategory')}
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
