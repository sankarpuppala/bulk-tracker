// =============================================================
// DISH RATINGS & THE COMMITTEE SCORECARD (Phase 9)
//   ratingRow     one tap after a logged mess meal: 😞 😐 😋 (optional)
//   openScorecard what a mess committee sees: menu nutrition, top and
//                 bottom dishes, concrete suggestions
// Ratings are cloud-only, once per user per dish per day, and the
// committee only ever sees averages and counts, never who rated.
// =============================================================
import { h, fill, lsGet, lsSet, addDays, todayKey } from '../util.js';
import { sheet, toast } from '../ui.js';
import { store } from '../store.js';
import { icon } from '../components/icons.js';
import { weeklyMenu } from '../menus.js';
import { dishKey, ratingId, aggregate, topBottom, scorecard, MIN_VOTES } from '../engine/community.js';

const FACES = [[1, '😞', 'Not good'], [3, '😐', 'Okay'], [5, '😋', 'Good']];
const DONE = 'ff.rated';

const ratedSet = () => new Set(lsGet(DONE, []));
const mark = id => lsSet(DONE, [...ratedSet(), id].slice(-300));

/** @param items the mess items logged for this meal: [{ n }] */
export function ratingRow(date, meal, items) {
  if (store.mode !== 'cloud' || !store.profile.mess) return null;
  const dishes = [...new Set(items.map(i => i.n))].slice(0, 4);
  if (!dishes.length) return null;
  const mess = store.profile.mess, uid = store.user?.uid;
  const ids = dishes.map(d => ratingId(mess, date, d, uid));
  if (ids.every(id => ratedSet().has(id))) return h('p', { class: 'tiny muted rate-done' }, icon('check', { size: 13, sw: 2.4 }), ' Thanks, your rating helps the mess committee.');
  const row = h('div', { class: 'rate-row', role: 'group', 'aria-label': `Rate today's ${meal}` },
    h('span', { class: 'tiny muted' }, `How was ${meal}?`),
    FACES.map(([v, face, label]) => h('button', { class: 'rate-btn', 'aria-label': label, title: label, onclick: async () => {
      row.querySelectorAll('button').forEach(b => { b.disabled = true; });
      let ok = 0;
      for (const [i, d] of dishes.entries()) {
        const r = await store.rateDish({ mess, date, meal, dish: d, v, id: ids[i], dishKey: dishKey(d) });
        if (r === 'ok' || r === 'already') { mark(ids[i]); ok++; }
      }
      if (ok) fill(row, h('span', { class: 'tiny muted' }, icon('check', { size: 13, sw: 2.4 }), ' Thanks, your rating helps the mess committee.'));
      else { toast('Couldn’t save your rating', 'warn'); row.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
    } }, face)));
  return row;
}

export function openScorecard(messId) {
  const body = h('div', { class: 'stack scorecard' }, h('p', { class: 'muted small' }, 'Loading…'));
  sheet({ title: `${messId} scorecard`, sub: 'Menu nutrition and what students think', body, wide: true });
  const { menu } = weeklyMenu(messId);

  (async () => {
    let ratings = [], failed = false;
    try { ratings = await store.dishRatings(messId, addDays(todayKey(), -30)); } catch { failed = true; }
    const sc = menu ? scorecard(menu) : null;
    const tb = topBottom(aggregate(ratings));
    const dish = a => h('li', null, h('b', null, a.dish), h('span', { class: 'tiny muted' }, ` ${a.avg.toFixed(1)} / 5 · ${a.count} votes`));
    fill(body,
      !sc ? h('p', { class: 'muted small' }, 'No published menu yet. Publish one to see its scorecard.') : [
        h('div', { class: 'tiles' },
          tile('Avg protein / day', sc.avgProtein + ' g', 'all dishes, 1 serving each'),
          tile('Fried dishes', `${sc.fried}/${sc.dishes}`, Math.round(sc.friedShare * 100) + '% of the menu'),
          tile('Repeated dishes', String(sc.repeats.length), '4+ days a week')),
        h('div', { class: 'stack-xs' }, sc.days.map(d => h('div', { class: 'sc-day' },
          h('span', { class: 'sc-d' }, d.day.slice(0, 3)),
          h('span', { class: 'sc-bar', title: `${d.protein} g protein, ${d.vegProtein} g from veg dishes` }, h('i', { style: { width: Math.min(100, d.proteinPct * 100) + '%' } }), h('i', { class: 'veg', style: { width: Math.min(100, d.vegPct * 100) + '%' } })),
          h('span', { class: 'tiny muted num' }, `${d.protein} g · veg ${d.vegProtein} g`)))),
        h('div', { class: 'eyebrow' }, 'Suggestions'),
        sc.suggestions.length ? h('ul', { class: 'small' }, sc.suggestions.map(s => h('li', null, s))) : h('p', { class: 'small muted' }, 'Nothing to flag this week.'),
      ],
      h('div', { class: 'eyebrow' }, 'What students think (last 30 days)'),
      failed ? h('p', { class: 'small muted' }, 'Ratings unavailable right now.')
        : tb.top.length + tb.bottom.length === 0 ? h('p', { class: 'small muted' }, `Dishes appear once ${MIN_VOTES} students have rated them. ${ratings.length} ratings so far.`)
          : h('div', { class: 'grid2' },
            h('div', null, h('div', { class: 'tiny muted' }, 'Top rated'), h('ol', { class: 'small' }, tb.top.map(dish))),
            h('div', null, h('div', { class: 'tiny muted' }, 'Needs work'), tb.bottom.length ? h('ol', { class: 'small' }, tb.bottom.map(dish)) : h('p', { class: 'small muted' }, 'Nothing rated poorly.'))),
      h('p', { class: 'tiny muted' }, 'Only averages and counts are shown. Who rated what is never visible here.'));
  })();
}

const tile = (l, v, s) => h('div', { class: 'tile' }, h('div', { class: 'tiny muted' }, l), h('div', { class: 'tile-v' }, v), h('div', { class: 'tiny muted' }, s));
