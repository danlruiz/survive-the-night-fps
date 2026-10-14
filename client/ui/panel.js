// The card every lobby and account panel is (games.js, account.js, friends.js, the picker...): the settings panel's
// style, closed by the cross, Esc, or a press outside the card.
import { el, iconButton, replay } from './dom.js';
import { glyph } from './icons.js';

// a card in the settings panel's style, with a head (title, sub line, close cross), a body and a foot
export class Panel {
  constructor(ui, parent, cls, title) {
    this.ui = ui;
    this.root = el('div', `stn-settings ${cls}`, parent);
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true;
    const card = (this.card = el('div', 'set-card paper', this.root));
    const head = el('div', 'set-head', card);
    el('h2', 'set-title', head, title);
    this.sub = el('span', 'set-sub', head, '');
    const close = iconButton('set-close btn-icon', head, glyph('xmark'));
    close.title = 'Close';
    close.addEventListener('click', () => this.hide());
    this.body = el('div', 'set-body', card);
    this.foot = el('div', 'set-foot', card);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    document.addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden || e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      },
      true
    );
  }

  show() {
    this.root.hidden = false;
    replay(this.root, 'in');
  }

  hide() {
    this.root.hidden = true;
  }

  get visible() {
    return !this.root.hidden;
  }
}
