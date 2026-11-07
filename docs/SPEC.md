# Yoman (יומן): אפיון

> היומן האוטומטי של המחשב שלך: זמן, סוללה, עומס ופוקוס. מקומי בלבד.
> מעקב זמן אוטומטי, בריאות סוללה, עומס מערכת ומצב עבודה, למחשב לינוקס אישי.
> רץ מקומית בלבד. שום נתון לא יוצא מהמחשב.

---

## 1. מטרות

| # | מטרה |
|---|---|
| G1 | לדעת לאן הלך הזמן: אילו אפליקציות, כמה, ומתי, בלי להזין שום דבר ידנית |
| G2 | לעקוב אחרי בריאות הסוללה לאורך זמן ולדעת מה שורף אותה |
| G3 | לקבל התראה כשהמחשב נחנק, ולדעת מי אשם |
| G4 | מצב עבודה שמשתיק אפליקציות לזמן מוגדר ומעביר רק דברים חשובים |
| G5 | ממשק בעברית ובאנגלית, עם מצב בהיר וכהה, בעיצוב "נייר ודיו" |

### מה לא בתוכנית (Non-goals)
- אין ענן, אין חשבונות, ואין סנכרון בין מחשבים
- אין תמיכה ב-Windows או ב-macOS בגרסה הראשונה
- אין צילומי מסך ואין הקלטת מקלדת

---

## 2. סביבת יעד

| פריט | ערך |
|---|---|
| מערכת | Ubuntu, GNOME על **Wayland** |
| Node | 22 LTS |
| Docker | Docker Engine + Compose v2 (**לא** Docker Desktop, הוא צורך יותר סוללה) |
| תוספי GNOME | **Window Calls** (חובה, לחלון הפעיל). AppIndicator (קיים ב-Ubuntu, לאייקון בשורת המשימות) |

---

## 3. ארכיטקטורה

```
 על המחשב (host)                         docker compose · רשת פנימית "core"
┌───────────────────────┐
│ agent                 │──HTTP──┐
│ collectors / actuators│        │      ┌───────────┐
│ buffer · tray · cli   │        ├────▶│  gateway  │ 127.0.0.1:4711
└───────────────────────┘        │      └─────┬─────┘
┌───────────────────────┐        │            │ מנתב ומתזמר
│ web (React)           │────────┘   ┌──────┬─┴────┬───────┬────────┬───────┐
│ 127.0.0.1:4710        │            ▼      ▼      ▼       ▼        ▼       ▼
└───────────────────────┘        sessions reports goals  battery  system  focus
                                     └──────┴──────┴───┬───┴────────┴───────┘
                                                   ┌───▼────┐
                                                   │postgres│ סכמה לכל סרוויס
                                                   └────────┘
```

### עקרונות
1. **רק ה-gateway מדבר עם העולם.** ה-web וה-agent מכירים רק אותו. הסרוויסים לא מדברים זה עם זה ישירות: ה-gateway מתזמר את כל הזרימות. הנתונים היחידים שבבעלות ה-gateway הם ההגדרות (`gateway.settings`).
2. **לכל סרוויס יש בעלות על הנתונים שלו:** סכמת Postgres משלו ומשתמש DB משלו. אסור לקרוא סכמה של סרוויס אחר.
3. **ה-agent רץ על המחשב ולא בדוקר**, כי הוא צריך גישה ל-D-Bus, ל-`/proc`, ל-`/sys` ולהגדרות GNOME.
4. **פורטים:** רק `4710` (web) ו-`4711` (gateway), ושניהם מאזינים על `127.0.0.1` בלבד. הסרוויסים הפנימיים לא חשופים בכלל.
5. **עמידות:** ה-agent שומר נתונים מקומית ושולח כשה-gateway זמין. אפשר לכבות את הדוקר בלי לאבד נתונים.

### זרימות שה-gateway מתזמר
| זרימה | שלבים |
|---|---|
| **ingest** (מה-agent, כל 60 שנ׳) | gateway מפצל את המנה: דגימות חלון וסרק → `sessions`, סוללה → `battery`, עומס → `system`. אחר כך הוא מעביר סשנים סגורים ל-`reports` ול-`goals` ואוסף אירועים להתראה. כל אירוע עובר ב-`focus` להחלטה (להקפיץ או לצבור), וההחלטות חוזרות ל-agent בתשובה. |
| **dashboard/today** | gateway קורא במקביל ל-`reports`, `battery`, `system` ו-`focus` ומחזיר תשובה אחת |
| **focus start/stop** | gateway → `focus` (מצב ופרופיל) → מחזיר ל-agent פקודות השתקה ושחזור |

