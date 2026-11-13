# Thali — design direction v3 · "Warm Spatial"

Ten people are redesigning this app at the same time, one area each. This document is what makes
the result look like **one app made by one hand**. Read all of it before you touch anything.
When this document and your instinct disagree, this document wins; when it is silent, choose the
option that looks most like the rest of the app.

---

## 0. North star

> **A beautifully set steel thali on a warm wooden table, lit by an evening lamp.**

Everything is *warm*, *tactile* and *calm*. Food is the colour; the interface is the plate it sits on.
It should feel as polished as the best 2026 consumer apps (Apple Health, Arc, Things, Revolut, Duolingo's
craft, Linear's restraint) but unmistakably Indian and unmistakably *ours*: steel, katoris, kolam,
turmeric, ember. A student opening it at 7 am in a hostel should smile.

Three words: **appetising, confident, kind.**

## 1. Principles

1. **One hero per screen.** Every screen has exactly one thing that matters most (Today: the plate.
   Progress: this week. Ask: the verdict). Make it big, beautiful and obvious. Everything else is calm.
2. **Food is the colour.** The UI chrome is warm neutral (cream / charcoal). Saturated colour is reserved
   for food, macros, meal hues, the accent, and status. Never decorate with a random colour.
3. **Depth means something.** Paper (page) → card (content) → glass (floats over content) → toast.
   Higher things cast softer, wider shadows and are lit along their top edge. Nothing floats for no reason.
4. **Motion explains.** Things enter from where they came from, settle with a soft spring, and leave
   faster than they arrived. Ambient motion (steam, a flame, a slowly drifting glow) is slow and quiet.
   Nothing loops fast. Nothing moves while you are reading it.
5. **Kind, never preachy.** Copy and art never shame. A missed day is a neutral tile, not a red one.
   The mascot is encouraging, never disappointed.
6. **Fast is a feature.** No libraries, no build step, no web fonts beyond the three already loaded.
   SVG and CSS only. Animations use `transform` and `opacity`. Big illustrations are drawn once, not per frame.

## 2. Materials and depth

| Layer | What | Token | Rules |
|---|---|---|---|
| Paper | the page | `--bg`, `--grad-mesh` | ambient glow + grain; never a flat colour |
| Card | resting content | `--card`, `--grad-card`, `--elev-2`, `--r` / `--r-lg` | solid, never translucent; top-edge light |
| Raised | inside a card (tiles, wells) | `--card-hi`, `--sunken`, `--elev-1` | for grouping, not decoration |
| Glass | floats over content | `--glass-bg`, `--glass-blur`, `--glass-border`, `--glass-edge`, `--glass-tint`, `--elev-3/4` | **only** tab bar, sticky header, sheets, toasts, popovers, the FAB halo, banners that overlay |
| Steel | the thali, katoris, mascot body | `--steel-1`, `--steel-2`, radial gradients | the brand material; brushed highlights top-left |

**Glass recipe** (copy it, don't reinvent it):

```css
.thing-that-floats {
  background: var(--glass-tint), var(--glass-bg);
  backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  box-shadow: var(--glass-edge), var(--elev-3);
}
```

Glass is never used for body text over busy content without `--glass-bg-strong`. `prefers-reduced-transparency`
and missing `backdrop-filter` already fall back to solid in `tokens.css` — don't undo that.

**Card recipe:**

```css
.card { background: var(--grad-card); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--elev-2); }
```

## 3. Colour

- Use **tokens only** (`css/tokens.css`). No hex values in your CSS except inside SVG food illustrations.
- Accent = the brand ember (users can switch to saffron / herb / berry / indigo — your work must look right
  in all five: test with `--accent saffron` and `--accent indigo`).
- Accent as **text** on a card: `--accent-t` (AA-safe). Accent as a **fill**: `--accent` or `--grad-accent`
  with `--accent-ink` text on it.
- Meals have hues: `--hue-breakfast` (turmeric), `--hue-lunch` (ember), `--hue-snacks` (chai pink),
  `--hue-dinner` (night indigo). The classes `.m-breakfast` … set `--hue`; use `color-mix(in srgb, var(--hue) X%, …)`
  for washes and glyph tints.
- Macros are fixed: protein `--c-p`, carbs `--c-c`, fat `--c-f`, calories `--c-cal`, water `--c-water`, fibre `--c-fib`.
- Status (good / warn / bad / swap) is **always** paired with an icon and a word — never colour alone.
- Both themes are first-class. Check every change in **dark and light**.

## 4. Type

- **Fraunces** (`--font-d`) is the voice: page titles, card titles, and *big numbers*. It is variable — use
  `font-variation-settings: var(--fv-display)` for hero numbers (soft, round, friendly), `var(--fv-heading)`
  for titles.
- **Figtree** (`--font-b`) for everything else. Weights 300–800 are available.
- **JetBrains Mono** (`--font-m`) only for eyebrows (small uppercase labels), units and chart axes. Never for
  pills, buttons or sentences.
- Numbers are always `font-variant-numeric: tabular-nums` (`.num`).
- Sizes: `--fs-hero` (one number per screen), `--fs-display`, `--fs-h1` … `--fs-h3` are fluid; `--fs-xs` … `--fs-lg`
  are fixed. Body is 15px / 1.5.
- **Never let a number and its unit wrap onto two lines** (`white-space: nowrap` on value+unit).
- No emoji in UI chrome (pills, buttons, headings). Use `icon()` from `js/components/icons.js`. Emoji are fine
  inside user content (dish names, festival specials).

## 5. Layout and rhythm

- Phone first (390 × 844), then desktop (≥ 900 px adds the rail; ≥ 1100 px uses bento grids).
- Page gutter `--gutter`; vertical rhythm between sections `--section`; inside cards `--s4`.
- Corners: cards `--r` (22), hero cards `--r-lg` / `--r-xl`, chips & pills `--r-pill`, inputs `--r-sm`.
- Touch targets ≥ 44 × 44 px. Primary actions are full-width on phone, sticky at the bottom of sheets.
- The floating tab bar covers the bottom ~110 px: pages keep `padding-bottom` so nothing hides under it.
- Prefer **bento grids** on wide screens: one large hero tile + supporting tiles of different sizes.

## 6. Art direction

Illustrations are **flat-shaded vector with soft volume**: one key light from the top-left, a soft
contact shadow under every object, rounded geometry, 2–3 tones per surface, no outlines except on the
logo and mascot (2px `#1B0D04` at 64-unit scale). Food uses real food colours (turmeric `#F3B73A`, rajma `#B5432B`,
curd `#F6F0E2`, sabzi `#69A04B`, chapati `#E9B07A`). Steel uses `--steel-1 → --steel-2` radial gradients.
Background shapes use the accent at low opacity so they follow the user's accent.

### The art contract (`js/components/art.js`)

These exports exist **now** (as placeholders marked `data-stub`) so every screen can place them today.
The art agent replaces their bodies; signatures will not change. Import and place them freely.

| Export | Use it for |
|---|---|
| `artMascot({ mood, size, label })` | **Kato** — see below. Empty states, onboarding, celebrations, the coach |
| `artMeal(meal, size)` | a small scene per meal: `'breakfast' \| 'lunch' \| 'snacks' \| 'dinner'` |
| `artWater(size)` | hydration |
| `artDumbbell(size)` | training, rest days |
| `artTrophy(size)` | badges, goal reached, challenges |
| `artGoal(size)` | goal planner, goal card |
| `artSearch(size)` | search with no results |
| `artWelcome(size)` | landing / onboarding hero |
| `artKolam({ size, cls })` | decorative background line motif |
| `artSpices(size)` | food rules, allergies |
| `artMoon(size)` | dinner, night, fasting |
| existing: `thaliArt`, `logoMark`, `artEmptyPlate`, `artViewfinder`, `artSprout`, `artTrend`, `artChai`, `artTiffin`, `artScale`, `artAsk`, `artStreak` | as before |

`MOODS = ['happy', 'proud', 'hungry', 'sleepy', 'cheer', 'think', 'wave', 'cool']`.

### Kato, the mascot

A small, round **steel katori** (bowl) with a face — the friendliest object on an Indian table.
Brushed-steel body (`--steel-1/2` radial), a soft rim highlight, two dot eyes, small rosy cheeks, a tiny
mouth that changes with mood, little stubby arms on some moods, and a wisp of **steam** curling up from
the top like a hair-curl. Optional props per mood: a spoon (hungry), a star (proud), a nightcap / zZ
(sleepy), a thought bubble (think), raised arms + sparkles (cheer), sunglasses (cool), a waving hand (wave).
Kato is **kind**: never sad, never disappointed. When the user misses something, Kato is *hungry* or
*sleepy*, not upset.

Place Kato where a person would appreciate a friend: empty states, the first screen, a goal hit, an
empty log, the coach header, the weekly report highlight. **At most one Kato per screen.**

## 7. Motion language

Durations `--dur-1` … `--dur-6`; curves `--ease` (default), `--ease-in` (leaving), `--ease-soft`,
`--ease-spring`, `--ease-bouncy` (real springs as `linear()`), `--stagger` 45 ms.

| Moment | Recipe |
|---|---|
| Page change | View Transitions API (already wired in `js/app.js`; `html[data-nav="forward\|back"]` tells you the direction). The shell owns `::view-transition-*`. |
| Cards entering | already staggered on navigation (`.route-in`, see app.css). Don't add per-card entrance animations that replay on every re-render — the app re-renders often. |
| Below-the-fold reveal | scroll-driven: `animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% entry 40%;` **inside** `@supports (animation-timeline: view())` **and** `@media (prefers-reduced-motion: no-preference)` |
| Sheets, toasts, popovers appearing | `@starting-style { … }` + `transition: … allow-discrete` (from translateY(16px) / opacity 0), `--ease-spring`, `--dur-4` |
| Press | `:active { transform: scale(.96) }`, `--dur-1`, `--spring` |
| Hover (pointer only) | `@media (hover: hover)` — lift 2px, deepen shadow |
| Numbers changing | `countUp(el, to)` from `js/components/controls.js`, or the `.num-tick` class |
| Gauges, rings, charts | draw in over `--dur-6` with `--ease`; use `stroke-dashoffset`, or `@property --pct` |
| Celebrations | `confetti()`, the `.hit-target` pulse, Kato `cheer`. Only for real achievements |
| Ambient | ≥ 4 s loops, low amplitude: steam, flame flicker, mesh drift, Kato blinking |

**Reduced motion is mandatory.** `app.css` already zeroes durations under `prefers-reduced-motion: reduce`,
but scroll-driven animations and anything that hides content until it animates must be wrapped in
`@media (prefers-reduced-motion: no-preference)`. Content must never be invisible because an animation didn't run.

## 8. Accessibility (non-negotiable — the browser suite checks these)

- WCAG 2.1 AA contrast in **both** themes. `node tools/shoot.cjs --axe` must report **zero** violations on your screens.
- Every interactive element is a real `<button>` / `<a>` / `<input>` with an accessible name.
- Visible focus: `:focus-visible { box-shadow: var(--ring) }` or the default outline — never `outline: none` without a replacement.
- Touch targets ≥ 44 px. Text never below 12 px.
- Decorative SVG gets `aria-hidden="true"`; meaningful SVG gets `role="img"` + `aria-label`.
- Don't convey anything with colour alone.

## 9. The test contract — **do not break the app**

195 browser tests and 219 unit tests pass today. They find elements by class, text and attributes.

**You may**: restyle anything, add classes, add wrapper elements, add new elements, add art and motion.

**You may not** (without it being the whole point of your task and reporting it):
- remove or rename any class, id, `aria-label` or `placeholder` the tests use (list below),
- change any user-visible text the tests look for (grep `test/run.cjs` before changing copy),
- change what a button *does*, or any data / engine / store / planner logic,
- reorder elements the tests address by position (`.li-btn >> nth=0`, `.portion >> nth=0`, `.seg-btn >> nth=2` …).

Classes and ids the tests use:
`#plate-card .ask .auth-card .banner .board .btn .change .checkins .chip .ci-row .closing .coach .coach-log .conf .consent .danger .daymeal .ed-card .edit-row .fab .field .go .goal-card .goalchart .gp .gp-day1 .gp-offers .gp-phases .gp-status .grid2 .impact .info .input .li-btn .li-t .log-body .log-edit .logo-svg .me .mess .mess-chip .name .nav-l .not-today .ntable .ob .ob-next .on .page .page-head .paste-area .pg-num .picker .picker-opt .pill .plan .plan-vs .plist .portion .primary .proposal .prow .rate-btn .rate-row .repeat-row .results .search-input .searchfield .seg-btn .sheet .sheet-wrap .snap .snap-item .snap-result .snap-seg .special .stats .stepper-btn .sticky-actions .stop .tab-btn .tabbar .tabs-seg .toast .today .total-bar .train .verdict .verdict-b .weekgrid .weekreport .wg-day .wk-day .wk-strip`

Attributes the tests use: `aria-label="Copy from" / "Friends challenge code" / "Language" / ^="Remove"`,
`inputmode=numeric`, `placeholder="DELETE" / "First name" / *="Diwali" / *="user ID"`, `type=email|password|file`.

Text the tests click or read includes: *Try it as a guest, Log this plate, See why, Got it, Adjust plan, Check in,
Check this plate, Back to results, Search or type it instead, Scan a barcode, Search instead, Add my free key,
Edit menu, Edit / publish, Paste a week, Publish for everyone, Save for me, Scorecard, Use their menu,
The mess committee updated the menu, Not now, I agree, Delete my account and data, Start / join, Protein streak,
Look up, Re-plan this meal, Review & save as a food, Review in the menu editor, Coach, Thali, Next week:, Calories, Protein*
— and more. **Grep before you change any string.**

## 10. Who owns what

Each agent owns a disjoint set of files and may edit **only** those. Everyone may *read* everything.
If you need a change in a file you don't own, don't make it — put it in your final report under
"Requests for the integrator" and the integrator will do it.

| # | Area | JS you own | CSS you own |
|---|---|---|---|
| 1 | Shell & navigation | `js/app.js` (shell markup only), `js/views/common.js` | `css/shell.css` |
| 2 | Today | `js/views/today.js`, `js/components/plategauge.js`, `js/components/focus.js` | `css/today.css` |
| 3 | Plan, menus, training | `js/views/plan.js`, `js/views/mess.js`, `js/views/train.js`, `js/views/goalplanner.js` | `css/plan.css` |
| 4 | Ask, Snap, Coach | `js/views/ask.js`, `js/views/snap.js`, `js/views/coach.js` | `css/ask.css` |
| 5 | Progress & charts | `js/views/progress.js`, `js/views/report.js`, `js/components/charts.js` | `css/progress.css` |
| 6 | You & settings | `js/views/you.js`, `js/views/privacy.js`, `js/views/foodrules.js`, `js/views/ratings.js`, `js/aikey.js` | `css/you.css` |
| 7 | Sheets & overlays | `js/ui.js`, `js/views/logsheet.js`, `js/views/nottoday.js`, `js/components/camera.js` | `css/sheets.css` |
| 8 | Onboarding & landing | `js/views/onboard.js`, `js/views/auth.js` | `css/onboard.css` |
| 9 | Art & illustration | `js/components/art.js`, `js/components/icons.js` | `css/art.css` |
| 10 | Components | `js/components/bits.js`, `js/components/controls.js` | `css/components.css` |

Frozen for everyone (integrator only): `css/tokens.css`, `css/app.css`, `index.html`, `sw.js`, `manifest.json`,
`test/**`, `design/**`, all engine / store / planner / data files.

CSS load order: `tokens → app → components → shell → art → today → plan → ask → progress → you → sheets → onboard`.
Later files win on equal specificity. **Scope your selectors to your area** (e.g. `.page.today …`, `.sheet …`,
`.ob …`) so you never restyle someone else's screen by accident. Shared primitives (`.btn`, `.chip`, `.card`,
`.pill`, `.seg`, inputs …) belong to agent 10 — screen agents may only adjust them *inside* their own scope.

## 11. How to work

1. Read this file, `css/tokens.css`, and every file you own. Look at the current screens:
   `node tools/shoot.cjs --routes <yours> --themes dark,light` and open the PNGs in `.shots/`.
2. Design the screen in your head first: what is the one hero? What is calm? Where does Kato go?
3. Build. Re-shoot often and **look at the images**. Iterate until it is genuinely beautiful — not "fine".
4. Check: dark + light, phone + desktop (`--sizes phone,desktop`), two accents (`--accent indigo`),
   empty state (`--empty`), entrance motion (`--frames 6`), and `--axe` (zero violations).
5. `npm test` (unit tests, ~10 s) must pass. **Do not run `node test/run.cjs`** — it takes 20 minutes and ten
   copies at once would starve the machine; the integrator runs it.
6. Commit on your worktree branch (see your brief) and report.
