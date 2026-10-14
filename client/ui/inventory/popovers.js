// The inventory screen's two amount popovers (inventory.js): the split / salvage popover on a stack, a weapon in its
// slot or the armor worn, and the ammo popover on a calibre of the pouch. Methods laid onto Inventory.
import { ITEM_DEFS, WEAPONS, RECIPES, SALVAGE, isFirearm, AMMO_NAMES, AMMO_ITEMS } from '../../../shared/defs.js';
import { SALVAGE_FROM } from '../../../shared/protocol.js';
import { el, svgEl, button, iconButton, clamp } from '../dom.js';
import { itemIcon, glyph } from '../icons.js';
import { costLine, salvageOf } from '../iteminfo.js';

// A popover's head: the icon and name of what it is open on, how many there are, and the close
function popHead(pop, onClose) {
  const h = el('div', 'split-head', pop);
  const ico = el('i', 'split-ico', h);
  const name = el('span', 'split-name', h);
  const of = el('span', 'split-of', h);
  const x = iconButton('btn-icon split-x', h, glyph('xmark'));
  x.title = 'Close (Esc)';
  x.addEventListener('click', onClose);
  return { ico, name, of };
}

// The amount picked, twice: a slider and a number field
function amountInputs(row) {
  const range = el('input', 'set-range split-range', row);
  range.type = 'range';
  range.min = 1;
  range.step = 1;
  range.setAttribute('aria-label', 'How many');
  const num = el('input', 'split-num', row);
  num.type = 'text';
  num.inputMode = 'numeric';
  num.maxLength = 4;
  num.autocomplete = 'off';
  num.setAttribute('aria-label', 'How many');
  return { range, num };
}

// set(n, typed): the amount moved (typed: in the number field, whose text is left as typed); settle(): the field let go
// of, its text put right
function bindAmount(range, num, set, settle) {
  range.addEventListener('input', () => set(+range.value));
  num.addEventListener('input', () => {
    const digits = num.value.replace(/\D/g, '');
    if (digits !== num.value) num.value = digits;
    set(+digits, true);
  });
  num.addEventListener('change', settle);
  // (the whole number selected, so that typing replaces it; after the click that gave the focus has placed its caret)
  num.addEventListener('focus', () => setTimeout(() => num.select()));
}

