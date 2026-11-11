import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { App } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { Tag } from '../../components/tag.js';

interface AppsTableProps {
  readonly apps: readonly App[];
  readonly onEdit: (app: App) => void;
}

/** The apps the agent has seen. Names come from window classes, so they are untrusted and shown as text. */
export function AppsTable({ apps, onEdit }: AppsTableProps): React.JSX.Element {
  const { t } = useTranslation('apps');
  const columns: GridColDef<App>[] = [
    { field: 'name', headerName: t('columns.name'), flex: 1, minWidth: 160 },
    { field: 'id', headerName: t('columns.id'), flex: 1, minWidth: 160 },
    {
      field: 'category',
      headerName: t('columns.category'),
      flex: 1,
      minWidth: 140,
      renderCell: ({ row }): React.JSX.Element =>
        row.category === null ? <span>{t('uncategorized')}</span> : <Tag>{row.category}</Tag>,
    },
    {
      field: 'actions',
      headerName: t('columns.actions'),
      sortable: false,
      filterable: false,
      minWidth: 120,
      renderCell: ({ row }): React.JSX.Element => (
        <Button onClick={(): void => onEdit(row)}>{t('edit')}</Button>
      ),
    },
  ];
  return (
    <DataGrid
      rows={[...apps]}
      columns={columns}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('apps.label')}
    />
  );
}
