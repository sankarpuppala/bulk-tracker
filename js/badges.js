// =============================================================
// BADGE MOMENTS — Kato shows up when a badge is newly earned.
//
// gamify.analyse() recomputes every badge from scratch on each
// change, so "newly earned" only exists by comparing against what
// this device has already seen (ff.badges.seen).
//
// Two entry points, because the order matters:
//   seedBadges()  once history has loaded, records what is already
//                 earned. Without it an existing user would be
//                 buried under a dozen toasts for old badges.
//   checkBadges() every recompute after that; celebrates the diff.
// Recomputes that land before the seed (a profile event during
// boot, when history is still empty) are ignored on purpose.
// =============================================================
import { lsGet, lsSet, h } from './util.js';
import { toast } from './ui.js';
import { ctx } from './ctx.js';
import { artMascot } from './components/art.js';

const KEY = 'ff.badges.seen';
let seeded = false;

/** A badge worth a bigger reaction gets Kato's proud face instead of a cheer. */
const PROUD = new Set(['s30', 'p25', 'g20', 'c100', 'goal']);

const gotIds = stats => (stats?.badges || []).filter(b => b.got).map(b => b.id);

/** Call once history has loaded: remembers what this device already holds, silently. */
export function seedBadges(stats) {
  if (!stats?.badges) return;
  if (!Array.isArray(lsGet(KEY, null))) lsSet(KEY, gotIds(stats));
  seeded = true;
}

/** Celebrate every badge earned since the last look. */
export function checkBadges(stats) {
  if (!seeded || !stats?.badges) return;
  const seen = lsGet(KEY, null);
  if (!Array.isArray(seen)) return;

  const got = gotIds(stats);
  const fresh = stats.badges.filter(b => b.got && !seen.includes(b.id));
  if (!fresh.length) return;
  lsSet(KEY, got);                                // record before showing, so a reload can't replay it

  // several at once (a backfilled week, a cloud import) queue up one after another
  fresh.slice(0, 3).forEach((b, i) => setTimeout(() => celebrate(b), i * 900));
}

function celebrate(badge) {
  const mood = PROUD.has(badge.id) ? 'proud' : 'cheer';
  toast(
    h('span', { class: 'unlock-msg' },
      h('i', null, 'Badge unlocked'),                // Kato is the only picture here: the badge emoji would
      h('b', null, badge.name)),                     // fight both him and the line icons on Progress
    'unlock',                                     // not 'badge': that class already styles the tiles on Progress
    { label: 'See', fn: showBadges },
    artMascot({ mood, size: 44 }));
}

function showBadges() {
  ctx.go('progress');
  setTimeout(() => document.querySelector('.pg-badges')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
}
