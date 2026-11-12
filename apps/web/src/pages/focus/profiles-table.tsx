import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { KnownApp, Profile } from '@yoman/shared/focus';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { appLabel } from './profile-form.js';

interface ProfilesTableProps {
  readonly profiles: readonly Profile[];
  readonly knownApps: readonly KnownApp[];
  readonly onEdit: (profile: Profile) => void;
  readonly onDelete: (profile: Profile) => void;
}

interface ProfileRow {
  readonly id: string;
  readonly profile: Profile;
  readonly name: string;
  readonly muted: string;
  readonly exceptions: string;
}

/** The profiles, each with the apps it mutes and the apps that keep notifying. */
export function ProfilesTable({
  profiles,
  knownApps,
  onEdit,
  onDelete,
}: ProfilesTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('focus');
  const list = new Intl.ListFormat(i18n.language, { style: 'narrow', type: 'unit' });
  const names = (ids: readonly string[]): string =>
    ids.length === 0 ? t('profiles.none') : list.format(ids.map((id) => appLabel(knownApps, id)));
  const rows: ProfileRow[] = profiles.map((profile) => ({
    id: profile.id,
    profile,
    name: profile.name,
    muted: names(profile.mutedApps),
    exceptions: names(profile.exceptions),
  }));
  const columns: GridColDef<ProfileRow>[] = [
    { field: 'name', headerName: t('profiles.columns.name'), minWidth: 160 },
    { field: 'muted', headerName: t('profiles.columns.muted'), flex: 1, minWidth: 200 },
    { field: 'exceptions', headerName: t('profiles.columns.exceptions'), flex: 1, minWidth: 200 },
    {
      field: 'muteNewApps',
      headerName: t('profiles.columns.muteNewApps'),
      minWidth: 140,
      valueGetter: (_value, row): string => t(row.profile.muteNewApps ? 'yes' : 'no'),
    },
    {
      field: 'actions',
      headerName: t('profiles.columns.actions'),
      sortable: false,
      filterable: false,
      minWidth: 200,
      renderCell: ({ row }): React.JSX.Element => (
        <>
          <Button onClick={(): void => onEdit(row.profile)}>{t('edit')}</Button>
          <Button onClick={(): void => onDelete(row.profile)}>{t('delete')}</Button>
        </>
      ),
    },
  ];
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('profiles.label')}
    />
  );
}
