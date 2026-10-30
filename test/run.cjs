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
  // the app's service worker would fetch the real Firebase SDK behind page.route()'s back after the first load
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', e => errors.push('uncaught: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|net::|gstatic/i.test(m.text())) errors.push('console: ' + m.text()); });
  // the real SDK can't be reached in CI; the mock stands in for it
  await page.route(/gstatic\.com\/firebasejs/, r => r.abort());
  // fail font requests fast; a slow font stylesheet delays module scripts and makes reload-based tests flaky
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // the consent sheet is covered by its own tests; everywhere else, say yes as a person would (a test sets __noAutoConsent to see it)
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
    if (window.__noAutoConsent) return;
    const b = document.querySelector('.consent .btn.primary'); if (b) setTimeout(() => b.click(), 50);
  }).observe(document.body, { childList: true, subtree: true })));
  // must run before the mock reads sessionStorage
  if (seed) await page.addInitScript(x => {
    sessionStorage.setItem('__fbuser', JSON.stringify(x.user));
    sessionStorage.setItem('__fbdb', JSON.stringify(x.db));
  }, seed);
  if (mock) await page.addInitScript({ content: MOCK });
  page.errors = errors;
  return page;
}

/** Snap button → "search or type it instead" opens the log sheet, the way a user gets there. */
const openLogSheet = async p => { await p.click('.fab'); await p.waitForTimeout(400); await p.click('text=Search or type it instead'); await p.waitForTimeout(500); };
const goToday = async p => { await p.evaluate(() => { location.hash = '#/today'; }); await p.waitForTimeout(700); };

/** Walk the onboarding wizard to the end, accepting every default. */
/** The consent sheet appears when the wizard finishes; say yes. */
const agree = async p => { const b = await p.$('.consent .btn.primary'); if (b) { await b.click().catch(() => {}); await p.waitForTimeout(400); } };

