import type { WindowSample } from '@yoman/shared/ingest';
import type { Rule } from '@yoman/shared/sessions';
import { describe, expect, it } from 'vitest';

import { recordSamples } from '../../src/use-cases/record-samples.js';
import { createMemoryStore } from '../memory-store.js';

const PID = 4242;
const PRIORITY = 10;

function window(clock: string, wmClass: string, title?: string): WindowSample {
  return {
    kind: 'window',
    ts: `2026-11-08T${clock}.000Z`,
    wmClass,
    pid: PID,
    idleMs: 0,
    locked: false,
    ...(title === undefined ? {} : { title }),
  };
}

const codeRule: Rule = {
  id: '00000000-0000-4000-8000-000000000001',
  field: 'wmClass',
  match: 'exact',
  pattern: 'code',
  category: 'work',
  priority: PRIORITY,
};

describe('recordSamples', () => {
  it('returns the sessions a batch closed, categorized by the rules', async () => {
    const store = createMemoryStore({ rules: [codeRule] });

    const batch = [
      window('09:00:00', 'code', 'merge.ts'),
      window('09:00:05', 'code'),
      window('09:00:10', 'firefox'),
    ];

    const result = await recordSamples(store, batch);

    expect(result.accepted).toBe(batch.length);
    expect(result.closed).toEqual([
      {
        session: {
          id: expect.any(String),
          appId: 'code',
          start: '2026-11-08T09:00:00.000Z',
          end: '2026-11-08T09:00:10.000Z',
          title: 'merge.ts',
        },
        category: 'work',
      },
    ]);
  });

  it('continues the open session across batches and registers new apps', async () => {
    const store = createMemoryStore();

    await recordSamples(store, [window('09:00:00', 'code'), window('09:00:05', 'code')]);
    const second = await recordSamples(store, [window('09:00:10', 'code')]);

    expect(second.closed).toEqual([]);
    const [session] = store.state().sessions;
    expect(store.state().sessions).toHaveLength(1);
    expect(session).toMatchObject({
      startMs: Date.parse('2026-11-08T09:00:00.000Z'),
      closed: false,
    });
    expect(store.state().apps).toEqual([{ id: 'code', name: 'code', icon: null, category: null }]);
  });

  it('closes the stored session when the next batch comes after a gap', async () => {
    const store = createMemoryStore();
    await recordSamples(store, [window('09:00:00', 'code')]);

    const result = await recordSamples(store, [window('09:10:00', 'code')]);

    expect(result.closed.map((closed) => closed.session.end)).toEqual(['2026-11-08T09:00:00.000Z']);
    expect(store.state().sessions.filter((session) => !session.closed)).toHaveLength(1);
  });

  it('prefers the category the user set on the app', async () => {
    const store = createMemoryStore({
      rules: [codeRule],
      apps: [{ id: 'code', name: 'VS Code', icon: null, category: 'personal' }],
    });

    const result = await recordSamples(store, [
      window('09:00:00', 'code'),
      window('09:00:05', 'firefox'),
    ]);

    expect(result.closed[0]?.category).toBe('personal');
  });

  it('reports samples the stored session already covers as late', async () => {
    const store = createMemoryStore();
    await recordSamples(store, [window('09:00:00', 'code'), window('09:00:10', 'code')]);

    const result = await recordSamples(store, [window('09:00:05', 'firefox')]);

    expect(result).toEqual({ accepted: 0, late: 1, closed: [] });
  });
});