export const popoverMethods = {
  // ---- split popover: how much of a stack to put in a slot of its own, or down on the ground for a teammate
  _buildSplitPop(root) {
    const sp = (this.splitEl = el('div', 'split', root));
    sp.hidden = true;
    const head = popHead(sp, () => this._closeSplit());
    this.splitIco = head.ico;
    this.splitName = head.name;
    this.splitOf = head.of;
    const sr = (this.splitRow = el('div', 'split-row', sp));
    const amount = amountInputs(sr);
    this.splitRange = amount.range;
    this.splitNum = amount.num;
    const sb = (this.splitBtns = el('div', 'split-btns', sp));
    this.splitDrop = button('btn split-b', sb, 'Drop');
    this.splitKeep = button('btn split-b', sb, 'Split');
    this.splitNote = el('div', 'split-note', sp);
    // ...and tearing it down, for anything SALVAGE lists: what the amount picked comes apart into
    const sv = (this.salvEl = el('div', 'salv', sp));
    el('div', 'salv-h', sv, 'Comes apart into');
    this.salvYield = el('div', 'salv-yield', sv);
    this.salvNote = el('div', 'split-note', sv);
    this.salvBtn = button('btn split-b salv-b', sv, 'Salvage');
  },

  // ---- the ammo popover: an amount of a calibre (presets, a slider), dropped for a teammate, or more of it crafted
  _buildAmmoPop(root) {
    const ap = (this.apEl = el('div', 'split apop', root));
    ap.hidden = true;
    const head = popHead(ap, () => this._closeAmmo());
    this.apIco = head.ico;
    this.apName = head.name;
    this.apOf = head.of;
    const pre = el('div', 'ap-pre', ap);
    this.apPre = [
      ['10', () => 10],
      ['30', () => 30],
      ['Half', (v) => Math.ceil(v / 2)],
      ['All', (v) => v],
    ].map(([t, f]) => {
      const b = button('ap-p', pre, t);
      b.addEventListener('click', () => this._setAmmo(f(this.inv.ammo[this.apop?.cal] | 0)));
      return { b, f };
    });
    const ar = el('div', 'split-row', ap);
    const amount = amountInputs(ar);
    this.apRange = amount.range;
    this.apNum = amount.num;
    const abt = el('div', 'split-btns', ap);
    this.apDrop = button('btn split-b ap-drop', abt);
    this.apDropT = el('span', '', this.apDrop, 'Drop');
    el('span', 'kbd sm', this.apDrop, 'G');
    this.apCraft = button('btn split-b', abt, 'Craft');
    this.apNote = el('div', 'split-note', ap);
  },

  _bindPopovers() {
    bindAmount(this.splitRange, this.splitNum, (n, typed) => this._setSplit(n, typed), () => this.split && this._setSplit(this.split.n));
    this.splitDrop.addEventListener('click', () => this._doSplit(true));
    this.splitKeep.addEventListener('click', () => this._doSplit(false));
    this.salvBtn.addEventListener('click', () => this._doSalvage());
    bindAmount(this.apRange, this.apNum, (n, typed) => this._setAmmo(n, typed), () => this.apop && this._setAmmo(this.apop.n));
    this.apDrop.addEventListener('click', () => this._dropAmmo());
    this.apCraft.addEventListener('click', () => {
      const out = this.apop && AMMO_ITEMS[this.apop.cal];
      if (out) this.craft.craftOut(out);
    });
    // Enter splits (or salvages, on what cannot be split; or drops, in the ammo popover), Escape puts it away. Captured,
    // so that neither reaches the game (the chat, the pause menu)
    this._popKey = (e) => {
      if ((!this.split && !this.apop) || (e.key !== 'Enter' && e.key !== 'Escape')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        this._closeSplit();
        this._closeAmmo();
      } else if (!e.repeat) {
        if (this.apop) this._dropAmmo();
        else if (this.splitRow.hidden) this._doSalvage();
        else this._doSplit(false);
      }
    };
    window.addEventListener('keydown', this._popKey, true);
  },

  // ------------------------------------------------------------ split / salvage popover
  // The popover on stack i: how much of it to put in a slot of its own or down on the ground for a teammate, and - for
  // anything SALVAGE lists - how much of it to tear down. A single item opens it only for that. Half the stack is
  // picked to begin with. salvage: opened for that (X): all of a single one, one of a stack. amount: for "Drop amount…"
  _openSplit(i, salvage = false, amount = false) {
    const s = this.inv.slots[i];
    if (!s || (s.count < 2 && !SALVAGE[s.item])) return;
    this._openPop({ i, from: i, item: s.item, n: salvage ? 1 : Math.max(1, s.count >> 1) }, this.cells[i].c);
    if (amount && !this.splitRow.hidden) this.splitNum.focus({ preventScroll: true });
  },

  // ...on a weapon in its slot, or the armor worn (from: SALVAGE_FROM): those can only be torn down
  _openSalvage(from, item, anchor) {
    if (SALVAGE[item]) this._openPop({ i: -1, from, item, n: 1 }, anchor);
  },

  // It sits above what it is open on, or below when there is no room there, and inside the screen either way
  _openPop(sp, anchor) {
    this._closeSplit();
    this._closeAmmo();
    this._closeMenu();
    this.tip.hide();
    this.split = { ...sp, count: 1, anchor };
    this.splitIco.innerHTML = itemIcon(sp.item);
    this.splitName.textContent = ITEM_DEFS[sp.item]?.name || '';
    this.splitEl.hidden = false;
    anchor.classList.add('splitting');
    this._syncSplit();
    if (!this.split) return;
    this._place(this.splitEl, anchor);
    // (the Salvage button is never given the focus: Space - a craft, or a jump - would press it)
    if (!this.splitRow.hidden) this.splitRange.focus({ preventScroll: true });
  },

  _place(pop, anchor) {
    const c = anchor.getBoundingClientRect();
    const o = this.root.getBoundingClientRect();
    const r = pop.getBoundingClientRect();
    const x = clamp(c.left + c.width / 2 - r.width / 2, o.left + 8, o.right - r.width - 8);
    const y = c.top - r.height - 8 >= o.top + 8 ? c.top - r.height - 8 : Math.min(c.bottom + 8, o.bottom - r.height - 8);
    pop.style.transform = `translate(${Math.round(x - o.left)}px,${Math.round(y - o.top)}px)`;
  },

  // the popover against what it is open on as the server last left it: put away when that is gone (or a stack of what
  // cannot be salvaged is down to one), and never picking more than there is
  _syncSplit() {
    const sp = this.split;
    if (!sp) return;
    if (sp.i >= 0) {
      const s = this.inv.slots[sp.i];
      if (!s || s.item !== sp.item || (s.count < 2 && !SALVAGE[s.item])) return this._closeSplit();
      sp.count = s.count;
    } else if ((sp.from === SALVAGE_FROM.ARMOR ? this.inv.armor?.item : this.inv.weapons[sp.from - SALVAGE_FROM.WEAPON]) !== sp.item) return this._closeSplit();
    const many = sp.count > 1;
    this.splitRow.hidden = this.splitBtns.hidden = !many;
    this.splitOf.textContent = many ? 'of ' + sp.count : '';
    if (many) this.splitRange.max = sp.count;
    this.salvEl.hidden = !SALVAGE[sp.item];
    this.salvEl.classList.toggle('alone', !many);
    this._setSplit(sp.n);
  },

  // typed: it came from the number field, whose text is left as it was typed
  _setSplit(n, typed = false) {
    const sp = this.split;
    if (!sp) return;
    const max = sp.count;
    const salv = !!SALVAGE[sp.item];
    sp.n = clamp(n | 0, 1, max);
    if (max > 1) {
      const free = this.inv.slots.some((s, i) => !s && i < this.inv.cap);
      this.splitRange.value = sp.n;
      this.splitRange.style.setProperty('--p', (((sp.n - 1) / (max - 1)) * 100).toFixed(1) + '%');
      if (!typed) this.splitNum.value = String(sp.n);
      this.splitDrop.textContent = 'Drop ' + sp.n;
      this.splitKeep.textContent = 'Split ' + sp.n;
      // nothing to split off a stack taken whole, and nowhere to put it with every slot taken
      this.splitKeep.disabled = sp.n >= max || !free;
      this.splitNote.textContent = sp.n >= max ? (salv ? 'The whole stack: nothing left to split off' : 'The whole stack: it can only be dropped') : free ? '' : 'No free slot to split into';
    } else this.splitNote.textContent = '';
    if (!salv) return;
    this.salvYield.textContent = '';
    for (const [id, k] of salvageOf(sp.item, sp.n)) {
      const chip = el('span', 'ing salv-ing', this.salvYield);
      svgEl('i', 'ing-ico', chip, itemIcon(id));
      el('span', 'ing-t', chip, `${ITEM_DEFS[id].name} ×${k}`);
    }
    this.salvBtn.textContent = max > 1 ? 'Salvage ' + sp.n : 'Salvage';
    this.salvNote.textContent = isFirearm(sp.item) ? 'Any rounds still in it go back into the pack' : '';
  },

  // drop: the amount picked goes on the ground; else into a free slot of its own
  _doSplit(drop) {
    const sp = this.split;
    if (!sp || sp.i < 0 || (!drop && this.splitKeep.disabled)) return;
    if (drop) this._dropRef({ kind: 'slot', i: sp.i, item: sp.item }, sp.n);
    else {
      this.ui.sound('ui_click');
      this.ui.cb.onSplitItem(sp.i, sp.n);
    }
    this._closeSplit();
  },

  // the amount picked torn down for what it is made of
  _doSalvage() {
    const sp = this.split;
    if (!sp || !SALVAGE[sp.item]) return;
    this.ui.cb.onSalvage(sp.from, sp.n);
    this._closeSplit();
  },

  _closeSplit() {
    if (!this.split) return;
    this.split.anchor.classList.remove('splitting');
    this.split = null;
    this.splitEl.hidden = true;
    // (a focused number field would keep ui.isTyping() true and swallow gameplay keys)
    if (this.splitEl.contains(document.activeElement)) document.activeElement.blur();
  },

  // ------------------------------------------------------------ the ammo popover
  _openAmmo(cal, anchor) {
    const v = this.inv.ammo[cal] | 0;
    if (v <= 0) return;
    this._closeSplit();
    this._closeMenu();
    this._closeAmmo();
    this.tip.hide();
    this.apop = { cal, n: Math.ceil(v / 2), anchor };
    this.apIco.innerHTML = itemIcon(AMMO_ITEMS[cal]);
    this.apName.textContent = `${AMMO_NAMES[cal]} rounds`;
    this.apEl.hidden = false;
    anchor.classList.add('splitting');
    this._syncAmmo();
    if (!this.apop) return;
    this._place(this.apEl, anchor);
    this.apRange.focus({ preventScroll: true });
  },

  _closeAmmo() {
    if (!this.apop) return;
    this.apop.anchor.classList.remove('splitting');
    this.apop = null;
    this.apEl.hidden = true;
    if (this.apEl.contains(document.activeElement)) document.activeElement.blur();
  },

  _syncAmmo() {
    const ap = this.apop;
    if (!ap) return;
    const v = this.inv.ammo[ap.cal] | 0;
    if (v <= 0) return this._closeAmmo();
    this.apOf.textContent = `${v} carried`;
    this.apRange.max = v;
    this.apRange.disabled = v < 2;
    this._setAmmo(ap.n);
  },

  _setAmmo(n, typed = false) {
    const ap = this.apop;
    if (!ap) return;
    const v = this.inv.ammo[ap.cal] | 0;
    ap.n = clamp(n | 0, 1, Math.max(1, v));
    this.apRange.value = ap.n;
    this.apRange.style.setProperty('--p', (v > 1 ? ((ap.n - 1) / (v - 1)) * 100 : 100).toFixed(1) + '%');
    if (!typed) this.apNum.value = String(ap.n);
    for (const p of this.apPre) p.b.classList.toggle('on', p.f(v) === ap.n);
    this.apPre[0].b.disabled = v < 10;
    this.apPre[1].b.disabled = v < 30;
    this.apDropT.textContent = `Drop ${ap.n}`;
    // after it: how many magazines' worth are left for the gun that fires it
    const gun = this._gunsFor(ap.cal).held[0];
    const mag = gun ? WEAPONS[gun].mag : 0;
    const left = v - ap.n;
    const notes = ['Lands at your feet for a teammate.'];
    if (mag > 1) notes.push(`${Math.floor(left / mag)} magazine${Math.floor(left / mag) === 1 ? '' : 's'} left for the ${ITEM_DEFS[gun].name} after this.`);
    const rec = RECIPES.find((r) => r.out === AMMO_ITEMS[ap.cal]);
    this.apCraft.hidden = !rec;
    if (rec) {
      const ok = this._craftable(rec);
      this.apCraft.textContent = `Craft +${rec.n}`;
      this.apCraft.disabled = !ok;
      if (!ok) notes.push(rec.station && !this.near[rec.station] ? `Crafting needs a ${rec.station === 'fire' ? 'campfire' : 'workbench'}.` : `Crafting it takes ${costLine(rec.cost)}.`);
    }
    this.apNote.textContent = notes.join(' ');
  },

  _dropAmmo() {
    const ap = this.apop;
    if (!ap) return;
    this._dropRef({ kind: 'ammo', cal: ap.cal, item: AMMO_ITEMS[ap.cal] }, ap.n);
    this._closeAmmo();
  },
};
