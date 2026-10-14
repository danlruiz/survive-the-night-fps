// The Dead Hand table's picker (cardtable.js): a choice of several moves made a step at a time, in the table's
// overlay. Methods laid onto TableView.
import { ROW_NAMES } from '../../shared/cards.js';
import { el, button, iconButton } from './dom.js';
import { glyph } from './icons.js';
import { cardFace, ROW_GLYPH } from './cardface.js';

export const pickerMethods = {
  // A choice of several moves that differ by what they pick (a card of a discard, of the deck, two of the hand to throw
  // away) and maybe a row: made a step at a time (field: the move's field naming the card picked; ids: it names a card
  // by its id - one of the deck's - not by its uid)
  openPicker(title, moves, field = 'pick', ids = false, cancel = true) {
    if (!moves.length) return;
    this.picker = { title, moves, field, ids, cancel, discard: [], picked: null, key: `pick:${title}:${moves.length}:${Math.random()}` };
    this.over.dataset.key = '';
    this.render();
  },

  closePicker() {
    if (!this.picker) return false;
    this.picker = null;
    this.render();
    return true;
  },

  renderPicker(o) {
    const P = this.picker;
    if (!P) return;
    const v = this.M.view;
    const me = v.me;
    const box = el('div', 'cd-over-box pick', o);
    el('div', 'cd-over-h', box, P.title);
    let moves = P.moves;
    // (Harvest: two of the hand to throw away first)
    if (moves[0].discard && P.discard.length < 2) {
      el('p', 'cd-over-p', box, `Pick 2 cards of your hand to discard (${P.discard.length} of 2).`);
      const cards = el('div', 'cd-over-cards', box);
      for (const h of v.sides[me].hand) {
        const f = cardFace(h.card);
        f.classList.add('pickable');
        f.classList.toggle('sel', P.discard.includes(h.uid));
        f.addEventListener('click', () => {
          const i = P.discard.indexOf(h.uid);
          if (i >= 0) P.discard.splice(i, 1);
          else P.discard.push(h.uid);
          P.key += '.';
          this.over.dataset.key = '';
          this.render();
        });
        cards.appendChild(f);
      }
    } else {
      if (moves[0].discard) moves = moves.filter((m) => m.discard.includes(P.discard[0]) && m.discard.includes(P.discard[1]));
      const picks = [...new Set(moves.map((m) => m[P.field]))];
      if (P.picked === null && picks.length > 1) {
        el('p', 'cd-over-p', box, 'Pick one.');
        const cards = el('div', 'cd-over-cards', box);
        for (const p of picks) {
          const id = P.ids ? p : this.cardOf(p);
          const f = cardFace(id);
          f.classList.add('pickable');
          f.addEventListener('click', () => {
            P.picked = p;
            this.pickerStep();
          });
          f.addEventListener('pointerenter', () => this.peek(id));
          cards.appendChild(f);
        }
      } else {
        if (P.picked === null) P.picked = picks[0];
        const left = moves.filter((m) => m[P.field] === P.picked);
        if (left.length > 1) {
          el('p', 'cd-over-p', box, 'Which row?');
          const acts = el('div', 'cd-over-acts rows', box);
          for (const m of left) {
            const b = iconButton('btn cd-rowbtn', acts, glyph(ROW_GLYPH[m.row]));
            el('span', '', b, ROW_NAMES[m.row]);
            b.addEventListener('click', () => this.finishPicker(m));
          }
        } else if (left.length === 1) {
          queueMicrotask(() => this.finishPicker(left[0]));
        }
      }
    }
    if (P.cancel) {
      const acts = el('div', 'cd-over-acts', box);
      const b = button('btn btn-ghost', acts, 'Cancel');
      b.addEventListener('click', () => this.closePicker());
    }
  },

  pickerStep() {
    if (!this.picker) return;
    this.picker.key += '.';
    this.over.dataset.key = '';
    this.render();
  },

  finishPicker(m) {
    this.picker = null;
    this.move(m);
  },
};
