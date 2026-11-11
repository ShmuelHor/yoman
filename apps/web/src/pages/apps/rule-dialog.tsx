import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type App, type Rule, RuleInput } from '@yoman/shared/sessions';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { SelectField, TextField } from './form-controls.js';
import { appsMatching } from './rule-preview.js';

const EMPTY_RULE: RuleInput = {
  field: 'wmClass',
  match: 'contains',
  pattern: '',
  category: '',
  priority: 0,
};

/** The form's values are the rule without its id, which the strict contract would reject. */
function toInput({ field, match, pattern, category, priority }: Rule): RuleInput {
  return { field, match, pattern, category, priority };
}

/** The most app names listed in the preview; the rest are counted. */
const PREVIEW_LIMIT = 8;

interface RulePreviewProps {
  readonly rule: Pick<RuleInput, 'field' | 'match' | 'pattern'>;
  readonly apps: readonly App[];
}

/** What the rule being edited applies to, updated as the user types. */
function RulePreview({ rule, apps }: RulePreviewProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  const matched = appsMatching(rule, apps);
  if (matched === null) {
    return <Alert severity="info">{t('preview.titleRule')}</Alert>;
  }
  if (rule.pattern === '') {
    return <Typography variant="label">{t('preview.empty')}</Typography>;
  }
  if (matched.length === 0) {
    return <Alert severity="info">{t('preview.none')}</Alert>;
  }
  const shown = matched.slice(0, PREVIEW_LIMIT);
  return (
    <Stack spacing={1}>
      <Typography variant="label">{t('preview.matches', { count: matched.length })}</Typography>
      <Typography>
        {shown.map((app) => app.name).join(t('preview.separator'))}
        {matched.length > shown.length
          ? t('preview.more', { count: matched.length - shown.length })
          : ''}
      </Typography>
    </Stack>
  );
}

interface RuleDialogProps {
  /** The rule being edited; `undefined` creates a new one. */
  readonly rule: Rule | undefined;
  readonly apps: readonly App[];
  readonly saving: boolean;
  readonly onSave: (body: RuleInput) => void;
  readonly onClose: () => void;
}

/** Creates or edits a category rule, with a live preview of the apps it matches. */
export function RuleDialog({
  rule,
  apps,
  saving,
  onSave,
  onClose,
}: RuleDialogProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RuleInput>({
    resolver: zodResolver(RuleInput),
    defaultValues: rule === undefined ? EMPTY_RULE : toInput(rule),
  });
  const [field, match, pattern] = useWatch({ control, name: ['field', 'match', 'pattern'] });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={(event): void => void handleSubmit(onSave)(event)} noValidate>
        <DialogTitle>
          {rule === undefined ? t('ruleDialog.create') : t('ruleDialog.edit')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ paddingBlockStart: 2 }}>
            <SelectField label={t('columns.field')} register={register('field')}>
              <option value="wmClass">{t('field.wmClass')}</option>
              <option value="title">{t('field.title')}</option>
            </SelectField>
            <SelectField label={t('columns.match')} register={register('match')}>
              <option value="exact">{t('match.exact')}</option>
              <option value="prefix">{t('match.prefix')}</option>
              <option value="contains">{t('match.contains')}</option>
            </SelectField>
            <TextField
              label={t('columns.pattern')}
              register={register('pattern')}
              error={errors.pattern === undefined ? undefined : t('form.invalidPattern')}
            />
            <TextField
              label={t('columns.category')}
              register={register('category')}
              placeholder={t('form.categoryPlaceholder')}
              error={errors.category === undefined ? undefined : t('form.invalidCategory')}
            />
            <TextField
              label={t('columns.priority')}
              type="number"
              register={register('priority', { valueAsNumber: true })}
              error={errors.priority === undefined ? undefined : t('form.invalidPriority')}
            />
            <RulePreview rule={{ field, match, pattern }} apps={apps} />
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
