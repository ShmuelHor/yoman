import type { ReactNode } from 'react';

import './focus-banner.css';

export interface FocusBannerProps {
  /** The localized status line, such as "Focus mode · 47 min left". */
  readonly children: ReactNode;
}

/** The bar across the top of every page while focus mode is on (DESIGN.md rule 3). */
export function FocusBanner({ children }: FocusBannerProps): React.JSX.Element {
  return (
    <div role="status" className="focus-banner">
      {children}
    </div>
  );
}
