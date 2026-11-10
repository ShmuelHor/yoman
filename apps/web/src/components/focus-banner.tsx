import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface FocusBannerProps {
  /** The localized status line, such as "Focus mode · 47 min left". */
  readonly children: ReactNode;
}

/** The bar across the top of every page while focus mode is on (DESIGN.md rule 3). */
export function FocusBanner({ children }: FocusBannerProps): React.JSX.Element {
  return (
    <Typography
      component="div"
      role="status"
      sx={{
        paddingBlock: 2,
        paddingInline: 4,
        bgcolor: 'success.main',
        color: 'success.contrastText',
        fontWeight: 'fontWeightMedium',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </Typography>
  );
}
