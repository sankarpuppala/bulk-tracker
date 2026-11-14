// =============================================================
// DISH RATINGS & THE COMMITTEE SCORECARD (Phase 9)
//   ratingRow     one tap after a logged mess meal: 😞 😐 😋 (optional)
//   openScorecard what a mess committee sees: menu nutrition, top and
//                 bottom dishes, concrete suggestions
// Ratings are cloud-only, once per user per dish per day, and the
// committee only ever sees averages and counts, never who rated.
// =============================================================
import { h, fill, lsGet, lsSet, addDays, todayKey, haptic } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { icon } from '../components/icons.js';
import { weeklyMenu } from '../menus.js';
import { dishKey, ratingId, aggregate, topBottom, scorecard, MIN_VOTES } from '../engine/community.js';

const FACES = [[1, '😞', 'Not good'], [3, '😐', 'Okay'], [5, '😋', 'Good']];
const DONE = 'ff.rated';
const THANKS = 'Thanks, your rating helps the mess committee.';

const ratedSet = () => new Set(lsGet(DONE, []));
const mark = id => lsSet(DONE, [...ratedSet(), id].slice(-300));

/** The thank-you line. With `face` it celebrates (a tick that pops, a little burst, the face floating up); without, it just sits there. */
const thanks = face => h('span', { class: 'rate-thanks' + (face ? ' pop' : '') },
  h('span', { class: 'rate-tick', 'aria-hidden': 'true' }, icon('check', { size: 13, sw: 2.6 }), face && h('span', { class: 'rate-burst' }, [1, 2, 3, 4, 5, 6].map(i => h('i', { style: `--k: ${i}` })))),
  face && h('span', { class: 'rate-fly', 'aria-hidden': 'true' }, face),
  h('span', { class: 'rate-msg' }, THANKS));

/** @param items the mess items logged for this meal: [{ n }] */
export function ratingRow(date, meal, items) {
  if (store.mode !== 'cloud' || !store.profile.mess) return null;
  const dishes = [...new Set(items.map(i => i.n))].slice(0, 4);
  if (!dishes.length) return null;
  const mess = store.profile.mess, uid = store.user?.uid;
  const ids = dishes.map(d => ratingId(mess, date, d, uid));
  if (ids.every(id => ratedSet().has(id))) return h('p', { class: 'tiny muted rate-done' }, thanks(null));
  const row = h('div', { class: 'rate-row', role: 'group', 'aria-label': `Rate today's ${meal}`, 'aria-live': 'polite' },
    h('span', { class: 'rate-q' }, `How was ${meal}?`),
    h('span', { class: 'rate-faces' }, FACES.map(([v, face, label]) => h('button', { class: 'rate-btn', 'aria-label': label, title: label, onclick: async e => {
      const btn = e.currentTarget;
      btn.classList.add('picked'); row.classList.add('busy'); haptic(10);
      row.querySelectorAll('button').forEach(b => { b.disabled = true; });
      let ok = 0;
      for (const [i, d] of dishes.entries()) {
        const r = await store.rateDish({ mess, date, meal, dish: d, v, id: ids[i], dishKey: dishKey(d) });
        if (r === 'ok' || r === 'already') { mark(ids[i]); ok++; }
      }
      if (ok) { row.classList.remove('busy'); row.classList.add('done'); fill(row, thanks(face)); }
      else {
        toast('Couldn’t save your rating', 'warn');
        row.classList.remove('busy'); btn.classList.remove('picked');
        row.querySelectorAll('button').forEach(b => { b.disabled = false; });
      }
    } }, h('span', { class: 'rate-face' }, face)))));
  return row;
}

