# system

Turns the agent's pressure, process and thermal samples into incidents, culprits and alerts
(SPEC §5 system). Internal only: the gateway is its one caller, on the `core` network.

## Layout

| Path               | Role                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `src/domain/`      | Pure logic: the sustain rule, culprits, leaks, alerts, local days. No IO and no clock          |
| `src/use-cases/`   | One function per operation. Runs domain logic inside one transaction of the `SystemStore` port |
| `src/adapters/`    | The Postgres `SystemStore`. Parameterized SQL only, every row parsed with Zod                  |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                                  |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas    |
| `src/config.ts`    | The service's own environment: `TZ`                                                            |
| `migrations/`      | SQL migrations, applied by service-kit on start                                                |

## Incidents

| Type                  | Opens when                                                             | Peak                  | Alert                       |
| --------------------- | ---------------------------------------------------------------------- | --------------------- | --------------------------- |
| `cpu`, `memory`, `io` | `some avg10` is above the threshold for **more than 15 s**             | highest `some avg10`  | `pressure-incident`, normal |
| `memory-critical`     | available memory is below 5% and swap is in use, from the first sample | highest memory `some` | `memory-critical`, critical |
| `thermal`             | the CPU is above 95 °C or throttled, from the first sample             | highest °C            | `thermal`, important        |
| `memory-leak`         | a process's RSS grows steadily by more than 1 GiB an hour              | highest bytes an hour | `memory-leak`, important    |

- The thresholds come with every batch, from `gateway.settings` (defaults: memory 10, cpu 40,
  io 30). A value equal to the threshold does not count.
- A condition incident starts when its run began, not when it qualified, and stays open across
  batches while the condition holds. It ends at the first sample where it no longer holds, or at
  the last sample before a gap of more than 15 s (the screen locked or the agent stopped).
- A short spike opens nothing. A sustained one opens exactly one incident and one alert.
- **Leaks** are checked at each batch's newest process sample, over the last hour of each listed
  process's snapshots: at least 4 snapshots over at least 30 min, never dropping more than 5% from
  one to the next. A pid and a `comm` identify a process, so a reused pid is a new one. The
  incident ends once the process stops leaking or leaves the top processes.
- **Culprits** are the top 10 processes by the incident's own resource (CPU for `cpu` and
  `thermal`, RSS for memory types, IO for `io`) over the incident, each at its worst.
- **Alerts** go back in the `POST /samples` reply for the gateway to route through focus. Their
  key is `system:<type>`, or `system:memory-leak:<pid>`, so focus's rate limit also holds back an
  incident that keeps reopening. SPEC sets the critical and important levels; it gives none for
  pressure and leaks, so they are normal and important, and focus's `alert_policy` can override.

## Samples

- Each kind (pressure, processes, thermal) has its own watermark: a sample at or before it is
  already applied and counted as `late`, so a retried or overlapping batch changes nothing.
- Pressure samples and process snapshots are kept for 7 days, pruned on every batch. Thermal
  samples are not stored; only their incidents are.
- Postgres `text` and `jsonb` cannot hold U+0000, so process names and containers are stored with
  U+FFFD in its place rather than failing the request.

## API

| Route                    | Request          | Reply                                                                  |
| ------------------------ | ---------------- | ---------------------------------------------------------------------- |
| `POST /samples`          | `SampleBatch`    | `SampleResult`: accepted and late counts, the alerts of new incidents  |
| `GET /incidents?from&to` | `TimeRangeQuery` | `IncidentList`: incidents overlapping `[from, to)`, open ones included |
| `GET /culprits?days`     | `CulpritsQuery`  | `CulpritList`: processes by the incidents they were blamed in since    |
| `GET /timeline?date`     | `TimelineQuery`  | `SystemTimeline`: one local day's pressure samples and incidents       |

Local days are counted in the zone `TZ` names (an IANA zone, `UTC` by default), from 2000 to 2100.
