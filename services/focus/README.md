# focus

Focus mode: profiles, the mute and restore commands for the agent, and the decision for every alert
(deliver now, queue, or drop) (SPEC §5 focus). Internal only: the gateway is its one caller, on the
`core` network.

## Layout

| Path               | Role                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `src/domain/`      | Pure logic: levels, rate limit, mute plans, end times, exit summary. No IO, never reads the clock |
| `src/use-cases/`   | One function per operation. Runs domain logic inside one transaction of the `FocusStore` port     |
| `src/adapters/`    | The Postgres `FocusStore`. Parameterized SQL only, every row parsed with Zod                      |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                                     |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas       |
| `migrations/`      | SQL migrations, applied by service-kit on start                                                   |

## Alerts

| Level       | In focus | Not in focus |
| ----------- | -------- | ------------ |
| `critical`  | deliver  | deliver      |
| `important` | queue    | deliver      |
| `normal`    | queue    | deliver      |

- An alert's level is the `alert_policy` entry for its type, or the sender's level without one. A
  delivered or queued alert carries that effective level, so the notifier's urgency matches.
- **Rate limit:** one alert per `alertKey` per 10 min, counted from when the service let the
  previous one through (delivered or queued), so it holds for `critical` too. A repeat inside the
  window is dropped and counted in `rateLimited`.
- The queue holds at most 500 alerts; beyond that the oldest are dropped.

## Focus sessions

- `POST /start` takes a duration or `until HH:MM`, read in `TZ` (the next time the local clock
  shows it, so tomorrow if it has passed). Without a `profileId` the oldest profile is used; a
  migration seeds one, `Default`, that mutes every discovered app.
- **Muting:** the profile's `mutedApps`, plus, with `muteNewApps`, every known app. `exceptions`
  are never muted. The muted set is stored with the session, so closing it restores exactly that.
- Starting while a session is open switches to the new profile: only the apps it no longer mutes
  are restored.
- **Exit summary:** closing a session drains the queue into a `FocusSummary` (when it ran, and the
  held alerts, oldest first). A session closes on `POST /stop`, on a new `POST /start`, or, once it
  has run out, on the next `POST /route`, which is why `/route` accepts an empty batch.
- `GET /state` reports a session past its end as over without changing anything.
- A running focus keeps the mutes it started with; profile edits apply from the next start. The
  running focus's profile cannot be deleted (409).

## API

| Route                   | Request           | Reply                                                              |
| ----------------------- | ----------------- | ------------------------------------------------------------------ |
| `GET /state`            |                   | `FocusState`                                                       |
| `POST /start`           | `FocusStart`      | `FocusTransition`: `FocusChange` plus the closed session's summary |
| `POST /stop`            |                   | `FocusTransition`                                                  |
| `POST /route`           | `RouteRequest`    | `RouteResult`: `deliver[]`, `queued`, `rateLimited`, `summary`     |
| `GET /queue`            |                   | `AlertQueue`                                                       |
| `GET /alert-policy`     |                   | `AlertPolicy`                                                      |
| `PUT /alert-policy`     | `AlertPolicy`     | `AlertPolicy`; replaces the whole policy                           |
| `GET /profiles`         |                   | `ProfileList`                                                      |
| `POST /profiles`        | `ProfileInput`    | `Profile` (201), or 409 at 500 profiles                            |
| `PUT /profiles/:id`     | `ProfileInput`    | `Profile`, or 404                                                  |
| `DELETE /profiles/:id`  |                   | 204, 404, or 409 for the running focus's profile                   |
| `GET /known-apps`       |                   | `KnownAppList`                                                     |
| `POST /known-apps`      | `KnownAppsReport` | `KnownAppsResult`: how many were new; at most 500 apps are kept    |
| `GET /schedules`        |                   | `ScheduleList`                                                     |
| `POST /schedules`       | `ScheduleInput`   | `Schedule` (201), 404 for an unknown profile, or 409 at 500        |
| `PUT /schedules/:id`    | `ScheduleInput`   | `Schedule`, or 404                                                 |
| `DELETE /schedules/:id` |                   | 204, or 404                                                        |

Schedules are stored here; starting a focus from them is the automation's job (T45).

Postgres `text` and `jsonb` cannot hold U+0000, so free text (profile and app names, alert params)
is stored with U+FFFD in its place rather than failing the request.
