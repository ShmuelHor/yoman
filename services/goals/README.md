# goals

Daily usage goals: "at most 30 minutes of social a weekday", "at least 2 hours in `code`"
(SPEC §5 goals). Internal only: the gateway is its one caller, on the `core` network.

## Layout

| Path               | Role                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `src/domain/`      | Pure logic: which goals apply on a date, goal status, the breach alert. No IO, fully tested |
| `src/use-cases/`   | One function per operation, each inside one transaction of the `GoalsStore` port            |
| `src/adapters/`    | The Postgres `GoalsStore`. Parameterized SQL only, every row parsed with Zod                |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                               |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas |
| `migrations/`      | SQL migrations, applied by service-kit on start                                             |

## Rules

- A goal applies only on its days of the week (0 is Sunday). Usage counts in whole minutes, so a
  `max 30` goal is breached at 31 minutes.
- A `max` goal is **breached** as soon as usage goes over it, and **met** once its day is over.
- A `min` goal is **met** as soon as usage reaches it, and **breached** only once its day is over.
- A day is over once a later day has been evaluated. The service never reads the clock to decide
  this, so the user's time zone stays with the gateway, which names the date.

## Evaluation

`POST /evaluate` takes a day's totals by app and by category, as reports computes them. They are
absolute, not increments, so a retried request changes nothing. It:

1. Stores them as the day's totals, replacing earlier ones. The service may not read another
   service's schema, so `/progress` answers from these.
2. Checks every goal against them. The first totals of a new day also check the previous evaluated
   day as finished, which is when an unmet `min` goal breaches.
3. Records each breach in `goal_events`, whose `(goal_id, date)` key keeps a goal to **one alert per
   day**, and returns a `goal-breach` alert for the new ones only.

Evaluations take a transaction-scoped advisory lock, so two never interleave. Deleting a goal
deletes its events.

The alerts' level is `normal`; focus's `alert_policy` decides what the user gets. The `alertKey`
names the goal and the day, so focus's rate limit never folds two of them together.

## API

| Route               | Request     | Reply                                                 |
| ------------------- | ----------- | ----------------------------------------------------- |
| `GET /goals`        |             | `GoalList`                                            |
| `POST /goals`       | `GoalInput` | `Goal` (201), or 409 at 500 goals                     |
| `PUT /goals/:id`    | `GoalInput` | `Goal`, or 404                                        |
| `DELETE /goals/:id` |             | 204, or 404                                           |
| `POST /evaluate`    | `DayTotals` | `EvaluateResult`: the alerts for goals newly breached |
| `GET /progress`     | `DateQuery` | `GoalProgress`: every goal that applies on the date   |
