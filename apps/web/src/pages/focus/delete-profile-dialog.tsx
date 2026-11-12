import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';

interface DeleteProfileDialogProps {
  readonly deleting: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

/** Asks before a profile is deleted. */
export function DeleteProfileDialog({
  deleting,
  onConfirm,
  onClose,
}: DeleteProfileDialogProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('deleteDialog.body')}</DialogContentText>
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
