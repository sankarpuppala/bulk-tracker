// =============================================================
// DAILY ROUTINE — builds a personal timeline from wake/sleep,
// mess hours, training plan and goal. Optional reminders.
// =============================================================
import { timeToMin, minToTime, weekdayOf, nowMin, todayKey } from './util.js';
import { timingsFor, messById } from './menus.js';
import { MEAL_SPLIT } from './nutrition.js';
import { store } from './store.js';
import { PLANS } from '../data/workouts.js';

export function planDay(profile, dateKey) {
  const plan = PLANS.find(p => p.id === profile.plan) || PLANS[0];
  return { plan, day: plan.days[weekdayOf(dateKey)] };
}

export function buildRoutine(profile, dateKey, targets) {
  const r = profile.routine, tm = timingsFor(profile);
  const mess = messById(profile.mess);
  const where = mess ? ` at ${mess.id} mess` : '';
  const { day } = planDay(profile, dateKey);
  const ev = [];
  const add = (t, icon, title, sub, extra = {}) => ev.push({ m: typeof t === 'number' ? t : timeToMin(t), icon, title, sub, ...extra });
  const wake = timeToMin(r.wake), sleep = timeToMin(r.sleep) < wake ? timeToMin(r.sleep) + 1440 : timeToMin(r.sleep);

  add(wake, '⏰', 'Wake up', 'Glass of water before anything else — 500 ml');
  const kcal = k => `~${Math.round(targets.cal * MEAL_SPLIT[k])} kcal`;
  add(Math.max(wake + 20, timeToMin(tm.breakfast[0])), '🌅', 'Breakfast' + where, `${tm.breakfast[0]}–${tm.breakfast[1]} · ${kcal('breakfast')}`, { meal: 'breakfast' });
  add(Math.round((timeToMin(tm.breakfast[1]) + timeToMin(tm.lunch[0])) / 2), '💧', 'Hydration check', `Aim for ${Math.round(targets.water * 0.3 / 250) * 250} ml by now`);
  add(tm.lunch[0], '☀️', 'Lunch' + where, `${tm.lunch[0]}–${tm.lunch[1]} · ${kcal('lunch')}`, { meal: 'lunch' });

  const gym = timeToMin(r.gym);
  const training = day && !day.rest;
  if (training) {
    add(gym - 60, '🍌', 'Pre-workout fuel', profile.goal === 'lose' ? 'Black coffee + a banana' : 'Banana + peanut-butter toast or a fruit');
    add(gym, '🏋️', day.t, `${day.x.length} exercises · ~60 min`, { gym: true });
    add(gym + 75, '🥛', 'Post-workout protein', 'Whey / milk / eggs / paneer within the hour');
  } else if (day) {
    add(gym, '🧘', 'Active recovery', 'Walk, stretch or play a sport — keep moving');
  }
  const snack = timeToMin(tm.snacks[0]);
  if (!training || Math.abs(snack - gym) > 50) add(snack, '🫖', 'Evening snacks' + where, `${tm.snacks[0]}–${tm.snacks[1]} · ${kcal('snacks')}`, { meal: 'snacks' });
  add(tm.dinner[0], '🌙', 'Dinner' + where, `${tm.dinner[0]}–${tm.dinner[1]} · ${kcal('dinner')}`, { meal: 'dinner' });
  if (profile.goal === 'gain') add(sleep - 60, '🥜', 'Pre-bed fuel', 'Milk + peanut butter or curd — slow protein overnight');
  else if (profile.goal === 'lose') add(timeToMin(tm.dinner[0]) + 60, '🚶', 'Post-dinner walk', '10–15 minutes helps digestion and steps');
  add(sleep - 30, '📵', 'Wind down', 'Screens off. 7–9 h sleep is when muscle is built');
  add(sleep, '😴', 'Sleep', 'Lights out');

  ev.sort((a, b) => a.m - b.m);
  const isToday = dateKey === todayKey();
  const now = nowMin();
  let nextIdx = isToday ? ev.findIndex(e => e.m + (e.meal ? 60 : 15) >= now) : -1;
  ev.forEach((e, i) => { e.time = minToTime(e.m); e.past = isToday && i < nextIdx; e.next = i === nextIdx; });
  if (isToday && nextIdx === -1) ev.forEach(e => { e.past = true; });
  return ev;
}

// ---------- reminders (best-effort, while the app is open) ----------
let timers = [];
export function scheduleReminders(profile, targets) {
  timers.forEach(clearTimeout); timers = [];
  if (!profile.reminders || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = nowMin();
  buildRoutine(profile, todayKey(), targets).forEach(e => {
    const lead = e.meal || e.gym ? 10 : 0;
    const at = e.m - lead;
    if (at <= now || at - now > 18 * 60) return;
    timers.push(setTimeout(() => notify(e.title, (lead ? `In ${lead} min · ` : '') + e.sub), (at - now) * 60000));
  });
}

/** Fire a notification now, but only if the user turned reminders on and allowed them. */
export function notifyNow(title, body) {
  if (!store.profile.reminders || !('Notification' in globalThis) || Notification.permission !== 'granted') return;
  notify(title, body);
}

async function notify(title, body) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ff-' + title });
    else new Notification(title, { body });
  } catch { /* ignore */ }
}
