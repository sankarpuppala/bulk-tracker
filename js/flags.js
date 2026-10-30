// =============================================================
// FEATURE FLAGS — unfinished v2 features ship dark.
// Defaults live here; a device can override any flag from the
// console: setFlag('snap', true). Overrides persist in
// localStorage['ff.flags'] and storage failures are ignored.
// =============================================================
import { lsGet, lsSet } from './util.js';

const KEY = 'ff.flags';

export const DEFAULT_FLAGS = {
  newNav: true,        // Phase 1  Today · Plan · Snap · Ask · Progress (shipped)
  goalPlanner: true,   // Phase 2  X→Y in Z months, weekly check-ins (shipped)
  dayPlan: true,       // Phase 3  DayPlan + menu-change re-planning (shipped)
  verdict: true,       // Phase 4  "Should I eat this?" (shipped)
  snap: true,          // Phase 6  photo logging; still needs a gateway and the user's own AI key
  coach: false,        // Phase 7  AI coach chat: stays dark until the red-team set passes against the live model
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
