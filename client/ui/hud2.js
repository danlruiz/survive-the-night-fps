// Iteration 2 HUD pieces: compass strip, world markers (teammate nameplates, pings, the car), damage direction
// arrows and the Dead Hand line. (The objective tracker and the tracked recipe: objective.js; the dusk card:
// tonight.js; Downed and the dawn lines: endscreens.js)
// Same conventions as hud.js: update() is called every frame and only touches the DOM on change.
//
// ---------------------------------------------------------------- what matters most (#272)
// Not everything on screen is equally important. In each phase the HUD and the menus follow one order, and the thing
// at the top is the loudest on screen: the biggest, the reddest, the one that moves or the one with room round it.
// A redesign of any screen says how it follows this order, and passes the greyscale test: take a screenshot, take the
// colour out, and the top item still stands out most. (A night can put ~120 of the dead on screen: README.)
//   Night:          a downed teammate > your own health and bleed-out > the wave and the boss > ammo > the rest
//   Day:            time to dusk > the objective > the compass > loot and [E] prompts
//   Final stand:    the car's (or the plane's) health > downed teammates > your own health
//   Menus:          one primary action per screen (inventory, cards, auction, loadouts), the rest quieter
// A teammate in danger is as loud as you are: a downed one gets a solid red plate, a pulsing compass chip that keeps
// its place over every other marker (Compass, RANK below), a red toast and an alarm (game/matedown.js).
import { el, svgEl, clamp } from './dom.js';
import { glyph } from './icons.js';
import { bindLabel } from '../game/binds.js';

const TAU = Math.PI * 2;
const wrapA = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;
const CARDINALS = [
  [0, 'N'],
  [Math.PI / 4, 'NE'],
  [Math.PI / 2, 'E'],
  [(3 * Math.PI) / 4, 'SE'],
  [Math.PI, 'S'],
  [(-3 * Math.PI) / 4, 'SW'],
  [-Math.PI / 2, 'W'],
  [-Math.PI / 4, 'NW'],
];
const PING_LABEL = ['Go here', 'Danger', 'Loot'];

// world bearing of (dx,dz): 0 = north (-Z), +90 deg = east (+X)
export const bearing = (dx, dz) => Math.atan2(dx, -dz);

// A survivor's health fraction as a class, for nameplates, the compass and the player list: 'crit' below 30%
// (where your own vitals turn red), 'hurt' below 60%. Negative = no health to show (downed, unknown).
export const healthTier = (f) => (f < 0 || f >= 0.6 ? '' : f < 0.3 ? ' crit' : ' hurt');

// ---------------------------------------------------------------- compass
// A marker may also carry `name` (what it is: shown before its label while you face it, and always for your
// waypoint), `d` (its distance in metres) and `pinEdge` (stays on the tape's end when out of view).
// When two markers would print over each other the one that matters more keeps its place and its text:
// a downed teammate or the car in the final stand, then by kind in this order - with whatever you are
// facing just behind your teammates - and between two of a kind the nearer one. (teamway: a teammate's waypoint)
const RANK = { ping: 1, way: 2, mate: 3, teamway: 5, crate: 6, car: 7, hint: 8, poi: 9 };
const RANK_FACING = 4;
const LABEL_GAP = 6; // px kept clear between two labels
const byRank = (a, b) => a.rank - b.rank || a.d - b.d;
const FULL = 0; // icon at its bearing, with its text when that fits under it (or a little to one side)
const ASIDE = 1; // icon moved aside by one icon's width, no text
const TICK = 2; // no room beside it either: a tick on the tape at its bearing

