// The inventory screen's backpack (inventory.js): its cells in labelled sections, the capacity, and the marks on them
// (selected, under a popover, paid from by the recipe in focus). Methods laid onto Inventory.
import { ITEM, ITEM_DEFS, RECIPES } from '../../../shared/defs.js';
import { INVENTORY_SIZE, INVENTORY_MAX, BACKPACK_SLOTS } from '../../../shared/constants.js';
import { WORN } from '../../../shared/protocol.js';
import { smallestStack } from '../../../shared/stacks.js';
import { planCost } from '../../../shared/autocraft.js';
import { el, svgEl, clamp } from '../dom.js';
import { itemIcon, glyph } from '../icons.js';
import { costLine, shortName } from '../iteminfo.js';

// The backpack's sections, in the order the server's auto sort leaves them (BAG_TIER in defs.js).
// Only the grid is laid out that way - the server keeps each stack in its slot - so within a section stacks stay in
// slot order, which a drag onto another stack of the section swaps.
export const SECTIONS = [
  { id: 'gear', label: 'Weapons & gear', cats: ['weapon', 'armor', 'pack', 'gear'] },
  { id: 'cons', label: 'Consumables', cats: ['cons', 'ammo'] },
  { id: 'throw', label: 'Throwables', cats: ['throw'] },
  { id: 'res', label: 'Materials', cats: ['res'] },
  { id: 'part', label: 'Car supplies', cats: ['part', 'schem'] },
];
const SEC_OF_CAT = Object.fromEntries(SECTIONS.flatMap((s) => s.cats.map((c) => [c, s.id])));
export const secOf = (s) => (s ? SEC_OF_CAT[ITEM_DEFS[s.item]?.cat] || 'res' : '');
const CAP_WARN = 0.8; // the capacity bar turns amber this full
const PACK_RECIPE = RECIPES.find((r) => r.out === ITEM.BACKPACK);

// The backpack stacks n crafts of a recipe would be paid from, and how much from each: slot index -> count. Taken from
// the smallest stack first, as the server pays (removeItem) and craftRun counts
function takesOf(cost, n, slots) {
  const sl = slots.map((s) => s && { ...s });
  const out = new Map();
  for (const k in cost) {
    let left = cost[k] * n;
    while (left > 0) {
      const at = smallestStack(sl, +k);
      if (at < 0) break;
      const take = Math.min(sl[at].count, left);
      sl[at].count -= take;
      left -= take;
      out.set(at, (out.get(at) || 0) + take);
      if (sl[at].count <= 0) sl[at] = null;
    }
  }
  return out;
}

