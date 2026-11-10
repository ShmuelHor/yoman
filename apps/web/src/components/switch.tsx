import MuiSwitch, { switchClasses } from '@mui/material/Switch';
import type { SxProps, Theme } from '@mui/material/styles';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** The accessible name; the switch shows no text of its own. */
  readonly label: string;
  readonly disabled?: boolean;
}

/** A `--surface` knob on a `--line` track that turns `--ok` when on. */
const switchSx: SxProps<Theme> = (theme) => ({
  [`& .${switchClasses.thumb}`]: { backgroundColor: theme.vars.palette.tokens.surface },
  [`& .${switchClasses.track}`]: {
    backgroundColor: theme.vars.palette.tokens.line,
    opacity: 1,
  },
  [`& .${switchClasses.switchBase}.${switchClasses.checked} + .${switchClasses.track}`]: {
    backgroundColor: theme.vars.palette.tokens.ok,
    opacity: 1,
  },
});

/** An on/off switch. Its track turns `--ok` when on (DESIGN.md rule 3). */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps): React.JSX.Element {
  return (
    <MuiSwitch
      checked={checked}
      color="success"
      disabled={disabled}
      onChange={(_event, next): void => onChange(next)}
      slotProps={{ input: { 'aria-label': label } }}
      sx={switchSx}
    />
  );
}
