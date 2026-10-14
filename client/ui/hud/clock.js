// The HUD's day / night clock (hud.js), top right: the sun or the moon along an arc over a treeline, the day or night,
// what comes next and when, and the horde left. Methods laid onto Hud.
import { PHASE, dayLength, NIGHT_LENGTH, DUSK_WARNING } from '../../../shared/constants.js';
import { el, svgEl, fmtTime, clamp } from '../dom.js';
import { glyph } from '../icons.js';
import { W, ACT_NOW } from '../../game/act.js'; // (this act, and the words for what its parts go into)
import { WORLD } from '../../../shared/acts.js';

const ARC = { cx: 120, cy: 70, rx: 100, ry: 56 };

// deterministic treeline for the clock horizon
function treeline() {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let d = '';
  for (let x = 2; x < 240; ) {
    const edge = Math.min(x, 240 - x) / 120; // 0 at edges, 1 at centre
    const h = (1 - edge * 0.78) * (7 + r() * 11) + 2;
    const w = 2.2 + h * 0.26 + r() * 1.2;
    const y0 = 76;
    d += `M${(x - w).toFixed(1)} ${y0}L${x.toFixed(1)} ${(y0 - h).toFixed(1)}L${(x + w).toFixed(1)} ${y0}Z`;
    // second tier for bigger trees
    if (h > 9) d += `M${(x - w * 0.8).toFixed(1)} ${(y0 - h * 0.35).toFixed(1)}L${x.toFixed(1)} ${(y0 - h * 1.08).toFixed(1)}L${(x + w * 0.8).toFixed(1)} ${(y0 - h * 0.35).toFixed(1)}Z`;
    x += w * (0.9 + r() * 0.9);
  }
  return d + 'M0 75.6H240V76.6H0Z';
}

function stars() {
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let out = '';
  for (let i = 0; i < 22; i++) {
    const x = 14 + r() * 212;
    const y = 4 + r() * 58;
    const rad = 0.35 + r() * 0.75;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" style="animation-delay:${(-r() * 4).toFixed(2)}s"/>`;
  }
  return out;
}

