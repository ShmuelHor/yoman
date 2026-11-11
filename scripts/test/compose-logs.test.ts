import { describe, expect, it } from 'vitest';

import {
  createPrettify,
  formatComposeLine,
  LOG_SERVICES,
  parseServices,
  UnknownServiceError,
} from '../lib/compose-logs.js';

const identity = (json: string): string => `pretty(${json})`;

describe('formatComposeLine', () => {
  it('strips the compose prefix, prettifies JSON and keeps the service as a column', () => {
    const line = 'gateway-1  | {"level":30,"msg":"hi"}';
    expect(formatComposeLine(line, identity)).toBe('gateway  | pretty({"level":30,"msg":"hi"})');
  });

  it('aligns the column across services', () => {
    const a = formatComposeLine('web-1  | GET /', identity);
    const b = formatComposeLine('sessions-1  | GET /', identity);
    expect(a.indexOf('|')).toBe(b.indexOf('|'));
  });

  it.each([
    'web-1  | 2026-11-11T09:41:00+00:00 reqId=req-7f3a 200 "GET /" 896',
    'postgres-1  | LOG:  database system is ready to accept connections',
  ])('passes a non-JSON line through unchanged: %s', (line) => {
    expect(formatComposeLine(line, identity)).toContain(line.split('| ')[1] ?? '');
  });

  it('leaves a line without the compose prefix alone', () => {
    expect(formatComposeLine('no prefix here', identity)).toBe('no prefix here');
  });

  it('renders a pino line with its message and request id with the real prettifier', () => {
    const json = JSON.stringify({
      level: 30,
      time: 0,
      msg: 'POST /samples 200 8ms',
      reqId: 'req-7f3a',
    });
    const out = formatComposeLine(`sessions-1  | ${json}`, createPrettify(false));
    expect(out).toContain('POST /samples 200 8ms');
    expect(out).toContain('req-7f3a');
    expect(out.startsWith('sessions')).toBe(true);
  });
});

describe('parseServices', () => {
  it('accepts every known service and none at all', () => {
    expect(parseServices([...LOG_SERVICES])).toEqual([...LOG_SERVICES]);
    expect(parseServices([])).toEqual([]);
  });

  it('rejects anything else, so no option reaches docker compose', () => {
    expect(() => parseServices(['--help'])).toThrow(UnknownServiceError);
    expect(() => parseServices(['gateway', 'nope'])).toThrow(UnknownServiceError);
  });
});
