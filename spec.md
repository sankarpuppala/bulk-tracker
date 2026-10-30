# Fuel & Forge v2: Product & Technical Spec

> **Status:** Draft v1 · 2026-10-30
> **Companion docs:** [plan.md](plan.md) (build order and milestones) · [prompts.md](prompts.md) (build prompts and runtime AI prompts)
> **Baseline:** the `claude/zen-ritchie-zszxij` branch, a vanilla-JS PWA with Firebase auth and sync, a mess plate planner, 387 foods, quick-log parser, barcode lookup, training, routine and gamification.

---

## 1. Vision

**A personal nutrition coach that knows what's actually on your plate.**

Fuel & Forge v2 lets anyone track what they eat, from a hostel mess, a home kitchen, a canteen, a restaurant or a snack stall. It turns a goal like *"60 → 70 kg in 8 months"* into a day-by-day plan they can follow. When the menu changes, the plan changes with it. Before you eat something, you can ask whether you should and get a straight answer ("half a plate of biryani, add raita, skip rice at dinner"). You can point the camera at a plate and get a nutrient table back.

v1 was a campus mess tracker. v2 keeps that as its strongest feature and extends it to anyone.

### 1.1 Product principles

1. **Numbers come from data, judgement from rules, words from AI.** Macros come from the food database (IFCT, pack labels, USDA, Open Food Facts). Verdicts ("eat / portion / swap / skip") come from a deterministic, testable engine. The LLM recognises food in photos, parses free text and explains decisions in plain language. It never quietly invents a number. When it has to estimate, the UI says so. This keeps the v1 rule that the menu importer "never invents numbers".
2. **The plan is alive.** Every input (a menu change, a skipped meal, an extra samosa, a week of weight data) re-flows the rest of the day and the week. Users never see a stale plan.
3. **One tap for the common case.** Log the suggested plate, accept the swap, snap and confirm. Typing is the fallback.
4. **Coach, don't shame.** "Skip" always comes with a reason and a "but if you do eat it, here's the adjustment". No red screens, no guilt copy.
5. **Safe by default.** Rate-of-change caps, calorie floors, BMI floors, age-aware limits and eating-disorder safeguards are built into the engine, not added later (§9).
6. **Works offline, gets smarter online.** Logging, plans, verdicts and the mess menu all work offline. Only photo recognition and the AI coach need a network.
7. **India-first, not India-only.** Indian dishes, mess culture, ₹ pricing and regional languages come first. The data model doesn't assume them.

---

## 2. Users

| Persona | Situation | What they need most |
|---|---|---|
| **Hostel student (core)** | Eats 3–4 mess meals a day; the menu is fixed weekly but changes without notice; small snack budget | Suggested plate per meal, re-plans on menu change, protein top-ups on a budget |
| **Gym beginner** | Wants to "bulk" or "get abs", doesn't know numbers | A goal planner that says what's realistic, a simple training plan, daily "did I hit it" |
| **Cutter** | Losing fat for an event or health | Deficit that's safe, "should I eat this?" before every craving, eating-out help |
| **Home eater / family cook** | Eats home food, portions vary | Photo logging, recipes → per-serving macros, household profiles |
| **Office worker / eats out** | Canteen + delivery apps | Restaurant menu photo → best picks, chain menu database |
| **Athlete** | Training twice a day, needs fuel timing | Carb periodisation by training day, hydration, pre/post-workout timing |
| **Mess committee member** | Publishes menus, wants healthier menus | Fast menu publishing (photo of the chart), dish ratings, nutrition scorecard |
| **Coach / trainer (later)** | Manages 10–50 clients | Read-only client dashboards, plan templates, check-in review |

---

## 3. Feature map

Priority: **P0** is needed for v2 launch, **P1** is the fast follow, and **P2** is later. "Exists" means it's already in v1 and gets extended.

### 3.1 Goals & Plans

| # | Feature | Pri | Notes |
|---|---|---|---|
| G1 | **Goal types**: lose fat, cut, maintain, recomp, lean bulk, bulk, muscle gain, strength, endurance/sport performance | P0 | Extends `GOALS` (gain/lose/maintain/recomp). "Bulk" and "cut" are goal + pace presets. |
| G2 | **Goal Planner: "X kg → Y kg in Z months"** with a feasibility check and a counter-offer when the target is unsafe | P0 | §5.1 |
| G3 | **Phased plans**: diet breaks on long cuts, optional mini-cuts on long bulks, maintenance phase at the end | P0 | §5.1.4 |
| G4 | **Adaptive targets**: weekly check-in adjusts calories from the real weight trend and logged intake (adaptive TDEE) | P0 | §5.2 |
| G5 | **Milestones & projected finish date** with a "you're ahead / on track / behind" chart | P0 | Extends `weeksToGoal` |
| G6 | Body measurements (waist, chest, arm), Navy-method body-fat estimate | P1 | |
| G7 | Event goals: "look good for a wedding on 14 Feb" (a date-anchored plan) | P1 | Same planner, date instead of months |
| G8 | Training plan matched to the goal (strength split for bulk, hybrid for cut) | P0 | Exists, `data/workouts.js`; auto-pick |
| G9 | Plan templates from coaches, shareable plans | P2 | |

### 3.2 Daily plan & menu intelligence

