# Yoman: אבטחה ופרטיות

Yoman אוסף מידע רגיש מאוד: מה עשית במחשב בכל רגע, כותרות חלונות (שמות מסמכים, אתרים, שיחות) ורשימות תהליכים.
**ההנחה:** דליפה של הנתונים האלה חמורה כמו דליפה של היסטוריית הדפדפן. כל החלטה בפרויקט נבחנת מול המסמך הזה.

**עיקרון:** אבטחה נאכפת אוטומטית ב-CI. בדיקה אדומה חוסמת merge, ואין `continue-on-error`. חריגה מותרת רק עם קובץ allowlist מתועד, שכולל סיבה ותאריך תפוגה.

## 1. נכסים
| נכס | רגישות |
|---|---|
| היסטוריית חלונות וכותרות | **גבוהה מאוד** |
| רשימות תהליכים | גבוהה (שורות פקודה יכולות לכלול טוקנים) |
| `AGENT_TOKEN`, סיסמאות DB | גבוהה |
| הגדרות השתקה של GNOME | בינונית (שיבוש = פספוס הודעות) |
| נתוני סוללה ועומס | נמוכה |

## 2. איומים והגנות

| # | איום | הגנה | משימה | בדיקה |
|---|---|---|---|---|
| A1 | **סודות מגיעים לגיטהאב** | `.env` ב-`.gitignore`. ‏gitleaks ב-pre-commit וב-CI על כל ההיסטוריה. ‏`npm run setup` מייצר ערכים אקראיים. רק placeholders ב-`.env.example` | T02, T04 | ST02 |
| A2 | **API חשוף לרשת המקומית** | פורטים רק על `127.0.0.1`. הסרוויסים הפנימיים ברשת `internal: true` | T10 | ST01 |
| A3 | **אתר זדוני שולח בקשות ל-localhost** (CSRF) | cookie ‏`HttpOnly; SameSite=Strict`, טוקן CSRF לכל בקשה שמשנה נתונים, בדיקת `Origin`, ‏CORS רק ל-4710 | T19 | ST05, ST06 |
| A4 | **DNS rebinding** | allowlist של `Host`: רק `127.0.0.1:4711` ו-`localhost:4711`, אחרת 421 | T19 | ST04 |
| A5 | **תהליך מקומי מתחזה ל-agent** | Bearer `AGENT_TOKEN` (32 בתים), ‏`.env` ב-`0600`, השוואה ב-`timingSafeEqual` | T02, T19 | ST03, ST15 |
| A6 | **XSS דרך כותרת חלון** (כותרת = קלט מבחוץ) | React escaping בלבד, lint שאוסר `dangerouslySetInnerHTML`, ‏CSP ‏`default-src 'self'` בלי inline | T11, T26 | ST07, ST13 |
| A7 | **הזרקת פקודות ב-muter** | רק `execFile` עם מערך ארגומנטים. ‏app-id נבדק מול `^[a-zA-Z0-9._-]{1,128}$` | T34 | ST14 |
| A8 | **SQL injection** | רק שאילתות עם פרמטרים. lint שאוסר template string בתוך `query()` | T09 | ST12 |
| A9 | **סרוויס פרוץ קורא נתונים של אחר** | משתמש DB לכל סרוויס, עם הרשאות רק לסכמה שלו. ‏`REVOKE ALL ON SCHEMA public` | T10 | ST16 |
| A10 | **פריצה מקונטיינר** | non-root, ‏`read_only`, ‏`cap_drop: [ALL]`, ‏`no-new-privileges`, ‏`tmpfs: /tmp`, מגבלות CPU וזיכרון, בלי docker socket | T09, T10 | ST01, ST19 |
| A11 | **מידע רגיש בלוגים** | redaction ב-pino: ‏`authorization`, `cookie`, `title`, `cmdline`, `token`, `password` | T09, T12 | ST11 |
| A12 | **סודות בשורות פקודה של תהליכים** | ה-agent שולח רק `comm`, לעולם לא `cmdline` | T23 | ST17 |
| A13 | **תלות זדונית** (supply chain) | ‏`npm ci`, ‏`ignore-scripts=true`, ‏audit, ‏OSV, ‏Dependabot, ‏dependency-review, ‏Actions נעולים ל-SHA, ‏images נעולים ל-digest, ‏SBOM וחתימה | T01, T04, T06 | ST19, CI |
| A14 | **אפליקציה נשארת מושתקת אחרי קריסה** | שמירת state לפני שינוי ושחזור בעלייה | T34 | טסט T34 |
| A15 | **docker socket = הרשאות root** | ה-agent לא דורש קבוצת `docker`. מיפוי דרך שמות cgroup. ה-socket אופציונלי וכבוי כברירת מחדל | T24 | ST01 |
| A16 | **גיבויים וייצוא פתוחים** | ‏`backups/` ב-`.gitignore` ובהרשאות `0600`. ייצוא רק עם session | T48 | ST03, ST15 |
| A17 | **הצפת API** | rate limit: ‏ingest פעם ב-10 שנ׳, ‏web ‏300 בקשות לדקה. ‏body limit של 1MB | T19 | ST09, ST10 |
| A18 | **קלט לא צפוי מפיל סרוויס** | zod בכל גבול. fuzzing לכל route | T19 | ST08 |
| A19 | **CI/CD עצמו נפרץ** | הרשאות `contents: read` כברירת מחדל, בלי `pull_request_target`, ‏zizmor ו-actionlint, חתימה keyless עם OIDC בלי מפתחות שמורים | T03–T06 | CI |

