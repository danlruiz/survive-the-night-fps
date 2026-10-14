// The inventory screen's right-click menu (inventory.js): what can be done to a stack, a weapon, worn gear or a
// calibre, with amounts to drop. Methods laid onto Inventory.
import { ITEM_DEFS, RECIPES, AMMO_NAMES } from '../../../shared/defs.js';
import { el, svgEl, button, clamp } from '../dom.js';
import { itemIcon } from '../icons.js';

export const menuMethods = {
  // ------------------------------------------------------------ the right-click menu
  _openMenu(ref, x, y) {
    this._closeSplit();
    this._closeAmmo();
    this.tip.hide();
    const inv = this.inv;
    const acts = this._acts(ref);
    const items = [];
    const add = (label, key, run, opts = {}) => items.push({ label, key, run, ...opts });
    const sep = () => items.push({ sep: true });
    if (ref.kind === 'ammo') {
      const v = inv.ammo[ref.cal] | 0;
      const drop = (n) => () => this._dropRef(ref, n);
      for (const n of [10, 30]) if (v > n) add(`Drop ${n}`, '', drop(n));
      if (v > 1) add(`Drop half (${Math.ceil(v / 2)})`, '', drop(Math.ceil(v / 2)));
      add('Drop amount…', '', () => this._openAmmo(ref.cal, this.calEls[ref.cal].b));
      add(`Drop all ${v}`, 'Shift+G', drop(0), { danger: true });
      const rec = RECIPES.find((r) => r.out === ref.item);
      if (rec) {
        sep();
        add(`Craft +${rec.n}`, '', () => this.craft.craftOut(ref.item), { off: !this._craftable(rec) });
      }
    } else {
      if (acts.main) add(acts.main.label, 'F', () => this._do('main', ref, false), { off: !acts.main.ok });
      if (ref.kind === 'slot') add('Split…', 'S', () => this._do('split', ref, false), { off: !acts.split.ok });
      sep();
      const s = ref.kind === 'slot' ? inv.slots[ref.i] : null;
      if (s && s.count > 1) {
        const drop = (n) => () => this._dropRef(ref, n);
        add('Drop 1', 'G', drop(1));
        if (s.count > 10) add('Drop 10', '', drop(10));
        if (s.count > 2) add(`Drop half (${Math.ceil(s.count / 2)})`, '', drop(Math.ceil(s.count / 2)));
        add('Drop amount…', '', () => this._openSplit(ref.i, false, true));
        add(`Drop all ${s.count}`, 'Shift+G', drop(0), { danger: true });
      } else add('Drop', 'G', () => this._do('drop', ref, false), { danger: true, off: !acts.drop.ok });
      if (acts.salvage) {
        sep();
        add('Salvage…', 'X', () => this._do('salvage', ref, false), { off: !acts.salvage.ok, note: acts.salvage.ok ? '' : "can't" });
      }
    }
    const m = this.menuEl;
    m.textContent = '';
    const head = el('div', 'ctx-head', m);
    svgEl('i', 'ctx-ico', head, itemIcon(ref.item));
    el('span', 'ctx-name', head, ref.kind === 'ammo' ? `${AMMO_NAMES[ref.cal]} rounds` : ITEM_DEFS[ref.item].name);
    const cnt = ref.kind === 'slot' ? inv.slots[ref.i].count : ref.kind === 'ammo' ? inv.ammo[ref.cal] : 0;
    if (cnt > 1) el('span', 'ctx-n', head, String(cnt));
    items.forEach((it, k) => {
      if (it.sep) {
        if (m.lastChild?.className !== 'ctx-sep') el('div', 'ctx-sep', m);
        return;
      }
      const b = button('ctx-item' + (it.danger ? ' danger' : ''), m);
      b.dataset.k = k;
      b.disabled = !!it.off;
      el('span', 'ctx-l', b, it.label);
      if (it.note) el('span', 'ctx-note', b, it.note);
      else if (it.key) el('span', 'kbd sm', b, it.key);
    });
    if (m.lastChild?.className === 'ctx-sep') m.lastChild.remove();
    this.menu = { ref, items };
    m.hidden = false;
    const o = this.root.getBoundingClientRect();
    const r = m.getBoundingClientRect();
    const px = clamp(x + 2, o.left + 8, o.right - r.width - 8);
    const py = clamp(y + 2, o.top + 8, o.bottom - r.height - 8);
    m.style.transform = `translate(${Math.round(px - o.left)}px,${Math.round(py - o.top)}px)`;
    this._renderMarks();
  },

  _closeMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.menuEl.hidden = true;
    this._renderMarks();
  },
};
