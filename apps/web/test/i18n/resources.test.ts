import { describe, expect, it } from 'vitest';

import { buildResources } from '../../src/i18n/resources.js';

const json = (value: object): { default: object } => ({ default: value });

describe('buildResources', () => {
  it('groups files by language and namespace', () => {
    const resources = buildResources({
      './he/common.json': json({ hello: 'shalom' }),
      './en/common.json': json({ hello: 'hello' }),
      './he/week.json': json({ title: { short: 'w' } }),
      './en/week.json': json({ title: { short: 'w' } }),
    });

    expect(resources).toEqual({
      he: { common: { hello: 'shalom' }, week: { title: { short: 'w' } } },
      en: { common: { hello: 'hello' }, week: { title: { short: 'w' } } },
    });
  });

  it('fails when a namespace exists in one language only', () => {
    const modules = {
      './he/common.json': json({}),
      './en/common.json': json({}),
      './he/x.json': json({}),
    };

    expect(() => buildResources(modules)).toThrow('i18n namespaces missing for en: x');
  });

  it('fails on an unknown language', () => {
    expect(() => buildResources({ './fr/common.json': json({}) })).toThrow('unknown language');
  });

  it.each(['./common.json', './he/Common.json', './he/common.yaml'])(
    'fails on the badly named file %s',
    (file) => {
      expect(() => buildResources({ [file]: json({}) })).toThrow('<language>/<namespace>.json');
    },
  );

  it('fails when a value is not a string or a nested object', () => {
    expect(() => buildResources({ './he/common.json': json({ count: 3 }) })).toThrow();
  });
});