export class Compass {
  constructor(parent) {
    this.root = el('div', 'compass', parent);
    this.strip = el('div', 'cmp-strip', this.root);
    this.ticks = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const card = CARDINALS.find(([c]) => Math.abs(wrapA(c - a)) < 0.01);
      const t = el('i', 'cmp-tick' + (card ? (card[1].length === 1 ? ' major' : ' minor') : '') + (i === 0 ? ' north' : ''), this.strip);
      if (card) el('b', '', t, card[1]);
      this.ticks.push({ a, e: t });
    }
    el('i', 'cmp-center', this.root);
    this.pool = [];
    this.halfFov = 1.35; // radians shown on each side
    // strip width, kept current by a ResizeObserver: reading clientWidth every frame, after the HUD's
    // style writes, forced a synchronous style + layout pass per frame
    this.width = 0;
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => {
        this.width = this.root.clientWidth;
        this._font();
      }).observe(this.root);
    // label widths come from a canvas with the label's font, never from laying out the label itself
    this.probe = el('span', 'cmp-mk-lab cmp-probe', this.root);
    this.ctx = document.createElement('canvas').getContext('2d');
    this.textW = new Map();
    this.spacing = -1;
    document.fonts?.addEventListener?.('loadingdone', () => this._font()); // the web font replaces the fallback
    this.vis = []; // scratch: the markers on the tape this frame, in marker order...
    this.order = []; // ...and by rank
  }

  _font() {
    const cs = getComputedStyle(this.probe);
    this.ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    this.spacing = parseFloat(cs.letterSpacing) || 0;
    this.textW.clear();
  }

  _width(text) {
    let w = this.textW.get(text);
    if (w === undefined) {
      if (this.textW.size > 400) this.textW.clear(); // distances tick over as you walk
      w = this.ctx.measureText(text).width + this.spacing * text.length;
      this.textW.set(text, w);
    }
    return w;
  }

  // Where the label (width w) of a marker at x goes among those already placed (order[0..i)): under its
  // icon, or pushed off a label in its way by up to `slack`. NaN when there is no room for it.
  _labelAt(i, x, w, slack) {
    let at = x;
    for (let tries = 0; tries < 2; tries++) {
      let hit = null;
      for (let j = 0; j < i && !hit; j++) {
        const o = this.order[j];
        if (o.text && Math.abs(o.lx - at) < (o.w + w) / 2 + LABEL_GAP - 0.1) hit = o; // (a hair under what it is pushed to)
      }
      if (!hit) return at;
      at = hit.lx + (x >= hit.lx ? 1 : -1) * ((hit.w + w) / 2 + LABEL_GAP);
      if (Math.abs(at - x) > slack) break;
    }
    return NaN;
  }

  _iconFree(i, x, gap) {
    for (let j = 0; j < i; j++) {
      const o = this.order[j];
      if (o.lvl !== TICK && Math.abs(o.px - x) < gap - 0.5) return false;
    }
    return true;
  }

  // transforms are only rewritten when they change (standing still / not turning costs no style work)
  _moveTo(o, x) {
    const tx = `translateX(${x.toFixed(1)}px)`;
    if (o.tx !== tx) o.e.style.transform = o.tx = tx;
  }

  _marker(i) {
    let m = this.pool[i];
    if (!m) {
      const e = el('div', 'cmp-mk', this.root);
      const ico = el('i', 'cmp-mk-ico', e);
      const lab = el('span', 'cmp-mk-lab', e);
      m = { e, ico, lab, key: '', lkey: '', cls: '', dx: 0 };
      this.pool[i] = m;
    }
    return m;
  }

  // yaw: camera yaw (0 = facing -Z/north, positive = turning left/west). markers: [{bearing, kind, icon, label, cls,
  // hp (a teammate's health 0..1, optional)}]
  update(yaw, markers) {
    const heading = -yaw; // clockwise from north
    if (!this.width) this.width = this.root.clientWidth;
    if (this.spacing < 0) this._font();
    const W = this.width || 520;
    const toX = (a) => {
      const d = wrapA(a - heading);
      if (Math.abs(d) > this.halfFov) return null;
      return W / 2 + (d / this.halfFov) * (W / 2);
    };
    for (const t of this.ticks) {
      const x = toX(t.a);
      if (x === null) {
        if (!t.hidden) {
          t.e.style.visibility = 'hidden';
          t.hidden = true;
        }
        continue;
      }
      if (t.hidden) {
        t.e.style.visibility = '';
        t.hidden = false;
      }
      this._moveTo(t, x);
    }
    // which markers are on the tape, and which one you are facing
    const vis = this.vis;
    const order = this.order;
    let count = 0;
    let facing = null;
    let off = W * 0.045; // facing: the named marker nearest the centre mark, within this of it
    for (const mk of markers) {
      let x = toX(mk.bearing);
      let edge = '';
      if (x === null) {
        if (!mk.pinEdge) continue;
        // out of view: pinned just inside the tape's faded ends, with a chevron pointing the way round
        const right = wrapA(mk.bearing - heading) > 0;
        x = W * (right ? 0.87 : 0.13);
        edge = right ? ' edge edge-r' : ' edge edge-l';
      }
      const r = vis[count] || (vis[count] = {});
      order[count++] = r;
      r.mk = mk;
      r.x = x;
      r.edge = edge;
      r.rank = mk.cls === 'downed' || mk.cls === 'urgent' ? 0 : (RANK[mk.kind] ?? 10);
      r.d = mk.d || 0;
      if (mk.name && !edge && Math.abs(x - W / 2) < off) {
        off = Math.abs(x - W / 2);
        facing = r;
      }
    }
    order.length = count;
    if (facing && facing.rank > RANK_FACING) facing.rank = RANK_FACING;
    order.sort(byRank);
    // lay them out in that order: each takes the room it needs, the next ones fit around it
    const gap = Math.max(15, W * 0.036); // two icons nearer than this touch
    for (let i = 0; i < count; i++) {
      const r = order[i];
      const mk = r.mk;
      r.px = r.x;
      r.lvl = FULL;
      r.text = '';
      if (!this._iconFree(i, r.x, gap)) {
        // beside the nearest icon in its way, on its own side of it (pinned ones: towards the middle)
        let by = null;
        for (let j = 0; j < i; j++) if (order[j].lvl !== TICK && (!by || Math.abs(order[j].px - r.x) < Math.abs(by.px - r.x))) by = order[j];
        const side = r.edge ? (r.x < W / 2 ? 1 : -1) : r.x >= by.px ? 1 : -1;
        r.lvl = TICK;
        for (let k = 0; k < 2; k++) {
          const x = by.px + (k ? -side : side) * gap;
          // never further than one icon's width from where it belongs
          if (Math.abs(x - r.x) > gap + 0.5 || !this._iconFree(i, x, gap)) continue;
          r.px = x;
          r.lvl = ASIDE;
          break;
        }
        continue;
      }
      const short = mk.label || '';
      if (mk.name && !r.edge && (r === facing || mk.kind === 'way')) {
        const long = short ? mk.name + ' · ' + short : mk.name;
        const w = this._width(long);
        // a name has to fit inside the part of the tape that is not faded out
        if (r.px - w / 2 > W * 0.1 && r.px + w / 2 < W * 0.9 && this._labelAt(i, r.px, w, 0) === r.px) {
          r.text = long;
          r.w = w;
          r.lx = r.px;
          continue;
        }
      }
      if (short) {
        const w = this._width(short);
        const at = this._labelAt(i, r.px, w, gap * 0.7); // still plainly under its own icon
        if (!Number.isNaN(at)) {
          r.text = short;
          r.w = w;
          r.lx = at;
        }
      }
    }
    // write them out in marker order, so a marker keeps its element from frame to frame
    let n = 0;
    while (n < count) {
      const r = vis[n];
      const mk = r.mk;
      const edge = r.edge + (r.lvl === ASIDE ? ' aside' : r.lvl === TICK ? ' tick' : '');
      const m = this._marker(n++);
      const cls = 'cmp-mk k-' + mk.kind + (mk.cls ? ' ' + mk.cls : '') + healthTier(mk.hp ?? -1) + edge;
      if (m.cls !== cls) m.e.className = m.cls = cls;
      if (m.key !== mk.icon) m.ico.innerHTML = m.key = mk.icon;
      if (m.lkey !== r.text) m.lab.textContent = m.lkey = r.text;
      const dx = r.text ? Math.round(r.lx - r.px) : 0;
      if (m.dx !== dx) m.lab.style.transform = (m.dx = dx) ? `translateX(${dx}px)` : '';
      this._moveTo(m, r.px);
      if (m.e.hidden) m.e.hidden = false;
    }
    for (let i = n; i < this.pool.length; i++) if (!this.pool[i].e.hidden) this.pool[i].e.hidden = true;
  }
}

