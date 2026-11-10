import Chip from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/** `anomaly` marks something unusual, in the accent colors (DESIGN.md rule 2). */
export type TagVariant = 'default' | 'anomaly';

export interface TagProps {
  readonly children: ReactNode;
  readonly variant?: TagVariant;
}

const tagSx: Readonly<Record<TagVariant, SxProps<Theme>>> = {
  default: (theme) => ({
    borderRadius: theme.vars.shape.borderRadius,
    borderColor: theme.vars.palette.tokens.line,
    color: theme.vars.palette.tokens.muted,
  }),
  anomaly: (theme) => ({
    borderRadius: theme.vars.shape.borderRadius,
    backgroundColor: theme.vars.palette.tokens.accentBg,
  }),
};

/** A small inline label, such as a category or an "unusual" marker. */
export function Tag({ children, variant = 'default' }: TagProps): React.JSX.Element {
  return (
    <Chip
      label={children}
      size="small"
      variant="outlined"
      color={variant === 'anomaly' ? 'primary' : 'default'}
      sx={tagSx[variant]}
    />
  );
}
