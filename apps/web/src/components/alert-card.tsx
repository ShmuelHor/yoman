import { type ReactNode, useId } from 'react';

import './alert-card.css';

export interface AlertCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** An anomaly or warning that needs the user's attention, in the accent colors. */
export function AlertCard({ title, children }: AlertCardProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className="alert-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="alert-card__title">
        {title}
      </h2>
      <div className="alert-card__body">{children}</div>
    </section>
  );
}
