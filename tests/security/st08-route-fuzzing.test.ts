import { describe, it } from 'vitest';

describe('ST08 route fuzzing', () => {
  it.todo(
    '[T19] 500 invalid inputs per route, generated from its zod schema, return 400 and never 500',
  );
  it.todo('[T27] ingest routes pass the fuzzing check');
  it.todo('[T28] dashboard, reports, apps, rules and goals routes pass the fuzzing check');
  it.todo('[T29] battery and system routes pass the fuzzing check');
  it.todo('[T30] focus routes pass the fuzzing check');
  it.todo('[T31] settings routes pass the fuzzing check');
});