export const clockMethods = {
  _buildClock(clockLayer) {
    // ---- top-right day / night clock
    const clock = (this.clock = el('div', 'clock is-day', clockLayer));
    const svgWrap = svgEl(
      'div',
      'clk-dial',
      clock,
      `<svg class="clk-svg" viewBox="0 0 240 82" aria-hidden="true">
        <g class="clk-stars">${stars()}</g>
        <path class="clk-track" d="M20 70A100 56 0 0 1 220 70" pathLength="100"/>
        <path class="clk-prog" d="M20 70A100 56 0 0 1 220 70" pathLength="100"/>
        <g class="clk-ticks">${[0.25, 0.5, 0.75]
          .map((p) => {
            const a = Math.PI * p;
            const x = ARC.cx - ARC.rx * Math.cos(a);
            const y = ARC.cy - ARC.ry * Math.sin(a);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3"/>`;
          })
          .join('')}</g>
        <g class="clk-body" transform="translate(20 70)">
          <g class="clk-sun"><circle class="halo" r="11"/><circle r="5.4"/><path d="M0-9.5V-7.6M0 9.5V7.6M-9.5 0H-7.6M9.5 0H7.6M-6.7-6.7L-5.4-5.4M6.7 6.7L5.4 5.4M-6.7 6.7L-5.4 5.4M6.7-6.7L5.4-5.4"/></g>
          <g class="clk-moon"><circle class="halo" r="11"/><path d="M1.8-6.4A6.6 6.6 0 1 0 6.4 3.2A5.4 5.4 0 0 1 1.8-6.4Z"/></g>
        </g>
        <path class="clk-trees" d="${treeline()}"/>
      </svg>`,
    );
    this.clkSvg = svgWrap.firstElementChild;
    this.clkProg = this.clkSvg.querySelector('.clk-prog');
    this.clkBody = this.clkSvg.querySelector('.clk-body');
    const ct = el('div', 'clk-text', clock);
    this.clkTitle = el('div', 'clk-title', ct, 'DAY 1');
    const sub = el('div', 'clk-sub', ct);
    this.clkLabel = el('span', 'clk-label', sub, '');
    this.clkTime = el('span', 'clk-time', sub, '');
    this.clkRemain = el('div', 'clk-remain', ct);
    svgEl('i', 'clk-rico', this.clkRemain, glyph('horde'));
    this.clkRemainN = el('b', '', this.clkRemain, '0');
    el('span', '', this.clkRemain, 'remain');
    this.clkRemain.hidden = true;
  },

  _clock(h) {
    const c = this.c;
    const phase = h.phase;
    const tl = Math.max(0, Math.ceil(h.timeLeft || 0));
    const day = h.day | 0;
    let state;
    if (phase === PHASE.NIGHT) state = 'night';
    else if (phase === PHASE.DAY) state = tl <= DUSK_WARNING ? 'warn' : 'day';
    else if (phase === PHASE.GAMEOVER || phase === PHASE.VICTORY) state = 'end';
    else state = 'wait';

    const clkCls = 'clock is-' + state + (h.finale ? ' is-finale' : '');
    if (c.clkState !== clkCls) {
      c.clkState = clkCls;
      this.clock.className = clkCls;
      c.clkTitle = c.clkLabel = c.clkTime = undefined;
    }

    let title, label, time;
    if (h.finale) {
      // a stalled warm-up keeps its time on show: it stopped there, it did not start over. (A title that fits one
      // line: a second one pushes the horde counter down into the kill feed.)
      const plane = ACT_NOW === WORLD.MAINLAND;
      title = h.escapeReady ? (h.runwayBlocked ? 'Clear the runway!' : W.getIn) : h.escapeStalled ? 'Stalled' : plane ? 'Runway stand' : 'Final stand';
      label = h.escapeReady ? (h.runwayBlocked ? 'The dead are in its way' : h.escapeLeaving ? 'Someone is getting in' : plane ? 'The engines are running' : 'The engine is running') : h.escapeStalled ? (plane && !h.standWarm ? 'Get back to the fuel truck' : `Get back to the ${W.thing}`) : plane ? (h.standWarm ? 'Engines warm in' : 'Tanks full in') : 'Engine ready in';
      time = h.escapeReady ? '' : fmtTime(h.escapeT);
    } else if (state === 'night') {
      title = 'Night ' + day;
      label = (h.waves ? 'Wave ' + h.wave + '/' + h.waves + ' · ' : '') + 'dawn in';
      time = fmtTime(tl);
    } else if (state === 'warn') {
      title = 'Day ' + day;
      label = 'The horde is coming';
      time = fmtTime(tl);
    } else if (state === 'day') {
      title = 'Day ' + day;
      label = 'Nightfall in';
      time = fmtTime(tl);
    } else if (state === 'wait') {
      title = 'The calm';
      label = 'Waiting for survivors';
      time = '';
    } else {
      title = day ? 'Night ' + day : '';
      label = '';
      time = '';
    }
    if (c.clkTitle !== title) this.clkTitle.textContent = c.clkTitle = title;
    if (c.clkLabel !== label) this.clkLabel.textContent = c.clkLabel = label;
    if (c.clkTime !== time) this.clkTime.textContent = c.clkTime = time;

    const remain = (state === 'night' || h.finale) && h.hordeLeft >= 0 ? h.hordeLeft | 0 : -1;
    if (c.remain !== remain) {
      c.remain = remain;
      this.clkRemain.hidden = remain < 0;
      if (remain >= 0) this.clkRemainN.textContent = String(remain);
    }

    // arc progress through the current phase
    let len = phase === PHASE.NIGHT ? NIGHT_LENGTH : dayLength(day);
    if (h.timeLeft > len) len = h.timeLeft;
    let p = phase === PHASE.DAY || phase === PHASE.NIGHT ? 1 - (h.timeLeft || 0) / len : 0;
    p = Math.round(clamp(p, 0, 1) * 600) / 600;
    if (c.clkP !== p) {
      c.clkP = p;
      this.clkProg.style.strokeDashoffset = (100 - p * 100).toFixed(2);
      const a = Math.PI * p;
      const x = ARC.cx - ARC.rx * Math.cos(a);
      const y = ARC.cy - ARC.ry * Math.sin(a);
      this.clkBody.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    }
  },
};
