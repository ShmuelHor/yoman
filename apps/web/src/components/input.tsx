import type { InputHTMLAttributes } from 'react';

import './input.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** The visible label, which is also the field's accessible name. */
  readonly label: string;
}

/** A labelled text field. */
export function Input({ label, type = 'text', ...rest }: InputProps): React.JSX.Element {
  return (
    <label className="input">
      <span className="input__label">{label}</span>
      <input {...rest} type={type} className="input__field" />
    </label>
  );
}
