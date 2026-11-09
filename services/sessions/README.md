# sessions

Turns the agent's 5 s window samples into sessions and categorizes them (SPEC §5 sessions).
Internal only: the gateway is its one caller, on the `core` network.

## Layout

| Path               | Role                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `src/domain/`      | Pure logic: merging samples, matching rules. No IO, fully unit-tested                            |
| `src/use-cases/`   | One function per operation. Runs domain logic inside one transaction of the `SessionsStore` port |
| `src/adapters/`    | The Postgres `SessionsStore`. Parameterized SQL only, every row parsed with Zod                  |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                                    |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas      |
| `migrations/`      | SQL migrations, applied by service-kit on start                                                  |

## Merge rules

- Consecutive samples of one app form a session. A gap of **more than 15 s** closes it at its last
  sample.
- An idle (`idleMs` ≥ 120 s) or locked sample closes the session at the moment the user went away,
  `ts - idleMs`, so away time is never counted.
- On a switch to another app, the previous session ends at the new app's first sample, unless there
  was a gap.
- A batch continues the one stored open session. Samples at or before its end are already recorded
  and are counted as `late`, not applied.
- Samples are sorted first, so a batch may arrive in any order. Of two samples with the same
  timestamp, the first one sent wins.
- A session keeps the latest title it saw. Titles are stored only when the agent sends them.

## Categories

1. A category the user set on the app (`PUT /apps/:id`) always wins.
2. Otherwise the matching rule with the highest priority decides. Ties go to the tighter match
   (`exact`, then `prefix`, then `contains`), then to the lower id, so the result never depends on
   row order. Matching ignores case.
3. Otherwise the session has no category.

Every change to a rule or to an app's category is re-applied, in the same transaction, to sessions
that ended in the last 30 days. Older sessions keep the category they had. A migration
seeds default rules at priority 0, so any rule the user adds wins.

## API

| Route                   | Request          | Reply                                                                   |
| ----------------------- | ---------------- | ----------------------------------------------------------------------- |
| `POST /samples`         | `SampleBatch`    | `SampleResult`: the sessions the batch closed, with their category      |
| `GET /sessions?from&to` | `TimeRangeQuery` | `SessionList`: sessions overlapping `[from, to)`, the open one included |
| `GET /apps`             |                  | `AppList`                                                               |
| `PUT /apps/:id`         | `AppUpdate`      | `App`, or 404                                                           |
| `GET /rules`            |                  | `RuleList`                                                              |
| `POST /rules`           | `RuleInput`      | `Rule` (201), or 409 at 500 rules                                       |
| `PUT /rules/:id`        | `RuleInput`      | `Rule`, or 404                                                          |
| `DELETE /rules/:id`     |                  | 204, or 404                                                             |

Postgres `text` cannot hold U+0000, so free text (titles, app names, rule patterns) is stored with
U+FFFD in its place rather than failing the request.
