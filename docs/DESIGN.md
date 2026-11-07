# Yoman: the "Paper and Ink" design system

Warm paper, dark ink and earth tones. Quiet and personal, like a good notebook.
**Every color, font, radius and spacing value comes from a token.** Writing a hex value in a component is not allowed.

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
6. **RTL and LTR:** only `margin-inline-*`, `padding-inline-*` and `inset-inline-*`. Directional icons (arrows) flip according to `dir`.
7. **Dark mode** is only a different set of values for the same tokens: `[data-theme="dark"]`, or `prefers-color-scheme` when the choice is `system`.

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
