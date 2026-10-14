// Per-frame HUD. update(h) is called every frame: it diffs against cached values and only
// touches the DOM when a (rounded) value actually changed.
import { PHASE } from '../../shared/constants.js';
import { el, svgEl, clamp } from './dom.js';
import { glyph, splatSvg } from './icons.js';
import { Compass, CardsLine, Markers } from './hud2.js';
import { Objective, Tracked } from './objective.js';
import { Tonight } from './tonight.js';
import { Downed } from './endscreens.js';
import { Minimap } from './minimap.js';
import { bindLabel, bindTag, onBindsChange } from '../game/binds.js';
import { addMethods } from './mixin.js';
import { clockMethods } from './hud/clock.js';
import { centerMethods } from './hud/center.js';
import { vitalsMethods } from './hud/vitals.js';
import { weaponsMethods } from './hud/weapons.js';
import './ux-hud.css'; // (the corners, the one feed, the HUD size and the compact layout: issue #221)

// The layout (ux-hud.css): four corners - where (map, objective), when (clock), me and my team (vitals), hands
// (weapons) - and one feed down the right edge between the clock and the weapons. Each side's middle block (the
// feed, the chat) is held between what is measured above and below it, so it shrinks instead of overlapping.
// Compact: a short window, at the HUD size set, folds the lesser blocks (clock to a line, map smaller, feed to 3 rows)
const COMPACT_H = 600; // px tall (at HUD size 100%) under which the HUD goes compact
const COMPACT_W = 960; // ...or wide

