import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';

/** `primary` is the one main action on a screen (DESIGN.md rule 2); everything else is `secondary`. */
export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps
  extends Omit<MuiButtonProps, 'variant' | 'color' | 'size' | 'className' | 'sx'> {
  readonly variant?: ButtonVariant;
}

/** A button in the design system's two variants. It never submits a form unless asked to. */
export function Button({
  variant = 'secondary',
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  if (variant === 'primary') {
    return <MuiButton {...rest} type={type} variant="contained" color="primary" />;
  }
  return (
    <MuiButton
      {...rest}
      type={type}
      variant="outlined"
      sx={{ borderColor: 'divider', color: 'text.primary' }}
    />
  );
}
