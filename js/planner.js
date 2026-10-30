// =============================================================
// PLANNER — the stateful side of the Day Plan (spec §5.3–5.4).
//
// Holds a DayPlan for today and the next six days. Every time the
// inputs change (a committee publishes a menu, a festival special
// appears, you edit your menu, "not this today", you log a meal, a
// check-in moves your targets) only the affected days are re-planned,
// and logged meals are never touched. A re-plan bumps `version`,
// records why, and, if it moved a meal's protein by ≥ 5 g or energy
// by ≥ 100 kcal, leaves `plan.change` for the Today banner.
//
// Plans persist to users/{uid}/plans/{date} (guest: localStorage) with
// the last 7 versions, so a menu that changed while the app was closed
// is noticed on the next launch.
//
// Views read plans from here; none of them call planPlate directly.
// =============================================================
import { store, emptyDay } from './store.js';
import { targetsFor } from './nutrition.js';
import { menuFor, timingsFor } from './menus.js';
import { todayKey, addDays, nowMin, lsGet, lsSet, debounce } from './util.js';
import { MEAL_IDS, itemMeal, buildDayPlan, rebudget, diffDayPlans, notable, describeChange } from './engine/dayplan.js';
import { totals, topUps } from './engine/plate.js';
import { notifyNow } from './routine.js';
import { fastingFor } from './engine/fasting.js';

