import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import type { Rule } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';

interface DeleteRuleDialogProps {
  readonly rule: Rule;
  readonly deleting: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

/** Asks before a rule is deleted, because past sessions are re-categorized without it. */
export function DeleteRuleDialog({
  rule,
  deleting,
  onConfirm,
  onClose,
}: DeleteRuleDialogProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('deleteDialog.body', { pattern: rule.pattern })}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('form.cancel')}</Button>
        <Button variant="primary" disabled={deleting} onClick={onConfirm}>
          {t('deleteDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
