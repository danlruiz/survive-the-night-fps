// The Dead Hand screen's Challenges view (cards.js): the asks to me, and mine.
import { el, button } from './dom.js';
import { cardFace } from './cardface.js';
import { bindLabel } from '../game/binds.js';
import { deckSelect, betPicker, renderStakeList, stakePicker } from './cardwidgets.js';

export class AsksView {
  constructor(screen, parent) {
    this.sc = screen;
    this.root = el('div', 'cd-view cd-asks', parent);
    this.secs = new Map();
  }

  get c() {
    return this.sc.c;
  }

  render() {
    const c = this.c;
    const s = c.s;
    const r = this.root;
    const key = JSON.stringify([s.asks.map((a) => [a.from, a.to, a.kind, a.bet, a.stake]), s.found, s.loadouts, s.decks.length, !!s.match]);
    if (r.dataset.key === key) return this.tick();
    r.dataset.key = key;
    r.textContent = '';
    this.secs.clear();
    const box = el('div', 'cd-asks-box paper', r);
    el('div', 'fr-h', box, 'Asked of you');
    const mine = s.asks.filter((a) => a.to === c.myId);
    if (!mine.length) el('p', 'cd-none', box, 'Nobody is waiting on you.');
    for (const a of mine) this.incoming(box, a);
    el('div', 'fr-h', box, 'Asked by you');
    const out = s.asks.filter((a) => a.from === c.myId);
    if (!out.length) el('p', 'cd-none', box, `Aim at a teammate and press ${bindLabel('interact')} to ask them for a match or a trade.`);
    for (const a of out) {
      const row = el('div', 'cd-ask out', box);
      el('b', '', row, a.kind === 'trade' ? `A trade with ${c.name(a.to)}` : `A match with ${c.name(a.to)}${a.bet ? ', for a card' : ''}`);
      this.secs.set(el('span', 'cd-ask-t', row, ''), a);
      const b = button('btn btn-ghost', row, 'Withdraw');
      b.addEventListener('click', () => c.withdraw());
    }
    this.tick();
  }

  incoming(box, a) {
    const c = this.c;
    const row = el('div', 'cd-ask in', box);
    const who = c.name(a.from);
    const head = el('div', 'cd-ask-h', row);
    el('b', '', head, a.kind === 'trade' ? `${who} wants to trade` : `${who} challenges you to Dead Hand`);
    this.secs.set(el('span', 'cd-ask-t', head, ''), a);
    const body = el('div', 'cd-ask-b', row);
    let slot = c.lastSlot();
    let bet = 0;
    let stake = [];
    if (a.kind === 'match') {
      const deck = el('label', 'cd-field', body);
      el('span', '', deck, 'Your deck');
      deckSelect(deck, c, (v) => (slot = v));
      if (a.bet) {
        const theirs = el('div', 'cd-field', body);
        el('span', '', theirs, 'They bet');
        theirs.appendChild(cardFace(a.bet, { mini: true }));
        const pick = el('div', 'cd-field', body);
        el('span', '', pick, 'Your bet (a found card)');
        const bp = betPicker(pick, c, (id) => {
          bet = id;
          yes.disabled = !bet;
        }, false);
        if (!bp.count) el('p', 'cd-hint', pick, 'You have no found cards to bet: you cannot take this one on.');
      }
      if (a.stake?.length) {
        const theirs = el('div', 'cd-field', body);
        el('span', '', theirs, 'They wager');
        renderStakeList(el('div', 'cd-offer', theirs), a.stake, 'No loadout items.');
      }
      const lf = el('div', 'cd-field', body);
      el('span', '', lf, 'Your loadout wager');
      stakePicker(lf, c.s.loadouts, stake, (ids) => {
        stake = ids;
      });
    }
    const acts = el('div', 'cd-ask-acts', row);
    const yes = button('btn btn-blood', acts, a.kind === 'trade' ? 'Trade' : 'Play');
    yes.disabled = a.kind === 'match' && !!a.bet && !bet;
    yes.addEventListener('click', () => c.answer(a.from, a.kind, true, slot, bet, stake));
    const no = button('btn btn-ghost', acts, 'No thanks');
    no.addEventListener('click', () => c.answer(a.from, a.kind, false));
  }

  tick() {
    const now = performance.now();
    for (const [n, a] of this.secs) {
      const t = `${Math.max(0, Math.ceil(a.left - (now - a.at) / 1000))} s`;
      if (n.textContent !== t) n.textContent = t;
    }
  }
}
