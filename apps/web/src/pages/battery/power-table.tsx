import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { AppPower } from '@yoman/shared/battery';
import type { App } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { splitMinutes } from './format.js';

interface PowerTableProps {
  readonly items: readonly AppPower[];
  readonly apps: readonly App[];
}

interface PowerRow {
  readonly id: string;
  readonly name: string;
  readonly averageW: number;
  readonly minutes: number;
}

const SECONDS_PER_MINUTE = 60;

/**
 * What drains the battery: apps by the average draw while they were in focus.
 * Display names are untrusted (SECURITY A6): the grid renders them as text.
 */
export function PowerTable({ items, apps }: PowerTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('battery');
  const watts = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const rows: PowerRow[] = items.map((item) => ({
    id: item.appId,
    name: apps.find((app) => app.id === item.appId)?.name ?? item.appId,
    averageW: item.averageW,
    minutes: Math.round(item.seconds / SECONDS_PER_MINUTE),
  }));
  const columns: GridColDef<PowerRow>[] = [
    { field: 'name', headerName: t('drain.columns.app'), flex: 1, minWidth: 180 },
    {
      field: 'averageW',
      headerName: t('drain.columns.power'),
      type: 'number',
      minWidth: 140,
      valueFormatter: (value: number): string => t('watts', { value: watts.format(value) }),
    },
    {
      field: 'minutes',
      headerName: t('drain.columns.time'),
      type: 'number',
      minWidth: 140,
      valueFormatter: (value: number): string => t('duration', splitMinutes(value)),
    },
  ];
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      initialState={{ sorting: { sortModel: [{ field: 'averageW', sort: 'desc' }] } }}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('drain.label')}
    />
  );
}
