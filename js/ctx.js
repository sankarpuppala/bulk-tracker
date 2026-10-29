// =============================================================
// SHARED APP CONTEXT — filled in by app.js at boot so views can
// navigate and open sheets without importing app.js (no cycles).
// =============================================================
import { store } from './store.js';
import { todayKey } from './util.js';
import { targetsFor } from './nutrition.js';

export const ctx = {
  store,
  date: todayKey(),       // day being viewed / logged to
  history: [],            // last ~180 days, oldest first
  stats: null,            // gamify.analyse() result
  firebaseReady: false,
  auth: null,
  targets: () => targetsFor(store.profile),
  // set by app.js
  go: () => {}, setDate: () => {}, openLog: () => {}, refresh: () => {}, reloadHistory: async () => {}, signOut: () => {},
};