async function completeOnboarding(p, name) {
  await p.waitForSelector('.ob input');
  await p.fill('.ob input', name);
  for (let i = 0; i < 14; i++) {
    const btn = await p.$('.ob:not(.closing) .ob-next');
    if (!btn) break;
    await btn.click().catch(() => {});           // the last click detaches the wizard
    await p.waitForTimeout(260);
    await agree(p);
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
  ok('targets were calculated', await p.evaluate(() => /\d/.test(document.querySelector('.pg-num')?.innerText || '')));

  const ate = await p.$('text=Log this plate');
  if (ate) await ate.click();
  await p.waitForTimeout(500);
  ok('mess plate logs in one tap', await p.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).length > 0, TODAY));

  // natural-language logging
  await openLogSheet(p);
  await p.click('.tabs-seg .seg-btn >> nth=1'); await p.waitForTimeout(200);
  await p.fill('.log-body textarea', '2 boiled eggs, 1 glass milk, bingo chilli 20rs, 150g chicken breast');
  await p.waitForTimeout(500);
  const parsed = await p.evaluate(() => [...document.querySelectorAll('.log-body .li-t')].map(e => e.innerText.trim()));
  ok('quick-log parses 4 items', parsed.length === 4, parsed.join(' | '));
  ok('"1 glass milk" resolves to milk, not Milk Bikis', /milk/i.test(parsed[1] || '') && !/bikis/i.test(parsed[1] || ''), parsed[1]);
  await p.click('.log-body .btn.primary.lg'); await p.waitForTimeout(800);

  // edit a logged item
  await goToday(p);
  // the list is grouped by meal, so find the item by name rather than assuming it is first in storage
  const editName = await p.evaluate(() => document.querySelector('.log-edit').getAttribute('aria-label').replace(/^Edit /, ''));
  const calOf = name => p.evaluate(([k, n]) => JSON.parse(localStorage.getItem('ff.guest.day.' + k)).items.find(i => i.n === n).cal, [TODAY, editName]);
  await p.click('.log-edit >> nth=0'); await p.waitForTimeout(400);
  const bar = await p.evaluate(() => document.querySelector('.sheet .total-bar').innerText);
  ok('edit sheet has no "null"/"false" text', !/\b(null|false)\b/.test(bar), bar);
  const before = await calOf();
  await p.click('.sheet .stepper-btn >> nth=0'); await p.waitForTimeout(150);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(600);
  const after = await calOf();
  ok('editing quantity rescales calories', after < before, `${before} → ${after}`);

  // short search must not print a literal "false"
  await openLogSheet(p);
  await p.fill('.search-input', 'da'); await p.waitForTimeout(400);
  ok('2-char search renders cleanly', !/\bfalse\b/.test(await p.evaluate(() => document.querySelector('.results').innerText)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // new routes, and the pre-redesign hashes that must keep working
  for (const [hash, sel, label] of [['#/plan', '.page.plan', 'plan'], ['#/ask', '.page.ask', 'ask'], ['#/progress', '.page.stats', 'progress'], ['#/you', '.page.me', 'you'],
    ['#/mess', '.page.mess', 'old #/mess → Plan › Menus'], ['#/train', '.page.train', 'old #/train → Plan › Training'], ['#/stats', '.page.stats', 'old #/stats → Progress'], ['#/me', '.page.me', 'old #/me → You']]) {
    await p.evaluate(x => { location.hash = x; }, hash);
    await p.waitForTimeout(700);
    ok(`${label} renders`, await p.isVisible(sel));
  }
  await p.evaluate(() => { location.hash = '#/train'; }); await p.waitForTimeout(500);
  ok('old #/train lands on #/plan/training', await p.evaluate(() => location.hash === '#/plan/training'));
  ok('the tab bar has five destinations and a Snap button', await p.evaluate(() => document.querySelectorAll('.tabbar .tab-btn').length === 4 && !!document.querySelector('.tabbar .fab')));
  ok('the active tab is marked for screen readers', await p.evaluate(() => !!document.querySelector('.tab-btn.on[aria-current="page"]')));

  // Ask: search → budget impact → log
  await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(600);
  await p.fill('.searchfield input', 'samosa'); await p.waitForTimeout(400);
  await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(400);
  ok('ask shows the nutrient table and budget impact', await p.isVisible('.ntable') && /of the .* kcal you have left|past today/.test(await p.evaluate(() => document.querySelector('.impact')?.innerText || '')));
  ok('ask shows a verdict card', await p.isVisible('.page.ask .verdict'));
  const before2 = await p.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).length, TODAY);
  await p.click('.page.ask .verdict .btn.primary'); await p.waitForTimeout(700);
  ok('ask can log the food', await p.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).length, TODAY) === before2 + 1);

  // Snap sheet
  await goToday(p);
  await p.click('.fab'); await p.waitForTimeout(500);
  ok('snap sheet offers all four modes', await p.evaluate(() => document.querySelectorAll('.snap-seg .seg-btn').length === 4));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
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
  const ate = await p.$('text=Log this plate'); if (ate) { await ate.click(); await p.waitForTimeout(400); }

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
  await openLogSheet(p);
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

  await p.click('text=Add special'); await p.waitForTimeout(600);
  await p.fill('.sheet input[placeholder*="Diwali"]', 'Diwali Feast');
  await p.fill('.sheet .picker input', 'gulab jamun'); await p.waitForTimeout(300);
  await p.click('.picker-opt >> nth=0'); await p.waitForTimeout(300);
  await p.click('text=Publish special'); await p.waitForTimeout(900);
  ok('admin publishes a festival special', await p.evaluate(() => Object.keys(window.__fb.DB).some(k => k.startsWith('specials/'))));
  await goToday(p);
  ok('the special shows on Today', await p.isVisible('.banner.special'));

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
  // A mess now ships with its real chart, so open the editor on it instead of the empty state
  await p.click('.chip >> text=Edit menu'); await p.waitForTimeout(500);
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
  await p.click('text=Load 2 days into the editor'); await p.waitForTimeout(600);
  if (await p.isVisible('text=Replace the whole week?')) { await p.click('.sheet-wrap:last-of-type .btn.danger'); await p.waitForTimeout(900); }
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
  ok('the plate suggester uses the pasted menu', await p.isVisible('#plate-card .prow'));
  ok('no page errors in the importer', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

// ---------------- goal planner, migration, check-ins ----------------
async function goalFlow(browser, url) {
  group('Goal planner');
  const p = await newPage(browser, { mock: false });
  await p.goto(url);
  await p.click('text=Try it as a guest'); await p.waitForTimeout(400);
  await p.waitForSelector('.ob input');
  await p.fill('.ob input', 'Asha');
  const next = async () => { await p.click('.ob:not(.closing) .ob-next'); await p.waitForTimeout(260); };
  await next(); await next(); await next();                    // name → mission → body → target
  ok('the target step is the goal planner', await p.isVisible('.gp'));
  ok('a sensible default is a realistic plan', await p.isVisible('.gp-status.go') && /Realistic/.test(await p.innerText('.gp-status')));
  ok('the plan shows phases, a chart and Day-1 targets', await p.evaluate(() => document.querySelectorAll('.gp-phases li').length >= 2 && !!document.querySelector('.gp .goalchart svg') && /day 1/i.test(document.querySelector('.gp-day1').innerText)));

  // push the target far beyond a safe pace
  await p.evaluate(() => { const b = document.querySelectorAll('.gp .grid2 .field')[1].querySelectorAll('.stepper-btn')[1]; for (let i = 0; i < 40; i++) b.click(); });
  await p.waitForTimeout(300);
  ok('an unsafe target turns the box red and is not offered', await p.isVisible('.gp-status.stop') && /Not offered/.test(await p.innerText('.gp-status')));
  ok('…with counter-offers instead of a plan', await p.evaluate(() => document.querySelectorAll('.gp-offers .chip').length >= 2 && !document.querySelector('.gp-phases')));
  await next();
  ok('Continue refuses an unsafe plan', await p.isVisible('.gp') && await p.isVisible('.toast'));
  await p.click('.gp-offers .chip >> nth=0'); await p.waitForTimeout(300);
  ok('taking a counter-offer makes the plan safe', !(await p.isVisible('.gp-status.stop')) && await p.isVisible('.gp-phases'));
  for (let i = 0; i < 14; i++) { const b = await p.$('.ob:not(.closing) .ob-next'); if (!b) break; await b.click().catch(() => {}); await p.waitForTimeout(260); await agree(p); }
  await p.waitForSelector('.ob', { state: 'detached' }).catch(() => {}); await p.waitForTimeout(800);
  const saved = await p.evaluate(() => ({ goals: JSON.parse(localStorage.getItem('ff.guest.goals') || '[]'), pf: JSON.parse(localStorage.getItem('ff.guest.profile') || '{}') }));
  ok('finishing onboarding saves a goal plan and activates it', saved.goals.length === 1 && saved.pf.activeGoalId === saved.goals[0].id && saved.goals[0].feasibility !== 'blocked', JSON.stringify(saved.pf.activeGoalId));
  ok('the plan ends with a 2-week maintenance phase', saved.goals[0]?.phases.at(-1).kind === 'maintain');

  await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(700);
  ok('Plan shows the goal, its phase and the plan chart', await p.isVisible('.goal-card') && await p.isVisible('.goal-card .goalchart svg'));
  await p.click('.goal-card >> text=Adjust plan'); await p.waitForTimeout(500);
  ok('Adjust plan opens the planner sheet', await p.isVisible('.sheet .gp'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('no page errors in the goal planner', p.errors.length === 0, p.errors.join('; '));
  await p.close();

  // ---- existing users: a v1 profile gets a plan with the same day-1 targets ----
  group('Goal plan migration');
  const m = await newPage(browser, { mock: false });
  await m.goto(url);
  await m.evaluate(() => {
    localStorage.setItem('ff.mode', '"guest"');
    localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'Old', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'lose', pace: 0.5, weight: 70, goalWeight: 64, height: 172, age: 21, sex: 'male', activity: 'moderate' }));
  });
  await m.reload(); await m.waitForTimeout(1500);
  const mig = await m.evaluate(async () => {
    const { calcTargets } = await import('/js/engine/targets.js');
    const pf = JSON.parse(localStorage.getItem('ff.guest.profile')), goals = JSON.parse(localStorage.getItem('ff.guest.goals') || '[]');
    const t = calcTargets({ ...pf, phase: null, calAdjust: 0 }), d1 = goals[0] && goals[0].phases[0].macros;
    return { n: goals.length, same: !!d1 && d1.cal === t.cal && d1.p === t.p && d1.c === t.c && d1.f === t.f, active: pf.activeGoalId === (goals[0] && goals[0].id), type: goals[0] && goals[0].type };
  });
  ok('a v1 profile gets exactly one goal plan', mig.n === 1 && mig.active && mig.type === 'lose', JSON.stringify(mig));
  ok('its day-1 targets equal the old calcTargets', mig.same);
  ok('no page errors during migration', m.errors.length === 0, m.errors.join('; '));
  await m.close();

  // ---- weekly check-in, due 8 days into a plan ----
  group('Weekly check-in');
  const c = await newPage(browser, { mock: false });
  await c.goto(url);
  await c.evaluate(async () => {
    const { buildGoalPlan } = await import('/js/engine/goal.js');
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const plan = buildGoalPlan({ weight: 60, target: 66, months: 8, sex: 'male', age: 20, height: 175, activity: 'moderate', startDate: day(8) });
    plan.id = 'gt';
    const idx = [];
    for (let n = 12; n >= 1; n--) {
      const key = day(n); idx.push(key);
      const items = ['breakfast', 'lunch', 'dinner'].map((meal, i) => ({ id: 'i' + n + i, n: 'Meal ' + meal, meal, cal: 900, p: 40, c: 110, f: 28, diet: 'v', cat: 'custom', ts: Date.now() }));
      localStorage.setItem('ff.guest.day.' + key, JSON.stringify({ items, gymDone: [], sets: {}, water: 0, weight: n % 2 ? 60 + (12 - n) * 0.04 : null, note: '' }));
    }
    localStorage.setItem('ff.guest.index', JSON.stringify(idx));
    localStorage.setItem('ff.mode', '"guest"');
    localStorage.setItem('ff.guest.goals', JSON.stringify([plan]));
    localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'Dev', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'gain', pace: plan.rateWk, weight: 60, goalWeight: 66, height: 175, age: 20, sex: 'male', activity: 'moderate', activeGoalId: 'gt' }));
  });
  await c.reload(); await c.waitForTimeout(1500);
  ok('a check-in banner appears once a week has passed', await c.isVisible('.banner.info') && /weekly check-in/i.test(await c.innerText('.banner.info')));
  await c.click('.banner.info >> text=Check in'); await c.waitForTimeout(500);
  ok('the check-in explains its decision', await c.isVisible('.sheet .verdict') && (await c.innerText('.sheet .verdict-b')).length > 20);
  ok('the check-in is saved', await c.evaluate(() => JSON.parse(localStorage.getItem('ff.guest.checkins') || '[]').length === 1));
  await c.keyboard.press('Escape'); await c.waitForTimeout(400);
  ok('the banner is gone once checked in', !(await c.isVisible('.banner.info')));
  await c.evaluate(() => { location.hash = '#/progress'; }); await c.waitForTimeout(800);
  ok('Progress lists the check-in and the plan chart', await c.isVisible('.checkins .ci-row') && await c.isVisible('.plan-vs .goalchart svg'));
  ok('no page errors in check-ins', c.errors.length === 0, c.errors.join('; '));
  await c.close();
}