## 3. בדיקות אבטחה אוטומטיות (`tests/security/`)

משימה T05 יוצרת את כל הבדיקות כ-`it.todo` עם מזהה המשימה האחראית.
**כל משימה שמופיעה בעמודה "מפעילה" חייבת להפוך את ה-todo לבדיקה אמיתית באותו PR.**
ה-CD נכשל אם נשאר todo אחד (`npm run security:todo`). ככה אי אפשר לשכוח בדיקה.

| # | בדיקה | מפעילה |
|---|---|---|
| ST01 | **Compose policy:** רק 2 פורטים, ושניהם על 127.0.0.1. כל סרוויס עם non-root, ‏read_only, ‏cap_drop ALL, ‏no-new-privileges ומגבלת זיכרון. אין mount של docker.sock. ‏images נעולים ל-digest | T05 (פעילה מההתחלה) |
| ST02 | סודות: ‏gitleaks נקי, ‏`.env` לא במעקב גיט, ‏`.env.example` רק עם placeholders | T05 (פעילה מההתחלה) |
| ST03 | **אימות:** כל route ב-route map של החוזים, בלי טוקן או session ← 401. נגזר אוטומטית, כך ש-route חדש מכוסה לבד | T19 |
| ST04 | ‏Host זר ← 421 | T19 |
| ST05 | בקשה משנה בלי CSRF או עם Origin זר ← 403 | T19 |
| ST06 | ‏CORS: ‏origin זר לא מקבל `Access-Control-Allow-Origin` | T19 |
| ST07 | headers: ‏CSP, ‏`X-Content-Type-Options`, ‏`Referrer-Policy: no-referrer`, ‏`frame-ancestors 'none'` ב-web וב-gateway | T11, T19 |
| ST08 | **fuzzing:** לכל route, ‏500 קלטים לא תקינים (fast-check מתוך סכמת zod) ← תמיד 400 ואף פעם לא 500 | T19 + כל משימת route |
| ST09 | rate limit ← 429 | T19 |
| ST10 | body גדול מ-1MB ← 413 | T19 |
| ST11 | **redaction:** טוקן וכותרת שהוזרקו לא מופיעים בפלט הלוג | T09, T12 |
| ST12 | payloads של SQL injection בכל פרמטר ← אין שגיאת DB ואין דליפה | T13–T18 |
| ST13 | **XSS:** כותרת `<img src=x onerror=…>` מוצגת כטקסט (Playwright) | T35 |
| ST14 | ‏muter: ‏app-id עם `;`, `$()` או רווח נדחה, ו-`execFile` נקרא בלי shell | T34 |
| ST15 | הרשאות: ‏`.env`, ‏state ו-backups נוצרים ב-`0600`/`0700` | T02, T12, T48 |
| ST16 | ‏least privilege: משתמש DB של סרוויס לא מצליח לקרוא סכמה של סרוויס אחר | T10 |
| ST17 | ה-agent לא שולח `cmdline` ולא שולח כותרת כשההגדרה כבויה | T23, T47 |
| ST18 | **DAST:** ‏OWASP ZAP baseline מול compose רץ. ‏0 ממצאים ברמת Medium ומעלה | T52 |
| ST19 | **סריקת images:** ‏Trivy, ‏0 ממצאים HIGH או CRITICAL שיש להם תיקון | T06 |

