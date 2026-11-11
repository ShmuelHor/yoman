import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { App, Rule } from '@yoman/shared/sessions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { Button } from '../../components/button.js';
import { AppDialog } from './app-dialog.js';
import { AppsTable } from './apps-table.js';
import { DeleteRuleDialog } from './delete-rule-dialog.js';
import { useAppsMutations } from './mutations.js';
import { appsQuery, rulesQuery } from './queries.js';
import { RuleDialog } from './rule-dialog.js';
import { RulesTable } from './rules-table.js';

interface AppsPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
}

const SKELETON_HEIGHT = 160;

/** What the user is doing in a dialog; at most one is open. */
type Dialog =
  | { readonly kind: 'app'; readonly app: App }
  | { readonly kind: 'rule'; readonly rule: Rule | undefined }
  | { readonly kind: 'delete'; readonly rule: Rule };

/** Apps and category rules: rename and recategorize apps, and manage the rules that categorize the rest. */
export function AppsPage({ client }: AppsPageProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  const apps = useQuery(appsQuery(client));
  const rules = useQuery(rulesQuery(client));
  const mutations = useAppsMutations(client);
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined);
  const close = (): void => setDialog(undefined);

  const appItems = apps.data?.items ?? [];
  const failed = apps.isError || rules.isError;

  return (
    <Stack spacing={6}>
      <Typography variant="h1">{t('title')}</Typography>
      {failed ? <Alert severity="error">{t('error')}</Alert> : null}
      {apps.isPending || rules.isPending ? (
        <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} />
      ) : null}
      {apps.data === undefined ? null : (
        <Section title={t('apps.label')}>
          <AppsTable
            apps={apps.data.items}
            onEdit={(app): void => setDialog({ kind: 'app', app })}
          />
        </Section>
      )}
      {rules.data === undefined ? null : (
        <Section
          title={t('rules.label')}
          action={
            <Button
              variant="primary"
              onClick={(): void => setDialog({ kind: 'rule', rule: undefined })}
            >
              {t('rules.add')}
            </Button>
          }
        >
          <RulesTable
            rules={rules.data.items}
            apps={appItems}
            onEdit={(rule): void => setDialog({ kind: 'rule', rule })}
            onDelete={(rule): void => setDialog({ kind: 'delete', rule })}
          />
        </Section>
      )}
      {dialog?.kind === 'app' ? (
        <AppDialog
          app={dialog.app}
          saving={mutations.updateApp.isPending}
          onClose={close}
          onSave={(body): void =>
            mutations.updateApp.mutate({ id: dialog.app.id, body }, { onSuccess: close })
          }
        />
      ) : null}
      {dialog?.kind === 'rule' ? (
        <RuleDialog
          rule={dialog.rule}
          apps={appItems}
          saving={mutations.createRule.isPending || mutations.updateRule.isPending}
          onClose={close}
          onSave={(body): void => {
            const { rule } = dialog;
            if (rule === undefined) {
              mutations.createRule.mutate(body, { onSuccess: close });
              return;
            }
            mutations.updateRule.mutate({ id: rule.id, body }, { onSuccess: close });
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteRuleDialog
          rule={dialog.rule}
          deleting={mutations.deleteRule.isPending}
          onClose={close}
          onConfirm={(): void => mutations.deleteRule.mutate(dialog.rule.id, { onSuccess: close })}
        />
      ) : null}
    </Stack>
  );
}

interface SectionProps {
  readonly title: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
}

function Section({ title, action, children }: SectionProps): React.JSX.Element {
  return (
    <Stack component="section" spacing={3} aria-label={title}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <Typography variant="h2">{title}</Typography>
        {action}
      </Box>
      {children}
    </Stack>
  );
}
