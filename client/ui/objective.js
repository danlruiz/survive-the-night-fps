// The HUD's objective tracker ("field notes": what the car or the plane still needs, and where) and, under it, the
// recipe tracked from the crafting panel. Same conventions as hud.js: update() every frame, the DOM touched on change.
import { ITEM_DEFS, ZONE_NAMES, supplyRumours } from '../../shared/defs.js';
import { SUPPLIES, SUPPLY_NEED, W, ACT_NOW } from '../game/act.js'; // (this act's: the car's supplies, or the plane's parts)
import { WORLD, RUNWAY } from '../../shared/acts.js';
import { PHASE, DUSK_WARNING } from '../../shared/constants.js';
import { el, svgEl, fmtTime } from './dom.js';
import { itemIcon, glyph } from './icons.js';
import { bindTag } from '../game/binds.js';
import { trackStatus } from '../game/tracked.js';


export class Objective {
  constructor(parent) {
    this.root = el('div', 'obj scrap', parent);
    const head = (this.head = el('div', 'obj-head', this.root));
    this.hIco = svgEl('i', 'obj-hico', head, glyph('car'));
    this.hTitle = el('span', 'obj-title', head, 'Escape');
    // one pip per supply the car still needs
    const pips = el('span', 'obj-pips', head);
    this.pips = Array.from({ length: SUPPLY_NEED.reduce((a, b) => a + b, 0) }, () => el('i', '', pips));
    this.hCount = el('span', 'obj-count', head, '');
    this.directive = el('div', 'obj-dir', this.root, '');
    // the far goal (issue #269): on the island, that the car is not the end of the run
    this.next = el('div', 'obj-next', this.root, '');
    this.list = el('div', 'obj-list', this.root);
    this.rows = SUPPLIES.map((item, i) => {
      const r = el('div', 'obj-row', this.list);
      svgEl('i', 'obj-ico', r, itemIcon(item));
      const name = el('span', 'obj-name', r, ITEM_DEFS[item].name + (SUPPLY_NEED[i] > 1 ? 's' : ''));
      const where = el('span', 'obj-where', r, '');
      const st = el('span', 'obj-st', r, '');
      svgEl('i', 'obj-box', r, glyph('check')); // ticked off once it is in the car
      return { r, name, where, st, key: '', tip: null };
    });
    this.key = '';
    this.done = -1;
    this.act = ACT_NOW;
    // slim (under the minimap): the supplies are a row of icons, and a pointer over one says what it is and where.
    // (The pointer is only free with a menu up: the slim tracker stays over the inventory for that.) The tip sits
    // outside the torn paper, whose mask would cut it off
    this.slim = false;
    this.headTip = { name: 'Escape', body: '' };
    this.tip = el('div', 'obj-tip', parent);
    this.tip.hidden = true;
    this.tipName = el('b', 'obj-tip-name', this.tip);
    this.tipBody = el('span', 'obj-tip-body', this.tip);
    this.tipFor = null;
    this.root.addEventListener('pointerover', (e) => this._hover(e.target.closest('.obj-row, .obj-head')));
    this.root.addEventListener('pointerout', (e) => {
      if (!this.root.contains(e.relatedTarget)) this._hover(null);
    });
  }

  setSlim(on) {
    this.slim = !!on;
    this.root.classList.toggle('slim', this.slim);
    if (!this.slim) this._hover(null);
  }

  // every frame: the tip goes when its icon does, or when the pointer is taken back (closing the inventory locks it
  // where it stands, and no pointerout comes then)
  syncTip() {
    if (this.tipFor && (document.pointerLockElement || this.root.hidden || !this.tipFor.matches(':hover'))) this._hover(null);
  }

  _hover(row) {
    const tip = !this.slim || !row ? null : row === this.head ? this.headTip : this.rows.find((x) => x.r === row)?.tip;
    this.tipFor = tip ? row : null;
    if (!tip) {
      this.tip.hidden = true;
      return;
    }
    this.tipName.textContent = tip.name;
    this.tipBody.textContent = tip.body;
    const r = row.getBoundingClientRect();
    this.tip.style.left = r.left + 'px';
    this.tip.style.top = r.bottom + 6 + 'px';
    this.tip.hidden = false;
  }

  // the act changed (the mainland: the plane's parts take the car's supplies' rows)
  setAct() {
    this.act = ACT_NOW;
    this.hIco.innerHTML = glyph(W.glyph);
    SUPPLIES.forEach((item, i) => {
      const row = this.rows[i];
      row.r.querySelector('.obj-ico').innerHTML = itemIcon(item);
      row.name.textContent = ITEM_DEFS[item].name + (SUPPLY_NEED[i] > 1 ? 's' : '');
      row.key = '';
    });
    this.key = '';
    this.done = -1;
  }

