import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}

/** A titled block of the page, with an optional action beside the title. */
export function Section({ title, children, action }: SectionProps): React.JSX.Element {
  return (
    <Stack component="section" spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <Typography variant="h2">{title}</Typography>
        {action}
      </Box>
      {children}
    </Stack>
  );
}