## 4. שערי אבטחה ב-CI (חוסמים)
| כלי | מה בודק | מתי |
|---|---|---|
| gitleaks | סודות בכל ההיסטוריה | כל PR, ‏push ו-nightly |
| npm audit (`--audit-level=moderate`) + OSV-Scanner | תלויות פגיעות | כל PR ו-nightly |
| dependency-review-action | תלות חדשה פגיעה או ברישיון אסור (GPL/AGPL) | כל PR |
| CodeQL (javascript-typescript, ‏security-extended) | ניתוח קוד סטטי | כל PR ו-weekly |
| Semgrep (‏`p/owasp-top-ten`, ‏`p/nodejs`, ‏`p/typescript`, ‏`p/react`, ‏`p/docker-compose` + חוקים מקומיים) | דפוסים מסוכנים | כל PR |
| hadolint | Dockerfiles | כל PR |
| Trivy config + fs | ‏misconfig ותלויות | כל PR |
| Trivy image | ‏images שנבנו | כל PR, ‏release ו-nightly |
| actionlint + zizmor | אבטחת ה-workflows עצמם | כל PR |
| Biome (`biome ci`) + חוקי GritQL ב-`biome-plugins/` | ‏`shell:true`, ‏`dangerouslySetInnerHTML`, ‏template SQL, ‏`exec`, ‏`eval`, ‏`any` | כל PR |
| tests/security (ST01–ST17) | ההתנהגות בפועל | כל PR |
| ZAP baseline (ST18) | ‏DAST | nightly ו-release |
| OpenSSF Scorecard | בריאות הריפו | weekly |

## 5. הרשאות קבצים
| נתיב | הרשאה |
|---|---|
| `.env` | `0600` |
| `~/.config/yoman/` | `0700` |
| `~/.local/state/yoman/` | `0700`, קבצים ב-`0600` |
| `backups/` | `0700`, קבצים ב-`0600` |

## 6. צ׳קליסט לכל PR
- [ ] כל קלט חיצוני נבדק ב-zod בגבול (route או collector)
- [ ] אין סודות, כותרות או tokens בלוגים ובהודעות שגיאה
- [ ] אין `shell: true` ואין הרכבה של פקודה ממחרוזת
- [ ] SQL רק עם פרמטרים
- [ ] אין פורט חדש, ואין שינוי ב-CORS, ‏Host או CSP בלי עדכון המסמך הזה
- [ ] תלות חדשה: מוסברת ב-PR, מתוחזקת, רישיון תואם, ובלי install scripts
- [ ] בדיקות ה-ST שהמשימה מפעילה הפכו מ-todo לבדיקות אמיתיות
- [ ] קבצים חדשים נוצרים בהרשאות מהטבלה
