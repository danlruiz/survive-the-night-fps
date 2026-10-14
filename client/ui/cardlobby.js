// The Dead Hand screen's Lobby view (cards.js): lobby tables, no-bet matches from the splash.
import { el, svgEl, button } from './dom.js';
import { glyph } from './icons.js';
import { deckLabel, deckSelect, guestKeeps, renderStakeList, stakePicker } from './cardwidgets.js';

export class LobbyTablesView {
  constructor(screen, parent) {
    this.sc = screen;
    this.root = el('div', 'cd-view cd-lobby', parent);
    this.slot = 0;
  }

  get c() {
    return this.sc.c;
  }

  render() {
    const c = this.c;
    const s = c.s;
    const mine = s.tables?.find((t) => t.host === c.myId) || null;
    const guest = guestKeeps(s);
    const key = JSON.stringify([s.tables || [], s.decks, s.found, s.loadouts, s.loaded, s.kept, !!s.match, c.myId, guest]);
    if (this.root.dataset.key === key) return;
    this.root.dataset.key = key;
    const r = this.root;
    r.textContent = '';
    const box = el('div', 'cd-lobby-box paper', r);
    el('div', 'cd-choose-h', box, 'Lobby tables');
    el('p', 'cd-hint', box, 'Open a no-bet table from the title screen, or join one that another player is waiting at. Found cards never change hands here.');
    if (guest) {
      const note = el('div', 'ach-note cd-lobby-guest', box);
      el('span', '', note, 'Your cards and loadout items are kept in this browser only: clearing its data, a private window or another device and they are out of reach. Sign in and they move onto your account.');
      const signIn = button('btn btn-ghost', note);
      svgEl('i', 'btn-ico', signIn, glyph('person'));
      el('span', '', signIn, 'Sign in');
      // (back to these tables once signed in: the lobby socket joins again as the account, game/cardlobby.js)
      signIn.addEventListener('click', () => {
        this.sc.onClose?.();
        this.sc.ui.accountPanel.show({ after: { show: () => this.sc.ui.cb.onLobbyCards?.() } });
      });
    }

    if (s.match && !s.match.local) {
      const live = el('div', 'cd-lobby-live', box);
      el('b', '', live, `You are playing ${c.name(s.match.opp)}`);
      const back = button('btn btn-blood', live, 'Back to table');
      back.addEventListener('click', () => this.sc.show('table'));
      const leave = button('btn btn-ghost', live, 'Give up');
      leave.addEventListener('click', () => c.leaveTable());
      return;
    }

    const mineBox = el('div', 'cd-lobby-open', box);
    el('div', 'fr-h', mineBox, mine ? 'Your open table' : 'Open a table');
    if (mine) {
      el('p', 'cd-hint', mineBox, `Waiting for someone to join with ${deckLabel(c, mine.slot)}.`);
      const cancel = button('btn btn-ghost', mineBox, 'Cancel table');
      cancel.addEventListener('click', () => c.leaveTable());
    } else {
      this.slot = c.lastSlot();
      this.stake ||= [];
      const f = el('label', 'cd-field', mineBox);
      el('span', '', f, 'Your deck');
      deckSelect(f, c, (v) => (this.slot = v));
      const sf = el('div', 'cd-field', mineBox);
      el('span', '', sf, 'Loadout item wager');
      stakePicker(sf, s.loadouts, this.stake, (ids) => (this.stake = ids));
      const open = button('btn btn-blood', mineBox, 'Open table');
      open.disabled = !s.loaded;
      open.addEventListener('click', () => c.openTable(this.slot, this.stake || []));
      if (!s.loaded) el('p', 'cd-hint warn', mineBox, 'Your collection is still loading.');
    }

    const list = el('div', 'cd-lobby-list', box);
    el('div', 'fr-h', list, 'Open tables');
    const others = (s.tables || []).filter((t) => t.host !== c.myId);
    if (!others.length) el('p', 'cd-none', list, mine ? 'Nobody else is waiting at a table.' : 'No open tables yet. Start one and other lobby players can join.');
    for (const t of others) {
      const row = el('div', 'cd-lobby-row', list);
      const who = el('div', 'cd-lobby-who', row);
      el('b', '', who, t.name || c.name(t.host));
      el('span', '', who, `waiting with ${this.tableDeck(t)}`);
      if (t.stake?.length) renderStakeList(el('div', 'cd-lobby-stake', row), t.stake, '');
      const join = button('btn btn-ghost', row, 'Join');
      join.disabled = !s.loaded || !!mine;
      let stake = [];
      const wager = el('div', 'cd-lobby-stake', row);
      stakePicker(wager, s.loadouts, stake, (ids) => (stake = ids));
      join.addEventListener('click', () => {
        const slot = c.lastSlot();
        c.joinTable(t.id, slot, stake);
      });
    }
  }

  tableDeck(t) {
    if (t.host === this.c.myId) return deckLabel(this.c, t.slot);
    if (t.slot === -1) return 'the Survivors starter deck';
    if (t.slot === -2) return 'the Dead starter deck';
    return 'a saved deck';
  }
}