// ---------------------------------------------------------------- Dead Hand, with its screen shut
// One line on the left, under the field notes and the tracked recipe: the match under way (whose turn, and the
// seconds left on mine, pulsing while it is mine), the trade open, or a teammate's ask waiting for an answer, with the
// key that opens the screen. c (game/cards.js CardsClient.hud): { kind: 'match' | 'trade' | 'ask', name, mine, secs,
// what } or null. Only touches the page when something on it changed.
export class CardsLine {
  constructor(parent, above) {
    this.root = el('div', 'cdl scrap', parent);
    this.root.hidden = true;
    svgEl('i', 'cdl-ico', this.root, glyph('cards'));
    this.text = el('span', 'cdl-t', this.root);
    this.key = el('span', 'kbd sm cdl-k', this.root);
    this.above = above; // (what it sits under, the first of them on screen from the bottom up)
    this.c = { kind: '', name: '', mine: false, secs: -1, what: '', label: '' };
    const ro = new ResizeObserver(() => this._place());
    for (const a of above) ro.observe(a);
  }

  _place() {
    let top = 0;
    for (const a of this.above) if (!a.hidden && a.offsetHeight) top = Math.max(top, a.offsetTop + a.offsetHeight + 8);
    this.root.style.top = (top || this.above[0].offsetTop) + 'px';
  }

