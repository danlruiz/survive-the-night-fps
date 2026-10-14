// Achievements on screen, as they happen (the list: shared/achievements.js; the page of them: achievements.js):
//   AchievementToasts  the banner that slides in at the top right when one unlocks: icon, name, what it was for,
//                      the tier's colour, a shine across it and, for the rare ones, a burst of confetti; for a lifetime
//                      count, the next step on it. A kind of the dead seen for the first time gets a card in the same
//                      frame and corner: its portrait, how to beat it and the key that opens its page (issue #220).
//                      Several at once queue up; each is up a few seconds, less while more are waiting. Settings turn
//                      the banners and the chime off; with reduced motion asked for there is no slide, shine or confetti.
import { el, svgEl, reducedMotion } from './dom.js';
import { glyph, achIcon } from './icons.js';
import { ZOMBIE_DEFS } from '../../shared/defs.js';
import { achievementsView } from '../net/achievements.js';
import { bindLabel } from '../game/binds.js';
import { TIER_NAME, GROUP_TAG, amount, nextOnCount, kindFacts, chips, dangerPips } from './books.js';

const SHOW_S = 4.2; // seconds a banner is up...
const SHOW_BUSY_S = 2.6; // ...while others wait behind it
const KIND_S = 6.5; // ...and a bestiary card (it has more to read)
const CONFETTI = 26;
const RARE = new Set(['gold', 'platinum']);
const isRare = (a) => RARE.has(a.tier) || !!a.secret;

export class AchievementToasts {
  constructor(ui, parent) {
    this.ui = ui;
    this.root = el('div', 'ach-toasts', parent);
    this.root.setAttribute('aria-live', 'polite');
    this.queue = [];
    this.cur = null;
    this.timer = 0;
  }

  // achievements just unlocked, in front of the player
  show(list) {
    const s = this.ui.settings;
    for (const a of list) {
      if (s.achBanners === false) {
        if (s.achSound !== false) this.ui.sound(isRare(a) ? 'achieve_rare' : 'achieve');
        continue;
      }
      this.queue.push(a);
    }
    if (!this.cur) this.next();
  }

  // kinds of the dead seen for the first time (shared/bestiary.js entries): a card each in the same corner. With the
  // banners off in the settings, a line in the toasts as before
  showKinds(list) {
    const key = bindLabel('bestiary');
    for (const e of list) {
      if (this.ui.settings.achBanners === false) {
        this.ui.notify(`New in the bestiary: ${e.name}. ${key === 'unbound' ? 'It is in the menu.' : `Press ${key} to read up on it.`}`, 'good', 4.5);
        continue;
      }
      this.queue.push({ kind: e });
    }
    if (!this.cur) this.next();
  }

  next() {
    clearTimeout(this.timer);
    if (this.cur) {
      const old = this.cur;
      old.classList.add('out');
      setTimeout(() => old.remove(), 450);
      this.cur = null;
    }
    const a = this.queue.shift();
    this.ui.root.classList.toggle('ach-on', !!a); // (the killfeed steps out of the way: ui2.css)
    if (!a) return;
    if (a.kind) return this.kindCard(a.kind);
    const rare = isRare(a);
    const t = (this.cur = el('div', `ach-toast tier-${a.tier}${rare ? ' rare' : ''}`, this.root));
    const ico = el('div', 'ach-t-ico', t);
    svgEl('i', '', ico, achIcon(a.icon));
    const txt = el('div', 'ach-t-txt', t);
    el('div', 'ach-t-kick', txt, a.secret ? 'Secret achievement unlocked' : `Achievement unlocked · ${TIER_NAME[a.tier] || ''}`);
    el('div', 'ach-t-name', txt, a.name);
    el('div', 'ach-t-desc', txt, a.desc);
    // a lifetime count: what the next step on it is, and how far along it the count is
    const nx = nextOnCount(a);
    if (nx) {
      const stats = achievementsView().stats || {};
      const have = Math.min(nx.goal, Math.max(stats[a.stat] || 0, a.goal));
      const row = el('div', 'bk-tnext', txt);
      el('span', 'bk-tnext-k', row, 'Next');
      el('b', 'bk-tnext-n', row, nx.name);
      el('i', '', el('span', 'bk-tnext-bar', row)).style.width = `${((have / nx.goal) * 100).toFixed(1)}%`;
      el('span', 'bk-tnext-v', row, `${amount(nx, have)} / ${amount(nx, nx.goal)}`);
    }
    el('i', 'ach-t-shine', t);
    if (rare && !reducedMotion()) this.confetti(t);
    if (this.ui.settings.achSound !== false) this.ui.sound(rare ? 'achieve_rare' : 'achieve');
    this.timer = setTimeout(() => this.next(), (this.queue.length ? SHOW_BUSY_S : SHOW_S) * 1000);
  }

  // a kind just seen: its portrait (if the book has drawn it: none is drawn mid-fight), what to do about it, and the key
  kindCard(e) {
    const d = ZOMBIE_DEFS[e.t];
    const f = kindFacts(e.t);
    const t = (this.cur = el('div', `ach-toast bk-tkind grp-${e.group}`, this.root));
    const pic = el('div', 'bk-tkind-pic', t);
    const src = this.ui.bestiary?.portrait?.(e.t, true);
    if (src) el('img', '', pic).src = src;
    else svgEl('i', '', pic, glyph('claw'));
    const txt = el('div', 'ach-t-txt', t);
    el('div', 'ach-t-kick', txt, `New in the bestiary · ${GROUP_TAG[e.group]}`);
    const nm = el('div', 'bk-tkind-top', txt);
    el('div', 'ach-t-name', nm, d.name);
    dangerPips(nm, f.danger);
    chips(txt, f.beat, 'beat', 2);
    el('div', 'ach-t-desc', txt, d.tipBrief || d.introBrief || e.tip);
    const key = bindLabel('bestiary');
    const k = el('div', 'bk-tkind-key', txt);
    if (key !== 'unbound') el('span', 'kbd sm', k, key);
    el('span', '', k, key === 'unbound' ? 'Its page is in the bestiary, in the menu' : 'read the whole page');
    el('i', 'ach-t-shine', t);
    this.timer = setTimeout(() => this.next(), (this.queue.length ? SHOW_BUSY_S + 1 : KIND_S) * 1000);
  }

  confetti(t) {
    const box = el('div', 'ach-confetti', t);
    for (let i = 0; i < CONFETTI; i++) {
      const c = el('i', '', box);
      const a = (i / CONFETTI) * Math.PI * 2 + Math.random() * 0.4;
      const d = 60 + Math.random() * 90;
      c.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
      c.style.setProperty('--dy', `${(Math.sin(a) * d * 0.6 - 20).toFixed(1)}px`);
      c.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
      c.style.setProperty('--d', `${(0.9 + Math.random() * 0.7).toFixed(2)}s`);
      c.style.setProperty('--h', String(Math.round(Math.random() * 360)));
    }
    setTimeout(() => box.remove(), 2000);
  }

  // the game they were for is gone (back to the splash): the ones still waiting go with it
  clear() {
    this.queue.length = 0;
  }
}
