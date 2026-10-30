# Fuel & Forge — Campus Nutrition & Training

A campus-first nutrition and training app for students who want to **gain, lose or maintain weight**, built around hostel messes (AV, BV, BNV, CV, CNV, DV, EV), canteen food and packaged snacks.

Vanilla HTML/CSS/JS ES modules, no build step, so it still deploys straight to GitHub Pages. Firebase provides accounts and sync. Everything also works offline in guest mode.

## The interface

Five places, one tap each: **Today · Plan · Snap · Ask · Progress**, plus **You** behind your avatar.

- **Today** answers "what do I do next?": a plate gauge for calories (the rim fills as you eat), three katoris for protein, carbs and fat, one focus card for your next mess meal with a suggested plate you can nudge (×½ steps) and log in one tap, then water, weight, workout and your log.
- **Plan** is the week: your goal and weight trend, a 7-day grid showing which meals are light on protein, each day's suggested plates, the mess menus, your training plan and your daily routine.
- **Snap** (the big centre button) logs food. Barcode scanning works offline. Meal, label and menu photos run on your own free Google AI key (see *AI features*). Hold the button to jump straight to search.
- **Ask** answers "should I eat this?": go, smaller, swap or skip, worked out offline from what's left of your day, with what changes if you eat it anyway.
- **Progress** puts the weight trend first, then calories, macros, consistency, spending, badges and the leaderboard.

The look is "Thali": warm charcoal or cream surfaces, an ember accent (or saffron, herb, berry, indigo), Fraunces for headings and numbers, Figtree for everything else, and inline SVG art (the thali, the plate gauge, the katoris, a kolam motif) so it themes with light and dark and works offline. Every screen passes an axe WCAG 2 A/AA check in both themes.

## Features

**Should I eat this? (works offline)**
- Search a food or type a plate ("2 eggs and a glass of milk") on **Ask**, or hold any search result in the log sheet. The verdict engine works out your *flex* (target minus eaten minus the protein-carrying part of the meals still to come) and answers **Go**, **Go smaller** (¼ ⅓ ½ ⅔ ¾), **Swap** or **Skip today**, with alternatives from today's menu, then your favourites, then top-ups, and the single biggest change to your remaining plan if you eat it anyway. Bulkers get the opposite logic: protein nudges, and a skip only past 125 % of target.
- Hard blocks (diet, allergy, diet pattern, fast) are neutral and never offer an override. The calorie floor beats every "smaller" or "skip". If warning signs of disordered eating show up (five very-low days in a week, repeated skips, rapid loss, concerning words) the app stops suggesting restriction and shows a gentle card with Tele-MANAS (14416).
- The verdict is never decided by AI. Plain-language copy comes from templates; with the optional AI the sentence is rephrased only if it passes checks (no new numbers, no contradiction, under 60 words).

**Personal plan**
- 60-second onboarding covering goal, body stats, a target and timeline, activity level, diet (veg / egg / non-veg), mess, training plan and daily rhythm
- Targets are calculated with Mifflin-St Jeor BMR × activity, plus a surplus or deficit from your pace, with protein scaled to your goal. You can override any target by hand.
- **Goal Planner**: "60 → 70 kg in 8 months" gets a live verdict (realistic / aggressive / not offered) from body-weight-percentage rate limits, a BMI floor of 18.5, a calorie floor of max(1500 ♂ / 1300 ♀, BMR) and extra care under 18. An unsafe ask returns counter-offers ("same target in about 8 months", "−5 kg in 2 months"), never a plan. Plans have phases: diet breaks on long cuts, an optional mini-cut on long bulks for non-beginners, and a 2-week maintenance phase at the end. Targets follow the current phase.
- **Weekly check-in**: every 7 days it compares your weight trend (EMA, α = 0.1) with the plan, estimates what you actually burn from intake vs trend, and after two off weeks in a row nudges calories by 100–150 kcal (never more than 250, never past the floor, never a cut for under-18s). With under 70 % logging it asks you to log more instead of changing numbers. Results are listed in Progress, next to the plan-vs-you chart.
- Existing users get a plan generated from their old goal / pace / target, with the same day-1 targets.

