// The crafting column of the inventory screen (I). Recipes are listed by whether they can be made right now: first
// "For what you carry" (the ready ones that feed what you hold: ammunition for your guns, a heal while hurt, your
// throwable, what the tracked recipe still needs - each with why, and a Craft button), then the rest ready (with how
// many), needs a station (the materials are there), missing materials, locked (a schematic nobody has found). On the
// All tab a group's head folds it away; those after the ready ones start folded.
// The one selected has a detail panel: what it makes, the have / need list with where to get what is short, a quantity
// and Craft, and Track on HUD (game/tracked.js). Q / E step through the tabs, Space crafts, and Shift / Ctrl (Cmd) +
// click on a recipe still crafts CRAFT_FEW / up to CRAFT_MAX at once. (No search and no "Ready only" switch: players
// never used them.)
import { ITEM, ITEM_DEFS, WEAPONS, RECIPES, STATION_NAMES, SCHEM_BIT, CONSUMABLES, isFirearm } from '../../shared/defs.js';
import { CRAFT_FEW, CRAFT_MAX, craftRun, copyInv, planFor } from '../game/bulkcraft.js';
import { planCost } from '../../shared/autocraft.js';
import { trackedId, setTracked, onTracked } from '../game/tracked.js';
import { foundIn, sourcesOf } from '../game/itemguide.js';
import { el, svgEl, clamp, lsGet, lsSet } from './dom.js';
import { itemIcon, glyph } from './icons.js';
import { CAT_LABEL, statLines, costLine } from './iteminfo.js';

// left to right (Q / E step through them); 'all' lists every recipe
const CRAFT_TABS = [
  { id: 'all', label: 'All' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'throw', label: 'Throw' },
  { id: 'armor', label: 'Armor' },
  { id: 'med', label: 'Meds' },
  { id: 'util', label: 'Utility' },
];
const TAB_KEY = 'stn.craftTab';
const FOLD_KEY = 'stn.craftFold'; // the groups folded away: their ids, comma-separated
const FOLD_START = 'station,missing,locked';
const CARRY_MAX = 6; // "For what you carry" lists this many at the most
const STATION_GLYPH = { fire: 'campfire', bench: 'wrench' };
// Bulk crafting: Shift+click a recipe for CRAFT_FEW, Ctrl+click for as many as the materials allow. On a Mac the
// second key is Cmd as well: there Ctrl+click is the context-menu gesture and the browser never sends the click
// (Ctrl still works, through that contextmenu event).
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
const MAX_KEY = IS_MAC ? 'Cmd' : 'Ctrl';
// ms a craft counts as on its way to the server before it is given up on: two slow round trips
const SENT_TTL = 2500;

// The list's groups, in order. Each recipe is in exactly one: what stops it, or that nothing does
const GROUPS = [
  { id: 'carry', label: 'For what you carry', aside: 'one click crafts' },
  { id: 'ready', label: 'Ready to craft', aside: 'here, now' },
  { id: 'station', label: 'Needs a station', aside: 'you have the materials' },
  { id: 'missing', label: 'Missing materials', aside: '' },
  { id: 'locked', label: 'Locked', aside: 'needs a schematic' },
];

// Which tab a recipe's output belongs to. The hammer is a build tool rather than a weapon, the backpack is worn as
// armor is, and consumables split into medicine (anything that heals) and utility (torches, batteries), which shares a
// tab with the raw materials.
function craftTab(item) {
  const cat = ITEM_DEFS[item]?.cat;
  if (item === ITEM.HAMMER) return 'util';
  if (cat === 'pack') return 'armor';
  if (cat === 'cons') return CONSUMABLES[item]?.heal ? 'med' : 'util';
  return CRAFT_TABS.some((t) => t.id === cat) ? cat : 'util';
}

// order inside a tab: tools, then consumables, then materials (stable, so recipe order breaks ties)
const CAT_RANK = { weapon: 0, cons: 1 };
const craftRank = (r) => CAT_RANK[ITEM_DEFS[r.out]?.cat] ?? 2;

// How much of an item an inventory ({ slots, weapons, ammo }) holds, wherever it is kept: the backpack, a weapon slot,
// or the ammunition reserve
export function carried(inv, item) {
  const d = ITEM_DEFS[item];
  if (d?.cat === 'ammo') return inv.ammo[d.ammo] | 0;
  return inv.slots.reduce((n, s) => n + (s && s.item === item ? s.count : 0), inv.weapons.includes(item) ? 1 : 0);
}

