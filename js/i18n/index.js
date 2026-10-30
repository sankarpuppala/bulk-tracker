// =============================================================
// i18n — a tiny translator. t('nav.today') returns the string in the
// current locale, falling back to English, then to the key itself, so
// a missing translation can never blank the UI.
//
// Strings move here screen by screen; anything not in a dictionary
// simply stays English. Hindi first (hi), then te, ta, kn, ml: add a
// file, add it to LOCALES. Keep the keys in en.js as the source of truth.
// =============================================================
import en from './en.js';
import hi from './hi.js';

export const LOCALES = [
  { id: 'en', label: 'English', dict: en },
  { id: 'hi', label: 'हिन्दी', dict: hi },
];

let current = 'en';

/** 'hi-IN' → 'hi'; unknown → 'en'. */
export const pickLocale = tag => { const l = String(tag || 'en').toLowerCase().split('-')[0]; return LOCALES.some(x => x.id === l) ? l : 'en'; };
export function setLocale(tag) { current = pickLocale(tag); if (typeof document !== 'undefined') document.documentElement.lang = current; return current; }
export const getLocale = () => current;

export function t(key, vars = {}) {
  const dict = LOCALES.find(x => x.id === current)?.dict || en;
  const s = dict[key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

/** Keys present in English but missing in a locale (the translation to-do list). */
export const missingKeys = id => Object.keys(en).filter(k => !(k in (LOCALES.find(x => x.id === id)?.dict || {})));
