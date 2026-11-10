import type { Alert } from '@yoman/shared/alerts';
import type { IngestResult } from '@yoman/shared/ingest';
import { describe, expect, it, vi } from 'vitest';
import { type Notify, notifyEach } from '../../src/sender/reply-handlers.js';

function alert(alertKey: string): Alert {
  return {
    alertKey,
    type: 'battery-low',
    level: 'important',
    ts: '2026-11-10T08:00:00.000Z',
    params: { percent: 15 },
  };
}

function reply(deliver: Alert[]): IngestResult {
  return { accepted: 1, deliver, queued: 0, degraded: [] };
}

describe('notifyEach', () => {
  it('notifies every delivered alert in order', async () => {
    const notify = vi.fn<Notify>().mockResolvedValue(undefined);
    const first = alert('battery:low');
    const second = alert('battery:critical');

    await notifyEach('notifier', notify).handle(reply([first, second]));

    expect(notify.mock.calls).toEqual([[first], [second]]);
  });

  it('does nothing when focus queued everything', async () => {
    const notify = vi.fn<Notify>();

    await notifyEach('notifier', notify).handle(reply([]));

    expect(notify).not.toHaveBeenCalled();
  });

  it('still notifies the rest when one alert fails, then reports the failure', async () => {
    const broken = new Error('notification daemon gone');
    const notify = vi.fn<Notify>().mockRejectedValueOnce(broken).mockResolvedValue(undefined);
    const alerts = [alert('a'), alert('b'), alert('c')];

    const handled = notifyEach('notifier', notify).handle(reply(alerts));

    await expect(handled).rejects.toThrow(AggregateError);
    await expect(handled).rejects.toMatchObject({ errors: [broken] });
    expect(notify).toHaveBeenCalledTimes(alerts.length);
  });

  it('keeps the name it was given, for the logs', () => {
    expect(notifyEach('notifier', vi.fn<Notify>()).name).toBe('notifier');
  });
});
