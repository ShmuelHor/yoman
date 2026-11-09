import type { ButtonHTMLAttributes } from 'react';

import './button.css';

/** `primary` is the one main action on a screen (DESIGN.md rule 2); everything else is `secondary`. */
export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
}

/** A button in the design system's two variants. It never submits a form unless asked to. */
export function Button({
  variant = 'secondary',
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  return <button {...rest} type={type} className={`button button--${variant}`} />;
}
