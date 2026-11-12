import NativeSelect from '@mui/material/NativeSelect';
import OutlinedInput from '@mui/material/OutlinedInput';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AlertLevel, AlertType } from '@yoman/shared/alerts';
import type { AlertPolicy as AlertPolicyData } from '@yoman/shared/focus';
import { notificationMessages } from '@yoman/shared/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';

const DEFAULT_CHOICE = 'default';

type Choices = Partial<Record<AlertType, AlertLevel>>;

interface AlertPolicyProps {
  readonly policy: AlertPolicyData;
  readonly saving: boolean;
  readonly onSave: (policy: AlertPolicyData) => void;
}

/** The level an alert type is raised at: the built-in default, or one the user picked. */
export function AlertPolicy({ policy, saving, onSave }: AlertPolicyProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  const [choices, setChoices] = useState<Choices>(() =>
    Object.fromEntries(policy.items.map(({ type, level }) => [type, level])),
  );

  const choose = (type: AlertType, value: string): void => {
    const level = AlertLevel.safeParse(value);
    setChoices((current) => {
      const next = { ...current };
      if (level.success) {
        next[type] = level.data;
      } else {
        delete next[type];
      }
      return next;
    });
  };
  const save = (): void =>
    onSave({
      items: AlertType.options.flatMap((type) => {
        const level = choices[type];
        return level === undefined ? [] : [{ type, level }];
      }),
    });

  return (
    <Stack spacing={3}>
      {AlertType.options.map((type) => (
        <Stack key={type} direction="row" spacing={3} sx={{ alignItems: 'center' }}>
          <Typography sx={{ flex: 1 }}>{t(notificationMessages[type].title)}</Typography>
          <NativeSelect
            input={<OutlinedInput size="small" />}
            value={choices[type] ?? DEFAULT_CHOICE}
            onChange={(event): void => choose(type, event.target.value)}
            inputProps={{ 'aria-label': t(notificationMessages[type].title) }}
          >
            <option value={DEFAULT_CHOICE}>{t('policy.default')}</option>
            {AlertLevel.options.map((level) => (
              <option key={level} value={level}>
                {t(`levels.${level}`)}
              </option>
            ))}
          </NativeSelect>
        </Stack>
      ))}
      <div>
        <Button variant="primary" disabled={saving} onClick={save}>
          {t('form.save')}
        </Button>
      </div>
    </Stack>
  );
}
