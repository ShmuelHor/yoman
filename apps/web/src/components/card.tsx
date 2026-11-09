import { type ReactNode, useId } from 'react';

import './card.css';

/** `hero` is the page's main number (44px); `secondary` is every other card (28px). */
export type CardSize = 'hero' | 'secondary';

export interface CardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** One line that puts the value in context, such as "47 min more than yesterday". */
  readonly context?: ReactNode;
  readonly size?: CardSize;
}

/**
 * A unit of information with a fixed structure: label, value in the serif,
 * context line (DESIGN.md rule 1). The label names the card for screen readers.
 */
export function Card({ label, value, context, size = 'secondary' }: CardProps): React.JSX.Element {
  const labelId = useId();
  return (
    <section className="card" aria-labelledby={labelId}>
      <p id={labelId} className="card__label">
        {label}
      </p>
      <p className={`card__value card__value--${size}`}>{value}</p>
      {context === undefined ? null : <p className="card__context">{context}</p>}
    </section>
  );
}
