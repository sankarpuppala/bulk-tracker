// =============================================================
// FEATURE FLAGS — unfinished v2 features ship dark.
// Defaults live here; a device can override any flag from the
// console: setFlag('snap', true). Overrides persist in
// localStorage['ff.flags'] and storage failures are ignored.
// =============================================================
import { lsGet, lsSet } from './util.js';

const KEY = 'ff.flags';

export const DEFAULT_FLAGS = {
  newNav: false,       // Phase 1  Today · Plan · Snap · Ask · Progress
  goalPlanner: false,  // Phase 2  X→Y in Z months, weekly check-ins
  dayPlan: false,      // Phase 3  DayPlan + menu-change re-planning
  verdict: false,      // Phase 4  "Should I eat this?"
  snap: false,         // Phase 6  photo logging (needs the user's AI key)
  coach: false,        // Phase 7  AI explanations + coach chat
};

/** Pure: defaults merged with overrides; unknown or non-boolean overrides are ignored. */
export function resolveFlags(defaults, overrides) {
  const out = { ...defaults };
  if (overrides && typeof overrides === 'object') {
    for (const k of Object.keys(defaults)) if (typeof overrides[k] === 'boolean') out[k] = overrides[k];
  }
  return out;
}

export const allFlags = () => resolveFlags(DEFAULT_FLAGS, lsGet(KEY, {}));
export const flag = name => allFlags()[name] === true;

export function setFlag(name, on) {
  if (!(name in DEFAULT_FLAGS)) return false;
  lsSet(KEY, { ...(lsGet(KEY, {}) || {}), [name]: !!on });
  return true;
}
