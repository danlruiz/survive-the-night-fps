// The middle of the HUD (hud.js): the crosshair, the hitmarker, the use ring, the shove meter, the prompt and what
// you look at. Methods laid onto Hud.
import { el, svgEl, fmtTime, parsePrompt, clamp, replay } from '../dom.js';
import { glyph } from '../icons.js';
import { DamageDir } from '../hud2.js';

export const centerMethods = {
  _buildCenter(layer) {
    // ---- centre: crosshair, hitmarker, use ring, prompt, context
    const center = el('div', 'hud-center', layer);
    this.xh = el('div', 'xh', center);
    for (const k of ['t', 'b', 'l', 'r']) el('i', 'xh-' + k, this.xh);
    el('i', 'xh-dot', this.xh);
    this.hm = svgEl(
      'div',
      'hm',
      center,
      '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M-9.5-9.5L-3.6-3.6M9.5-9.5L3.6-3.6M-9.5 9.5L-3.6 3.6M9.5 9.5L3.6 3.6"/></svg>',
    );
    this.killSkull = svgEl('div', 'hm-skull', center, glyph('skull'));
    this.useWrap = svgEl(
      'div',
      'use',
      center,
      '<svg class="use-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42" pathLength="100" transform="rotate(-90 50 50)"/></svg>',
    );
    this.useFg = this.useWrap.querySelector('.fg');
    this.useLabel = el('div', 'use-label', this.useWrap, '');
    this.useWrap.hidden = true;
    this.dmgDir = new DamageDir(center);

    // pinned by a leaper: the key to mash, which jolts with every press, over how far it has been shoved off (a crawler
    // on the face: the mouse, thrashed about; h.shoveText says which)
    this.shove = el('div', 'shove', center);
    const shoveRow = el('div', 'shove-row', this.shove);
    this.shoveKey = el('span', 'kbd', shoveRow, '');
    this.shoveT = el('span', 'shove-t', shoveRow, 'Mash to shove it off'); // (or, on fire: mash to put it out)
    this.shoveFill = el('i', '', el('div', 'shove-bar', this.shove));
    this.shove.hidden = true;

    // the prompt and what you look at (a wall's health) share one line under the aim point, off it
    const line = el('div', 'hud-line', center);
    this.prompt = el('div', 'prompt', line);
    this.promptKey = el('span', 'kbd', this.prompt, 'E');
    this.promptText = el('span', 'prompt-t', this.prompt, '');
    this.prompt.hidden = true;

    this.ctx = el('div', 'ctx scrap', line);
    line.prepend(this.ctx);
    this.ctx.hidden = true;
    const ch = el('div', 'ctx-head', this.ctx);
    this.ctxIco = el('i', 'ctx-ico', ch);
    this.ctxTitle = el('span', 'ctx-title', ch, '');
    this.ctxVal = el('span', 'ctx-val', ch, '');
    this.ctxBar = el('div', 'ctx-bar', this.ctx);
    this.ctxFill = el('i', '', this.ctxBar);
  },

  _center(h) {
    const c = this.c;
    const xh = h.crosshair || { spread: 6, visible: true };
    const vis = !!xh.visible && !this.ui.inventoryOpen;
    if (c.xhVis !== vis) {
      c.xhVis = vis;
      this.xh.classList.toggle('off', !vis);
    }
    const g = Math.round(clamp(xh.spread || 0, 0, 200) * 2) / 2;
    if (c.xhG !== g) {
      c.xhG = g;
      this.xh.style.setProperty('--g', g + 'px');
    }

    // interaction prompt
    const pr = h.prompt || null;
    if (c.prompt !== pr) {
      c.prompt = pr;
      if (pr) {
        const { key, text } = parsePrompt(pr);
        this.promptKey.textContent = key;
        this.promptKey.hidden = !key;
        this.promptText.textContent = text;
      }
      this.prompt.hidden = !pr;
    }

    // use progress ring
    const up = h.useProgress >= 0 ? Math.round(clamp(h.useProgress, 0, 1) * 200) / 200 : -1;
    if (c.use !== up) {
      if ((up >= 0) !== (c.use >= 0)) {
        this.useWrap.hidden = up < 0;
        if (up >= 0) replay(this.useWrap, 'in'); // (a held key: up on the frame it went down, with a pop - holdring.js)
      }
      c.use = up;
      if (up >= 0) this.useFg.style.strokeDashoffset = (100 - up * 100).toFixed(1);
    }
    const ul = up >= 0 ? h.useLabel || '' : '';
    if (c.useL !== ul) this.useLabel.textContent = c.useL = ul;
    // ...broken off short of done: red, a shake, what happened under it (a moment: game/holdring.js CANCEL_SHOWN)
    const ux = up >= 0 && h.useCancel > 0 ? h.useCancel : 0;
    if ((c.useX > 0) !== (ux > 0)) {
      this.useWrap.classList.toggle('cancel', ux > 0);
      if (ux) {
        this.useWrap.style.setProperty('--cancel-s', ux + 's');
        replay(this.useWrap, 'shake');
      }
    }
    c.useX = ux;

    // shove meter (pinned by a leaper)
    const sv = h.shove >= 0 ? Math.round(clamp(h.shove, 0, 1) * 100) / 100 : -1;
    if (c.shove !== sv) {
      if ((sv >= 0) !== (c.shove >= 0)) {
        this.shove.hidden = sv < 0;
        if (sv >= 0) replay(this.shove, 'in');
      }
      c.shove = sv;
      if (sv >= 0) this.shoveFill.style.transform = `scaleX(${sv})`;
    }
    if (c.shoveKey !== h.shoveKey) this.shoveKey.textContent = c.shoveKey = h.shoveKey;
    const st = h.shoveText || 'Mash to shove it off';
    if (c.shoveT !== st) this.shoveT.textContent = c.shoveT = st;
    const fire = !!h.onFire;
    if (c.onFire !== fire) this.ui.root.classList.toggle('on-fire', (c.onFire = fire));
    if (c.shoves !== h.shoves) {
      c.shoves = h.shoves;
      if (sv >= 0) replay(this.shoveKey, 'hit');
    }

    this._context(h.context);
  },

  _context(ctx) {
    const c = this.c;
    const type = ctx ? ctx.type : null;
    if (c.ctxType !== type) {
      c.ctxType = type;
      c.ctxA = c.ctxB = c.ctxC = undefined;
      this.ctx.hidden = !type;
      this.ctx.className = 'ctx scrap' + (type ? ' ctx-' + type : '');
      if (type === 'campfire') {
        this.ctxIco.innerHTML = glyph('campfire');
        this.ctxTitle.textContent = 'Campfire';
      } else if (type === 'structure') {
        this.ctxIco.innerHTML = glyph('hammer');
      } else if (type === 'fair') {
        this.ctxIco.innerHTML = glyph('fuel');
        this.ctxTitle.textContent = 'Fair generator';
      }
    }
    if (!ctx) return;
    if (type === 'campfire') {
      const fuel = Math.max(0, Math.ceil(ctx.fuel || 0));
      if (c.ctxA !== fuel) {
        c.ctxA = fuel;
        this.ctxVal.textContent = fuel > 0 ? fmtTime(fuel) : 'Out';
        const r = Math.round(clamp(fuel / (ctx.max || 1), 0, 1) * 300) / 300;
        this.ctxFill.style.transform = `scaleX(${r})`;
        this.ctx.classList.toggle('warn', fuel > 0 && r < 0.2);
        this.ctx.classList.toggle('dead', fuel <= 0);
      }
    } else if (type === 'structure') {
      if (c.ctxB !== ctx.name) this.ctxTitle.textContent = c.ctxB = ctx.name || 'Structure';
      const r = Math.round(clamp(ctx.hp, 0, 1) * 100) / 100;
      if (c.ctxA !== r) {
        c.ctxA = r;
        this.ctxVal.textContent = Math.round(r * 100) + '%';
        this.ctxFill.style.transform = `scaleX(${r})`;
        this.ctx.classList.toggle('warn', r < 0.35);
      }
    } else if (type === 'fair') {
      // the Tri-County Fair's generator (client/game/fair.js): running or not, and the fuel in its tank
      const fuel = Math.max(0, Math.ceil(ctx.fuel || 0));
      const key = ctx.running ? fuel : -1 - fuel;
      if (c.ctxA !== key) {
        c.ctxA = key;
        this.ctxVal.textContent = ctx.running ? 'Running · ' + fmtTime(fuel) : fuel > 0 ? 'Off · ' + fmtTime(fuel) : 'Off';
        this.ctxFill.style.transform = `scaleX(${Math.round(clamp(fuel / (ctx.max || 1), 0, 1) * 300) / 300})`;
        this.ctx.classList.toggle('warn', ctx.running && fuel < 30);
        this.ctx.classList.toggle('dead', !ctx.running);
      }
    }
  },

  // ------------------------------------------------------------ events
  hitmarker(headshot, kill) {
    const hm = this.hm;
    hm.classList.toggle('hs', !!headshot);
    hm.classList.toggle('kill', !!kill);
    hm.getAnimations().forEach((a) => a.cancel());
    const s0 = headshot ? 1.5 : 1.15;
    hm.animate(
      [
        { opacity: 1, transform: `translate(-50%,-50%) scale(${s0})` },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.35 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' },
      ],
      { duration: kill ? 420 : headshot ? 320 : 240, easing: 'ease-out' },
    );
    if (kill) {
      const k = this.killSkull;
      k.classList.toggle('hs', !!headshot);
      k.getAnimations().forEach((a) => a.cancel());
      k.animate(
        [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)' },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.18 },
          { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.6 },
          { opacity: 0, transform: 'translate(-50%,-62%) scale(.9)' },
        ],
        { duration: 700, easing: 'ease-out' },
      );
    }
  },
};