| # | Feature | Pri | Notes |
|---|---|---|---|
| D1 | **Daily plan**: each meal's budget, suggested plate, top-ups, timing | P0 | Exists (`planPlate`, `topUps`, `buildRoutine`); becomes one `DayPlan` object, §5.3 |
| D2 | **Weekly plan from the week's menu**: see the whole week, which days are protein-poor, where to add eggs/whey | P0 | |
| D3 | **Menu-change re-planning**: published menu edited, festival special, "today they served X instead", or personal edit → re-plan remaining meals and show a diff | P0 | §5.4 |
| D4 | **"What's actually served" quick fix**: tap a meal → "Not this today" → type or snap what was served | P0 | Feeds D3 |
| D5 | **Missed-meal recovery**: skipped breakfast → plan redistributes to remaining meals within safe limits | P0 | |
| D6 | **Food sources beyond the mess**: home, canteen, restaurant, delivery. Users set a typical mix ("mess on weekdays, home on weekends") | P1 | |
| D7 | Budget mode: cheapest way to close today's protein gap (₹ per 10 g protein) | P1 | Data already has prices |
| D8 | Grocery list / meal-prep list from the weekly plan (for home eaters) | P2 | |
| D9 | Recipe builder: ingredients → per-serving macros | P1 | |

### 3.3 Logging

| # | Feature | Pri | Notes |
|---|---|---|---|
| L1 | Search, quick-type, voice, barcode, favourites, saved meals, copy yesterday | — | Exists |
| L2 | **Snap a meal**: photo → recognised items → portions → **nutrient table** → verdict → log | P0 | §5.6 |
| L3 | **Snap a nutrition label**: photo of the back of a pack → per-100 g values → custom food | P0 | Fills gaps when barcode lookup fails |
| L4 | **Snap a menu chart**: photo of the mess notice board / WhatsApp image → weekly menu (feeds the existing paste-a-week review screen) | P0 | Reuses `menuparse.js` review UI |
| L5 | **Snap a restaurant menu**: photo → ranked "best for your goal" picks | P1 | |
| L6 | Portion helpers: hand/katori/plate visual guides, "½ / 1 / 1½ / 2" chips | P0 | |
| L7 | Edit-after-log, undo | — | Exists |
| L8 | Food DB v2: add fibre, sugar, sodium, saturated fat; key micros (iron, calcium, B12, vitamin D, folate) where data exists | P1 | §6.3 |

### 3.4 "Should I eat this?"

| # | Feature | Pri | Notes |
|---|---|---|---|
| S1 | **Ask by search / photo / text**: "can I have 2 samosas now?" → verdict + reason + adjustment | P0 | §5.5 |
| S2 | Four verdicts: **Go**, **Go, smaller** (with suggested portion), **Swap** (better option available now), **Skip today** | P0 | |
| S3 | "If you eat it anyway" adjustment: what changes in the rest of today's plan | P0 | |
| S4 | Compare two options: "biryani or chapati-paneer?" | P1 | |
| S5 | Craving mode: suggest the closest lower-cost alternative (kulfi → curd + honey) | P1 | |
| S6 | Pre-order check for delivery: paste/snap a cart | P2 | |

### 3.5 AI Coach

| # | Feature | Pri | Notes |
|---|---|---|---|
| C1 | **Ask tab**: chat with context of today's log, targets, plan and menu | P1 | §5.7 |
| C2 | Weekly check-in summary written in plain language | P1 | |
| C3 | Plateau detection & suggestion ("weight flat 3 weeks at 2,600 kcal → +150 kcal") | P0 (engine) / P1 (copy) | |
| C4 | Supplement basics (whey, creatine, vitamin D/B12 for vegetarians) with clear "talk to a doctor" boundaries | P1 | |

### 3.6 Lifestyle & personalisation

| # | Feature | Pri |
|---|---|---|
| P1 | Allergies & intolerances (lactose, gluten, peanut, tree nut, shellfish, egg) as **hard filters** | P0 |
| P2 | Diet patterns: veg, egg, non-veg (exist) + vegan, Jain (no root veg), no beef/pork, halal | P0 |
| P3 | Fasting modes: Navratri, Ramadan (sehri/iftar windows), Ekadashi, intermittent fasting windows | P1 |
| P4 | Cycle-aware notes (optional, private, off by default) | P2 |
| P5 | Sleep & steps (manual; Health Connect when a native wrapper exists) | P2 |
| P6 | Languages: English, Hindi, Telugu, Tamil, Kannada, Malayalam (dish names stay as served) | P1 |
| P7 | Household profiles under one account (parent manages kid's/partner's plan) | P2 |

### 3.7 Community & mess committee

| # | Feature | Pri | Notes |
|---|---|---|---|
| M1 | Menu publishing, specials, reports, scoped committee roles | — | Exists |
| M2 | **Dish ratings & "what did people actually eat"** (anonymous aggregate) | P1 | |
| M3 | **Menu nutrition scorecard** for committees: protein per day, fried-item count, veg-protein coverage, with suggestions | P1 | |
| M4 | Crowd-sourced dish nutrition with moderation (dish → macros shared across messes) | P2 | |
| M5 | Leaderboard, badges, streaks (exist) + friend challenges ("7-day protein streak") | P1 | |

---

## 4. Interface redesign

### 4.1 What's wrong with v1's interface

- **Five tabs + FAB, and the most important action is split.** Logging lives behind the FAB, suggested plates live on Today *and* Mess, and "what should I eat now?" has no home.
- **Today is a wall of eight equal bento cards.** Hero, next-up, plate, water, weight, logged, workout and timeline all have the same visual weight, so nothing tells you the one thing to do next.
- **Decoration over signal.** The animated aurora background, an emoji on nearly every label, and four colour-coded rings compete with the data.
- **No camera-first path,** though the camera is now the fastest way to log.
- **Accessibility gaps.** Some status is shown by colour alone, small 11.5 px text, and the motion is heavy for users with `prefers-reduced-motion`.

### 4.2 New information architecture

```
┌──────────────────────────────────────────────────────────┐
│  Today      Plan       ( ◉ Snap )      Ask      Progress │   ← bottom tab bar (mobile)
└──────────────────────────────────────────────────────────┘
   avatar (top-right of every page) → You: profile, goal, settings, account, admin
```

