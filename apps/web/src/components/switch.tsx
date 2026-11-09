import './switch.css';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** The accessible name; the switch shows no text of its own. */
  readonly label: string;
  readonly disabled?: boolean;
}

/** An on/off switch. Its track turns `--ok` when on (DESIGN.md rule 3). */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={(): void => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}
