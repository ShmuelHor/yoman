# Yoman: משימות לעבודה מקבילית

קובץ זה הוא תור העבודה של הסוכנים. לפני כל משימה: [CLAUDE.md](../CLAUDE.md), ‏[SPEC.md](SPEC.md), ‏[SECURITY.md](SECURITY.md), ‏[DESIGN.md](DESIGN.md).

## איך עובדים במקביל

### תפקידים
| תפקיד | מי | אחריות |
|---|---|---|
| **מתאם** | הסשן הראשי | מחלק משימות, ממזג PRs, מריץ את שער הגל, ומעדכן את טבלת המצב. **רק הוא עורך את הקובץ הזה** |
| **מבצע** | סוכן לכל משימה | עובד ב-worktree וב-branch משלו, נוגע **רק** בקבצים שבבעלות המשימה, ופותח PR |
| **סוקר** | סוכן נפרד | סוקר כל PR לפני merge: נכונות, הצ׳קליסט של SECURITY.md §6, ובדיקה שה-"גמור כש" באמת מתקיים |

### גלים
- משימות באותו גל **לא תלויות זו בזו** ואפשר להריץ אותן במקביל. מומלץ עד 5 מבצעים בבת אחת.
- גל חדש מתחיל רק אחרי **שער הגל** הקודם: הכול מוזג ל-`main`, ה-CI ירוק, והבדיקות של השער עברו.
- גל 0 הוא **CI/CD ובדיקות אבטחה**, והוא בא לפני כל קוד של פיצ׳רים.

### בעלות על קבצים (כדי שלא יהיו התנגשויות)
- לכל משימה יש רשימת **בעלות**. מבצע לא נוגע בקבצים מחוץ לה. אם צריך, הוא עוצר ומדווח למתאם.
- המבנה תוכנן כך שכל אחד מוסיף קבצים משלו ולא עורך קובץ משותף:
  | משאב משותף | איך נמנעת התנגשות |
  |---|---|
  | `docker-compose.yml` | משתמש ב-`include:` לקבצי `services/<x>/compose.yml`. ‏T10 יוצר את כל ה-stubs מראש |
  | routes ב-gateway | ‏`@fastify/autoload` מ-`gateway/src/routes/<domain>/` |
  | עמודי web | ‏`import.meta.glob('./pages/*/route.tsx')` |
  | תרגומים | namespace לכל עמוד: ‏`web/src/i18n/{he,en}/<page>.json` |
  | טסטי אבטחה | קובץ לכל ST: ‏`tests/security/stNN-*.test.ts` |
  | חוזים (`packages/shared`) | קובץ לכל domain. שינוי בחוזה = PR קטן נפרד שממוזג קודם |

### קומיטים כמו של מפתח אמיתי
- **branch לכל משימה:** ‏`t13-sessions-service`, שנוצר מ-`main` העדכני
- **קומיטים קטנים ולוגיים**, בדרך כלל 3–8 למשימה. כל קומיט עושה דבר אחד, נבנה, ועובר טסטים. למשל:
  ```
  feat(sessions): add apps and sessions tables
  feat(sessions): merge consecutive samples into sessions
  test(sessions): cover gaps, idle and out-of-order samples
  feat(sessions): expose GET /sessions
  docs(sessions): document merge rules
  ```
