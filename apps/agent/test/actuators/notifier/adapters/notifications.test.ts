import { Variant } from 'dbus-next';
import { describe, expect, it } from 'vitest';
import {
  sendNotification,
  subscribeActionInvoked,
} from '../../../../src/actuators/notifier/adapters/notifications.js';
import type { Notification } from '../../../../src/actuators/notifier/domain/notification.js';
import { FakeNotificationServer } from '../fake-notification-server.js';

const NOTIFICATION: Notification = {
  appName: 'Yoman',
  summary: 'Battery low',
  body: '14% left.',
  urgency: 2,
  openDashboardLabel: 'Open dashboard',
};

describe('sendNotification', () => {
  it('calls the freedesktop Notify method with the spec signature', async () => {
    // Arrange
    const bus = new FakeNotificationServer();

    // Act
    const reply = await sendNotification(bus, NOTIFICATION);

    // Assert
    expect(reply).toEqual([1]);
    expect(bus.calls[0]).toMatchObject({
      destination: 'org.freedesktop.Notifications',
      path: '/org/freedesktop/Notifications',
      interface: 'org.freedesktop.Notifications',
      member: 'Notify',
      signature: 'susssasa{sv}i',
    });
  });

  it('sends the text, both dashboard actions and the urgency hint as a byte', async () => {
    // Arrange
    const bus = new FakeNotificationServer();

    // Act
    await sendNotification(bus, NOTIFICATION);

    // Assert
    expect(bus.calls[0]?.body).toEqual([
      'Yoman',
      0,
      '',
      'Battery low',
      '14% left.',
      ['default', 'Open dashboard', 'open-dashboard', 'Open dashboard'],
      { urgency: new Variant('y', 2) },
      -1,
    ]);
  });
});

describe('subscribeActionInvoked', () => {
  it('listens only to the notification server', async () => {
    // Arrange
    const bus = new FakeNotificationServer();

    // Act
    await subscribeActionInvoked(bus, () => undefined);

    // Assert
    expect(bus.subscriptions).toEqual([
      {
        sender: 'org.freedesktop.Notifications',
        path: '/org/freedesktop/Notifications',
        interface: 'org.freedesktop.Notifications',
        member: 'ActionInvoked',
      },
    ]);
  });
});
