# Yoman: specification

> Your computer's automatic journal ("yoman" is Hebrew for journal): time, battery, load and focus. Local only.
> Automatic time tracking, battery health, system load and focus mode for a personal Linux computer.
> Runs locally only. No data ever leaves the computer.

---

## 1. Goals

| # | Goal |
|---|---|
| G1 | Know where the time went: which apps, how long and when, without entering anything by hand |
| G2 | Track battery health over time and know what is draining it |
| G3 | Get alerted when the computer is choking, and know who is to blame |
| G4 | A focus mode that mutes apps for a set time and lets only important things through |
| G5 | A Hebrew and English UI, with light and dark modes, in the "Paper and Ink" design |

### Non-goals
- No cloud, no accounts and no sync between computers
- No Windows or macOS support in the first version
- No screenshots and no keylogging

---

## 2. Target environment

| Item | Value |
|---|---|
| OS | Ubuntu, GNOME on **Wayland** |
| Node | 22 LTS |
| Docker | Docker Engine + Compose v2 (**not** Docker Desktop, which uses more battery) |
| GNOME extensions | **Window Calls** (required, for the active window). AppIndicator (ships with Ubuntu, for the tray icon) |

---

## 3. Architecture

```
 on the host                              docker compose · internal network "core"
┌───────────────────────┐
│ agent                 │──HTTP──┐
│ collectors / actuators│        │      ┌───────────┐
│ buffer · tray · cli   │        ├────▶│  gateway  │ 127.0.0.1:4711
└───────────────────────┘        │      └─────┬─────┘
┌───────────────────────┐        │            │ routes and orchestrates
│ web (React)           │────────┘   ┌──────┬─┴────┬────────┬───────┐
│ 127.0.0.1:4710        │            ▼      ▼      ▼        ▼       ▼
└───────────────────────┘        sessions reports battery  system  focus
                                     └──────┴───┬───┴────────┴───────┘
                                                   ┌───▼────┐
                                                   │postgres│ one schema per service
                                                   └────────┘
```

### Principles
1. **Only the gateway talks to the outside world.** The web and the agent know only the gateway. Services never talk to each other directly: the gateway orchestrates every flow. The only data the gateway owns is the settings (`gateway.settings`).
2. **Each service owns its data:** its own Postgres schema and its own DB user. Reading another service's schema is not allowed.
3. **The agent runs on the host, not in Docker**, because it needs access to D-Bus, `/proc`, `/sys` and the GNOME settings.
4. **Ports:** only `4710` (web) and `4711` (gateway), and both listen on `127.0.0.1` only. Internal services are not exposed at all.
5. **Resilience:** the agent stores data locally and sends it when the gateway is available. Docker can be shut down without losing data.

### Flows the gateway orchestrates
| Flow | Steps |
|---|---|
| **ingest** (from the agent, every 60 s) | The gateway splits the batch: window and idle samples → `sessions`, battery → `battery`, load → `system`. It then forwards closed sessions to `reports` and collects events to alert on. Each event goes through `focus` for a decision (deliver now or queue), and the decisions return to the agent in the response. |
| **dashboard/today** | The gateway calls `reports`, `battery`, `system` and `focus` in parallel and returns a single response |
| **known apps** (from the agent, on start and on change) | gateway → `focus` `POST /known-apps` → the Focus page lists them and profiles can mute them |
| **focus start/stop** | gateway → `focus` (state and profile) → returns mute and restore commands to the agent |

---

## 4. The agent (on the host)

### 4.1 Collectors
| Collector | Source | Frequency | Notes |
|---|---|---|---|
| window | D-Bus `org.gnome.Shell.Extensions.Windows` (Window Calls): `List` → the window with `focus=true` | 5 s | `wm_class`, `title`, `pid`. The title is stored only if the setting allows it. The app ID is `wm_class` with each run of disallowed characters replaced by `-` (case kept, at most 128), so values that differ only in punctuation or case are different apps |
| idle | D-Bus `org.gnome.Mutter.IdleMonitor.GetIdletime` | 5 s | idle ≥ 120 s = away from the computer |
| lock | D-Bus `org.gnome.ScreenSaver` signal `ActiveChanged` | Event | While locked, sampling stops completely |
| battery | `/sys/class/power_supply/BAT*`: energy_full, energy_full_design, cycle_count, power_now, capacity, status | 60 s | Devices without a battery: the service is off |
| pressure | `/proc/pressure/{cpu,memory,io}`, the `some avg10` and `full avg10` values | 5 s | Very cheap |
| processes | `/proc/[pid]/{stat,status,io,cgroup}` (never `cmdline` or `environ`) | **Only under load** (PSI above the threshold), at most every 15 s, + every 5 min | The top 10 processes by CPU, RSS and IO (`io` holds byte counters only). Only `comm` is sent. cgroup → container name mapping |
| thermal | `/sys/class/thermal`, `/sys/class/hwmon`, `/sys/devices/system/cpu/cpu*/thermal_throttle` | 30 s | CPU temperature and CPU throttling |
| apps | inotify on `.desktop` directories (apt, snap, flatpak, `~/.local`) + `gsettings monitor org.gnome.desktop.notifications application-children` | Event | No polling |

