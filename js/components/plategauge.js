// =============================================================
// PLATE GAUGE — the hero. Calories are the rim of a plate; the
// three macros are katoris that fill as you eat. Everything the
// old four rings said, but you can read it at a glance.
// =============================================================
import { h, s, clamp, round, fmtNum } from '../util.js';

let n = 0;
const uid = p => `${p}${++n}`;
const CX = 120, CY = 120;

/** Calorie plate. `eaten` / `target` in kcal. */
export function plateGauge({ eaten, target, size = 232, show = 'left' }) {
  const pct = target > 0 ? eaten / target : 0;
  const over = pct > 1.05;
  const R = 86, circ = 2 * Math.PI * R;
  const arcId = uid('pa');
  const tone = over ? 'var(--warn)' : 'var(--accent)';

  const svg = s('svg', { viewBox: '0 0 240 240', width: size, height: size, class: 'pg', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      s('linearGradient', { id: arcId, x1: 0, y1: 0, x2: 1, y2: 1 },
        s('stop', { offset: '0%', style: `stop-color:${tone}` }),
        s('stop', { offset: '100%', style: 'stop-color:var(--accent-2)' })),
      s('radialGradient', { id: arcId + 'd', cx: 0.35, cy: 0.25, r: 1 },
        s('stop', { offset: '0%', style: 'stop-color:var(--plate-1)' }),
        s('stop', { offset: '100%', style: 'stop-color:var(--plate-2)' }))),
    s('circle', { cx: CX, cy: CY, r: 114, fill: `url(#${arcId}d)`, stroke: 'var(--line-strong)', 'stroke-width': 1.5 }),
    s('circle', { cx: CX, cy: CY, r: 108, fill: 'none', stroke: 'var(--line)', 'stroke-width': 1 }));

  // dial ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, long = i % 5 === 0;
    const r1 = long ? 98 : 100.5, r2 = 104;
    svg.appendChild(s('line', {
      x1: CX + Math.sin(a) * r1, y1: CY - Math.cos(a) * r1, x2: CX + Math.sin(a) * r2, y2: CY - Math.cos(a) * r2,
      stroke: 'var(--ink)', 'stroke-opacity': long ? 0.28 : 0.12, 'stroke-width': long ? 1.6 : 1, 'stroke-linecap': 'round',
    }));
  }
  svg.appendChild(s('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: 'var(--ink)', 'stroke-opacity': 0.08, 'stroke-width': 14 }));
  svg.appendChild(s('circle', { cx: CX, cy: CY, r: 71, fill: 'var(--plate-in)', stroke: 'var(--line)', 'stroke-width': 1 }));

  const arc = s('circle', {
    cx: CX, cy: CY, r: R, fill: 'none', stroke: `url(#${arcId})`, 'stroke-width': 14, 'stroke-linecap': 'round',
    'stroke-dasharray': circ, 'stroke-dashoffset': circ, transform: `rotate(-90 ${CX} ${CY})`, class: 'pg-arc',
  });
  svg.appendChild(arc);
  // a bead rides the end of the arc
  const bead = s('g', { class: 'pg-bead', style: 'transform-origin:120px 120px;transform:rotate(0deg)' },
    s('circle', { cx: CX, cy: CY - R, r: 9.5, fill: 'var(--plate-1)', stroke: tone, 'stroke-width': 3.5 }));
  svg.appendChild(bead);
  if (pct > 1) {
    svg.appendChild(s('circle', {
      cx: CX, cy: CY, r: R, fill: 'none', stroke: 'var(--bad)', 'stroke-width': 5, 'stroke-linecap': 'round',
      'stroke-dasharray': `${circ * clamp(pct - 1, 0, 1)} ${circ}`, transform: `rotate(-90 ${CX} ${CY})`, opacity: 0.9,
    }));
  }
  const shown = clamp(pct, 0, 1);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', circ * (1 - shown));
    bead.style.transform = `rotate(${shown * 360}deg)`;
  }));

  const left = target - eaten;
  if (show === 'target') {
    return h('div', { class: 'plate-gauge', style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': `${fmtNum(target)} calories a day` },
      svg, h('div', { class: 'pg-center' }, h('div', { class: 'pg-num num' }, fmtNum(target)), h('div', { class: 'pg-cap' }, 'kcal a day')));
  }
  return h('div', { class: 'plate-gauge', style: { width: size + 'px', height: size + 'px' }, role: 'img',
    'aria-label': left >= 0 ? `${fmtNum(left)} calories left of ${fmtNum(target)}` : `${fmtNum(-left)} calories over ${fmtNum(target)}` },
    svg,
    h('div', { class: 'pg-center' },
      h('div', { class: 'pg-num num' }, fmtNum(Math.abs(left))),
      h('div', { class: 'pg-cap' }, left >= 0 ? 'kcal left' : 'kcal over'),
      h('div', { class: 'pg-sub num' }, `${fmtNum(eaten)} / ${fmtNum(target)}`)));
}

