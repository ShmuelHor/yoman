import { describe, expect, it, vi } from 'vitest';
import {
  type RunFile,
  readShowBanners,
  writeShowBanners,
} from '../../../../src/actuators/muter/adapters/gsettings.js';

describe('muter gsettings adapter', () => {
  it('passes the app inside a single args element, with no shell', async () => {
    const run = vi.fn<RunFile>().mockResolvedValue('');

    await writeShowBanners(run, 'slack', 'false');

    expect(run).toHaveBeenCalledWith('gsettings', [
      'set',
      'org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/slack/',
      'show-banners',
      'false',
    ]);
  });

  it.each(['a;b', '$(id)', 'a b', '`x`'])(
    'rejects the id %j before running anything',
    async (id) => {
      const run = vi.fn<RunFile>().mockResolvedValue('true');

      await expect(readShowBanners(run, id)).rejects.toThrow();
      await expect(writeShowBanners(run, id, 'false')).rejects.toThrow();

      expect(run).not.toHaveBeenCalled();
    },
  );

  it('rejects an unexpected gsettings answer', async () => {
    const run = vi.fn<RunFile>().mockResolvedValue("'surprise'\n");

    await expect(readShowBanners(run, 'slack')).rejects.toThrow();
  });
});
