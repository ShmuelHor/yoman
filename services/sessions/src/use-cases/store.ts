import type { TimeRangeQuery } from '@yoman/shared/common';
import type { App, AppUpdate, Rule, RuleInput, Session } from '@yoman/shared/sessions';

import type { CategorizedSubject, CategoryChange } from '../domain/categorize.js';
import type { Span } from '../domain/merge-samples.js';

/** A span with the category it is stored under. */
export interface CategorizedSpan extends Span {
  readonly category: string | null;
}

/** A span after it was written, so it has an id. */
export interface StoredSpan extends CategorizedSpan {
  readonly id: string;
}

/**
 * Everything the use cases need from storage, inside one transaction. The
 * Postgres adapter implements it; tests use an in-memory one.
 */
export interface SessionsTransaction {
  /**
   * The open session, if any. Also blocks other writers until the
   * transaction ends, so two batches can never continue the same session.
   */
  readonly lockOpenSession: () => Promise<Span | null>;
  /** The newest sample any batch applied, or `null` before the first one. */
  readonly recordedUntil: () => Promise<number | null>;
  readonly setRecordedUntil: (tsMs: number) => Promise<void>;
  /** Inserts spans without an id and updates the others, in order. */
  readonly saveSpans: (spans: readonly CategorizedSpan[]) => Promise<StoredSpan[]>;
  /**
   * Closed sessions overlapping `[fromMs, toMs]`, oldest first, with the
   * category they are stored under. Lets a retried batch hand back what the
   * first attempt closed.
   */
  readonly closedSpansOverlapping: (
    fromMs: number,
    toMs: number,
    limit: number,
  ) => Promise<StoredSpan[]>;
  readonly listSessions: (range: TimeRangeQuery, limit: number) => Promise<Session[]>;
  readonly sessionsEndingSince: (cutoff: Date) => Promise<CategorizedSubject[]>;
  readonly setCategories: (changes: readonly CategoryChange[]) => Promise<void>;

  /** Registers apps seen for the first time, named after their `wm_class`. */
  readonly ensureApps: (ids: readonly string[]) => Promise<void>;
  /** The categories users set on apps, by app id. */
  readonly appCategories: () => Promise<Map<string, string | null>>;
  readonly listApps: (limit: number) => Promise<App[]>;
  /** `null` when there is no such app. */
  readonly updateApp: (id: string, update: AppUpdate) => Promise<App | null>;

  readonly listRules: (limit: number) => Promise<Rule[]>;
  readonly countRules: () => Promise<number>;
  readonly createRule: (input: RuleInput) => Promise<Rule>;
  /** `null` when there is no such rule. */
  readonly updateRule: (id: string, input: RuleInput) => Promise<Rule | null>;
  /** `false` when there is no such rule. */
  readonly deleteRule: (id: string) => Promise<boolean>;
}

export interface SessionsStore {
  /** Runs `work` in one transaction: committed when it resolves, rolled back when it throws. */
  readonly transaction: <T>(work: (tx: SessionsTransaction) => Promise<T>) => Promise<T>;
}
