import type { Alert } from '@yoman/shared/alerts';
import { describe, expect, it } from 'vitest';
import { createNotifier, DASHBOARD_URL } from '../../../src/actuators/notifier/actuator.js';
import type { NotifyRequest } from '../../../src/actuators/notifier/domain/notify-request.js';
import type { Actuator, PluginContext } from '../../../src/core/plugin.js';
import { runActuator } from '../../../src/core/registry.js';
import { SessionBusError } from '../../../src/core/session-bus.js';
import { translate } from '../../../src/i18n/catalogs.js';
import { recordingLogger } from '../../support/logs.js';
import { FakeNotificationServer } from './fake-notification-server.js';

const FIRST_ID = 1;
const OTHER_APPS_ID = 999;
const DISMISSED_BY_USER = 2;
const ALERT: Alert = {
  alertKey: 'battery:low',
  type: 'battery-low',
  level: 'important',
  ts: '2026-11-10T08:00:00.000Z',
  params: { percent: 14 },
};

function context(bus: FakeNotificationServer): PluginContext & { logs: unknown[] } {
  const { logger, logs } = recordingLogger();
  return { logger, logs, sessionBus: bus };
}

async function started(
  bus: FakeNotificationServer,
): Promise<{ notifier: Actuator<NotifyRequest>; ctx: PluginContext & { logs: unknown[] } }> {
  const notifier = createNotifier();
  const ctx = context(bus);
  await notifier.start?.(ctx);
  return { notifier, ctx };
}

/** Lets the fire-and-forget portal call settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function opened(bus: FakeNotificationServer): readonly unknown[][] {
  return bus.calls
    .filter((call) => call.member === 'OpenURI')
    .map((call) => [...(call.body ?? [])]);
}

describe('notifier', () => {
  it('shows a delivered alert in Hebrew by default', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);

    // Act
    await runActuator(new Map([['notifier', notifier]]), 'notifier', { alert: ALERT }, ctx);

    // Assert
    const notify = bus.calls.find((call) => call.member === 'Notify');
    expect(notify?.body?.[0]).toBe(translate('notifications.appName', 'he'));
  });

  it('shows the alert in the requested language', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);

    // Act
    await notifier.run({ alert: ALERT, language: 'en' }, ctx);

    // Assert
    const notify = bus.calls.find((call) => call.member === 'Notify');
    expect(notify?.body).toEqual(
      expect.arrayContaining(['Battery low', '14% left. Plug in the charger soon.']),
    );
  });

  it('rejects an input that is not a valid alert before touching the bus', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    const registry = new Map([['notifier', notifier]]);

    // Act
    const run = runActuator(registry, 'notifier', { alert: { ...ALERT, level: 'loud' } }, ctx);

    // Assert
    await expect(run).rejects.toThrow('invalid input for notifier at: alert.level');
    expect(bus.calledMembers()).not.toContain('Notify');
  });

  it('opens the dashboard when the user clicks the action button', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [FIRST_ID, 'open-dashboard']);
    await settle();

    // Assert
    expect(opened(bus)).toEqual([['', DASHBOARD_URL, {}]]);
  });

  it('opens the dashboard when the user clicks the notification itself', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [FIRST_ID, 'default']);
    await settle();

    // Assert
    expect(opened(bus)).toHaveLength(1);
  });

  it('opens the dashboard once, even if the action fires twice', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [FIRST_ID, 'default']);
    bus.emit('ActionInvoked', [FIRST_ID, 'open-dashboard']);
    await settle();

    // Assert
    expect(opened(bus)).toHaveLength(1);
  });

  it("ignores actions on other apps' notifications", async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [OTHER_APPS_ID, 'default']);
    await settle();

    // Assert
    expect(opened(bus)).toEqual([]);
  });

  it('ignores actions it never offered and malformed signals', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [FIRST_ID, 'reply']);
    bus.emit('ActionInvoked', ['1', 'default']);
    await settle();

    // Assert
    expect(opened(bus)).toEqual([]);
  });

  it('forgets a notification once the server reports it closed', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('NotificationClosed', [FIRST_ID, DISMISSED_BY_USER]);
    bus.emit('ActionInvoked', [FIRST_ID, 'default']);
    await settle();

    // Assert
    expect(opened(bus)).toEqual([]);
  });

  it('warns when the dashboard cannot be opened', async () => {
    // Arrange
    const bus = new FakeNotificationServer({
      failCall: (call) =>
        call.member === 'OpenURI' ? new SessionBusError('CALL_FAILED', 'no portal') : undefined,
    });
    const { notifier, ctx } = await started(bus);
    await notifier.run({ alert: ALERT }, ctx);

    // Act
    bus.emit('ActionInvoked', [FIRST_ID, 'default']);
    await settle();

    // Assert
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ code: 'CALL_FAILED', msg: 'could not open the dashboard' }),
    );
  });

  it('rejects with the bus error when no notification server answers', async () => {
    // Arrange
    const bus = new FakeNotificationServer({
      failCall: () => new SessionBusError('TIMEOUT', 'no reply'),
    });
    const { notifier, ctx } = await started(bus);

    // Act
    const run = notifier.run({ alert: ALERT }, ctx);

    // Assert
    await expect(run).rejects.toMatchObject({ name: 'SessionBusError', code: 'TIMEOUT' });
  });

  it('warns, without failing, when the server replies with no id', async () => {
    // Arrange
    const bus = new FakeNotificationServer({ notifyReply: () => ['not an id'] });
    const { notifier, ctx } = await started(bus);

    // Act
    await notifier.run({ alert: ALERT }, ctx);

    // Assert
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ msg: 'notification server sent an unexpected reply' }),
    );
  });

  it('warns with param names, never values, when the alert lacks one', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier, ctx } = await started(bus);

    // Act
    await notifier.run({ alert: { ...ALERT, params: { unrelated: 'secret-value' } } }, ctx);

    // Assert
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({ alertType: 'battery-low', missingParams: ['percent'] }),
    );
    expect(JSON.stringify(ctx.logs)).not.toContain('secret-value');
  });

  it('still notifies when it cannot subscribe to clicks, and warns once', async () => {
    // Arrange
    const bus = new FakeNotificationServer({
      failSubscribe: (match) =>
        match.member === 'NotificationClosed'
          ? new SessionBusError('UNAVAILABLE', 'no bus')
          : undefined,
    });
    const { notifier, ctx } = await started(bus);

    // Act
    await notifier.run({ alert: ALERT }, ctx);
    await notifier.stop?.();

    // Assert
    expect(bus.calledMembers()).toContain('Notify');
    expect(ctx.logs).toContainEqual(
      expect.objectContaining({
        code: 'UNAVAILABLE',
        msg: 'notification clicks will not open the dashboard',
      }),
    );
    expect(bus.unsubscribed).toBe(1);
  });

  it('rethrows an unexpected error from subscribing', async () => {
    // Arrange
    const bus = new FakeNotificationServer({ failSubscribe: () => new Error('bug') });
    const notifier = createNotifier();

    // Act
    const start = notifier.start?.(context(bus));

    // Assert
    await expect(start).rejects.toThrow('bug');
  });

  it('unsubscribes from both signals on stop', async () => {
    // Arrange
    const bus = new FakeNotificationServer();
    const { notifier } = await started(bus);

    // Act
    await notifier.stop?.();
    await notifier.stop?.();

    // Assert
    expect(bus.unsubscribed).toBe(2);
  });
});