export class Hud {
  // leftLayer: the top-left corner over the inventory, where the objective tracker sits (its slim form stays up while
  // the inventory is open)
  constructor(ui, layer, topLayer, clockLayer, leftLayer = layer) {
    this.ui = ui;
    this.c = Object.create(null); // diff cache
    this.root = layer;
    ui.root.classList.add('hud-b');

    // ---- world markers (nameplates, pings) sit under everything else
    this.markers = new Markers(layer);
    // ---- full-screen effect layers
    this.lowhp = el('div', 'fx-lowhp', layer);
    this.fire = el('div', 'fx-fire', layer); // set alight by a flammer: the flames at the edges of the eye
    this.blood = el('div', 'fx-blood', layer);
    this.splats = el('div', 'fx-splats', layer);
    this.zvig = el('div', 'fx-zombie', layer);

    // ---- top-left info
    const info = el('div', 'hud-info', layer);
    this.iSurv = el('span', 'hi-surv', info);
    svgEl('i', 'hi-ico', this.iSurv, glyph('people'));
    this.iSurvT = el('b', '', this.iSurv, '');
    this.iPing = el('span', 'hi-ping', info);
    svgEl('i', 'hi-ico', this.iPing, glyph('signal'));
    this.iPingT = el('b', '', this.iPing, '');
    this.iFps = el('span', 'hi-fps', info);
    svgEl('i', 'hi-ico', this.iFps, glyph('ecg'));
    this.iFpsT = el('b', '', this.iFps, '');
    this.iFps.hidden = true;

    // ---- minimap (top-left) and the objective tracker (left; under the minimap, slim)
    this.minimap = new Minimap(layer);
    this.objective = new Objective(leftLayer);
    this.objective.setSlim(true);
    this.tracked = new Tracked(leftLayer, this.objective.root); // (the recipe tracked from the crafting panel, under it)
    this.cardsLine = new CardsLine(leftLayer, [this.objective.root, this.tracked.root]); // (Dead Hand under way, under both)
    // ---- top-centre compass
    this.compass = new Compass(topLayer);
    this._buildClock(clockLayer);
    // ---- under it from the dusk horn to nightfall: what tonight brings
    this.tonight = new Tonight(clockLayer, ui.root);

    // ---- boss bar
    const boss = (this.boss = el('div', 'boss', topLayer));
    boss.hidden = true;
    const bn = el('div', 'boss-name', boss);
    svgEl('i', 'boss-ico', bn, glyph('bossSkull'));
    this.bossName = el('span', '', bn, '');
    svgEl('i', 'boss-ico', bn, glyph('bossSkull'));
    const bb = el('div', 'boss-bar', boss);
    this.bossLag = el('i', 'boss-lag', bb);
    this.bossFill = el('i', 'boss-fill', bb);
    el('i', 'boss-ticks', bb);

    this._buildCenter(layer);

    this._buildVitals(layer);

    this._buildWeapons(layer);

    // ---- downed overlay
    this.downed = new Downed(layer);

    this._buildZombie(layer);

    this._keys();
    onBindsChange(() => this._keys());

    // what the side columns' middle blocks are held between (_layout): measured when one of these changes size
    this._lay = 0;
    const relayout = () => this._relayout();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = (this._ro = new ResizeObserver(relayout));
      for (const e of [this.clock, this.tonight.root, this.weap, this.zpanel, this.vitals, this.minimap.root, this.objective.root, this.tracked.root]) if (e) ro.observe(e);
    }
    window.addEventListener('resize', relayout);
  }

  _relayout() {
    if (this._lay) return;
    this._lay = requestAnimationFrame(() => {
      this._lay = 0;
      this._layout();
    });
  }

  // the bottom of what is over each side's middle block and the top of what is under it, as CSS variables on the root
  // (px from the top / from the bottom of the window)
  _layout() {
    const vh = window.innerHeight;
    const r = (e) => (e && !e.hidden && e.offsetParent !== null ? e.getBoundingClientRect() : null);
    const below = (...els) => els.reduce((m, e) => Math.max(m, r(e)?.bottom || 0), 0);
    const above = (...els) => els.reduce((m, e) => Math.min(m, r(e)?.top ?? vh), vh);
    const ach = this.ui.root.querySelector('.ach-toasts'); // (an achievement's banner under the clock: made after the HUD)
    if (ach && !this._achRO) {
      this._achRO = true;
      this._ro?.observe(ach);
    }
    const rt = below(this.clock, this.tonight.root, ach && ach.childElementCount ? ach : null);
    const rb = vh - above(this.weap, this.zpanel);
    const lt = below(this.minimap.root, this.objective.root, this.tracked.root);
    const lb = vh - above(this.vitals);
    const st = this.ui.root.style;
    st.setProperty('--hud-rt', Math.round(rt) + 'px');
    st.setProperty('--hud-rb', Math.round(rb) + 'px');
    st.setProperty('--hud-lt', Math.round(lt) + 'px');
    st.setProperty('--hud-lb', Math.round(lb) + 'px');
  }

  // what names a key here: the weapon slots' key caps, what the heal key would use
  _keys() {
    this.slotEls.forEach((s, i) => (s.key.textContent = bindLabel('slot' + (i + 1)).replace('unbound', '–')));
    this.meds.title = `Healing items ${bindTag('heal')}`;
    this.drinks.title = `Energy drinks ${bindTag('drink')}`;
    this.c.dh = undefined;
  }

  // ------------------------------------------------------------ per-frame
  update(h) {
    const c = this.c;
    const zombie = !!h.zombie;

    if (c.zombie !== zombie) {
      c.zombie = zombie;
      this.ui.root.classList.toggle('is-zombie', zombie);
      this.hpIco.innerHTML = glyph(zombie ? 'claw' : 'cross');
      c.lowhp = undefined;
    }

    // ----- night factor (subtle HUD dimming)
    const nq = Math.round(clamp(h.night || 0, 0, 1) * 10) / 10;
    if (c.night !== nq) {
      c.night = nq;
      this.root.style.setProperty('--night', nq);
    }
    this._mode(h);

    this._clock(h);
    this.tonight.update(zombie || h.finale ? null : h.tonight || null);
    this._boss(h.boss);
    this._vitals(h, zombie);
    if (zombie) this._zombie(h);
    else this._weapons(h);
    this._center(h);
    this._info(h);
    this.compass.update(h.yaw || 0, h.compassMarks || []);
    this.minimap.setVisible(!!h.minimap);
    if (h.minimap) this.minimap.update(this.ui.map, h.minimap);
    this.objective.update(zombie ? null : h.objective);
    const showObj = !zombie && !!h.objective;
    if (c.objShow !== showObj) {
      c.objShow = showObj;
      this.objective.root.hidden = !showObj;
    }
    this.objective.syncTip();
    this.tracked.update(zombie ? null : h.tracked || null);
    this.cardsLine.update(h.cards || null);
    this.markers.update(h.worldMarks || []);
    this.downed.update(h.downed || null);
    this._team(zombie ? null : h.team || null);
  }

  // The HUD's modes, as classes on the root (ux-hud.css): its size (the HUD size setting), compact (a short window at
  // that size), and the night (the objective and the tracked recipe fold to a line, the feed keeps the team's deaths)
  _mode(h) {
    const c = this.c;
    const k = clamp(+this.ui.settings.hudScale || 1, 0.5, 2);
    if (c.hudK !== k) {
      c.hudK = k;
      this.ui.root.style.setProperty('--hud-k', k);
      c.compact = undefined;
    }
    const compact = window.innerHeight / k < COMPACT_H || window.innerWidth / k < COMPACT_W;
    if (c.compact !== compact) {
      c.compact = compact;
      this.ui.root.classList.toggle('hud-compact', compact);
      c.teamKey = c.teamRef = undefined;
      this._feedMode();
      this._relayout();
    }
    const night = h.phase === PHASE.NIGHT || !!h.finale;
    if (c.atNight !== night) {
      c.atNight = night;
      this.ui.root.classList.toggle('hud-night', night);
      this._feedMode();
      this._relayout();
    }
  }

  _feedMode() {
    this.ui.kf?.setMode?.({ rows: this.c.compact ? 3 : 8, teamOnly: !!this.c.atNight });
  }

  _boss(b) {
    const c = this.c;
    const show = !!b;
    if (c.bossShow !== show) {
      c.bossShow = show;
      this.boss.hidden = !show;
      this.ui.root.classList.toggle('has-boss', show);
    }
    if (!b) return;
    if (c.bossName !== b.name) this.bossName.textContent = c.bossName = b.name || '';
    const hp = Math.round(clamp(b.hp, 0, 1) * 1000) / 1000;
    if (c.bossHp !== hp) {
      c.bossHp = hp;
      this.bossFill.style.transform = `scaleX(${hp})`;
      this.bossLag.style.transform = `scaleX(${hp})`;
    }
  }

  _info(h) {
    const c = this.c;
    const p = h.players;
    const surv = p ? p.alive + '/' + p.total : '';
    if (c.surv !== surv) {
      c.surv = surv;
      this.iSurvT.textContent = surv;
      this.iSurv.hidden = !surv;
    }
    // (stalled: the link has gone quiet, and nothing done until it is back reaches the server)
    const ping = h.ping == null ? '' : h.stalled ? 'no signal' : Math.round(h.ping) + ' ms';
    if (c.ping !== ping) {
      c.ping = ping;
      this.iPingT.textContent = ping;
      this.iPing.hidden = !ping;
      this.iPing.classList.toggle('bad', !!h.stalled || h.ping > 150);
    }
    const showFps = !!this.ui.settings.showFps && !!h.fps;
    const fps = showFps ? Math.round(h.fps) + ' fps' : '';
    if (c.fps !== fps) {
      c.fps = fps;
      this.iFpsT.textContent = fps;
      this.iFps.hidden = !fps;
      this.iFps.classList.toggle('bad', h.fps < 30);
    }
  }

  damage(amount, angle) {
    const a = clamp(amount || 0, 0, 100);
    if (a <= 0) return;
    if (angle != null) this.dmgDir.hit(angle, a);
    const peak = clamp(0.28 + a / 45, 0.3, 1);
    this.blood.getAnimations().forEach((x) => x.cancel());
    this.blood.animate([{ opacity: peak }, { opacity: peak * 0.8, offset: 0.2 }, { opacity: 0 }], {
      duration: 700 + a * 16,
      easing: 'ease-out',
    });
    if (a >= 18) {
      const n = a >= 40 ? 2 : 1;
      for (let i = 0; i < n; i++) this._splat(a);
    }
  }

  _splat(a) {
    if (this.splats.childElementCount >= 6) this.splats.firstElementChild.remove();
    const s = document.createElement('div');
    s.className = 'splat';
    s.innerHTML = splatSvg((Math.random() * 4) | 0);
    // bias toward screen edges/corners
    const edge = Math.random();
    let x, y;
    if (edge < 0.5) {
      x = Math.random() < 0.5 ? -4 + Math.random() * 16 : 88 + Math.random() * 16;
      y = Math.random() * 100;
    } else {
      x = Math.random() * 100;
      y = Math.random() < 0.5 ? -6 + Math.random() * 16 : 86 + Math.random() * 18;
    }
    const size = 18 + a * 0.22 + Math.random() * 8;
    s.style.cssText = `left:${x}vw;top:${y}vh;width:${size}vmin;height:${size}vmin;transform:translate(-50%,-50%) rotate(${(Math.random() * 360) | 0}deg)`;
    this.splats.appendChild(s);
    const anim = s.animate(
      [
        { opacity: 0, transform: s.style.transform + ' scale(.6)' },
        { opacity: 0.95, transform: s.style.transform + ' scale(1)', offset: 0.06 },
        { opacity: 0.8, offset: 0.55 },
        { opacity: 0 },
      ],
      { duration: 2600 + a * 20, easing: 'ease-out', fill: 'forwards' },
    );
    anim.onfinish = () => s.remove();
  }
}

for (const methods of [clockMethods, centerMethods, vitalsMethods, weaponsMethods]) addMethods(Hud, methods);
