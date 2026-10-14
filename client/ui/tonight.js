// The dusk card (hud.js): what tonight brings, under the clock from the dusk horn until nightfall.
import { ZOMBIE_DEFS } from '../../shared/defs.js';
import { BOSS_WAVE, MOON } from '../../shared/constants.js';
import { nightBoss, nightTheme, kindsJoining } from '../../shared/nights.js';
import { el, svgEl, replay } from './dom.js';
import { glyph } from './icons.js';

// the kinds of the dead that join the horde on night n: one a night, in the order drawn from the seed
// (shared/nights.js kindsJoining; on the mainland every night ranks the fourth at the least)
function newKinds(seed, night, act) {
  return kindsJoining(seed, night, act).map((t) => ZOMBIE_DEFS[t]).filter((d) => d.intro);
}

// What tonight brings, one row a thing: its moon, its theme, the kinds that join the horde, its boss. A name and a few
// words on what to do about it (the dawn card had the long version). Worked out from the seed like the dawn card's,
// but for the moon: the server picks that at the horn, off how the team is doing (global.moon, server/director.js)
export function tonightBrief(seed, night, act, moon = MOON.NORMAL) {
  const rows = [];
  if (moon === MOON.BLOOD) rows.push({ kind: 'blood', ico: 'moon', name: 'Blood Moon', tag: 'Hard night', text: 'More of them, and no let-up. Dig in together.' });
  else if (moon === MOON.CLEAR) rows.push({ kind: 'clear', ico: 'moon', name: 'Clear Moon', tag: 'Calm night', text: 'A bright moon and breathers between waves. Regroup.' });
  const th = nightTheme(seed, night, act);
  if (th) rows.push({ kind: 'theme', ico: 'horde', name: th.name, tag: '', text: th.brief || th.warn });
  for (const d of newKinds(seed, night, act)) rows.push({ kind: 'new', ico: 'claw', name: d.name + 's', tag: 'New', text: d.introBrief || d.intro });
  const zd = ZOMBIE_DEFS[nightBoss(seed, night, act)];
  rows.push({ kind: 'boss', ico: 'skull', name: zd.name, tag: `Boss · wave ${BOSS_WAVE + 1}`, text: zd.tipBrief || zd.tip || '' });
  return rows;
}

const TONIGHT_OPEN = 12; // s the card shows its rows in full when it comes up; after that, their names alone until dark

// Under the clock from the dusk horn until nightfall (the clock says "The horde is coming"; this says what with). It
// comes up in full, a row at a time, then folds down to the names; a survivor who joins in the dusk gets it the same.
// It replaces the four lines the horn used to put across the bottom of the screen
export class Tonight {
  // uiRoot: the HUD's root, which it tells how tall it is (--tonight-h): the killfeed and the achievement banner
  // under the clock step down out of its way (ui2.css)
  constructor(parent, uiRoot) {
    this.uiRoot = uiRoot;
    this.root = el('div', 'tonight scrap', parent);
    this.root.hidden = true;
    el('div', 'tn-head', this.root, 'Tonight');
    this.list = el('div', 'tn-list', this.root);
    this.key = '';
    this.h = -1;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this._room()).observe(this.root);
  }

  // brief: { key, rows } (Game.tonight, the same object every frame while it holds), or null: no card
  update(brief) {
    const key = brief ? brief.key : '';
    if (key === this.key) return;
    this.key = key;
    clearTimeout(this._t);
    if (!brief) {
      if (this.root.hidden) return;
      this.root.classList.add('out');
      this._t = setTimeout(() => (this.root.hidden = true), 500);
      return;
    }
    this.list.textContent = '';
    brief.rows.forEach((r, i) => {
      const row = el('div', 'tn-row tn-' + r.kind, this.list);
      row.style.setProperty('--i', i);
      const top = el('div', 'tn-top', row);
      svgEl('i', 'tn-ico', top, glyph(r.ico));
      el('span', 'tn-name', top, r.name);
      if (r.tag) el('span', 'tn-tag', top, r.tag);
      el('div', 'tn-text', el('div', 'tn-brief', row), r.text);
    });
    this.root.classList.remove('out');
    this.root.hidden = false;
    replay(this.root, 'open');
    this._t = setTimeout(() => this.root.classList.remove('open'), TONIGHT_OPEN * 1000);
  }

  _room() {
    const h = this.root.offsetHeight;
    if (h === this.h) return;
    this.h = h;
    this.uiRoot.style.setProperty('--tonight-h', h + 'px');
    this.uiRoot.classList.toggle('tonight-on', h > 0);
  }
}
