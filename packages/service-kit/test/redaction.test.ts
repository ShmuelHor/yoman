import { Writable } from 'node:stream';
import pg from 'pg';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildLoggerOptions, CENSOR, serializeError, serializeRequest } from '../src/redaction.js';

function capture(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

describe('logger redaction', () => {
  it.each(['authorization', 'cookie', 'title', 'cmdline', 'token', 'password'])(
    'censors %s at any depth up to three levels',
    (key) => {
      const { lines, stream } = capture();
      const log = pino(buildLoggerOptions('test', 'info'), stream);
      log.info({ [key]: 'v0', a: { [key]: 'v1', b: { [key]: 'v2', c: { [key]: 'v3' } } } }, 'm');
      log.info({ samples: [{ [key]: 'v4' }] }, 'm');
      const output = lines.join('');
      for (const value of ['v0', 'v1', 'v2', 'v3', 'v4']) {
        expect(output).not.toContain(`"${value}"`);
      }
      expect(output).toContain(CENSOR);
    },
  );
});

describe('serializeRequest', () => {
  it('drops the query string and headers', () => {
    expect(
      serializeRequest({
        id: 'req-1',
        method: 'GET',
        url: '/rules?title=secret',
        headers: { authorization: 'x' },
      } as never),
    ).toEqual({ id: 'req-1', method: 'GET', path: '/rules' });
  });

  it('copes with a missing url', () => {
    expect(serializeRequest({})).toEqual({ id: undefined, method: undefined, path: '' });
  });
});

describe('serializeError', () => {
  it('keeps only the SQLSTATE of a database error', () => {
    const error = new pg.DatabaseError('duplicate key value', 0, 'error');
    error.code = '23505';
    error.detail = 'Key (title)=(Secret window) already exists.';
    expect(serializeError(error)).toEqual({ type: 'DatabaseError', code: '23505' });
  });

  it('keeps message and stack of other errors', () => {
    const serialized: { stack?: unknown } = serializeError(new TypeError('boom'));
    expect(serialized).toMatchObject({ type: 'TypeError', message: 'boom' });
    expect(String(serialized.stack)).toContain('boom');
  });

  it('describes non-error values by type only', () => {
    expect(serializeError('a string with a token')).toEqual({ type: 'string' });
  });
});

describe('buildLoggerOptions in development', () => {
  it('pretty-prints through pino-pretty and keeps the redaction', () => {
    const options = buildLoggerOptions('test', 'info', true);

    expect(options.transport).toEqual(expect.objectContaining({ target: 'pino-pretty' }));
    expect(options.redact).toEqual(
      expect.objectContaining({ paths: expect.arrayContaining(['token']) }),
    );
  });
});
