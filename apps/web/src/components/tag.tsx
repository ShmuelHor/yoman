import type { ReactNode } from 'react';

import './tag.css';

/** `anomaly` marks something unusual, in the accent colors (DESIGN.md rule 2). */
export type TagVariant = 'default' | 'anomaly';

export interface TagProps {
  readonly children: ReactNode;
  readonly variant?: TagVariant;
}

/** A small inline label, such as a category or an "unusual" marker. */
export function Tag({ children, variant = 'default' }: TagProps): React.JSX.Element {
  return <span className={`tag tag--${variant}`}>{children}</span>;
}
