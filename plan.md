# Fuel & Forge v2: Build Plan

> Implements [spec.md](spec.md). Each phase has a ready-to-paste build prompt in [prompts.md](prompts.md) (Part A).
> **Rule for every phase:** the app stays shippable. `node test/run.cjs` passes at the end of each phase, the README is updated, and nothing breaks for existing guest or cloud users.

---

## Overview

| Phase | Name | Delivers | Depends on | Size |
|---|---|---|---|---|
| 0 | Foundations | Engine folder, unit-test runner, profile v2 migration, feature flags | — | S |
| 1 | Interface redesign | New IA (Today · Plan · Snap · Ask · Progress), design system v2, components | 0 | L |
| 2 | Goal Planner & check-ins | X→Y in Z months, feasibility, phases, adaptive TDEE | 0 | M |
| 3 | Day Plan & menu-change re-planning | `DayPlan` object, versions, diffs, change banners, week grid | 0, 2 | M |
| 4 | Verdict engine ("Should I eat this?") | Deterministic go/smaller/swap/skip, Ask tab offline | 3 | M |
| 5 | AI Gateway | Cloudflare Worker, auth, rate limits, schema validation, evals harness | 0 | M |
| 6 | Snap | Meal photo → nutrient table → verdict; label & menu photo modes | 1, 4, 5 | L |
| 7 | AI explanations & Coach | Verdict explainer, free-text asks, check-in summary, coach chat | 4, 5 | M |
| 8 | Nutrition depth | Food DB v2 (fibre, sodium, micros), allergies, special diets, fasting modes | 0 | L |
| 9 | Community & committee | Dish ratings, menu scorecard, friend challenges | 3 | M |
| 10 | Hardening & launch | Privacy/consent, delete-account, a11y audit, i18n, perf, safety red-team | all | M |

Phases 1, 2 and 5 can run in parallel after Phase 0. Phase 8 can run any time after Phase 0.

**MVP cut (launchable v2):** Phases 0–6 plus the P0 parts of 10 (consent, delete account, safety guardrails).

---

## Phase 0: Foundations

**Goal:** make the codebase ready for engines and v2 data without changing behaviour.

### Tasks
1. Create `js/engine/` and move pure logic there (re-export from old paths so nothing breaks):
   - `js/engine/targets.js` ← `calcTargets`, `targetsFor`, `weeksToGoal`
   - `js/engine/plate.js` ← `planPlate`, `topUps`, `estFat`, `dietOf`, `dietAllows`
   - `js/nutrition.js` keeps re-exports for one release.
2. Add a no-dependency Node unit-test runner: `test/unit/*.test.mjs` (uses `node:test` and `node:assert`), run with `npm test` (`node --test "test/unit/*.test.mjs"`; Node 24 needs the glob, a bare directory fails). A root `package.json` with `"type": "module"` lets Node load the browser ES modules without warnings; it has no dependencies.
3. Profile schema v2 migration in `js/store.js`:
   - `profile.schema = 2`; new fields `allergies: []`, `dietTags: []`, `sources: {}`, `locale: 'en-IN'`, `consents: {}`, `activeGoalId: null`.
   - `migrateProfile(p)` is a pure, idempotent function with tests (v1 → v2, v2 → v2).
4. Feature flags: `js/flags.js` reading `localStorage['ff.flags']` + defaults, so unfinished features ship dark.
5. Add `version`, `updatedAt` and `updatedBy` to menu publishing in `js/store.js`; tolerate missing fields when reading old docs. `firestore.rules` needs no change: the `messes` rule gates on who is writing, not on field names.

### Acceptance
- `npm test` runs ≥ 15 tests covering targets, plate planner and migration.
- `node test/run.cjs` is still green.
- A v1 guest profile in localStorage loads and is migrated with no visible change.

---

## Phase 1: Interface redesign

**Goal:** spec §4. Same features, new structure and look. No new engines yet; placeholders where later phases plug in.

