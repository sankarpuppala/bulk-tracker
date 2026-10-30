// =============================================================
// COACH ENGINE — everything about the AI coach that must NOT depend
// on the model (spec §5.7, §9.1). Pure: no DOM, no network.
//
//   buildPacket(input)            the ≤ 2 KB context packet the coach sees
//   guard(message, profile)       deterministic safety layer that runs BEFORE any model call
//   validateProposal(p, limits)   a coach suggestion is only offered if it is safe to apply
//   acceptExplanation(...)        an AI verdict explanation is only shown if it checks out
//
// The model can phrase things. It can never override a floor, a rate cap or a verdict.
// =============================================================
import { round } from '../util.js';
import { ED_TEXT } from './verdict.js';

export const PACKET_MAX = 2048;

const bytes = o => new TextEncoder().encode(JSON.stringify(o)).length;

/**
 * @param profile  { goal, diet, sex, age, weight, height, mess, allergies }
 * @param targets  { cal, p, c, f, floor }
 * @param eaten    { cal, p }
 * @param plan     active GoalPlan (or null)
 * @param nextMeal { id, names: [..], cal, p } | null
 * @param checkin  last CheckIn | null
 * @returns a JSON-able packet no bigger than PACKET_MAX bytes, trimmed least-important-first
 */
export function buildPacket({ profile, targets, eaten = { cal: 0, p: 0 }, plan = null, nextMeal = null, checkin = null, week = null }) {
  const pk = {
    me: { goal: profile.goal, diet: profile.diet, sex: profile.sex, age: profile.age, kg: profile.weight, cm: profile.height, mess: profile.mess || null, allergies: profile.allergies?.length ? profile.allergies : undefined },
    targets: { cal: targets.cal, p: targets.p, c: targets.c, f: targets.f, floor: targets.floor },
    today: { eatenCal: round(eaten.cal), eatenP: round(eaten.p), leftCal: round(targets.cal - eaten.cal), leftP: round(targets.p - eaten.p) },
  };
  if (nextMeal) pk.next = { meal: nextMeal.id, items: (nextMeal.names || []).slice(0, 4), cal: round(nextMeal.cal), p: round(nextMeal.p) };
  if (plan) pk.goal = { label: plan.label, type: plan.type, rateWk: plan.rateWk, target: plan.target?.w, week: week?.week, of: plan.totalWeeks, phase: week?.phase };
  if (checkin) pk.check = { decision: checkin.decision, observed: checkin.observedRate, planned: checkin.expectedRate, adherence: checkin.completeness };
  // trim until it fits: optional detail goes first, the targets and today's numbers never do
  const drop = [() => delete pk.me.allergies, () => delete pk.check, () => { if (pk.next) pk.next.items = pk.next.items.slice(0, 2); }, () => delete pk.next, () => delete pk.goal];
  for (const d of drop) { if (bytes(pk) <= PACKET_MAX) break; d(); }
  return pk;
}

// ---------------- deterministic guard ----------------
const DRUGS = /\b(steroids?|sarms?|clenbuterol|clen|dnp|trenbolone|tren|anavar|dianabol|testosterone (cycle|booster)|fat[- ]?burners?|diuretics?|water pills?|laxatives? for weight|insulin to bulk|hgh)\b/i;
const STARVE = /\b(how (little|few calories) (can|could) i eat|eat nothing|starv(e|ing)|zero calories? (a )?day|(water|juice) fast(ing)? for \d+ days?|skip (all )?meals? to lose|stop eating)\b/i;
const MINOR_EXTREME = /\b(crash diet|lose \d+ ?kg in (a |one )?(week|days?)|fat[- ]?burners?|steroids?|bulk (really )?fast|aggressive (cut|bulk))\b/i;

const CARE = 'It sounds like food or your body is weighing on you right now, and I’m glad you said it. I won’t suggest eating less. Please talk to someone you trust, or call Tele-MANAS on 14416 (free, confidential, 24×7 in India). If it helps, I can switch your plan to maintenance so there’s no pressure to lose.';

/** "lose 10 kg in 3 weeks" → { kg, weeks }. */
export function parseLossAsk(text) {
  const m = String(text).toLowerCase().match(/(?:lose|drop|cut|shed)\s+(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?)\s+(?:in|within|by)\s+(?:a |an |one |the next )?(\d+(?:\.\d+)?)?\s*(day|days|week|weeks|month|months)\b/);
  if (!m) return null;
  const n = m[2] ? +m[2] : 1, unit = m[3];
  const weeks = unit.startsWith('day') ? n / 7 : unit.startsWith('week') ? n : n * 4.345;
  return { kg: +m[1], weeks };
}

/**
 * @returns null when the message may go to the model, else { category, reply, proposal? }:
 * a fixed, careful answer the app gives itself.
 */