// Why a recipe that can be made now matters to what is carried, and how much: { rank (lower first), why } or null.
// inv: the inventory screen's model; vit: its health ({ hp, maxHp }); tracked: the tracked recipe (or undefined)
function carryWhy(r, inv, counts, vit, tracked) {
  const out = r.out;
  const d = ITEM_DEFS[out];
  const w = inv.weapons;
  // ammunition for a gun in its slot, then for one in the backpack
  if (d.cat === 'ammo') {
    for (const slot of [0, 1]) {
      const g = w[slot] | 0;
      if (g && isFirearm(g) && WEAPONS[g].ammo === d.ammo) return { rank: slot, why: `for your ${ITEM_DEFS[g].name}` };
    }
    const packed = inv.slots.find((s, i) => s && i < inv.cap && isFirearm(s.item) && WEAPONS[s.item].ammo === d.ammo);
    if (packed) return { rank: 5, why: `for the ${ITEM_DEFS[packed.item].name} in your pack` };
    return null;
  }
  // what the tracked recipe is still short of
  if (tracked && tracked.r.id !== r.id && (counts[out] || 0) < (tracked.r.cost[out] || 0)) return { rank: 2, why: `for the ${ITEM_DEFS[tracked.r.out].name} you track` };
  // a heal: while hurt, or when none is carried
  const c = CONSUMABLES[out];
  if (c?.heal && c.meat !== 1) {
    if (vit.hp >= 0 && vit.hp < vit.maxHp) return { rank: 3, why: `you're at ${vit.hp} HP` };
    if (!Object.keys(CONSUMABLES).some((k) => CONSUMABLES[k].heal && counts[k] > 0)) return { rank: 6, why: 'you carry no heals' };
    return null;
  }
  // more of the throwable in its slot
  if (d.cat === 'throw' && (w[3] | 0) === out) return { rank: 4, why: `refills slot 4 · ${inv.throwCounts?.[out] | 0} carried` };
  return null;
}

const scaled = (cost, n) => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v * n]));

// Where to get an ingredient that is short, in a line: the recipe that makes it (and where), then where it is found
function whereFrom(item, unlocked) {
  const make = RECIPES.find((x) => x.out === item && (!x.schem || unlocked & (1 << SCHEM_BIT[x.schem])));
  if (!make) return foundIn(item, unlocked);
  const found = sourcesOf(item)
    .slice(0, 2)
    .map((s) => s.name)
    .join(', ');
  const at = make.station ? `at a ${STATION_NAMES[make.station].toLowerCase()}` : 'by hand';
  return `Craft it ${at} from ${costLine(make.cost)}${make.n > 1 ? ` (makes ${make.n})` : ''}` + (found ? ` · or ${found}` : '');
}

export class Crafting {
  // inv: the Inventory screen (its model: inv, counts, near, unlocked); col: the column to fill
  constructor(inv, col) {
    this.o = inv;
    this.ui = inv.ui;
    this.sent = []; // crafts asked for that the server has not answered yet: { r, n, t, had }
    this.bulk = 0; // crafts a click on a recipe asks for while a bulk key is held (CRAFT_FEW / CRAFT_MAX); 0: none held
    this.keys = { few: false, max: false }; // bulk keys pressed since the screen opened
    this.sel = null; // the recipe in the detail panel
    this.picked = false; // ...chosen by the player (else the first one ready, which marks nothing in the backpack)
    this.qty = 1;
    this.focusItem = 0; // the item selected in the backpack: the recipes that use it are marked
    this.fold = new Set(lsGet(FOLD_KEY, FOLD_START).split(',').filter(Boolean));

    const ch = inv._h(col, 'Crafting');
    this.stationEl = el('span', 'station', ch);
    this.stationIco = svgEl('i', 'st-ico', this.stationEl, glyph('campfire'));
    this.stationTxt = el('span', '', this.stationEl, '');

    const tabBar = (this.tabBar = el('div', 'craft-tabs', col));
    this.tabs = [];
    this.recs = [];
    for (const t of CRAFT_TABS) {
      const recs = t.id === 'all' ? null : RECIPES.filter((r) => craftTab(r.out) === t.id).sort((a, b) => craftRank(a) - craftRank(b));
      if (recs && !recs.length) continue;
      const b = el('button', 'ct', tabBar);
      b.type = 'button';
      b.dataset.tab = t.id;
      el('span', 'ct-lab', b, t.label);
      const tab = { id: t.id, label: t.label, b, n: el('span', 'ct-n', b), ready: -1 };
      this.tabs.push(tab);
      for (const r of recs || []) this.recs.push(this._row(r, tab));
    }
    this.byId = new Map(this.recs.map((rec) => [rec.r.id, rec]));

    const list = (this.list = el('div', 'craft-list', col));
    this.groups = GROUPS.map((g) => {
      const head = el('div', 'craft-group g-' + g.id, list);
      head.dataset.g = g.id;
      svgEl('i', 'cg-fold', head, glyph('arrowRight'));
      const t = el('span', 'cg-t', head);
      const a = el('span', 'cg-aside', head, g.aside);
      const box = el('div', 'craft-rows', list);
      return { ...g, head, t, a, box, n: -1 };
    });
    this.noneEl = el('div', 'craft-none', list);
    this.noneEl.hidden = true;

    this._detail(col);
    this._bind();
    this._setTab(lsGet(TAB_KEY, 'all'));
    onTracked(() => {
      this.render();
      this.o.renderUses();
    });
  }