| Tab | Job | Contains (v1 source) |
|---|---|---|
| **Today** | "What do I do next?" | Next-meal card with the suggested plate, a one-line remaining budget, the log, water, today's workout (Today, parts of Mess) |
| **Plan** | "What's my plan this week?" | Goal summary, week view by day and meal, menus (all sources), training plan, routine (Mess, Train, routine) |
| **Snap** (centre) | Fastest way in | Camera with mode switch: Meal · Label · Menu · Barcode; long-press opens the type/search log sheet |
| **Ask** | "Should I eat this?" + coach | Verdict box at top (search/type/snap), chat below, recent verdicts |
| **Progress** | "Is it working?" | Weight trend vs plan line, check-ins, macros, consistency, strength PRs, badges (Stats, gamify) |

Desktop keeps the left rail with the same five destinations plus a persistent "Log" button. Today becomes a two-column layout: plan on the left, log on the right.

### 4.3 Key screens (wireframes)

**Today (mobile)**
```
┌─────────────────────────────────────┐
│ Wed 30 Oct                     (SP) │  ← avatar
│ 1,240 kcal left · 62 g protein left │  ← single-line budget; tap → detail
│ ▓▓▓▓▓▓▓▓▓░░░░░░  58%                │  ← shipped as a plate gauge + katoris (§4.4)
├─────────────────────────────────────┤
│ NEXT · Lunch at CNV · 12:30–14:15   │
│ ┌─────────────────────────────────┐ │
│ │ Egg masala ×1      190 · 14 g P │ │
│ │ Chapati ×3         300 · 9 g P  │ │
│ │ Dal ×1             160 · 9 g P  │ │
│ │ Rice ×½            120 · 2 g P  │ │
│ │ ─────────────────────────────── │ │
│ │ 770 kcal · 34 g P   fits ✓      │ │
│ │ [ Log this plate ]  [ Change ]  │ │
│ └─────────────────────────────────┘ │
│ ⚠ Menu changed: paneer → aloo.      │  ← only when relevant
│   Added 2 eggs at snacks. [See why] │
├─────────────────────────────────────┤
│ Logged today                    ▾   │
│ Breakfast · 410 kcal · 18 g P       │
├─────────────────────────────────────┤
│ 💧 1.5 / 3 L  [+250]   🏋 Push day ▸ │
└─────────────────────────────────────┘
```

**Snap → result**
```
┌─────────────────────────────────────┐
│ [photo thumbnail]  Lunch · CNV      │
│ Found 4 items                       │
│ ● Chicken biryani   ~350 g  [−][+]  │ high confidence
│ ● Raita             ~100 g  [−][+]  │ matched to menu
│ ● Boiled egg        1       [−][+]  │
│ ◐ Mirchi ka salan   ~80 g   [−][+]  │ ≈ estimate
│ + Add missed item                   │
├─────────────────────────────────────┤
│ Nutrients        Total   Your left  │
│ Energy          812 kcal   1,240    │
│ Protein          38 g        62     │
│ Carbs            96 g       150     │
│ Fat              29 g        41     │
│ Fibre             5 g        18     │
│ Sodium         1.4 g      (≤2.3 g)  │
├─────────────────────────────────────┤
│ 🟡 GO, SMALLER                       │
│ Biryani alone uses most of today's  │
│ flexible budget and you're cutting. │
│ Eat ½ of it, keep raita and egg.    │
│ [ Log as ½ ]   [ Log all anyway ]   │
└─────────────────────────────────────┘
```

**Ask: verdict**
```
┌─────────────────────────────────────┐
│ Should I eat…  [ 2 samosas      📷 ]│
├─────────────────────────────────────┤
│ 🔁 SWAP                              │
│ 2 samosas = 520 kcal, 8 g protein.  │
│ Snacks today has 300 kcal planned.  │
│ Better now: 1 samosa + 1 glass milk │
│ (370 kcal, 12 g P).                 │
│                                     │
│ If you have both anyway:            │
│ dinner rice ×1 → ×½ (−170 kcal)     │
│ [ Log swap ] [ Log 2 + adjust ]     │
└─────────────────────────────────────┘
```

**Goal Planner**
```
┌─────────────────────────────────────┐
│ From  [ 60 ] kg   To [ 70 ] kg      │
│ In    [ 8 ] months                  │
├─────────────────────────────────────┤
│ 1.25 kg/month · 0.29 kg/week        │
│ ✅ Realistic lean bulk               │
│                                     │
│ ▁▂▃▄▅▆▇ projected line (+ phases)   │
│ Phase 1  Lean bulk   wk 1–33  +330  │
│ Phase 2  Maintain    wk 34–35   0   │
│ (mini-cut offered if waist +4 cm)   │
│                                     │
│ Day 1: 2,780 kcal · 108 g P         │
│ Training: Push/Pull/Legs ×5         │
│ [ Start this plan ]  [ Tweak ]      │
└─────────────────────────────────────┘
```
If the target is unsafe (e.g. 80 → 60 kg in 2 months), the box turns amber and shows two counter-offers: *same target in ≈ 8 months* or *−5 kg in 2 months*. Neither the copy nor the plan endorses the original pace.

### 4.4 Design system v2: "Thali" (built in Phase 1)

The first draft kept v1's volt-lime identity. Phase 1 replaced it with a warmer identity drawn from the food itself; this section records what shipped.

