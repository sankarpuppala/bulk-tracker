# Thali — setup, step by step

Everything below is free. Nothing here needs a credit card.

The app already works with **no setup at all**: menus, 10,000+ foods, barcode scanning,
"should I eat this?", plans, check-ins and progress all run offline in the browser.
The steps below add accounts, sync, committee publishing and the optional AI features.

---

## Part 1 — Firebase (accounts and sync) · ~10 minutes

Without this, the app stays in guest mode: everything works, but data lives only in that
one browser and committees cannot publish menus.

1. **Make a project.** Go to [console.firebase.google.com](https://console.firebase.google.com)
   → *Add project* → name it (the repo is already wired to `bulk-tracker-c030e`; if you use your
   own, update `FIREBASE_CONFIG` at the top of `js/app.js`). Google Analytics is optional — skip it.
2. **Turn on sign-in.** *Build → Authentication → Get started → Sign-in method* →
   enable **Email/Password**. Optionally enable **Google** too.
3. **Make the database.** *Build → Firestore Database → Create database* →
   **Start in production mode** → pick a region near you (`asia-south1` for India).
4. **Publish the rules.** Open `firestore.rules` in this repo, copy all of it, paste it into
   *Firestore → Rules*, and press **Publish**. **Do not skip this** — without it, dish ratings,
   friend challenges and committee menu publishing are all rejected.
5. **Allow your domain.** *Authentication → Settings → Authorised domains* → **Add domain** →
   `sankarpuppala.github.io` (and `localhost` for local testing).
6. **Make yourself super-admin.** *Firestore → Start collection* → collection ID `admins` →
   document ID = **your Auth user UID** (copy it from *Authentication → Users*, or from the app at
   *You → Account → Your ID*) → add field `super` (boolean) = `true` → Save.

You can now grant mess committees access from inside the app: *You → Admin → Manage mess
committee access* → paste their user ID → tick their messes → **Grant access**.

---

## Part 2 — Deploy the app · ~2 minutes

It is a static site; there is no build step.

```bash
git push origin main
```

Then on GitHub: *Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save*.
It appears at `https://<your-username>.github.io/bulk-tracker/` within a minute or two.

To run it locally instead:

```bash
python -m http.server 8000     # then open http://localhost:8000
```

---

## Part 3 — The Gemini API key (optional: Snap photos and the coach)

Snap (photograph a plate, a label or a menu chart) and the AI coach are the only features
that need this. **Everything else works without it**, including the whole verdict engine.

The app never pays for AI. Each person uses **their own free Google AI Studio key**, so there is
no shared bill and no spend cap to manage. You deploy a small relay (a Cloudflare Worker) once;
after that each student pastes their own key into the app.

### 3a. Get a free Gemini key (every user does this, ~30 seconds)

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**.
2. Sign in with any Google account.
3. Press **Create API key** → *Create API key in new project*.
4. Copy the key. It starts with `AIza…`.
5. In the app: **You → AI features** → tick the consent box → paste the key → **Save key**.

The key is sent once over HTTPS, stored encrypted on the gateway, and only ever shown back
masked (`AIza••••1a2b`). You can replace or remove it any time from the same screen.

> **Free-tier limits.** Google's free tier for `gemini-2.5-flash` is roughly 10 requests/minute
> and a few hundred per day, per key. That is far more than normal use (a few photos a day).
> Check the current numbers at
> [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
> before you deploy, and set `PACE_RPM` / `PACE_RPD` in `wrangler.toml` to match.

### 3b. Deploy the gateway (you do this once, ~10 minutes)

You need a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```bash
cd ai-gateway
npm install
npx wrangler login                       # opens a browser to authorise

npx wrangler kv namespace create KEYS    # prints an id — paste it into wrangler.toml
```

Now edit **`ai-gateway/wrangler.toml`**:

| Setting | Set it to |
|---|---|
| `id` under `[[kv_namespaces]]` | the id the command above printed |
| `FIREBASE_PROJECT_ID` | your Firebase project id (already `bulk-tracker-c030e`) |
| `ALLOWED_ORIGINS` | `https://<your-username>.github.io,http://localhost:8000` |
| `GEMINI_MODEL` | confirm `gemini-2.5-flash` is still the free model in AI Studio |
| `PACE_RPM` / `PACE_RPD` | match the free-tier limits you just checked |

Then set the one secret and deploy:

```bash
npx wrangler secret put KEY_ENCRYPTION_SECRET   # paste any long random string
npx wrangler deploy                             # prints https://fuel-forge-ai.<you>.workers.dev
```

> `KEY_ENCRYPTION_SECRET` only encrypts users' stored Gemini keys. There is **no** app-wide
> Gemini key, and you should never create one — the whole design is that each user pays nothing
> because they bring their own free key.

### 3c. Point the app at the gateway

Open **`js/ai.js`** and set the URL the deploy printed:

```js
export const AI_GATEWAY_URL = 'https://fuel-forge-ai.<you>.workers.dev';
```

Commit and push. To test on one device without committing, open the browser console on the
site and run `localStorage.setItem('ff.aiurl', '"https://fuel-forge-ai.<you>.workers.dev"')`.

### 3d. Check it works

```bash
cd ai-gateway && npm test        # 21 tests, no network or key needed
```

Then in the app: **You → AI features** should show your masked key, and the Snap button should
offer *Take photo* instead of "AI isn't switched on here".

### 3e. Turn the coach on (only after the safety check)

The AI coach ships **off**. Before enabling it, run the red-team set against the live model:

```bash
cd ai-gateway
echo "GEMINI_TEST_KEY=AIza..." > .env     # a throwaway free key; .env is git-ignored
node evals/run.ts redteam                 # must print 100.0%
```

Only if that prints `100.0%`, set `coach: true` in `js/flags.js` and push. The 39 most dangerous
prompts (crash diets, purging, steroids, eating below the calorie floor) are answered by the app
itself and never reach the model — those already pass in the unit tests.

---

## Part 4 — Keeping the food data fresh (optional)

The app ships with 10,217 foods. To rebuild them from source:

```bash
# Indian food composition tables (official, ICMR-NIN)
npm pack @ifct2017/compositions && tar xzf ifct2017-compositions-*.tgz
python tools/import-ifct.py package/index.csv data/ifct-foods.json

# Packaged food sold in India, with barcodes (streams ~1.5 GB, keeps nothing)
python tools/import-off.py --out data/packaged-foods.json

# World foods: download "SR Legacy" CSV from fdc.nal.usda.gov/download-datasets
node tools/import-usda.mjs <unzipped-folder> data/world-foods.json

# Validate the hand-curated campus list
node tools/build-foods.mjs
```

---

## Checklist

- [ ] Firebase project made, Email/Password sign-in on
- [ ] `firestore.rules` pasted and **published**
- [ ] GitHub Pages domain added to Firebase authorised domains
- [ ] Your UID added to `admins` with `super: true`
- [ ] Site live on GitHub Pages
- [ ] *(optional)* Worker deployed, `AI_GATEWAY_URL` set, `npm test` green
- [ ] *(optional)* Red team at 100 % before `coach: true`
