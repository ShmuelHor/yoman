// @vitest-environment happy-dom

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { responseFixtures } from '@yoman/shared/fixtures/responses';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayClient } from '../../../src/api/gateway.js';
import { createQueryClient } from '../../../src/app/query-client.js';
import { bundledResources } from '../../../src/i18n/bundled.js';
import { createI18n } from '../../../src/i18n/i18n.js';
import { GoalsPage } from '../../../src/pages/goals/goals-page.js';
import { WEEK } from '../../../src/pages/goals/weekdays.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

/** The app's query client retries a failed read once, after a backoff. */
const RETRY_TIMEOUT_MS = 5000;
/** Dialogs with a data grid behind them are slow to drive in happy-dom, more so when the whole suite runs. */
const DIALOG_TIMEOUT_MS = 30_000;
const GOAL_ID = responseFixtures.listGoals.items[0]?.id ?? '';
const TODAY = new Date('2026-11-08T12:00:00');

function clientAnswering(overrides: Record<string, unknown> = {}): {
  client: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const answers: Record<string, unknown> = {
    listGoals: structuredClone(responseFixtures.listGoals),
    goalProgress: structuredClone(responseFixtures.goalProgress),
    listApps: structuredClone(responseFixtures.listApps),
    createGoal: structuredClone(responseFixtures.createGoal),
    updateGoal: structuredClone(responseFixtures.updateGoal),
    deleteGoal: undefined,
    ...overrides,
  };
  const request = vi.fn((name: string) => {
    const answer = answers[name];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  return { client: { request } as unknown as GatewayClient, request };
}

function renderPage(client: GatewayClient): ReturnType<typeof fakeNotifier> {
  const notifier = fakeNotifier();
  const i18n = createI18n(bundledResources, document.createElement('html'));
  void i18n.changeLanguage('en');
  renderWithTheme(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient(notifier)}>
        <GoalsPage client={client} today={TODAY} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return notifier;
}

afterEach(cleanup);

describe('Goals page', { timeout: DIALOG_TIMEOUT_MS }, () => {
  it('shows skeletons while the requests are pending', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('lists the goals with how today is going', async () => {
    const { client, request } = clientAnswering();
    renderPage(client);

    const goals = await screen.findByRole('grid', { name: 'Your goals' });
    expect(within(goals).getByText('social')).toBeTruthy();
    expect(within(goals).getByText('45 of 30 min')).toBeTruthy();
    expect(within(goals).getByText('Breached')).toBeTruthy();
    expect(request).toHaveBeenCalledWith(
      'goalProgress',
      { query: { date: '2026-11-08' } },
      expect.anything(),
    );
  });

  it('says so when a goal is not scheduled today', async () => {
    const { client } = clientAnswering({ goalProgress: { date: '2026-11-08', items: [] } });
    renderPage(client);

    expect(await screen.findByText('Not scheduled today')).toBeTruthy();
  });

  it('shows an error when the goals cannot be loaded', async () => {
    const { client } = clientAnswering({ listGoals: new Error('down') });
    renderPage(client);

    expect(
      await screen.findByText('Goals could not be loaded.', undefined, {
        timeout: RETRY_TIMEOUT_MS,
      }),
    ).toBeTruthy();
  });

  it('shows the name of an app target as plain text', async () => {
    const name = '<img src=x onerror="alert(1)">';
    const { client } = clientAnswering({
      listGoals: {
        items: [
          {
            ...responseFixtures.listGoals.items[0],
            target: { kind: 'app', appId: 'evil' },
          },
        ],
      },
      listApps: { items: [{ id: 'evil', name, icon: null, category: null }] },
    });
    renderPage(client);

    const goals = await screen.findByRole('grid', { name: 'Your goals' });
    expect(within(goals).getByText(name)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('creates a goal for a category and announces it with a toast', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    await user.click(await screen.findByRole('button', { name: 'Add goal' }));
    await user.type(screen.getByLabelText('Category'), 'social');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('goals:toast.created'));
    expect(request).toHaveBeenCalledWith('createGoal', {
      body: {
        type: 'max',
        target: { kind: 'category', category: 'social' },
        minutes: 60,
        days: [...WEEK],
      },
    });
  });

  it('creates a goal for an app chosen from the list', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    renderPage(client);

    await user.click(await screen.findByRole('button', { name: 'Add goal' }));
    await user.selectOptions(screen.getByLabelText('For'), 'app');
    await user.selectOptions(screen.getByLabelText('App'), 'firefox');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('createGoal', {
        body: expect.objectContaining({ target: { kind: 'app', appId: 'firefox' } }),
      }),
    );
  });

  it('does not send a goal with no days', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    renderPage(client);

    await user.click(await screen.findByRole('button', { name: 'Add goal' }));
    await user.type(screen.getByLabelText('Category'), 'social');
    for (const box of within(screen.getByRole('dialog')).getAllByRole('checkbox')) {
      await user.click(box);
    }
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Choose at least one day.')).toBeTruthy();
    expect(request).not.toHaveBeenCalledWith('createGoal', expect.anything());
  });

  it('saves an edited goal and announces it with a toast', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    const goals = await screen.findByRole('grid', { name: 'Your goals' });
    await user.click(within(goals).getByRole('button', { name: 'Edit' }));
    const minutes = screen.getByLabelText('Minutes per day');
    await user.clear(minutes);
    await user.type(minutes, '20');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('goals:toast.saved'));
    expect(request).toHaveBeenCalledWith('updateGoal', {
      params: { id: GOAL_ID },
      body: expect.objectContaining({ minutes: 20 }),
    });
  });

  it('deletes a goal after confirmation and announces it with a toast', async () => {
    const user = userEvent.setup();
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    const goals = await screen.findByRole('grid', { name: 'Your goals' });
    await user.click(within(goals).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete goal' }));

    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('goals:toast.deleted'));
    expect(request).toHaveBeenCalledWith('deleteGoal', { params: { id: GOAL_ID } });
  });
});