  update(h) {
    const c = this.c;
    if (!h) {
      if (!this.root.hidden) this.root.hidden = true;
      c.kind = '';
      return;
    }
    const label = bindLabel('cards');
    const secs = h.secs >= 0 ? Math.ceil(h.secs) : -1;
    if (c.kind === h.kind && c.name === h.name && c.mine === !!h.mine && c.secs === secs && c.what === (h.what || '') && c.label === label && !this.root.hidden) return;
    c.kind = h.kind;
    c.name = h.name;
    c.mine = !!h.mine;
    c.secs = secs;
    c.what = h.what || '';
    c.label = label;
    let t;
    if (h.kind === 'match') t = `Dead Hand vs ${h.name} · ${h.what || (h.mine ? 'your turn' : 'their turn')}${secs >= 0 ? ` ${secs} s` : ''}`;
    else if (h.kind === 'trade') t = `Trading with ${h.name}`;
    else t = h.what === 'trade' ? `${h.name} wants to trade` : `${h.name} wants to play Dead Hand`;
    this.text.textContent = t;
    this.key.textContent = label === 'unbound' ? 'Menu' : label;
    this.root.classList.toggle('mine', c.mine);
    this.root.classList.toggle('ask', h.kind === 'ask');
    this.root.hidden = false;
    this._place();
  }
}

// ---------------------------------------------------------------- world markers (DOM, projected each frame)
export class Markers {
  constructor(parent) {
    this.root = el('div', 'wmk-layer', parent);
    this.pool = [];
  }
  _get(i) {
    let m = this.pool[i];
    if (!m) {
      const e = el('div', 'wmk', this.root);
      const ico = el('i', 'wmk-ico', e);
      const txt = el('div', 'wmk-txt', e);
      const name = el('b', 'wmk-name', txt);
      const sub = el('span', 'wmk-sub', txt);
      const bar = el('i', 'wmk-bar', e);
      const fill = el('i', '', bar);
      m = { e, ico, name, sub, bar, fill, k: {} };
      this.pool[i] = m;
    }
    return m;
  }
  // list: [{kind, x, y (screen px), icon, name, sub, bar (0..1 or -1), cls, scale}]
  update(list) {
    let n = 0;
    for (const it of list) {
      const m = this._get(n++);
      const k = m.k;
      const bar = it.bar ?? -1;
      const cls = 'wmk k-' + it.kind + (it.cls ? ' ' + it.cls : '') + healthTier(bar); // the bar's colour follows its length
      if (k.cls !== cls) m.e.className = k.cls = cls;
      if (k.icon !== it.icon) m.ico.innerHTML = k.icon = it.icon || '';
      if (k.name !== it.name) m.name.textContent = k.name = it.name || '';
      if (k.sub !== it.sub) m.sub.textContent = k.sub = it.sub || '';
      if (k.bar !== bar) {
        k.bar = bar;
        m.bar.hidden = bar < 0;
        if (bar >= 0) m.fill.style.transform = `scaleX(${clamp(bar, 0, 1).toFixed(3)})`;
      }
      const tf = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px) translate(-50%,-100%) scale(${(it.scale ?? 1).toFixed(2)})`;
      if (k.tf !== tf) m.e.style.transform = k.tf = tf;
      if (m.e.hidden) m.e.hidden = false;
    }
    for (let i = n; i < this.pool.length; i++) if (!this.pool[i].e.hidden) this.pool[i].e.hidden = true;
  }
}

// ---------------------------------------------------------------- damage direction
export class DamageDir {
  constructor(parent) {
    this.root = el('div', 'dmgdir', parent);
    this.items = [];
    for (let i = 0; i < 4; i++) {
      const e = el('i', 'dd', this.root);
      this.items.push({ e, t: 0, a: 0 });
    }
    this.next = 0;
  }
  // angle: screen-relative (0 = in front / top, +pi/2 = right)
  hit(angle, amount) {
    const it = this.items[this.next++ % this.items.length];
    it.a = angle;
    it.e.style.setProperty('--a', angle.toFixed(3) + 'rad');
    it.e.getAnimations().forEach((x) => x.cancel());
    it.e.animate([{ opacity: clamp(0.45 + amount / 40, 0.5, 1) }, { opacity: 0 }], { duration: 900 + amount * 20, easing: 'ease-in' });
  }
}

export { PING_LABEL };
export { tonightBrief } from './tonight.js'; // (game.js and the sandbox read it from here)
