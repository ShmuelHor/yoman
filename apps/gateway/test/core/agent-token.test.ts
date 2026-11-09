import { describe, expect, it } from 'vitest';

import { createTokenVerifier, parseBearer } from '../../src/core/agent-token.js';
import { AGENT_TOKEN } from '../harness.js';

describe('parseBearer', () => {
  it('returns the token of a Bearer credential', () => {
    expect(parseBearer(`Bearer ${AGENT_TOKEN}`)).toBe(AGENT_TOKEN);
  });

  it('accepts the scheme in any case', () => {
    expect(parseBearer(`bearer ${AGENT_TOKEN}`)).toBe(AGENT_TOKEN);
  });

  it.each([
    undefined,
    '',
    'Bearer',
    'Bearer ',
    `Basic ${AGENT_TOKEN}`,
    `Bearer  ${AGENT_TOKEN}`,
    `Bearer ${AGENT_TOKEN} extra`,
  ])('rejects %j', (header) => {
    expect(parseBearer(header)).toBeUndefined();
  });
});

describe('createTokenVerifier', () => {
  const verify = createTokenVerifier(AGENT_TOKEN);

  it('accepts the configured token', () => {
    expect(verify(AGENT_TOKEN)).toBe(true);
  });

  it.each([
    [
      'a different token of the same length',
      `${AGENT_TOKEN.slice(0, -1)}${AGENT_TOKEN.endsWith('A') ? 'B' : 'A'}`,
    ],
    ['a prefix', AGENT_TOKEN.slice(0, -1)],
    ['a longer value', `${AGENT_TOKEN}A`],
    ['an empty value', ''],
  ])('rejects %s', (_name, candidate) => {
    expect(verify(candidate)).toBe(false);
  });
});