| Area | Decision |
|---|---|
| **Palette** | Warm charcoal (`#110E0B`) and cream (`#FBF6EC`) surfaces. Ember accent `#FF7A2E`, swappable for saffron, herb, berry or indigo. All colours are `light-dark()` tokens, so light and dark come from one definition. |
| **Nutrient colours** | Protein chilli-rose, carbs teal, fat ghee-gold, water blue. Used only in gauges, charts and nutrient tables. |
| **Status** | `--go`, `--caution`, `--swap`, `--stop`, always paired with an icon and a word. |
| **Type** | Fraunces (display: headings, big numbers, with an italic accent word on the landing page), Figtree (UI), JetBrains Mono (labels, data). Scale 12/14/16/20/28/36; nothing below 12 px. Tabular numerals for numbers. |
| **Art** | Inline SVG, theme-aware: a top-down thali (landing and onboarding), the plate gauge (calorie rim with a bead), katori bowls that fill per macro, a kolam motif peeking from hero cards, and small scenes for empty states. Emoji stay in content only. |
| **Hero** | The spec's original "one bar" was replaced by the plate gauge plus three katoris. It reads at a glance, carries the same numbers, and gives the app its signature image. |
| **Hierarchy** | One focus card per screen, tinted by the meal's hue (breakfast saffron, lunch ember, snacks berry, dinner indigo). One primary (ember) action per screen. |
| **Background** | Static warm glow plus a faint paper grain; no animated aurora. |
| **Motion** | 150–300 ms ease-out; springs only for presses; all motion respects `prefers-reduced-motion`. |
| **Touch** | ≥ 44 px targets (small steppers extend their hit area). |
| **Accessibility** | Every screen passes axe WCAG 2 A/AA in both themes; the active tab carries `aria-current`; charts have accessible names; form labels are associated. |

### 4.5 Components to build

`FocusCard`, `PlateList` (items with servings stepper), `NutrientTable` (total vs remaining, optional micros), `VerdictCard` (4 states), `ChangeBanner` (menu/plan diffs), `GoalChart` (actual trend + plan line + phases), `CameraSheet` (modes, capture, retake), `ConfidenceBadge` (high / matched / estimate), `PortionChips`, `WeekGrid` (7 days × meals heat cells).

All are built with the existing `h()` helper in `js/util.js` and the existing sheet/toast primitives in `js/ui.js`. No framework is introduced.

---

## 5. Engines (the core logic)

All engines are **pure functions in `js/engine/`**, unit-tested in Node with no DOM. The UI and the AI layers call them; they never call the UI or the network.

### 5.1 Goal Planner

**Inputs:** current weight `x`, target weight `y`, duration `z` (months) *or* end date, sex, age, height, activity, training experience (beginner / intermediate / advanced), goal type.

#### 5.1.1 Rate and feasibility

```
weeks   = z × 4.345
rateWk  = (y − x) / weeks              # kg/week, + gain, − loss
ratePct = |rateWk| / x × 100           # % body weight per week
```

| Direction | Safe | Aggressive (allowed, warned) | Not offered |
|---|---|---|---|
| Loss | ≤ 0.75 % BW/wk | 0.75–1.0 % BW/wk | > 1.0 % BW/wk |
| Gain (beginner) | ≤ 0.5 % BW/wk | 0.5–0.75 % | > 0.75 % |
| Gain (intermediate+) | ≤ 0.25 % BW/wk | 0.25–0.5 % | > 0.5 % |

Additional hard limits (§9): target BMI must be ≥ 18.5 (and ≤ 30 for gain goals), daily calories never below the floor, under-18 users capped at the "safe" column with no aggressive option.

**When infeasible**, the planner returns counter-offers instead of a plan:
1. **Same target, longer time:** `weeks = |y − x| / safeRate`.
2. **Same time, closer target:** `y' = x ± safeRate × weeks`.
3. (For loss) **Recomp option:** if BMI is normal and the user trains, suggest recomp at maintenance.

#### 5.1.2 Energy

```
BMR   = Mifflin-St Jeor (existing calcTargets)
TDEE  = BMR × activity factor           # replaced by adaptive TDEE after 14 days (§5.2)
delta = rateWk × 7700 / 7               # kcal/day; gain side × 1.0, loss side × 1.0
cal   = clamp(TDEE + delta, floor, ceiling)
```
`floor` = max(sex floor 1500/1300, BMR × 1.0). `ceiling` = TDEE + 700 (prevents "dirty bulk" numbers).

#### 5.1.3 Macros

| Goal | Protein g/kg* | Fat | Carbs |
|---|---|---|---|
| Cut / lose | 2.0–2.2 | ≥ 0.6 g/kg, ~25 % kcal | remainder |
| Recomp | 2.0 | ~25 % | remainder |
| Lean bulk / muscle gain | 1.8 | ~25 % | remainder (higher on training days) |
| Maintain | 1.6 | ~28 % | remainder |
| Endurance | 1.4–1.6 | ~25 % | remainder, 5–7 g/kg on heavy days |

*Reference weight is capped at BMI 25 for heavier users (existing logic). Training vs rest-day carb cycling is optional, default ±10 %.

#### 5.1.4 Phases

- **Cut > 12 weeks:** insert a 1–2 week maintenance "diet break" every 8–12 weeks.
- **Bulk > 24 weeks:** offer (default off for beginners) a 2–4 week mini-cut when the waist measurement rises > 4 cm or estimated body fat passes a threshold.
- **Every plan ends** with a 2-week maintenance phase ("lock it in").
- Phases are recomputed on each check-in; completed phases are frozen.

**Output:** `GoalPlan { id, type, start:{date,w}, target:{date,w}, rateWk, feasibility, phases:[{kind, startWk, endWk, calDelta, macros}], training:{planId}, milestones:[{wk, w}] }`

### 5.2 Adaptive check-in (weekly)

Runs every 7 days (and on demand) when ≥ 4 weigh-ins and ≥ 5 logged days exist in the window.

```
trend_w   = EMA(daily weights, α = 0.1)                 # smooths water swings
observed  = (trend_w[today] − trend_w[today−14]) / 2    # kg/week
intake    = mean(logged kcal over last 14 days, only days with ≥ 2 meals logged)
adaptTDEE = intake − observed × 7700 / 7
```