// ---------------- day plan, week grid, "not this today", live menu changes ----------------

async function verdictFlow(browser, url) {
  group('Should I eat this?');
  const mk = async (profile, { history = [] } = {}) => {
    const p = await newPage(browser, { mock: false });
    await p.goto(url);
    await p.evaluate(([pf, hist]) => {
      localStorage.setItem('ff.mode', '"guest"');
      localStorage.setItem('ff.guest.profile', JSON.stringify(pf));
      for (const [k, v] of hist) localStorage.setItem('ff.guest.day.' + k, JSON.stringify(v));
    }, [profile, history]);
    await p.reload(); await p.waitForTimeout(1500);
    return p;
  };
  const base = { name: 'V', onboarded: true, mess: 'CNV', goal: 'lose', pace: 0.5, weight: 70, goalWeight: 64, height: 172, age: 21, sex: 'male', activity: 'moderate' };
  const ask = async (p, text) => { await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(500); await p.fill('.searchfield input', text); await p.waitForTimeout(400); };

  // vegetarian asks about chicken → skip, neutral, no "anyway"
  const v = await mk({ ...base, diet: 'veg' });
  await ask(v, 'chicken biryani'); await v.click('.page.ask .li-btn >> nth=0'); await v.waitForTimeout(400);
  const vtext = await v.innerText('.page.ask .verdict');
  ok('a vegetarian gets a skip for chicken', await v.isVisible('.verdict.stop') && /skip/i.test(vtext), vtext);
  ok('…with neutral copy and no "log anyway" nudge', /non-vegetarian/.test(vtext) && !(await v.isVisible('text=anyway')));
  ok('…and the Ask page shows the "not medical advice" note', /not medical advice/i.test(await v.innerText('.page.ask')));
  ok('no page errors for the diet block', v.errors.length === 0, v.errors.join('; '));
  await v.close();

  // a peanut allergy is a hard block too
  const al = await mk({ ...base, diet: 'nonveg', allergies: ['peanut'] });
  await ask(al, 'peanut butter'); await al.click('.page.ask .li-btn >> nth=0'); await al.waitForTimeout(400);
  ok('an allergen is a skip with its own wording', await al.isVisible('.verdict.stop') && /allergy/.test(await al.innerText('.page.ask .verdict')));
  await al.close();

  // a cutter, offline: the verdict works with the network off
  // a normal day so far (1,300 kcal logged), so the calorie floor doesn't turn every answer into "go" late in the evening
  const todayK = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  const c = await mk({ ...base, diet: 'nonveg' }, { history: [[todayK, { items: [{ id: 'l1', n: 'Lunch thali', cal: 1300, p: 50, c: 170, f: 40, meal: 'lunch', diet: 'v', ts: Date.now() }], water: 0, gymDone: [], sets: {} }]] });
  await c.context().setOffline(true);
  await ask(c, '3 chicken biryani');
  ok('a typed plate offers "Check this plate"', await c.isVisible('text=Check this plate'));
  await c.click('text=Check this plate'); await c.waitForTimeout(500);
  const kind = await c.evaluate(() => document.querySelector('.page.ask .verdict')?.className || '');
  ok('three biryanis for a cutter is not a plain go, offline', /caution|swap|stop/.test(kind), kind);
  ok('the verdict says what to do if you eat it anyway or what to swap', /anyway|fits better|Have/.test(await c.innerText('.page.ask .verdict')));
  ok('the numbers table is still shown', await c.isVisible('.ntable'));
  await c.context().setOffline(false);

  // logging the suggested portion logs less than the full portion
  await c.evaluate(() => { location.hash = '#/ask'; }); await c.waitForTimeout(400);
  await ask(c, 'chicken biryani'); await c.click('.page.ask .li-btn >> nth=0'); await c.waitForTimeout(400);
  const before = await c.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).reduce((a, i) => a + i.cal, 0), TODAY);
  const full = await c.evaluate(() => +(document.querySelector('.ntable tbody tr td b')?.innerText.replace(/,/g, '') || 0));
  await c.click('.page.ask .verdict .btn.primary'); await c.waitForTimeout(600);
  const after = await c.evaluate(k => (JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').items || []).reduce((a, i) => a + i.cal, 0), TODAY);
  ok('the primary action logs the verdict’s portion', after > before && after - before <= full, `${before} → ${after}, full ${full}`);
  ok('the verdict is remembered under "Recent answers"', (await c.evaluate(() => JSON.parse(localStorage.getItem('ff.verdicts') || '[]').length)) >= 1);

  // hold-to-ask from the log sheet
  await c.evaluate(() => { location.hash = '#/today'; }); await c.waitForTimeout(500);
  await openLogSheet(c);
  await c.fill('.search-input', 'samosa'); await c.waitForTimeout(500);
  const row = await c.$('.log-body .li-btn'); const box = await row.boundingBox();
  await c.mouse.move(box.x + 30, box.y + 20); await c.mouse.down(); await c.waitForTimeout(800); await c.mouse.up(); await c.waitForTimeout(700);
  ok('holding a result opens Ask on that food', await c.evaluate(() => location.hash === '#/ask') && await c.isVisible('.page.ask .verdict'));
  ok('no page errors in the verdict flow', c.errors.length === 0, c.errors.join('; '));
  await c.close();

  // eating-disorder signal: five very-low days → gentle card, never "skip"
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const hist = [1, 2, 3, 4, 5, 6].map(n => [day(n), { items: [{ id: 'e' + n, n: 'Bit of toast', cal: 500, p: 15, c: 70, f: 10, meal: 'breakfast', diet: 'v', ts: Date.now() }], water: 0, gymDone: [], sets: {} }]);
  const ed = await mk({ ...base, diet: 'nonveg' }, { history: hist });
  await ed.evaluate(() => { location.hash = '#/ask'; }); await ed.waitForTimeout(800);
  ok('repeated very-low days show the gentle check-in with Tele-MANAS', await ed.isVisible('.ed-card') && /14416/.test(await ed.innerText('.ed-card')));
  await ed.fill('.searchfield input', '3 chicken biryani'); await ed.waitForTimeout(400);
  await ed.click('text=Check this plate'); await ed.waitForTimeout(500);
  ok('…and no verdict tells them to eat less', await ed.isVisible('.verdict.go') && !(await ed.isVisible('.verdict.stop')));
  await ed.close();
}

async function snapFlow(browser, url) {
  group('Snap');
  const GW = 'http://gw.test';
  const profile = { name: 'Stu', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'lose', pace: 0.5, weight: 70, goalWeight: 66, height: 175, age: 20, sex: 'male', activity: 'moderate', consents: { ai: Date.now() }, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {} };
  const seed = { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db: { 'users/u1': profile } };
  const MEAL = { is_food: true, usable: true, plate_context: 'steel thali', items: [
    { name: 'Steamed rice', grams: 200, cooking: 'steamed', visible_fat: 'none', confidence: 'high' },
    { name: 'Dal tadka', grams: 150, cooking: 'curry', visible_fat: 'some', confidence: 'medium' },
    { name: 'Mystery gravy', grams: 100, cooking: 'curry', visible_fat: 'heavy', confidence: 'medium', est_per_100g: { kcal: 150, p: 5, c: 10, f: 9 } }] };
  let reply = { status: 200, body: { ok: true, data: MEAL, prompt: 'vision.meal@1' } };
  const hits = [];
  const mk = async () => {
    const p = await newPage(browser, { seed });
    await p.addInitScript(u => localStorage.setItem('ff.aiurl', JSON.stringify(u)), GW);
    await p.route(GW + '/**', r => {
      const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
      hits.push({ url: r.request().url(), auth: r.request().headers().authorization, body: r.request().postData() });
      return r.fulfill({ status: reply.status, headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(reply.body) });
    });
    await p.goto(url); await p.waitForTimeout(1800);
    return p;
  };
  const photo = async p => {
    const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, 80, 60); return c.toDataURL('image/jpeg').split(',')[1]; });
    return { name: 'plate.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
  };
  const snap = async (p, mode) => {
    await p.click('.fab'); await p.waitForTimeout(500);
    if (mode) { await p.click('.snap-seg .seg-btn >> nth=' + ({ meal: 0, label: 1, menu: 2 })[mode]); await p.waitForTimeout(300); }
    await p.setInputFiles('.snap input[type=file] >> nth=0', await photo(p));
    await p.waitForTimeout(1800);
  };
  const kcalOf = p => p.evaluate(() => +document.querySelector('.snap-result .ntable tbody tr td b').innerText.replace(/,/g, ''));

  let p = await mk();
  await snap(p, 'meal');
  ok('a meal photo shows editable items with confidence badges', await p.evaluate(() => document.querySelectorAll('.snap-item').length === 3 && document.querySelectorAll('.snap-item .conf').length === 3));
  ok('the request carried the Firebase ID token and a resized JPEG', hits.length === 1 && hits[0].auth === 'Bearer test-token' && JSON.parse(hits[0].body).image.length > 100);
  ok('menu candidates were sent as context', Array.isArray(JSON.parse(hits[0].body).context.menuCandidates));
  ok('the model’s own guess is flagged as an estimate', /Estimate/.test(await p.innerText('.snap-result')));
  ok('the nutrient table and a verdict are shown', await p.isVisible('.snap-result .ntable') && await p.isVisible('.snap-result .verdict'));
  const kcal0 = await kcalOf(p);
  await p.click('.snap-item >> nth=0 >> .portion >> nth=0'); await p.waitForTimeout(300);
  const kcal1 = await kcalOf(p);
  ok('a portion chip changes the numbers', kcal1 < kcal0, kcal0 + ' → ' + kcal1);
  await p.click('.snap-item >> nth=2 >> [aria-label^="Remove"]'); await p.waitForTimeout(300);
  ok('an item can be removed', await p.evaluate(() => document.querySelectorAll('.snap-item').length === 2));
  await p.click('.snap-result .sticky-actions .btn >> nth=-1'); await p.waitForTimeout(1200);
  const logged = await p.evaluate(() => Object.entries(window.__fb.DB).filter(([k]) => /^users\/u1\/logs\//.test(k)).flatMap(([, d]) => d.items || []));
  ok('logging stores photo provenance', logged.length === 2 && logged.every(i => i.src === 'photo' && i.conf), JSON.stringify(logged.map(i => [i.n, i.src, i.conf])));
  ok('no page errors for a meal photo', p.errors.length === 0, p.errors.join('; '));
  await p.close();

  // not food → retake, never a table
  reply = { status: 200, body: { ok: true, data: { is_food: false, usable: true, retake_hint: 'That looks like a laptop.', items: [] }, prompt: 'vision.meal@1' } };
  p = await mk(); await snap(p, 'meal');
  ok('a non-food photo gets a retake prompt and no table', /laptop/.test(await p.innerText('.sheet')) && !(await p.isVisible('.ntable')));
  await p.close();

  // no key → add-key card
  reply = { status: 403, body: { ok: false, code: 'no_key', message: 'x' } };
  p = await mk(); await snap(p, 'meal');
  ok('no stored key shows the "add a free key" state', /Add a free Google AI key/.test(await p.innerText('.sheet')) && await p.isVisible('.sheet >> text=Add my free key'));
  await p.close();

  // quota → friendly, search offered
  reply = { status: 429, body: { ok: false, code: 'quota', message: 'x' } };
  p = await mk(); await snap(p, 'meal');
  const qt = await p.innerText('.sheet');
  ok('quota exhaustion is friendly, with search offered', /free quota is used up/i.test(qt) && !/429/.test(qt) && await p.isVisible('.sheet >> text=Search instead'));
  await p.close();

  // label → prefilled create form
  reply = { status: 200, body: { ok: true, prompt: 'vision.label@1', data: { is_label: true, product: 'Magic Masala', brand: 'Lays', per_100: { kcal: 536, protein_g: 6.5, carbs_g: 53, fat_g: 33 }, serving_size: '1 pack', serving_grams: 50, diet_mark: 'veg', energy_converted: false, unreadable_fields: [] } } };
  p = await mk(); await snap(p, 'label');
  ok('a label result shows the printed numbers', /536/.test(await p.innerText('.snap-result')));
  await p.click('.sheet >> text=Review & save as a food'); await p.waitForTimeout(800);
  const vals = await p.evaluate(() => [...document.querySelectorAll('.log-body input.input')].map(i => i.value));
  ok('…and opens the create-food form prefilled', vals.includes('Magic Masala') && vals.includes('536') && vals.includes('33'), vals.join('|'));
  await p.close();

  // menu → paste-a-week review, prefilled
  const dayMenu = { breakfast: [{ n: 'Idli', diet: 'v' }, { n: 'Sambar', diet: 'v' }], lunch: [{ n: 'Rice', diet: 'v' }], snacks: [{ n: 'Tea', diet: 'v' }], dinner: [{ n: 'Chapati', diet: 'v' }] };
  reply = { status: 200, body: { ok: true, prompt: 'vision.menu@1', data: { is_menu: true, week: Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, dayMenu])), unreadable: [] } } };
  p = await mk(); await snap(p, 'menu');
  await p.click('.sheet >> text=Review in the menu editor'); await p.waitForTimeout(1200);
  ok('a menu chart opens the paste review with the dishes filled in', await p.evaluate(() => /7\/7 days/.test(document.body.innerText) && /Idli/.test(document.querySelector('.paste-area')?.value || '')));
  await p.close();

  // offline → queued
  reply = { status: 200, body: { ok: true, data: MEAL } };
  p = await mk();
  await p.evaluate(() => import('/js/views/snap.js'));          // the service worker would have cached it; the test blocks the worker
  await p.context().setOffline(true);
  await snap(p, 'meal');
  ok('offline, the photo is saved for later and search is offered', /Saved for later/.test(await p.innerText('.sheet')));
  await p.context().setOffline(false);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.fab'); await p.waitForTimeout(600);
  ok('back online, the saved photo can be analysed', await p.isVisible('text=Analyse 1 saved photo'));
  await p.close();

  // guests are told to sign in, and the rest of the app is unaffected
  const g = await newPage(browser, { mock: false });
  await g.goto(url);
  await g.evaluate(u => { localStorage.setItem('ff.mode', '"guest"'); localStorage.setItem('ff.aiurl', JSON.stringify(u)); localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'G', onboarded: true, goal: 'lose', weight: 70, goalWeight: 66, height: 172, age: 21, sex: 'male', activity: 'moderate', diet: 'nonveg' })); }, GW);
  await g.reload(); await g.waitForTimeout(1500);
  await g.click('.fab'); await g.waitForTimeout(500);
  ok('guests see "Sign in to use AI" and the barcode path still works', /Sign in to use AI/.test(await g.innerText('.sheet')) && await g.isVisible('.sheet >> text=Scan a barcode'));
  await g.close();
}

