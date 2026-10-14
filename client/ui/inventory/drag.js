// Dragging in the inventory screen (inventory.js): a stack within its section of the backpack, a weapon out of its slot
// or onto it, anything onto the drop zone. Methods laid onto Inventory.
import { ITEM_DEFS, WEAPONS } from '../../../shared/defs.js';
import { el, svgEl, replay } from '../dom.js';
import { itemIcon } from '../icons.js';
import { SECTIONS, secOf } from './backpack.js';

export const dragMethods = {
  // ------------------------------------------------------------ dragging
  _startDrag(d) {
    d.started = true;
    d.over = -1;
    d.mark = null;
    d.bad = null;
    this.tip.hide();
    this._closeMenu();
    const s = d.eq >= 0 ? { item: this.inv.weapons[d.eq], count: 1 } : this.inv.slots[d.i];
    this.ghost = svgEl('div', 'drag-ghost', this.ui.root, itemIcon(s.item));
    if (s.count > 1) el('span', 'cell-n', this.ghost, String(s.count));
    (d.eq >= 0 ? this.eqEls[d.eq].r : this.cells[d.i].c).classList.add('dragging');
    this.dzWhat.textContent = `${ITEM_DEFS[s.item].name}${s.count > 1 ? ' ×' + s.count : ''} · stays where you stand for your team`;
    this.root.classList.add('dragging');
  },

  _dragOver(d, e) {
    this.ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const over = t?.closest('.cell');
    const oi = over && !over.hidden ? +over.dataset.i : -1;
    if (d.over !== oi) {
      if (d.over >= 0) this.cells[d.over].c.classList.remove('drop-t', 'no-drop');
      d.over = oi;
      if (oi >= 0 && oi !== d.i) this.cells[oi].c.classList.add(this._canDrop(d, oi) ? 'drop-t' : 'no-drop');
    }
    // where it would go besides a cell: the backpack as a whole (a weapon out of its slot), or the slot a weapon or
    // vest from the backpack would be equipped in
    const mark = this._dropMark(d, t);
    if (d.mark !== mark) {
      d.mark?.classList.remove('drop-in');
      d.mark = mark;
      mark?.classList.add('drop-in');
    }
    const zone = !!t?.closest('.dropzone');
    this.dropZone.classList.toggle('on', zone);
    this.ghost.classList.toggle('dropping', zone);
  },

  _endDrag(d) {
    if (!d.started) return;
    this.ghost?.remove();
    this.ghost = null;
    (d.eq >= 0 ? this.eqEls[d.eq].r : this.cells[d.i].c).classList.remove('dragging');
    if (d.over >= 0) this.cells[d.over].c.classList.remove('drop-t', 'no-drop');
    d.mark?.classList.remove('drop-in');
    this.root.classList.remove('dragging');
    this.dropZone.classList.remove('on');
  },

  // let go of over t: on the ground (the drop zone), into the backpack or a slot, swapped with a stack - or, when none
  // of that can be, nothing, and the section it may move in says so
  _drop(d, t) {
    const cb = this.ui.cb;
    const over = t?.closest('.cell');
    if (t?.closest('.dropzone')) return this._dropRef(d.ref, 0);
    if (d.eq >= 0) {
      // a weapon out of its slot: onto the backpack (that cell if it can take it, else the first free one)
      if (t?.closest('.grid-wrap')) {
        this.ui.sound('ui_click');
        cb.onUnequip(d.eq, over && this._canDrop(d, +over.dataset.i) ? +over.dataset.i : 255);
      }
      return;
    }
    if (over) {
      const b = +over.dataset.i;
      if (b === d.i) return;
      if (!this._canSwap(d.i, b)) return this._flashSection(d.i, b);
      this.ui.sound('ui_click');
      cb.onSwapItems(d.i, b);
      // shown at once as the server will do it (ACT.SWAP_INV; its inventory overwrites this on the next set): onto a
      // stack of the same with room, that one is topped up; else the two trade places
      const sl = this.inv.slots;
      const A = sl[d.i];
      const B = sl[b];
      const max = ITEM_DEFS[A.item]?.stack || 1;
      if (A.item === B.item && max > 1 && B.count < max) {
        const move = Math.min(max - B.count, A.count);
        sl[b] = { item: B.item, count: B.count + move };
        sl[d.i] = A.count > move ? { item: A.item, count: A.count - move } : null;
      } else [sl[d.i], sl[b]] = [sl[b], sl[d.i]];
      this._syncSel();
      this._renderGrid();
      this._renderCard();
    } else if (this._dropMark(d, t)) this._useSlot(d.i); // (a weapon, vest or throwable let go over the Loadout: equipped)
  },

  // A drag from slot a onto b that cannot land: the section it may move within lights up, and says so
  _flashSection(a, b) {
    const from = secOf(this.inv.slots[a]);
    const s = this.secEls[from];
    if (!s) return;
    const label = SECTIONS.find((x) => x.id === from).label;
    s.note.textContent = this.inv.slots[b] ? `${label} stay together: swap within this section` : 'The backpack keeps the free slots last';
    replay(s.h, 'flash');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => {
      s.h.classList.remove('flash');
      s.note.textContent = '';
    }, 1800);
  },

  // A cell the drag would land on: a stack of the same section to swap with (_canSwap), or - a weapon from its slot -
  // an empty cell, or a weapon for that same slot (the two trade places)
  _canDrop(d, b) {
    if (d.eq < 0) return this._canSwap(d.i, b);
    const s = this.inv.slots[b];
    return b >= 0 && b < this.inv.cap && (!s || WEAPONS[s.item]?.slot === d.eq);
  },

  // Over t, what lights up besides a cell: the backpack, for a weapon from its slot; the slot (or the armor) a weapon,
  // throwable or vest from the backpack would be equipped in, over the Loadout. Null: nothing
  _dropMark(d, t) {
    if (d.eq >= 0) return t?.closest('.grid-wrap') && !(d.over >= 0 && this._canDrop(d, d.over)) ? this.gridWrap : null;
    if (!t?.closest('.ux-load')) return null;
    const item = this.inv.slots[d.i]?.item;
    const cat = ITEM_DEFS[item]?.cat;
    if (cat === 'weapon') return this.eqEls[WEAPONS[item].slot]?.r || null;
    if (cat === 'throw') return this.eqEls[3].r;
    return cat === 'armor' ? this.armEl : null;
  },

  // A drag from slot a onto slot b swaps the two stacks (or tops up b, the same item) when both sit in the same section.
  // Anywhere else it would change nothing that can be seen, the grid keeping its order.
  _canSwap(a, b) {
    const sl = this.inv.slots;
    return b >= 0 && b < this.inv.cap && a !== b && !!sl[a] && !!sl[b] && secOf(sl[a]) === secOf(sl[b]);
  },
};
