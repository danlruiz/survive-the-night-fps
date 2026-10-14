// What Dead Hand in a game (server/cards.js, with server/cards/matches.js and trades.js) and Dead Hand in the lobby
// (server/lobbycards.js) share on the server: the random source, the allowance of messages, the checks on what a
// client sends (a move, the loadout items a match is played for), the deck a player plays with, a match's events held
// for a player, and how a loadout item is shown.
import { randomBytes } from 'node:crypto';
import { defaultDeck, validateDeck, F, DECK_SLOTS } from '../../shared/cards.js';
import { CARDNOTE } from '../../shared/protocol.js';
import * as CG from '../../shared/cardgame.js';

// from the OS's random source (packs, the matches' seeds): never from anything a client is told
export const cryptoRand = () => randomBytes(4).readUInt32LE(0) / 0x100000000;
export const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const LOADOUT_ITEM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// what of a player's view of the cards has changed, to go out to them (Cards.dirty)
export const D = { COLL: 1, DECKS: 2, ASKS: 4, MATCH: 8, TRADE: 16, ALL: 31 };
export const ALLOW_BURST = 20; // C2S.CARDS a player may send in a row...
export const ALLOW_EVERY = 0.2; // ...then one every this many seconds
const EVENTS_MAX = 200; // a match's events held for a player between two MATCHes (more: the table alone says it)
export const STAKE_MAX = 12; // loadout items one side of a match may be played for
// deck slots an ask or an answer may name besides the four kept ones: the starter decks everyone has
export const STARTER_SLOTS = new Map([
  [-1, F.SURVIVORS],
  [-2, F.DEAD],
]);
const MOVE_T = new Set(['redraw', 'keep', 'play', 'leader', 'choose', 'pass', 'forfeit']);

// which side of a match or a trade (0 or 1) player pid is on: -1, neither
export const sideOf = (x, pid) => x.sides.findIndex((s) => s.pid === pid);

// What of a match's events (shared/cardgame.js) the player on `side` is to be told, added to what is held for them
// (holder.events) until their next MATCH: all of it dropped instead when that would be too much
export function keepEvents(holder, events, side) {
  const mine = events?.length ? CG.eventsFor(events, side) : [];
  if (holder.events.length + mine.length > EVENTS_MAX) holder.events.length = 0;
  else holder.events.push(...mine);
}

// A move as the engine takes it, built only of what a move has (shared/cardgame.js): null when it is not one
export function cleanMove(m) {
  if (!m || typeof m !== 'object' || !MOVE_T.has(m.t)) return null;
  const out = { t: m.t };
  for (const k of ['uid', 'row', 'target', 'pick']) {
    if (m[k] === undefined || m[k] === null) continue;
    if (!int(m[k], -1, 65535)) return null;
    out[k] = m[k];
  }
  if (m.discard !== undefined && m.discard !== null) {
    if (!Array.isArray(m.discard) || m.discard.length > 2 || !m.discard.every((v) => int(v, 0, 65535))) return null;
    out.discard = [...m.discard];
  }
  return out;
}

// The loadout items one side of a match is played for (d.stake, or d.items): distinct item ids, STAKE_MAX at most, or
// null when that is not what was sent
export function cleanStakeItems(d) {
  const raw = Array.isArray(d?.stake) ? d.stake : Array.isArray(d?.items) ? d.items : [];
  if (raw.length > STAKE_MAX) return null;
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    if (typeof id !== 'string' || !LOADOUT_ITEM_RE.test(id) || seen.has(id)) return null;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// The deck a player plays with: one of their four kept ones (slot 0-3, checked against what they have) or a starter
// deck (slot -1 the Survivors', -2 the Dead's). hasKey: they have an owner key; kept: what is kept for it ({ loaded,
// decks, found }; none: nothing yet). -> { deck } or { error: CARDNOTE, arg }
export function chooseDeck(slot, hasKey, kept) {
  if (slot === undefined || slot === null) slot = -1;
  if (STARTER_SLOTS.has(slot)) return { deck: defaultDeck(STARTER_SLOTS.get(slot)) };
  if (!int(slot, 0, DECK_SLOTS - 1)) return { error: CARDNOTE.DECK, arg: 'slot' };
  if (!hasKey) return { error: CARDNOTE.NOKEY };
  if (!kept?.loaded) return { error: CARDNOTE.LOADING };
  const inSlot = kept.decks.find((dk) => dk.slot === slot);
  if (!inSlot) return { error: CARDNOTE.DECK, arg: 'empty' };
  const deck = { leader: inSlot.leader, cards: { ...inSlot.cards } };
  const v = validateDeck(deck, kept.found);
  return v.ok ? { deck } : { error: CARDNOTE.DECK, arg: String(v.errors?.[0] || 'invalid') };
}

// a loadout item as a client is shown it, by id, from a collection's items by id (catalog 0: not in it)
export function loadoutView(byId, id) {
  const it = byId.get(id);
  return it ? { id: it.id, catalog: it.catalog } : { id, catalog: 0 };
}
// ...each of ids, from a collection's items
export function loadoutViews(ids, items) {
  const byId = new Map((items || []).map((it) => [it.id, it]));
  return (ids || []).map((id) => loadoutView(byId, id));
}
