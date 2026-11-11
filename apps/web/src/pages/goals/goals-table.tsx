import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { Goal, GoalProgressItem } from '@yoman/shared/goals';
import type { App } from '@yoman/shared/sessions';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/button.js';
import { Tag } from '../../components/tag.js';
import { weekdaySummary } from './weekdays.js';

interface GoalsTableProps {
  readonly goals: readonly Goal[];
  readonly apps: readonly App[];
  /** Today's progress; a goal that is not scheduled today has none. */
  readonly progress: readonly GoalProgressItem[];
  readonly onEdit: (goal: Goal) => void;
  readonly onDelete: (goal: Goal) => void;
}

interface GoalRow {
  readonly id: string;
  readonly goal: Goal;
  readonly type: Goal['type'];
  readonly target: string;
  readonly minutes: number;
  readonly days: string;
  readonly progress: GoalProgressItem | undefined;
}

/** The goal's target as text: an app's name (untrusted, shown as text) or the category. */
function targetLabel(goal: Goal, apps: readonly App[]): string {
  const { target } = goal;
  if (target.kind === 'category') {
    return target.category;
  }
  return apps.find((app) => app.id === target.appId)?.name ?? target.appId;
}

/** The user's goals, each with how today is going. */
export function GoalsTable({
  goals,
  apps,
  progress,
  onEdit,
  onDelete,
}: GoalsTableProps): React.JSX.Element {
  const { t, i18n } = useTranslation('goals');
  const number = new Intl.NumberFormat(i18n.language);
  const rows: GoalRow[] = goals.map((goal) => ({
    id: goal.id,
    goal,
    type: goal.type,
    target: targetLabel(goal, apps),
    minutes: goal.minutes,
    days: weekdaySummary(goal.days, i18n.language),
    progress: progress.find((item) => item.goalId === goal.id),
  }));
  const columns: GridColDef<GoalRow>[] = [
    {
      field: 'type',
      headerName: t('columns.type'),
      minWidth: 140,
      valueFormatter: (value: Goal['type']): string => t(`type.${value}`),
    },
    { field: 'target', headerName: t('columns.target'), flex: 1, minWidth: 160 },
    {
      field: 'minutes',
      headerName: t('columns.minutes'),
      type: 'number',
      minWidth: 100,
      valueFormatter: (value: number): string => number.format(value),
    },
    { field: 'days', headerName: t('columns.days'), flex: 1, minWidth: 180 },
    {
      field: 'progress',
      headerName: t('columns.today'),
      minWidth: 220,
      sortable: false,
      renderCell: ({ row }): React.JSX.Element =>
        row.progress === undefined ? (
          <span>{t('progress.notToday')}</span>
        ) : (
          <>
            <span>
              {t('progress.value', {
                used: number.format(row.progress.minutesUsed),
                target: number.format(row.progress.targetMinutes),
              })}
            </span>
            <Tag variant={row.progress.status === 'breached' ? 'anomaly' : 'default'}>
              {t(`status.${row.progress.status}`)}
            </Tag>
          </>
        ),
    },
    {
      field: 'actions',
      headerName: t('columns.actions'),
      sortable: false,
      filterable: false,
      minWidth: 200,
      renderCell: ({ row }): React.JSX.Element => (
        <>
          <Button onClick={(): void => onEdit(row.goal)}>{t('edit')}</Button>
          <Button onClick={(): void => onDelete(row.goal)}>{t('delete')}</Button>
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
      aria-label={t('list.label')}
    />
  );
}