async function coachFlow(browser, url) {
  group('Coach & AI text');
  const GW = 'http://gw.test';
  const profile = { name: 'Stu', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'lose', pace: 0.5, weight: 70, goalWeight: 66, height: 175, age: 20, sex: 'male', activity: 'moderate', consents: { ai: Date.now() }, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {} };
  const seed = { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db: { 'users/u1': profile } };
  const hits = [];
  let handler = () => ({ status: 404, json: { ok: false } });
  const mk = async ({ flagOn = true } = {}) => {
    const p = await newPage(browser, { seed });
    await p.addInitScript(([u, on]) => { localStorage.setItem('ff.aiurl', JSON.stringify(u)); if (on) localStorage.setItem('ff.flags', JSON.stringify({ coach: true })); }, [GW, flagOn]);
    await p.route(GW + '/**', r => {
      const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
      const path = new URL(r.request().url()).pathname, body = r.request().postData();
      hits.push({ path, body });
      const out = handler(path, body);
      if (out.sse) return r.fulfill({ status: 200, headers: { ...h, 'content-type': 'text/event-stream' }, body: out.sse });
      return r.fulfill({ status: out.status || 200, headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(out.json) });
    });
    await p.goto(url); await p.waitForTimeout(1800);
    await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(600);
    return p;
  };
  const say = async (p, text) => { await p.fill('.coach input', text); await p.press('.coach input', 'Enter'); await p.waitForTimeout(900); };

  // dark by default
  let p = await mk({ flagOn: false });
  ok('the coach stays hidden while its flag is off', !(await p.isVisible('.page-head >> text=Coach')));
  await p.close();

  // the guard answers dangerous asks itself: the model is never called
  p = await mk();
  ok('the Coach button shows with the flag on', await p.isVisible('.page-head >> text=Coach'));
  await p.click('.page-head >> text=Coach'); await p.waitForTimeout(500);
  await say(p, 'how do I lose 10 kg in 3 weeks');
  const crash = await p.innerText('.coach-log');
  ok('a crash-diet ask gets a safe answer from the app itself', /faster than is safe/.test(crash) && /weeks/.test(crash) && /kcal/.test(crash), crash);
  ok('…without calling the AI at all', hits.filter(h => h.path === '/ai/coach').length === 0);
  ok('…and offers a goal-timeline suggestion that applies only when tapped', await p.isVisible('.chip.proposal'));
  await say(p, 'I keep purging after meals');
  const care = await p.innerText('.coach-log');
  ok('a wellbeing message gets care, Tele-MANAS 14416 and a maintenance offer', /14416/.test(care) && await p.isVisible('.chip.proposal >> text=maintenance'));
  await p.click('.chip.proposal >> text=maintenance'); await p.waitForTimeout(900);
  const pf = await p.evaluate(() => window.__fb.DB['users/u1']);
  ok('tapping it switches the plan to maintenance', pf.goal === 'maintain', pf.goal);
  await p.close();

  // a normal question streams from the gateway; suggestions are validated
  handler = path => path === '/ai/coach'
    ? { sse: [
      'data: {"text":"You are 300 kcal under your target of 2,200. "}\n\n',
      'data: {"text":"Add a glass of milk."}\n\n',
      'data: {"call":{"name":"propose_change","args":{"kind":"calories","summary":"Raise to 2,300 kcal/day","value":2300}}}\n\n',
      'data: {"call":{"name":"propose_change","args":{"kind":"calories","summary":"Drop to 1,100 kcal/day","value":1100}}}\n\n',
      'data: {"done":true}\n\n'].join('') }
    : { json: { ok: false } };
  p = await mk();
  await p.click('.page-head >> text=Coach'); await p.waitForTimeout(500);
  await say(p, 'can you raise my calories');
  ok('a coach reply streams in', /300 kcal under/.test(await p.innerText('.coach-log')) && /glass of milk/.test(await p.innerText('.coach-log')));
  const sent = JSON.parse(hits.filter(h => h.path === '/ai/coach').at(-1).body);
  ok('the request carries a context packet of 2 KB or less', Buffer.byteLength(JSON.stringify(sent.context)) <= 2048 && sent.context.targets.floor > 1000, Buffer.byteLength(JSON.stringify(sent.context)) + ' bytes');
  ok('a safe suggestion becomes a button; a below-floor one does not', await p.evaluate(() => [...document.querySelectorAll('.chip.proposal')].map(c => c.innerText).join('|')) === 'Raise to 2,300 kcal/day');
  const before = await p.evaluate(() => window.__fb.DB['users/u1'].customTargets || null);
  ok('nothing changes until the button is tapped', before === null);
  await p.click('.chip.proposal'); await p.waitForTimeout(700);
  ok('tapping applies it', (await p.evaluate(() => window.__fb.DB['users/u1'].customTargets))?.cal === 2300);
  await p.close();

  // AI verdict explanation: accepted when it checks out, ignored when it invents numbers
  handler = path => path === '/ai/explain/verdict' ? { json: { ok: true, data: { text: 'Fits nicely today, so enjoy it.' } } } : { json: { ok: false } };
  p = await mk();
  await p.fill('.searchfield input', 'boiled egg'); await p.waitForTimeout(400);
  await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(1500);
  ok('a valid AI explanation replaces the template text', /enjoy it/.test(await p.innerText('.page.ask .verdict-b')));
  await p.close();
  handler = path => path === '/ai/explain/verdict' ? { json: { ok: true, data: { text: 'That is 9,999 kcal, far too much.' } } } : { json: { ok: false } };
  p = await mk();
  await p.fill('.searchfield input', 'boiled egg'); await p.waitForTimeout(400);
  await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(1500);
  const kept = await p.innerText('.page.ask .verdict-b');
  ok('an explanation with invented numbers is discarded; the template stays', !/9,999/.test(kept) && kept.length > 10, kept);
  await p.close();
}

