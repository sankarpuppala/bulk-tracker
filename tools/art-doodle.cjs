// =============================================================
// ART-DOODLE — builds the --doodle tile for css/art.css: a 240 × 240
// line-art food doodle (chilli, curry leaf, roti, chai glass, star
// anise, cardamom, garlic, tomato slice, spoon, tiny stars) in one
// black stroke weight. Nothing crosses the tile edge, so it repeats
// seamlessly. It is used as a mask, so only the alpha matters.
//
//   node tools/art-doodle.cjs            # prints the --doodle declaration
//   node tools/art-doodle.cjs --svg      # prints the raw tile SVG
// =============================================================
const g = (x, y, a, body) => `<g transform='translate(${x} ${y}) rotate(${a})'>${body}</g>`;
const p = d => `<path d='${d}'/>`;
const dot = (x, y) => `<path d='M${x} ${y}h.01'/>`;
const star = (x, y, r) => p(`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`);

const items = [
  // a green chilli with its stem
  g(46, 40, -28, p('M-20 0C-10-7 8-7 20-2C9 5-11 6-20 0Z') + p('M-20 0q-4-2-7-7') + p('M-12-1C-4-4 6-4 13-2')),
  // a curry leaf with veins
  g(128, 34, 18, p('M-20 0C-10-11 10-11 20 0C10 11-10 11-20 0Z') + p('M-20 0H17M-8 0l5-5M2 0l5-5M-8 0l5 5M2 0l5 5')),
  // a roti, puffed spots
  g(198, 62, 0, `<circle r='19'/>` + p('M-8-9l3 1M7-3l2 3M-2 9l3-1') + dot(-11, 2) + dot(3, -12) + dot(11, 8) + dot(-3, -2) + dot(-12, -6)),
  // a cutting-chai glass with steam
  g(60, 128, -8, p('M-12-14L-9 16H9L12-14Z') + p('M-11-6H11') + p('M-6 18H6') + p('M-4-20c-3-4 3-6 0-10M4-20c-3-4 3-6 0-10')),
  // star anise
  g(148, 116, 10, [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path transform='rotate(${a})' d='M2 0C6-3 12-2 15 0C12 2 6 3 2 0Z'/>`).join('') + `<circle r='2'/>`),
  // cardamom pods
  g(212, 150, -34, p('M-10 0C-6-6 6-6 10 0C6 6-6 6-10 0Z') + p('M-8 0H8') + p('M10 0l3 1')),
  // a garlic bulb
  g(106, 196, 6, p('M0-18c-2 4-1 6 0 8') + p('M0-10C-14-8-17 4-11 12C-5 18 5 18 11 12C17 4 14-8 0-10Z') + p('M0-10C-6-2-6 8-2 16M0-10C6-2 6 8 2 16')),
  // a tomato slice
  g(40, 206, 0, `<circle r='15'/><circle r='10'/>` + p('M0-10V10M-9-5L9 5M-9 5L9-5') + dot(-5, -2) + dot(5, 3) + dot(3, -6)),
  // a steel spoon
  g(196, 212, -40, p('M-24 0H4') + p('M4 0C4-6 18-7 20 0C18 7 4 6 4 0Z')),
  // a small katori from above
  g(106, 82, 0, `<circle r='9'/><circle r='5'/>`),
  // tiny stars and dots
  star(92, 52, 4), star(222, 108, 3.4), star(22, 160, 4), star(168, 170, 3.2), star(140, 228, 3), star(14, 96, 3),
  dot(84, 156), dot(182, 22), dot(230, 228), dot(30, 82), dot(170, 82),
];

const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${items.join('')}</svg>`;
const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/\s+/g, ' ');
if (process.argv.includes('--svg')) console.log(svg);
else console.log(`--doodle: url("${uri}");`);
