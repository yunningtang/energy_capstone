# Energy Analyzer — Design System

Durable rules for this product's UI. Anything that contradicts this file is wrong
and should be fixed, not worked around.

---

## 1. Principles

1. **Neutral first, color second.** The page is cool-white/eggshell. Color is
   reserved for *semantic* meaning — severity, success, error. Never decorative.
2. **No colored left-border accents.** Never decorate a card, banner, row, or
   panel with a vertical colored left stripe. If severity needs signalling, use
   a dot, pill, or text color.
3. **One type system.** Inter for UI, Fraunces for page-level display headings
   only (H1), JetBrains Mono for actual code. Never mix serif + sans inside the
   same card.
4. **Don't nest cards.** A card inside a card is a code smell. The file list in
   the Code view is one card; the file items inside are rows, not cards.
5. **Don't invent new spacing values.** Use the tokens below. `padding: 14px`
   is a bug; `padding: var(--space-4)` (16px) is the fix.

---

## 2. Tokens

### 2.1 Spacing

```
--space-1:  4px
--space-2:  8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
```

**Allowed values only.** `18px`, `22px`, `14px` are banned — they sneak in and
break rhythm. Component-internal gap: 8/12/16. Card padding: 16/20/24. Card gap:
16/24. Section gap: 32/48.

### 2.2 Typography

```
--text-display: 32px   (H1, page title)
--text-h1:      24px   (section heading)
--text-h2:      18px   (card title)
--text-h3:      15px   (sub-card title)
--text-body:    14px   (default paragraph)
--text-small:   13px   (metadata, captions)
--text-caption: 12px   (tab labels, table cells)
--text-mono:    13px   (code samples inside cards)

--weight-regular:  400
--weight-medium:   500
--weight-semibold: 600  (never 700+; heavy weights read as shouty on Inter)

--lh-tight:   1.3  (headings)
--lh-normal:  1.5  (UI body)
--lh-relaxed: 1.6  (long-form paragraphs)
```

**Font stack** (loaded via Google Fonts in `public/index.html`):

```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI Variable",
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif,
             "PingFang SC", "Microsoft YaHei";
--font-serif: "Fraunces", Georgia, serif;  /* H1 only — do not reach for this */
--font-mono:  "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
```

The CJK fonts come **after** `sans-serif` on purpose — Latin glyphs must render
in Inter, not in the Latin subset of PingFang/YaHei (which looks slightly
serified and off-brand).

**Rules of thumb:**
- Metadata rows (`Upload · 1/1 file · 2h ago`) use `--text-small`, sans, never mono.
- Numbers in metric tiles use sans 500 — never serif. Exception: the A–F grade
  letter (if used) may use Fraunces as a deliberate "report-card" accent.
- Uppercase labels (`ANTI-PATTERN`, `WHY IT DRAINS`) use `--text-caption`,
  `letter-spacing: 0.14em`, `weight: 600`, `--fg-tertiary`.

### 2.3 Colors (canonical token system)

Two layers: **neutrals** (90% of surfaces) and **semantic** (10%, state only).
All new code must reference `--c-*` tokens. Legacy `--fg` / `--bg-elevated` etc.
are kept for old components; migrate when touching them.

**Neutral — surface + text**
```
--c-bg-page:       #FAFAF9   page background
--c-bg-surface:    #FFFFFF   cards, table, popovers
--c-bg-muted:      #F5F5F4   code blocks, inputs, hover
--c-bg-sunken:     #EFEFEC   nested surface

--c-border-subtle: rgba(0,0,0,0.06)
--c-border-base:   rgba(0,0,0,0.10)
--c-border-strong: rgba(0,0,0,0.16)

--c-text-primary:   #171717   body text (never pure #000)
--c-text-secondary: #666666   metadata, breadcrumbs
--c-text-tertiary:  #A1A1A0   captions, placeholder
--c-text-disabled:  #D4D4D4
```

**Semantic — state only, three distinct hues**
```
--c-red-fg:    #DC2626   --c-red-bg:    #FEF2F2   --c-red-dot:   #EF4444
--c-amber-fg:  #D97706   --c-amber-bg:  #FFFBEB   --c-amber-dot: #F59E0B   (Major — orange)
--c-yellow-fg: #CA8A04   --c-yellow-bg: #FEFCE8   --c-yellow-dot:#EAB308   (Minor — yellow)
--c-green-fg:  #16A34A   --c-green-bg:  #F0FDF4   --c-green-dot: #22C55E
```

Major and Minor must be *visibly different hues* — orange vs. yellow, not two
shades of amber. Dot colors are one step punchier than fg, because dots are
small and need pop.

### 2.4 Use rules for color

1. **Default to neutrals.** Any element not signalling state uses grays.
   Buttons, cards, borders, body text — all grayscale.
2. **Semantic colors are state signals, not decoration.** Red = critical.
   Amber = major. Yellow = minor. Green = success (use sparingly — not every
   "good" state needs to be green).
3. **Backgrounds stay low-saturation.** `--c-red-bg: #FEF2F2` (barely visible)
   not `#FEE2E2`. The eye senses "warning zone" without being assaulted.
4. **Dots > text in saturation.** At 8px, fg-level hues read as washed out.

**Dark mode** re-maps these via `[data-theme="dark"]`. Every semantic color has
a light + dark token pair defined in `App.css`.

**Hard rules:**
- Body text on `--bg` must meet WCAG AA (4.5:1). `--fg-tertiary` is borderline;
  only use it for labels that aren't load-bearing.
- Semantic colors only signal state. They never decorate.
- Code comments inside the Java highlighter use `#6b7280` — not `--fg-tertiary`
  (which fails AA against `--bg-subtle`).

