import type { Rule, RuleMatch } from '@yoman/shared/sessions';

/** What a rule is matched against: the app's `wm_class` and the session's title. */
export interface CategorySubject {
  readonly wmClass: string;
  readonly title: string | null;
}

/** Among rules of equal priority, the tighter match wins. */
const MATCH_SPECIFICITY: Readonly<Record<RuleMatch, number>> = {
  exact: 2,
  prefix: 1,
  contains: 0,
};

/** `wm_class` casing differs between packagings (`Code`, `code`), so matching ignores case. */
function fold(value: string): string {
  return value.toLowerCase();
}

export function matchesRule(rule: Rule, subject: CategorySubject): boolean {
  const value = rule.field === 'wmClass' ? subject.wmClass : subject.title;
  if (value === null) {
    return false;
  }
  const text = fold(value);
  const pattern = fold(rule.pattern);
  switch (rule.match) {
    case 'exact':
      return text === pattern;
    case 'prefix':
      return text.startsWith(pattern);
    case 'contains':
      return text.includes(pattern);
  }
}

/** Higher priority first, then the tighter match, then by id so the order is stable. */
function compareRules(a: Rule, b: Rule): number {
  return (
    b.priority - a.priority ||
    MATCH_SPECIFICITY[b.match] - MATCH_SPECIFICITY[a.match] ||
    compareIds(a.id, b.id)
  );
}

/** Code-unit order, so the result never depends on the locale. */
function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** The rule that decides the subject's category, if any matches. */
export function pickRule(rules: readonly Rule[], subject: CategorySubject): Rule | undefined {
  return rules.filter((rule) => matchesRule(rule, subject)).sort(compareRules)[0];
}

/**
 * A category the user set on the app is the most specific choice and always
 * wins; otherwise the best matching rule decides; otherwise there is none.
 */
export function resolveCategory(
  subject: CategorySubject,
  rules: readonly Rule[],
  appCategory: string | null,
): string | null {
  return appCategory ?? pickRule(rules, subject)?.category ?? null;
}

/** Rules and app categories are re-applied to sessions that ended in this window. */
export const REAPPLY_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export function reapplyCutoff(now: Date): Date {
  return new Date(now.getTime() - REAPPLY_WINDOW_DAYS * MS_PER_DAY);
}

export interface CategorizedSubject extends CategorySubject {
  readonly id: string;
  readonly category: string | null;
}

export interface CategoryChange {
  readonly id: string;
  readonly category: string | null;
}

/** The sessions whose category differs under the current rules and app categories. */
export function recategorize(
  sessions: readonly CategorizedSubject[],
  rules: readonly Rule[],
  appCategories: ReadonlyMap<string, string | null>,
): CategoryChange[] {
  return sessions.flatMap((session) => {
    const category = resolveCategory(session, rules, appCategories.get(session.wmClass) ?? null);
    return category === session.category ? [] : [{ id: session.id, category }];
  });
}