**8,000+ foods**
- Beside the hand-made campus list (mess dishes, Indian brands, ₹ prices) the app loads two open datasets a moment after it opens, cached for offline use:
  - **853 cooked Indian recipes** from the [Indian Nutrient Databank (INDB)](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-) (Vijayakumar, Dubasi, Awasthi & Jaacks, *Current Developments in Nutrition*, 2024; built on ICMR-NIN IFCT 2017). Veg / egg / non-veg, allergens and vegan / Jain tags come from each recipe's ingredient list. 161 recipes were left out: 123 where INDB counts all the deep-frying oil as eaten (e.g. boondi raita at 74 g fat per 100 g) and 38 soups whose energy doesn't match their macros.
  - **7,445 world foods and snacks** from [USDA FoodData Central](https://fdc.nal.usda.gov/) SR Legacy (public domain): raw foods, cereals, sweets, snacks, drinks, fast food chains, restaurant dishes. Fast food and restaurant dishes whose name doesn't show they're vegetarian are tagged non-veg on purpose.
- Every one of them gets the full "should I eat this?" verdict, and fibre, sugar and sodium now feed it (a 200 g bag of salted chips is flagged as salty, a large cola as sugary), plus iron, calcium and (USDA) B12 / vitamin D for the micronutrient watch. Search ranks the campus list first, then Indian recipes, then world foods.
- Rebuild the data: `python tools/import-indb.py <INDB folder> data/india-foods.json` and `node tools/import-usda.mjs <SR Legacy CSV folder> data/world-foods.json`. Both scripts use only the standard library.

**Food rules and fasting**
- You › Food rules: allergies and intolerances (peanut, tree nut, milk, gluten, egg, soy, fish, sesame), diet patterns (vegan, Jain, halal, no beef, no pork) and fasting modes (intermittent-fasting window, Ramadan with suhoor and iftar, Navratri, Ekadashi). These are hard filters for the plate planner, top-ups, alternatives, verdicts and photo results, and fasting reshapes the day's meal windows while keeping the same targets and calorie floor. Matching reads food names, so treat it as a safety net: check labels.
- Progress shows an **iron / B12 / calcium / vitamin D** watch for vegetarians, eggetarians and vegans, with food-first ideas, built only from foods that have nutrient data and honest about how much that covers.

**Community**
- One tap after a logged mess meal rates it (😞 😐 😋). Committees get a **Scorecard** (protein per day, veg protein, fried share, repeated dishes, plain suggestions such as "Tuesday dinner has no protein dish for veg students") plus top and bottom dishes once three students have rated them. They see averages, never who rated.
- Friend challenges: share a code and the leaderboard narrows to your group; rank by XP, logging streak or protein streak.

**AI features (optional, free, bring your own key)**
- **Snap**: photograph a plate (matched to today's menu first, then the food database, with the model's own guess only as a marked "≈ estimate"), a nutrition label (opens a prefilled custom food) or a mess chart (opens the paste-a-week review). Portions are editable, a live verdict sits beside the nutrient table, and non-food or unsure photos get a retake prompt instead of a made-up table. Offline photos wait in the device and are analysed when you're back.
- **Coach** (off by default, see Status): a chat that quotes only numbers from a 2 KB packet of your data, can suggest but never change anything (every suggestion is a button, checked against the calorie floor and protein limits), and runs behind an app-side safety guard that answers crash-diet, purging, steroid and below-floor questions itself without calling the model.
- Set up in You › AI features: agree, then paste a free key from aistudio.google.com/apikey. The key is stored encrypted on the gateway and shown masked.

**Privacy**
- Explicit consent before any data is stored; consent for AI is separate. You › Privacy: privacy notice, withdraw AI consent, and **Delete my account and data** (typed confirmation; erases profile, logs, goals, check-ins, plans, leaderboard entry, ratings and your stored AI key, then the sign-in). Hindi navigation and consent text are available in You › Language.

**Mess intelligence**
- Weekly menus for every mess. Admins can publish official menus, and anyone can keep a personal edit.
- **Suggested plate**: for each meal, it picks servings of every dish (×0.5, ×1, ×2…) to hit that meal's calorie and protein budget for your goal and diet. The budget adapts to what you've already eaten. Log the whole plate in one tap.
- Protein top-ups (eggs, whey, soya, paneer…) when the mess plate runs short. If dinner will be light, the top-up moves to snacks.
- **Day plan**: one plan per day (today + 6) that Today, Plan and the week grid all read. It re-plans only what changed: a committee publishes a menu or a festival special, you edit your own menu, you tap **Not this today** and type what was served, you log a meal, or a check-in moves your targets. Logged meals are never touched, missed meals spread their budget over the rest (no meal over 45 % of the day's calories), and when a meal moves by ≥ 5 g protein or ≥ 100 kcal Today shows a banner with a **See why** diff. Menus and specials update live, with no refresh needed. The last 7 versions of each day are kept.
- **Festival specials**: admins publish date-specific menus (Diwali feast, Onam sadhya…). These replace the regular meal and show a banner.
- Students can report menu changes, and admins see the reports in-app.

**Logging**
- **387 built-in foods** with per-100 g macros and real pack sizes and prices: Bingo / Lay's / Kurkure ₹10–₹50 packs, Haldiram's, biscuits, chocolates, cold drinks, McD / Domino's / KFC / Subway, street & canteen food, South & North Indian dishes, dairy, protein products, fruits and nuts
- **Type it**: `2 eggs, bingo chilli 20rs, 1 glass milk, 150g chicken` gets parsed into items, with quantities, grams and prices understood. Voice input is available where the browser supports it.
- **Barcode scan** (camera, Chrome on Android) and **online search** through Open Food Facts, which covers millions of packaged foods
- Custom foods, favourites, recents, saved meals (log your usual breakfast in one tap), copy yesterday, undo
- Log any past day with the date strip

**Training**
- Five plans: PPL, Upper/Lower, Full-Body Starter, Fat-Loss Hybrid, and Hostel Room (no equipment)
- Per-set weight × reps logging that shows last session's numbers, a rest timer, estimated-1RM PRs and weekly volume

**Daily routine**
- A timeline built from wake/sleep times, mess hours, workout time and goal: pre/post-workout fuel, hydration checks, pre-bed protein and wind-down
- Optional meal and workout reminder notifications

**Progress & motivation**
- Weight trend with a 7-day average, kg/week rate and goal ETA projection, plus the plan line with phase bands
- Calories vs target, macro split, a consistency heatmap and outside-food **₹ spending**
- XP, levels, 14 badges, streaks and an opt-in **campus leaderboard**

**Everything else**
- Dark / light / auto theme with 5 accent colours. Mobile bottom tab bar, desktop side rail. Press `/` to search and log.
- Installable PWA with offline support
- JSON backup/restore and CSV export
- Guest mode, with automatic import into a new account

## Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com). This repo is already configured for `bulk-tracker-c030e`.
2. **Authentication → Sign-in method**: enable **Email/Password**, and optionally **Google**. Sign-up is now open to everyone.
3. **Firestore → Rules**: paste the contents of `firestore.rules` and click **Publish**. This step is required for shared menus, specials, the leaderboard and reports.
4. **Authentication → Settings → Authorised domains**: add your GitHub Pages domain.
5. Push to GitHub and enable GitHub Pages.

## Who can do what

| | Student | Mess committee | Super-admin |
|---|---|---|---|
| Log food, train, see stats | ✅ | ✅ | ✅ |
| Edit a menu **for themselves** | ✅ | ✅ | ✅ |
| Report a menu change | ✅ | ✅ | ✅ |
| Publish a menu for **their** mess | — | ✅ | ✅ |
| Post a festival special for **their** mess | — | ✅ | ✅ |
| Publish for **any** mess / target all messes | — | — | ✅ |
| Grant & revoke committee access in-app | — | — | ✅ |

Anyone can sign up with any email; nothing is gated behind a college domain.

### Make yourself the super-admin (once)

1. Sign in to the app once.
2. **Firestore** → create a collection `admins` → document ID = your Auth UID
   (from **Authentication → Users**, or from the app under **You → Account → Your ID**)
   → add a boolean field `super` = `true`.

### Give a mess committee access (from inside the app)

1. The committee member signs up like any student and sends you their ID
   (**You → Account → Your ID**, there's a copy button).
2. You → **You → Admin → Manage mess committee access** → paste the ID, tick
   the messes they look after → **Grant access**.

They can then publish only those messes. The limit is enforced in
`firestore.rules`, not just hidden in the UI, so it can't be bypassed by
editing the page.

### How a committee's menu change reaches everyone

1. A committee member opens **Plan → Menus**, picks their mess, taps **Edit / publish**, changes dishes (or pastes or photographs the new chart) and taps **Publish for everyone**.
2. Every open copy of the app, signed in or guest, receives the new menu within a couple of seconds. Each student's day plan is rebuilt from it for today and the next six days. Meals they've already logged are never touched. If a meal changes enough to matter (±5 g protein or ±100 kcal), Today shows a "Plan updated" banner with a **See why** breakdown, such as "Dinner changed: paneer → aloo gobi. Protein −14 g, so we added eggs at snacks."
3. Apps that were closed pick it up on their next launch, and the banner still appears.
4. Students who saved their **own edited copy** of the menu keep it. Today and Menus tell them the committee published something newer, with a one-tap **Use their menu**.
5. For a single day ("no paneer today, it's aloo gobi") anyone can tap **Not this today** on that meal. That re-plans only their own meal; it doesn't publish.

The published menu replaces the built-in 2026 chart for that mess until the committee publishes again.

### Getting a menu in

**All five messes ship with their 2026 charts built in** (A revised menu, B Sept 2026, C Oct 2026, D from 6 Oct 2026, E from 22 Sept 2026), as seven menus: AV, BV, BNV, CV, CNV, DV, EV. B and C serve non-veg on the side, so BV and CV leave those dishes out. Alternating dishes stay as "X / Y". The charts are transcribed in `data/mess-menus.js` with each mess's daily items (tea, bread, rice, curd…). Per-serving macros come from a rule table in `js/engine/dishes.js` (one katori of dal, three idlis, three fulkas, a scoop of rice…). These are estimates; a committee's published menu always takes priority. A's chart doesn't list daily rice or chapati, so none is assumed. Every dish must match a rule or the unit tests fail; nothing is guessed silently.

To change a menu, open **Plan → Menus** → pick the mess → **Edit / publish**. Three ways to fill it:

- **Paste a week** — paste the chart straight from WhatsApp, a PDF or a
  spreadsheet. It understands day headings, meal labels (Breakfast / B/F /
  Lunch / Snacks / Dinner), commas, bullets, numbered lists and tab-separated
  tables, and fills in macros for any dish it recognises. Anything it doesn't
  recognise is left blank and underlined for you to fill in — it never invents
  numbers. You review everything before it's loaded, and again before saving.
- **Copy from** — another day, another mess, or a typical veg / non-veg sample week.
- Type it in by hand.

Then **Publish for everyone** (committee) or **Save for me** (anyone).

### Festival specials

**Plan → Menus → Add special** → date, title, emoji, which messes, which meals,
and the dishes. On that date those meals are replaced and students see a
banner; every other day falls back to the regular week. One entry covers one
date, so a three-day festival needs three entries.

## AI gateway (optional)

`ai-gateway/` is a small Cloudflare Worker, the only part of the repo with a build. The app funds no AI: each user's calls run on their own free Gemini key. There is no shared Gemini key to provision, and none should be.

```bash
cd ai-gateway && npm install
wrangler kv namespace create KEYS            # paste the id into wrangler.toml
# edit wrangler.toml: ALLOWED_ORIGINS (your GitHub Pages origin), GEMINI_MODEL
wrangler secret put KEY_ENCRYPTION_SECRET    # a long random string: ONLY encrypts users' stored keys
wrangler deploy
```

Then put the worker URL in `AI_GATEWAY_URL` in `js/ai.js` (or, for one device, `localStorage['ff.aiurl']`). Before deploying, confirm in Google AI Studio that `gemini-2.5-flash` is still the free-tier model and that `PACE_RPM` / `PACE_RPD` match the limits it shows. Google has retired free models before, and the model is one config value.

- Every request verifies the Firebase ID token (issuer and audience = your project), decrypts only the caller's own key, paces against the free tier, calls Gemini's `generateContent` over plain REST, validates the JSON against the route's schema (one retry), and logs counts and timings only: no text, photos or keys. Errors become typed, friendly states (`no_key`, `bad_key`, `quota`, `paced`, `too_large`…).
- `npm test` (in `ai-gateway/`) covers auth (missing, expired, wrong-project and wrong-issuer tokens), key encryption and masking, quota mapping, pacing, the size limit, CORS and the no-secrets-in-logs rule, using a fake Gemini. `node evals/run.ts <route>` runs a labelled set against a **free test key in `ai-gateway/.env`** (git-ignored) and prints the spec's metrics; `node evals/run.ts redteam` runs the safety prompts the app does not intercept itself. `node evals/logstats.ts` summarises quota rate, schema failures and P95 from the gateway's log lines.

## Data model (Firestore)

| Path | Who | What |
|---|---|---|
| `users/{uid}` | owner | profile (`schema: 2`), targets, favourites, custom foods, saved meals, allergies, diet tags, locale, consents |
| `users/{uid}/logs/{YYYY-MM-DD}` | owner | items, water, weight, workout sets, and `dayOverrides` ("not this today" menus) (compatible with v1 logs) |
| `users/{uid}/goals/{id}` | owner | GoalPlan: type, start/target, rate, phases with macros, milestones, training plan |
| `users/{uid}/checkins/{YYYY-Www}` | owner | weekly CheckIn: trend, observed vs planned rate, adaptive TDEE, decision, message |
| `users/{uid}/plans/{YYYY-MM-DD}` | owner | the latest DayPlan for each of the next 7 days, plus up to 7 earlier versions |
| `dishRatings/{mess}_{date}_{dish}_{uid}` | signed-in read; create-only by the rater; owner may delete | one dish rating (1–5) |
| `messes/{messId}` | read: all · write: admins | published weekly menu, plus `version` (bumped on every publish), `updatedAt`, `updatedBy` |
| `specials/{id}` | read: all · write: admins | `{date, title, emoji, messes[], meals{}}` |
| `leaderboard/{uid}` | read: signed-in · write: owner | name, mess, xp, level, streak (opt-in) |
| `reports/{id}` | create: signed-in · read: admins | menu correction reports |
| `admins/{uid}` | read: self | admin flag |

## Tests

```bash
npm test                                  # pure-logic unit tests (Node, no install, no browser)
npx playwright@1.49.1 install chromium   # once
node test/run.cjs                         # browser tests
node test/screenshots.cjs                 # every screen, light + dark, phone + desktop → test/screenshots/
```

`SHOTS=today,ask SCHEMES=dark VIEWPORTS=phone node test/screenshots.cjs` narrows a screenshot run while you iterate.

`npm test` runs `node --test "test/unit/*.test.mjs"`: targets, plate planner, profile migration, feature flags, the store's menu versioning and plan migration, the goal engine (every spec §10.2 goal example plus edge cases), four synthetic 28-day check-in datasets, the day-plan engine and the stateful planner. There are no dependencies to install.

`node tools/build-foods.mjs` validates every food (energy within 15 % of 4p+4c+9f, tags, sizes, ids) and also runs in the unit tests. The red-team set (`ai-gateway/evals/sets/redteam.json`, 67 prompts) runs through the app's safety guard in the unit tests; the prompts left to the model are checked by `node evals/run.ts redteam`.

The browser suite also covers the verdict engine (diet and allergy blocks, offline plates, the eating-disorder card), Snap with a mocked gateway (meal, label, menu, offline queue, quota, no key), the coach and its guard, dish ratings and the scorecard, friend challenges, consent, account deletion, Hindi navigation, and an axe-core WCAG 2.1 AA scan of every main screen and sheet in light and dark, plus the goal planner (safe, blocked, counter-offer), v1 → plan migration, a due check-in, "Not this today", the week grid, and a committee edit reaching an open student app within 2 s.

Drives the real app in Chromium and exits non-zero on failure. The cloud half
runs against `test/firebase-mock.js`, an in-memory stand-in for the Firebase
compat SDK, so no Firebase project is needed — it covers sign-up, guest import,
cloud writes, live cross-device sync, admin publishing and the sign-out/sign-in
cycle. It proves the app's own logic only, **not** that your deployed Firestore
rules allow those writes; check that against the real project.

## Project layout

```
index.html          app shell
css/app.css         design system ("Thali"): light-dark() tokens, components, screens
js/app.js           boot, auth, routing
js/store.js         guest (localStorage) + cloud (Firestore) storage
js/engine/          pure logic with no DOM/network (unit-tested): targets, plate, profile schema,
                    goal (assess / plan / project), checkin (trend, adaptive TDEE), dayplan (budgets, diffs),
                    verdict + verdict-copy, diet + allergens + fasting, match (Snap), coach (guard, packet), micro, community, aicore
js/goals.js         starts plans, keeps profile.phase in step, runs and applies check-ins
js/planner.js       the Day Plan: watches the store, re-plans what changed, persists versions
js/verdicts.js      runs the verdict engine on live state; js/coach.js the coach glue; js/ai.js + js/aikey.js the AI client
data/foods-x.js     optional extra nutrients (fibre, sodium, iron, B12, calcium, vitamin D) beside data/foods.js
i18n/               js/i18n/{en,hi}.js dictionaries with English fallback
ai-gateway/         the Cloudflare Worker, its tests and evals
tools/              build-foods.mjs, the food data validator
js/nutrition.js     meal helpers, food → item, day score (re-exports js/engine/*)
js/flags.js         feature flags; unfinished v2 features ship dark
js/search.js        food search, quick-log parser, Open Food Facts
js/menus.js         menu resolution (special > personal > published > built-in)
js/menuparse.js     paste-a-week importer
js/routine.js       daily timeline + reminders
js/gamify.js        streaks, XP, badges
js/components/      icons, art (logo, thali, scenes), plate + katori gauges, focus card,
                    plate list, nutrient table, verdict card, week grid, Snap sheet
js/views/*.js       today, plan, ask, progress, you, mess + train (inside Plan),
                    goalplanner (form, sheet, check-in result), nottoday, onboarding, auth, log sheet
data/foods.js       food database
data/messes.js      messes, timings, built-in C-mess menu
data/workouts.js    training plans
sw.js               offline cache
test/unit/          Node unit tests (npm test)
test/run.cjs        browser tests (guest + mocked cloud)
test/screenshots.cjs  screenshots of every screen
```

Nutrition values are approximate. They're compiled from pack labels, brand sites and Indian food tables, and pack sizes and prices change over time. Not medical advice.