---

## 4. ה-agent (על המחשב)

### 4.1 Collectors (איסוף)
| collector | מקור | תדירות | הערות |
|---|---|---|---|
| window | D-Bus `org.gnome.Shell.Extensions.Windows` (Window Calls): ‏`List` ← החלון עם `focus=true` | 5 שנ׳ | `wm_class`, `title`, `pid`. כותרת נשמרת רק אם ההגדרה מאפשרת |
| idle | D-Bus `org.gnome.Mutter.IdleMonitor.GetIdletime` | 5 שנ׳ | ‏idle ≥ 120 שנ׳ = לא ליד המחשב |
| lock | D-Bus `org.gnome.ScreenSaver` signal `ActiveChanged` | אירוע | במצב נעול הדגימה נעצרת לגמרי |
| battery | ‏`/sys/class/power_supply/BAT*`: ‏energy_full, energy_full_design, cycle_count, power_now, capacity, status | 60 שנ׳ | מכשירים בלי סוללה: הסרוויס כבוי |
| pressure | ‏`/proc/pressure/{cpu,memory,io}`, ערכי `some avg10` ו-`full avg10` | 5 שנ׳ | זול מאוד |
| processes | ‏`/proc/[pid]/{stat,status,cgroup}` | **רק בעומס** (PSI מעל הסף) + כל 5 דק׳ | 10 התהליכים הכבדים ב-CPU, ב-RSS וב-IO. מיפוי cgroup ← שם קונטיינר |
| thermal | ‏`/sys/class/thermal`, ‏`/sys/class/hwmon` | 30 שנ׳ | טמפ׳ CPU והאטת מעבד (throttle) |
| app-discovery | inotify על תיקיות `.desktop` (apt, snap, flatpak, `~/.local`) + `gsettings monitor org.gnome.desktop.notifications application-children` | אירוע | בלי polling |

### 4.2 Actuators (פעולות)
| actuator | מימוש |
|---|---|
| notifier | D-Bus `org.freedesktop.Notifications.Notify` עם urgency: ‏critical=2 (עובר גם ב"נא לא להפריע" של GNOME), ‏important ו-normal=1 |
| muter | ‏`gsettings set org.gnome.desktop.notifications.application:/org/gnome/desktop/notifications/application/<id>/ show-banners false` |
| dnd | ‏`org.gnome.desktop.notifications show-banners` (אופציונלי, לפי הגדרה) |

**muter: בטיחות.** לפני כל שינוי, ה-agent שומר את הערך המקורי ב-`~/.local/state/yoman/mute-state.json`. בהפעלה, ובכל מקרה של `focus.endsAt < now`, הוא משחזר אוטומטית. אסור שאפליקציה תישאר מושתקת אחרי קריסה.

**מה אף פעם לא מושתק:** ‏`update-manager`, ‏`gnome-*`, ‏`org.gnome.*`, ‏`yoman`, וכל אפליקציה ברשימת "מערכת" שבהגדרות.

### 4.3 Buffer ושליחה
- קובץ JSONL מקומי ב-`~/.local/state/yoman/buffer/`, עם קובץ חדש לכל שעה
- כל 60 שנ׳ נשלחת מנה (batch) ל-`POST /v1/ingest`. אם השליחה הצליחה, הקבצים נמחקים. אם נכשלה, יש backoff אקספוננציאלי עד 10 דק׳
- תקרה של 50MB. מעבר לה נמחקים הקבצים הישנים ביותר, עם אזהרה בלוג

### 4.4 תקציב סוללה (חובה)
- ממוצע CPU של ה-agent **≤ 0.5%** וזיכרון **≤ 60MB**
- אין polling מעבר לטבלה שלמעלה. במצב נעול או סרק אין דגימה
- איסוף processes רק כשיש עומס

