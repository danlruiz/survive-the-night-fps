// Dead Hand in a game: the trades (laid onto Cards, server/cards.js, whose header has the whole flow: called on it as
// this.name(...)). Both put found cards and backpack items on their side (OFFER), or loadout items; any change takes
// both sides' READY and CONFIRM back; struck when both have confirmed - everything checked again, the items taken into
// the trade's keeping, the cards and loadout items moved by the network thread ('committing') before the items are
// handed over, or handed back when that fails.
import { randomUUID } from 'node:crypto';
import { CARDMSG, CARDNOTE } from '../../shared/protocol.js';
import { TRADE_REACH } from '../../shared/constants.js';
import { ITEM_DEFS, WEAPONS } from '../../shared/defs.js';
import { cardDef } from '../../shared/cards.js';
import { invCap, addItem, freeSlot } from '../inventory.js';
import { isLoadoutStack } from '../loadouts.js';
import { D, int, LOADOUT_ITEM_RE, loadoutView } from './common.js';

const OFFER_CARDS_MAX = 16; // kinds of card on one side of a trade (both sides' moves stay within usercards.js MOVES_MAX)
const OFFER_ITEMS_MAX = 12; // kinds of item
const OFFER_LOADOUT_MAX = 12; // permanent loadout item instances
const OFFER_N_MAX = 99;
const tradeCount = (inv, item) => inv.reduce((n, s) => n + (s && !isLoadoutStack(s) && s.item === item ? s.count : 0), 0);
function removeTradeItem(inv, item, count) {
  let left = count;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (!s || isLoadoutStack(s) || s.item !== item) continue;
    const take = Math.min(s.count, left);
    s.count -= take;
    left -= take;
    if (s.count <= 0) inv[i] = null;
  }
  return count - left;
}

// What goes on one side of a trade: { cards: { id: n }, items: [[item, n]] } (duplicates added up), or null
function cleanOffer(d) {
  const cards = {};
  const items = new Map();
  const loadouts = [];
  const loadoutSeen = new Set();
  if (d.cards !== undefined) {
    if (!d.cards || typeof d.cards !== 'object' || Array.isArray(d.cards)) return null;
    const keys = Object.keys(d.cards);
    if (keys.length > OFFER_CARDS_MAX) return null;
    for (const k of keys) {
      const id = +k;
      const n = d.cards[k];
      if (!int(id, 1, 32767) || !cardDef(id) || !int(n, 0, OFFER_N_MAX)) return null;
      if (n) cards[id] = n;
    }
  }
  if (d.items !== undefined) {
    if (!Array.isArray(d.items) || d.items.length > OFFER_ITEMS_MAX) return null;
    for (const row of d.items) {
      if (!Array.isArray(row) || row.length !== 2) return null;
      const [item, n] = row;
      const def = int(item, 1, 255) ? ITEM_DEFS[item] : null;
      if (!def || def.cat === 'card' || def.cat === 'schem' || def.cat === 'ammo' || !int(n, 1, 9999)) return null;
      items.set(item, (items.get(item) || 0) + n);
    }
  }
  if (d.loadouts !== undefined) {
    if (!Array.isArray(d.loadouts) || d.loadouts.length > OFFER_LOADOUT_MAX) return null;
    for (const id of d.loadouts) {
      if (typeof id !== 'string' || !LOADOUT_ITEM_RE.test(id) || loadoutSeen.has(id)) return null;
      loadoutSeen.add(id);
      loadouts.push(id);
    }
  }
  return { cards, items: [...items], loadouts };
}

