import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import './nav-tab.css';

export interface NavTabProps {
  readonly to: string;
  readonly children: ReactNode;
  /** Active only on an exact match, so the index tab is not active on every page. */
  readonly end?: boolean;
}

/** A navigation tab. React Router marks the current one with `aria-current="page"`. */
export function NavTab({ to, children, end = true }: NavTabProps): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }): string => `nav-tab${isActive ? ' nav-tab--active' : ''}`}
    >
      {children}
    </NavLink>
  );
}