### Tasks
1. **Design tokens** (`css/app.css`): semantic status tokens (`--go`, `--caution`, `--swap`, `--stop`), type scale 12/14/16/20/28/36, 4-pt spacing tokens, remove the animated aurora, add a `prefers-reduced-motion` block. Keep accent swaps and light/dark parity.
2. **Navigation** (`js/app.js`): routes `today`, `plan`, `snap` (opens CameraSheet; for now the existing log sheet with a camera button), `ask`, `progress`, plus `you` reached from an avatar button. Keep old hashes (`#/mess`, `#/train`, `#/stats`, `#/me`) redirecting to their new homes.
3. **Components** (`js/components/*.js`): `FocusCard`, `PlateList`, `NutrientTable`, `VerdictCard` (static states for now), `ChangeBanner`, `ConfidenceBadge`, `PortionChips`, `WeekGrid`, `GoalChart` (wraps the existing `lineChart`).
4. **Today** (`js/views/today.js`): one budget line + single progress bar, *Next meal* FocusCard with the suggested plate and "Log this plate", collapsible log, compact water/workout row. Move the timeline to Plan.
5. **Plan** (`js/views/plan.js`, new): goal summary (placeholder until Phase 2), week tabs → per-day meals from the current menus, mess menu editor entry, training plan (moved from Train), routine timeline.
6. **Progress** (`js/views/progress.js` ← `stats.js`): weight trend first, then calories, macros, consistency, PRs, badges.
7. **You** (`js/views/you.js` ← `me.js`): profile, goal, diet & allergies, theme, account, admin.
8. **Ask** (`js/views/ask.js`, new): search box + "Should I eat…?" placeholder that shows the food's macros and how much of today's remaining budget it uses (the real verdict arrives in Phase 4).
9. Replace emoji in nav/headings/buttons with SVG icons; keep emoji in content.
10. Desktop: rail with the five destinations; Today becomes a two-column layout at ≥ 1024 px.

### Acceptance
- Every v1 feature is reachable within 2 taps of where a v1 user would look (checklist in PR description).
- Playwright suite updated for new selectors and green; add tests for old-hash redirects.
- Lighthouse a11y ≥ 95 on Today, Plan and Progress; no text < 12 px; all icon buttons labelled.
- Screenshots of Today/Plan/Ask/Progress in light and dark, at 390 px and 1280 px, attached to the PR.

---

## Phase 2: Goal Planner & check-ins

**Goal:** spec §5.1–5.2.

### Tasks
1. `js/engine/goal.js`: `assessGoal(input)` → `{rateWk, ratePct, feasibility: 'safe'|'aggressive'|'blocked', reasons, counterOffers}`; `buildGoalPlan(input)` → `GoalPlan` with phases and milestones; `projectWeight(plan, week)`.
2. `js/engine/checkin.js`: `trendWeights(days)` (EMA α=0.1), `adaptiveTDEE(days)`, `runCheckIn(plan, days, prevCheckIns)` → `CheckIn`.
3. Safety constraints from spec §9.1 implemented *inside* these functions (floors, BMI, under-18), with tests.
4. Store: `users/{uid}/goals/{id}`, `users/{uid}/checkins/{week}`; guest equivalents; rules updated.
5. UI: Goal Planner sheet (From / To / In months or By date; experience level), live feasibility + chart + phases + Day-1 targets; counter-offer chips when blocked. Onboarding uses the planner as its goal step.
6. Weekly check-in card on Today (when due) and a check-in history on Progress; the goal chart shows actual trend vs plan line with phase bands.
7. Training plan auto-suggested from goal + experience (existing `data/workouts.js`).

### Acceptance
- All spec §10.2 goal examples pass as unit tests, plus edge cases: zero change, maintain, target already reached, 1-month windows, 24-month windows, heavy users (BMI > 30), under-18.
- Check-in: synthetic 28-day datasets (on-track, stalled, too-fast, sparse-logging) produce the expected decisions.
- Existing users get a `GoalPlan` generated from their v1 `goal`/`pace`/`goalWeight` with no target change on day 1.

---

## Phase 3: Day Plan & menu-change re-planning

**Goal:** spec §5.3–5.4.