Decision:
- `observed` within ±40 % of `rateWk` → **on track**, no change.
- Off by > 40 % for **2 consecutive check-ins** → adjust calories by ±100–150 kcal (never more than 250 in one step), respecting floor and ceiling.
- If logging completeness < 70 %, say "log more to get an accurate adjustment" instead of changing numbers.
- Plateau flag: trend change < 0.1 kg over 3 weeks while the goal expects movement.

**Output:** `CheckIn { week, trendW, observedRate, expectedRate, adaptTDEE, decision, newTargets?, message }`

### 5.3 Day Plan

A `DayPlan` is the single source of truth for "what should I eat today". The Today and Plan tabs and the verdict engine all read it.

```
DayPlan {
  date, version, reason,                     # reason: "initial" | "menu-change" | "logged-off-plan" | "missed-meal" | "check-in"
  targets: {cal,p,c,f,fiber,water},
  meals: [{
    id: "breakfast" | "lunch" | "snacks" | "dinner" | "pre" | "post" | "bed",
    source: {kind: "mess"|"home"|"out"|"custom", messId?, menuVersion?},
    window: [start, end],
    budget: {cal, p},
    plate: [{name, servings, cal, p, c, f, fid?}],    # from planPlate
    topUps: [{fid, qty}],                              # from topUps
    status: "upcoming" | "logged" | "skipped" | "partial"
  }],
  notes: []                                  # e.g. "Protein-poor day: dinner has no protein dish"
}
```

**Budgeting:** each remaining meal's budget = remaining day budget × its share of `MEAL_SPLIT`, renormalised over meals not yet eaten (this generalises the current "budget adapts to what you've eaten" logic). Missed meals redistribute, capped so no single meal exceeds 45 % of daily calories.

### 5.4 Menu-change re-planning

**Triggers** (all produce a `MenuChange` event):

| Source | How it's detected |
|---|---|
| Committee publishes or edits a menu | Firestore `messes/{id}` snapshot; `version` field increments |
| Festival special created / edited | `specials` snapshot for that mess and date |
| User's personal menu edit | Local store event |
| "Not this today" on a meal | User types or snaps the served dishes (one-off day override) |
| Snap recognises dishes not on the planned menu | Snap result offers "Update today's lunch to what's on my plate?" |

**Re-plan algorithm:**
1. Find affected dates (today → +6 days) and meals **not yet logged**.
2. Recompute those meals' plates with `planPlate`; recompute top-ups for the day's new protein/calorie gap.
3. Diff old vs new `DayPlan` per meal: added/removed dishes, Δkcal, Δprotein.
4. If |Δprotein| ≥ 5 g or |Δkcal| ≥ 100 for any meal, show a `ChangeBanner` on Today ("Dinner changed: paneer → aloo. Protein −14 g, so we added 2 eggs at snacks."), and send a push notification if reminders are on and the meal is in the next 3 hours.
5. Bump `DayPlan.version` and record the `reason`. Old versions are kept for 7 days so "See why" can show the diff.

**Weekly view:** `WeekGrid` marks days whose planned protein from the mess alone is < 80 % of the target, so users can plan top-ups (buy eggs on Sunday).

### 5.5 Verdict engine ("Should I eat this?")

**Inputs:** candidate food(s) with portion · current `DayPlan` · today's logged totals · time · goal · diet/allergies · training day.

**Steps:**
1. **Hard blocks** → `skip`, with no override nudge: allergen match, diet conflict (veg user + chicken). Diet conflicts get a neutral "this has chicken" note, not moralising.
2. **Compute fit:**
   ```
   flex      = target.cal − eaten.cal − Σ(essential budget of remaining planned meals)
   share     = item.cal / max(flex, 1)
   pDensity  = item.p / item.cal × 100            # g protein per 100 kcal
   quality   = −(fried) −(added sugar > 15 g) −(sodium > 800 mg) +(fibre ≥ 5 g) +(pDensity ≥ 8)
   ```
   *Essential budget* = protein-carrying part of the remaining plates, so a snack can't eat the dinner protein.
3. **Decide:**

| Condition (goal = cut/lose) | Verdict |
|---|---|
| share ≤ 0.6 and quality ≥ 0 | **Go** |
| share ≤ 0.6 and quality < 0 | **Go**, with a tip |
| 0.6 < share ≤ 1.2 | **Go, smaller**: largest portion step (¼, ⅓, ½, ⅔, ¾) with share ≤ 0.6 |
| share > 1.2, and a same-meal alternative with share ≤ 0.6 exists | **Swap** |
| share > 1.2, no alternative | **Skip today**, with "if you do: adjustment" |

   For **gain/bulk** goals the logic flips: under-eating is the risk. Low-protein, high-calorie items get **Go + add protein**; a verdict is only **Skip** for hard blocks or when it would push the day > 125 % of target.
   **Maintain/recomp** uses symmetric thresholds (share ≤ 0.8 go, ≤ 1.4 smaller).
4. **Alternatives** come from, in order: the current meal's mess menu, the user's favourites, and the top-ups list, filtered by diet and allergies, ranked by fit.
5. **"If you eat it anyway":** re-run day budgeting with the item added; report the biggest single change to the remaining plan ("dinner rice ×1 → ×½").

**Output:** `Verdict { kind: "go"|"smaller"|"swap"|"skip", portion?, reasons:[code], numbers:{share, cal, p, after:{cal,p}}, alternatives:[...], ifAnyway:{changes:[...]} }`

The reason codes (`OVER_FLEX`, `LOW_PROTEIN_DENSITY`, `FRIED`, `ALLERGEN:peanut`…) are what the AI explainer turns into a sentence. The verdict itself is never decided by the LLM.

