// =============================================================
// SHOOT — screenshots and an accessibility audit of any screen,
// for checking design work by eye. Seeds a realistic guest (a
// vegetarian student bulking at the CNV mess, nine days of logs,
// today half-eaten) so every screen shows real content.
//
//   node tools/shoot.cjs                                  # all five tabs, dark + light, phone
//   node tools/shoot.cjs --routes today,progress --themes dark
//   node tools/shoot.cjs --sheets logsheet,snap,verdict    # open overlays too
//   node tools/shoot.cjs --pages landing,onboarding        # signed-out and first-run screens
//   node tools/shoot.cjs --sizes phone,desktop --full      # desktop too; whole scroll height
//   node tools/shoot.cjs --frames 6 --routes today         # filmstrip of the entrance animation
//   node tools/shoot.cjs --axe                             # WCAG 2.1 AA audit of every capture
//   node tools/shoot.cjs --accent saffron                  # ember | saffron | herb | berry | indigo
//   node tools/shoot.cjs --empty                           # a brand-new user: nothing logged yet
//   node tools/shoot.cjs --out ../somewhere --root .
//
// Routes:  today plan plan/menus plan/training plan/routine ask progress you
// Sheets:  logsheet snap verdict goalplanner nottoday aikey plate-check
// Pages:   landing onboarding
// Files are written as <out>/<theme>-<size>-<name>.png (default out: .shots/).
// Exit code 1 if any page error or (with --axe) any violation was found.
// =============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const MAIN = 'C:/Users/sanka/Desktop/STUDIES/AIDS/bulk-tracker';     // node_modules live here, not in worktrees
const need = name => { try { return require(name); } catch { return require(path.join(MAIN, 'node_modules', name)); } };
const { chromium } = need('playwright');
const AXE = [path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), path.join(MAIN, 'node_modules/axe-core/axe.min.js')].find(f => fs.existsSync(f));

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = k => args.includes('--' + k);
const list = (k, d) => (opt(k, d) || '').split(',').map(x => x.trim()).filter(Boolean);
const ROOT = path.resolve(opt('root', process.cwd()));
const OUT = path.resolve(opt('out', path.join(ROOT, '.shots')));
const ROUTES = list('routes', args.includes('--sheets') || args.includes('--pages') ? '' : 'today,plan,ask,progress,you');
const SHEETS = list('sheets', '');
const PAGES = list('pages', '');
const THEMES = list('themes', 'dark,light');
const SIZES = list('sizes', 'phone');
const FRAMES = +opt('frames', 0);
const ACCENT = opt('accent', 'ember');
const FULL = flag('full'), RUN_AXE = flag('axe'), EMPTY = flag('empty');
const VIEW = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 820 } };

// ---------- static server for the worktree ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(fs.readFileSync(f));
});

// ---------- a realistic student ----------
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const it = (n, cal, p, meal, extra = {}) => ({ id: Math.random().toString(36).slice(2, 9), n, cal, p, c: Math.round(cal * 0.13), f: Math.round(cal * 0.033), meal, diet: 'v', cat: 'mess', ts: Date.now(), ...extra });
const DAY = [
  [it('Poha + Kesari bath', 420, 9, 'breakfast'), it('Banana shake', 260, 8, 'breakfast')],
  [it('Chapati ×3 + Matta rice', 560, 15, 'lunch'), it('Sambar', 100, 5, 'lunch'), it('Curd', 60, 3, 'lunch')],
  [it('Masala peanut', 220, 10, 'snacks'), it('Tea', 80, 2, 'snacks')],
  [it('Paneer butter masala', 280, 14, 'dinner'), it('Fulka ×3', 270, 9, 'dinner'), it('Dal tadka', 160, 9, 'dinner')],
];
function seed() {
  const days = [];
  for (let i = 0; i <= 8; i++) {
    const meals = i === 0 ? DAY.slice(0, 2) : i === 4 ? DAY.slice(0, 3) : DAY;   // today half-eaten; one lighter day
    days.push([daysAgo(i), { items: meals.flat().map(x => ({ ...x, id: x.id + i })), water: i === 0 ? 1250 : 2000 + (i % 3) * 400, weight: +(64.2 - i * 0.08).toFixed(1), gymDone: i % 2 ? ['push'] : [], sets: {} }]);
  }
  return days;
}
const PROFILE = {
  name: 'Asha Rao', onboarded: true, mess: 'CNV', diet: 'veg', goal: 'gain', pace: 0.3, weight: 64.2, goalWeight: 70, height: 170, age: 20, sex: 'female',
  activity: 'moderate', experience: 'beginner', consents: { health: Date.now() }, leaderboard: false,
  favorites: ['boiled-egg', 'paneer', 'banana'], recents: ['banana', 'curd', 'chapati'], customFoods: [], templates: [], menuOverrides: {},
  routine: { wake: '06:30', sleep: '23:00', gym: '17:30' },
};