### 4.5 ממשקים
- **systemd user unit** `yoman-agent.service`, עם `Restart=on-failure`
- **CLI** `yoman`: ‏`status`, ‏`pause [dur]`, ‏`resume`, ‏`focus <dur|until HH:MM> [--profile name]`, ‏`focus stop`
- **Tray**: זמן היום, מצב (פעיל, מושהה או פוקוס), התחלה ועצירה של פוקוס, השהיה, פתיחת הדשבורד

---

## 5. סרוויסים

כולם: Fastify + TypeScript, ‏`GET /health`, לוג JSON (pino), קונפיג נבדק ב-zod, ו-migrations משלהם.

### sessions
- **קלט:** דגימות `{ts, wmClass, title?, pid, idleMs, locked}`
- **לוגיקה:** איחוד דגימות רצופות של אותה אפליקציה לסשן. פער מעל 15 שנ׳ או idle סוגר את הסשן
- **ישויות:** `apps` (wm_class, שם, אייקון, קטגוריה), `sessions` (app_id, start, end, title?), `category_rules` (pattern על wm_class או title ← קטגוריה, עדיפות)
- **API:** ‏`POST /samples`, ‏`GET /sessions?from&to`, ‏`GET/PUT /apps`, ‏`GET/POST/PUT/DELETE /rules`

### reports
- **קלט:** סשנים סגורים
- **ישויות:** `daily_rollups` (תאריך, app, קטגוריה, שניות), `focus_streaks`
- **API:** ‏`GET /today`, ‏`GET /week?start`, ‏`GET /top-apps?from&to`, ‏`GET /weekly-summary`
- **ניקוי נתונים:** סשנים בני יותר מ-90 יום מאוחדים ל-rollups ונמחקים, בהרצה יומית

### goals
- **ישויות:** `goals` (סוג: max או min, יעד: app או קטגוריה, דקות, ימים בשבוע), `goal_events`
- **API:** CRUD ל-`/goals`, ‏`POST /evaluate` (מקבל סיכומים ומחזיר חריגות), ‏`GET /progress?date`

### battery
- **ישויות:** `battery_samples`, `battery_daily` (בריאות %, מחזורים, ממוצע W)
- **לוגיקה:** בריאות = energy_full / energy_full_design. זמן נותר לפי ממוצע הצריכה ב-30 הדקות האחרונות. **שיוך צריכה לאפליקציה:** ממוצע `power_now` בזמן שכל אפליקציה בפוקוס, מקבל מה-gateway את ציר הסשנים
- **התראות:** מתחת ל-15% (important), מתחת ל-8% (critical), מחובר ב-100% יותר מ-4 שעות (normal)
- **API:** ‏`POST /samples`, ‏`GET /health-trend?days`, ‏`GET /now`, ‏`GET /power-by-app?from&to`

### system
- **ישויות:** `pressure_samples` (נשמרים 7 ימים), `incidents` (סוג, התחלה, סוף, שיא, culprits jsonb), `process_snapshots`
- **לוגיקה:**
  - incident נפתח כש-`some avg10` עובר את הסף **יותר מ-15 שנ׳**. ברירות מחדל: memory 10%, cpu 40%, io 30%
  - זיכרון זמין מתחת ל-5% ו-swap פעיל = critical
  - טמפ׳ מעל 95°C או throttle = important
  - **זליגת זיכרון:** RSS של תהליך עולה באופן רציף יותר מ-1GB בשעה
- **API:** ‏`POST /samples`, ‏`GET /incidents?from&to`, ‏`GET /culprits?days`, ‏`GET /timeline?date`

### focus
- **ישויות:** `profiles` (שם, אפליקציות מושתקות, חריגים, השתקת אפליקציות חדשות כברירת מחדל), `schedules`, `focus_sessions`, `queued_alerts`, `alert_policy` (סוג התראה ← רמה)
- **רמות:** `critical` עובר תמיד, `important` עובר רק מחוץ לפוקוס, `normal` עובר רק מחוץ לפוקוס. בתוך פוקוס, כל מה שלא עבר נצבר
- **rate limit:** התראה אחת לכל `alertKey` ב-10 דק׳
- **אוטומציה:** לפי לוח זמנים, ‏Pomodoro, או אפליקציה בפוקוס רציף יותר מ-N דק׳
- **API:** ‏`POST /start`, ‏`POST /stop`, ‏`GET /state`, CRUD ל-`/profiles`, ‏`POST /route` (אירועים ← deliver[] ו-queue[]), ‏`GET /queue`, ‏`GET /known-apps`, ‏`POST /known-apps`

