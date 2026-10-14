// What the Dead Hand screen's views share (cards.js and its card*.js views): the deck a player picks, a card or
// loadout items bet, and whether a guest is keeping anything worth signing in for.
import { cardDef, DECK_SLOTS, validateDeck } from '../../shared/cards.js';
import { LOADOUT_RARITY_NAMES, loadoutDef } from '../../shared/loadout.js';
import { el, button } from './dom.js';
import { cardFace } from './cardface.js';
import { accountState } from '../net/account.js';

// a deck slot's name for a list: its own, or the leader's deck
export function deckLabel(c, slot) {
  if (slot === -1) return 'Starter deck: Survivors';
  if (slot === -2) return 'Starter deck: The Dead';
  const d = c.deckIn(slot);
  if (!d) return `Slot ${slot + 1}: empty`;
  const L = cardDef(d.leader);
  return `${d.name || (L ? `${L.name}'s deck` : `Deck ${slot + 1}`)}`;
}

// the decks a player may play: the kept slots with a legal deck, and the two starter decks. -> [[slot, label, ok]]
export function deckChoices(c) {
  const out = [];
  for (let i = 0; i < DECK_SLOTS; i++) {
    const d = c.deckIn(i);
    if (d) out.push([i, deckLabel(c, i), validateDeck(d, c.s.found).ok]);
  }
  out.push([-1, deckLabel(c, -1), true], [-2, deckLabel(c, -2), true]);
  return out;
}

// a <select> of decks, the last one played chosen
export function deckSelect(parent, c, onChange = null) {
  const sel = el('select', 'cd-select', parent);
  const fill = () => {
    sel.textContent = '';
    const last = String(c.lastSlot());
    for (const [slot, label, ok] of deckChoices(c)) {
      const o = el('option', '', sel, ok ? label : `${label} (not legal)`);
      o.value = String(slot);
      o.disabled = !ok;
      if (String(slot) === last) o.selected = true;
    }
  };
  fill();
  sel.addEventListener('change', () => onChange?.(slotOf(sel.value)));
  sel.refill = fill;
  return sel;
}
export const slotOf = (v) => Number(v) | 0;

// A guest (where there are accounts to keep things on) who has found cards or holds loadout items: kept in this
// browser only, under an id that goes with the browser's data (client/net/identity.js) - so they are asked to sign in
export const guestKeeps = (s) => {
  const a = accountState();
  return a.ready && a.accounts && !a.offline && !a.user && s.loaded && s.kept && (Object.values(s.found).some((n) => n > 0) || s.loadouts.length > 0);
};

// a row of found cards to bet one of (or none): onPick(id | 0). -> { count }: how many there were to choose from
export function betPicker(parent, c, onPick, none = true) {
  const box = el('div', 'cd-betpick', parent);
  const ids = Object.keys(c.s.found)
    .map(Number)
    .filter((id) => c.s.found[id] > 0 && cardDef(id))
    .sort((a, b) => cardDef(b).r - cardDef(a).r || a - b);
  let cur = null;
  const choose = (b, id) => {
    cur?.classList.remove('sel');
    cur = b;
    b.classList.add('sel');
    onPick(id);
  };
  if (none) {
    const b = button('btn cd-nobet sel', box, 'No bet');
    cur = b;
    b.addEventListener('click', () => choose(b, 0));
  }
  for (const id of ids) {
    const f = cardFace(id, { mini: true });
    f.classList.add('pickable');
    f.tabIndex = 0;
    f.title = `${cardDef(id).name} (you have ${c.s.found[id]} found)`;
    f.addEventListener('click', () => choose(f, id));
    box.appendChild(f);
  }
  return { count: ids.length };
}

function loadoutChip(owned, mine = false) {
  const def = loadoutDef(owned.catalog);
  const b = el(mine ? 'button' : 'div', `cd-loadout r${def?.rarity || 1}`);
  if (mine) b.type = 'button';
  el('b', '', b, def?.name || 'Loadout item');
  el('small', '', b, `${LOADOUT_RARITY_NAMES[def?.rarity] || 'Unknown'} · ${def?.type || 'item'}`);
  b.title = (def?.flavor || 'Permanent loadout item') + (mine ? ': click to move' : '');
  return b;
}

export function renderStakeList(parent, rows, empty = 'No items') {
  parent.textContent = '';
  if (!rows?.length) return el('p', 'cd-none', parent, empty);
  for (const it of rows) parent.appendChild(loadoutChip(it, false));
}

export function stakePicker(parent, rows, picked, onChange) {
  const box = el('div', 'cd-trade-loadouts', parent);
  const selected = new Set(picked || []);
  const available = rows || [];
  for (const it of available) {
    const b = loadoutChip(it, true);
    b.classList.toggle('sel', selected.has(it.id));
    b.addEventListener('click', () => {
      const next = new Set(selected);
      if (next.has(it.id)) next.delete(it.id);
      else next.add(it.id);
      selected.clear();
      for (const id of next) selected.add(id);
      b.classList.toggle('sel', selected.has(it.id));
      onChange([...next]);
    });
    box.appendChild(b);
  }
  if (!available.length) el('p', 'cd-none', box, 'No loadout items available to wager.');
  return box;
}
