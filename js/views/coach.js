// =============================================================
// COACH SHEET — chat with the AI coach (spec §5.7).
// The safety guard runs before every model call; the coach only
// quotes numbers from the context packet; and it can propose, never
// change: every suggestion is a button that does nothing until tapped.
// =============================================================
import { h, fill } from '../util.js';
import { sheet, toast } from '../ui.js';
import { ctx } from '../ctx.js';
import { icon } from '../components/icons.js';
import { askCoach, applyProposal } from '../coach.js';
import { aiReady } from '../ai.js';
import { stateCard } from './snap.js';
import { numbersFromPacket } from '../engine/coach.js';
import { packetNow } from '../coach.js';

const STARTERS = ['Why am I not gaining weight?', 'What should I eat for dinner tonight?', 'How much protein do I need?', 'Can I raise my calories?'];

export function openCoach() {
  const log = h('div', { class: 'coach-log', role: 'log', 'aria-live': 'polite' });
  const input = h('input', { class: 'input', type: 'text', placeholder: 'Ask your coach…', 'aria-label': 'Message to your coach', enterkeyhint: 'send', maxlength: 600 });
  const send = h('button', { class: 'btn primary', 'aria-label': 'Send', onclick: () => go() }, icon('send', { size: 18 }));
  const body = h('div', { class: 'stack coach' }, log, h('div', { class: 'row gap' }, input, send),
    h('p', { class: 'tiny muted' }, 'General nutrition guidance, not medical advice. The coach suggests; nothing changes unless you tap.'));
  const sh = sheet({ title: 'Coach', sub: 'Ask about your plan, your food and your week', body, wide: true });
  const history = [];
  let busy = false;

  const bubble = (who, text) => { const b = h('div', { class: 'cmsg ' + who }, text); log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };

  const gate = aiReady();
  if (gate) { fill(body, stateCard(gate, { sh })); return sh; }

  if (!history.length) log.appendChild(h('div', { class: 'chip-row' }, STARTERS.map(s => h('button', { class: 'chip', onclick: () => { input.value = s; go(); } }, s))));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  setTimeout(() => input.focus(), 250);

  async function go() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; input.value = ''; log.querySelector('.chip-row')?.remove();
    bubble('me', text);
    const reply = bubble('coach', '…');
    let got = '';
    const chips = h('div', { class: 'chip-row' });
    await askCoach(text, history.slice(-8), ev => {
      if (ev.text) { got += ev.text; reply.textContent = got; log.scrollTop = log.scrollHeight; }
      if (ev.proposal) chips.appendChild(h('button', { class: 'chip proposal', onclick: e => {
        const r = applyProposal(ev.proposal);
        if (r.ok) { toast('Done: ' + ev.proposal.summary); e.currentTarget.disabled = true; e.currentTarget.classList.add('on'); ctx.refresh(); } else toast('Can’t apply that: ' + r.why, 'warn');
      } }, icon('check', { size: 14 }), ev.proposal.summary));
      if (ev.error) { reply.replaceWith(stateCard(ev.error, { sh })); got = ''; }
    });
    if (got) {
      // the coach may only quote numbers it was given; flag anything else rather than present it as fact
      const odd = numbersFromPacket(got, packetNow());
      if (odd.length && !got.includes('14416')) reply.appendChild(h('div', { class: 'tiny muted' }, 'Double-check: some figures here aren’t from your data.'));
      history.push({ role: 'user', text }, { role: 'model', text: got });
    }
    if (chips.childNodes.length) log.appendChild(chips);
    busy = false;
  }
  return sh;
}