  update(o) {
    if (!o) return;
    if (this.act !== ACT_NOW) this.setAct();
    const key = JSON.stringify(o);
    if (key === this.key) return;
    this.key = key;
    let done = 0;
    let total = 0;
    SUPPLIES.forEach((item, i) => {
      const need = SUPPLY_NEED[i];
      const have = o.supplies[i] | 0;
      total += need;
      done += Math.min(need, have);
      const row = this.rows[i];
      const carried = o.carried[item] | 0;
      const loose = o.loose?.[item] | 0;
      const complete = have >= need;
      let where;
      if (complete) where = 'installed';
      else if (carried) where = 'in your pack';
      else if (loose) where = 'on the ground';
      else {
        // the places it is still rumoured to be in (a rumour keeps its question mark, as on the map); none left
        // because every one has been picked up: it is in somebody's hands, or lying where they left it
        const rum = supplyRumours(i, o.hints, o.found);
        if (!rum.zones.length) where = rum.found ? 'found' : 'somewhere out there';
        else where = need > 1 ? rum.zones.map((z) => ZONE_NAMES[z]).join(' · ') : ZONE_NAMES[rum.zones[0]] + '?';
      }
      const st = need > 1 && !complete ? `${have}/${need}` : '';
      const k = where + '|' + st + '|' + complete + '|' + carried;
      if (row.key === k) return;
      row.key = k;
      // the slim tracker's hover text: the name, then where it is in words
      let body;
      if (complete) body = `Installed in the ${W.thing}.`;
      else if (carried) body = `In your pack: take ${carried > 1 ? 'them' : 'it'} to the ${W.thing} and install ${carried > 1 ? 'them' : 'it'}.`;
      else if (loose) body = 'Dropped on the ground, or left where a survivor fell: it is marked on the map.';
      else {
        const rum = supplyRumours(i, o.hints, o.found);
        if (rum.zones.length) body = `Rumoured to be at ${rum.zones.map((z) => ZONE_NAMES[z]).join(', ')}.`;
        else if (rum.found) body = 'Already picked up: a survivor has it, or it was dropped somewhere.';
        else body = `Nobody knows where yet. Search ${W.where}.`;
      }
      row.tip = { name: ITEM_DEFS[item].name + (need > 1 ? `s · ${Math.min(have, need)} of ${need} in the ${W.thing}` : ''), body };
      row.where.textContent = where;
      row.st.textContent = st;
      row.r.classList.toggle('done', complete);
      row.r.classList.toggle('carried', !!carried && !complete);
      row.r.classList.toggle('wrap', where.length > 26); // a long list of places gets a line of its own
    });
    if (this.done !== done) {
      this.done = done;
      this.hCount.textContent = `${done}/${total}`;
      this.pips.forEach((p, i) => p.classList.toggle('on', i < done));
    }
    // what to do right now
    let dir = '';
    let tone = '';
    const plane = this.act === WORLD.MAINLAND;
    if (o.finale) {
      if (o.escapeReady && o.runwayBlocked) {
        // (the plane's stand: warm, but it will not go with the dead on the runway ahead of it)
        dir = `The dead are on the runway. Clear it: the plane cannot take off with more than ${RUNWAY.CLEAR} of them in its way.`;
        tone = 'danger';
      } else if (o.escapeReady) {
        // nothing ends the run but a survivor driving, and whoever is not at the car then stays behind
        dir = o.escapeLeaving ? `Someone is getting in: be at the ${W.thing} or be left behind!` : `The ${plane ? 'engines are' : 'engine is'} running. Hold ${bindTag('interact')} at the ${W.thing} to ${W.go}.`;
        tone = 'good';
      } else if (o.escapeStalled) {
        dir = plane ? (o.standWarm ? 'The engines falter: get back to the plane' : 'The pump stops: get back to the fuel truck') : 'The engine stalls: get back to the car';
        tone = 'danger';
      } else {
        dir = plane ? (o.standWarm ? `Defend the plane · engines warm in ${fmtTime(o.escapeT)}` : `Hold the fuel truck · tanks full in ${fmtTime(o.escapeT)}`) : `Defend the car · engine ready in ${fmtTime(o.escapeT)}`;
        tone = 'danger';
      }
    } else if (o.suppliesDone) {
      dir = plane ? `Every part is in. Hold ${bindTag('interact')} at the plane to start fuelling - then hold the truck, the plane and the runway.` : `Every supply is in. Hold ${bindTag('interact')} at the car to start the engine - then survive the final stand.`;
      tone = 'good';
    } else if (o.phase === PHASE.NIGHT) {
      dir = `Survive the night · wave ${o.wave}/${o.waves}`;
      tone = 'night';
    } else if (o.phase === PHASE.DAY && o.timeLeft <= DUSK_WARNING) {
      dir = `Nightfall in ${fmtTime(o.timeLeft)} - build a shelter where you stand`;
      tone = 'danger';
    } else if (o.anyCarried) {
      dir = `Bring the ${W.supplies} you carry back to the ${W.thing}`;
      tone = 'good';
    } else if (o.phase === PHASE.DAY) {
      dir = `Scavenge and find the ${W.parts} before dark`;
    }
    this.directive.textContent = dir;
    this.directive.className = 'obj-dir' + (tone ? ' dir-' + tone : '');
    this.directive.hidden = !dir;
    const next = plane ? '' : 'Then: drive over the old bridge to the mainland, where the airfield is.';
    this.next.textContent = next;
    this.next.hidden = !next;
    this.root.classList.toggle('compact', o.phase === PHASE.NIGHT || o.finale);
    this.headTip.body = `${done} of ${total} ${W.parts} are in the ${W.thing}. Install them all, ${W.start} and ${W.go}.` + (dir ? `\n\nNow: ${dir}` : '') + (next ? `\n\n${next}` : '');
    if (this.tipFor) this._hover(this.tipFor); // (what it says may just have changed)
  }
}