### Tasks
1. `js/engine/dayplan.js`: `buildDayPlan({date, profile, targets, menus, logged, routine})` → `DayPlan`; `rebudget(dayPlan, logged)` (redistribute after logs/missed meals, 45 % meal cap); `diffDayPlans(a, b)` → per-meal changes.
2. `js/planner.js` (stateful glue): holds current `DayPlan`s for today + 6 days, listens to store events (`menu`, `special`, `day`, `profile`, `override`), re-plans only affected dates/meals, bumps versions, persists to `users/{uid}/plans/{date}` (keep the last 7 versions).
3. "Not this today" flow on any planned meal: type dishes (reuse quick-log parser + menu dish names) → `dayOverrides` on the log doc → re-plan.
4. `ChangeBanner` on Today with "See why" sheet (diff view); notification when the meal is within 3 h and reminders are on (extend `js/routine.js`).
5. `WeekGrid` on Plan: 7 days × meals, cells shaded by planned protein coverage; tapping a day opens that day's plan.
6. Replace scattered `planPlate`/`topUps` calls in views with reads from the planner.

### Acceptance
- Unit tests: menu edit on a future day re-plans only that day; edit to an already-logged meal doesn't change it; skipped breakfast redistributes within caps; special overrides regular menu.
- Playwright: admin edits tonight's dinner in one browser context → student context shows the banner within 2 s (using the existing Firebase mock).
- No view calls `planPlate` directly any more (grep check in tests).

---

## Phase 4: Verdict engine ("Should I eat this?")

**Goal:** spec §5.5, fully offline.

### Tasks
1. `js/engine/verdict.js`: `evaluate({items, dayPlan, logged, profile, now})` → `Verdict`, using the per-goal threshold tables; portion steps ¼ ⅓ ½ ⅔ ¾; alternatives ranked from current meal menu → favourites → top-ups; `ifAnyway` via `rebudget`.
2. Reason codes + a **template explainer** (`js/engine/verdict-copy.js`) that produces the 1–3 sentence explanation without AI, so offline still gets good copy. The AI explainer in Phase 7 is an upgrade, not a dependency.
3. Ask tab: search or quick-type one or more foods with quantities → `VerdictCard` with actions (*Log suggested*, *Log anyway + adjust*, *Log swap*). Recent verdicts list.
4. Entry points: long-press any food in search results → "Should I eat this?"; the log sheet shows a small verdict chip before confirming an off-plan item.
5. Diet/allergy hard blocks (allergies arrive fully in Phase 8; wire the field now).

### Acceptance
- Spec §10.2 verdict examples pass, plus a table-driven test of ≥ 40 cases across cut/bulk/maintain, morning/evening, training/rest day.
- A property test: a "go" verdict never takes the day over 110 % of target (cut) or the floor is never violated by an `ifAnyway` plan.
- Ask works with the network off.

---

## Phase 5: AI Gateway (free, bring-your-own-key)

**Goal:** spec §7.1–7.3. Infrastructure only; features arrive in Phases 6–7. The app funds nothing — every call runs on the calling user's own free Gemini key.