async function communityFlow(browser, url) {
  group('Community & committee');
  const dish = (n, cal, pr, c) => ({ n, cal, p: pr, c, f: Math.round((cal - 4 * pr - 4 * c) / 9) });
  const day = { breakfast: [dish('Idli', 60, 2, 12)], lunch: [dish('Rice', 200, 4, 44), dish('Dal', 160, 9, 20)], snacks: [dish('Samosa', 260, 5, 25)], dinner: [dish('Chapati', 100, 3, 18), dish('Aloo gobi', 150, 3, 18)] };
  const week = Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, day]));
  const profile = { name: 'Stu', onboarded: true, mess: 'CNV', diet: 'veg', goal: 'maintain', weight: 65, height: 175, age: 20, sex: 'male', leaderboard: true, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {} };
  const db = {
    'users/u1': profile, 'messes/CNV': { menu: week, version: 1, updatedAt: Date.now(), updatedBy: 'x' }, 'admins/u1': { messes: ['CNV'] },
    'leaderboard/f1': { name: 'Asha', mess: 'CNV', xp: 500, level: 3, streak: 4, pStreak: 2, group: 'HOSTEL7', updatedAt: Date.now() },
    'leaderboard/f2': { name: 'Ravi', mess: 'CNV', xp: 100, level: 1, streak: 9, pStreak: 7, group: 'HOSTEL7', updatedAt: Date.now() },
    'leaderboard/f3': { name: 'Zed', mess: 'AV', xp: 900, level: 5, streak: 1, pStreak: 0, group: '', updatedAt: Date.now() },
  };
  for (let i = 0; i < 4; i++) for (const [dn, v] of [['Rajma', 5], ['Bland dal', 1]]) db[`dishRatings/CNV_2026-01-0${i + 1}_${dn.toLowerCase().replace(/ /g, '-')}_s${i}`] = { mess: 'CNV', date: new Date().toISOString().slice(0, 10), meal: 'lunch', dish: dn, dishKey: dn.toLowerCase().replace(/ /g, '-'), v, uid: 's' + i, ts: Date.now() };
  const p = await newPage(browser, { seed: { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db } });
  await p.goto(url); await p.waitForTimeout(2000);

  // log the suggested plate, then rate it
  await p.click('#plate-card >> text=Log this plate'); await p.waitForTimeout(800);
  ok('after a logged mess meal a one-tap rating appears', await p.isVisible('.rate-row'));
  await p.click('.rate-row .rate-btn >> nth=2'); await p.waitForTimeout(800);
  const rated = await p.evaluate(() => Object.entries(window.__fb.DB).filter(([k]) => k.startsWith('dishRatings/') && k.endsWith('_u1')));
  ok('one rating per dish is written with the mess_date_dish_uid id', rated.length >= 1 && rated.every(([k, d]) => k === `dishRatings/${d.mess}_${d.date}_${d.dishKey}_u1` && d.v === 5 && d.uid === 'u1'), JSON.stringify(rated));
  ok('the row thanks them and cannot be tapped twice', /Thanks/.test(await p.innerText('#plate-card')) && !(await p.isVisible('.rate-row .rate-btn')));

  // committee scorecard
  await p.evaluate(() => { location.hash = '#/plan/menus'; }); await p.waitForTimeout(800);
  await p.click('text=Scorecard'); await p.waitForTimeout(1200);
  const sc = await p.innerText('.sheet');
  ok('the scorecard shows menu nutrition and suggestions', /Avg protein/i.test(sc) && /Fried dishes/i.test(sc) && /Suggestions/i.test(sc), sc.slice(0, 200));
  ok('…and ranks dishes only once enough students rated them', /Rajma/.test(sc) && /Bland dal/.test(sc) && /4 votes/.test(sc));
  ok('…without showing who rated', !/s0|u1|Stu/.test(sc.split('What students think')[1] || ''));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // friend challenge
  await p.evaluate(() => { location.hash = '#/progress'; }); await p.waitForTimeout(1200);
  const all = await p.innerText('.board');
  ok('the campus board lists everyone who joined', /Asha/.test(all) && /Zed/.test(all));
  await p.fill('input[aria-label="Friends challenge code"]', 'hostel-7'); await p.click('text=Start / join'); await p.waitForTimeout(1500);
  const grp = await p.innerText('.board');
  ok('a friends code narrows the board to that group', /Asha/.test(grp) && /Ravi/.test(grp) && !/Zed/.test(grp), grp);
  await p.click('.seg-btn >> text=Protein streak'); await p.waitForTimeout(500);
  ok('the protein-streak challenge ranks Ravi (7 days) first', (await p.innerText('.board li >> nth=0')).includes('Ravi'));
  ok('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

async function hardeningFlow(browser, url) {
  group('Privacy, language & accessibility');

  // ---- consent comes before anything is stored ----
  let p = await newPage(browser, { mock: false });
  await p.addInitScript(() => { window.__noAutoConsent = true; });
  await p.goto(url);
  await p.click('text=Try it as a guest'); await p.waitForTimeout(400);
  await p.waitForSelector('.ob input'); await p.fill('.ob input', 'Kay');
  for (let i = 0; i < 14; i++) { const b = await p.$('.ob:not(.closing) .ob-next'); if (!b || await p.isVisible('.consent')) break; await b.click().catch(() => {}); await p.waitForTimeout(260); }
  ok('finishing onboarding asks for consent first', await p.isVisible('.consent'));
  ok('…and nothing is saved yet', await p.evaluate(() => !JSON.parse(localStorage.getItem('ff.guest.profile') || '{}').onboarded));
  await p.click('.consent >> text=Not now'); await p.waitForTimeout(300);
  ok('declining explains why, and still saves nothing', /cannot build a plan/.test(await p.innerText('.consent')) && await p.evaluate(() => !JSON.parse(localStorage.getItem('ff.guest.profile') || '{}').onboarded));
  await p.click('.consent >> text=I agree'); await p.waitForTimeout(1200);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ff.guest.profile') || '{}'));
  ok('agreeing records consent and finishes onboarding', saved.onboarded === true && typeof saved.consents?.health === 'number');
  await p.close();

  // an existing user who never agreed is asked once
  p = await newPage(browser, { mock: false });
  await p.addInitScript(() => { window.__noAutoConsent = true; });
  await p.goto(url);
  await p.evaluate(() => { localStorage.setItem('ff.mode', '"guest"'); localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'Old', onboarded: true, goal: 'maintain', weight: 65, height: 175, age: 20, sex: 'male', activity: 'moderate', diet: 'veg' })); });
  await p.reload(); await p.waitForTimeout(1500);
  ok('an existing user is asked for consent on the next launch', await p.isVisible('.consent'));
  await p.click('.consent >> text=I agree'); await p.waitForTimeout(500);
  ok('…and only once', !(await p.isVisible('.consent')));
  await p.reload(); await p.waitForTimeout(1200);
  ok('it does not come back', !(await p.isVisible('.consent')));

  // ---- Hindi navigation ----
  await p.evaluate(() => { location.hash = '#/you'; }); await p.waitForTimeout(700);
  await p.selectOption('select[aria-label="Language"], .field:has(label:text("Language")) select', 'hi'); await p.waitForTimeout(800);
  const navs = await p.evaluate(() => [...document.querySelectorAll('.tabbar .nav-l')].map(e => e.innerText.trim()));
  ok('switching to Hindi translates the navigation', navs.includes('आज') && navs.includes('योजना'), navs.join('|'));
  ok('the document language follows', await p.evaluate(() => document.documentElement.lang === 'hi'));
  await p.selectOption('.field:has(label:text("Language")) select', 'en'); await p.waitForTimeout(500);

  // ---- delete my data (guest) ----
  await p.evaluate(() => localStorage.setItem('ff.guest.day.2026-01-01', JSON.stringify({ items: [{ n: 'x', cal: 1 }] })));
  await p.click('text=Delete my account and data'); await p.waitForTimeout(400);
  ok('deleting needs a typed confirmation', await p.isVisible('.sheet input[placeholder="DELETE"]') && await p.isDisabled('.sheet .btn.danger'));
  await p.fill('.sheet input[placeholder="DELETE"]', 'DELETE');
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('.sheet .btn.danger')]);
  await p.waitForTimeout(800);
  ok('guest data is erased from the device', await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ff.guest')).length === 0));
  await p.close();

  // ---- delete my account (cloud) ----
  const profile = { name: 'Stu', onboarded: true, mess: 'CNV', diet: 'veg', goal: 'maintain', weight: 65, height: 175, age: 20, sex: 'male', activity: 'moderate', consents: { health: 1 }, leaderboard: true };
  const db = {
    'users/u1': profile, 'users/u1/logs/2026-06-01': { items: [{ n: 'Rice', cal: 200 }] }, 'users/u1/goals/g1': { id: 'g1' }, 'users/u1/checkins/2026-W20': { week: '2026-W20' }, 'users/u1/plans/2026-06-01': { v: 1 },
    'leaderboard/u1': { name: 'Stu', xp: 5 }, 'leaderboard/other': { name: 'Other', xp: 9 },
    'dishRatings/CNV_2026-06-01_rice_u1': { uid: 'u1', mess: 'CNV' }, 'dishRatings/CNV_2026-06-01_rice_zz': { uid: 'zz', mess: 'CNV' },
  };
  p = await newPage(browser, { seed: { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db } });
  const deleted = new Set();           // the page reloads after deleting (and the mock re-seeds), so watch the deletes as they happen
  await p.exposeFunction('__fbOut', (path, data) => { if (data === null) deleted.add(path); });
  await p.goto(url); await p.waitForTimeout(1800);
  await p.evaluate(() => { location.hash = '#/you'; }); await p.waitForTimeout(700);
  await p.click('text=Delete my account and data'); await p.waitForTimeout(400);
  await p.fill('.sheet input[placeholder="DELETE"]', 'DELETE');
  await p.click('.sheet .btn.danger'); await p.waitForTimeout(2500);
  const gone = [...deleted];
  const want = ['users/u1', 'users/u1/logs/2026-06-01', 'users/u1/goals/g1', 'users/u1/checkins/2026-W20', 'users/u1/plans/2026-06-01', 'leaderboard/u1', 'dishRatings/CNV_2026-06-01_rice_u1'];
  ok('every record under the user is deleted, plus their leaderboard entry and ratings', want.every(k => deleted.has(k)), 'missing: ' + want.filter(k => !deleted.has(k)).join(', '));
  ok('other people’s data is untouched', !gone.includes('leaderboard/other') && !gone.includes('dishRatings/CNV_2026-06-01_rice_zz'), gone.join(', '));
  await p.close();

  // ---- accessibility audit (axe-core) in both themes ----
  const violations = [];
  for (const scheme of ['light', 'dark']) {
    const a = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' });
    await a.route(/gstatic\.com\/firebasejs|fonts\./, r => r.abort());
    await a.goto(url);
    await a.evaluate(() => { localStorage.setItem('ff.mode', '"guest"'); localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'A', onboarded: true, mess: 'CNV', diet: 'veg', goal: 'gain', weight: 65, height: 175, age: 20, sex: 'male', activity: 'moderate', consents: { health: 1 } })); });
    await a.reload(); await a.waitForTimeout(1800);
    await a.addScriptTag({ path: path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js') });
    const scan = async label => {
      const r = await a.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] }).then(x => x.violations.map(v => `${v.id}(${v.impact}) ${v.nodes[0].target.join(' ')}`)));
      r.forEach(v => violations.push(`${scheme}/${label}: ${v}`));
    };
    for (const h of ['today', 'plan', 'ask', 'progress', 'you']) { await a.evaluate(x => { location.hash = '#/' + x; }, h); await a.waitForTimeout(700); await scan(h); }
    await a.evaluate(() => { location.hash = '#/ask'; }); await a.waitForTimeout(400);
    await a.fill('.searchfield input', 'samosa'); await a.waitForTimeout(300); await a.click('.page.ask .li-btn >> nth=0'); await a.waitForTimeout(500); await scan('ask verdict');
    await a.evaluate(() => { location.hash = '#/today'; }); await a.waitForTimeout(400);
    await a.click('.fab'); await a.waitForTimeout(500); await scan('snap sheet'); await a.keyboard.press('Escape'); await a.waitForTimeout(300);
    await a.close();
  }
  ok('axe-core finds no WCAG 2.1 AA violations on the main screens and sheets, light and dark', violations.length === 0, violations.join(' | '));
}

