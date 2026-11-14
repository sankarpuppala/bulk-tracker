// =============================================================
// ART-SHOOT — screenshots of tools/art-gallery.html, one PNG per
// gallery section (dark and light panes side by side), for
// reviewing the illustrations by eye.
//
//   node tools/art-shoot.cjs                       # every section, still (reduced motion)
//   node tools/art-shoot.cjs --only kato,meals     # some sections
//   node tools/art-shoot.cjs --accent indigo       # another accent family
//   node tools/art-shoot.cjs --motion --frames 6   # animations on; a filmstrip per section
//   node tools/art-shoot.cjs --scale 3             # sharper captures for close looks
//   node tools/art-shoot.cjs --out .shots/art-x
// Files: <out>/<accent>-<section>[-fN].png (default out: .shots/art/).
// Exit code 1 on any page error.
// =============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const MAIN = 'C:/Users/sanka/Desktop/STUDIES/AIDS/bulk-tracker';     // node_modules live here, not in worktrees
const need = name => { try { return require(name); } catch { return require(path.join(MAIN, 'node_modules', name)); } };
const { chromium } = need('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', process.cwd()));
const OUT = path.resolve(opt('out', path.join(ROOT, '.shots', 'art')));
const ONLY = opt('only', '');
const ACCENT = opt('accent', 'ember');
const MOTION = args.includes('--motion');
const FRAMES = +opt('frames', 0);
const SCALE = +opt('scale', 2);
const WIDTH = +opt('width', 1500);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(fs.readFileSync(f));
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, r));
  const q = new URLSearchParams({ accent: ACCENT, ...(ONLY ? { only: ONLY } : {}) });
  const url = `http://localhost:${server.address().port}/tools/art-gallery.html?${q}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: SCALE, reducedMotion: MOTION ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('html[data-ready]', { timeout: 15000 }).catch(() => errs.push('gallery never became ready'));
  await page.waitForTimeout(MOTION ? 2600 : 400);
  const secs = await page.$$('section[data-shot]');
  let n = 0;
  for (const sec of secs) {
    const id = await sec.getAttribute('data-shot');
    if (FRAMES) {
      for (let f = 0; f < FRAMES; f++) { await sec.screenshot({ path: path.join(OUT, `${ACCENT}-${id}-f${f}.png`) }); n++; await page.waitForTimeout(500); }
    } else { await sec.screenshot({ path: path.join(OUT, `${ACCENT}-${id}.png`) }); n++; }
  }
  // element budget: count the nodes inside each illustration so they stay lean
  const counts = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.pane.dark svg.art, .pane.dark svg.art-thali, .pane.dark svg.logo-svg').forEach(svg => {
      const k = (svg.getAttribute('class') || '').split(' ').filter(c => c !== 'art').join('.') + (svg.dataset.mood ? ':' + svg.dataset.mood : '');
      out[k] = Math.max(out[k] || 0, svg.querySelectorAll('*').length);
    });
    return out;
  });
  await browser.close(); server.close();
  console.log(`${n} screenshot${n === 1 ? '' : 's'} in ${OUT}`);
  console.log('elements per piece:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
  if (errs.length) { console.log(errs.join('\n')); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exit(1); });
