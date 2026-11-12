import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { Incident, IncidentType } from '@yoman/shared/system';
import { useTranslation } from 'react-i18next';

import { Tag } from '../../components/tag.js';
import { bytesToMegabytes, splitDuration } from './format.js';

interface IncidentsTableProps {
  readonly incidents: readonly Incident[];
  /** Ongoing incidents are measured up to this moment. */
  readonly now: Date;
}

interface IncidentRow {
  readonly id: string;
  readonly type: IncidentType;
  readonly start: Date;
  readonly durationMs: number;
  readonly ongoing: boolean;
  readonly peak: number;
  readonly culprits: string;
}

const PRESSURE_TYPES: readonly IncidentType[] = ['cpu', 'memory', 'io', 'memory-critical'];

/** Incident history, newest first. Process names are untrusted (SECURITY A6) and shown as text. */
export function IncidentsTable({ incidents, now }: IncidentsTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('system');
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const rows: IncidentRow[] = incidents.map((incident) => {
    const start = new Date(incident.start);
    const end = incident.end === null ? now : new Date(incident.end);
    return {
      id: incident.id,
      type: incident.type,
      start,
      durationMs: end.getTime() - start.getTime(),
      ongoing: incident.end === null,
      peak: incident.peak,
      culprits: incident.culprits.map((culprit) => culprit.comm).join(', '),
    };
  });
  const peakText = (row: IncidentRow): string => {
    if (PRESSURE_TYPES.includes(row.type)) {
      return t('peak.percent', { value: number.format(row.peak) });
    }
    if (row.type === 'thermal') {
      return t('peak.celsius', { value: number.format(row.peak) });
    }
    return t('peak.leak', { value: number.format(bytesToMegabytes(row.peak)) });
  };
  const columns: GridColDef<IncidentRow>[] = [
    {
      field: 'type',
      headerName: t('incidents.columns.type'),
      minWidth: 160,
      valueFormatter: (value: IncidentType): string => t(`incidentType.${value}`),
    },
    {
      field: 'start',
      headerName: t('incidents.columns.start'),
      type: 'dateTime',
      minWidth: 170,
      valueFormatter: (value: Date): string => dateTime.format(value),
    },
    {
      field: 'durationMs',
      headerName: t('incidents.columns.duration'),
      type: 'number',
      minWidth: 140,
      renderCell: ({ row }): React.JSX.Element => {
        const parts = splitDuration(row.durationMs);
        return (
          <>
            <span>{t(parts.hours > 0 ? 'duration.hours' : 'duration.minutes', { ...parts })}</span>
            {row.ongoing ? <Tag variant="anomaly">{t('incidents.ongoing')}</Tag> : null}
          </>
        );
      },
    },
    {
      field: 'peak',
      headerName: t('incidents.columns.peak'),
      type: 'number',
      minWidth: 120,
      renderCell: ({ row }): string => peakText(row),
    },
    { field: 'culprits', headerName: t('incidents.columns.culprits'), flex: 1, minWidth: 200 },
  ];
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      initialState={{ sorting: { sortModel: [{ field: 'start', sort: 'desc' }] } }}
      disableColumnMenu
      disableRowSelectionOnClick
      disableVirtualization
      autoHeight
      aria-label={t('incidents.label')}
    />
  );
}