// ---------- overlays ----------
const today = () => daysAgo(0);
const SHEET = {
  logsheet: p => p.evaluate(() => import('/js/views/logsheet.js').then(m => m.openLog())),
  snap: p => p.evaluate(() => import('/js/components/camera.js').then(m => m.openSnap())),
  goalplanner: p => p.evaluate(() => import('/js/views/goalplanner.js').then(m => m.openGoalPlanner())),
  nottoday: p => p.evaluate(k => import('/js/views/nottoday.js').then(m => m.openNotToday(k, 'dinner')), today()),
  aikey: p => p.evaluate(() => import('/js/aikey.js').then(m => m.openAiKey())),
  verdict: async p => {
    await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(700);
    await p.fill('.searchfield input', 'chicken biryani'); await p.waitForTimeout(600);
    await p.click('.page.ask .li-btn >> nth=0').catch(() => {});
  },
  'plate-check': async p => {
    await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(700);
    await p.fill('.searchfield input', '2 boiled eggs, 1 glass milk'); await p.waitForTimeout(600);
    await p.click('text=Check this plate').catch(() => {});
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const problems = [];
  let shots = 0;

  for (const size of SIZES) for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: VIEW[size] || VIEW.phone, deviceScaleFactor: 2, colorScheme: theme, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    // the Firebase CDN is blocked on purpose (guest mode), so its failed loads are not errors
    page.on('console', m => { const u = (m.location() || {}).url || ''; if (m.type() === 'error' && !/favicon|fonts\.g|gstatic|firebase/i.test(m.text() + ' ' + u)) errs.push(m.text() + (u ? ' @ ' + u : '')); });
    await page.route(/gstatic\.com\/firebasejs/, r => r.abort());         // guest mode only; no network auth

    const boot = async ({ signedOut = false, fresh = false } = {}) => {
      await page.goto(url);
      await page.evaluate(([prof, days, theme, accent, signedOut, fresh, empty]) => {
        localStorage.clear();
        localStorage.setItem('ff.theme', JSON.stringify(theme));
        localStorage.setItem('ff.accent', JSON.stringify(accent));
        if (signedOut) return;
        localStorage.setItem('ff.mode', '"guest"');
        localStorage.setItem('ff.guest.profile', JSON.stringify(fresh ? { name: '', onboarded: false } : prof));
        if (!fresh && !empty) for (const [k, v] of days) localStorage.setItem('ff.guest.day.' + k, JSON.stringify(v));
      }, [PROFILE, seed(), theme, ACCENT, signedOut, fresh, EMPTY]);
      await page.reload();
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(1800);
    };
    const snap = async name => {
      const file = path.join(OUT, `${theme}-${size}-${name.replace(/\//g, '-')}.png`);
      await page.screenshot({ path: file, fullPage: FULL });
      shots++;
      if (RUN_AXE && AXE) {
        await page.addScriptTag({ path: AXE }).catch(() => {});
        const v = await page.evaluate(() => window.axe ? axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }).then(r => r.violations.map(x => `${x.id} (${x.impact}) at ${x.nodes[0].target.join(' ')}: ${(x.nodes[0].any[0]?.message || x.help).slice(0, 120)}`)) : []);
        v.forEach(x => problems.push(`[axe] ${theme}/${size}/${name}: ${x}`));
      }
      return file;
    };

    // tabs
    if (ROUTES.length) {
      await boot();
      for (const r of ROUTES) {
        await page.evaluate(h => { location.hash = '#/' + h; }, r);
        if (FRAMES) {
          for (let f = 0; f < FRAMES; f++) { await page.waitForTimeout(f === 0 ? 30 : 90); await page.screenshot({ path: path.join(OUT, `${theme}-${size}-${r.replace(/\//g, '-')}-f${f}.png`) }); shots++; }
        }
        await page.waitForTimeout(1300);
        await snap(r);
      }
    }
    // overlays
    for (const sh of SHEETS) {
      if (!SHEET[sh]) { problems.push(`unknown sheet "${sh}" (have: ${Object.keys(SHEET).join(', ')})`); continue; }
      await boot();
      await SHEET[sh](page);
      await page.waitForTimeout(1100);
      await snap('sheet-' + sh);
    }
    // whole pages
    for (const pg of PAGES) {
      if (pg === 'landing') { await boot({ signedOut: true }); await snap('page-landing'); }
      else if (pg === 'onboarding') {
        await boot({ fresh: true });
        await snap('page-onboarding-1');
        for (let i = 2; i <= 4; i++) {
          if (i === 2) await page.fill('.ob input', 'Asha').catch(() => {});
          await page.click('.ob:not(.closing) .ob-next').catch(() => {});
          await page.waitForTimeout(600);
          await snap('page-onboarding-' + i);
        }
      } else problems.push(`unknown page "${pg}" (have: landing, onboarding)`);
    }
    errs.forEach(e => problems.push(`[page error] ${theme}/${size}: ${e}`));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`${shots} screenshot${shots === 1 ? '' : 's'} in ${OUT}`);
  if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
  else console.log(RUN_AXE ? 'no page errors, no WCAG 2.1 AA violations' : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });
