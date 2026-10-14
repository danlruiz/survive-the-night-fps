// The inventory screen's tooltip (inventory.js): the name of what is under the pointer (the item card has the rest),
// and a line of what to do with it
import { el } from '../dom.js';

export class Tooltip {
  constructor(parent) {
    this.root = el('div', 'tip ux-inv-tip', parent);
    this.root.hidden = true;
    this.name = el('div', 'tip-name', this.root);
    this.cat = el('div', 'tip-cat', this.root);
    this.hint = el('div', 'tip-hint', this.root);
    this.x = 0;
    this.y = 0;
  }

  show({ name, cat, catCls, hint }, x = this.x, y = this.y) {
    this.name.textContent = name || '';
    this.cat.textContent = cat || '';
    this.cat.className = 'tip-cat ' + (catCls || '');
    this.cat.hidden = !cat;
    this.hint.textContent = hint || '';
    this.hint.hidden = !hint;
    this.root.hidden = false;
    this.move(x, y);
  }

  move(x, y) {
    this.x = x;
    this.y = y;
    const r = this.root.getBoundingClientRect();
    let px = x + 16;
    let py = y + 18;
    if (px + r.width > innerWidth - 8) px = x - r.width - 12;
    if (py + r.height > innerHeight - 8) py = y - r.height - 12;
    this.root.style.transform = `translate(${Math.max(8, px) | 0}px,${Math.max(8, py) | 0}px)`;
  }

  hide() {
    this.root.hidden = true;
  }
}
