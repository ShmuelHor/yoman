import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { ErrorFallback } from './error-fallback.js';

/** The last line of defence: a crash outside any page. Retrying reloads the app. */
export function RootErrorBoundary({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <ErrorBoundary
      fallbackRender={(): React.JSX.Element => (
        <ErrorFallback onRetry={(): void => window.location.reload()} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

interface PageErrorBoundaryProps {
  readonly children: ReactNode;
  /** Changing it (the path) clears the error, so navigating away recovers the shell. */
  readonly resetKey: string;
}

/** A page crash shows the fallback inside the shell; the navigation keeps working. */
export function PageErrorBoundary({
  children,
  resetKey,
}: PageErrorBoundaryProps): React.JSX.Element {
  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      fallbackRender={({ resetErrorBoundary }): React.JSX.Element => (
        <ErrorFallback onRetry={resetErrorBoundary} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