async function foodDbFlow(browser, url) {
  group('Food database (Indian recipes + world foods)');
  const p = await newPage(browser, { mock: false });
  await p.goto(url);
  await p.evaluate(() => { localStorage.setItem('ff.mode', '"guest"'); localStorage.setItem('ff.guest.profile', JSON.stringify({ name: 'D', onboarded: true, mess: 'CNV', diet: 'veg', goal: 'lose', pace: 0.5, weight: 75, goalWeight: 68, height: 172, age: 21, sex: 'male', activity: 'moderate', consents: { health: 1 } })); });
  await p.reload(); await p.waitForTimeout(2500);
  const n = await p.evaluate(async () => (await import('/js/fooddb.js')).extraFoods().length);
  ok('about 8,300 extra foods load after the first paint', n > 8000, String(n));
  await p.evaluate(() => { location.hash = '#/ask'; }); await p.waitForTimeout(500);
  await p.fill('.searchfield input', 'hummus'); await p.waitForTimeout(500);
  ok('Ask finds world foods', /hummus/i.test(await p.innerText('.page.ask')));
  await p.fill('.searchfield input', 'rajmah'); await p.waitForTimeout(500);
  await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(600);
  const txt = await p.innerText('.page.ask');
  ok('an Indian recipe gets a verdict and shows its source', await p.isVisible('.page.ask .verdict') && /Indian Nutrient Databank/.test(txt), txt.slice(0, 160));
  await p.click('text=Back to results'); await p.waitForTimeout(300);
  await p.fill('.searchfield input', 'big mac'); await p.waitForTimeout(500);
  await p.click('.page.ask .li-btn >> nth=0'); await p.waitForTimeout(600);
  ok('a vegetarian asking about a Big Mac gets a diet skip', await p.isVisible('.verdict.stop'));
  ok('no page errors with the big database', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

async function officialMenuFlow(browser, url) {
  group('Committee menu reaches students with personal edits');
  const dish = (n, cal, pr, c) => ({ n, cal, p: pr, c, f: Math.round((cal - 4 * pr - 4 * c) / 9) });
  const week = dinner => Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, {
    breakfast: [dish('Idli', 60, 2, 12)], lunch: [dish('Rice', 200, 4, 44), dish('Dal', 160, 9, 20)], snacks: [dish('Tea', 50, 1, 8)], dinner,
  }]));
  const MINE = [dish('Chapati', 100, 3, 18), dish('My own dal', 160, 9, 20)];
  const OFFICIAL = [dish('Chapati', 100, 3, 18), dish('Committee paneer curry', 300, 15, 10)];
  const profile = { name: 'Stu', onboarded: true, mess: 'CV', diet: 'veg', goal: 'gain', weight: 65, height: 175, age: 20, sex: 'male', activity: 'moderate', consents: { health: 1 },
    menuOverrides: { CV: week(MINE) }, menuOverrideAt: { CV: Date.now() - 86400000 }, favorites: [], customFoods: [], templates: [], recents: [] };
  const p = await newPage(browser, { seed: { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db: {
    'users/u1': profile, 'messes/CV': { menu: week(OFFICIAL), version: 3, updatedAt: Date.now(), updatedBy: 'C mess committee' },
  } } });
  await p.goto(url); await p.waitForTimeout(2200);
  ok('a student on their own copy is told the committee published a newer menu', await p.isVisible('text=The mess committee updated the menu'));
  await p.click('text=Use their menu'); await p.waitForTimeout(1200);
  const pf = await p.evaluate(() => window.__fb.DB['users/u1']);
  ok('one tap drops their copy', !pf.menuOverrides?.CV, JSON.stringify(pf.menuOverrides));
  ok('the banner is gone', !(await p.isVisible('text=The mess committee updated the menu')));
  const planDinner = await p.evaluate(async () => {
    const { planner } = await import('/js/planner.js'); const { todayKey } = await import('/js/util.js');
    return planner.planFor(todayKey()).meals.find(m => m.id === 'dinner').menu.map(x => x.n);
  });
  ok('their plan is rebuilt from the committee’s menu', planDinner.includes('Committee paneer curry') && !planDinner.includes('My own dal'), planDinner.join(', '));
  ok('no page errors', p.errors.length === 0, p.errors.join('; '));
  await p.close();
}

