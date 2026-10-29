// =============================================================
// STREAKS · XP · LEVELS · BADGES
// =============================================================
import { addDays, todayKey } from './util.js';
import { dayScore, totals } from './nutrition.js';
import { planDay } from './routine.js';

export function streakOf(history) {
  const logged = new Set(history.filter(d => d.items.length).map(d => d.key));
  let k = todayKey(), n = 0;
  if (!logged.has(k)) k = addDays(k, -1);
  while (logged.has(k)) { n++; k = addDays(k, -1); }
  return n;
}

export function bestStreak(history) {
  const keys = history.filter(d => d.items.length).map(d => d.key).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) { cur = prev && addDays(prev, 1) === k ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
  return best;
}

const JUNK = new Set(['chips', 'choc', 'drinks', 'fastfood', 'icecream', 'sweets', 'biscuits']);

export function analyse(history, targets, profile) {
  let xp = 0, hitP = 0, hitW = 0, trainedDays = 0, weighDays = 0, items = 0;
  const scores = {};
  for (const d of history) {
    const rest = !!planDay(profile, d.key).day?.rest;
    const sc = dayScore(d, targets, rest);
    scores[d.key] = sc;
    if (d.items.length) xp += 10;
    if (sc.hitP) { xp += 10; hitP++; }
    if (sc.hitCal) xp += 10;
    if (sc.hitWater) { xp += 5; hitW++; }
    if (sc.trained) { xp += 15; trainedDays++; }
    if (d.weight) { xp += 3; weighDays++; }
    items += d.items.length;
  }
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const lvlFloor = 60 * (level - 1) ** 2, lvlCeil = 60 * level ** 2;
  const streak = streakOf(history), best = bestStreak(history);

  const week = history.filter(d => d.key > addDays(todayKey(), -7));
  const spentWeek = week.reduce((a, d) => a + totals(d.items).price, 0);
  const cleanWeek = week.length >= 6 && week.every(d => !d.items.some(i => JUNK.has(i.cat)));
  const lastW = [...history].reverse().find(d => d.weight)?.weight;
  const reached = profile.goalWeight && lastW && (profile.goal === 'gain' ? lastW >= profile.goalWeight : profile.goal === 'lose' ? lastW <= profile.goalWeight : false);

  const badges = [
    { id: 'first', icon: '🍽️', name: 'First Bite', desc: 'Log your first meal', got: items > 0 },
    { id: 's3', icon: '🔥', name: 'On a Roll', desc: '3-day logging streak', got: best >= 3 },
    { id: 's7', icon: '⚡', name: 'Week Warrior', desc: '7-day streak', got: best >= 7 },
    { id: 's30', icon: '👑', name: 'Unstoppable', desc: '30-day streak', got: best >= 30 },
    { id: 'p5', icon: '🥚', name: 'Protein Pro', desc: 'Hit protein on 5 days', got: hitP >= 5 },
    { id: 'p25', icon: '🦾', name: 'Protein Machine', desc: 'Hit protein on 25 days', got: hitP >= 25 },
    { id: 'w7', icon: '💧', name: 'Hydro Homie', desc: 'Hit water goal 7 times', got: hitW >= 7 },
    { id: 'g1', icon: '🏋️', name: 'First Rep', desc: 'Log a workout', got: trainedDays >= 1 },
    { id: 'g20', icon: '🔩', name: 'Iron Addict', desc: '20 workouts logged', got: trainedDays >= 20 },
    { id: 'wt7', icon: '⚖️', name: 'Scale Regular', desc: 'Log weight 7 times', got: weighDays >= 7 },
    { id: 'clean', icon: '🥗', name: 'Clean Week', desc: '6+ logged days with no junk in 7 days', got: cleanWeek },
    { id: 'budget', icon: '💸', name: 'Budget Boss', desc: '≤ ₹150 on outside food this week (5+ days logged)', got: week.length >= 5 && spentWeek <= 150 },
    { id: 'c100', icon: '📒', name: 'Centurion', desc: '100 items logged', got: items >= 100 },
    { id: 'goal', icon: '🏆', name: 'Goal Crusher', desc: 'Reach your goal weight', got: !!reached },
  ];
  return { xp, level, lvlFloor, lvlCeil, streak, best, scores, badges, hitP, trainedDays, spentWeek };
}

export const LEVEL_NAMES = ['Rookie', 'Regular', 'Grinder', 'Machine', 'Beast', 'Titan', 'Legend', 'Mythic'];
export const levelName = l => LEVEL_NAMES[Math.min(LEVEL_NAMES.length - 1, Math.floor((l - 1) / 2))];
