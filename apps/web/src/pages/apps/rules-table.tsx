import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { App, Rule } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { Tag } from '../../components/tag.js';
import { appsMatching } from './rule-preview.js';

interface RulesTableProps {
  readonly rules: readonly Rule[];
  readonly apps: readonly App[];
  readonly onEdit: (rule: Rule) => void;
  readonly onDelete: (rule: Rule) => void;
}

interface RuleRow extends Rule {
  /** How many known apps the rule applies to; `null` for a title rule, which cannot be previewed. */
  readonly matches: number | null;
}

/** The category rules, with how many of the user's apps each one applies to. */
export function RulesTable({ rules, apps, onEdit, onDelete }: RulesTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('apps');
  const number = new Intl.NumberFormat(i18n.language);
  const rows: RuleRow[] = rules.map((rule) => ({
    ...rule,
    matches: appsMatching(rule, apps)?.length ?? null,
  }));
  const columns: GridColDef<RuleRow>[] = [
    {
      field: 'field',
      headerName: t('columns.field'),
      minWidth: 120,
      valueFormatter: (value: Rule['field']): string => t(`field.${value}`),
    },
    {
      field: 'match',
      headerName: t('columns.match'),
      minWidth: 120,
      valueFormatter: (value: Rule['match']): string => t(`match.${value}`),
    },
    { field: 'pattern', headerName: t('columns.pattern'), flex: 1, minWidth: 160 },
    {
      field: 'category',
      headerName: t('columns.category'),
      minWidth: 140,
      renderCell: ({ row }): React.JSX.Element => <Tag>{row.category}</Tag>,
    },
    {
      field: 'priority',
      headerName: t('columns.priority'),
      type: 'number',
      minWidth: 100,
      valueFormatter: (value: number): string => number.format(value),
    },
    {
      field: 'matches',
      headerName: t('columns.matches'),
      type: 'number',
      minWidth: 120,
      valueFormatter: (value: number | null): string =>
        value === null ? t('notPreviewable') : number.format(value),
    },
    {
      field: 'actions',
      headerName: t('columns.actions'),
      sortable: false,
      filterable: false,
      minWidth: 200,
      renderCell: ({ row }): React.JSX.Element => (
        <>
          <Button onClick={(): void => onEdit(row)}>{t('edit')}</Button>
          <Button onClick={(): void => onDelete(row)}>{t('delete')}</Button>
        </>
      ),
    },
  ];
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      initialState={{ sorting: { sortModel: [{ field: 'priority', sort: 'desc' }] } }}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('rules.label')}
    />
  );
}