### 5.6 Snap pipeline

```
Camera ─► resize ≤1092 px, JPEG q0.8, EXIF stripped (canvas re-encode)
       ─► POST /ai/vision/meal  {image, mode, context}
             context = {meal, messId, menuCandidates[], diet, locale}
       ◄─ RecognitionResult (structured JSON, §7 schema)
       ─► match each item → food DB / mess menu (searchFoods + menu names)
             matched   → macros from DB × grams
             unmatched → model's per-100 g estimate, marked "≈ estimate"
       ─► NutrientTable + VerdictCard (§5.5) ─► user edits portions ─► log
```

- **Menu candidates are the accuracy multiplier.** On a mess day the model picks from a known list ("which of these 6 dishes are on this plate, and how much?") instead of open-ended recognition.
- **Portion estimation** uses plate/katori/steel-tray references in the prompt; returns grams + confidence. The UI defaults to the estimate and shows ½×–2× chips.
- **Non-food or unclear photo** → `is_food: false` or low overall confidence → "Couldn't see food clearly. Retake or search instead."
- **Label mode** extracts the per-100 g/per-serving table and serving size → creates a custom food (user confirms).
- **Menu mode** returns the same structure `menuparse.js` produces, then opens the existing review screen. Macros are still filled only from DB matches.
- **Photos are not stored** unless the user turns on "Keep food photos" (Firebase Storage, private path).

### 5.7 AI Coach (Ask tab chat)

- **v1 (P1):** each request carries a compact **context packet** (≤ 2 KB): profile summary, targets, today's totals, `DayPlan` (current and next meal), last check-in, current goal plan. Claude answers within the safety rules (§9). Numeric answers must cite packet values; if a question needs a verdict, the client runs the verdict engine first and passes the result in.
- **v2 (P2):** client-executed tools (`get_day`, `get_menu`, `search_food`, `evaluate_food`, `get_trend`). The gateway relays `tool_use` blocks to the client, the client runs them locally against its data and engine, and posts `tool_result` back. User data never has to live on the server.
- Coach cannot change targets or plans directly. It proposes changes, and the user taps to apply.

---

## 6. Data

### 6.1 Firestore model (v2 additions in **bold**)

| Path | Who | What |
|---|---|---|
| `users/{uid}` | owner | profile, targets, favourites, custom foods, saved meals, **allergies[], dietTags[], sources{}, locale, consents{}** |
| **`users/{uid}/goals/{goalId}`** | owner | `GoalPlan` (§5.1); `profile.activeGoalId` points to the current one |
| **`users/{uid}/checkins/{YYYY-Www}`** | owner | `CheckIn` (§5.2) |
| `users/{uid}/logs/{YYYY-MM-DD}` | owner | items, water, weight, sets; **items gain `src` (`search`/`mess`/`photo`/`label`/`barcode`/`voice`/`ai`), `conf`, `est` (bool), optional `micros{}`**; **`dayOverrides{meal: dishes[]}`**; **`measurements{}`** |
| **`users/{uid}/plans/{YYYY-MM-DD}`** | owner | `DayPlan` with `version`, `reason`, last 7 versions |
| **`users/{uid}/asks/{id}`** | owner | recent verdicts (optional history, 30-day TTL) |
| `messes/{messId}` | read all · write committee | weekly menu, **`version`, `updatedAt`, `updatedBy`, `changelog[]`** |
| `specials/{id}` | read all · write committee | unchanged |
| **`dishRatings/{messId_date_meal_dish}`** | signed-in create · aggregate read | 1–5 rating, "ate it / skipped" (P1) |
| **`aiUsage/{uid}/days/{date}`** | gateway only (Admin SDK) | request counts, tokens, cost (for rate limiting) |
| `leaderboard`, `reports`, `admins` | — | unchanged |

**Migration:** profile v1 → v2 runs on load (`profile.schema = 2`): map `goal`/`pace`/`goalWeight` into a first `GoalPlan`, default `allergies: []`, keep all v1 fields readable for one release. The existing test suite's guest/cloud flows must keep passing.

### 6.2 Local-first

The guest (localStorage) backend gets the same collections as keys. IndexedDB is used for the food DB v2 and plan history once localStorage nears quota (~5 MB).

### 6.3 Food database v2

- Keep the `F()`/`U()` builder format; extend `k` from `[kcal,p,c,f]` to an object for new entries: `{kcal,p,c,f,fib,sug,na,sfa, fe?,ca?,b12?,vd?,fol?}`. Old arrays are still accepted.
- **Sources:** IFCT 2017 (NIN, Indian Food Composition Tables) for raw ingredients and dishes, pack labels for brands, USDA FoodData Central for gaps, Open Food Facts at runtime.
- **Dish recipes:** common mess dishes defined as ingredient lists → computed per-serving macros. The data then shows *why* a value is what it is.
- **Portion units:** katori (150 ml), ladle, plate, piece, glass (250 ml), tbsp; stored per dish.
- Target: 387 → ~1,200 foods by end of P1, prioritising what students actually log (from anonymous aggregated search-misses, opt-in).

---

## 7. AI architecture — entirely free, bring-your-own-key

**Decision (supersedes an earlier Claude-funded-by-the-app draft):** Fuel & Forge v2 must cost **$0 to run at any scale**. The app never buys AI tokens for anyone. Instead, each user supplies their own free Google AI Studio API key for Gemini, which comes with a genuinely free daily quota, and the gateway calls Gemini on their behalf. No key, no Snap/Coach — the rest of the app (goal planner, verdict engine, menu logic, search, barcode) needs no key and no network at all, so the app is fully usable with zero setup and zero cost either way.

This is a deliberate provider switch from the Claude-based draft: Anthropic's API has no free tier at real volume, so it cannot satisfy "entirely free" for an app the owner doesn't want to fund. Gemini's free tier is the one mainstream vision-capable LLM API that's actually free to call, which is why it's the BYOK provider here.