const WINDOW = 7;                                   // today + 6 days
const KEEP_VERSIONS = 7;
const BANNER_REASONS = new Set(['menu-change', 'override', 'check-in']);
const toMin = hhmm => { const [a, b] = String(hhmm).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slim = p => ({ ...p, meals: p.meals.map(({ menu, ...m }) => m) });      // history keeps plates, not menu snapshots

export class Planner {
  constructor(st = store) {
    this.store = st;
    this.cache = new Map();           // date → { plan, parts, history }
    this.ready = false;
    this._off = null;
    this._persisters = new Map();
  }

  // ---------- lifecycle ----------
  async start() {
    this.reset();
    const st = this.store, today = todayKey(), to = addDays(today, WINDOW - 1);
    await this._loadDays(today, to);
    const docs = await st.readPlans(today, to);
    for (const [date, doc] of Object.entries(docs)) {
      if (doc?.plan && doc.parts) this.cache.set(date, { plan: doc.plan, parts: doc.parts, history: doc.history || [] });
    }
    st.prunePlans(today);
    this.ready = true;
    this._off = st.on(r => { if (r === 'shared' || r === 'profile' || r === 'day' || r === 'goal') this.refresh(); });
    this.refresh();
  }

  reset() {
    this._off?.(); this._off = null;
    this.cache.clear(); this.ready = false;
  }

  /** One query for the week of logs, so overrides on future days are known before planning. */
  async _loadDays(from, to) {
    const st = this.store;
    if (st.mode === 'cloud') {
      await st.range(from, to);
      for (let k = from; k <= to; k = addDays(k, 1)) {
        if (!st.loaded.has(k)) { st.loaded.add(k); if (!st.days.has(k)) st.days.set(k, emptyDay()); }
      }
    } else for (let k = from; k <= to; k = addDays(k, 1)) await st.loadDay(k);
  }

  /** Re-plan every tracked day whose inputs changed. Cheap when nothing did. */
  refresh() {
    if (!this._live()) return;
    const today = todayKey();
    for (let i = 0; i < WINDOW; i++) this.planFor(addDays(today, i));
  }

  _live() {
    const sh = this.store.shared;
    return this.ready && sh.menusLoaded && sh.specialsLoaded && this.store.profile.onboarded;
  }

  // ---------- reading ----------
  planFor(date) {
    const inp = this._inputs(date), parts = this._parts(inp);
    const today = todayKey();
    const tracked = date >= today && date <= addDays(today, WINDOW - 1);
    if (!tracked || !this._live()) return this._build(inp, null, 'initial', 1);
    const e = this.cache.get(date);
    if (e && same(e.parts, parts)) return e.plan;
    // offline we may only see the bundled menu; don't call that "the menu changed"
    if (e && e.parts.src === 'shared' && parts.src === 'default') return this._build(inp, null, 'initial', 1);
    return this._replan(date, e, inp, parts);
  }

  mealFor(date, id) {
    return this.planFor(date).meals.find(m => m.id === id) || null;
  }

  // ---------- inputs ----------
  _inputs(date) {
    const st = this.store, pf = st.profile, today = todayKey();
    const menus = pf.mess ? menuFor(pf.mess, date) : null;
    const logged = st.day(date);
    const fast = fastingFor(pf, date);
    const timings = { ...timingsFor(pf), ...(fast?.timings || {}) };
    const now = date === today ? nowMin() : -1;
    return {
      date, profile: pf, targets: targetsFor(pf), menus, logged, overrides: logged.dayOverrides || {},
      routine: { timings }, nowMin: now,
      skipped: now >= 0 ? MEAL_IDS.filter(id => (toMin(timings[id][1]) < now || fast?.skip.includes(id)) && !logged.items.some(i => itemMeal(i) === id)) : (fast?.skip || []),
    };
  }

  _parts(inp) {
    const { profile: pf, targets: t, menus, logged, overrides, skipped } = inp;
    const sum = it => [it.n, it.cal, it.p];
    return {
      menu: MEAL_IDS.map(id => (menus?.meals?.[id] || []).map(sum)),
      special: menus?.special?.title || null,
      src: menus?.source || 'none', ver: menus?.version ?? null,
      ov: MEAL_IDS.map(id => (overrides[id] || []).map(sum)),
      tg: [t.cal, t.p, t.c, t.f], adj: pf.calAdjust || 0, diet: pf.diet, goal: pf.goal, mess: pf.mess || null,
      rules: [pf.allergies || [], pf.dietTags || [], pf.fasting || null],
      logs: MEAL_IDS.map(id => { const tt = totals(logged.items.filter(i => itemMeal(i) === id)); return logged.items.some(i => itemMeal(i) === id) ? [Math.round(tt.cal), Math.round(tt.p)] : null; }),
      skip: skipped,
    };
  }

  _build(inp, prev, reason, version) {
    return buildDayPlan({ ...inp, prev, reason, version });
  }

  // ---------- re-planning ----------
  _replan(date, e, inp, parts) {
    const prev = e?.plan || null, old = e?.parts || null;
    let reason = 'initial';
    if (old) {
      if (!same(old.menu, parts.menu) || old.special !== parts.special || old.src !== parts.src) reason = 'menu-change';
      else if (!same(old.ov, parts.ov)) reason = 'override';
      else if (!same(old.tg, parts.tg) && old.adj !== parts.adj) reason = 'check-in';
      else if (!same(old.tg, parts.tg) || old.diet !== parts.diet || old.goal !== parts.goal || old.mess !== parts.mess || !same(old.rules, parts.rules)) reason = 'profile';
      else if (!same(old.skip, parts.skip)) reason = 'missed-meal';
      else reason = 'logged-off-plan';
    }
    // only the log or the clock moved: spread what is left; otherwise plan from the menus again
    const inputsMoved = old && reason !== 'missed-meal' && reason !== 'logged-off-plan';
    const plan = prev && !inputsMoved
      ? rebudget(prev, inp.logged, { nowMin: inp.nowMin, skipped: inp.skipped, reason })
      : this._build(inp, prev, reason, prev?.version || 1);

    let history = e?.history || [];
    if (prev) {
      const diffs = diffDayPlans(prev, plan);
      if (diffs.length) { plan.version = prev.version + 1; history = [slim({ ...prev, change: null }), ...history].slice(0, KEEP_VERSIONS); }
      let change = prev.change || null;
      if (BANNER_REASONS.has(reason)) {
        const big = notable(diffs);
        if (big.length) {
          change = { version: plan.version, reason, at: Date.now(), diffs: big, text: describeChange(big) };
          this._maybeNotify(date, plan, change);
        }
      }
      // a meal that has been eaten no longer needs explaining
      if (change) {
        const open = new Set(plan.meals.filter(m => m.status === 'upcoming' || m.status === 'skipped').map(m => m.id));
        const diffsLeft = change.diffs.filter(d => open.has(d.meal));
        change = diffsLeft.length ? { ...change, diffs: diffsLeft } : null;
      }
      plan.change = change;
    }
    this.cache.set(date, { plan, parts, history });
    this._persist(date);
    return plan;
  }

  _maybeNotify(date, plan, change) {
    if (date !== todayKey()) return;
    const now = nowMin();
    const soon = change.diffs.some(d => {
      const m = plan.meals.find(x => x.id === d.meal);
      return m && toMin(m.window[1]) > now && toMin(m.window[0]) - now <= 180;
    });
    if (soon) notifyNow('Your plan changed', change.text);
  }

  _persist(date) {
    if (!this._persisters.has(date)) {
      this._persisters.set(date, debounce(() => {
        const e = this.cache.get(date);
        if (e) this.store.writePlan(date, { date, version: e.plan.version, plan: e.plan, parts: e.parts, history: e.history });
      }, 1200));
    }
    this._persisters.get(date)();
  }

  // ---------- banner ----------
  /** The newest un-acknowledged change on today or tomorrow, for the Today banner. */
  pendingChange() {
    const today = todayKey();
    for (const date of [today, addDays(today, 1)]) {
      const e = this.cache.get(date);
      const c = e?.plan.change;
      if (c && c.version > this.acked(date)) return { date, plan: e.plan, change: c, history: e.history };
    }
    return null;
  }
  acked(date) { return +lsGet('ff.planack.' + date, 0) || 0; }
  ack(date) {
    const c = this.cache.get(date)?.plan.change;
    if (c) lsSet('ff.planack.' + date, c.version);
  }
  /** Mark every pending change as seen (the banner shows one at a time, the sheet covers them all). */
  ackAll() {
    for (const date of this.cache.keys()) this.ack(date);
  }

  // ---------- one-off overrides ("not this today") ----------
  setOverride(date, mealId, items) {
    this.store.updateDay(date, d => {
      const ov = { ...(d.dayOverrides || {}) };
      if (items && items.length) ov[mealId] = items; else delete ov[mealId];
      d.dayOverrides = ov;
    });
  }
}

export const planner = new Planner();

/** Protein / calorie top-ups for a day-level gap (kept here so views never touch the plate engine). */
export function suggestTopUps(gap, opts) {
  return topUps(gap, opts);
}