### 4.2 Actuators
| Actuator | Implementation |
|---|---|
| notifier | D-Bus `org.freedesktop.Notifications.Notify` with urgency: critical=2 (gets through even GNOME's "Do Not Disturb"), important and normal=1 |
| muter | `gsettings set org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/<id>/ show-banners false` |
| dnd | `org.gnome.desktop.notifications show-banners` (optional, per setting) |

**Muter safety.** Before every change, the agent saves the original value in `~/.local/state/yoman/mute-state.json`. On startup, and whenever `focus.endsAt < now`, it restores automatically. An app must never stay muted after a crash.

**Never muted:** `update-manager`, `gnome-*`, `org.gnome.*`, `yoman`, and every app on the "system" list in the settings.

### 4.3 Buffer and sending
- A local JSONL file in `~/.local/state/yoman/buffer/`, with a new file every hour
- Every 60 s a batch is sent to `POST /v1/ingest`. If sending succeeds, the files are deleted. If it fails, exponential backoff up to 10 min
- A 50MB cap. Beyond it the oldest files are deleted, with a warning in the log
- **Known apps:** the apps collector's catalog is not a sample and does not go through the buffer. The agent sends the whole catalog (at most 500 apps) to `POST /v1/focus/known-apps` once at start and again whenever it changes, never on a schedule. The latest catalog replaces one still waiting. If the gateway is unreachable or busy it retries with a backoff (10 s, doubling up to 10 min); a catalog the gateway refuses (4xx) is dropped. Nothing is sent while the screen is locked, and it goes out when the screen unlocks. The gateway forwards it to focus `POST /known-apps`, which stores it for the Focus page; the never-muted rule applies when the mute list is built, not here

### 4.4 Battery budget (required)
- Agent average CPU **≤ 0.5%** and memory **≤ 60MB**
- No polling beyond the table above. No sampling while locked or idle
- Processes are collected only under load

### 4.5 Interfaces
- **systemd user unit** `yoman-agent.service`, with `Restart=on-failure`
- **CLI** `yoman`: `status`, `pause [dur]`, `resume`, `focus <dur|until HH:MM> [--profile name]`, `focus stop`
- **Tray**: today's time, state (active, paused or focus), start and stop focus, pause, open the dashboard

---

## 5. Services

All of them: Fastify + TypeScript, Kysely over Postgres, `GET /health`, JSON logging (pino), config validated with zod, and their own migrations.

### sessions
- **Input:** samples `{ts, wmClass, title?, pid, idleMs, locked}`
- **Logic:** merge consecutive samples of the same app into a session. A gap of more than 15 s or idle closes the session
- **Entities:** `apps` (wm_class, name, icon, category), `sessions` (app_id, start, end, title?), `category_rules` (pattern on wm_class or title → category, priority)
- **API:** `POST /samples`, `GET /sessions?from&to`, `GET/PUT /apps`, `GET/POST/PUT/DELETE /rules`

### reports
- **Input:** closed sessions
- **Entities:** `daily_rollups` (date, app, category, seconds), `focus_streaks`
- **API:** `GET /today`, `GET /week?start`, `GET /top-apps?from&to`, `GET /weekly-summary`
- **Data retention:** sessions older than 90 days are merged into rollups and deleted, in a daily run

### battery
- **Entities:** `battery_samples`, `battery_daily` (health %, cycles, average W)
- **Logic:** health = energy_full / energy_full_design. Time remaining is based on average consumption over the last 30 minutes. **Per-app power attribution:** average `power_now` while each app is in focus; the gateway supplies the session timeline
- **Alerts:** below 15% (important), below 8% (critical), plugged in at 100% for more than 4 hours (normal)
- **API:** `POST /samples`, `GET /health-trend?days`, `GET /now`, `POST /power-by-app` (`from`, `to` and the session timeline in the body)

### system
- **Entities:** `pressure_samples` and `process_snapshots` (both kept for 7 days), `incidents` (type, start, end, peak, culprits jsonb). Thermal samples are not stored, only the incidents they open
- **Logic:**
  - An incident opens when `some avg10` exceeds the threshold for **more than 15 s**. Defaults: memory 10%, cpu 40%, io 30%
  - Available memory below 5% with swap active = critical
  - Temperature above 95°C or throttling = important
  - **Memory leak:** a process's RSS grows steadily by more than 1 GiB per hour
  - Default alert levels: a pressure incident is normal, a memory leak is important. `alert_policy` in focus can change them
- **API:** `POST /samples` (the gateway sends the current thresholds from the settings in the body), `GET /incidents?from&to`, `GET /culprits?days`, `GET /timeline?date`

### focus
- **Entities:** `profiles` (name, muted apps, exceptions, mute new apps by default), `schedules`, `focus_sessions`, `queued_alerts`, `alert_policy` (alert type → level)
- **Levels:** `critical` always gets through, `important` gets through only outside focus, `normal` gets through only outside focus. During focus, everything that did not get through is queued
- **Rate limit:** one alert per `alertKey` per 10 min
- **Automation:** by schedule, Pomodoro, or an app in continuous focus for more than N min
- **API:** `POST /start`, `POST /stop`, `GET /state`, CRUD for `/profiles`, `POST /route` (events → deliver[] and queue[]), `GET /queue`, `GET /known-apps`, `POST /known-apps`

### gateway
- **Authentication:**
  - The agent sends `Authorization: Bearer <AGENT_TOKEN>`, which is generated in `.env`
  - The web gets a local session cookie through `GET /v1/session`, which works only from the origin `http://127.0.0.1:4710` or `http://localhost:4710`
- **Public API (v1):** `/v1/ingest`, `/v1/dashboard/today`, `/v1/week`, `/v1/apps`, `/v1/rules`, `/v1/battery/*`, `/v1/system/*`, `/v1/focus/*`, `/v1/export`, `/v1/settings`
- **Timeouts** of 3 s per service, and a partial response when a service is down: `{data, degraded:["battery"]}`
- **Settings** (`gateway.settings`): language, color theme, privacy (titles and excluded apps), load thresholds, system apps that must never be muted, and quiet hours. The gateway passes each service and the agent whatever is relevant to them
- **Security:** Host allowlist, Origin check, CSRF, rate limit and body limit. Details in [SECURITY.md](SECURITY.md)

---

## 6. Web

- Vite + React 19 + TypeScript, MUI (Emotion, MUI X), TanStack Router, TanStack Query, react-hook-form, react-i18next
- **Pages (five, in this order):**
  - **Overview** (`/`): a day/week switch. Day: active time, focus streak, where the time went, top apps. Clicking an app in the top apps opens a small menu to change its category; that is the only category editing in the UI. Week: columns by day and category, comparison with the previous week, the weekly summary.
  - **Computer** (`/computer`): one plain-language summary line at the top (for example "Battery healthy · the computer got stuck twice today, mostly while Chrome was running"), then two tabs: **Battery** (charge, health, cycles, time remaining, what is draining it), **Load** (slowdowns as an incident timeline with the resource and the active app in plain words, recurring culprits, and the raw pressure chart as a secondary "Details" view)
  - **Processes** (`/processes`): the task manager. What is running now with live CPU, RAM and IO, grouping by app, All/Apps/Docker views, and End task with confirmation
  - **Focus mode** (`/focus`): start and stop, profiles, apps with a "new" tag, exceptions, schedules, Pomodoro, the alert center (held alerts) and FocusBanner
  - **Settings** (`/settings`): language, color theme, privacy, thresholds, system apps, quiet hours, and the **alert level policy**
- **Categories:** apps are categorized automatically by the built-in category rules (the `sessions` rules API stays); there is no page or settings section for managing apps or rules
- **Old paths** (`/apps`, `/battery`, `/system`, `/week`) redirect to their new place, so links in notifications keep working
- **Shell:** the navigation follows DESIGN.md (nav tabs). The header language and theme pickers save to the settings, so a reload keeps the choice and the Settings form stays in sync
- **i18n:** `he` (default) and `en`. `dir` on `<html>` updates with the language. Only logical properties are used (in `sx` and `styled`). Dates and numbers go through `Intl`
- **Color theme:** `system`, `light` or `dark`, stored in the settings. See [DESIGN.md](DESIGN.md)
- **Charts:** MUI X Charts, in token colors only

---

## 7. Privacy and security

- All data is stored in the Postgres volume and in the `~/.local/state/yoman` directory. Nothing leaves the computer
- A "don't store window titles" setting, and a list of apps that are not tracked at all
- A "pause tracking" button
- **Secrets:** only in `.env` (`0600`), which is in `.gitignore`. `npm run setup` generates random passwords and tokens. The repo contains only `.env.example`
- Ports listen on `127.0.0.1` only
- **The threat model, mitigations and required security tests:** [SECURITY.md](SECURITY.md)

---

## 8. Quality, CI/CD

**CI/CD is built first (wave 0), before any feature code.**

- **Tests:**
  - vitest with coverage thresholds: 80% for logic (`domain`, `apps/agent/core`) and 60% for everything else
  - fast-check for route fuzzing
  - Contract tests: every response is validated against `packages/shared`
  - Playwright for E2E
  - `tests/security/` with ST01–ST18
- **CI (on every PR):** lint, typecheck, tests, build, and every security gate from SECURITY.md §4. All of them are blocking
- **CD:**
  - On push to main: compose up with smoke and security tests
  - On a `v*` tag: build and push to a private GHCR, and a GitHub Release with a compose file pinned to digests
- **Nightly:** gitleaks and npm audit
- **Repo:** private, branch protection, secret scanning and push protection
- **Healthchecks** in compose and `depends_on: condition: service_healthy`
