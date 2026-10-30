// =============================================================
// Screenshots of every main screen, light and dark, phone and
// desktop. Seeds a guest profile with a few days of data so the
// pages show real content.
//
//   node test/screenshots.cjs [outDir]        (default: test/screenshots)
// =============================================================
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

function seed() {
  const item = (n, meal, cal, p, c, f, extra = {}) => ({ id: Math.random().toString(36).slice(2), n, unit: '1 serving', qty: 1, g: 100, cal, p, c, f, price: null, meal, diet: 'v', cat: 'mess', ts: Date.now(), ...extra });
  const profile = {
    name: 'Sai Kumar', sex: 'male', age: 20, height: 172, weight: 63.4, goalWeight: 70, goal: 'gain', pace: 0.25, activity: 'moderate', diet: 'nonveg', mess: 'CNV', plan: 'ppl5',
    routine: { wake: '06:30', sleep: '23:00', gym: '17:30' }, customTargets: null, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {}, onboarded: true,
  };
  const days = {};
  for (let i = 0; i < 24; i++) {
    const k = key(daysAgo(i));
    days[k] = { items: [], gymDone: [], sets: {}, water: 1500 + (i % 3) * 500, weight: i % 2 === 0 ? +(63.4 - i * 0.07 + Math.sin(i) * 0.25).toFixed(1) : null, note: '' };
    if (i > 0) days[k].items = [item('Idli (3) + Vada (2)', 'breakfast', 300, 9, 50, 7), item('Egg Masala (2 eggs)', 'lunch', 190 + (i % 4) * 40, 14, 4, 12), item('Chapati + Rice', 'lunch', 380, 10, 74, 6), item('Chicken Curry', 'dinner', 290, 28, 6, 16), item('Ghee Rice + Chapati', 'dinner', 420, 9, 70, 10)];
  }
  days[key(new Date())].items = [item('Idli (3) + Vada (2)', 'breakfast', 300, 9, 50, 7), item('Boiled egg (2)', 'breakfast', 140, 12, 1, 10, { cat: 'meat', diet: 'e', price: 16 })];
  days[key(new Date())].water = 1250;
  return { profile, days };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const data = seed();
  const errors = [];

  // [name, hash, seed ('full' | 'fresh' | 'new' | null for signed-out), action]
  const all = [
    ['landing', '', null, null],
    ['onboarding', '', 'new', null],
    ['onboarding-goal', '', 'new', async p => { await p.fill('.ob input', 'Sai'); await p.click('.ob-next'); await p.waitForTimeout(500); }],
    ['today', '#/today', 'full', null],
    ['today-empty', '#/today', 'fresh', null],
    ['log-sheet', '#/today', 'full', async p => { await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))); await p.keyboard.press('/'); await p.waitForTimeout(600); }],
    ['plan-week', '#/plan/week', 'full', null],
    ['plan-menus', '#/plan/menus', 'full', null],
    ['plan-training', '#/plan/training', 'full', null],
    ['plan-routine', '#/plan/routine', 'full', null],
    ['ask', '#/ask', 'full', null],
    ['ask-detail', '#/ask', 'full', async p => { await p.fill('.searchfield input', 'biryani'); await p.waitForTimeout(300); await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(400); }],
    ['progress', '#/progress', 'full', null],
    ['you', '#/you', 'full', null],
    ['snap', '#/today', 'full', async p => { await p.locator('.fab:visible, .rail-snap:visible').first().click(); await p.waitForTimeout(500); }],
  ];
  // SHOTS=today,ask  SCHEMES=dark  VIEWPORTS=phone  narrow a run while iterating
  const pick = (env, list) => (process.env[env] ? process.env[env].split(',') : list);
  const names = pick('SHOTS', all.map(x => x[0]));
  const shots = all.filter(x => names.includes(x[0]));
  const viewports = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]].filter(([v]) => pick('VIEWPORTS', ['phone', 'desktop']).includes(v));
  let count = 0;

  for (const scheme of pick('SCHEMES', ['light', 'dark'])) {
    for (const [vp, size] of viewports) {
      for (const [name, hash, kind, act] of shots) {
        const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: vp === 'phone' ? 2 : 1, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}/${scheme}/${vp}: ${e.message}`));
        await page.route(/gstatic\.com\/firebasejs/, r => r.abort());
        await page.addInitScript(({ seed: sd, kind: k }) => {
          if (!k) return;
          localStorage.setItem('ff.mode', JSON.stringify('guest'));
          if (k === 'new') return;
          localStorage.setItem('ff.guest.profile', JSON.stringify(sd.profile));
          if (k === 'fresh') return;
          Object.entries(sd.days).forEach(([d, v]) => localStorage.setItem('ff.guest.day.' + d, JSON.stringify(v)));
          localStorage.setItem('ff.guest.index', JSON.stringify(Object.keys(sd.days).sort()));
        }, { seed: data, kind });
        await page.goto(url + hash);
        await page.waitForTimeout(kind ? 1500 : 900);
        if (act) await act(page);
        await page.waitForTimeout(500);
        const full = vp === 'phone' && !['snap', 'log-sheet', 'onboarding', 'onboarding-goal'].includes(name);
        // in a full-page capture a fixed tab bar lands mid-page; pin it to the bottom of the document instead
        if (full) await page.addStyleTag({ content: 'body{position:relative!important}.tabbar{position:absolute!important;bottom:12px!important}' });
        await page.screenshot({ path: path.join(OUT, `${name}.${scheme}.${vp}.png`), fullPage: full });
        count++;
        await ctx.close();
      }
    }
  }
  await browser.close();
  server.close();
  console.log(`saved ${count} screenshots to ${OUT}`);
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
})();
