import type { IngestResult } from '@yoman/shared/ingest';
import { describe, expect, it, vi } from 'vitest';
import { muteOnReply } from '../../src/sender/mute-handler.js';

const BASE: IngestResult = { accepted: 1, deliver: [], queued: 0, degraded: [] };

describe('muteOnReply', () => {
  it('does nothing for a reply without mute commands', async () => {
    const run = vi.fn();

    await muteOnReply('muter', run).handle(BASE);

    expect(run).not.toHaveBeenCalled();
  });

  it('passes valid mute commands to the muter', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const reply = { ...BASE, mute: { mute: ['org.gnome.Calendar'], restore: [] } };

    await muteOnReply('muter', run).handle(reply);

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ mute: ['org.gnome.Calendar'] }));
  });

  it('ignores a mute field that fails its schema', async () => {
    const run = vi.fn();

    const reply = { ...BASE, mute: 'everything' };

    await muteOnReply('muter', run).handle(reply);

    expect(run).not.toHaveBeenCalled();
  });
});