export function guard(message, profile = {}, targets = {}) {
  const t = String(message || '');
  const minor = (+profile.age || 99) < 18;
  const floor = targets.floor || (profile.sex === 'female' ? 1300 : 1500);

  if (ED_TEXT.test(t) || STARVE.test(t)) return { category: 'wellbeing', reply: CARE, proposal: { kind: 'switch_to_maintenance', summary: 'Switch to a maintenance plan' } };

  if (DRUGS.test(t)) {
    return { category: 'drugs', reply: 'I can’t recommend that: steroids, SARMs, fat burners and diuretics carry real risks (hormones, heart, liver and kidney strain) and aren’t worth it, especially for young people. What does work is steady training, enough protein and enough food. Creatine monohydrate and protein powder at label doses are the safe basics.' + (minor ? ' Since you’re under 18, please talk to a parent, doctor or coach before taking any supplement.' : '') };
  }

  const loss = parseLossAsk(t);
  if (loss && profile.weight) {
    const safeWeekly = 0.0075 * profile.weight, asked = loss.kg / Math.max(loss.weeks, 0.14);
    if (asked > 0.01 * profile.weight) {
      const weeks = Math.ceil(loss.kg / safeWeekly);
      return { category: 'crash-pace', reply: `That pace is faster than is safe, so I won’t plan around it. A steady pace for you is about ${round(safeWeekly, 1)} kg a week, so ${round(loss.kg)} kg would take about ${weeks} weeks. I can set that up as a goal, with a calorie target that never goes below ${floor} kcal.${minor ? ' Since you’re under 18, involve a parent, doctor or coach too.' : ''}`, proposal: { kind: 'goal_timeline', summary: `Plan ${round(loss.kg)} kg over about ${weeks} weeks`, value: weeks } };
    }
  }

  const kc = t.match(/\b(\d{3,4})\s*(?:k?cal(?:ories)?|kcal)\b[^.?!]*\b(?:a day|per day|daily|every day)\b/i);
  if (kc && +kc[1] < floor && /\b(eat|diet|intake|consume|limit|stick)\b/i.test(t)) {
    return { category: 'below-floor', reply: `I can’t suggest eating below ${floor} kcal a day, since that’s the minimum for your body to work properly. I can help you lose steadily on a target above that.` };
  }

  if (minor && MINOR_EXTREME.test(t)) {
    return { category: 'minor', reply: 'At your age the best plan is steady and gentle, not fast or extreme. Eat enough, train with good form, and sleep well. For anything beyond general healthy eating, please involve a parent, doctor or coach. I can help with food ideas from your mess menu.' };
  }
  return null;
}

// ---------------- proposals ----------------
const KINDS = ['calories', 'protein', 'goal_timeline', 'switch_to_maintenance', 'add_topup', 'swap_meal_item'];

/**
 * A coach suggestion is only shown if applying it is safe. `limits`: { floor, ceiling, weight, age }
 * @returns { ok: true, p } | { ok: false, why }
 */
export function validateProposal(p, limits = {}) {
  if (!p || !KINDS.includes(p.kind) || typeof p.summary !== 'string' || !p.summary.trim()) return { ok: false, why: 'malformed' };
  const v = p.value == null ? null : +p.value;
  if (p.kind === 'calories') {
    if (v == null || !isFinite(v)) return { ok: false, why: 'no value' };
    if (limits.floor && v < limits.floor) return { ok: false, why: 'below the calorie floor' };
    if (limits.ceiling && v > limits.ceiling) return { ok: false, why: 'above a sensible ceiling' };
    if ((+limits.age || 99) < 18 && limits.current && v < limits.current) return { ok: false, why: 'no cuts for under-18s' };
  }
  if (p.kind === 'protein') {
    if (v == null || !isFinite(v) || !limits.weight) return { ok: false, why: 'no value' };
    const perKg = v / limits.weight;
    if (perKg < 0.8 || perKg > ((+limits.age || 99) < 18 ? 1.6 : 2.5)) return { ok: false, why: 'protein out of range' };
  }
  if (p.kind === 'goal_timeline' && (v == null || v < 1 || v > 156)) return { ok: false, why: 'bad timeline' };
  return { ok: true, p: { kind: p.kind, summary: p.summary.slice(0, 80), value: v, detail: p.detail ? String(p.detail).slice(0, 200) : null } };
}

// ---------------- AI explainer acceptance ----------------
const SHAMING = /\b(bad|junk|cheat|cheating|guilty|ruin|ruined|sin|naughty|disgusting)\b/i;
const CONTRADICTS = {
  skip: /\b(go ahead|enjoy it|perfectly fine to have|have the full)\b/i,
  go: /\b(skip it|don'?t eat|avoid this|not worth)\b/i,
  swap: /\b(have it as is|go ahead and eat the full)\b/i,
  smaller: /\b(skip it|have the full)\b/i,
};

/** Numbers in `text` that don't occur in `input` (as written, or as a percent of a fraction). */
export function inventedNumbers(text, input) {
  const allowed = new Set((JSON.stringify(input).match(/\d+(?:\.\d+)?/g) || []).map(Number));
  [...allowed].forEach(n => { if (n > 0 && n <= 1) allowed.add(Math.round(n * 100)); });
  const found = (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, '')));
  return found.filter(n => !allowed.has(n));
}

/** Show the AI's sentence only if it respects the verdict; otherwise the template copy stays. */
export function acceptExplanation(kind, text, input) {
  const t = String(text || '').trim();
  if (!t || t.split(/\s+/).length > 60) return false;
  if (SHAMING.test(t) || CONTRADICTS[kind]?.test(t)) return false;
  return inventedNumbers(t, input).length === 0;
}

/** Coach replies may only quote numbers from the packet (plus the helpline and a few safe constants). */
export function numbersFromPacket(reply, packet) {
  const allowed = new Set((JSON.stringify(packet).match(/\d+(?:\.\d+)?/g) || []).map(Number));
  for (const n of [14416, 18.5, 1, 2, 3, 7, 24]) allowed.add(n);
  return (String(reply).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, ''))).filter(n => !allowed.has(n));
}
