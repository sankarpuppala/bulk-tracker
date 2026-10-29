// =============================================================
// Browser tests for Fuel & Forge.
//
//   npx playwright@1.49.1 install chromium     (once)
//   node test/run.cjs
//
// Serves the app on a random port, drives it with Chromium and fails
// (exit 1) on any assertion failure or uncaught page error. The cloud
// half runs against test/firebase-mock.js, so no Firebase project is
// needed — but it only proves the app's own logic, not that your real
// Firestore rules allow the writes.
// =============================================================
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'firebase-mock.js'), 'utf8');
const TODAY = new Date().toISOString().slice(0, 10);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failed++; console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? '  → ' + detail : '')); }
};
const group = n => console.log('\n\x1b[1m' + n + '\x1b[0m');

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  return new Promise(r => server.listen(0, () => r({ server, url: `http://localhost:${server.address().port}/index.html` })));
}

async function newPage(browser, { seed, mock = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('uncaught: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|net::|gstatic/i.test(m.text())) errors.push('console: ' + m.text()); });
  // the real SDK can't be reached in CI; the mock stands in for it
  await page.route(/gstatic\.com\/firebasejs/, r => r.abort());
  // must run before the mock reads sessionStorage
  if (seed) await page.addInitScript(x => {
    sessionStorage.setItem('__fbuser', JSON.stringify(x.user));
    sessionStorage.setItem('__fbdb', JSON.stringify(x.db));
  }, seed);
  if (mock) await page.addInitScript({ content: MOCK });
  page.errors = errors;
  return page;
}

const goToday = async p => { await p.evaluate(() => { location.hash = '#/today'; }); await p.waitForTimeout(700); };

/** Walk the onboarding wizard to the end, accepting every default. */
async function completeOnboarding(p, name) {
  await p.waitForSelector('.ob input');
  await p.fill('.ob input', name);
  for (let i = 0; i < 14; i++) {
    const btn = await p.$('.ob:not(.closing) .ob-next');
    if (!btn) break;
    await btn.click().catch(() => {});           // the last click detaches the wizard
    await p.waitForTimeout(260);
  }
  await p.waitForSelector('.ob', { state: 'detached' }).catch(() => {});
  await p.waitForTimeout(500);
}

// ---------------- guest mode ----------------
async function guestFlow(browser, url) {
  group('Guest mode');
  const p = await newPage(browser, { mock: false });
  await p.goto(url);
  await p.click('text=Try it as a guest');
  await p.waitForTimeout(400);

  await completeOnboarding(p, 'Tester');
  ok('onboarding completes and lands on Today', await p.isVisible('.today'));
  ok('targets were calculated', await p.evaluate(() => /\d/.test(document.querySelector('.hero-big')?.innerText || '')));

  const ate = await p.$('text=Ate this plate');
  if (ate) await ate.click();
  await p.waitForTimeout(500);
  ok('mess plate logs in one tap', await p.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).length > 0, TODAY));

  // natural-language logging
  await p.click('.fab'); await p.waitForTimeout(400);
  await p.click('.tabs-seg .seg-btn >> nth=1'); await p.waitForTimeout(200);
  await p.fill('.log-body textarea', '2 boiled eggs, 1 glass milk, bingo chilli 20rs, 150g chicken breast');
  await p.waitForTimeout(500);
  const parsed = await p.evaluate(() => [...document.querySelectorAll('.log-body .li-t')].map(e => e.innerText.trim()));
  ok('quick-log parses 4 items', parsed.length === 4, parsed.join(' | '));
  ok('"1 glass milk" resolves to milk, not Milk Bikis', /milk/i.test(parsed[1] || '') && !/bikis/i.test(parsed[1] || ''), parsed[1]);
  await p.click('.log-body .btn.primary.lg'); await p.waitForTimeout(800);

  // edit a logged item
  await goToday(p);
  await p.click('.log-edit >> nth=0'); await p.waitForTimeout(400);
  const bar = await p.evaluate(() => document.querySelector('.sheet .total-bar').innerText);
  ok('edit sheet has no "null"/"false" text', !/\b(null|false)\b/.test(bar), bar);
  const before = await p.evaluate(k => JSON.parse(localStorage.getItem('ff.guest.day.' + k)).items[0].cal, TODAY);
  await p.click('.sheet .stepper-btn >> nth=0'); await p.waitForTimeout(150);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(600);
  const after = await p.evaluate(k => JSON.parse(localStorage.getItem('ff.guest.day.' + k)).items[0].cal, TODAY);
  ok('editing quantity rescales calories', after < before, `${before} → ${after}`);

  // short search must not print a literal "false"
  await p.click('.fab'); await p.waitForTimeout(400);
  await p.fill('.search-input', 'da'); await p.waitForTimeout(400);
  ok('2-char search renders cleanly', !/\bfalse\b/.test(await p.evaluate(() => document.querySelector('.results').innerText)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  for (const r of ['mess', 'train', 'stats', 'me']) {
    await p.evaluate(x => { location.hash = '#/' + x; }, r);
    await p.waitForTimeout(700);
    ok(`${r} renders`, await p.isVisible('.page.' + r));
  }
  ok('no page errors in guest mode', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

// ---------------- cloud mode ----------------
async function cloudFlow(browser, url) {
  group('Cloud mode (Firebase mock)');
  const p = await newPage(browser);
  await p.goto(url);
  await p.waitForTimeout(600);

  // start as a guest so the import path runs
  await p.click('text=Try it as a guest'); await p.waitForTimeout(400);
  await completeOnboarding(p, 'Meera');
  const ate = await p.$('text=Ate this plate'); if (ate) { await ate.click(); await p.waitForTimeout(400); }

  await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(500);
  await p.click('text=Create account / Sign in'); await p.waitForTimeout(700);
  await p.click('.seg-btn >> text=Create account'); await p.waitForTimeout(200);
  await p.fill('input[placeholder="First name"]', 'Meera');
  await p.fill('input[type=email]', 'meera@college.edu');
  await p.fill('input[type=password]', 'hunter2x');
  await p.click('.auth-card .btn.primary'); await p.waitForTimeout(1200);
  ok('guest data offers to come along', await p.isVisible('text=Bring your guest data?'));
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(1300);
  ok('profile written to Firestore', await p.evaluate(() => window.__fb.DB['users/u1']?.name === 'Meera'));
  ok('guest day imported', await p.evaluate(k => (window.__fb.DB['users/u1/logs/' + k]?.items || []).length > 0, TODAY));

  await goToday(p);
  await p.click('.fab'); await p.waitForTimeout(400);
  await p.click('.tabs-seg .seg-btn >> nth=1'); await p.waitForTimeout(200);
  await p.fill('.log-body textarea', '2 boiled eggs'); await p.waitForTimeout(400);
  await p.click('.log-body .btn.primary.lg'); await p.waitForTimeout(900);
  ok('logging writes to the cloud', await p.evaluate(k => (window.__fb.DB['users/u1/logs/' + k].items || []).some(i => /egg/i.test(i.n)), TODAY));

  // another device writes the same day
  await p.evaluate(k => {
    const path = 'users/u1/logs/' + k;
    const d = JSON.parse(JSON.stringify(window.__fb.DB[path]));
    d.items.push({ id: 'remote1', n: 'Logged on my laptop', cal: 300, p: 20, c: 10, f: 15, meal: 'lunch', diet: 'v', cat: 'custom' });
    window.__fb.remoteSet(path, d);
  }, TODAY);
  await p.waitForTimeout(1000);
  ok('another device\'s change syncs in live', await p.isVisible('text=Logged on my laptop'));

  // admin
  await p.evaluate(() => window.__fb.remoteSet('admins/u1', { role: 'admin' }));
  await p.reload(); await p.waitForTimeout(1600);
  await p.evaluate(() => { location.hash = '#/mess'; }); await p.waitForTimeout(800);
  ok('admin controls appear for an admin', await p.isVisible('text=Edit / publish'));
  await p.click('text=Edit / publish'); await p.waitForTimeout(500);
  await p.selectOption('select[aria-label="Copy from"]', 'sample:nonveg'); await p.waitForTimeout(400);
  if (await p.$('text=Replace the whole week?')) { await p.click('.sheet .btn.danger'); await p.waitForTimeout(400); }
  await p.click('text=Publish for everyone'); await p.waitForTimeout(900);
  ok('admin publishes a mess menu', await p.evaluate(() => !!window.__fb.DB['messes/CNV']?.menu?.Monday));

  await p.click('text=✨ Add special'); await p.waitForTimeout(600);
  await p.fill('.sheet input[placeholder*="Diwali"]', 'Diwali Feast');
  await p.fill('.sheet .picker input', 'gulab jamun'); await p.waitForTimeout(300);
  await p.click('.picker-opt >> nth=0'); await p.waitForTimeout(300);
  await p.click('text=Publish special'); await p.waitForTimeout(900);
  ok('admin publishes a festival special', await p.evaluate(() => Object.keys(window.__fb.DB).some(k => k.startsWith('specials/'))));
  await goToday(p);
  ok('the special shows on Today', await p.isVisible('.fest'));

  // leaderboard opt-in
  await p.evaluate(() => { location.hash = '#/stats'; }); await p.waitForTimeout(900);
  const join = await p.$('button.btn.primary:has-text("Join")');
  if (join) { await join.click(); await p.waitForTimeout(1200); }
  ok('leaderboard entry is written on opt-in', await p.evaluate(() => !!window.__fb.DB['leaderboard/u1']?.xp));

  // sign out and back in
  await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(600);
  await p.click('.btn.danger >> text=Sign out'); await p.waitForTimeout(400);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(1200);
  ok('sign-out returns to the auth screen', await p.isVisible('.auth-card'));
  await p.fill('input[type=email]', 'meera@college.edu');
  await p.fill('input[type=password]', 'hunter2x');
  await p.click('.auth-card .btn.primary'); await p.waitForTimeout(1600);
  await goToday(p);
  ok('signing back in restores the profile', await p.evaluate(() => document.body.innerText.includes('Meera')));
  ok('signing back in restores the log', await p.evaluate(() => document.body.innerText.includes('Logged on my laptop')));

  ok('no page errors in cloud mode', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

// ---------------- admin scoping ----------------
async function adminScopes(browser, url) {
  group('Admin roles');
  const profile = { name: 'Rep', onboarded: true, mess: 'AV', diet: 'veg', goal: 'gain', routine: { wake: '06:30', sleep: '23:00', gym: '17:30' }, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {} };
  const seed = admin => ({
    user: { uid: 'u1', email: 'rep@college.edu', displayName: 'Rep' },
    db: { 'users/u1': profile, 'admins/u1': admin },
  });

  // committee member for AV only
  let p = await newPage(browser, { seed: seed({ messes: ['AV'] }) });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = '#/mess'; }); await p.waitForTimeout(900);
  ok('mess admin can publish their own mess', await p.isVisible('text=Edit / publish'));
  ok('mess admin can post a special for their mess', await p.isVisible('text=Add special'));
  await p.click('.mess-chip >> nth=1'); await p.waitForTimeout(800);   // BV
  ok('mess admin cannot publish another mess', !(await p.isVisible('text=Edit / publish')));
  ok('…and gets the personal editor instead', await p.isVisible('text=Edit menu'));
  ok('mess admin cannot post a special for another mess', !(await p.isVisible('text=Add special')));
  await p.click('text=Edit menu'); await p.waitForTimeout(600);
  ok('no publish button in another mess\'s editor', !(await p.isVisible('text=Publish for everyone')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(800);
  ok('mess admin sees no access manager', !(await p.isVisible('text=Manage mess committee access')));
  ok('no page errors as a mess admin', p.errors.length === 0, p.errors.join('; '));
  await p.close();

  // super-admin
  p = await newPage(browser, { seed: seed({ super: true }) });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = '#/mess'; }); await p.waitForTimeout(900);
  await p.click('.mess-chip >> nth=1'); await p.waitForTimeout(800);
  ok('super-admin can publish any mess', await p.isVisible('text=Edit / publish'));
  await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(800);
  ok('super-admin sees the access manager', await p.isVisible('text=Manage mess committee access'));
  await p.click('text=Manage mess committee access'); await p.waitForTimeout(900);
  await p.fill('.sheet input[placeholder*="user ID"]', 'student42');
  await p.click('.sheet .chip >> nth=2'); await p.waitForTimeout(200);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(900);
  const granted = await p.evaluate(() => window.__fb.DB['admins/student42']);
  ok('super-admin grants scoped access', !!granted && Array.isArray(granted.messes) && granted.messes.length > 0, JSON.stringify(granted));
  ok('granted access is not super', !granted?.super);
  ok('no page errors as a super-admin', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

// ---------------- paste importer ----------------
async function pasteImporter(browser, url) {
  group('Paste-a-week importer');
  const p = await newPage(browser, { mock: false });
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.setItem('ff.mode', '"guest"');
    localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'Rep', onboarded: true, mess: 'AV', diet: 'veg', goal: 'gain' }));
    location.hash = '#/mess'; location.reload();
  });
  await p.waitForTimeout(1400);
  await p.click('text=Add weekly menu'); await p.waitForTimeout(500);
  await p.click('text=Paste a week'); await p.waitForTimeout(500);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const other = today === 'SUNDAY' ? 'MONDAY' : 'SUNDAY';
  await p.fill('.paste-area', `*${today}*
Breakfast - Idli, Medu Vada, Sambar
Lunch - Rice, Chapati, Sambar, Beans Poriyal, Curd
Snacks - Tea, Onion Pakoda
Dinner - Chapati, Dal Tadka, Rasam

*${other}*
Breakfast - Pongal, Vada
Lunch - Rice, Rajma, Curd
Dinner - Veg Fried Rice, Manchurian`);
  await p.waitForTimeout(1000);
  const pills = await p.evaluate(() => [...document.querySelectorAll('.sheet .pill')].map(e => e.innerText));
  ok('finds both days', pills.some(t => /2\/7 days/.test(t)), pills.join(' '));
  ok('most dishes get macros from the database', await p.evaluate(() => {
    const m = document.body.innerText.match(/(\d+) with macros/); const d = document.body.innerText.match(/(\d+) dishes/);
    return m && d && +m[1] / +d[1] >= 0.8;
  }));
  await p.click('text=Load 2 days into the editor'); await p.waitForTimeout(900);
  const dishes = await p.evaluate(() => [...document.querySelectorAll('.edit-row .name')].map(i => i.value));
  ok('dishes land in the editor', dishes.includes('Idli') && dishes.includes('Dal Tadka'), dishes.slice(0, 4).join(', '));
  await p.click('text=Save for me'); await p.waitForTimeout(700);
  ok('warns about dishes with no calories', await p.isVisible('text=no calories'));
  await p.click('.sheet-wrap:last-of-type .btn.primary'); await p.waitForTimeout(900);
  const dayName = today[0] + today.slice(1).toLowerCase();
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ff.guest.profile')).menuOverrides?.AV);
  ok('the pasted week is saved', !!saved?.[dayName]?.lunch?.length);
  ok('matched dishes carry real macros', (saved?.[dayName]?.lunch || []).filter(i => i.cal > 0).length >= 4);
  await goToday(p);
  ok('the plate suggester uses the pasted menu', await p.isVisible('#plate-card .plate-row'));
  ok('no page errors in the importer', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

(async () => {
  const { server, url } = await serve();
  const browser = await chromium.launch();
  try {
    await guestFlow(browser, url);
    await pasteImporter(browser, url);
    await cloudFlow(browser, url);
    await adminScopes(browser, url);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed ? 1 : 0);
})();