### gateway
- **אימות:**
  - ה-agent שולח `Authorization: Bearer <AGENT_TOKEN>`, שנוצר ב-`.env`
  - ה-web מקבל cookie session מקומי, דרך `GET /v1/session` שעובד רק מ-origin ‏`http://127.0.0.1:4710` או `http://localhost:4710`
- **API ציבורי (v1):** ‏`/v1/ingest`, ‏`/v1/dashboard/today`, ‏`/v1/week`, ‏`/v1/apps`, ‏`/v1/rules`, ‏`/v1/goals`, ‏`/v1/battery/*`, ‏`/v1/system/*`, ‏`/v1/focus/*`, ‏`/v1/export`, ‏`/v1/settings`
- **timeouts** של 3 שנ׳ לכל סרוויס, ותשובה חלקית כשסרוויס נופל: `{data, degraded:["battery"]}`
- **הגדרות** (`gateway.settings`): שפה, ערכת צבעים, פרטיות (כותרות ואפליקציות מוחרגות), ספי עומס, אפליקציות מערכת שאסור להשתיק, ושעות שקטות. ה-gateway מעביר לכל סרוויס ול-agent את מה שרלוונטי אליהם
- **אבטחה:** ‏Host allowlist, בדיקת Origin, ‏CSRF, ‏rate limit ו-body limit. הפירוט ב-[SECURITY.md](SECURITY.md)

---

## 6. Web

- Vite + React 18 + TypeScript, ‏React Router, ‏TanStack Query, ‏react-i18next
- **עמודים:** היום · שבוע · אפליקציות · סוללה · מערכת · יעדים · מצב עבודה · התראות · הגדרות
- **i18n:** ‏`he` (ברירת מחדל) ו-`en`. ‏`dir` על `<html>` מתעדכן לפי השפה. משתמשים רק ב-CSS logical properties. תאריכים ומספרים דרך `Intl`
- **ערכת צבעים:** ‏`system`, `light` או `dark`, נשמר בהגדרות. ראה [DESIGN.md](DESIGN.md)
- **גרפים:** ‏SVG בכתיבה עצמית או `visx`, בצבעי ה-tokens בלבד

---

## 7. פרטיות ואבטחה

- כל הנתונים נשמרים ב-volume של Postgres ובתיקיית `~/.local/state/yoman`. שום דבר לא יוצא מהמחשב
- אפשר להגדיר "לא לשמור כותרות חלונות" ורשימת אפליקציות שלא עוקבים אחריהן בכלל
- כפתור "השהה מעקב"
- **סודות:** רק ב-`.env` (‏`0600`), שנמצא ב-`.gitignore`. ‏`npm run setup` יוצר סיסמאות וטוקנים אקראיים. בריפו יש רק `.env.example`
- הפורטים מאזינים על `127.0.0.1` בלבד
- **מודל האיומים, ההגנות ובדיקות האבטחה המחייבות:** [SECURITY.md](SECURITY.md)

---

## 8. איכות, CI/CD

**ה-CI/CD נבנה ראשון (גל 0), לפני כל קוד של פיצ׳רים.**

- **טסטים:**
  - vitest עם סף כיסוי: ‏80% ללוגיקה (`domain`, ‏`agent/core`) ו-60% לשאר
  - fast-check ל-fuzzing של routes
  - contract tests: כל תשובה עוברת validation מול `packages/shared`
  - ‏Playwright ל-E2E
  - `tests/security/` עם ST01–ST19
- **CI (בכל PR):** ‏lint, ‏typecheck, ‏tests, ‏build, וכל שערי האבטחה מ-SECURITY.md §4. כולם חוסמים
- **CD:**
  - ב-push ל-main: בניית images, ‏Trivy, ו-compose up עם smoke ובדיקות אבטחה
  - בתג `v*`: ‏SBOM, חתימה keyless עם cosign, ‏provenance, ‏push ל-GHCR פרטי, ו-GitHub Release עם compose שנעול ל-digests
- **Nightly:** סריקות מלאות ו-ZAP baseline
- **ריפו:** פרטי, ‏branch protection, ‏secret scanning ו-push protection
- **healthchecks** ב-compose ו-`depends_on: condition: service_healthy`
