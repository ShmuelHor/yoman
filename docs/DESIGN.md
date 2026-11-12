# Yoman: the "Paper and Ink" design system

Warm paper, dark ink and earth tones. Quiet and personal, like a good notebook.
**Every color, font, radius and spacing value comes from a token.** Writing a hex value in a component is not allowed.

The UI is built on MUI, and the tokens live in its theme, not in CSS files (the web app has none):
- **Colors:** `apps/web/src/theme/color-tokens.ts`, the only file allowed to hold a color literal. The theme exposes them as `theme.vars.palette.tokens.*` (`--mui-palette-tokens-*` CSS variables, switched by `data-theme`) and maps them onto MUI's roles (`primary` = accent, `success` = ok, `background`, `text`, `divider`).
- **Everything else:** `apps/web/src/theme/mui-theme.ts`. Spacing is `theme.spacing(n)` = n × 4px, so the scale below is spacing 1, 2, 3, 4, 6, 8. Radii are `theme.shape.borderRadius` and `theme.shape.radiusSm`, fonts and sizes are typography variants (`h1` for page titles, `hero`, `number`, `table`, `label`), and chart values are `theme.chart`.
- Components style themselves with `sx` or `styled` using theme values, with logical properties only (a Biome Grit rule enforces this).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F3EDE2` | `#1B1916` | Page background |
| `--surface` | `#FBF7F0` | `#24211D` | Cards |
| `--text` | `#1E1C19` | `#EDE6D9` | Primary text and numbers |
| `--muted` | `#7A7368` | `#A39A8B` | Labels and secondary text |
| `--line` | `#DDD3C3` | `#3A352E` | Borders and dividers |
| `--accent` | `#B4532A` | `#E07B4F` | Primary action and anomalies |
| `--accent-bg` | `#F3DED2` | `#3A271E` | Background for alerts and anomalies |
| `--ok` | `#5E6B3A` | `#9AAA6A` | Healthy, active, focus mode |
| `--on-accent` | `#FBF7F0` | `#1B1916` | Text on accent |
| `--cat-work` | `#B4532A` | `#E07B4F` | Category: work |
| `--cat-comms` | `#5E6B3A` | `#9AAA6A` | Category: communication |
| `--cat-fun` | `#C9A15B` | `#D9B26E` | Category: entertainment |
| `--cat-other` | `#8C8478` | `#7D7568` | Category: other |
| `--cat-idle` | `var(--line)` | `var(--line)` | Away from the computer |

| Token | Value |
|---|---|
| `--radius` | `10px` (cards, buttons, fields) |
| `--radius-sm` | `3px` (chart bars, category dots) |
| `--border` | `1px solid var(--line)` |
| `--space-1..6` | `4, 8, 12, 16, 24, 32px` |

## Typography
Both typefaces cover Hebrew and Latin, so the same fonts serve both UI languages.

| Role | Font | Size and weight |
|---|---|---|
| Hero number | Frank Ruhl Libre | 44px / 500 |
| Secondary number | Frank Ruhl Libre | 28px / 500 |
| Table values | Frank Ruhl Libre | 14px / 400 |
| Page title | Frank Ruhl Libre | 24px / 500 |
| Body and UI | Heebo | 14px / 400 |
| Label | Heebo | 12px / 400, `--muted` |

Two weights only: 400 and 500. Numbers use `font-variant-numeric: tabular-nums`.

## Rules
1. **A card is a unit of information.** It has a fixed structure: a label on top, the value in the serif, and a context line below ("47 min more than yesterday").
2. **Use accent sparingly:** one primary action per screen, and anomalies. Never for decoration.
3. **`--ok` (olive)** marks a healthy state, active focus mode and a switch that is on.
4. **No gradients, no shadows and no blur.** Depth comes only from borders and the difference between `--bg` and `--surface`.
5. **Charts:** 1.5px lines, bars with `--radius-sm`, and anomaly regions in `--accent` at 12% opacity.
6. **RTL and LTR:** only `margin-inline-*`, `padding-inline-*` and `inset-inline-*` (`marginInlineStart` and so on in `sx`). Directional icons (arrows) flip according to `dir`; MUI's own styles are mirrored by the right-to-left Emotion cache.
7. **Dark mode** is only a different set of values for the same tokens: `[data-theme="dark"]`, or `prefers-color-scheme` when the choice is `system`.
8. **Lists, not tables.** A user-managed collection (apps, category rules, focus profiles, alert levels) is a readable list: one plain-language sentence per row ("Apps whose name contains **youtube** → Media"), app display names instead of IDs, and technical fields (priority, match type, raw ID) only in the edit dialog. No pagination or "rows per page" on short lists, and an empty state that says what to do next. A Data Grid is only for large sortable data where sorting is the point, such as the Processes page.
9. **Plain language first.** A page opens with what it means for the user ("the computer got stuck twice today"); raw metrics and technical charts come after, as details.

## Components
| Component | Appearance |
|---|---|
| Button primary | `--accent` background, `--on-accent` text, radius 10 |
| Button secondary | Transparent, `--border`, `--text` text |
| Input | `--bg` background, `--border`, radius 10, placeholder in `--muted` |
| Switch | Track `--ok` when on and `--line` when off, with a `--surface` knob |
| Tag | `--border` + `--muted`. Anomaly variant: `--accent-bg` + `--accent` |
| Nav tab | Active: `--text` background and `--bg` text. Inactive: `--muted` |
| Alert card | `--accent-bg` background, `--accent` border, serif title |
| Focus banner | Top bar on an `--ok` background: "Focus mode · 47 min left" |

UI copy in this document is shown in English; the product strings are localized into Hebrew (the default language) in the i18n files.
