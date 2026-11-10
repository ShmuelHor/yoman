import { describe, expect, it } from 'vitest';
import { openUri } from '../../../../src/actuators/notifier/adapters/open-uri.js';
import { FakeNotificationServer } from '../fake-notification-server.js';

describe('openUri', () => {
  it('asks the desktop portal to open the URI, with no parent window', async () => {
    // Arrange
    const bus = new FakeNotificationServer();

    // Act
    await openUri(bus, 'http://127.0.0.1:4710/');

    // Assert
    expect(bus.calls).toEqual([
      {
        destination: 'org.freedesktop.portal.Desktop',
        path: '/org/freedesktop/portal/desktop',
        interface: 'org.freedesktop.portal.OpenURI',
        member: 'OpenURI',
        signature: 'ssa{sv}',
        body: ['', 'http://127.0.0.1:4710/', {}],
      },
    ]);
  });
});
