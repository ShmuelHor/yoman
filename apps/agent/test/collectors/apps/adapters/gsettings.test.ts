import { describe, expect, it } from 'vitest';
import {
  readApplicationChildren,
  runFile,
  subscribeDconfChanges,
} from '../../../../src/collectors/apps/adapters/gsettings.js';
import type { SessionBus, SignalMatch } from '../../../../src/core/session-bus.js';

describe('readApplicationChildren', () => {
  it('runs gsettings with a fixed args array', async () => {
    // Arrange
    const runs: [string, readonly string[]][] = [];
    const run = (file: string, args: readonly string[]): Promise<unknown> => {
      runs.push([file, args]);
      return Promise.resolve("['slack']");
    };

    // Act
    const stdout = await readApplicationChildren(run);

    // Assert
    expect(stdout).toBe("['slack']");
    expect(runs).toEqual([
      ['gsettings', ['get', 'org.gnome.desktop.notifications', 'application-children']],
    ]);
  });
});

describe('runFile', () => {
  it('resolves with stdout and passes arguments verbatim, without a shell', async () => {
    // Act
    const stdout = await runFile(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '$(touch pwned); echo',
    ]);

    // Assert
    expect(stdout).toBe('$(touch pwned); echo');
  });

  it('rejects when the program fails', async () => {
    // Act
    const result = runFile(process.execPath, ['-e', 'process.exit(1)']);

    // Assert
    await expect(result).rejects.toThrow();
  });
});

describe('subscribeDconfChanges', () => {
  it("subscribes to dconf-service's change signal", async () => {
    // Arrange
    const matches: SignalMatch[] = [];
    const bus: SessionBus = {
      call: () => Promise.resolve([]),
      subscribe: (match) => {
        matches.push(match);
        return Promise.resolve(() => Promise.resolve());
      },
      close: () => undefined,
    };

    // Act
    await subscribeDconfChanges(bus, () => undefined);

    // Assert
    expect(matches).toEqual([
      {
        sender: 'ca.desrt.dconf',
        path: '/ca/desrt/dconf/Writer/user',
        interface: 'ca.desrt.dconf.Writer',
        member: 'Notify',
      },
    ]);
  });
});
