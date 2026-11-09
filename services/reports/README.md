# reports

Rolls closed sessions up into daily totals and focus streaks, and serves the day, week and weekly
summary reports (SPEC §5 reports). Internal only: the gateway is its one caller, on the `core`
network.

## Layout

| Path               | Role                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `src/domain/`      | Pure logic: local days, rollups, streaks and report building. No IO, fully unit-tested          |
| `src/use-cases/`   | One function per operation. Runs domain logic inside one transaction of the `ReportsStore` port |
| `src/adapters/`    | The Postgres `ReportsStore`. Parameterized SQL only, every row parsed with Zod                  |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                                   |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas     |
| `src/config.ts`    | The service's own environment: `TZ`                                                             |
| `migrations/`      | SQL migrations, applied by service-kit on start                                                 |

## Local days

Every date is a calendar day in the zone `TZ` names (an IANA zone such as `Asia/Jerusalem`,
`UTC` by default). A session that crosses local midnight counts on both days, each with the part
that fell on it. DST days are 23 or 25 hours long, and a day whose midnight a DST change skipped
starts at the first instant that belongs to it. Rollups keep the day they were counted under, so
changing `TZ` affects only sessions counted after the change.

Dates and sessions are bounded to 2000–2100: a clock outside that is broken, and the bound keeps
every week and every local date a valid `LocalDate`.

## Counting

- `POST /sessions` takes the `closed` list the sessions service returns, as it is. Each session's
  time is added to `daily_rollups` per local day, app and category, in milliseconds; reports
  round to whole seconds once, on read.
- A session id is remembered in `counted_sessions` once counted. A retried batch, or the same
  session twice in one batch, is counted once and reported as `duplicates`.
- Only closed sessions are counted, so `GET /today` does not include the session still open.

## Focus streaks

- A streak is a stretch on one category with no interruption longer than **60 s**. A glance at
  another app does not end it; stepping away does, because the agent's idle threshold is 120 s.
- Uncategorized time is not focus and never forms a streak.
- New sessions are joined into the stored streaks they touch, which is order-independent, so
  batches may arrive in any order. Writers take a table lock, so two batches never merge one
  streak at once.
- A streak belongs to the local day it started on: a 23:00–01:00 streak is two hours of the first
  day.

## Weeks

- `GET /week?start` reports the seven days from `start`, whatever weekday it is, with the change
  against the seven days before. `changePct` is `null` when those had no time.
- `GET /weekly-summary` summarizes the last complete week. Weeks start on Sunday, as in Israel,
  the product's default locale.

## API

| Route                   | Request           | Reply                                                  |
| ----------------------- | ----------------- | ------------------------------------------------------ |
| `POST /sessions`        | `SessionBatch`    | `SessionBatchResult`: `counted` and `duplicates`       |
| `GET /today`            |                   | `DayReport` of the local day now falls on              |
| `GET /week?start`       | `ReportWeekQuery` | `WeekReport`                                           |
| `GET /top-apps?from&to` | `TopAppsQuery`    | `TopAppList`: `AppTotal`s over local days `[from, to)` |
| `GET /weekly-summary`   |                   | `WeeklySummary` of the last complete week              |
