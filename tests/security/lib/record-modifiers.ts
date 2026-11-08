/**
 * Setup file for the security suite. Vitest's JSON report shows a `.fails`
 * test as passed, so this marks it in the test's meta, which the report does
 * include. `security:todo --strict` reads the mark, since a test that is
 * expected to fail proves nothing about the policy it names.
 */
import { beforeEach } from 'vitest';

declare module 'vitest' {
  interface TaskMeta {
    /** Set on tests declared with `.fails`. */
    failsByDesign?: boolean;
  }
}

beforeEach(({ task }) => {
  if (task.fails === true) {
    task.meta.failsByDesign = true;
  }
});