### 7.1 Bring-your-own-key model

```
User's Google account ──► AI Studio (aistudio.google.com) ──► free API key (starts with "AIza")
                                                                      │
                                                                      ▼
PWA ──(Firebase ID token + the user's own Gemini key, encrypted)──► AI Gateway (Cloudflare Worker) ──► Gemini API
                                  │
                                  ├─ verify Firebase ID token (JWKS, issuer/audience = projectId)
                                  ├─ decrypt the caller's own Gemini key (never the app's key — there isn't one)
                                  ├─ per-user pacing against Gemini's own free-tier limits (§7.3), not a spend cap
                                  ├─ attach versioned system prompt + JSON schema
                                  ├─ validate response against schema; one retry on failure
                                  └─ log {uid hash, route, tokens, latency, model} — no images, no text, no key
```

- **Setup, once per user:** You → **Me/You tab → AI features → Get a free key** opens `aistudio.google.com/apikey` in a new tab with a short explainer ("free, no card, takes 30 seconds"); the user pastes the key back into the app. The key is sent once to the gateway, encrypted at rest (e.g. with a Worker secret as the KMS key) and never shown again in full (masked as `AIza••••1a2b`). Users can replace or remove it any time.
- **Why the gateway still exists** even though there's no app-funded API cost: (a) the frontend is a static site and must never hold anyone's key in a way that leaks through logs/analytics/screenshots — a thin relay still keeps the key server-side between the browser and Gemini; (b) it's where the versioned prompts, schemas and response validation live, same as before; (c) it normalises errors (quota hit, bad key, model retired) into one friendly shape for the client. It does **not** need a spend cap, because the app is never billed.
- **Hosting stays on free tiers throughout:** Cloudflare Workers free plan (100k requests/day — plenty), Firebase Spark plan (Auth + Firestore, already in use), GitHub Pages. Nothing in this architecture requires a paid plan anywhere.
- **No key, graceful degradation, not a wall:** Snap and Coach show a one-line "Add a free key to use this" card with the setup link; every other feature (goal planner, "should I eat this?", menus, logging, training, progress) works normally with no key at all. Guest (no-account) users can still add a key and use AI features offline-account-free, since the key — not an app account — is what gates AI usage.
- **Multiple users, one device/app, zero shared cost:** because each user's own key pays for their own calls, there is no "whose bill is this" problem and no incentive to ration one user's usage against another's — pacing exists only to stay under *that user's* Gemini quota, not to protect app funds.

**Routes** (same shapes as the original Claude-based design — only the backend model changed):

| Route | Purpose | Output |
|---|---|---|
| `POST /ai/vision/meal` | Plate photo → items + portions | `RecognitionResult` |
| `POST /ai/vision/label` | Nutrition label → per-100 g table | `LabelResult` |
| `POST /ai/vision/menu` | Menu chart photo → week | `MenuResult` (same shape as `menuparse`) |
| `POST /ai/parse/ask` | Free text "can I have 2 samosas at 5pm?" → items + quantities + intent | `AskIntent` |
| `POST /ai/explain/verdict` | Verdict JSON → 1–3 sentence explanation | `{text}` |
| `POST /ai/coach` | Chat turn with context packet | streamed text |
| `POST /ai/explain/checkin` | CheckIn JSON → weekly summary | `{text}` |

### 7.2 Model & API usage

