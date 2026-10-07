// The social side sheet (issue #219): the player list [Tab] and, in a game, the leaderboard [L] open as one sheet
// down the right-hand side, sized in rem so the browser's zoom makes it bigger rather than cramped, with the fight
// still in view to its left. Pinned, tabs on its left edge go between the list, the leaderboard and Friends; a
// player's profile (from the list) and Friends dock into the same place (dock) instead of opening as cards in the
// middle. Going between the list and the leaderboard is the game's (ui.sheetGo: Game.sheetGo), since each takes
// the pointer its own way; Friends is a panel over whichever of them is up.
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';
import { bindLabel } from '../game/binds.js';
import { onSocialChange, unreadCount, socialState } from '../net/friends.js';
import './ux-players.css';

const TABS = [
  ['players', 'people', 'Players', 'players'],
  ['board', 'trophy', 'Leaderboard', 'board'],
  ['friends', 'star', 'Friends', ''],
];
const rails = new Set();
const watched = new WeakSet();

// a panel docked into the sheet: the class comes off again whenever it is hidden, so the pause menu's Friends
// still opens as the card it always was
export function dock(panel) {
  panel.root.classList.add('pls-docked');
  if (!watched.has(panel)) {
    watched.add(panel);
    new MutationObserver(() => {
      if (panel.root.hidden) panel.root.classList.remove('pls-docked');
      syncTabs();
    }).observe(panel.root, { attributes: true, attributeFilter: ['hidden'] });
  }
}

export const docked = (panel) => !!panel && !panel.root.hidden && panel.root.classList.contains('pls-docked');

// lets go of whatever is docked (the sheet under it is going away, or another of its tabs was picked)
export function undock(ui, keepProfile = false) {
  if (docked(ui.friends)) ui.friends.hide();
  if (!keepProfile && docked(ui.profile)) ui.profile.hide();
}

export function syncTabs() {
  for (const r of rails) r.sync();
}

onSocialChange(syncTabs);

// The tabs down the sheet's left edge. own: which of them the sheet they hang off is ('players' | 'board')
export class SheetTabs {
  constructor(ui, parent, own) {
    this.ui = ui;
    this.own = own;
    this.root = el('nav', 'pls-tabs', parent);
    this.root.setAttribute('aria-label', 'Players, leaderboard and friends');
    this.btns = TABS.map(([id, ico, label, bind]) => {
      const b = svgEl('button', 'pls-tab', this.root, glyph(ico));
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerenter', () => (b.title = bind ? `${label} (${bindLabel(bind)})` : label));
      b.addEventListener('click', () => this.go(id));
      if (id === 'friends') this.badge = el('b', 'pls-tab-badge', b, '');
      return b;
    });
    rails.add(this);
    this.sync();
  }

  go(id) {
    const ui = this.ui;
    ui.sound?.('ui_click');
    if (id === 'friends') {
      if (docked(ui.friends)) return;
      if (docked(ui.profile)) ui.profile.hide();
      dock(ui.friends);
      ui.friends.show();
    } else if (id === this.own) undock(ui);
    else {
      undock(ui);
      ui.sheetGo?.(id);
    }
    syncTabs();
  }

  sync() {
    const on = docked(this.ui.friends) ? 'friends' : this.own;
    for (const b of this.btns) {
      const active = b.dataset.tab === on;
      b.classList.toggle('on', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    }
    let n = 0;
    try {
      n = (unreadCount() | 0) + (socialState().incoming?.length | 0);
    } catch {
      n = 0;
    }
    this.badge.textContent = n ? String(Math.min(n, 99)) : '';
    this.badge.hidden = !n;
  }
}