export const backpackMethods = {
  // ---- the backpack, and the item card under it
  _buildMid(kit) {
    const gp = (this.gridWrap = el('div', 'grid-wrap', kit));
    const scroll = (this.gridScroll = el('div', 'grid-scroll', gp));
    this.grid = el('div', 'grid', scroll);
    this.secEls = Object.fromEntries(
      SECTIONS.map((s) => {
        const h = el('div', 'bp-sec', this.grid);
        const t = el('span', 'bp-sec-t', h, s.label);
        const note = el('span', 'bp-sec-note', h, '');
        return [s.id, { h, t, note, n: -1 }];
      }),
    );
    this.cells = [];
    for (let i = 0; i < INVENTORY_MAX; i++) {
      const c = el('div', 'cell empty', this.grid);
      c.dataset.i = i;
      const ico = el('i', 'cell-ico', c);
      const n = el('span', 'cell-n', c, '');
      const name = el('span', 'cell-name', c, '');
      const use = el('span', 'cell-use', c, '');
      this.cells.push({ c, ico, n, name, use, key: '', cls: '', take: 0 });
    }
    // the pockets of a backpack nobody is wearing: one line instead of BACKPACK_SLOTS padlocked cells
    const lk = (this.lockedEl = el('div', 'bp-locked', gp));
    svgEl('i', 'bp-lock-ico', lk, glyph('lock'));
    el('span', 'bp-lock-t', lk, `+${BACKPACK_SLOTS} slots with a Backpack`);
    el('span', 'bp-lock-how', lk, 'craft one at a workbench');
    lk.title = `Craft one at a workbench: ${costLine(PACK_RECIPE.cost)}`;

    this._buildCard(gp);
  },

  // the backpack: its cells, their order in sections, the capacity
  _renderGrid() {
    const inv = this.inv;
    for (let i = 0; i < INVENTORY_MAX; i++) this._renderCell(i);
    const used = inv.slots.filter((s, i) => s && i < inv.cap).length;
    const capKey = used + '/' + inv.cap;
    if (this._capKey !== capKey) {
      this._capKey = capKey;
      this.capEl.textContent = used + ' / ' + inv.cap;
      const full = used >= inv.cap;
      const warn = !full && used >= inv.cap * CAP_WARN;
      this.capEl.classList.toggle('full', full);
      this.capEl.classList.toggle('warn', warn);
      this.capBar.classList.toggle('full', full);
      this.capBar.classList.toggle('warn', warn);
      this.capFill.style.transform = `scaleX(${clamp(used / inv.cap, 0, 1)})`;
      this.capBar.style.setProperty('--segs', inv.cap);
      this.capBar.title = full ? 'The backpack is full: pickups stay on the ground' : warn ? 'Nearly full' : `${inv.cap - used} slots free`;
      this.lockedEl.hidden = inv.cap > INVENTORY_SIZE;
    }
    // how many stacks of each kind
    const n = {};
    for (let i = 0; i < inv.cap; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      const sec = secOf(s);
      n[sec] = (n[sec] || 0) + 1;
    }
    // the order: each section that has anything, with its stacks in slot order,
    // then the free cells. The locked pockets are not shown at all
    const order = [];
    for (const s of SECTIONS) {
      const sec = this.secEls[s.id];
      const k = n[s.id] || 0;
      const show = k > 0;
      if (sec.n !== k) {
        sec.n = k;
        sec.t.textContent = `${s.label} · ${k}`;
      }
      sec.h.hidden = !show;
      if (!show) continue;
      order.push(sec.h);
      for (let i = 0; i < inv.cap; i++) if (inv.slots[i] && secOf(inv.slots[i]) === s.id) order.push(this.cells[i].c);
    }
    for (let i = 0; i < inv.cap; i++) if (!inv.slots[i]) order.push(this.cells[i].c);
    for (let i = 0; i < INVENTORY_MAX; i++) this.cells[i].c.hidden = !order.includes(this.cells[i].c);
    const key = order.map((e) => e.dataset.i ?? e.firstChild.textContent).join(',');
    if (this._orderKey !== key) {
      this._orderKey = key;
      for (const e of order) this.grid.appendChild(e);
    }
    this._renderMarks();
  },

  _renderCell(i) {
    const s = this.inv.slots[i];
    const cell = this.cells[i];
    const key = s ? s.item + ':' + s.count : '';
    if (cell.key === key) return;
    cell.key = key;
    cell.cat = s ? ITEM_DEFS[s.item]?.cat || 'res' : '';
    cell.ico.innerHTML = s ? itemIcon(s.item) : '';
    cell.n.textContent = s && s.count > 1 ? String(s.count) : '';
    cell.name.textContent = s ? shortName(s.item) : '';
    cell.cls = '';
  },

  // the cells' states: selected, about to be used by the recipe in focus, under a popover
  _renderMarks() {
    const sel = this.sel?.kind === 'slot' ? this.sel.i : -1;
    const pop = this.split?.i ?? this.menu?.ref.i ?? -1;
    for (let i = 0; i < INVENTORY_MAX; i++) {
      const cell = this.cells[i];
      const s = this.inv.slots[i];
      const cls = 'cell' + (s ? ' c-' + cell.cat : ' empty') + (i === sel ? ' sel' : '') + (cell.take ? ' used' : '') + (i === pop ? ' splitting' : '');
      if (cell.cls !== cls) cell.c.className = cell.cls = cls;
    }
    for (const q2 of this.eqEls) q2.r.classList.toggle('sel', this.sel?.kind === 'eq' && this.sel.slot === +q2.r.dataset.slot);
    this.armEl.classList.toggle('sel', this.sel?.kind === 'worn' && this.sel.which === WORN.ARMOR);
    this.packEl.classList.toggle('sel', this.sel?.kind === 'worn' && this.sel.which === WORN.BACKPACK);
  },

  // The stacks the recipe in focus (picked in the crafting column, or tracked) would be paid from, each marked with how
  // many of it it takes
  renderUses() {
    const f = this.craft?.focus();
    const plan = f && planCost(this.counts, f.r.cost, this.craft.ctx(), f.n);
    const takes = f ? (plan ? takesOf(plan.take, 1, this.inv.slots) : takesOf(f.r.cost, f.n, this.inv.slots)) : null;
    for (let i = 0; i < INVENTORY_MAX; i++) {
      const cell = this.cells[i];
      const t = takes?.get(i) || 0;
      if (cell.take === t) continue;
      cell.take = t;
      cell.use.textContent = t ? '−' + t : '';
    }
    this._renderMarks();
  },
};
