# battery

Stores the agent's 60 s battery samples and answers how healthy the battery is, how long it will
last and which apps drain it (SPEC §5 battery). Internal only: the gateway is its one caller, on
the `core` network.

## Layout

| Path               | Role                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `src/domain/`      | Pure logic: health, daily summaries, time remaining, power attribution, alert rules. No IO  |
| `src/use-cases/`   | One function per operation, each inside one transaction of the `BatteryStore` port          |
| `src/adapters/`    | The Postgres `BatteryStore`. Parameterized SQL only, every row parsed with Zod              |
| `src/routes/`      | Thin: the schema for each part, a use case call, nothing else                               |
| `src/contracts.ts` | Gateway-to-service contracts with no public counterpart, built from `@yoman/shared` schemas |
| `migrations/`      | SQL migrations, applied by service-kit on start                                             |

## Calculations

- **Health** is `energy_full / energy_full_design`, in percent to one decimal, capped at 100 for a
  cell that holds more than its design energy.
- **Time remaining** divides the energy left (`energy_full × capacity`) by the average draw of the
  discharging samples in the 30 minutes up to the newest one. It is `null` unless the newest sample
  is discharging with a measured draw, and at most a week.
- **Per-app power**: each discharging sample is charged to the app whose session holds it, and an
  app's `averageW` is the mean of its samples. `seconds` is the app's focus time in the range. Apps
  with no discharging sample have no measured draw and are left out. Highest draw first.
- `power_now` on the charger is the charge rate, not drain, so every average counts discharging
  samples only.
- **`battery_daily`** holds, per date, the health of the day's last sample, the most cycles seen and
  the average discharging draw (0 for a day on the charger). It is recomputed from all of a day's
  samples whenever a batch touches that day, so it never depends on how samples were batched.
- Days are local days in the zone `TZ` names (an IANA zone such as `Asia/Jerusalem`, default
  `UTC`), the same variable and calculation the reports service uses, so both agree on where a day
  ends. `/health-trend` counts its window back from today in that zone; the route names today, so
  the domain never reads a clock.

## Alerts

| Type                   | When                                         | Level       |
| ---------------------- | -------------------------------------------- | ----------- |
| `battery-low`          | Discharging below 15%                        | `important` |
| `battery-critical`     | Discharging below 8%                         | `critical`  |
| `battery-plugged-full` | On the charger at 100% for more than 4 hours | `normal`    |

Each alert fires once, when its condition starts: a drain alert again only after the level eased
(usually on the charger), the plugged one after unplugging or dropping below 100%. A battery held
at 100% may report `full`, `not-charging` or `unknown`; all count as plugged in. A gap with no
samples, such as a locked screen, does not end a stretch on the charger. If one batch falls through
both thresholds, only `battery-critical` is sent.

The rules keep their state in `alert_state` and apply only samples newer than the newest applied,
so a retried or late batch raises nothing twice. Batches take a transaction-scoped advisory lock,
so two never interleave. The `alertKey` is the alert type, so focus's rate limit also damps a
charger plugged in and out around a threshold.

## API

| Route                    | Request             | Reply                                                     |
| ------------------------ | ------------------- | --------------------------------------------------------- |
| `POST /samples`          | `SampleBatch`       | `SampleResult`: counts and the alerts the batch raised    |
| `GET /now`               |                     | `BatteryNow`, or `null` when no battery ever reported     |
| `GET /health-trend?days` | `HealthTrendQuery`  | `HealthTrend`: the daily rows of the window, oldest first |
| `POST /power-by-app`     | `PowerByAppRequest` | `PowerByApp`                                              |

`/power-by-app` is a `POST` because the gateway supplies the session timeline (SPEC §5 battery),
and up to 92 days of sessions do not fit a query string. Each session carries only its app id,
start and end, never a title.
