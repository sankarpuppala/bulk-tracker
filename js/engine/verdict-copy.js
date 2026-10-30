// =============================================================
// VERDICT COPY — template explainer. Turns a Verdict's reason codes
// and numbers into 1–3 plain sentences, offline. The AI explainer
// (Phase 7) is an upgrade on this, never a dependency, and may only
// use numbers that appear in the Verdict.
// =============================================================
import { stepLabel, MEAL_LABEL } from './verdict.js';
import { blockText } from './diet.js';

const kcal = n => `${Math.round(n).toLocaleString('en-IN')} kcal`;
const g = n => `${Math.round(n)} g`;
const has = (v, code) => v.reasons.some(r => r === code || r.startsWith(code + ':'));
const code = (v, c) => v.reasons.find(r => r.startsWith(c + ':'))?.split(':')[1];



/** @returns { headline, body, tip, ifAnyway } — all plain strings. */
export function explain(v) {
  const n = v.numbers, name = v.names || 'this';
  const out = { headline: name, body: '', tip: null, ifAnyway: null };

  // hard blocks: neutral, no moralising, no override nudge
  if (v.blocked) {
    const al = v.reasons.filter(r => r.startsWith('ALLERGEN:')).map(r => r.split(':')[1]);
    out.body = al.length
      ? `You’ve marked ${al.join(' and ')} as an allergy, and this looks like it contains ${al.length > 1 ? 'them' : 'it'}.`
      : `This has ${blockText(v.reasons[0])}.`;
    if (v.alternatives.length) out.tip = `Try ${v.alternatives.slice(0, 2).map(a => a.n).join(' or ')} instead.`;
    return out;
  }

  if (has(v, 'RESTRICTION_PAUSED')) {
    out.body = `${kcal(n.cal)} and ${g(n.p)} of protein. Eat it, and eat well today: no cutting back right now.`;
    return out;
  }
  if (has(v, 'FLOOR')) {
    out.body = `You haven’t eaten much yet, so this is worth having in full. Your day needs at least ${kcal(n.floor)}.`;
    return out;
  }

  const extras = [];
  if (has(v, 'FRIED')) extras.push('it is fried');
  if (has(v, 'HIGH_SUGAR')) extras.push('it is high in sugar');
  if (has(v, 'HIGH_SODIUM')) extras.push('it is salty');
  const watch = extras.length ? ` Worth knowing: ${extras.join(' and ')}.` : '';

  switch (v.kind) {
    case 'go':
      if (has(v, 'ADD_PROTEIN')) {
        out.body = `${kcal(n.cal)} with only ${g(n.p)} of protein. Good for the calories you need today, but add something protein-rich.`;
        if (v.addProtein.length) out.tip = `Add ${v.addProtein.map(a => a.n).join(' or ')}.`;
      } else if (has(v, 'PROTEIN_DENSE')) {
        out.body = `${g(n.p)} of protein for ${kcal(n.cal)}, and it fits well inside what’s left today.`;
      } else out.body = `${kcal(n.cal)} fits inside what’s left today.${watch}`;
      if (v.tip === 'QUALITY') out.tip = out.tip || 'Fits the numbers; balance it with something fresh at the next meal.';
      if (has(v, 'TRAINING_DAY')) out.tip = out.tip || 'Training day: the protein helps recovery.';
      break;
    case 'smaller':
      if (has(v, 'OVER_DAY_CAP')) out.body = `A full portion would take today well past your target. Have ${stepLabel(v.portion)} (${kcal(v.portionNumbers.cal)}).`;
      else out.body = `A full portion uses about ${Math.round(n.share * 100)}% of the calories you have to spare. Have ${stepLabel(v.portion)} (${kcal(v.portionNumbers.cal)}, ${g(v.portionNumbers.p)} protein).${watch}`;
      if (v.alternatives.length) out.tip = `Or swap for ${v.alternatives[0].n}.`;
      break;
    case 'swap':
      out.body = `${kcal(n.cal)} is more than you have to spare today (${kcal(Math.max(0, n.flex))}).${watch}`;
      out.tip = `${v.alternatives[0].n} fits better: ${kcal(v.alternatives[0].cal)}, ${g(v.alternatives[0].p)} protein.`;
      break;
    case 'skip':
      out.body = has(v, 'PAST_TARGET')
        ? `You’re already past today’s target, and this adds ${kcal(n.cal)}. Better kept for another day.`
        : has(v, 'OVER_DAY_CAP') ? `This would take today well past your target, so it’s one to skip tonight.`
          : `${kcal(n.cal)} doesn’t fit in what’s left today (${kcal(Math.max(0, n.flex))}), and nothing lighter is close by.${watch}`;
      break;
  }

  if (v.ifAnyway && v.ifAnyway.changes.length) {
    const c = v.ifAnyway.changes[0];
    const how = c.to === 0 ? `drop ${c.name}` : `${c.name} ×${fmtServ(c.from)} → ×${fmtServ(c.to)}`;
    out.ifAnyway = `${MEAL_LABEL[c.meal].toLowerCase()} ${how}.`;
  } else if (v.ifAnyway && v.ifAnyway.overBy > 0) {
    out.ifAnyway = `you’d end the day about ${kcal(v.ifAnyway.overBy)} over target.`;
  }
  return out;
}

export const fmtServ = s => ({ 0.5: '½', 1.5: '1½', 2.5: '2½' })[s] || String(s);

/** The same text as one string, e.g. for the log-sheet chip and the AI fallback. */
export const oneLine = v => { const e = explain(v); return [e.body, e.tip].filter(Boolean).join(' '); };
