// Dead Hand [K]: the card game's screen, over a world that goes on behind it (see-through: the valley is still there,
// and so is whatever is coming). Its views, as tabs along the head:
//   Table      the match under way (or the practice one), or how the last one ended (ui/cardtable.js)
//   Decks      the deck builder (ui/carddeck.js)
//   Trade      a trade with a teammate, while one is open (ui/cardtrade.js)
//   Lobby      no-bet matches at the lobby's tables (ui/cardlobby.js)
//   Challenges the asks to you and from you (ui/cardasks.js)
//   Practice   a match against the computer: no cards won or lost (ui/cardpractice.js)
// and three without a tab: the chooser ([E] on a teammate: a match, with a deck and maybe a card bet, or a trade;
// ui/cardchooser.js), a pack opened (ui/cardreveal.js) and the guide to how it plays (ui/cardguide.js: the head's
// "How to play", and offered once, the first time the cards are opened). What the views share (the deck picker, bets,
// loadout stakes) is in ui/cardwidgets.js.
//
// What it shows comes from game/cards.js (CardsClient: bind, render), which also takes what the player does here.
// The game opens and shuts it (Game.toggleCards: the key, the pause menu's row, [E] on a teammate) and sets onClose
// (the cross, a click outside). Esc reaches it through Game.onKey only: back() undoes the last step taken here (a
// card picked, a choice half made) and says whether it did; if not, the game shuts the screen.
//
// Keys of its own, while it is up (none of them while typing, and never one the player has bound to a menu): a digit
// picks a card of the hand, the arrows move along the hand and through the rows it may go to, Enter plays it, holding
// Space for 0.6 s passes, Backspace or a right click puts it back.
import { STARTER } from '../../shared/cards.js';
import { el, svgEl, replay, button, iconButton } from './dom.js';
import { glyph } from './icons.js';
import { DeckBuilder } from './carddeck.js';
import { TradeView } from './cardtrade.js';
import { RevealView } from './cardreveal.js';
import { TableView } from './cardtable.js';
import { AsksView } from './cardasks.js';
import { ChooserView } from './cardchooser.js';
import { LobbyTablesView } from './cardlobby.js';
import { PracticeView } from './cardpractice.js';
import { guestKeeps } from './cardwidgets.js';
import { GuideView, guideOffered } from './cardguide.js';
import { bindLabel, liveText, actionsOf } from '../game/binds.js';
import { ACTION } from '../../shared/binds.js';
import { cardTally, tallyText } from '../../shared/collections.js';

const TABS = [
  ['table', 'Table'],
  ['lobby', 'Lobby'],
  ['deck', 'Decks'],
  ['trade', 'Trade'],
  ['asks', 'Challenges'],
  ['practice', 'Practice'],
];