/** A katori that fills with food as the macro is eaten. */
export function bowlGauge({ label, value, max, color, unit = 'g', show = 'left' }) {
  const pct = max > 0 ? value / max : 0;
  const fillPct = clamp(pct, 0, 1);
  const left = max - value;
  const over = pct > 1.05;
  const clip = uid('bc');
  const top = 60 - 32 * fillPct;
  const level = s('g', { class: 'bowl-level', style: `transform:translateY(${32 * fillPct + 6}px)` },
    s('rect', { x: 0, y: top, width: 88, height: 60, fill: color }),
    s('path', { d: `M0 ${top} q11 -5 22 0 t22 0 t22 0 t22 0 V${top + 8} H0 Z`, fill: color, opacity: 0.0 }),
    s('ellipse', { cx: 44, cy: top, rx: 34, ry: 3.2, fill: '#fff', opacity: 0.28 }));
  const svg = s('svg', { viewBox: '0 0 88 72', class: 'bowl', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {}, s('clipPath', { id: clip }, s('path', { d: 'M12 28H76C76 49 63 60 44 60S12 49 12 28Z' }))),
    s('ellipse', { cx: 44, cy: 67, rx: 30, ry: 3.6, fill: 'var(--ink)', opacity: 0.1 }),
    s('path', { d: 'M8 26H80C80 52 64 64 44 64S8 52 8 26Z', fill: 'var(--bowl)', stroke: 'var(--line-strong)', 'stroke-width': 1.5 }),
    s('path', { d: 'M12 28H76C76 49 63 60 44 60S12 49 12 28Z', fill: 'var(--bowl-in)' }),
    s('g', { 'clip-path': `url(#${clip})` }, level),
    over && s('path', { d: 'M18 28c4-9 14-12 26-12s22 3 26 12Z', fill: color, opacity: 0.95 }),
    s('rect', { x: 5, y: 22, width: 78, height: 7, rx: 3.5, fill: 'var(--bowl-rim)', stroke: 'var(--line-strong)', 'stroke-width': 1 }));
  requestAnimationFrame(() => requestAnimationFrame(() => { level.style.transform = 'translateY(0)'; }));
  return h('div', { class: 'bowl-gauge' + (over ? ' over' : ''), role: 'img', 'aria-label': `${label}: ${round(value)} of ${round(max)} ${unit}` },
    svg,
    h('div', { class: 'bowl-l' }, label),
    show === 'target'
      ? [h('div', { class: 'bowl-v num' }, round(max), h('small', null, unit)), h('div', { class: 'bowl-s' }, 'a day')]
      : [h('div', { class: 'bowl-v num' }, over ? `+${round(-left)}` : round(Math.max(0, left)), h('small', null, unit)), h('div', { class: 'bowl-s' }, over ? 'over' : 'left')]);
}
