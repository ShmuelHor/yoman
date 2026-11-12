import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { UseQueryResult } from '@tanstack/react-query';
import type { KnownApp, Profile, ProfileList } from '@yoman/shared/focus';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { DeleteProfileDialog } from './delete-profile-dialog.js';
import type { FocusMutations } from './mutations.js';
import { ProfileDialog } from './profile-dialog.js';
import { ProfilesTable } from './profiles-table.js';
import { Section } from './section.js';

const SKELETON_HEIGHT = 120;

/** What the user is doing in a dialog; at most one is open. */
type Dialog =
  | { readonly kind: 'edit'; readonly profile: Profile | undefined }
  | { readonly kind: 'delete'; readonly profile: Profile };

interface ProfilesSectionProps {
  readonly profiles: UseQueryResult<ProfileList, Error>;
  readonly knownApps: readonly KnownApp[];
  readonly mutations: FocusMutations;
}

function ProfilesBody({
  profiles,
  knownApps,
  onEdit,
  onDelete,
}: {
  readonly profiles: UseQueryResult<ProfileList, Error>;
  readonly knownApps: readonly KnownApp[];
  readonly onEdit: (profile: Profile) => void;
  readonly onDelete: (profile: Profile) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('focus');
  if (profiles.isError) {
    return <Alert severity="error">{t('errors.profiles')}</Alert>;
  }
  if (profiles.data === undefined) {
    return <Skeleton aria-busy variant="rounded" height={SKELETON_HEIGHT} />;
  }
  if (profiles.data.items.length === 0) {
    return <Typography color="text.secondary">{t('profiles.empty')}</Typography>;
  }
  return (
    <ProfilesTable
      profiles={profiles.data.items}
      knownApps={knownApps}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

/** The profiles list with its add, edit and delete dialogs. */
export function ProfilesSection({
  profiles,
  knownApps,
  mutations,
}: ProfilesSectionProps): React.JSX.Element {
  const { t } = useTranslation('focus');
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined);
  const close = (): void => setDialog(undefined);

  return (
    <Section
      title={t('profiles.title')}
      action={
        <Button
          variant="primary"
          onClick={(): void => setDialog({ kind: 'edit', profile: undefined })}
        >
          {t('profiles.add')}
        </Button>
      }
    >
      <ProfilesBody
        profiles={profiles}
        knownApps={knownApps}
        onEdit={(profile): void => setDialog({ kind: 'edit', profile })}
        onDelete={(profile): void => setDialog({ kind: 'delete', profile })}
      />
      {dialog?.kind === 'edit' ? (
        <ProfileDialog
          profile={dialog.profile}
          profiles={profiles.data?.items ?? []}
          knownApps={knownApps}
          saving={mutations.createProfile.isPending || mutations.updateProfile.isPending}
          onClose={close}
          onSave={(body): void => {
            const { profile } = dialog;
            if (profile === undefined) {
              mutations.createProfile.mutate(body, { onSuccess: close });
              return;
            }
            mutations.updateProfile.mutate({ id: profile.id, body }, { onSuccess: close });
          }}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteProfileDialog
          deleting={mutations.deleteProfile.isPending}
          onClose={close}
          onConfirm={(): void =>
            mutations.deleteProfile.mutate(dialog.profile.id, { onSuccess: close })
          }
        />
      ) : null}
    </Section>
  );
}
