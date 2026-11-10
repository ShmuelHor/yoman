import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import OutlinedInput, { type OutlinedInputProps } from '@mui/material/OutlinedInput';
import type { SxProps, Theme } from '@mui/material/styles';
import { useId } from 'react';

export interface InputProps
  extends Omit<OutlinedInputProps, 'className' | 'sx' | 'label' | 'notched' | 'id'> {
  /** The visible label, above the field, which is also its accessible name. */
  readonly label: string;
}

const fieldSx: SxProps<Theme> = (theme) => ({
  backgroundColor: theme.vars.palette.tokens.bg,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.vars.palette.tokens.line },
  '& input::placeholder': { color: theme.vars.palette.tokens.muted, opacity: 1 },
});

/** A labelled text field. */
export function Input({ label, type = 'text', ...rest }: InputProps): React.JSX.Element {
  const id = useId();
  return (
    <FormControl sx={{ gap: 1 }}>
      <FormLabel htmlFor={id} sx={{ typography: 'label' }}>
        {label}
      </FormLabel>
      <OutlinedInput {...rest} id={id} type={type} size="small" sx={fieldSx} />
    </FormControl>
  );
}
