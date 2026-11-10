import MuiCard from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { type ReactNode, useId } from 'react';

/** `hero` is the page's main number (44px); `secondary` is every other card (28px). */
export type CardSize = 'hero' | 'secondary';

export interface CardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** One line that puts the value in context, such as "47 min more than yesterday". */
  readonly context?: ReactNode;
  readonly size?: CardSize;
}

const VALUE_VARIANT = { hero: 'hero', secondary: 'number' } as const;

/**
 * A unit of information with a fixed structure: label, value in the serif,
 * context line (DESIGN.md rule 1). The label names the card for screen readers.
 */
export function Card({ label, value, context, size = 'secondary' }: CardProps): React.JSX.Element {
  const labelId = useId();
  return (
    <MuiCard
      component="section"
      variant="outlined"
      aria-labelledby={labelId}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, padding: 4 }}
    >
      <Typography id={labelId} variant="label">
        {label}
      </Typography>
      <Typography variant={VALUE_VARIANT[size]}>{value}</Typography>
      {context === undefined ? null : <Typography variant="label">{context}</Typography>}
    </MuiCard>
  );
}
