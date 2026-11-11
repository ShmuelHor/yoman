import type { IngestResult } from '@yoman/shared/ingest';
import { describe, expect, it, vi } from 'vitest';
import { muteOnReply } from '../../src/sender/mute-handler.js';

const BASE: IngestResult = { accepted: 1, deliver: [], queued: 0, degraded: [] };

describe('muteOnReply', () => {
  it('does nothing for a reply without a mute directive', async () => {
    const run = vi.fn();

    await muteOnReply('muter', run).handle(BASE);

    expect(run).not.toHaveBeenCalled();
  });

  it('passes the mute directive to the muter as it is', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const mute = {
      mute: ['org.gnome.Calendar'],
      restore: ['slack'],
      endsAt: '2026-11-08T11:00:00.000Z',
      systemApps: ['org.gnome.Settings'],
    };

    await muteOnReply('muter', run).handle({ ...BASE, mute });

    expect(run).toHaveBeenCalledWith(mute);
  });

  it('passes an empty directive through, so the muter can restore everything', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const mute = { mute: [], restore: [], systemApps: [] };

    await muteOnReply('muter', run).handle({ ...BASE, mute });

    expect(run).toHaveBeenCalledWith(mute);
  });
});