---

## 3. Components

### 3.1 Card

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 16px;     /* tokens: --radius */
  padding: 20px 24px;
}
```

- Three padding sizes only: compact (16/20), default (20/24), spacious (24/32).
- **No box-shadow.** This product is flat.
- **No nested cards.** Use border-bottom dividers or grouped rows instead.
- Corner radius is always 16 for cards, 10 for inputs, 999 (pill) for badges.

### 3.2 Severity indicator

One component, `<SeverityBadge>`, with two variants:

```
pill:  [● Critical]
dot:   ●
```

Colors:

```
critical → --danger  (#DC2626)
major    → #D97706   (amber-600)
minor    → #CA8A04   (yellow-700)
```

Dots and pills use the same three colors everywhere. Major and Minor must look
visibly different — amber vs mustard yellow — not two shades of orange.

### 3.3 Metadata row

Single-line run/project metadata is rendered as a joined string, not as a mix
of badges + plain text:

```
Upload · 1/1 file · 2h ago
```

- All segments: `--text-small`, `--fg-secondary`, sans-serif.
- Separators: literal ` · ` with spaces.
- Timestamps use relative display ("2h ago") with a `title` attribute for the
  full timestamp.
- No segment uses mono. `1/1 file` is not code.

### 3.4 Code block

Two contexts with different needs:

**Inside Rules page (short examples):** `<pre class="rule-code">`; 12px mono.
Anti-pattern vs. Fix are distinguished by **background tint only** (`--c-red-bg`
/ `--c-green-bg`) plus a label. No colored left-border accents — previously
tried, rejected. If background tint is insufficient, add an icon (`✗` / `✓`)
to the label. Never a vertical colored stripe.

**Inside Code view (full source):** `<CodeBlock>`; own syntax highlighter;
`white-space: pre-wrap` with continuation; dark terminal background
(`#0d1117`). Issue lines get a subtle red row tint (`rgba(248,113,113,0.10)`)
and a `color: #f87171` line-number — **no `border-left` accent**. The pill tag
to the right of the line carries the "this is where the issue is" signal.
Tags are pinned to the first line of a range only, never repeated per line.

### 3.5 Pattern → Severity mapping

Static mapping, surfaced on the Rules page:

| Pattern | Severity | Reason |
| --- | --- | --- |
| DW   | Critical | Unreleased wake lock keeps CPU awake indefinitely. |
| HAS  | Major    | Blocking I/O on UI thread; user-visible jank. |
| IOD  | Major    | Allocation per frame; GC pressure. |
| HMU  | Minor    | Memory efficiency only; not a pure battery smell. |
| NLMR | Minor    | Resilience smell; raises OOM-kill probability. |

Static by pattern type. Call-site context (hot-loop vs. init) is **not**
weighted. Acknowledge this limitation in the Rules page methodology note.

---

## 4. Layout

### 4.1 Run detail page

```
Breadcrumb
H1 + meta row (Upload · 1/1 file · 2h ago)  ·······  [Export] [⊘]
Inline summary line (1 issue across 1 file · ● 1 critical)
[Table view | Code view]                                 (right-aligned)
─────────────────────────────────────────────────────────
(Table or 3-column Code shell)
```

**What not to do:**
- Don't put an Energy Grade circle here. The F/D/C grade idea is shelved; it
  was visually heavy and tried to compress too much into one symbol.
- Don't render 4 big metric tiles with serif numbers. The summary line above
  carries the same information with 1/10 the vertical space.
- Don't repeat row-level "View in code →" buttons when the whole row is
  already clickable. Pick one affordance.

### 4.2 Code view (3-column shell)1

```
┌───────────┬─────────────────────────────────────┬──────────────┐
│ FILES · N │  file_name.java               Clean │  [DW][HAS]…  │
│ ▸ File 1  │  ──────────────────────────────────  │  ──────────  │
│ ▸ File 2  │  source code with inline tags       │  Diagnosis   │
│ ▸ File 3  │                                     │  Suggested fix│
│           │                                     │  Diff view    │
└───────────┴─────────────────────────────────────┴──────────────┘
```

- Three columns share the same top + bottom edge (`align-items: stretch`).
- Left and right columns are `position: sticky; top: 16px`.
- Below 1280px the inspector collapses. Below 900px everything stacks.

### 4.3 Rules page

- Cards in a responsive grid (`minmax(360px, 1fr)`).
- Gap 20px between cards. Card padding 24px. Internal section gap 20px.
- Every card has the same sections in the same order:
  `Title | Short | Severity  →  Summary  →  Why it drains  →  Anti-pattern  →  Fix  →  Refs`
- Every card ends with a Refs footer. Asymmetry (some cards have refs, some
  don't) reads as "this rule is unverified" and is banned.

---

## 5. Accessibility

- All tables have `<th scope="col">` on column headers.
- All icon-only buttons have `aria-label`.
- Tab switchers use `role="tablist"` / `role="tab"` / `aria-selected`.
- Color is never the only carrier of meaning: severity has a dot + label;
  diff rows have a `+/−` marker in addition to the background tint.
- Focus rings are visible on every interactive element. Never set
  `outline: none` without a replacement.

---

## 6. What we explicitly do not do

- Energy Grade letter badges (A–F). Shelved — see §4.1.
- Large serif metric-tile numbers. Replaced by the inline summary line.
- Repeated inline tags on every annotated line.
- Colored vertical left borders on cards/banners/rows.
- "No description" placeholders. If metadata is empty, fall back to the most
  informative available field (source URL, file count) instead.
- CJK font fallbacks ahead of `sans-serif` in the body stack.
- Mono font for non-code UI chrome (counts, timestamps, labels).