- **Conventional Commits** באנגלית: ‏`feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `build`, `security`. ‏scope = שם החבילה. ‏commitlint אוכף את זה
- גוף ההודעה מסביר **למה** כשזה לא מובן מאליו
- בלי `WIP`, ובלי שרשרת של "fix typo": מתקנים ב-amend לפני push
- **PR לכל משימה** לפי התבנית: מה ולמה, איך נבדק, צ׳קליסט אבטחה, ובדיקות ST שהופעלו
- merge ב-rebase (שומר על הקומיטים), רק אחרי CI ירוק ואישור הסוקר

---

## מצב

| גל | משימות | שער |
|---|---|---|
| 0 · CI/CD ואבטחה | [ ] T01 [ ] T02 [ ] T03 [ ] T04 [ ] T05 [ ] T06 [ ] T07 | G0 |
| 1 · חוזים ותשתית | [ ] T08 [ ] T09 [ ] T10 [ ] T11 [ ] T12 | G1 |
| 2 · יחידות עצמאיות | [ ] T13 [ ] T14 [ ] T15 [ ] T16 [ ] T17 [ ] T18 [ ] T19 [ ] T20 [ ] T21 [ ] T22 [ ] T23 [ ] T24 [ ] T25 [ ] T26 | G2 |
| 3 · חיבורים | [ ] T27 [ ] T28 [ ] T29 [ ] T30 [ ] T31 [ ] T32 [ ] T33 [ ] T34 [ ] T35 [ ] T36 [ ] T37 [ ] T38 [ ] T39 [ ] T40 [ ] T41 | G3 |
| 4 · השלמות | [ ] T42 [ ] T43 [ ] T44 [ ] T45 [ ] T46 [ ] T47 [ ] T48 [ ] T49 [ ] T50 [ ] T51 | G4 |
| 5 · שחרור | [ ] T52 [ ] T53 [ ] T54 [ ] T55 | G5 = v1.0.0 |

---

## גל 0 · CI/CD ובדיקות אבטחה (לפני כל פיצ׳ר)

T01 ← T02 ← (T03 ‖ T04 ‖ T05) ← T06 ← T07

### T01 · שלד הריפו ומוסכמות
- **בעלות:** קבצי root, ‏`packages/` (ריק), ‏`.github/pull_request_template.md`
- **מה:**
  - npm workspaces (`agent`, `web`, `gateway`, `services/*`, `packages/*`), ‏`tsconfig.base.json` במצב strict, ‏ESLint (כולל `eslint-plugin-security` ו-`no-unsanitized`) ו-Prettier
  - ‏`.npmrc` עם `ignore-scripts=true` ו-`engine-strict`. ‏`.nvmrc` (22). ‏`.editorconfig`
  - ‏`.gitignore`: ‏node_modules, dist, `.env*` חוץ מ-`.env.example`, ‏`backups/`, ‏`data/`, ‏coverage
  - ‏commitlint + simple-git-hooks. תבנית PR עם הצ׳קליסט של SECURITY.md §6
  - חוקי ESLint מקומיים: איסור `shell: true`, איסור `dangerouslySetInnerHTML`, ואיסור template string בתוך `query(`
  - ‏`scripts/check-language.ts`: נכשל על עברית בכל קובץ חוץ מקבצי תרגום ו-`docs/`
  - ‏`README.md` ראשוני באנגלית: מה זה, ארכיטקטורה, סטטוס ואיך מתחילים. ‏T55 מרחיב אותו
- **גמור כש:**
  - [ ] `npm ci && npm run check` עוברים
  - [ ] קומיט עם הודעה לא תקנית נחסם

### T02 · סודות והגנות קומיט
- **בעלות:** ‏`scripts/setup.ts`, ‏`.env.example`, ‏`.gitleaks.toml`, ‏hook של pre-commit
- **מה:**
  - `npm run setup` יוצר `.env` בהרשאות `0600` עם סיסמת DB לכל סרוויס ו-`AGENT_TOKEN` (crypto, ‏32 בתים), ולא דורס ערכים קיימים
  - ‏pre-commit מריץ `gitleaks protect --staged` וחוסם כל קובץ `.env*` חוץ מ-`.env.example`
- **גמור כש:**
  - [ ] ניסיון לקמט `.env` או מחרוזת שנראית כמו טוקן נחסם
  - [ ] הרצה שנייה של `setup` לא משנה כלום
  - [ ] ההרשאה של `.env` היא `0600`

### T03 · CI: שערי איכות ‖
- **בעלות:** ‏`.github/workflows/ci.yml`
- **מה:**
  - שלבים: ‏`npm ci`, ‏lint, ‏typecheck, ‏unit tests עם כיסוי (סף **80%** ל-`services/*/src/domain` ול-`agent/src/core`, ‏60% לשאר), ו-build
  - ‏`permissions: contents: read`, ‏`concurrency`, ‏timeout לכל job. כל action נעול ל-SHA
- **גמור כש:**
  - [ ] ה-CI ירוק
  - [ ] הורדת כיסוי מתחת לסף מפילה את ה-CI

### T04 · CI: שערי אבטחה ‖
- **בעלות:** ‏`.github/workflows/security.yml`, ‏`.github/dependabot.yml`, ‏`.semgrep/`, ‏`.trivyignore` (ריק), ‏`.github/codeql/`
- **מה:** כל הכלים מ-SECURITY.md §4. כולם חוסמים. דוחות SARIF עולים ל-Security tab. ‏Dependabot ל-npm, ‏docker ו-actions, שבועי. ‏nightly cron. ‏Scorecard שבועי
- **גמור כש:**
  - [ ] PR דמה עם סוד, עם `shell:true` או עם תלות פגיעה **נכשל**. מתעדים ב-PR שזה נבדק
  - [ ] ‏zizmor ו-actionlint נקיים

### T05 · תשתית בדיקות אבטחה ‖
- **בעלות:** ‏`tests/security/`, ‏`scripts/security-todo.ts`
- **מה:**
  - חבילת vitest שבה כל ST01–ST19 מ-SECURITY.md §3 מופיעים, כל אחד בקובץ משלו
  - **ST01 ו-ST02 פעילות כבר עכשיו:** ‏ST01 מנתח את `docker compose config --format json` ובודק את המדיניות
  - השאר מוגדרות כ-`it.todo('…', { owner: 'T19' })`
  - ‏`npm run security:todo` מדפיס רשימה לפי משימה, ונכשל עם `--strict`
  - הבדיקות רצות ב-CI בכל PR
- **גמור כש:**
  - [ ] הוספת `ports: ["4712:4712"]` או הסרת `read_only` ב-compose מפילה את ST01

### T06 · CD: שחרור חתום
- **תלוי ב:** T03, ‏T04, ‏T05
- **בעלות:** ‏`.github/workflows/release.yml`, ‏`.github/workflows/main.yml`
- **מה:**
  - **ב-push ל-main:** בניית כל ה-images, ‏Trivy image (ST19), ‏`docker compose up` ב-runner, ובדיקות smoke ואבטחה מול ה-compose הרץ
  - **בתג `v*.*.*`:**
    - ‏`npm run security:todo --strict` (שום todo לא נשאר)
    - בנייה, ‏Trivy, ‏SBOM (syft, ‏SPDX), חתימה keyless עם cosign דרך OIDC, ו-provenance attestation
    - push ל-GHCR כ-package פרטי
    - GitHub Release עם changelog מהקומיטים, SBOM, ו-`docker-compose.release.yml` שנעול ל-digests
  - ‏ZAP baseline (ST18) מתווסף בגל 5. עד אז ה-job קיים ומדולג במפורש עם הפניה ל-T52
  - בלי סודות חוץ מ-`GITHUB_TOKEN`, עם `permissions` מינימליות לכל job
- **גמור כש:**
  - [ ] תג `v0.0.1` על השלד מייצר release חתום
  - [ ] `cosign verify` עובר

### T07 · הגנות על הריפו ב-GitHub
- **תלוי ב:** T06
- **בעלות:** ‏`scripts/github-protect.sh`, ‏`docs/REPO-SETTINGS.md`
- **מה:**
  - סקריפט `gh api` שמגדיר: ריפו פרטי, ‏branch protection ל-`main` (PR חובה, כל הבדיקות חובה, היסטוריה ליניארית, בלי force push), ‏secret scanning, ‏push protection, ‏Dependabot alerts, ו-Actions רק מ-allowlist
  - **המתאם מריץ את הסקריפט רק אחרי אישור מפורש של המשתמש**
- **גמור כש:**
  - [ ] אחרי הרצה: push ישיר ל-main נדחה

**שער G0:**
- [ ] CI, אבטחה ו-CD ירוקים על השלד
- [ ] release ‏v0.0.1 חתום
- [ ] ST01 ו-ST02 פעילות, ושאר הבדיקות רשומות כ-todo עם בעלים

---

## גל 1 · חוזים ותשתית (5 במקביל)

### T08 · חוזים (`packages/shared`)
- **בעלות:** ‏`packages/shared/`
- **מה:**
  - סכמות zod לכל ה-payloads ב-SPEC §5, קובץ לכל domain: ‏ingest, sessions, reports, goals, battery, system, focus, settings, alerts
  - **route map** ‏(`routes.ts`): ‏method, ‏path, ‏auth, ‏req ו-res לכל endpoint ב-`/v1`. ‏ST03 ו-ST08 נגזרות ממנו
  - fixtures ו-MSW handlers לכל route, כדי שה-web יוכל לעבוד בלי backend
  - מפתחות i18n להתראות
- **גמור כש:**
  - [ ] כל route ב-SPEC מופיע ב-route map
  - [ ] יש טסטים ל-parse תקין ולא תקין

### T09 · service-kit ‏‖
- **בעלות:** ‏`packages/service-kit/`, ‏`docker/Dockerfile.service`
- **מה:**
  - `createService()`: ‏Fastify, ‏pino עם redaction (A11), קונפיג zod, ‏`/health` שבודק גם DB, ‏pg pool עם המשתמש של הסרוויס, ‏node-pg-migrate, ‏validation אוטומטי של req ו-res מול החוזה, ‏graceful shutdown
  - ‏Dockerfile רב-שלבי: base נעול ל-digest, ‏`USER node`, ‏rootfs שעובד במצב read-only, ו-`HEALTHCHECK`
  - מפעיל: **ST11**
- **גמור כש:**
  - [ ] סרוויס דמה עולה ב-read-only כ-non-root
  - [ ] hadolint נקי

### T10 · compose ו-Postgres ‏‖
- **בעלות:** ‏`docker-compose.yml`, ‏`infra/postgres/`, ‏`services/*/compose.yml` (stubs בלבד)
- **מה:**
  - ‏`x-service-defaults` עם `read_only`, ‏`cap_drop: [ALL]`, ‏`security_opt: [no-new-privileges:true]`, ‏`tmpfs`, ‏`mem_limit`, ‏`cpus` ו-`restart`
  - רשת `core` עם `internal: true`, ורשת `edge` רק ל-gateway ול-web
  - ‏Postgres 16 נעול ל-digest. סקריפט init שיוצר role וסכמה לכל סרוויס מ-`.env`, ‏`REVOKE` על public, ומגביל כל role ל-`search_path` שלו
  - ‏`include:` לכל הסרוויסים כ-stubs. פורטים: רק `127.0.0.1:4710` ו-`127.0.0.1:4711`
  - מפעיל: **ST16** (כבדיקת אינטגרציה)
- **גמור כש:**
  - [ ] ST01 ירוקה
  - [ ] ‏`ss -tln` מראה רק 4710 ו-4711, ושניהם על 127.0.0.1

### T11 · שלד web ‏‖
- **בעלות:** ‏`web/` (חוץ מ-`web/src/pages/*` ו-`web/src/components/*`)
- **מה:**
  - Vite, ‏React, ‏TS, ‏Router עם glob, ‏TanStack Query, ו-api client מתוך החוזים
  - ‏react-i18next עם namespaces, ו-`dir` ו-`lang` על `<html>`
  - ערכת צבעים system, light או dark (רק המנגנון, בלי tokens)
  - ‏MSW במצב dev
  - ‏nginx-unprivileged עם CSP קשוח ו-security headers
  - ‏lint שאוסר CSS פיזי (left, right וכו׳)
  - מפעיל: **ST07** (חלק ה-web)
- **גמור כש:**
  - [ ] החלפת שפה הופכת את כיוון הממשק
  - [ ] אין שגיאות CSP בקונסול

### T12 · שלד agent ‏‖
- **בעלות:** ‏`agent/src/core/`, ‏`agent/package.json`
- **מה:**
  - scheduler, ‏config, ‏buffer ב-JSONL עם תקרה של 50MB, תיקיות ב-`0700` וקבצים ב-`0600`
  - pino עם redaction
  - ממשק אחיד ל-collectors ול-actuators (registry שנטען לפי תיקייה)
  - מפעיל: **ST11** (agent), ‏**ST15** (state)
- **גמור כש:**
  - [ ] יש טסטים ל-buffer
  - [ ] ההרשאות נבדקות בטסט

**שער G1:**
- [ ] `docker compose up -d` עולה וכל הקונטיינרים healthy
- [ ] ה-web רץ על MSW
- [ ] ST01, ‏ST02, ‏ST07 (web), ‏ST11, ‏ST15 ו-ST16 ירוקות

---

## גל 2 · יחידות עצמאיות (עד 5 במקביל מתוך 14)

כל סרוויס בבעלות `services/<x>/` (כולל ה-`compose.yml` שלו). כל collector בבעלות `agent/src/collectors/<x>/`.

### T13 · sessions-service
- **מה:**
  - איחוד דגימות לסשנים: פער מעל 15 שנ׳ או idle סוגר סשן
  - טבלאות `apps`, ‏`sessions` ו-`category_rules`, עם חוקי ברירת מחדל והחלה מחדש על 30 יום
  - API לפי SPEC
  - מפעיל: **ST12**
- **גמור כש:**
  - [ ] יש טסטים: רצף, החלפת אפליקציה, פער, idle, דגימות לא לפי הסדר, ועדיפות חוקים

### T14 · reports-service
- **מה:** rollups, ‏focus streaks, ו-weekly summary. מפעיל: **ST12**
- **גמור כש:**
  - [ ] יש טסט ל-rollup שחוצה חצות

### T15 · goals-service
- **מה:** CRUD, ‏`/evaluate` עם התראה אחת לכל יעד ביום, ו-`/progress`. מפעיל: **ST12**

### T16 · battery-service
- **מה:** samples, ‏daily, בריאות, זמן נותר, ‏`power-by-app` והתראות. מפעיל: **ST12**
- **גמור כש:**
  - [ ] יש טסטים לחישוב בריאות ולשיוך צריכה לאפליקציה

### T17 · system-service
- **מה:** incidents עם סף של 15 שנ׳, ‏culprits, זליגת זיכרון, ו-critical ל-OOM. מפעיל: **ST12**
- **גמור כש:**
  - [ ] יש טסטים: קפיצה קצרה לא פותחת incident, ועומס מתמשך פותח incident אחד

### T18 · focus-service
- **מה:** מצב, פרופילים (כולל "השתק אפליקציות חדשות"), חריגים, לוחות זמנים, ‏`alert_policy`, ‏`/route`, ‏rate limit, תור, סיכום ביציאה, ו-known-apps. מפעיל: **ST12**
- **גמור כש:**
  - [ ] יש טסטים לטבלה של 3 רמות × בפוקוס/לא, ל-rate limit, לסיכום ולחריגים

### T19 · gateway: ליבה ואבטחה
- **בעלות:** ‏`gateway/src/core/`, ‏`gateway/compose.yml`
- **מה:**
  - Bearer ל-agent עם `timingSafeEqual`
  - session cookie עם CSRF token
  - allowlist ל-Host ובדיקת Origin, ‏CORS, ‏rate limit, ‏body limit, ‏helmet/CSP
  - autoload ל-routes
  - service client עם timeout של 3 שנ׳ ותשובה חלקית (degraded)
  - validation של כל req מול החוזה
  - מפעיל: **ST03–ST10**
- **גמור כש:**
  - [ ] כל בדיקות ST שבאחריות T19 ירוקות

### T20 · collector: חלון פעיל
- **מה:** Window Calls דרך D-Bus. אם התוסף חסר: אזהרה, בלי קריסה

### T21 · collector: סרק ונעילה
- **מה:** IdleMonitor, ונעילת מסך שעוצרת את כל הדגימות

### T22 · collector: סוללה
- **מה:** קריאת `/sys/class/power_supply`, ונטרול אוטומטי כשאין סוללה

### T23 · collector: עומס ותהליכים
- **מה:** PSI, ו-snapshot של התהליכים רק בעומס. **רק `comm`**. מפעיל: **ST17** (cmdline)
- **גמור כש:**
  - [ ] ה-overhead נמדד בטסט

### T24 · collector: טמפרטורה ו-cgroup
- **מה:** thermal ו-throttle. מיפוי לקונטיינר דרך cgroup, **בלי docker socket** כברירת מחדל

### T25 · collector: גילוי אפליקציות
- **מה:** inotify על תיקיות `.desktop`, ‏gsettings monitor, חישוב notification-id, ואפליקציות Chrome כנפרדות
- **גמור כש:**
  - [ ] התקנה חדשה מזוהה תוך 5 שנ׳

### T26 · web: tokens ורכיבים
- **בעלות:** ‏`web/src/theme/`, ‏`web/src/components/`, ‏`web/src/pages/dev-components/`
- **מה:**
  - tokens בדיוק לפי DESIGN.md, וכל הרכיבים מ-DESIGN.md
  - דף `/dev/components` בשני המצבים ובשתי השפות
  - בדיקה ב-CI שאין hex מחוץ ל-`tokens.css`

**שער G2:**
- [ ] כל הסרוויסים healthy
- [ ] contract tests: כל תשובה של סרוויס עוברת validation מול החוזה
- [ ] ST03–ST12, ‏ST16 ו-ST17 ירוקות

---

## גל 3 · חיבורים (עד 5 במקביל מתוך 15)

### Gateway (כל משימה בבעלות `gateway/src/routes/<domain>/`)
- **T27 · זרימת ingest:** פיצול לסרוויסים, סשנים סגורים ל-reports ול-goals, איסוף alerts, ‏focus ‏`/route`, ותשובה `{notify, mute}`. טסט אינטגרציה מול compose. מפעיל: **ST08** (ingest)
- **T28 · routes של dashboard, reports, apps, rules ו-goals:** כולל aggregation של `today`. מפעיל: **ST08**
- **T29 · routes של battery ו-system:** כולל העברת ציר הסשנים ל-`power-by-app`. מפעיל: **ST08**
- **T30 · routes של focus:** ‏start ו-stop, פקודות mute ושחזור, ו-known-apps. מפעיל: **ST08**
- **T31 · settings:** סכמה `gateway.settings` (שפה, ערכת צבעים, פרטיות, ספים, אפליקציות מערכת, שעות שקטות). מפעיל: **ST08**

### Agent (כל משימה בבעלות `agent/src/actuators/<x>/` או `agent/src/sender/`)
- **T32 · שליחה:** מנה כל 60 שנ׳, ‏backoff, מחיקה רק אחרי 2xx, וטיפול בתשובה
  - **גמור כש:** [ ] כיבוי הדוקר לשעה לא מאבד נתונים
- **T33 · notifier:** ‏D-Bus Notify עם urgency, טקסט מתורגם (‏`agent/src/i18n/`), ופעולה "פתח דשבורד"
- **T34 · muter בטוח:** ‏execFile, ‏regex ל-app-id, ‏allowlist של אפליקציות מערכת, ושמירה ושחזור של state. מפעיל: **ST14**
  - **גמור כש:** [ ] אחרי `kill -9` באמצע פוקוס, הכול משוחזר

### Web (כל משימה בבעלות `web/src/pages/<x>/` ו-namespace משלה)
- **T35 · היום:** מפעיל: **ST13** (XSS בכותרת)
- **T36 · אפליקציות וחוקים:** כולל תצוגה מקדימה של "על מה החוק חל"
- **T37 · יעדים**
- **T38 · סוללה:** מגמה, מחזורים, "מה שורף לי סוללה", וזמן נותר
- **T39 · מערכת:** גרף מסונכרן עם ציר האפליקציות, ‏incidents, אשמים קבועים וספים
- **T40 · מצב עבודה והתראות:** פרופילים, אפליקציות עם תג "חדש", חריגים, לוחות זמנים, מרכז התראות, ‏FocusBanner, ומדיניות רמות
- **T41 · הגדרות:** שפה, ערכת צבעים, פרטיות, ספים, אפליקציות מערכת ושעות שקטות

**שער G3:**
- [ ] **E2E ידני:** ‏agent אמיתי ← הנתונים מופיעים בעמוד "היום"
- [ ] פוקוס משתיק את Telegram, ואחרי העצירה הוא משוחזר
- [ ] כל עמוד נבדק בעברית, באנגלית, בבהיר ובכהה
- [ ] ST08, ‏ST13 ו-ST14 ירוקות

---

## גל 4 · השלמות (עד 5 במקביל מתוך 10)

- **T42 · systemd user service:** התקנה והסרה, ובדיקה שהתוסף Window Calls מותקן
  - **גמור כש:** [ ] ה-agent עולה אחרי login וחוזר אחרי `kill -9`
- **T43 · עמוד "שבוע":** עמודות לפי יום וקטגוריה, השוואה לשבוע קודם, וסיכום שבועי
- **T44 · "נא לא להפריע" של GNOME:** אופציונלי לפי פרופיל, עם אותו מנגנון שמירה ושחזור. בעלות: ‏`agent/src/actuators/dnd/`
- **T45 · טריגרים אוטומטיים לפוקוס:** לוח זמנים, ואפליקציה בפוקוס יותר מ-N דק׳. בעלות: ‏`services/focus/src/triggers/`
- **T46 · Pomodoro:** בעלות: ‏`services/focus/src/pomodoro/` וקומפוננטה ב-`web/src/pages/focus/pomodoro/`
- **T47 · השהיה ופרטיות:** השהיה, "לא לשמור כותרות", ואפליקציות מוחרגות שלא נשלחות בכלל. מפעיל: **ST17** (כותרות)
- **T48 · ייצוא וגיבוי:** CSV/JSON עם session, ו-`npm run backup` ב-`0600`. מפעיל: **ST15** (backups)
- **T49 · ניקוי נתונים ישנים:** קובץ `src/jobs/retention.ts` בכל סרוויס, כולל לוג של מה נמחק
- **T50 · אייקון בשורת המשימות:** StatusNotifierItem. בעלות: ‏`agent/src/tray/`
- **T51 · CLI:** בעלות: ‏`agent/src/cli/`

**שער G4:**
- [ ] כל הפיצ׳רים מטבלת הכיסוי מסומנים
- [ ] ‏`npm run security:todo` מראה רק את ST18

---

## גל 5 · שחרור

- **T52 · E2E ו-DAST:**
  - Playwright מול compose עם agent מדומה: כל העמודים, שתי שפות, שני מצבים, ופוקוס
  - ZAP baseline ב-CD. מפעיל: **ST18**
- **T53 · תקציב סוללה:** סקריפט שמודד במשך שעה את ה-CPU וה-RSS של ה-agent ואת צריכת הקונטיינרים בסרק. **נכשל אם עוברים את SPEC §4.4**
- **T54 · סקירת אבטחה מלאה:**
  - סוכן נפרד עובר על כל SECURITY.md
  - ניסיונות תקיפה ידניים: ‏DNS rebinding, ‏CSRF מאתר אחר, גישה מה-LAN, הזרקה ל-muter ו-XSS בכותרת
  - ‏`docker inspect` לכל קונטיינר
  - דוח ב-`docs/security-review-v1.md`. כל ממצא מקבל תיקון או החלטה מתועדת
- **T55 · README מפורט באנגלית (לתיק עבודות):** פסקת פתיחה, צילומי מסך ו-GIF בשני המצבים ובשתי השפות, דיאגרמת ארכיטקטורה, החלטות הנדסיות ולמה (ADR קצרים ב-`docs/adr/`), אבטחה, ‏CI/CD, התקנה מאפס, פתרון תקלות, ואיך מאמתים חתימה של release

**שער G5:**
- [ ] ‏`security:todo --strict` עובר
- [ ] כל ה-CI ירוק
- [ ] תג `v1.0.0` ← release חתום

---

## מטריצת כיסוי: כל דרישה ← משימה

| דרישה | משימות |
|---|---|
| מעקב חלון פעיל | T20, T13, T27 |
| סרק ונעילת מסך | T21, T13 |
| קטגוריות וחוקים | T13, T36 |
| עמודי "היום", "שבוע" ו"אפליקציות" | T35, T43, T36 |
| פוקוס רציף (streaks) | T14, T35 |
| סיכום שבועי | T14, T43, T33 |
| יעדים והתראת חריגה | T15, T28, T37 |
| בריאות סוללה, מחזורים וקצב פריקה | T22, T16, T29, T38 |
| "מה שורף לי סוללה" | T16, T29, T38 |
| התראות סוללה (15%, 8%, ‏100% לאורך זמן) | T16, T27, T33 |
| עומס PSI ואירועי חנק | T23, T17, T29, T39 |
| מי הכי כבד (כולל קונטיינרים) | T23, T24, T17 |
| טמפרטורה ו-throttle | T24, T17 |
| זליגת זיכרון | T17 |
| התראה קופצת למחשב | T33, T27 |
| רמות critical, important ו-normal | T18, T41 |
| rate limit להתראות | T18 |
| מצב עבודה: ידני, משך, עד שעה | T18, T30, T40, T51 |
| מצב עבודה: לוח זמנים ואוטומטי | T45 |
| Pomodoro | T46 |
| השתקה לכל אפליקציה, פרופילים וחריגים | T18, T30, T34, T40 |
| אף פעם לא להשתיק אפליקציות מערכת | T34, T41 |
| שחזור אחרי קריסה | T34 |
| גילוי אוטומטי של אפליקציות חדשות | T25, T18, T40 |
| אפליקציות Chrome בנפרד | T25 |
| "נא לא להפריע" של GNOME | T44 |
| סיכום ביציאה מפוקוס | T18, T33 |
| i18n עברית ואנגלית, ‏RTL | T08, T11, T33, כל עמודי web |
| בהיר, כהה ו-system | T11, T26, T41 |
| עיצוב "נייר ודיו" | T26 + כל עמודי web |
| השהיה ופרטיות | T47, T41 |
| ייצוא וגיבוי | T48 |
| ניקוי נתונים ישנים | T49 |
| buffer מקומי (דוקר כבוי) | T12, T32 |
| תקציב סוללה | T21, T23, T53 |
| systemd, אייקון ו-CLI | T42, T50, T51 |
| healthchecks | T09, T10 |
| רק 2 פורטים על 127.0.0.1 | T10, ST01 |
| בלי סודות בגיט | T02, T04, T07, ST02 |
| CI/CD עם בדיקות ואבטחה מחמירה | T03–T07, T52 |
| README | T55 |