  // a recipe's row in the list
  _row(r, tab) {
    const b = el('button', 'rr');
    b.type = 'button';
    b.dataset.id = r.id;
    svgEl('i', 'rr-ico', b, itemIcon(r.out));
    const txt = el('span', 'rr-txt', b);
    const name = el('span', 'rr-name', txt, ITEM_DEFS[r.out].name);
    if (r.n > 1) el('span', 'rr-n', name, '×' + r.n);
    // why it is in "For what you carry"
    const why = el('span', 'rr-why', txt, '');
    const aside = el('span', 'rr-aside', b);
    const mark = el('i', 'rr-mark', b);
    // one click crafts one, in "For what you carry" (not a button: it is inside one)
    const go = el('span', 'rr-go', b, 'Craft');
    go.title = `Craft one · Shift+click ${CRAFT_FEW} · ${MAX_KEY}+click up to ${CRAFT_MAX}`;
    // what a click would add while a bulk key is held (_renderBulk)
    const bulk = el('span', 'rc-bulk', b);
    bulk.hidden = true;
    return { r, tab, b, why, aside, mark, go, bulk, bulkTxt: '', key: '', group: '', max: 0, markKey: '', carry: null };
  }

  // the detail panel under the list: the recipe selected, what it takes, and the quantity to craft
  _detail(col) {
    const d = (this.cd = el('div', 'cd', col));
    this.cdEmpty = el('div', 'cd-empty', d, 'Select a recipe to see what it takes');
    const body = (this.cdBody = el('div', 'cd-body', d));
    const head = el('div', 'cd-head', body);
    this.cdIco = el('i', 'cd-ico', head);
    const t = el('div', 'cd-titles', head);
    const nl = el('div', 'cd-nameline', t);
    this.cdName = el('span', 'cd-name', nl);
    this.cdSub = el('span', 'cd-sub', nl);
    this.cdDesc = el('div', 'cd-desc', t);
    this.cdReqs = el('div', 'cd-reqs', body);
    const act = (this.cdAct = el('div', 'cd-act', body));
    const step = (this.cdStep = el('div', 'cd-step', act));
    this.cdMinus = el('button', 'cd-sb', step, '−');
    this.cdQty = el('span', 'cd-qty', step, '1');
    this.cdPlus = el('button', 'cd-sb', step, '+');
    this.cdMax = el('button', 'cd-max', act, 'Max');
    const go = (this.cdGo = el('button', 'cd-go', act));
    this.cdGoT = el('span', '', go, 'Craft');
    this.cdGoK = el('span', 'kbd sm', go, 'Space');
    go.title = `Space · Shift+click a recipe to craft ${CRAFT_FEW} · ${MAX_KEY}+click up to ${CRAFT_MAX}`;
    const tr = (this.cdTrack = el('button', 'cd-track', act));
    svgEl('i', 'cd-track-ico', tr, glyph('flag'));
    this.cdTrackT = el('span', 'cd-track-t', tr, 'Track on HUD');
    for (const b of [this.cdMinus, this.cdPlus, this.cdMax, go, tr]) b.type = 'button';
  }

  _bind() {
    this.tabBar.addEventListener('click', (e) => {
      const b = e.target.closest('.ct');
      if (!b || b.dataset.tab === this.tab) return;
      this.ui.sound('ui_click');
      this._setTab(b.dataset.tab);
    });
    // A click selects a recipe; a double-click on one that can be made crafts one. With a bulk key held a click is that
    // many crafts at once, as many of them as the server will take.
    this.list.addEventListener('click', (e) => {
      const gh = e.target.closest('.craft-group[data-g]');
      if (gh && gh.classList.contains('can-fold')) {
        this.ui.sound('ui_click');
        const g = gh.dataset.g;
        if (this.fold.has(g)) this.fold.delete(g);
        else this.fold.add(g);
        lsSet(FOLD_KEY, [...this.fold].join(','));
        return this._layout(false);
      }
      const rec = this._recAt(e.target);
      if (!rec) return;
      if (e.target.closest('.rr-go')) return void this.craft(rec, this.bulk ? this._bulkRun(rec.r).n : 1);
      if (this.bulk) return void this.craft(rec, this._bulkRun(rec.r).n);
      if (rec === this.sel && this.picked) return;
      this.ui.sound('ui_click');
      this.select(rec, true);
    });
    this.list.addEventListener('dblclick', (e) => {
      const rec = this._recAt(e.target);
      // (not on its Craft button: each of the two clicks has crafted one already)
      if (rec && !e.target.closest('.rr-go') && !this.bulk && !e.shiftKey && !e.ctrlKey && !e.metaKey) this.craft(rec, 1);
    });
    // macOS: Ctrl+click asks for the context menu and no click follows. The key is down (this.bulk), so make it one
    this.list.addEventListener('contextmenu', (e) => {
      if (IS_MAC && e.button === 0 && e.ctrlKey) e.target.closest('.rr')?.click();
    });
    // The bulk keys. They are also sprint and crouch, and may still be down from the game when the screen opens: only a
    // press made while it is open counts, so a click with a leftover key stays a selection. (Captured.)
    this._bulkKey = (e) => {
      const k = e.key === 'Shift' ? 'few' : e.key === 'Control' || (IS_MAC && e.key === 'Meta') ? 'max' : '';
      if (!k || e.repeat || (e.type === 'keydown' && !this.o.open)) return;
      this.keys[k] = e.type === 'keydown';
      this._setBulk();
    };
    window.addEventListener('keydown', this._bulkKey, true);
    window.addEventListener('keyup', this._bulkKey, true);
    // (a key released while another window had the focus never reports its keyup)
    window.addEventListener('blur', () => this.dropBulk());

    this.cdMinus.addEventListener('click', () => this._setQty(this.qty - 1));
    this.cdPlus.addEventListener('click', () => this._setQty(this.qty + 1));
    this.cdMax.addEventListener('click', () => this._setQty(this.sel?.max || 1));
    this.cdGo.addEventListener('click', () => this.sel && this.craft(this.sel, this.qty));
    this.cdTrack.addEventListener('click', () => {
      if (!this.sel) return;
      this.ui.sound('ui_click');
      setTracked(trackedId() === this.sel.r.id ? -1 : this.sel.r.id);
    });
  }

  _recAt(t) {
    const b = t.closest('.rr');
    return b ? this.byId.get(+b.dataset.id) : null;
  }

  // Q / E step through the tabs, Space crafts what the detail panel shows - only a recipe the player picked: one it
  // shows by itself is not a choice, and Space is the jump key from habit. True when the key was taken
  key(e) {
    const dir = e.code === 'KeyQ' ? -1 : e.code === 'KeyE' ? 1 : 0;
    if (dir) {
      const n = this.tabs.length;
      const i = this.tabs.findIndex((t) => t.id === this.tab);
      this.ui.sound('ui_click');
      this._setTab(this.tabs[(i + dir + n) % n].id);
      return true;
    }
    if (e.code === 'Space') {
      if (this.sel && this.picked) this.craft(this.sel, this.qty);
      return true; // (taken either way: nothing else on the screen is pressed by it)
    }
    return false;
  }