- **Model:** `gemini-2.5-flash` (vision, structured JSON output, fast, and — as of this writing — the model with a genuinely free API tier; confirm the current free-tier model name in Google AI Studio at build time, since Google has retired free-tier models before, e.g. 2.0 Flash in March 2026). The model ID is a single config value in the gateway.
- **Structured outputs:** `generationConfig.responseMimeType: "application/json"` + `responseSchema` (a JSON Schema, not Zod — Gemini's SDK takes the schema directly) for every route except coach chat.
- **SDK:** `@google/genai` (the current official Google Gen AI SDK for both the Gemini Developer API and Vertex) inside the worker. **Verify the exact field names (`responseSchema` vs. `responseJsonSchema`) and import paths against the live `@google/genai` docs before writing gateway code** — this is an actively-changing SDK and sources disagree even within 2026.
- **Images:** client resizes to ≤ 1024 px on the long edge, sent as inline base64 `inlineData` parts (`image/jpeg`) before the text part, same resize step as before.
- **Streaming** for coach chat only (`generateContentStream`).
- **No refusal-fallback or prompt-caching machinery to port over** — those were Claude-specific; Gemini's own safety settings and context caching (optional, not required at this request volume) are the equivalents if needed later.

### 7.3 Free-tier limits & pacing (verify at build time — these move)

Google publishes free-tier limits **per Google Cloud project** (i.e. per user's own key), not globally, and they've changed shape at least once already in 2026 (model retirements, RPD figures that vary by source). As of writing, `gemini-2.5-flash` free tier is roughly **10 requests/minute, 250k tokens/minute, and a few hundred requests/day** — treat these as approximate and check `https://ai.google.dev/gemini-api/docs/rate-limits` (or the user's own AI Studio console) before shipping, not this document.

**Gateway pacing (per user, against their own key, not a spend cap):**
- Client-side: disable the Snap/Ask/Coach buttons with a short cooldown after a call, sized to the free tier's RPM so a user doesn't burn their own daily quota on accidental double-taps.
- Gateway-side: a small per-key token-bucket (Workers KV) that mirrors Gemini's stated RPM/RPD, so a `429` from Google becomes a friendly "You've used today's free AI quota — try again tomorrow, or keep logging by search" instead of a raw error. This protects the user's own quota, not the app's money, so there's no reason to make it stingy.
- A heavy user (a few snaps + several asks a day) is well inside even the lower published daily caps; the limiting factor in practice is minute-level bursts (several snaps back-to-back), which the cooldown above handles.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Today renders < 100 ms from cache; full engine recompute < 30 ms for a day, < 150 ms for a week. Snap: P50 < 5 s, P95 < 10 s end-to-end. |
| **Offline** | All logging, plans, verdicts and the mess menu work offline. AI calls queue with a clear "will analyse when online" state, or fall back to search. |
| **Build** | Frontend stays no-build ES modules on GitHub Pages. Gateway is the only built artefact. |
| **Accessibility** | WCAG 2.2 AA; screen-reader labels on all icon buttons; status never colour-only; reduced motion. |
| **i18n** | All UI strings in `js/i18n/{lang}.js`; numbers formatted per locale (`en-IN` default). |
| **Testing** | Engines: Node unit tests (no DOM) with fixtures. UI: the existing Playwright suite (`test/run.cjs`) extended. AI: eval suite (§10.3). |
| **Observability** | Gateway logs latency, tokens, schema-failure rate and refusal rate per route; no PII or images in logs. |

---

## 9. Safety, health & privacy

### 9.1 Health guardrails (enforced in engines, mirrored in prompts)

- **Calorie floors:** never below max(1500 ♂ / 1300 ♀, BMR). No plan, verdict or coach answer may recommend going lower.
- **Rate caps:** §5.1.1 table; targets below BMI 18.5 are never offered.
- **Under 18:** no deficits beyond "safe"; no aggressive bulk; protein ≤ 1.6 g/kg; copy suggests involving a parent, doctor or coach.
- **Eating-disorder signals:** repeated very-low-intake days (< 60 % of target for 5 of 7 days), frequent "should I eat" asks resulting in skip, rapid weight loss beyond plan, or concerning free text (e.g. purging, "punish") → the app stops recommending further restriction, shows a gentle check-in card with support resources (India: Tele-MANAS **14416**), and offers to switch to a maintenance plan. The coach prompt mirrors this.
- **Medical conditions** (diabetes, PCOS, kidney disease, pregnancy): the app gives general guidance only, tells the user to follow their clinician, and disables aggressive options.
- **Supplements:** only common, evidence-backed basics (protein powder, creatine monohydrate, vitamin D/B12 with testing); never fat-burners, never dosing outside label guidance.
- **"Not medical advice"** footer on plans and AI answers, written to be read, not legal boilerplate.

### 9.2 Privacy

- Health data is personal data under India's **DPDP Act 2023**: explicit consent at onboarding for (a) storing health data and (b) sending photos/text to an AI provider; both can be withdrawn in settings.
- Photos are processed and discarded by default; the gateway never logs image bytes or user text.
- Before launch, confirm the AI provider's current data-use and retention terms and reflect them accurately in the privacy notice.
- Export (JSON/CSV, exists) and **delete my account and all data** (new, P0).
- Leaderboard and dish ratings stay opt-in and show first names only.

---

## 10. Quality & success

### 10.1 Product metrics

| Metric | Target (90 days after launch) |
|---|---|
| D7 / D30 retention | 45 % / 25 % |
| Days logged per active week | ≥ 5 |
| Meals logged via Snap or one-tap plate | ≥ 60 % |
| Users with an active goal plan | ≥ 70 % |
| Users on track at check-in (±40 % of planned rate) | ≥ 50 % |
| "Should I eat" verdicts followed (logged the suggested option) | ≥ 40 % |

### 10.2 Engine acceptance tests (examples)

- 60 → 70 kg in 8 months, male 20 y, beginner → *realistic lean bulk*, ~0.29 kg/wk (0.48 % BW), ≈ +320 kcal, ends with a 2-week maintenance phase.
- 80 → 60 kg in 2 months → *not offered* (≈ 2.9 % BW/wk); counter-offers ≈ 8 months or −5 kg.
- Female, 50 kg, 160 cm, target 45 kg → BMI 17.6 → target refused, maintenance/recomp offered.
- Cutter, 600 kcal flex left, chicken biryani 350 g (~700 kcal) → **Go, smaller**, portion ≈ ½, with "if anyway" adjustment.
- Bulker, 1,400 kcal left at 6 pm, biryani → **Go**, plus add raita/egg for protein.
- Veg user asks about chicken roll → **Skip** (diet), neutral copy, veg alternative offered.
- Dinner menu changes paneer butter masala → aloo gobi → protein −14 g → snacks gains a top-up and a banner shows.

### 10.3 AI evals

A versioned set (`ai-gateway/evals/`) of ≥ 150 labelled photos (mess plates, thalis, packaged snacks, labels, menu charts, non-food, blurry) plus ≥ 100 free-text asks. Measured per prompt version:

- Item recall/precision vs labels; with menu candidates, recall ≥ 90 %.
- Portion error: median absolute grams error ≤ 25 %.
- Schema-valid rate ≥ 99.5 %; refusal rate on normal food < 0.5 %.
- Explainer: never contradicts the verdict JSON, never states numbers not in the input, follows safety rules on 100 % of the red-team set.

---

## 11. Out of scope for v2

Native iOS/Android apps (the PWA stays; a Capacitor wrapper is a later option), wearable sync, paid coach marketplace, clinical/medical nutrition therapy, payments.

## 12. Open questions

1. Gateway host: Cloudflare Worker (recommended) vs Firebase Functions on Blaze.
2. AI access for guest mode: none, a 3-snap trial, or full access with device-level limits?
3. Who funds AI costs at scale: free with caps, a mess-committee sponsorship, or a small premium tier?
4. Do mess committees want the nutrition scorecard to be public to students or private to the committee?
5. Should "Keep food photos" exist at all in v2, or wait until there's a clear use (progress diary)?
