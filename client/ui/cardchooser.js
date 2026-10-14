// The Dead Hand screen's chooser (cards.js): [E] on a teammate, a match (with a deck and maybe a bet) or a trade.
import { el, svgEl, button } from './dom.js';
import { glyph } from './icons.js';
import { deckSelect, betPicker, stakePicker } from './cardwidgets.js';

export class ChooserView {
  constructor(screen, parent) {
    this.sc = screen;
    this.root = el('div', 'cd-view cd-chooser', parent);
  }

  get c() {
    return this.sc.c;
  }

  render() {
    const c = this.c;
    const s = c.s;
    const id = this.sc.target;
    const out = s.asks.find((a) => a.from === c.myId && a.to === id);
    const inc = s.asks.find((a) => a.to === c.myId && a.from === id);
    const key = JSON.stringify([id, !!out, out?.kind, out?.stake, !!inc, !!s.match, !!s.trade, s.found, s.loadouts, s.decks.length]);
    if (this.root.dataset.key === key) return this.tick();
    this.root.dataset.key = key;
    const r = this.root;
    r.textContent = '';
    this.out = out;
    const who = c.name(id);
    const box = el('div', 'cd-choose-box paper', r);
    el('div', 'cd-choose-h', box, who);
    if (inc) {
      const n = el('div', 'cd-ask in', box);
      el('b', '', n, inc.kind === 'trade' ? `${who} asked you to trade` : `${who} has challenged you`);
      const b = button('btn', n, 'Answer');
      b.addEventListener('click', () => this.sc.show('asks'));
    }
    if (out) {
      const w = el('div', 'cd-wait', box);
      el('b', '', w, out.kind === 'trade' ? `Waiting for ${who} to answer your trade` : `Waiting for ${who} to take your challenge`);
      this.left = el('span', 'cd-ask-t', w, '');
      const b = button('btn btn-ghost', w, 'Withdraw');
      b.addEventListener('click', () => c.withdraw());
      return this.tick();
    }
    const busy = s.match && !s.match.local ? 'You already have a match going.' : s.trade ? 'You already have a trade open.' : '';
    const cols = el('div', 'cd-choose-cols', box);
    // a match
    const m = el('div', 'cd-choose-opt', cols);
    const mh = el('div', 'cd-choose-oh', m);
    svgEl('i', '', mh, glyph('cards'));
    el('span', '', mh, 'Challenge to Dead Hand');
    el('p', 'cd-hint', m, 'Best of three rounds. Bet one of your found cards if you like: the winner keeps both.');
    let slot = c.lastSlot();
    let bet = 0;
    let stake = [];
    const f1 = el('label', 'cd-field', m);
    el('span', '', f1, 'Your deck');
    deckSelect(f1, c, (v) => (slot = v));
    const f2 = el('div', 'cd-field', m);
    el('span', '', f2, 'Your bet');
    const bp = betPicker(f2, c, (v) => (bet = v));
    if (!bp.count) el('p', 'cd-hint', f2, 'No found cards to bet yet (the starter set stays yours).');
    const f3 = el('div', 'cd-field', m);
    el('span', '', f3, 'Loadout item wager');
    stakePicker(f3, s.loadouts, stake, (ids) => {
      stake = ids;
    });
    const go = button('btn btn-blood', m, 'Challenge');
    go.disabled = !!busy;
    go.addEventListener('click', () => c.ask(id, 'match', slot, bet, stake));
    // a trade
    const t = el('div', 'cd-choose-opt', cols);
    const th = el('div', 'cd-choose-oh', t);
    svgEl('i', '', th, glyph('container'));
    el('span', '', th, 'Trade');
    el('p', 'cd-hint', t, `Swap found cards and what is in your backpacks. Both of you see both sides, and nothing changes hands until both confirm. Stay within a few steps of ${who}.`);
    const tr = button('btn', t, 'Ask to trade');
    tr.disabled = !!busy;
    tr.addEventListener('click', () => c.ask(id, 'trade'));
    if (busy) el('p', 'cd-hint warn', box, busy);
  }

  tick() {
    if (!this.out || !this.left) return;
    const t = `${Math.max(0, Math.ceil(this.out.left - (performance.now() - this.out.at) / 1000))} s`;
    if (this.left.textContent !== t) this.left.textContent = t;
  }
}