  // ------------------------------------------------------------ crafting
  // The inventory as it will be once the crafts on their way to the server are answered: counting on what the server
  // last sent would offer the same materials twice to a second click that lands before the answer (a double-click
  // does). A craft is answered when there is more of its output than there was (the inventory message) - or it never
  // is, and is given up on after SENT_TTL. The tracked recipe made: nothing is tracked any more.
  _model() {
    const now = performance.now();
    const inv = this.o.inv;
    let made = false;
    this.sent = this.sent.filter((e) => {
      if (now - e.t >= SENT_TTL) return false;
      if (carried(inv, e.r.out) <= e.had) return true;
      if (e.r.id === trackedId()) made = true;
      return false;
    });
    if (made) queueMicrotask(() => setTracked(-1));
    const m = copyInv(inv);
    const ctx = this.ctx();
    for (const e of this.sent) craftRun(e.r, m, e.n, ctx);
    return m;
  }

  // what a material short of a recipe can be made with on the way (shared/autocraft.js)
  ctx() {
    const o = this.o;
    return { fire: o.near.fire, bench: o.near.bench, unlocked: o.unlocked };
  }

  // n crafts of a recipe, as many of them as the server will take (none: the row shakes)
  craft(rec, n) {
    const model = this._model();
    const can = rec.group === 'ready' ? craftRun(rec.r, copyInv(model), Math.max(1, n), this.ctx()) : 0;
    if (!can) return void this._shake(rec.b);
    const cb = this.ui.cb;
    this.ui.sound('ui_click');
    cb.onCraft(rec.r.id);
    if (can > 1) cb.onCraftRepeat(rec.r.id, can - 1);
    this.sent.push({ r: rec.r, n: can, t: performance.now(), had: carried(model, rec.r.out) });
    rec.b.getAnimations().forEach((a) => a.cancel());
    rec.b.animate([{ background: 'rgba(228,220,203,.22)' }, { background: 'rgba(228,220,203,0)' }], { duration: 380 });
    this.render();
  }

  // the recipe that makes `out`'s ammunition, from the ammo pouch's popover
  craftOut(out) {
    const rec = this.recs.find((x) => x.r.out === out);
    if (rec) this.craft(rec, 1);
  }

