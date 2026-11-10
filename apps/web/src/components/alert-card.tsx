import MuiCard from '@mui/material/Card';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { type ReactNode, useId } from 'react';

export interface AlertCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

const alertSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 4,
  borderColor: theme.vars.palette.tokens.accent,
  backgroundColor: theme.vars.palette.tokens.accentBg,
});

/** An anomaly or warning that needs the user's attention, in the accent colors. */
export function AlertCard({ title, children }: AlertCardProps): React.JSX.Element {
  const titleId = useId();
  return (
    <MuiCard component="section" variant="outlined" aria-labelledby={titleId} sx={alertSx}>
      <Typography id={titleId} variant="h2" color="primary">
        {title}
      </Typography>
      <Typography component="div">{children}</Typography>
    </MuiCard>
  );
}
