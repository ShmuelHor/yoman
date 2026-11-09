import { ConflictError, NotFoundError } from '@yoman/service-kit/errors';
import type { RuleInput } from '@yoman/shared/sessions';
import { describe, expect, it } from 'vitest';
import { updateApp } from '../../src/use-cases/manage-apps.js';
import { createRule, deleteRule, MAX_RULES, updateRule } from '../../src/use-cases/manage-rules.js';
import type { StoredSpan } from '../../src/use-cases/store.js';
import { createMemoryStore } from '../memory-store.js';

const NOW = new Date('2026-11-08T10:00:00.000Z');
const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';
const PRIORITY = 10;

const codeIsWork: RuleInput = {
  field: 'wmClass',
  match: 'exact',
  pattern: 'code',
  category: 'work',
  priority: PRIORITY,
};

function session(id: string, end: string): StoredSpan {
  return {
    id,
    appId: 'code',
    startMs: Date.parse(end),
    endMs: Date.parse(end),
    title: null,
    category: null,
    closed: true,
  };
}

const recent = session('recent', '2026-11-01T09:00:00.000Z');
const old = session('old', '2026-09-01T09:00:00.000Z');

function categories(store: ReturnType<typeof createMemoryStore>): Record<string, string | null> {
  return Object.fromEntries(store.state().sessions.map((s) => [s.id, s.category]));
}

describe('rule changes', () => {
  it('re-applies a new rule to the last 30 days only', async () => {
    const store = createMemoryStore({ sessions: [recent, old] });

    await createRule(store, codeIsWork, NOW);

    expect(categories(store)).toEqual({ recent: 'work', old: null });
  });

  it('re-applies an edited rule and a deleted one', async () => {
    const store = createMemoryStore({ sessions: [recent] });
    const rule = await createRule(store, codeIsWork, NOW);

    await updateRule(store, rule.id, { ...codeIsWork, category: 'coding' }, NOW);
    expect(categories(store)).toEqual({ recent: 'coding' });

    await deleteRule(store, rule.id, NOW);
    expect(categories(store)).toEqual({ recent: null });
  });

  it('refuses a rule beyond the list limit and stores nothing', async () => {
    const rules = Array.from({ length: MAX_RULES }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(MISSING_ID.length - 24, '0')}`,
      ...codeIsWork,
    }));
    const store = createMemoryStore({ rules });

    await expect(createRule(store, codeIsWork, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(store.state().rules).toHaveLength(MAX_RULES);
  });

  it('reports a missing rule as not found', async () => {
    const store = createMemoryStore();

    await expect(updateRule(store, MISSING_ID, codeIsWork, NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteRule(store, MISSING_ID, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('app changes', () => {
  it('re-applies a category the user set on an app', async () => {
    const store = createMemoryStore({
      apps: [{ id: 'code', name: 'code', icon: null, category: null }],
      sessions: [recent],
    });

    const app = await updateApp(store, 'code', { name: 'VS Code', category: 'personal' }, NOW);

    expect(app).toEqual({ id: 'code', name: 'VS Code', icon: null, category: 'personal' });
    expect(categories(store)).toEqual({ recent: 'personal' });
  });

  it('reports a missing app as not found', async () => {
    const store = createMemoryStore();

    await expect(
      updateApp(store, 'vlc', { name: 'VLC', category: null }, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
