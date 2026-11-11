import type { App, RuleInput } from '@yoman/shared/sessions';

/**
 * What a rule would apply to, among the apps the user already has. Only
 * `wmClass` rules can be previewed: window titles are not kept in the app
 * list, so a `title` rule has no known subjects (`null`).
 *
 * The comparison mirrors the sessions service (case-insensitive, plain string
 * matching), so the preview shows what the service will actually do.
 */
export function appsMatching(
  rule: Pick<RuleInput, 'field' | 'match' | 'pattern'>,
  apps: readonly App[],
): App[] | null {
  if (rule.field !== 'wmClass') {
    return null;
  }
  const pattern = rule.pattern.toLowerCase();
  if (pattern === '') {
    return [];
  }
  return apps.filter((app) => matchesText(rule.match, app.id.toLowerCase(), pattern));
}

function matchesText(match: RuleInput['match'], text: string, pattern: string): boolean {
  switch (match) {
    case 'exact':
      return text === pattern;
    case 'prefix':
      return text.startsWith(pattern);
    case 'contains':
      return text.includes(pattern);
  }
}
