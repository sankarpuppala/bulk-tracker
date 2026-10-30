// =============================================================
// FASTING MODES — constraints on the Day Plan (spec Phase 8).
//   if16      intermittent fasting: one eating window (default 12:00–20:00)
//   ramadan   suhoor before dawn, iftar at sunset, nothing between
//   navratri  vegetarian, no onion/garlic/grains (diet rules, see diet.js)
//   ekadashi  vegetarian, no grains or pulses, for the days chosen
//
// profile.fasting = { mode, until?: 'YYYY-MM-DD', window?: ['12:00','20:00'] }
// Fasting never lowers calorie or protein targets: the same day is just
// fitted into fewer, shorter meals. The calorie floor still applies.
// Pure: no DOM, no network.
// =============================================================

export const FAST_MODES = [
  { id: 'if16', label: 'Intermittent fasting', sub: 'Eat inside one window, e.g. 12:00–20:00' },
  { id: 'ramadan', label: 'Ramadan', sub: 'Suhoor before dawn, iftar at sunset' },
  { id: 'navratri', label: 'Navratri', sub: 'Vegetarian, no onion, garlic or grains' },
  { id: 'ekadashi', label: 'Ekadashi', sub: 'Vegetarian, no grains or pulses' },
];

const toMin = hhmm => { const [a, b] = String(hhmm).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const hhmm = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

/** Is `profile.fasting` active on `date`? */
export function activeFast(profile, date) {
  const f = profile?.fasting;
  if (!f?.mode || !FAST_MODES.some(m => m.id === f.mode)) return null;
  if (f.until && date > f.until) return null;
  if (f.from && date < f.from) return null;
  return f;
}

/**
 * @returns null, or { mode, label, timings, skip, labels, note }
 *   timings  meal id → [start, end] overrides
 *   skip     meal ids that are not eaten
 *   labels   display names for the meals that change role (suhoor, iftar)
 */
export function fastingFor(profile, date) {
  const f = activeFast(profile, date);
  if (!f) return null;
  const label = FAST_MODES.find(m => m.id === f.mode).label;

  if (f.mode === 'if16') {
    const [a, b] = (Array.isArray(f.window) && f.window.length === 2 ? f.window : ['12:00', '20:00']).map(toMin);
    const timings = {}, skip = [];
    if (a >= 660) skip.push('breakfast'); else timings.breakfast = [hhmm(a), hhmm(Math.min(a + 90, b))];
    timings.lunch = [hhmm(a), hhmm(Math.min(a + 120, b))];
    timings.snacks = [hhmm(Math.min(a + 240, b - 150)), hhmm(Math.min(a + 330, b - 60))];
    timings.dinner = [hhmm(Math.max(b - 120, a + 120)), hhmm(b)];
    return { mode: f.mode, label, timings, skip, labels: {}, note: `Eating window ${hhmm(a)}–${hhmm(b)}. Same day totals, fewer meals.` };
  }
  if (f.mode === 'ramadan') {
    return {
      mode: f.mode, label,
      timings: { breakfast: ['04:00', '05:00'], snacks: ['18:40', '19:30'], dinner: ['20:30', '22:00'] },
      skip: ['lunch'], labels: { breakfast: 'Suhoor', snacks: 'Iftar', dinner: 'After iftar' },
      note: 'Suhoor before dawn, iftar at sunset, a second meal after. Sip water and milk between iftar and sleep.',
    };
  }
  return { mode: f.mode, label, timings: {}, skip: [], labels: {}, note: f.mode === 'navratri' ? 'Navratri fast: vegetarian, no onion, garlic or grains.' : 'Ekadashi: vegetarian, no grains or pulses.' };
}
