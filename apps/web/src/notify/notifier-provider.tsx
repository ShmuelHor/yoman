import { SnackbarProvider, useSnackbar } from 'notistack';
import { type ReactNode, useEffect } from 'react';

import type { Notifier } from './notifier.js';

const MAX_TOASTS = 3;
const AUTO_HIDE_MS = 5000;

/** Hands notistack's `enqueueSnackbar` to the notifier, which lives outside React. */
function NotifierBridge({ notifier }: { readonly notifier: Notifier }): null {
  const { enqueueSnackbar } = useSnackbar();
  useEffect(
    () =>
      notifier.connect((message, variant, key) => {
        enqueueSnackbar(message, { variant, key, preventDuplicate: true });
      }),
    [notifier, enqueueSnackbar],
  );
  return null;
}

interface NotifierProviderProps {
  readonly notifier: Notifier;
  readonly children: ReactNode;
}

/** The toast host. Place it inside the theme and i18n providers. */
export function NotifierProvider({ notifier, children }: NotifierProviderProps): React.JSX.Element {
  return (
    <SnackbarProvider
      maxSnack={MAX_TOASTS}
      autoHideDuration={AUTO_HIDE_MS}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <NotifierBridge notifier={notifier} />
      {children}
    </SnackbarProvider>
  );
}
