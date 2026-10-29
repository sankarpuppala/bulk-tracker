# Fuel & Forge — Campus Nutrition & Training

A campus-first nutrition and training app for students who want to **gain, lose or maintain weight**, built around hostel messes (AV, BV, BNV, CV, CNV, DV, EV), canteen food and packaged snacks.

Vanilla HTML/CSS/JS ES modules, no build step, so it still deploys straight to GitHub Pages. Firebase provides accounts and sync. Everything also works offline in guest mode.

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
- Dark / light / auto theme with 5 accent colours. Mobile bottom tab bar, desktop side rail. Press `/` to log.
- Installable PWA with offline support
- JSON backup/restore and CSV export
- Guest mode, with automatic import into a new account

## Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com). This repo is already configured for `bulk-tracker-c030e`.
2. **Authentication → Sign-in method**: enable **Email/Password**, and optionally **Google**. Sign-up is now open to everyone.
3. **Firestore → Rules**: paste the contents of `firestore.rules` and click **Publish**. This step is required for shared menus, specials, the leaderboard and reports.
4. **Authentication → Settings → Authorised domains**: add your GitHub Pages domain.
5. Push to GitHub and enable GitHub Pages.

### Making someone an admin

Admins can publish mess menus and festival specials for everyone.

1. Have the person sign in once, then copy their UID from **Authentication → Users**.
2. In **Firestore**, create a collection named `admins` with a document whose ID is that UID. Any field works, e.g. `role: "admin"`.
3. They'll see **Edit / publish** and **✨ Add special** on the Mess tab, plus an Admin section under Me.

## Data model (Firestore)

| Path | Who | What |
|---|---|---|
| `users/{uid}` | owner | profile, targets, favourites, custom foods, saved meals |
| `users/{uid}/logs/{YYYY-MM-DD}` | owner | items, water, weight, workout sets (compatible with v1 logs) |
| `messes/{messId}` | read: all · write: admins | published weekly menu |
| `specials/{id}` | read: all · write: admins | `{date, title, emoji, messes[], meals{}}` |
| `leaderboard/{uid}` | read: signed-in · write: owner | name, mess, xp, level, streak (opt-in) |
| `reports/{id}` | create: signed-in · read: admins | menu correction reports |
| `admins/{uid}` | read: self | admin flag |

## Tests

```bash
npx playwright@1.49.1 install chromium   # once
node test/run.cjs
```

Drives the real app in Chromium and exits non-zero on failure. The cloud half
runs against `test/firebase-mock.js`, an in-memory stand-in for the Firebase
compat SDK, so no Firebase project is needed — it covers sign-up, guest import,
cloud writes, live cross-device sync, admin publishing and the sign-out/sign-in
cycle. It proves the app's own logic only, **not** that your deployed Firestore
rules allow those writes; check that against the real project.

## Project layout

```
index.html          app shell
css/app.css         design system
js/app.js           boot, auth, routing
js/store.js         guest (localStorage) + cloud (Firestore) storage
js/nutrition.js     targets, plate planner, top-ups, day score
js/search.js        food search, quick-log parser, Open Food Facts
js/menus.js         menu resolution (special > personal > published > built-in)
js/routine.js       daily timeline + reminders
js/gamify.js        streaks, XP, badges
js/views/*.js       today, mess, train, stats, me, onboarding, auth, log sheet
data/foods.js       food database
data/messes.js      messes, timings, built-in C-mess menu
data/workouts.js    training plans
sw.js               offline cache
test/run.cjs        browser tests (guest + mocked cloud)
```

Nutrition values are approximate. They're compiled from pack labels, brand sites and Indian food tables, and pack sizes and prices change over time. Not medical advice.
