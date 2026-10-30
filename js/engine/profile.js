// =============================================================
// PROFILE SCHEMA — versioning and migration.
// Pure and idempotent: migrateProfile(migrateProfile(p)) equals
// migrateProfile(p), and it never drops or overwrites v1 fields.
//
//   v1  goal/pace/goalWeight, diet, mess, routine, favourites…
//   v2  + allergies, dietTags, sources, locale, consents, activeGoalId
// =============================================================

export const PROFILE_SCHEMA = 2;

/** Fresh copies each call, so profiles never share nested arrays/objects. */
export const profileV2Defaults = () => ({
  allergies: [],        // ['peanut', 'lactose', …] — hard filters (Phase 8)
  dietTags: [],         // ['vegan', 'jain', 'halal', 'no-beef', 'no-pork']
  sources: {},          // where meals come from: { weekday: 'mess', weekend: 'home' }
  locale: 'en-IN',
  consents: {},         // { health: ts, ai: ts } — set at consent screens (Phase 10)
  activeGoalId: null,   // points at users/{uid}/goals/{id} (Phase 2)
});

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function migrateProfile(p) {
  const src = isObj(p) ? p : {};
  const out = { ...src };
  const d = profileV2Defaults();

  out.allergies = Array.isArray(src.allergies) ? src.allergies.filter(x => typeof x === 'string') : d.allergies;
  out.dietTags = Array.isArray(src.dietTags) ? src.dietTags.filter(x => typeof x === 'string') : d.dietTags;
  out.sources = isObj(src.sources) ? src.sources : d.sources;
  out.consents = isObj(src.consents) ? src.consents : d.consents;
  out.locale = typeof src.locale === 'string' && src.locale ? src.locale : d.locale;
  out.activeGoalId = typeof src.activeGoalId === 'string' ? src.activeGoalId : d.activeGoalId;

  // never downgrade a profile written by a newer build
  out.schema = Math.max(PROFILE_SCHEMA, +src.schema || 0);
  return out;
}
