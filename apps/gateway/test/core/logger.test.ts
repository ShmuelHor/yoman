import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, serializeError, serializeRequest } from '../../src/core/logger.js';

function capture(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      chunks.push(chunk.toString());
      done();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('createLogger', () => {
  it('redacts tokens, cookies and titles at any supported depth', () => {
    const logs = capture();
    const log = createLogger('info', logs.stream);

    const leaks = ['leak-token', 'leak-auth', 'leak-cookie', 'leak-title', 'leak-cmdline'];

    log.info(
      {
        token: 'leak-token',
        headers: { authorization: 'leak-auth', cookie: 'leak-cookie' },
        body: { samples: [{ title: 'leak-title' }] },
        process: { cmdline: 'leak-cmdline' },
      },
      'request',
    );

    const output = logs.output();
    expect(output).toContain('request');
    for (const leak of leaks) {
      expect(output).not.toContain(leak);
    }
  });
});

describe('serializeRequest', () => {
  it('logs the path without the query string or headers', () => {
    expect(
      serializeRequest({
        id: 'req-1',
        method: 'GET',
        url: '/v1/week?start=2026-11-02&title=secret',
      }),
    ).toEqual({ id: 'req-1', method: 'GET', path: '/v1/week' });
  });

  it('copes with a request without a URL', () => {
    expect(serializeRequest({})).toEqual({ id: undefined, method: undefined, path: '' });
  });
});

describe('serializeError', () => {
  it('keeps the type, message, code and stack of an error', () => {
    const error = Object.assign(new TypeError('fetch failed'), { code: 'ECONNREFUSED' });

    expect(serializeError(error)).toMatchObject({
      type: 'TypeError',
      message: 'fetch failed',
      code: 'ECONNREFUSED',
    });
  });

  it('records only the type of a thrown non-error', () => {
    expect(serializeError('secret')).toEqual({ type: 'string' });
  });
});
