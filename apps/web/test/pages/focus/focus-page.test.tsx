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
import { FocusPage } from '../../../src/pages/focus/focus-page.js';
import { fakeNotifier } from '../../support/fake-notifier.js';
import { renderWithTheme } from '../../support/render-with-theme.js';

const RETRY_TIMEOUT_MS = 5000;
const SLOW_TIMEOUT_MS = 30_000;
/** 30 minutes before the fixture session ends (11:00 UTC). */
const NOW = new Date('2026-11-08T10:30:00.000Z');
const INACTIVE = { active: false };

function clientAnswering(overrides: Record<string, unknown> = {}): {
  client: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const answers: Record<string, unknown> = {
    focusState: structuredClone(responseFixtures.focusState),
    listProfiles: structuredClone(responseFixtures.listProfiles),
    listKnownApps: structuredClone(responseFixtures.listKnownApps),
    focusQueue: structuredClone(responseFixtures.focusQueue),
    getAlertPolicy: structuredClone(responseFixtures.getAlertPolicy),
    focusStart: structuredClone(responseFixtures.focusStart),
    focusStop: structuredClone(responseFixtures.focusStop),
    createProfile: structuredClone(responseFixtures.createProfile),
    deleteProfile: undefined,
    updateAlertPolicy: structuredClone(responseFixtures.updateAlertPolicy),
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
        <FocusPage client={client} now={NOW} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return notifier;
}

afterEach(cleanup);

describe('Focus page', { timeout: SLOW_TIMEOUT_MS }, () => {
  it('shows skeletons while the requests are pending', () => {
    renderPage({ request: () => new Promise(() => undefined) } as unknown as GatewayClient);

    expect(document.querySelector('[aria-busy]')).not.toBeNull();
  });

  it('shows the time left and the profile while focus is on', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    expect(await screen.findByText('Focus mode · 30 min left')).toBeTruthy();
    expect(await screen.findByText('Profile: Deep work')).toBeTruthy();
  });

  it('stops focus from the stop button', async () => {
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop focus' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('focusStop'));
    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('focus:toast.stopped'));
  });

  it('starts a 25 minute session with the default profile', async () => {
    const { client, request } = clientAnswering({ focusState: INACTIVE });
    const notifier = renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Start focus' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('focusStart', { body: { minutes: 25 } }),
    );
    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('focus:toast.started'));
  });

  it('lists the profiles with their apps', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const profiles = await screen.findByRole('grid', { name: 'Focus profiles' });
    expect(within(profiles).getByText('Deep work')).toBeTruthy();
    expect(within(profiles).getByText(/Slack.*discord/u)).toBeTruthy();
  });

  it('shows an empty state when there are no profiles', async () => {
    const { client } = clientAnswering({ listProfiles: { items: [] } });
    renderPage(client);

    expect(await screen.findByText(/No profiles yet/u)).toBeTruthy();
  });

  it('tags apps that no profile covers as new', async () => {
    const { client } = clientAnswering({
      listKnownApps: {
        items: [
          { appId: 'slack', name: 'Slack', source: 'desktop' },
          { appId: 'fresh', name: 'Fresh app', source: 'desktop' },
        ],
      },
    });
    renderPage(client);

    const list = await screen.findByRole('list', { name: 'Apps found on this computer' });
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0] as HTMLElement).queryByText('New')).toBeNull();
    expect(within(items[1] as HTMLElement).getByText('New')).toBeTruthy();
  });

  it('shows app names as plain text', async () => {
    const name = '<img src=x onerror="alert(1)">';
    const { client } = clientAnswering({
      listKnownApps: { items: [{ appId: 'evil', name, source: 'desktop' }] },
    });
    renderPage(client);

    expect(await screen.findByText(name)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('creates a profile from the dialog', async () => {
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Add profile' }));
    await userEvent.type(await screen.findByLabelText('Name'), 'Reading');
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Slack' })[0] as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('createProfile', {
        body: { name: 'Reading', mutedApps: ['slack'], exceptions: [], muteNewApps: true },
      }),
    );
    await waitFor(() =>
      expect(notifier.success).toHaveBeenCalledWith('focus:toast.profileCreated'),
    );
  });

  it('keeps the dialog open and shows a message for a blank name', async () => {
    const { client, request } = clientAnswering();
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Add profile' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Enter a name/u)).toBeTruthy();
    expect(request).not.toHaveBeenCalledWith('createProfile', expect.anything());
  });

  it('asks before deleting a profile', async () => {
    const { client, request } = clientAnswering();
    const notifier = renderPage(client);

    const profiles = await screen.findByRole('grid', { name: 'Focus profiles' });
    await userEvent.click(within(profiles).getByRole('button', { name: 'Delete' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete profile' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('deleteProfile', {
        params: { id: responseFixtures.listProfiles.items[0]?.id },
      }),
    );
    await waitFor(() =>
      expect(notifier.success).toHaveBeenCalledWith('focus:toast.profileDeleted'),
    );
  });

  it('lists held alerts in the notification words, and says so when there are none', async () => {
    const { client } = clientAnswering();
    renderPage(client);

    const queue = await screen.findByRole('list', { name: 'Alerts held back during focus' });
    expect(within(queue).getByText('Battery low')).toBeTruthy();
  });

  it('shows an empty state for the alert center', async () => {
    const { client } = clientAnswering({ focusQueue: { items: [] } });
    renderPage(client);

    expect(await screen.findByText('No alerts were held back.')).toBeTruthy();
  });

  it('saves the chosen alert levels', async () => {
    const { client, request } = clientAnswering({ getAlertPolicy: { items: [] } });
    const notifier = renderPage(client);

    await userEvent.selectOptions(await screen.findByLabelText('Goal alert'), 'Critical');
    const save = screen.getAllByRole('button', { name: 'Save' }).at(-1) as HTMLElement;
    await userEvent.click(save);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('updateAlertPolicy', {
        body: { items: [{ type: 'goal-breach', level: 'critical' }] },
      }),
    );
    await waitFor(() => expect(notifier.success).toHaveBeenCalledWith('focus:toast.policySaved'));
  });

  it('shows an error when the profiles cannot be loaded', async () => {
    const { client } = clientAnswering({ listProfiles: new Error('down') });
    renderPage(client);

    expect(
      await screen.findByText('Profiles could not be loaded.', undefined, {
        timeout: RETRY_TIMEOUT_MS,
      }),
    ).toBeTruthy();
  });
});
