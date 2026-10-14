// The Dead Hand screen's Practice view (cards.js): a match against the computer, no cards won or lost.
import { F, F_NAMES } from '../../shared/cards.js';
import { el, button } from './dom.js';
import { deckSelect } from './cardwidgets.js';

export class PracticeView {
  constructor(screen, parent) {
    this.sc = screen;
    this.root = el('div', 'cd-view cd-practice', parent);
    this.level = 'normal';
    this.opp = F.DEAD;
  }

  get c() {
    return this.sc.c;
  }

  render() {
    const c = this.c;
    const key = JSON.stringify([c.s.decks, !!c.s.match, c.s.found]);
    if (this.root.dataset.key === key) return;
    this.root.dataset.key = key;
    const r = this.root;
    r.textContent = '';
    const box = el('div', 'cd-practice-box paper', r);
    el('div', 'cd-choose-h', box, 'Practice vs the computer');
    el('p', 'cd-hint', box, 'A match for the practice: no cards are won or lost. It waits while the screen is shut.');
    this.slot = c.lastSlot();
    const f1 = el('label', 'cd-field', box);
    el('span', '', f1, 'Your deck');
    deckSelect(f1, c, (v) => (this.slot = v));
    const f2 = el('div', 'cd-field', box);
    el('span', '', f2, 'The computer plays');
    const seg = el('div', 'set-seg', f2);
    for (const [f, label] of [
      [F.SURVIVORS, F_NAMES[F.SURVIVORS]],
      [F.DEAD, F_NAMES[F.DEAD]],
    ]) {
      const b = button('seg-btn' + (f === this.opp ? ' on' : ''), seg, label);
      b.addEventListener('click', () => {
        this.opp = f;
        for (const x of seg.children) x.classList.toggle('on', x === b);
      });
    }
    const f3 = el('div', 'cd-field', box);
    el('span', '', f3, 'How hard');
    const seg2 = el('div', 'set-seg', f3);
    for (const [lv, label] of [
      ['easy', 'Easy'],
      ['normal', 'Normal'],
    ]) {
      const b = button('seg-btn' + (lv === this.level ? ' on' : ''), seg2, label);
      b.addEventListener('click', () => {
        this.level = lv;
        for (const x of seg2.children) x.classList.toggle('on', x === b);
      });
    }
    const acts = el('div', 'cd-over-acts', box);
    const go = button('btn btn-blood', acts, c.s.match?.local ? 'Deal again' : 'Deal');
    go.disabled = !!(c.s.match && !c.s.match.local);
    go.addEventListener('click', () => this.deal());
    if (c.s.match && !c.s.match.local) el('p', 'cd-hint warn', box, 'Finish your match first.');
  }

  deal() {
    const c = this.c;
    if (c.s.match && !c.s.match.local) return;
    c.practice(this.slot ?? c.lastSlot(), this.opp, this.level);
    this.sc.show('table');
  }
}