### Tasks
1. `ai-gateway/` (TypeScript, Cloudflare Worker, `wrangler`): `package.json` with `@google/genai`, `jose`. No Zod — Gemini takes a plain JSON Schema for structured output, so schemas are hand-written JSON Schema objects (shared between the gateway and the eval harness), not Zod models.
2. Middleware: CORS (allow the GitHub Pages origin + localhost), Firebase ID-token verification (`jose` + Google securetoken JWKS, `iss = https://securetoken.google.com/<projectId>`, `aud = <projectId>`), per-uid key store (Workers KV, the user's Gemini key **encrypted** with a Worker secret, never logged or echoed back in full), per-uid pacing against Gemini's free-tier RPM/RPD (no spend cap — there's no spend), request size limits (images ≤ 1.5 MB).
3. `src/gemini.ts`: one wrapper that takes `{route, system, schema, content, apiKey}`, calls `@google/genai`'s `generateContent` with `model` from env (default `gemini-2.5-flash` — **confirm the current free-tier model name in Google AI Studio before building; Google has retired free models before**), `generationConfig: { responseMimeType: "application/json", responseSchema: schema }`, the caller's own decrypted key, catches `429` (quota) and maps it to a friendly "quota exhausted, try again tomorrow" error, validates the parsed JSON against the schema, retries once on a parse/validation failure, and returns `{ok, data | error}`. **Read the live `@google/genai` docs for the exact field names before writing this** — `responseSchema` vs `responseJsonSchema` and the import path have both appeared in different SDK versions.
4. `src/prompts/*.ts`: versioned prompt constants (copied from prompts.md Part B), each with `id` and `version` logged with every call.
5. Logging: route, prompt version, tokens in/out, latency, whether the call hit a quota error. No user text, no images, no key — ever.
6. `ai-gateway/evals/`: harness that runs a route over a labelled set and prints metrics (spec §10.3), using a dedicated test Gemini key (free tier) kept out of git. Seed with 30 examples per vision route.
7. Client: `js/ai.js`: `aiCall(route, payload)` adds the Firebase ID token, handles offline/401(no-key)/429(quota)/network errors with friendly states, resizes images (`canvas`, ≤ 1024 px, JPEG 0.8). `js/aikey.js`: save/replace/remove flow for the user's own key, masked display, a "Get a free key" link to `aistudio.google.com/apikey`.
8. Secrets: a single Worker secret used only as the encryption key for stored user Gemini keys (`wrangler secret put KEY_ENCRYPTION_SECRET`) — there is no `GEMINI_API_KEY` secret for the app itself, because the app has none. README deploy section explains this explicitly so nobody mistakenly provisions a paid shared key.

### Acceptance
- Unauthenticated / expired-token / wrong-project requests get 401; a request with no stored Gemini key gets a distinct "add your key" error, not a generic 401.
- A user's key hitting Gemini's own daily quota surfaces as a friendly "today's free quota is used up" message, not a raw 429.
- A smoke route `POST /ai/ping` (using a test key) returns a schema-valid JSON object from Gemini.
- `wrangler dev` + the app on localhost works end to end with a real free AI Studio key; README documents deploy and the user-facing key setup flow.
- Confirm in the PR description that no file, log line or git history contains a Gemini key — the app's own or a test one.

---

## Phase 6: Snap

**Goal:** spec §5.6. The headline feature.

### Tasks
1. `CameraSheet` (`js/components/camera.js`): `<input type="file" accept="image/*" capture="environment">` as the universal path; `getUserMedia` live preview where supported; mode tabs Meal · Label · Menu · Barcode (barcode reuses the existing scanner).
2. Gateway routes `/ai/vision/meal`, `/ai/vision/label`, `/ai/vision/menu` with prompts B1–B3 and their JSON Schemas.
3. Client matching (`js/engine/match.js`): recognised name → menu candidate (exact/fuzzy) → food DB (`searchFoods`) → estimate fallback; grams → macros; confidence → badge.
4. Snap result screen: thumbnail, editable items (portion chips/stepper, rename, delete, add missed), `NutrientTable` (total vs remaining), live `VerdictCard`, actions *Log all* / *Log suggested portion*.
5. "Update today's menu to what's on my plate?" when recognised mess dishes aren't on the planned menu → day override → Phase 3 re-plan.
6. Label mode → prefilled custom-food form. Menu mode → the existing paste-a-week review screen, prefilled.
7. Offline: queue the photo (IndexedDB) with "Analyse when online", or offer search.
8. Evals: grow to ≥ 150 photos; record metrics per prompt version in `ai-gateway/evals/RESULTS.md`.

### Acceptance
- Eval targets from spec §10.3 met (recall ≥ 90 % with menu candidates, median portion error ≤ 25 %, schema-valid ≥ 99.5 %).
- P95 end-to-end < 10 s on a mid-range Android over 4G (manual test log in the PR).
- Non-food, blurry and dark photos give a retake prompt, never a fabricated table.

---

## Phase 7: AI explanations & Coach

**Goal:** spec §5.7 and AI upgrades for verdicts and check-ins.

### Tasks
1. `/ai/parse/ask` (prompt B4): free text → `AskIntent` (items, quantities, when, compare-vs). The client then runs the verdict engine locally.
2. `/ai/explain/verdict` (prompt B5): verdict JSON → explanation; falls back to the template copy on any error. Eval: never contradicts the verdict, never introduces new numbers.
3. `/ai/explain/checkin` (prompt B7): weekly summary card on Progress.
4. `/ai/coach` (prompt B6): streamed chat with the context packet; proposals ("raise to 2,900 kcal?") come back as structured suggestion chips the user must tap to apply.
5. Safety: red-team set (≥ 60 prompts: crash diets, purging, minors, medical conditions, steroids/fat-burners) must pass 100 % before the flag is turned on.

### Acceptance
- Coach answers cite only packet numbers (spot-check script compares numbers in replies against the packet).
- Red-team suite passes; ED-signal flow from spec §9.1 triggers in both the engine and the coach.

---

## Phase 8: Nutrition depth

### Tasks
1. Food DB v2 format (object `k` with fibre, sugar, sodium, sat fat, optional micros) with backwards-compatible readers.
2. Data work: IFCT-based ingredient table; recipe-defined mess dishes; portion units (katori, ladle, piece, glass); grow to ~1,200 foods. Script `tools/build-foods.mjs` validates every entry (macro energy check: |4p+4c+9f − kcal| ≤ 15 %).
3. Allergies/intolerances as hard filters everywhere (plate planner, top-ups, alternatives, Snap warnings).
4. Diet patterns: vegan, Jain, no-beef/pork, halal tags on foods and dishes.
5. Fasting modes (Navratri, Ramadan, Ekadashi, IF windows) as day-plan constraints with their own meal windows.
6. Micronutrient watch (iron, B12, calcium, vitamin D) on Progress for vegetarians, with food-first suggestions.

### Acceptance
- The data validator runs in the unit tests; zero entries fail.
- A peanut-allergic user is never suggested peanut items in any engine (property test over the whole DB).

---

## Phase 9: Community & committee

### Tasks
1. Dish ratings after a logged mess meal (1 tap, optional) → `dishRatings`, aggregated per dish.
2. Committee dashboard: menu nutrition scorecard (protein per day, fried count, veg protein coverage, repeat dishes), top/bottom rated dishes, suggestions ("Tuesday dinner has no protein dish for veg students").
3. Friend challenges (protein streak, logging streak) built on the existing leaderboard.
4. Rules: ratings writable once per user per dish per day; aggregates readable by signed-in users.

---

## Phase 10: Hardening & launch

### Tasks
1. Consent screens (health data; AI processing) with withdraw options; privacy notice; "Delete my account and data" (Firestore recursive delete via the gateway's Admin SDK route, plus Auth user deletion).
2. i18n: extract strings to `js/i18n/en.js`; add `hi` first, then `te`, `ta`, `kn`, `ml`.
3. Accessibility audit (keyboard, screen reader on Android TalkBack, contrast in both themes).
4. Performance: engine benchmarks in unit tests (day < 30 ms, week < 150 ms), service worker caches new modules, IndexedDB for food DB v2.
5. Observability dashboard for the gateway (quota-exhausted rate, schema failures, P95 latency) — no cost dashboard needed, since the app has no AI spend.
6. Beta with one mess (≈ 50 students) for 3 weeks → fix list → campus launch.

### Launch checklist
- [ ] All unit, browser and eval suites green
- [ ] Firestore rules deployed and tested against the real project (not just the mock)
- [ ] Gateway key-encryption secret set; confirmed no app-funded AI key exists anywhere; per-user key pacing verified against current Gemini free-tier limits
- [ ] Privacy notice reviewed; provider data terms checked
- [ ] Safety red-team at 100 %
- [ ] README and in-app help updated

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Photo portion estimates are poor for mixed Indian dishes | Wrong numbers, lost trust | Menu candidates as context, user-editable portions, "≈ estimate" badges, eval-gated prompt changes |
| Google retires or shrinks the free Gemini tier (it's happened before — 2.0 Flash, March 2026) | Snap/Coach break for everyone at once | Model ID is one config value; evals re-run against any replacement free model before switching; graceful "AI temporarily unavailable, search still works" fallback; because it's BYOK, there's no bill to renegotiate — just a model swap |
| A user's own Gemini key hits its free quota mid-day | That one user loses AI features until reset | Client-side cooldown to avoid burning quota on accidental taps; friendly "today's free quota used, try tomorrow" message; every non-AI feature keeps working |
| Menu data is wrong/stale | Bad plans | "Not this today" one-tap fix, reports, committee versioning, Snap-detected mismatches |
| Users with disordered eating use "should I eat" to restrict | Harm | Engine floors, ED-signal detection, coach safety prompt, red-team gate |
| No-build frontend gets unwieldy as it grows | Slower development | `js/engine/` + `js/components/` structure, unit tests, keep modules < 500 lines |
| Firebase free-tier limits | Outage at scale | Batched writes, plan docs only for ±7 days, monitor usage; Blaze plan when needed |
