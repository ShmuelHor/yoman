import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { CulpritSummary } from '@yoman/shared/system';
import { useTranslation } from 'react-i18next';

interface CulpritsTableProps {
  readonly culprits: readonly CulpritSummary[];
}

interface CulpritRow {
  readonly id: string;
  readonly comm: string;
  readonly container: string;
  readonly incidents: number;
}

/** Processes that keep causing incidents. Names are untrusted (SECURITY A6) and shown as text. */
export function CulpritsTable({ culprits }: CulpritsTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('system');
  const number = new Intl.NumberFormat(i18n.language);
  const rows: CulpritRow[] = culprits.map((culprit) => ({
    id: `${culprit.comm}\u0000${culprit.container ?? ''}`,
    comm: culprit.comm,
    container: culprit.container ?? t('culprits.noContainer'),
    incidents: culprit.incidents,
  }));
  const columns: GridColDef<CulpritRow>[] = [
    { field: 'comm', headerName: t('culprits.columns.process'), flex: 1, minWidth: 160 },
    { field: 'container', headerName: t('culprits.columns.container'), flex: 1, minWidth: 160 },
    {
      field: 'incidents',
      headerName: t('culprits.columns.incidents'),
      type: 'number',
      minWidth: 120,
      valueFormatter: (value: number): string => number.format(value),
    },
  ];
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      initialState={{ sorting: { sortModel: [{ field: 'incidents', sort: 'desc' }] } }}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('culprits.label')}
    />
  );
}