export const tradeMethods = {
  tradeOf(pid) {
    for (const t of this.trades.values()) if (t.sides.some((s) => s.pid === pid)) return t;
    return null;
  },

  openTrade(a, b) {
    const t = { id: ++this.seq, sides: [a, b].map((p) => ({ ...this.side(p), offer: { cards: {}, items: [], loadouts: [] }, ready: false, ok: false, x: p.state.x, y: p.state.y, z: p.state.z })), phase: 'open', escrow: null, xfer: '' };
    this.trades.set(t.id, t);
    for (const s of t.sides) this.dirty(s.pid, D.TRADE);
  },

  tradeMsg(t, i) {
    const me = t.sides[i];
    const them = t.sides[1 - i];
    const byOwner = (owner) => new Map((this.loadoutColl(owner)?.items || []).map((it) => [it.id, it]));
    const mineLoadouts = byOwner(me.owner);
    const theirLoadouts = byOwner(them.owner);
    const offer = (s, m) => ({ cards: { ...s.offer.cards }, items: s.offer.items.map((it) => [...it]), loadouts: (s.offer.loadouts || []).map((id) => loadoutView(m, id)) });
    return {
      with: them.pid,
      mine: offer(me, mineLoadouts),
      theirs: offer(them, theirLoadouts),
      loadouts: [...mineLoadouts.values()].map((it) => ({ id: it.id, catalog: it.catalog })),
      ready: [me.ready, them.ready],
      ok: [me.ok, them.ok],
      committing: t.phase === 'committing',
    };
  },

  unready(t) {
    for (const s of t.sides) {
      s.ready = false;
      s.ok = false;
      this.dirty(s.pid, D.TRADE);
    }
  },

  offer(p, d) {
    const t = this.tradeOf(p.id);
    if (!t || t.phase !== 'open') return this.note(p, CARDNOTE.NOTRADE);
    if (!this.standing(p)) return this.note(p, CARDNOTE.CANT);
    const o = cleanOffer(d);
    if (!o) return this.note(p, CARDNOTE.ITEMS);
    const ids = Object.keys(o.cards);
    const other = t.sides.find((s) => s.pid !== p.id);
    const hasCards = ids.length || Object.keys(other.offer.cards || {}).length;
    const hasBackpackItems = o.items.length || (other.offer.items || []).length;
    const hasLoadouts = o.loadouts.length || (other.offer.loadouts || []).length;
    if (hasLoadouts && (hasCards || hasBackpackItems)) return this.note(p, CARDNOTE.MIXED);
    if (ids.length) {
      if (!p.rejoinKey) return this.note(p, CARDNOTE.NOKEY);
      if (!this.own.get(p.rejoinKey)?.loaded) return this.note(p, CARDNOTE.LOADING);
      for (const id of ids) if (this.spare(p.rejoinKey, +id, t) < o.cards[id]) return this.note(p, CARDNOTE.CARDS, +id);
    }
    if (o.loadouts.length) {
      if (!p.rejoinKey) return this.note(p, CARDNOTE.NOKEY);
      if (!this.loadoutColl(p.rejoinKey)?.loaded) return this.note(p, CARDNOTE.LOADING);
      for (const id of o.loadouts) if (!this.hasLoadout(p.rejoinKey, id, t)) return this.note(p, CARDNOTE.LOADOUT);
    }
    for (const [item, n] of o.items) if (tradeCount(p.inv, item) < n) return this.note(p, CARDNOTE.ITEMS, item);
    t.sides.find((s) => s.pid === p.id).offer = o;
    this.game.loadouts?.tradeLock(t.id, p.rejoinKey, o.loadouts || []);
    this.unready(t);
  },

  ready(p, d) {
    const t = this.tradeOf(p.id);
    if (!t || t.phase !== 'open') return this.note(p, CARDNOTE.NOTRADE);
    const s = t.sides.find((x) => x.pid === p.id);
    if (d.on) s.ready = true;
    else this.unready(t);
    for (const x of t.sides) this.dirty(x.pid, D.TRADE);
  },

  confirm(p) {
    const t = this.tradeOf(p.id);
    if (!t || t.phase !== 'open') return this.note(p, CARDNOTE.NOTRADE);
    if (!t.sides.every((s) => s.ready)) return this.note(p, CARDNOTE.NOTREADY);
    t.sides.find((x) => x.pid === p.id).ok = true;
    for (const x of t.sides) this.dirty(x.pid, D.TRADE);
    if (t.sides.every((s) => s.ok)) this.commit(t);
  },

  // could this player take these items, with those going out first? (a clone of their backpack: Game.giveItem's rules)
  fits(p, outgoing, incoming) {
    const inv = p.inv.map((s) => s && { ...s });
    const weapons = [...p.state.weapons];
    for (const [item, n] of outgoing) removeTradeItem(inv, item, n);
    const cap = invCap(p);
    for (const [item, n] of incoming) {
      if (ITEM_DEFS[item].cat === 'weapon') {
        let left = n;
        const slot = WEAPONS[item].slot;
        if (!weapons[slot]) {
          weapons[slot] = item;
          left--;
        }
        for (; left > 0; left--) {
          const i = freeSlot(inv, cap);
          if (i < 0) return false;
          inv[i] = { item, count: 1 };
        }
      } else if (addItem(inv, item, n, cap) > 0) return false;
    }
    return true;
  },

  // the items out of their backpack, into the trade's keeping: [[item, count, mag]] (a gun keeps its magazine, a vest
  // its points)
  takeItems(p, items) {
    const out = [];
    for (const [item, n] of items) {
      if ((ITEM_DEFS[item].stack || 1) > 1) {
        out.push([item, removeTradeItem(p.inv, item, n), null]);
        continue;
      }
      let left = n;
      for (let i = p.inv.length - 1; i >= 0 && left > 0; i--) {
        const s = p.inv[i];
        if (!s || isLoadoutStack(s) || s.item !== item) continue;
        p.inv[i] = null;
        out.push([item, s.count, s.mag ?? null]);
        left -= s.count;
      }
    }
    p.invDirty = p.invSort = true;
    this.game.syncThrow(p);
    return out;
  },

  // items held by a trade to whoever of that side is here, or onto the ground where they were
  handOver(side, items) {
    const g = this.game;
    const p = this.present(side);
    const live = p && p.alive && !p.zombie;
    const at = p ? p.state : side;
    for (const [item, count, mag] of items || []) {
      if (!count) continue;
      const taken = live ? g.giveItem(p, item, count, mag ?? undefined) : 0;
      if (taken > 0) g.pickupEvent(p, item, taken);
      if (taken < count) g.dropItem(item, count - taken, at.x, at.y, at.z, { spread: 0.8, mag: mag ?? undefined });
    }
  },

  commit(t) {
    const g = this.game;
    const [a, b] = t.sides.map((s) => this.present(s));
    if (!a || !b) return this.endTrade(t, 'left');
    if (!this.standing(a) || !this.standing(b)) return this.endTrade(t, 'cancelled');
    if (this.apart(a, b) > TRADE_REACH) return this.endTrade(t, 'too_far');
    for (let i = 0; i < 2; i++) {
      const s = t.sides[i];
      for (const [card, n] of Object.entries(s.offer.cards)) if (this.spare(s.owner, +card, t) < n) return this.endTrade(t, 'not_owned');
      for (const id of s.offer.loadouts || []) if (!this.hasLoadout(s.owner, id, t)) return this.endTrade(t, 'not_owned');
      for (const [item, n] of s.offer.items) if (tradeCount([a, b][i].inv, item) < n) return this.endTrade(t, 'changed');
    }
    if (t.sides.some((s) => (s.offer.loadouts || []).length) && t.sides.some((s) => Object.keys(s.offer.cards).length || s.offer.items.length)) return this.endTrade(t, 'changed');
    if (!this.fits(a, t.sides[0].offer.items, t.sides[1].offer.items) || !this.fits(b, t.sides[1].offer.items, t.sides[0].offer.items)) return this.endTrade(t, 'no_room');
    t.escrow = [this.takeItems(a, t.sides[0].offer.items), this.takeItems(b, t.sides[1].offer.items)];
    [a, b].forEach((p, i) => Object.assign(t.sides[i], { x: p.state.x, y: p.state.y, z: p.state.z }));
    const moves = [];
    for (let i = 0; i < 2; i++) for (const [card, n] of Object.entries(t.sides[i].offer.cards)) moves.push([t.sides[i].owner, t.sides[1 - i].owner, +card, n]);
    const loadoutMoves = [];
    for (let i = 0; i < 2; i++) for (const id of t.sides[i].offer.loadouts || []) loadoutMoves.push([t.sides[i].owner, t.sides[1 - i].owner, id]);
    if (!moves.length && !loadoutMoves.length) return this.closeTrade(t, true);
    t.phase = 'committing';
    t.xfers = { cards: !moves.length, loadouts: !loadoutMoves.length, loadoutApplied: false };
    for (const s of t.sides) {
      this.use(s.owner);
      this.dirty(s.pid, D.TRADE);
    }
    if (moves.length) {
      t.xfer = `${randomUUID()}:trade`;
      this.xfer(t.xfer, 'trade', moves, t.id);
    }
    if (loadoutMoves.length) {
      t.loadoutXfer = `${randomUUID()}:loadout_trade`;
      this.xfer(t.loadoutXfer, 'loadout_trade', loadoutMoves, t.id);
    }
    g.log(`trade ${t.sides[0].name} - ${t.sides[1].name}: ${moves.length} card move(s), ${loadoutMoves.length} loadout item(s) going through`);
  },

  applyLoadoutTrade(t) {
    if (t.xfers?.loadoutApplied) return;
    t.xfers.loadoutApplied = true;
    for (const s of t.sides) {
      const ids = s.offer.loadouts || [];
      if (!ids.length) continue;
      const p = this.present(s);
      if (p) this.game.loadouts?.removeRunCopies(p, ids);
    }
  },

  finishTradeXfer(t, part) {
    if (!t || t.phase !== 'committing') return;
    t.xfers ||= { cards: true, loadouts: true, loadoutApplied: false };
    t.xfers[part] = true;
    if (!t.xfers.cards || !t.xfers.loadouts) return;
    this.applyLoadoutTrade(t);
    this.closeTrade(t, true);
  },

  // struck (done: the items change hands) or not (back to whoever put them in)
  closeTrade(t, done, why = 'done') {
    this.trades.delete(t.id);
    this.game.loadouts?.tradeUnlock(t.id);
    if (t.escrow) {
      this.handOver(t.sides[0], t.escrow[done ? 1 : 0]);
      this.handOver(t.sides[1], t.escrow[done ? 0 : 1]);
    }
    if (t.phase === 'committing') for (const s of t.sides) this.unuse(s.owner);
    t.sides.forEach((s, i) => this.out(this.present(s), CARDMSG.TRADE_END, { with: t.sides[1 - i].pid, why: done ? 'done' : why }));
  },

  // called off (one being committed goes through all the same)
  endTrade(t, why) {
    if (t.phase !== 'open') return;
    this.closeTrade(t, false, why);
  },
};
