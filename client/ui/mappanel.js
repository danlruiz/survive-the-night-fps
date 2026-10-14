// The field map's panel (mapscreen.js), issue #225 "answers first": what the car still needs and every lead on each,
// the team, the schematics, and in a small window the same as chips. A click on any row centres the map on it.
// Methods laid onto MapScreen.
import { ZONE_NAMES, ITEM_DEFS, SCHEMATICS, SCHEM_BIT, supplyRumours } from '../../shared/defs.js';
import { SUPPLIES, SUPPLY_NEED, W } from '../game/act.js'; // (this act's)
import { el, svgEl, button } from './dom.js';
import { itemIcon, glyph } from './icons.js';
import { badge, setBadge, initial, fmtDist, dirOf, gridRef, placeAt } from './mapmarks.js';

export const mapPanelMethods = {
  // what the car still needs, and every lead on each: in your pack, on the ground, rumoured. -> [{ i, item, have,
  // need, carried, leads: [{ kind, x, z, d, title, sub }] (nearest first), none }], what you carry first, then the
  // nearest lead first, the ones nothing is known of last
  _leads(d, rumoured) {
    const { x: sx, z: sz } = d.self;
    const dist = (x, z) => Math.hypot(x - sx, z - sz);
    const out = [];
    SUPPLIES.forEach((item, i) => {
      const have = d.supplies[i] | 0;
      const need = SUPPLY_NEED[i];
      if (have >= need) return;
      const name = ITEM_DEFS[item].name;
      const leads = [];
      const carried = !!d.carried[item];
      if (carried) leads.push({ kind: 'car', x: d.car.x, z: d.car.z, d: dist(d.car.x, d.car.z), title: `${name} · in your pack`, sub: `Take it to the ${W.thing}` });
      for (const p of d.parts) {
        if (p.item !== item) continue;
        const pl = placeAt(this.world, p.x, p.z);
        const near = (pl && d.discovered.has(pl.id) ? 'near ' + ZONE_NAMES[pl.id] : 'in the open') + ' · ' + gridRef(this.world, p.x, p.z);
        leads.push({ kind: 'part', x: p.x, z: p.z, d: dist(p.x, p.z), title: `${name} · on the ground`, sub: near, short: 'on the ground ' + near });
      }
      for (const [zid, r] of rumoured) {
        if (!r.sup.includes(item)) continue;
        const z = this.world.zoneById[zid];
        const at = `${ZONE_NAMES[zid]}? · ${gridRef(this.world, z.x, z.z)}`;
        leads.push({ kind: 'sup', x: z.x, z: z.z, d: dist(z.x, z.z), title: `${name} · rumoured`, sub: at, short: 'or ' + at });
      }
      if (!carried) leads.sort((a, b) => a.d - b.d);
      const rum = supplyRumours(i, d.hints, d.found);
      out.push({ i, item, name, have, need, carried, leads, none: rum.found ? 'picked up · not in your pack' : 'nothing heard of one yet' });
    });
    out.sort((a, b) => b.carried - a.carried || (a.leads.length ? a.leads[0].d : 1e9) - (b.leads.length ? b.leads[0].d : 1e9));
    return out;
  },

  // the team, a downed mate first, then the nearest; and the waypoints. -> [{ kind, icon, x, z, d, title, sub }]
  _team(d) {
    const { x: sx, z: sz } = d.self;
    const where = (x, z) => {
      const pl = placeAt(this.world, x, z);
      return (pl ? (d.discovered.has(pl.id) ? ZONE_NAMES[pl.id] : 'an unknown place') : 'in the open') + ' · ' + gridRef(this.world, x, z);
    };
    const mates = d.mates
      .map((m) => {
        const down = m.status === 'downed';
        return { kind: down ? 'down' : 'mate', icon: down ? glyph('downed') : initial(m.name), x: m.x, z: m.z, d: Math.hypot(m.x - sx, m.z - sz), title: down ? `${m.name} · DOWN` : m.name, sub: where(m.x, m.z) + (down ? ' · needs a revive' : ''), name: m.name };
      })
      .sort((a, b) => (b.kind === 'down') - (a.kind === 'down') || a.d - b.d);
    const ways = [];
    if (d.waypoint) ways.push({ kind: 'way', icon: glyph('flag'), x: d.waypoint.x, z: d.waypoint.z, d: Math.hypot(d.waypoint.x - sx, d.waypoint.z - sz), title: 'Your waypoint', sub: where(d.waypoint.x, d.waypoint.z) });
    for (const t of d.teamWays) ways.push({ kind: 'teamway', icon: glyph('flag'), x: t.x, z: t.z, d: Math.hypot(t.x - sx, t.z - sz), title: `${t.names.join(', ')}’s waypoint`, sub: where(t.x, t.z) });
    return { mates, ways };
  },

  // a list of rows, kept between frames (only what changed is written). rows: [{ key, kind, icon, title, sub, d, dir,
  // x, z, cls }]; a click centres the map on (x, z)
  _rows(box, rows) {
    let pool = this.rowPools.get(box);
    if (!pool) this.rowPools.set(box, (pool = []));
    rows.forEach((r, i) => {
      let e = pool[i];
      if (!e) {
        const b = button('mx-row', box);
        const bd = badge('you', '', b);
        const t = el('span', 'mx-row-t', b);
        const title = el('b', '', t);
        const sub = el('span', '', t);
        const dd = el('span', 'mx-row-d', b);
        const dist = el('b', '', dd);
        const dir = el('span', '', dd);
        e = pool[i] = { b, bd, title, sub, dist, dir, c: '', at: null };
        b.addEventListener('click', () => e.at && this.centreOn(e.at.x, e.at.z));
      }
      const cls = 'mx-row' + (r.cls ? ' ' + r.cls : '') + (r.x === undefined ? ' static' : '');
      if (e.c !== cls) e.b.className = e.c = cls;
      setBadge(e.bd, r.kind, r.icon);
      if (e.title.textContent !== r.title) e.title.textContent = r.title;
      if (e.sub.textContent !== (r.sub || '')) e.sub.textContent = r.sub || '';
      const ds = r.d === undefined ? '' : fmtDist(r.d);
      if (e.dist.textContent !== ds) e.dist.textContent = ds;
      const dr = r.dir || '';
      if (e.dir.textContent !== dr) e.dir.textContent = dr;
      e.at = r.x === undefined ? null : { x: r.x, z: r.z };
      e.b.disabled = !e.at;
      if (e.b.hidden) e.b.hidden = false;
    });
    for (let i = rows.length; i < pool.length; i++) if (!pool[i].b.hidden) pool[i].b.hidden = true;
  },

  _panel(d, leads, team) {
    const { x: sx, z: sz } = d.self;
    const dirTo = (x, z) => dirOf(x - sx, z - sz);
    // the car: n / m supplies, a bar of them (installed, in your pack, still out there), a row a supply
    let have = 0;
    let need = 0;
    const segs = [];
    SUPPLIES.forEach((item, i) => {
      const h = Math.min(d.supplies[i] | 0, SUPPLY_NEED[i]);
      have += h;
      need += SUPPLY_NEED[i];
      const c = Math.min(SUPPLY_NEED[i] - h, d.carried[item] | 0);
      for (let k = 0; k < SUPPLY_NEED[i]; k++) segs.push(k < h ? 'in' : k < h + c ? 'pack' : '');
    });
    const cn = `${have} / ${need} ${W.supplies}`;
    if (this.carH.n.textContent !== cn) this.carH.n.textContent = cn;
    const sk = segs.join(',');
    if (this._segKey !== sk) {
      this._segKey = sk;
      this.carBar.textContent = '';
      for (const s of segs) el('i', s, this.carBar);
    }
    const rows = [];
    for (const L of leads) {
      const label = ITEM_DEFS[L.item].name + (L.need > 1 ? ` ${L.have}/${L.need}` : '');
      const first = L.leads[0];
      if (!first) {
        rows.push({ kind: 'part', icon: itemIcon(L.item), title: label, sub: L.none, cls: 'dim' });
        continue;
      }
      rows.push({ kind: first.kind === 'car' ? 'part' : first.kind === 'sup' ? 'sup' : 'part', icon: itemIcon(L.item), title: first.title.replace(ITEM_DEFS[L.item].name, label), sub: first.sub, d: first.d, dir: dirTo(first.x, first.z), x: first.x, z: first.z, cls: L.carried ? 'pack' : first.kind === 'sup' ? 'rumour' : 'ground' });
      // the other leads on the same supply, under it
      for (const o of L.leads.slice(1, 3)) rows.push({ kind: o.kind === 'sup' ? 'sup' : 'part', icon: itemIcon(L.item), title: o.short, d: o.d, dir: dirTo(o.x, o.z), x: o.x, z: o.z, cls: 'sub' });
    }
    if (!leads.length) rows.push({ kind: 'car', icon: glyph(W.glyph), title: `Every ${W.supplies === 'parts' ? 'part' : 'supply'} is in`, sub: `${W.The}: ${W.start}`, d: Math.hypot(d.car.x - sx, d.car.z - sz), dir: dirTo(d.car.x, d.car.z), x: d.car.x, z: d.car.z, cls: 'pack' });
    this._rows(this.carRows, rows);
    // what is in already, as a line of icons
    const doneKey = SUPPLIES.filter((it, i) => (d.supplies[i] | 0) >= SUPPLY_NEED[i]).join(',');
    if (this._doneKey !== doneKey) {
      this._doneKey = doneKey;
      this.carDone.textContent = '';
      if (doneKey) {
        for (const it of doneKey.split(',')) svgEl('i', 'mx-done-i', this.carDone, itemIcon(+it)).title = ITEM_DEFS[+it].name;
        el('span', '', this.carDone, 'installed');
      }
    }
    // the team
    const down = team.mates.filter((m) => m.kind === 'down').length;
    const tn = d.mates.length ? `${d.mates.length - down} up · ${down} down` : '';
    if (this.teamH.n.textContent !== tn) this.teamH.n.textContent = tn;
    const trows = team.mates.map((m) => ({ ...m, dir: dirTo(m.x, m.z), cls: m.kind === 'down' ? 'alarm' : '' }));
    if (!trows.length) trows.push({ kind: 'mate', icon: '–', title: 'On your own', sub: 'nobody else is out here', cls: 'dim' });
    for (const w of team.ways) trows.push({ ...w, dir: dirTo(w.x, w.z) });
    this._rows(this.teamRows, trows);
    // the schematics, in one row: found, rumoured (where), or not heard of
    const got = SCHEMATICS.filter((it) => d.unlocked & (1 << SCHEM_BIT[it])).length;
    const sn = `${got} / ${SCHEMATICS.length}`;
    if (this.schemH.n.textContent !== sn) this.schemH.n.textContent = sn;
    const sKey = JSON.stringify([d.schemHints, d.unlocked]);
    if (sKey !== this._schemKey) {
      this._schemKey = sKey;
      this.schemRow.textContent = '';
      SCHEMATICS.forEach((item, k) => {
        const has = !!(d.unlocked & (1 << SCHEM_BIT[item]));
        const zid = d.schemHints[k];
        const z = !has && zid !== 255 ? this.world.zoneById[zid] : null;
        const t = button('mx-schem' + (has ? ' got' : z ? ' rumour' : ' none'), this.schemRow);
        svgEl('i', 'mx-schem-i', t, itemIcon(item));
        el('span', '', t, has ? 'found' : z ? ZONE_NAMES[zid] : 'unknown');
        t.title = ITEM_DEFS[item].name + (has ? ' · found' : z ? ` · rumoured at ${ZONE_NAMES[zid]} (${gridRef(this.world, z.x, z.z)})` : ' · nothing heard of it yet');
        if (z) t.addEventListener('click', () => this.centreOn(z.x, z.z));
        else t.disabled = true;
      });
    }
    this._chips(d, leads, team, have, need, got);
  },

  // small windows: the panel as chips - the car (how many in, what is still out, how far), each teammate, the
  // waypoint, the schematics - each one a click to find it, like the rows
  _chips(d, leads, team, have, need, got) {
    const { x: sx, z: sz } = d.self;
    const chips = [];
    const carD = Math.hypot(d.car.x - sx, d.car.z - sz);
    chips.push({ kind: 'car', icon: glyph(W.glyph), text: `${have}/${need}`, d: carD, x: d.car.x, z: d.car.z, items: leads.map((L) => ({ item: L.item, pack: L.carried })) });
    for (const m of team.mates) chips.push({ kind: m.kind, icon: m.icon, text: m.kind === 'down' ? 'DOWN' : '', d: m.d, x: m.x, z: m.z, title: m.title, cls: m.kind === 'down' ? 'alarm' : '' });
    for (const w of team.ways) chips.push({ kind: w.kind, icon: w.icon, text: '', d: w.d, x: w.x, z: w.z, title: w.title });
    chips.push({ kind: 'schem', icon: '', text: `${got}/${SCHEMATICS.length}`, title: 'Schematics found', static: true });
    const pool = this._chipPool || (this._chipPool = []);
    chips.forEach((c, i) => {
      let e = pool[i];
      if (!e) {
        const b = button('mx-chip', this.chipList);
        const bd = badge('you', '', b);
        const items = el('span', 'mx-chip-items', b);
        const t = el('b', '', b);
        const dd = el('span', 'mx-chip-d', b);
        e = pool[i] = { b, bd, items, t, dd, c: '', ik: '', at: null };
        b.addEventListener('click', () => e.at && this.centreOn(e.at.x, e.at.z));
      }
      const cls = 'mx-chip' + (c.cls ? ' ' + c.cls : '');
      if (e.c !== cls) e.b.className = e.c = cls;
      setBadge(e.bd, c.kind, c.icon);
      const ik = c.items ? c.items.map((it) => it.item + (it.pack ? 'p' : '')).join(',') : '';
      if (e.ik !== ik) {
        e.ik = ik;
        e.items.textContent = '';
        for (const it of c.items || []) svgEl('i', it.pack ? 'pack' : '', e.items, itemIcon(it.item));
      }
      if (e.t.textContent !== c.text) e.t.textContent = c.text;
      const ds = c.d === undefined ? '' : fmtDist(c.d);
      if (e.dd.textContent !== ds) e.dd.textContent = ds;
      if (e.b.title !== (c.title || '')) e.b.title = c.title || '';
      e.at = c.static ? null : { x: c.x, z: c.z };
      if (e.b.hidden) e.b.hidden = false;
    });
    for (let i = chips.length; i < pool.length; i++) if (!pool[i].b.hidden) pool[i].b.hidden = true;
  },
};
