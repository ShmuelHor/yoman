import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../apps/agent/src/core/logger.js';

const TOKEN_BYTES = 32;

describe('ST11 log redaction', () => {
  it.todo('[T09] service-kit logs never contain an injected token or window title');

  it('[T12] agent logs never contain an injected token or window title', () => {
    // Built at runtime so no token-shaped literal is ever committed.
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const title = `Bank statement ${randomBytes(TOKEN_BYTES).toString('hex')}`;
    const lines: string[] = [];
    const logger = createLogger({
      level: 'trace',
      destination: { write: (line: string): void => void lines.push(line) },
    });

    logger.info(
      { headers: { authorization: `Bearer ${token}`, cookie: `sid=${token}` } },
      'ingest',
    );
    logger.info({ token, password: token }, 'config');
    logger.debug({ sample: { kind: 'window', wmClass: 'firefox', title } }, 'sampled');
    logger.warn({ batch: { samples: [{ kind: 'window', title }] } }, 'send failed');
    logger.trace({ process: { comm: 'node', cmdline: `node --token=${token}` } }, 'process');
    logger.error({ windows: [{ meta: { title } }] }, 'window list');

    const output = lines.join('');
    expect(lines.length).toBeGreaterThan(0);
    expect(output).not.toContain(token);
    expect(output).not.toContain(title);
    expect(output).toContain('firefox');
  });
});