async function planningFlow(browser, url) {
  group('Day plan');
  const p = await newPage(browser, { mock: false });
  await p.goto(url);
  await p.click('text=Try it as a guest'); await p.waitForTimeout(400);
  await completeOnboarding(p, 'Planner');
  await goToday(p);
  ok('the plate card is built from the planner', await p.isVisible('#plate-card .prow'));
  await p.click('#plate-card .not-today'); await p.waitForTimeout(500);
  ok('"Not this today" opens on the meal', await p.isVisible('.sheet textarea'));
  await p.fill('.sheet textarea', '2 boiled eggs'); await p.waitForTimeout(400);
  await p.click('.sheet >> text=Re-plan this meal'); await p.waitForTimeout(700);
  ok('the meal is re-planned from what you typed', /custom today/i.test(await p.innerText('#plate-card')) && /egg/i.test(await p.innerText('#plate-card .plist')));
  ok('the override is stored on the day', await p.evaluate(k => Object.keys(JSON.parse(localStorage.getItem('ff.guest.day.' + k) || '{}').dayOverrides || {}).length === 1, TODAY));
  await p.click('#plate-card .not-today'); await p.waitForTimeout(400);
  await p.click('.sheet >> text=Back to the menu'); await p.waitForTimeout(600);
  ok('…and can be undone', !/custom today/i.test(await p.innerText('#plate-card')));

  await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForTimeout(800);
  ok('the week grid shows seven days', await p.evaluate(() => document.querySelectorAll('.weekgrid .wg-day').length === 7));
  await p.click('.weekgrid .wg-day >> nth=2'); await p.waitForTimeout(500);
  ok('tapping a day opens that day’s plan', await p.evaluate(() => document.querySelectorAll('.daymeal').length === 4 && !!document.querySelector('.daymeal .not-today')));
  ok('no page errors in the day plan', p.errors.length === 0, p.errors.join('; '));
  await p.close();

  // ---- a committee edit reaches an open student app ----
  group('Menu change banner');
  const dish = (n, cal, pr, c) => ({ n, cal, p: pr, c, f: Math.round((cal - 4 * pr - 4 * c) / 9) });
  const week = dinner => Object.fromEntries(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => [d, {
    breakfast: [dish('Idli', 60, 2, 12), dish('Vada', 150, 4, 14), dish('Boiled egg', 78, 6, 1)],
    lunch: [dish('Rice', 200, 4, 44), dish('Chapati', 100, 3, 18), dish('Dal', 160, 9, 20), dish('Egg masala', 190, 14, 6)],
    snacks: [dish('Tea', 50, 1, 8), dish('Bajji', 160, 3, 18)], dinner,
  }]));
  const PANEER = [dish('Chapati', 100, 3, 18), dish('Paneer butter masala', 330, 16, 12)];
  const ALOO = [dish('Chapati', 100, 3, 18), dish('Aloo gobi', 150, 3, 18)];
  const profile = { name: 'Stu', onboarded: true, mess: 'CNV', diet: 'nonveg', goal: 'gain', weight: 65, height: 175, age: 20, sex: 'male', routine: { wake: '06:30', sleep: '23:00', gym: '17:30' }, favorites: [], customFoods: [], templates: [], recents: [], menuOverrides: {} };
  const seed = { user: { uid: 'u1', email: 'stu@college.edu', displayName: 'Stu' }, db: { 'users/u1': profile, 'messes/CNV': { menu: week(PANEER), version: 1, updatedAt: Date.now(), updatedBy: 'Mess committee' } } };
  const student = await newPage(browser, { seed });
  // the mock lives inside each page, so the "committee" page forwards its menu writes to the student page
  const committee = await newPage(browser, { seed: { user: { uid: 'adm', email: 'adm@college.edu', displayName: 'Adm' }, db: { 'admins/adm': { super: true } } } });
  await committee.exposeFunction('__fbOut', (path, data) => {
    if (/^(messes|specials)\//.test(path)) return student.evaluate(([pa, d]) => (d === null ? window.__fb.remoteDelete(pa) : window.__fb.remoteSet(pa, d)), [path, data]);
  });
  await student.goto(url); await committee.goto(url);
  await student.waitForTimeout(2200);
  ok('the student sees the published dinner', await student.isVisible('#plate-card .prow'));
  ok('no banner before anything changes', !(await student.isVisible('.banner.change')));
  await committee.evaluate(w => window.firebase.firestore().collection('messes').doc('CNV').set({ menu: w, version: 2, updatedAt: Date.now(), updatedBy: 'Mess committee' }), week(ALOO));
  const t0 = Date.now();
  const shown = await student.waitForSelector('.banner.change', { timeout: 2000 }).then(() => true, () => false);
  ok('a committee edit shows a banner on the student within 2 s', shown, `${Date.now() - t0} ms`);
  const text = shown ? await student.innerText('.banner.change') : '';
  ok('the banner says what changed', /Dinner changed/.test(text) && /Paneer butter masala/.test(text) && /Aloo gobi/.test(text), text.replace(/\n/g, ' '));
  if (shown) {
    await student.click('.banner.change >> text=See why'); await student.waitForTimeout(400);
    const sheetText = await student.innerText('.sheet');
    ok('See why shows the diff', /Gone:.*Paneer/.test(sheetText) && /protein/.test(sheetText), sheetText.replace(/\n/g, ' '));
    await student.click('.sheet >> text=Got it'); await student.waitForTimeout(500);
    ok('acknowledging dismisses the banner', !(await student.isVisible('.banner.change')));
  }
  await student.waitForTimeout(1600);
  ok('the re-planned version is persisted for the student', await student.evaluate(() => Object.entries(window.__fb.DB).some(([k, d]) => /^users\/u1\/plans\//.test(k) && d.version >= 2)));
  ok('no page errors for the student', student.errors.length === 0, student.errors.join('; '));
  await student.close(); await committee.close();
}

(async () => {
  const { server, url } = await serve();
  const browser = await chromium.launch();
  try {
    await guestFlow(browser, url);
    await goalFlow(browser, url);
    await planningFlow(browser, url);
    await verdictFlow(browser, url);
    await snapFlow(browser, url);
    await coachFlow(browser, url);
    await communityFlow(browser, url);
    await hardeningFlow(browser, url);
    await foodDbFlow(browser, url);
    await officialMenuFlow(browser, url);
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