// ================================================================ the screen
export class CardsScreen {
  constructor(ui, parent) {
    this.ui = ui;
    this.open = false;
    this.onClose = null; // the game's
    this.c = null; // game/cards.js CardsClient (bind)
    this.view = 'table';
    this.target = 0; // the chooser's teammate
    this.dirty = true;
    this.packOnly = false; // opened on a pack's reveal: the last pack taken shuts the screen (back to the game)

    this.root = el('div', 'cdscr', parent);
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Dead Hand');
    const bg = el('div', 'cd-bg', this.root);
    const frame = (this.frame = el('div', 'cd-frame', this.root));
    const head = el('div', 'map-head cd-head', frame);
    const title = el('span', 'map-title cd-title', head);
    svgEl('i', 'cd-title-ico', title, glyph('cards'));
    el('span', '', title, 'Dead Hand');
    const seg = el('div', 'set-seg cd-tabs', head);
    this.tabs = new Map();
    for (const [id, label] of TABS) {
      const b = button('seg-btn cd-tab', seg);
      el('span', '', b, label);
      const n = el('b', 'cd-badge', b, '');
      n.hidden = true;
      b.addEventListener('click', () => this.show(id));
      this.tabs.set(id, { b, n });
    }
    const help = iconButton('btn btn-ghost cd-help', head, glyph('question'));
    el('span', '', help, 'How to play');
    help.setAttribute('aria-label', 'How to play Dead Hand');
    help.addEventListener('click', () => this.openGuide());
    this.count = el('span', 'map-coords cd-count', head, '');
    const close = (this.close = iconButton('set-close btn-icon map-close', head, glyph('xmark')));
    close.setAttribute('aria-label', 'Close Dead Hand');
    liveText(close, () => `Close (${bindLabel('cards')})`, 'title');
    close.addEventListener('click', () => this.onClose?.());

    const body = (this.body = el('div', 'cd-body', frame));
    this.views = {
      table: new TableView(this, body),
      deck: new DeckBuilder(this, body),
      trade: new TradeView(this, body),
      asks: new AsksView(this, body),
      lobby: new LobbyTablesView(this, body),
      practice: new PracticeView(this, body),
      chooser: new ChooserView(this, body),
      reveal: new RevealView(this, body),
      guide: new GuideView(this, body),
    };
    for (const v of Object.values(this.views)) v.root.hidden = true;

    this.keys = el('div', 'map-keys cd-keys', frame);

    // a click outside the frame shuts it; a right click anywhere on it puts the card picked back
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target === bg || e.target === this.root)) this.onClose?.();
    });
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.views.table.deselect();
    });
    // the focus goes round inside it
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const all = [...this.root.querySelectorAll('button:not(:disabled), select, input')].filter((b) => b.offsetParent !== null);
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
    this.onKeyDown = (e) => this.key(e, true);
    this.onKeyUp = (e) => this.key(e, false);
  }

  bind(client) {
    this.c = client;
  }

  setOpen(open, view = null) {
    open = !!open;
    if (open === this.open) {
      if (open && view) this.show(view);
      return;
    }
    this.open = open;
    this.root.hidden = !open;
    this.ui.root.classList.toggle('cards-open', open);
    if (open) {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      this.returnFocus = document.activeElement;
      const to = view || this.pickView();
      this.packOnly = to === 'reveal';
      // the first time: "New to Dead Hand?" over what it opens on (not with a match under way against somebody:
      // their clock is running, and it is asked the next time)
      if (!guideOffered() && !(this.c?.s.match && !this.c.s.match.local)) {
        this.views.guide.start(true, to);
        this.show('guide', true);
      } else this.show(to, true);
      this.close.focus({ preventScroll: true, focusVisible: false }); // (no ring on it: it was opened, not tabbed to)
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.views.table.cancelHolds();
      this.views.table.deselect(false);
      if (this.returnFocus?.isConnected && !this.returnFocus.closest?.('[hidden]')) this.returnFocus.focus({ preventScroll: true });
      this.returnFocus = null;
    }
  }

  // How to play: the guide's first page, over the view that was up
  openGuide() {
    if (this.view !== 'guide') this.views.guide.start(false, this.view);
    else this.views.guide.start(false, this.views.guide.from);
    this.show('guide', true);
  }

  // the view to open on: a pack to open, the trade, the match, an ask waiting, else the table
  pickView() {
    const s = this.c?.s;
    if (!s) return 'table';
    if (s.reveals.length) return 'reveal';
    if (s.trade) return 'trade';
    if (s.match) return 'table';
    if (this.c?.isLobby) return 'lobby';
    if (s.asks.some((a) => a.to === this.c.myId)) return 'asks';
    return this.view === 'chooser' || this.view === 'reveal' || this.view === 'trade' || this.view === 'guide' ? 'table' : this.view;
  }

  show(view, force = false) {
    if (!this.views[view]) view = 'table';
    if (view === 'lobby' && !this.c?.isLobby) view = 'table';
    if (view === 'trade' && !this.c?.s.trade) view = 'table';
    if (view === this.view && !force && !this.dirty) return this.render('view');
    if (this.view !== view) this.views[this.view]?.leave?.();
    if (view !== 'reveal' && view !== 'guide') this.packOnly = false; // (the player went on to something else here)
    this.view = view;
    for (const [id, v] of Object.entries(this.views)) v.root.hidden = id !== view;
    this.root.dataset.view = view;
    this.dirty = true;
    this.render('view');
  }

  // the store changed (what: which part of it): only drawn while the screen is up
  render(what = 'all') {
    if (!this.c) return;
    if (!this.open) {
      this.dirty = true;
      return;
    }
    const s = this.c.s;
    // (a new match takes the screen to the table; a new trade to the trade; a pack to its reveal, once nothing is
    // under way at the table)
    if (what === 'match-new' && this.view !== 'deck') return this.show('table');
    if (what === 'trade-new' && this.view !== 'table') return this.show('trade');
    if (what === 'trade-end' && this.view === 'trade') return this.show('table');
    if (what === 'reveal' && !s.match && this.view !== 'deck' && this.view !== 'trade' && this.view !== 'guide') return this.show('reveal');
    this.dirty = false;
    const mine = s.asks.filter((a) => a.to === this.c.myId).length;
    this.tabs.get('trade').b.hidden = !s.trade;
    this.tabs.get('lobby').b.hidden = !this.c.isLobby;
    const asks = this.tabs.get('asks');
    asks.n.hidden = !mine;
    asks.n.textContent = String(mine);
    const tb = this.tabs.get('table');
    tb.n.hidden = !s.match;
    tb.n.textContent = s.match ? (s.match.local ? 'practice' : 'live') : '';
    const lb = this.tabs.get('lobby');
    lb.n.hidden = !this.c.isLobby || !s.tables?.length;
    lb.n.textContent = String(s.tables?.length || 0);
    for (const [id, t] of this.tabs) t.b.classList.toggle('on', id === this.view);
    const found = Object.values(s.found).reduce((a, n) => a + n, 0);
    const all = Object.values(STARTER).reduce((a, n) => a + n, 0) + found;
    const keep = !s.loaded ? '' : !s.kept ? ' · not kept: sign in to keep them' : guestKeeps(s) ? ' · in this browser only: sign in to keep them' : ' · kept';
    this.count.textContent = `${tallyText(cardTally(s.found))} kinds · ${all} cards · ${found} found${keep}`;
    this.views[this.view].render(what);
    this.renderKeys();
  }

  renderKeys() {
    const k = this.keys;
    const key = this.view + (this.views.table.sel ? 's' : '');
    if (k.dataset.key === key) return;
    k.dataset.key = key;
    k.textContent = '';
    const add = (caps, t) => {
      const s = el('span', 'gh', k);
      for (const c of caps) el('span', 'kbd sm', s, c);
      el('span', '', s, t);
    };
    if (this.view === 'table') {
      add(['1', '…', '0'], 'pick a card');
      add(['←', '→'], 'move');
      add(['↑', '↓'], 'choose a row');
      add(['Enter'], 'play');
      add(['Space'], 'hold to pass');
      add(['Backspace'], 'put back');
    } else if (this.view === 'guide') {
      add(['←', '→'], 'page');
      add(['Enter'], 'next');
    }
    add([bindLabel('cards')], 'close');
    add(['Esc'], this.view === 'table' && this.views.table.sel ? 'put back' : 'close');
  }

  animate(evs) {
    if (this.open && this.view === 'table') this.views.table.animate(evs);
  }

  // every frame while it is up: the clocks (DOM only when a second ticks over)
  tick() {
    if (this.view === 'table') this.views.table.tick();
    else if (this.view === 'asks' || this.view === 'chooser') this.views[this.view].tick?.();
  }

  // something hurt the player while the cards were out: the frame's edge goes red
  hurt() {
    replay(this.frame, 'hurt');
  }

  // Esc: undo the last step taken here -> whether there was one (if not, the game shuts the screen)
  back() {
    if (this.view === 'table') return this.views.table.back();
    if (this.view === 'deck') return this.views.deck.back();
    if (this.view === 'guide') return this.views.guide.back();
    return false;
  }

  // the screen's own keys (window, while it is up)
  key(e, down) {
    if (this.ui.isTyping()) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'SELECT' || tag === 'INPUT') return;
    if (actionsOf(e.code).some((a) => ACTION[a]?.menu)) return; // (the player's menu keys are the game's: they shut it)
    if (this.view === 'table') this.views.table.key(e, down);
    else if (this.view === 'guide') this.views.guide.key(e, down);
    else if (this.view === 'reveal' && down && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      this.views.reveal.next();
    }
  }
}

