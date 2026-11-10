import MuiButton from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export interface NavTabProps {
  readonly to: string;
  readonly children: ReactNode;
  /** Active only on an exact match, so the index tab is not active on every page. */
  readonly end?: boolean;
}

const tabSx: SxProps<Theme> = (theme) => ({
  paddingBlock: 1,
  paddingInline: 3,
  fontWeight: 'fontWeightRegular',
  color: theme.vars.palette.tokens.muted,
  '&[aria-current="page"]': {
    backgroundColor: theme.vars.palette.tokens.text,
    color: theme.vars.palette.tokens.bg,
  },
});

/** A navigation tab. React Router marks the current one with `aria-current="page"`. */
export function NavTab({ to, children, end = true }: NavTabProps): React.JSX.Element {
  return (
    <MuiButton component={NavLink} to={to} end={end} sx={tabSx}>
      {children}
    </MuiButton>
  );
}