  _shake(b) {
    b.getAnimations().forEach((a) => a.cancel());
    b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  // what a click with a bulk key held makes now: n crafts - what the key asks for, less what the materials or the
  // backpack stop short of. full: it is room, not materials, that stops the next.
  _bulkRun(r, model = this._model()) {
    const inv = copyInv(model);
    const ctx = this.ctx();
    const n = craftRun(r, inv, this.bulk, ctx);
    // (`inv` is as the last craft left it)
    return { n, full: n < this.bulk && !!planFor(inv, r.cost, ctx) };
  }

  dropBulk() {
    this.keys.few = this.keys.max = false;
    this._setBulk();
  }

  _setBulk() {
    const n = this.keys.max ? CRAFT_MAX : this.keys.few ? CRAFT_FEW : 0;
    if (n === this.bulk) return;
    this.bulk = n;
    this._renderBulk();
  }

  // the count on every recipe that can be made, while a bulk key is held: the items a click would add, or 'full'
  _renderBulk() {
    const on = this.o.open && this.bulk > 0;
    const model = on ? this._model() : null;
    for (const rec of this.recs) {
      const { n, full } = on && rec.group === 'ready' ? this._bulkRun(rec.r, model) : { n: 0, full: false };
      const txt = n ? '+' + n * rec.r.n : full ? 'full' : '';
      if (rec.bulkTxt === txt) continue;
      rec.bulkTxt = txt;
      rec.bulk.textContent = txt;
      rec.bulk.hidden = !txt;
      rec.bulk.classList.toggle('none', !n);
    }
  }

  // ------------------------------------------------------------ selection
  select(rec, picked = false) {
    if (rec !== this.sel) this.qty = 1;
    this.sel = rec;
    this.picked = !!rec && picked;
    this.render();
    this.o.renderUses();
  }

  _setQty(n) {
    const rec = this.sel;
    if (!rec || rec.group !== 'ready' || !rec.max) return;
    const q = clamp(n | 0, 1, rec.max);
    if (q === this.qty) return;
    this.ui.sound('ui_click');
    this.qty = q;
    this._renderDetail();
    this.o.renderUses();
  }

  // What the backpack marks as about to be used, with how many: the recipe the player picked, at its quantity, or the
  // tracked one. null: nothing
  focus() {
    if (this.sel && this.picked) return { r: this.sel.r, n: this.sel.group === 'ready' ? this.qty : 1 };
    const t = this.byId.get(trackedId());
    return t ? { r: t.r, n: 1 } : null;
  }

  // the item selected in the backpack (0: none): the recipes that use it are marked
  setItemFocus(item) {
    if (item === this.focusItem) return;
    this.focusItem = item;
    this.render();
  }

  // ------------------------------------------------------------ list
  _setTab(id) {
    const tab = this.tabs.find((t) => t.id === id) || this.tabs[0];
    this.tab = tab.id;
    lsSet(TAB_KEY, tab.id);
    for (const t of this.tabs) t.b.classList.toggle('on', t === tab);
    this._layout(true);
  }

  // Every recipe's state against the inventory, the stations near and the schematics found; then the list laid out
  // again if that moved anything between groups, and the detail panel brought up to date
  render() {
    const o = this.o;
    const counts = o.counts;
    const model = this._model();
    const tracked = trackedId();
    const ctx = this.ctx();
    const ready = { all: 0 };
    for (const rec of this.recs) {
      const { r } = rec;
      let short = null;
      // (a material that can be made on the way from what is carried is not short)
      if (!planCost(counts, r.cost, ctx)) {
        for (const k in r.cost) {
          const have = counts[k] || 0;
          if (have < r.cost[k]) {
            short = [+k, have, r.cost[k]];
            break;
          }
        }
      }
      const stationOk = !r.station || o.near[r.station];
      const unlocked = !r.schem || o.schemOk(r.schem);
      const group = !unlocked ? 'locked' : short ? 'missing' : !stationOk ? 'station' : 'ready';
      // (r.hide - a vehicle, which is the mainland's: not in the list at all until the team has found its manual there)
      const hidden = !!r.hide && !unlocked;
      if (rec.hidden !== hidden) rec.b.hidden = rec.hidden = hidden;
      rec.group = group;
      rec.max = group === 'ready' ? craftRun(r, copyInv(model), CRAFT_MAX, ctx) : 0;
      rec.short = short;
      if (group === 'ready') {
        ready.all++;
        ready[rec.tab.id] = (ready[rec.tab.id] || 0) + 1;
      }
    }
    // "For what you carry": the ready recipes that feed what is carried, the most pressing first
    const trackedRec = this.byId.get(tracked);
    const carry = [];
    for (const rec of this.recs) {
      rec.carry = null;
      if (rec.group !== 'ready' || !rec.max || rec.hidden) continue;
      const c = carryWhy(rec.r, o.inv, counts, o.vit, trackedRec);
      if (c) carry.push([rec, c]);
    }
    carry.sort((a, b) => a[1].rank - b[1].rank);
    for (const [rec, c] of carry.slice(0, CARRY_MAX)) rec.carry = c;
    for (const rec of this.recs) {
      const { r, group, short } = rec;
      const aside =
        group === 'ready'
          ? rec.max
            ? `max ${rec.max}`
            : 'no room'
          : group === 'station'
            ? STATION_NAMES[r.station].toLowerCase()
            : group === 'missing'
              ? `${ITEM_DEFS[short[0]].name} ${Math.min(short[1], 999)}/${short[2]}`
              : ITEM_DEFS[r.schem].name;
      const uses = !!this.focusItem && (r.cost[this.focusItem] > 0 || r.schem === this.focusItem);
      const why = rec.carry ? rec.carry.why : '';
      const key = `${group}|${aside}|${tracked === r.id}|${this.sel === rec}|${uses}|${why}`;
      if (rec.key === key) continue;
      rec.key = key;
      rec.b.className = 'rr g-' + group + (this.sel === rec ? ' sel' : '') + (tracked === r.id ? ' tracked' : '') + (uses ? ' uses' : '') + (why ? ' carry' : '');
      rec.aside.textContent = aside;
      rec.why.textContent = why;
      rec.why.hidden = rec.go.hidden = !why;
      const mark = tracked === r.id ? 'flag' : group === 'locked' ? 'lock' : group === 'station' ? STATION_GLYPH[r.station] : '';
      if (rec.markKey !== mark) rec.mark.innerHTML = (rec.markKey = mark) ? glyph(mark) : '';
    }
    for (const t of this.tabs) {
      const n = ready[t.id] || 0;
      if (t.ready === n) continue;
      t.ready = n;
      t.n.textContent = n ? String(n) : '';
      t.b.classList.toggle('zero', !n);
      t.b.title = n ? `${n} ready to craft` : 'Nothing here can be crafted right now';
    }
    if (o.paneCraft) o.paneCraft.n.textContent = ready.all ? String(ready.all) : '';
    const f = o.near.fire;
    const bn = o.near.bench;
    this.stationEl.classList.toggle('near', f || bn);
    this.stationIco.innerHTML = glyph(bn ? 'wrench' : 'campfire');
    this.stationTxt.textContent = f && bn ? 'Campfire + workbench' : f ? 'At a campfire' : bn ? 'At a workbench' : 'No station nearby';
    this._layout(false);
    this._renderDetail();
    if (this.bulk) this._renderBulk();
  }

  // Lay out the list: the tab's recipes in their groups. Only when what is shown changed (reset: the tab did: back to
  // the top)
  _layout(reset) {
    const shown = this.recs.filter((rec) => this.tab === 'all' || rec.tab.id === this.tab);
    // (the ones for what is carried in their order, ahead of the rest)
    const carry = shown.filter((rec) => rec.carry).sort((a, b) => a.carry.rank - b.carry.rank);
    const sections = this.groups.map((g) => ({ g, recs: g.id === 'carry' ? carry : shown.filter((rec) => rec.group === g.id && !rec.carry) }));
    // folding: on the All tab only (a category tab is short, and shows all it has)
    const folds = this.tab === 'all';
    const key = (folds ? [...this.fold].join(',') : '') + '|' + sections.map((s) => s.recs.map((r) => r.r.id).join(',')).join('/');
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      const anyCarry = sections.some((x) => x.g.id === 'carry' && x.recs.length);
      for (const g of this.groups) {
        const s = sections.find((x) => x.g === g);
        const n = s ? s.recs.length : 0;
        const canFold = folds && g.id !== 'carry';
        const folded = canFold && this.fold.has(g.id);
        g.head.hidden = !n;
        g.box.hidden = !n || folded;
        g.head.classList.toggle('can-fold', canFold);
        g.head.classList.toggle('folded', folded);
        if (canFold) g.head.title = folded ? 'Show them' : 'Fold them away';
        else g.head.removeAttribute('title');
        // (replaced, not appended to: a row the last layout put here and this one does not show has to leave)
        g.box.replaceChildren(...(n ? s.recs.map((rec) => rec.b) : []));
        if (!n) continue;
        // (a group of recipes for one station says which)
        const st = g.id === 'station' ? new Set(s.recs.map((r) => r.r.station)) : null;
        const label = st && st.size === 1 ? `Needs a ${STATION_NAMES[[...st][0]].toLowerCase()}` : g.id === 'ready' && anyCarry ? 'Also ready' : g.label;
        g.t.textContent = `${label} · ${n}`;
        // folded: what is in it, in a line (missing: what it is mostly short of)
        g.a.textContent = folded ? this._foldLine(g.id, s.recs) : g.aside;
      }
      const none = !sections.some((s) => s.recs.length);
      this.noneEl.hidden = !none;
      if (none) this.noneEl.textContent = 'No recipes';
      // the detail panel keeps a recipe the player picked; one it showed by itself follows the list
      const visible = sections.flatMap((s) => (folds && s.g.id !== 'carry' && this.fold.has(s.g.id) ? [] : s.recs));
      if (!this.picked || !this.sel) {
        const t = this.byId.get(trackedId());
        const next = (t && visible.includes(t) ? t : null) || visible.find((r) => r.group === 'ready') || visible[0] || null;
        if (next !== this.sel) {
          this.sel = next;
          this.qty = 1;
          this.picked = false;
          for (const rec of this.recs) rec.key = '';
          queueMicrotask(() => this.render());
        }
      }
    }
    if (reset) this.list.scrollTop = 0;
  }

