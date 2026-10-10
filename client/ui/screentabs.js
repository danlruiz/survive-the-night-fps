// The kit screens: the inventory [I], the field map [M], the perks [P] and the achievements [U] are one full-screen
// modal - the same frame on all four (ux-screens.css), a row of tabs across its top and the close at the row's right
// end. Each key opens it on its own tab; that tab's key, Esc, the close or a click outside shuts it, and another tab's
// key goes to that tab. Going from one tab to another is the game's in a run (ui.screenGo: Game.screenGo), since each
// screen takes the pointer and the keys its own way; outside a run (the splash, the end screen) there is no inventory
// and no map, and the perks and the achievements swap here (UI.screenGo). In a run the HUD's clock sits in the row,
// left of the close (holdClock).
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';
import { bindLabel, liveText } from '../game/binds.js';
import { onProgress, lastProgress } from '../net/progress.js';
import './ux-screens.css';

const TABS = [
  ['inventory', 'grid', 'Inventory'],
  ['map', 'map', 'Map'],
  ['perks', 'arrowUp', 'Perks'],
  ['achievements', 'trophy', 'Achievements'],
];
const bars = new Set();
let held = null; // the row the HUD's clock is in...
let home = null; // ...and where it lives when no row has it

export function syncScreenTabs() {
  for (const b of bars) b.sync();
}

onProgress(syncScreenTabs); // (the perk points waiting, on the Perks tab)

// A tab picked, or another tab's key, swaps one screen for the other in the same handler: the one coming up does not
// animate in as though the modal had just opened (screenCame)
let swapping = false;
export function screenLeft() {
  if (swapping) return;
  swapping = true;
  queueMicrotask(() => (swapping = false));
}

export function screenCame(root) {
  root.classList.toggle('scr-still', swapping);
}

// A Panel (games.js) as one of the screens: its card in a frame under the row, which has the close (the card's own
// cross goes, and so does its title: the tab says it). A press on the frame between them is a press outside, as on
// the inventory. The panel calls shown() and hidden() from its show() and hide().
export function tabbed(panel, own) {
  panel.root.classList.add('scr-panel');
  const frame = el('div', 'scr-frame', panel.root);
  const tabs = new ScreenTabs(panel.ui, frame, own, () => panel.hide());
  frame.append(panel.card);
  panel.card.querySelector('.set-head > .set-close')?.remove();
  frame.addEventListener('pointerdown', (e) => {
    if (e.target === frame && e.button === 0) panel.hide();
  });
  tabs.shown = () => {
    screenCame(panel.root);
    tabs.sync();
    if (panel.ui.screenRun?.()) tabs.holdClock(true);
  };
  tabs.hidden = () => tabs.holdClock(false);
  return tabs;
}

// The row across the top of one of the screens. own: which of the three it is; parent, before: where it goes;
// onClose: what its close does (the screen's own way of shutting)
export class ScreenTabs {
  constructor(ui, parent, own, onClose, before = null) {
    this.ui = ui;
    this.own = own;
    const root = (this.root = el('div', 'scr-bar'));
    parent.insertBefore(root, before);
    const nav = (this.nav = el('nav', 'scr-tabs', root));
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Inventory, map, perks and achievements');
    this.btns = TABS.map(([id, ico, label]) => {
      const b = el('button', 'scr-tab', nav);
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === own));
      b.classList.toggle('on', id === own);
      svgEl('i', 'scr-tab-ico', b, glyph(ico));
      el('span', 'scr-tab-t', b, label);
      const n = el('b', 'scr-tab-n', b, '');
      const key = liveText(el('span', 'kbd sm scr-tab-k', b), () => bindLabel(id));
      liveText(b, () => `${label} (${bindLabel(id)})`, 'title');
      b.addEventListener('click', () => {
        if (id === this.own) return;
        this.ui.sound('ui_click');
        this.ui.screenGo(id);
      });
      return { id, b, n, key };
    });
    // instead of the tabs, a title: a friend's achievements are nobody's tab
    this.title = el('h2', 'scr-title', root, '');
    this.title.hidden = true;
    el('span', 'scr-gap', root);
    this.aside = el('div', 'scr-aside', root); // (the HUD's clock, in a run)
    const close = (this.close = svgEl('button', 'scr-close btn-icon', root, glyph('xmark')));
    close.type = 'button';
    liveText(close, () => `Close (${bindLabel(own)} or Esc)`, 'title');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => onClose());
    bars.add(this);
    this.sync();
  }

  // a title in place of the tabs ('' for the tabs again)
  setTitle(text) {
    this.title.textContent = text || '';
    this.title.hidden = !text;
    this.nav.hidden = !!text;
  }

  // which tabs there are (no inventory or map outside a run), and the perk points waiting on the Perks tab
  sync() {
    const run = !!this.ui.screenRun?.();
    const pending = lastProgress()?.pending | 0;
    for (const t of this.btns) {
      t.b.hidden = (t.id === 'inventory' || t.id === 'map') && !run && this.own !== t.id;
      if (t.id === 'perks') {
        t.n.textContent = pending > 0 ? String(pending) : '';
        t.b.classList.toggle('lit', pending > 0);
      }
    }
  }

  // The HUD's clock, one line, in this row while the screen is up in a run (the game goes on behind it, and the time
  // left is what says to close it), and back in its corner after. Another row taking it is not this one's to undo.
  holdClock(hold) {
    const ui = this.ui;
    const c = ui.hud?.clock;
    if (hold) {
      if (!held) home = c?.parentElement;
      if (c) this.aside.append(c);
      held = this;
      ui.root.classList.add('inv-open'); // (the HUD's corners step out of the way, and the clock folds to one line)
    } else if (held === this) {
      held = null;
      if (c && home) home.prepend(c);
      ui.root.classList.remove('inv-open');
    }
  }
}
