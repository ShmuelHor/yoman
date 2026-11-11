import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { Goal } from '@yoman/shared/goals';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { Button } from '../../components/button.js';
import { DeleteGoalDialog } from './delete-goal-dialog.js';
import { GoalDialog } from './goal-dialog.js';
import { GoalsTable } from './goals-table.js';
import { useGoalsMutations } from './mutations.js';
import { appsQuery, goalProgressQuery, goalsQuery, localDate } from './queries.js';

interface GoalsPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
  /** The day whose progress is shown. The route passes today; tests pin it. */
  readonly today?: Date;
}

const SKELETON_HEIGHT = 160;

/** What the user is doing in a dialog; at most one is open. */
type Dialog =
  | { readonly kind: 'edit'; readonly goal: Goal | undefined }
  | { readonly kind: 'delete'; readonly goal: Goal };

/** Goals: daily limits and targets for apps and categories, with how today is going. */
export function GoalsPage({ client, today }: GoalsPageProps): React.JSX.Element {
  const { t } = useTranslation('goals');
  const date = localDate(today ?? new Date());
  const goals = useQuery(goalsQuery(client));
  const progress = useQuery(goalProgressQuery(client, date));
  const apps = useQuery(appsQuery(client));
  const mutations = useGoalsMutations(client);
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined);
  const close = (): void => setDialog(undefined);

  const appItems = apps.data?.items ?? [];

  return (
    <Stack spacing={6}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <Typography variant="h1">{t('title')}</Typography>
        <Button
          variant="primary"
          onClick={(): void => setDialog({ kind: 'edit', goal: undefined })}
        >
          {t('add')}
        </Button>
      </Box>
      {goals.isError ? <Alert severity="error">{t('error')}</Alert> : null}
      {progress.isError && !goals.isError ? (
        <Alert severity="warning">{t('progressError')}</Alert>
      ) : null}
      {goals.isPending ? <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} /> : null}
      {goals.data === undefined ? null : (
        <GoalsTable
          goals={goals.data.items}
          apps={appItems}
          progress={progress.data?.items ?? []}
          onEdit={(goal): void => setDialog({ kind: 'edit', goal })}
          onDelete={(goal): void => setDialog({ kind: 'delete', goal })}
        />
      )}
      {dialog?.kind === 'edit' ? (
        <GoalDialog
          goal={dialog.goal}
          apps={appItems}
          saving={mutations.createGoal.isPending || mutations.updateGoal.isPending}
          onClose={close}
          onSave={(body): void => {
            const { goal } = dialog;
            if (goal === undefined) {
              mutations.createGoal.mutate(body, { onSuccess: close });
              return;
            }
            mutations.updateGoal.mutate({ id: goal.id, body }, { onSuccess: close });
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteGoalDialog
          deleting={mutations.deleteGoal.isPending}
          onClose={close}
          onConfirm={(): void => mutations.deleteGoal.mutate(dialog.goal.id, { onSuccess: close })}
        />
      ) : null}
    </Stack>
  );
}