  // a folded group in a line: the first few names, or - recipes short of something - what they mostly lack
  _foldLine(id, recs) {
    if (id === 'missing') {
      const n = new Map();
      for (const rec of recs) if (rec.short) n.set(rec.short[0], (n.get(rec.short[0]) || 0) + 1);
      const top = [...n].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => ITEM_DEFS[k].name);
      return top.length ? 'mostly ' + top.join(', ') : '';
    }
    if (id === 'locked') return [...new Set(recs.map((rec) => ITEM_DEFS[rec.r.schem].name))].slice(0, 2).join(', ');
    const names = recs.slice(0, 2).map((rec) => ITEM_DEFS[rec.r.out].name);
    return names.join(', ') + (recs.length > 2 ? '…' : '');
  }

  _renderDetail() {
    const rec = this.sel;
    const o = this.o;
    this.cdEmpty.hidden = !!rec;
    this.cdBody.hidden = !rec;
    if (!rec) return;
    const { r } = rec;
    const def = ITEM_DEFS[r.out];
    const ready = rec.group === 'ready' && rec.max > 0;
    const qty = (this.qty = ready ? clamp(this.qty, 1, rec.max) : 1);
    const tracked = trackedId() === r.id;
    const counts = o.counts;
    const plan = planCost(counts, r.cost, this.ctx(), qty);
    const key = [r.id, qty, rec.group, rec.max, tracked, this.picked, o.near.fire, o.near.bench, o.unlocked, ...Object.keys(r.cost).map((k) => counts[k] || 0), JSON.stringify(plan?.take)].join(',');
    if (key === this.cdKey) return;
    this.cdKey = key;
    this.cdIco.innerHTML = itemIcon(r.out);
    this.cdName.textContent = def.name + (r.n > 1 ? ` ×${r.n * qty}` : '');
    this.cdSub.textContent = `${CAT_LABEL[def.cat] || ''} · ${r.station ? 'at a ' + STATION_NAMES[r.station].toLowerCase() : 'by hand'}`;
    this.cdSub.className = 'cd-sub c-' + def.cat;
    const stats = statLines(r.out).slice(0, 2).join(' · ');
    this.cdDesc.textContent = [def.desc, stats].filter(Boolean).join(' ');

    // have / need, scaled to the quantity; under each ingredient that is short, where to get it
    const reqs = this.cdReqs;
    reqs.textContent = '';
    const row = (icon, name, val, ok, src) => {
      const q = el('div', 'cd-req ' + (ok ? 'ok' : 'lack'), reqs);
      svgEl('i', 'cd-req-ico', q, icon);
      el('span', 'cd-req-name', q, name);
      el('span', 'cd-req-val', q, val);
      svgEl('i', 'cd-req-mark', q, glyph(ok ? 'check' : 'xmark'));
      if (src) el('div', 'cd-req-src', reqs, src);
    };
    for (const k in r.cost) {
      const need = r.cost[k] * qty;
      const have = counts[k] || 0;
      const make = have < need && plan ? plan.made.find((m) => m.r.out === +k) : null;
      const src = have >= need ? '' : make ? `Made on the way from ${costLine(scaled(make.r.cost, make.runs))}` : whereFrom(+k, o.unlocked);
      row(itemIcon(+k), ITEM_DEFS[k].name, `${Math.min(have, 999)} / ${need}`, have >= need || !!make, src);
    }
    if (r.station) {
      const ok = !!o.near[r.station];
      row(glyph(STATION_GLYPH[r.station]), STATION_NAMES[r.station], ok ? 'nearby' : 'not nearby', ok, ok ? '' : `Build one with the hammer, or find one`);
    }
    if (r.schem) {
      const ok = o.schemOk(r.schem);
      row(glyph(ok ? 'unlock' : 'lock'), ITEM_DEFS[r.schem].name, ok ? 'found' : 'not found', ok, ok ? '' : 'Find it in lockers, crates or toolboxes');
    }

    this.cdAct.classList.toggle('ready', ready);
    this.cdQty.textContent = String(qty);
    this.cdMinus.disabled = !ready || qty <= 1;
    this.cdPlus.disabled = !ready || qty >= rec.max;
    this.cdMax.disabled = !ready || qty >= rec.max;
    this.cdMax.textContent = ready ? `Max ${rec.max}` : 'Max';
    this.cdGo.disabled = !ready;
    this.cdGoT.textContent = ready ? `Craft ×${qty}` : rec.group === 'ready' ? 'No room in the backpack' : "Can't craft yet";
    this.cdGoK.hidden = !ready || !this.picked;
    this.cdTrack.classList.toggle('on', tracked);
    this.cdTrack.title = tracked ? 'Stop tracking it on the HUD' : 'Track it on the HUD: what is missing, and where to get it';
    this.cdTrackT.textContent = tracked ? 'Tracking on HUD' : 'Track on HUD';
  }
}
