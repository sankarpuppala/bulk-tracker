# Fuel & Forge — Campus Nutrition & Training

A campus-first nutrition and training app for students who want to **gain, lose or maintain weight**, built around hostel messes (AV, BV, BNV, CV, CNV, DV, EV), canteen food and packaged snacks.

Vanilla HTML/CSS/JS ES modules, no build step, so it still deploys straight to GitHub Pages. Firebase provides accounts and sync. Everything also works offline in guest mode.

## The interface

Five places, one tap each: **Today · Plan · Snap · Ask · Progress**, plus **You** behind your avatar.

- **Today** answers "what do I do next?": a plate gauge for calories (the rim fills as you eat), three katoris for protein, carbs and fat, one focus card for your next mess meal with a suggested plate you can nudge (×½ steps) and log in one tap, then water, weight, workout and your log.
- **Plan** is the week: your goal and weight trend, a 7-day grid showing which meals are light on protein, each day's suggested plates, the mess menus, your training plan and your daily routine.
- **Snap** (the big centre button) logs food. Barcode scanning works now; meal, label and menu photos arrive with the AI update and run on your own free Google AI key. Hold the button to jump straight to search.
- **Ask** checks a food before you eat it: pick a portion and see exactly what it costs against what's left today.
- **Progress** puts the weight trend first, then calories, macros, consistency, spending, badges and the leaderboard.

The look is "Thali": warm charcoal or cream surfaces, an ember accent (or saffron, herb, berry, indigo), Fraunces for headings and numbers, Figtree for everything else, and inline SVG art (the thali, the plate gauge, the katoris, a kolam motif) so it themes with light and dark and works offline. Every screen passes an axe WCAG 2 A/AA check in both themes.

## Features

**Personal plan**
- 60-second onboarding covering goal, body stats, target weight and pace, activity level, diet (veg / egg / non-veg), mess, training plan and daily rhythm
- Targets are calculated with Mifflin-St Jeor BMR × activity, plus a surplus or deficit from your pace, with protein scaled to your goal. You can override any target by hand.

**Mess intelligence**
- Weekly menus for every mess. Admins can publish official menus, and anyone can keep a personal edit.
- **Suggested plate**: for each meal, it picks servings of every dish (×0.5, ×1, ×2…) to hit that meal's calorie and protein budget for your goal and diet. The budget adapts to what you've already eaten. Log the whole plate in one tap.
- Protein top-ups (eggs, whey, soya, paneer…) when the mess plate runs short
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
- Weight trend with a 7-day average, kg/week rate and goal ETA projection
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

### Getting a menu in

Open **Plan → Menus** → pick the mess → **Edit / publish**. Three ways to fill it:

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

## Data model (Firestore)

| Path | Who | What |
|---|---|---|
| `users/{uid}` | owner | profile (`schema: 2`), targets, favourites, custom foods, saved meals, allergies, diet tags, locale, consents |
| `users/{uid}/logs/{YYYY-MM-DD}` | owner | items, water, weight, workout sets (compatible with v1 logs) |
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

`npm test` runs `node --test "test/unit/*.test.mjs"`: targets, plate planner, profile migration, feature flags and the store's menu versioning. There are no dependencies to install.

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
js/engine/          pure logic with no DOM/network (unit-tested): targets, plate, profile schema
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
                    onboarding, auth, log sheet
data/foods.js       food database
data/messes.js      messes, timings, built-in C-mess menu
data/workouts.js    training plans
sw.js               offline cache
test/unit/          Node unit tests (npm test)
test/run.cjs        browser tests (guest + mocked cloud)
test/screenshots.cjs  screenshots of every screen
```

Nutrition values are approximate. They're compiled from pack labels, brand sites and Indian food tables, and pack sizes and prices change over time. Not medical advice.