export function openScorecard(messId) {
  const body = h('div', { class: 'stack scorecard' }, h('p', { class: 'muted small sc-wait' }, 'Loading…'));
  const sh = sheet({ title: `${messId} scorecard`, sub: 'Menu nutrition and what students think', body, wide: true });
  const { menu } = weeklyMenu(messId);

  (async () => {
    let ratings = [], failed = false;
    try { ratings = await store.dishRatings(messId, addDays(todayKey(), -30)); } catch { failed = true; }
    const sc = menu ? scorecard(menu) : null;
    const tb = topBottom(aggregate(ratings));
    const dish = a => h('li', { style: `--avg: ${a.avg / 5}` },
      h('span', { class: 'sc-dish' }, h('b', null, a.dish), h('span', { class: 'tiny muted' }, ` ${a.avg.toFixed(1)} / 5 · ${a.count} votes`)),
      h('span', { class: 'sc-avg', 'aria-hidden': 'true' }, h('i')));
    const head = (ic, title, extra) => h('div', { class: 'sc-h' }, h('span', { class: 'sc-h-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16 })), h('h4', null, title), extra);
    fill(body,
      !sc ? h('p', { class: 'muted small sc-empty' }, 'No published menu yet. Publish one to see its scorecard.') : [
        h('div', { class: 'sc-tiles' },
          tile('p', 'egg', 'Avg protein / day', [sc.avgProtein, ' g'], 'all dishes, 1 serving each'),
          tile('f', 'flame', 'Fried dishes', [`${sc.fried}/${sc.dishes}`], Math.round(sc.friedShare * 100) + '% of the menu'),
          tile('c', 'undo', 'Repeated dishes', [String(sc.repeats.length)], '4+ days a week')),
        h('section', { class: 'sc-week' },
          head('progress', 'Protein by day', h('span', { class: 'sc-key tiny muted', 'aria-hidden': 'true' }, h('i', { class: 'all' }), 'all dishes', h('i', { class: 'veg' }), 'veg dishes')),
          h('div', { class: 'stack-xs' }, sc.days.map(d => h('div', { class: 'sc-day' },
            h('span', { class: 'sc-d' }, d.day.slice(0, 3)),
            h('span', { class: 'sc-bar', title: `${d.protein} g protein, ${d.vegProtein} g from veg dishes` }, h('i', { style: { width: Math.min(100, d.proteinPct * 100) + '%' } }), h('i', { class: 'veg', style: { width: Math.min(100, d.vegPct * 100) + '%' } })),
            h('span', { class: 'tiny muted num' }, `${d.protein} g · veg ${d.vegProtein} g`))))),
        h('section', { class: 'sc-sugg' },
          head('sparkle', 'Suggestions'),
          sc.suggestions.length ? h('ul', { class: 'small' }, sc.suggestions.map(s => h('li', null, s))) : h('p', { class: 'small muted' }, 'Nothing to flag this week.')),
      ],
      h('section', { class: 'sc-votes' },
        head('users', 'What students think (last 30 days)'),
        failed ? h('p', { class: 'small muted' }, 'Ratings unavailable right now.')
          : tb.top.length + tb.bottom.length === 0 ? h('p', { class: 'small muted' }, `Dishes appear once ${MIN_VOTES} students have rated them. ${ratings.length} ratings so far.`)
            : h('div', { class: 'grid2 sc-rank' },
              h('div', { class: 'sc-col top' }, h('div', { class: 'sc-col-h' }, icon('star', { size: 14, sw: 2 }), 'Top rated'), h('ol', { class: 'small' }, tb.top.map(dish))),
              h('div', { class: 'sc-col low' }, h('div', { class: 'sc-col-h' }, icon('alert', { size: 14, sw: 2 }), 'Needs work'), tb.bottom.length ? h('ol', { class: 'small' }, tb.bottom.map(dish)) : h('p', { class: 'small muted' }, 'Nothing rated poorly.')))),
      h('p', { class: 'tiny muted sc-foot' }, icon('lock', { size: 13 }), h('span', null, 'Only averages and counts are shown. Who rated what is never visible here.')),
      h('button', { class: 'btn ghost block', onclick: () => sh.close() }, 'Done'));
  })();
}

const tile = (k, ic, l, [v, unit], s) => h('div', { class: 'sc-tile sc-' + k },
  h('span', { class: 'sc-tile-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16 })),
  h('div', { class: 'sc-tile-l' }, l),
  h('div', { class: 'sc-tile-v num' }, v, unit && h('small', null, unit)),
  h('div', { class: 'sc-tile-s' }, s));
