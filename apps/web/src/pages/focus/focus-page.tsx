import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { GatewayClient } from '../../api/gateway.js';
import { AlertCenter } from './alert-center.js';
import { AlertPolicy } from './alert-policy.js';
import { FocusCard } from './focus-card.js';
import { KnownApps } from './known-apps.js';
import { useFocusMutations } from './mutations.js';
import { newAppIds } from './profile-form.js';
import { ProfilesSection } from './profiles-section.js';
import {
  alertPolicyQuery,
  alertQueueQuery,
  focusStateQuery,
  knownAppsQuery,
  profilesQuery,
} from './queries.js';
import { Section } from './section.js';

interface FocusPageProps {
  /** The router context's gateway client; tests inject a fake. */
  readonly client: GatewayClient;
  /** The moment the time left is counted from. The route passes the current time; tests pin it. */
  readonly now?: Date;
}

const SKELETON_HEIGHT = 120;

/** Focus mode: start and stop it, choose what it mutes, and see which alerts it held back. */
export function FocusPage({ client, now }: FocusPageProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  const state = useQuery(focusStateQuery(client));
  const profiles = useQuery(profilesQuery(client));
  const knownApps = useQuery(knownAppsQuery(client));
  const queue = useQuery(alertQueueQuery(client));
  const policy = useQuery(alertPolicyQuery(client));
  const mutations = useFocusMutations(client);

  const profileItems = profiles.data?.items ?? [];
  const knownItems = knownApps.data?.items ?? [];

  return (
    <Stack spacing={6}>
      <Typography variant="h1">{t('title')}</Typography>

      {state.isError ? <Alert severity="error">{t('errors.state')}</Alert> : null}
      {state.isPending ? <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} /> : null}
      {state.data === undefined ? null : (
        <FocusCard
          state={state.data}
          profiles={profileItems}
          now={now ?? new Date()}
          busy={mutations.startFocus.isPending || mutations.stopFocus.isPending}
          onStart={(body): void => mutations.startFocus.mutate(body)}
          onStop={(): void => mutations.stopFocus.mutate()}
        />
      )}

      <ProfilesSection profiles={profiles} knownApps={knownItems} mutations={mutations} />

      <Section title={t('apps.title')}>
        {knownApps.isError ? <Alert severity="error">{t('errors.apps')}</Alert> : null}
        {knownApps.data === undefined ? null : (
          <KnownApps apps={knownItems} fresh={newAppIds(knownItems, profileItems)} />
        )}
      </Section>

      <Section title={t('queue.title')}>
        {queue.isError ? <Alert severity="error">{t('errors.queue')}</Alert> : null}
        {queue.data === undefined ? null : <AlertCenter items={queue.data.items} />}
      </Section>

      <Section title={t('policy.title')}>
        {policy.isError ? <Alert severity="error">{t('errors.policy')}</Alert> : null}
        {policy.data === undefined ? null : (
          <AlertPolicy
            policy={policy.data}
            saving={mutations.updateAlertPolicy.isPending}
            onSave={(body): void => mutations.updateAlertPolicy.mutate(body)}
          />
        )}
      </Section>
    </Stack>
  );
}