// ---------------------------------------------------------------- the recipe tracked from the crafting panel
// Right under the objective tracker (however tall that is): its checklist, ticking off as things are picked up, and
// where to get the first thing still short - or, with everything in hand, where to craft it.
export class Tracked {
  constructor(parent, above) {
    this.root = el('div', 'trk scrap', parent);
    this.root.hidden = true;
    const head = el('div', 'trk-head', this.root);
    svgEl('i', 'trk-flag', head, glyph('flag'));
    this.name = el('span', 'trk-name', head);
    el('span', 'trk-tag', head, 'Tracked');
    this.list = el('div', 'trk-list', this.root);
    this.foot = el('div', 'trk-foot', this.root);
    this.key = '';
    this.above = above;
    new ResizeObserver(() => this._place()).observe(above);
  }

  _place() {
    const a = this.above;
    this.root.style.top = (a.hidden ? a.offsetTop : a.offsetTop + a.offsetHeight + 8) + 'px';
  }

  // t: { r (the recipe), counts (item -> carried), near ({ fire, bench }), unlocked } or null for nothing tracked
  update(t) {
    if (!t) {
      if (!this.root.hidden) this.root.hidden = true;
      this.key = '';
      return;
    }
    const st = trackStatus(t.r, t.counts, t.near, t.unlocked);
    const key = JSON.stringify([t.r.id, st.ings.map((g) => [g.have, g.ok]), st.station?.ok, st.schem?.ok]);
    if (key === this.key) return;
    this.key = key;
    this.name.textContent = ITEM_DEFS[t.r.out].name;
    this.list.textContent = '';
    const row = (ok, name, val) => {
      const r = el('div', 'trk-row' + (ok ? ' ok' : ''), this.list);
      svgEl('i', 'trk-box', r, ok ? glyph('check') : '');
      el('span', 'trk-n', r, name);
      el('span', 'trk-v', r, val);
    };
    for (const g of st.ings) row(g.ok, g.name, `${Math.min(g.have, 999)} / ${g.need}`);
    if (st.station) row(st.station.ok, `At a ${st.station.name.toLowerCase()}`, st.station.ok ? 'here' : '—');
    if (st.schem) row(st.schem.ok, st.schem.name, st.schem.ok ? 'found' : 'not found');
    let foot;
    let tone = '';
    if (st.ready) {
      foot = `Ready: craft it now ${bindTag('inventory')}`;
      tone = 'good';
    } else if (st.mats && st.schem?.ok !== false) {
      foot = `Ready: craft at a ${st.station.name.toLowerCase()}`;
      tone = 'good';
    } else if (st.src) foot = `${st.src.name}: ${(st.src.where || 'nowhere known').replace(/^./, (c) => c.toLowerCase())}`;
    else foot = 'Find the schematic in lockers, crates or toolboxes';
    this.foot.textContent = foot;
    this.foot.className = 'trk-foot' + (tone ? ' ' + tone : '');
    this.root.hidden = false;
    this._place();
  }
}
