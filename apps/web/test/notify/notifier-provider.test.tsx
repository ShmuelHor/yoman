// @vitest-environment happy-dom
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../src/api/client.js';
import { bundledResources } from '../../src/i18n/bundled.js';
import { createI18n } from '../../src/i18n/i18n.js';
import { createNotifier } from '../../src/notify/notifier.js';
import { NotifierProvider } from '../../src/notify/notifier-provider.js';
import { renderWithTheme } from '../support/render-with-theme.js';

const SERVER_ERROR = 500;

describe('NotifierProvider', () => {
  afterEach(cleanup);

  it('shows toasts in the UI language, with the request id on errors', async () => {
    const i18n = createI18n(bundledResources, document.createElement('html'));
    const notifier = createNotifier(i18n);
    renderWithTheme(<NotifierProvider notifier={notifier}>{null}</NotifierProvider>);

    act(() => notifier.error(new ApiError('week', SERVER_ERROR, 'boom', 'req-42')));
    act(() => notifier.success('common:notify.degraded'));
    await act(async () => i18n.changeLanguage('en'));
    act(() => notifier.error(new ApiError('week', SERVER_ERROR, 'boom', 'req-43')));

    expect(await screen.findByText('משהו השתבש. מזהה בקשה: req-42')).toBeTruthy();
    expect(await screen.findByText('Something went wrong. Request ID: req-43')).toBeTruthy();
  });
});
