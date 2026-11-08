import { describe, expect, it } from 'vitest';
import { CENSOR, createLogger, REDACTED_KEYS } from './logger.js';

function capture(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line: string): void => void lines.push(line) };
}

const SECRET = 'Secret-Window-Title-1234';

describe('createLogger', () => {
  it.each(REDACTED_KEYS)('redacts %s at every supported depth', (key) => {
    const sink = capture();
    const logger = createLogger({ level: 'info', destination: sink });
    const shapes = [
      { [key]: SECRET },
      { a: { [key]: SECRET } },
      { a: { b: { [key]: SECRET } } },
      { samples: [{ [key]: SECRET }] },
      { batch: { samples: [{ [key]: SECRET }] } },
      { windows: [{ meta: { [key]: SECRET } }] },
    ];
    for (const shape of shapes) {
      logger.info(shape, 'shape');
    }
    expect(sink.lines.join('')).not.toContain(SECRET);
    expect(sink.lines).toHaveLength(shapes.length);
    for (const line of sink.lines) {
      expect(line).toContain(CENSOR);
    }
  });

  it('keeps fields that are not sensitive', () => {
    const sink = capture();
    createLogger({ level: 'info', destination: sink }).info({ wmClass: 'firefox' }, 'sample');
    const entry: unknown = JSON.parse(sink.lines[0] ?? '');
    expect(entry).toMatchObject({ wmClass: 'firefox', msg: 'sample', name: 'yoman-agent' });
  });

  it('honors the configured level', () => {
    const sink = capture();
    const logger = createLogger({ level: 'warn', destination: sink });
    logger.info('dropped');
    logger.warn('kept');
    expect(sink.lines).toHaveLength(1);
  });

  it('writes to stdout by default', () => {
    expect(createLogger({ level: 'silent' }).level).toBe('silent');
  });
});
