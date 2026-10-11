// The pledge window (shared/pledge.js): as a run begins, each survivor with Skulls on their profile can chip in on the
// group offers and buy personal ones, then confirm or skip. The run is already on while it is open - the day clock
// runs - so the window is short and shuts as soon as everybody has decided. At the close the pledges are paid
// through the Skull ledger (userloadout.js, one entry per group offer with every pledger on it, so either all of a
// pool is paid or none of it), and what was paid for is handed out when the network thread says it went through.
//
// C2S.PLEDGE is JSON: { op: 'pledge', offer, amount } (a group offer: this player's share, 0 to take it back),
// { op: 'buy', offer, on } (a personal offer), { op: 'confirm' }, { op: 'skip' } (nothing for me: my picks dropped).
// S2C.PLEDGE is JSON too, to each player alone (view): the window as they see it, or the result once it has closed.
import { S2C, CHATF, Writer } from '../shared/protocol.js';
import { ITEM_DEFS, WEAPONS, isFirearm } from '../shared/defs.js';
import { PLEDGE, PLEDGE_KIND, GROUP_OFFERS, pledgeOffer, pledgeSpend, pooled } from '../shared/pledge.js';
import { addItem, freeSlot, invCap } from './inventory.js';

const ALLOW_BURST = 20; // C2S.PLEDGE a player may send in a row...
const ALLOW_RATE = 8; // ...and per second after that
const SEND_EVERY = 1; // s: the countdown is refreshed this often even when nothing else changed

export class Pledges {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.left = 0;
    this.run = 0; // runs this game has opened a window for (the ledger ids)
    this.picks = new Map(); // player id -> { group: Map(offer id -> skulls), own: Set(offer id), done: '' | 'confirm' | 'skip' }
    this.pending = new Map(); // ledger id -> { offer, to: player ids (group: null, everyone) }
    this.dirty = false;
    this.sendT = 0;
    this.allow = new Map(); // player id -> { n, at }
    this.w = new Writer(512);
  }

  // A run has begun (Game.startGame): a fresh window
  begin() {
    this.picks.clear();
    this.pending.clear();
    this.run++;
    this.open = true;
    this.left = PLEDGE.WINDOW_S;
    for (const p of this.game.players.values()) this.pick(p);
    this.dirty = true;
    this.sendT = 0;
  }

  // Everybody left (Game.resetToWaiting): the window goes with the run, unpaid
  cancel() {
    this.open = false;
    this.picks.clear();
  }

  pick(p) {
    let pk = this.picks.get(p.id);
    if (!pk) this.picks.set(p.id, (pk = { group: new Map(), own: new Set(), done: '' }));
    return pk;
  }

  // who can spend: their profile is known to the game and has been read (a guest without a browser id has none)
  balanceOf(p) {
    const o = p.rejoinKey ? this.game.loadouts.own.get(p.rejoinKey) : null;
    return o?.loaded ? Math.max(0, o.balance | 0) : 0;
  }
  // (one whose balance has not come in yet may yet: the window waits for them as for anybody)
  canSpend(p) {
    if (!p.rejoinKey || p.zombie) return false;
    const o = this.game.loadouts.own.get(p.rejoinKey);
    return !o?.heard || this.balanceOf(p) > 0;
  }

  joined(p) {
    if (!this.open) return;
    this.pick(p);
    this.dirty = true;
  }
  leave(p) {
    this.picks.delete(p.id);
    this.allow.delete(p.id);
    if (this.open) this.dirty = true;
  }
  // their Skull balance came in, or changed (Loadouts.fromStore)
  changed() {
    if (this.open) this.dirty = true;
  }

  onMessage(p, data) {
    const now = this.game.time;
    const a = this.allow.get(p.id) || { n: ALLOW_BURST, at: now };
    a.n = Math.min(ALLOW_BURST, a.n + (now - a.at) * ALLOW_RATE);
    a.at = now;
    this.allow.set(p.id, a);
    if (a.n < 1) return;
    a.n--;
    if (!this.open || !data || typeof data !== 'object') return;
    const pk = this.pick(p);
    const op = data.op;
    if (op === 'confirm' || op === 'skip') {
      if (op === 'skip') {
        pk.group.clear();
        pk.own.clear();
      }
      pk.done = op;
      this.dirty = true;
      return;
    }
    const offer = pledgeOffer(data.offer);
    if (!offer || !p.rejoinKey) return;
    const others = new Map(pk.group);
    others.delete(offer.id);
    const own = new Set(pk.own);
    own.delete(offer.id);
    const room = this.balanceOf(p) - pledgeSpend(others, own); // (what is left to them besides this offer)
    if (op === 'pledge' && offer.kind === PLEDGE_KIND.GROUP) {
      const rest = offer.price - (pooled(this.picks.values(), offer.id) - (pk.group.get(offer.id) || 0));
      const amount = Math.max(0, Math.min(Number.isFinite(data.amount) ? Math.floor(data.amount) : 0, rest, room));
      if (amount > 0) pk.group.set(offer.id, amount);
      else pk.group.delete(offer.id);
    } else if (op === 'buy' && offer.kind === PLEDGE_KIND.OWN) {
      if (data.on && offer.price <= room) pk.own.add(offer.id);
      else pk.own.delete(offer.id);
    } else return;
    pk.done = '';
    this.dirty = true;
  }

  update(dt) {
    if (!this.open) return;
    const prev = Math.ceil(this.left);
    this.left -= dt;
    if (Math.ceil(this.left) !== prev) this.sendT -= SEND_EVERY;
    // everybody who could spend has decided (and nobody who could not is kept waiting on)
    let waiting = false;
    for (const p of this.game.players.values()) {
      if (p.away || !this.canSpend(p)) continue;
      if (!this.picks.get(p.id)?.done) waiting = true;
    }
    if (this.left <= 0 || !waiting) this.close();
    this.sendT -= dt;
    if (this.dirty || this.sendT <= 0) this.sendAll();
  }

  ledgerId(tail) {
    const g = this.game;
    const code = String(g.code || 'game').replace(/[^0-9a-zA-Z_-]/g, '');
    return `pledge:${code}:${g.seed >>> 0}:${this.run}:${tail}`.slice(0, 96);
  }

  // Time is up, or everyone has decided: what was bought is paid for. A pool that is not full costs nobody anything
  close() {
    const g = this.game;
    this.open = false;
    const players = [...g.players.values()];
    const bought = [];
    const short = [];
    for (const offer of GROUP_OFFERS) {
      const entries = new Map();
      let total = 0;
      for (const p of players) {
        const n = this.picks.get(p.id)?.group.get(offer.id) || 0;
        if (!n || !p.rejoinKey) continue;
        entries.set(p.rejoinKey, (entries.get(p.rejoinKey) || 0) + n);
        total += n;
      }
      if (!total) continue;
      if (total < offer.price) {
        short.push(offer);
        continue;
      }
      this.pay(this.ledgerId(`g${offer.id}`), offer, null, [...entries].map(([owner, n]) => ({ owner, delta: -n })));
      bought.push(offer);
    }
    for (const p of players) {
      const pk = this.picks.get(p.id);
      if (!pk || !p.rejoinKey) continue;
      for (const id of pk.own) {
        const offer = pledgeOffer(id);
        this.pay(this.ledgerId(`p${p.id}:o${id}`), offer, p.id, [{ owner: p.rejoinKey, delta: -offer.price }]);
      }
    }
    for (const offer of short) for (const p of players) if (this.picks.get(p.id)?.group.has(offer.id)) g.sendChat(p, 0, CHATF.SYSTEM, `${offer.name} was not fully pledged: nobody paid for it.`);
    this.dirty = true;
    this.sendAll();
    this.picks.clear();
  }

  pay(id, offer, to, entries) {
    this.pending.set(id, { offer, to });
    this.game.loadouts.link.post({ op: 'spend', id, kind: 'pledge', entries, meta: { offer: offer.key, run: this.run } });
  }

  // The network thread's answer to a spend (LoadoutService.spendFromRoom)
  spent(m) {
    const job = this.pending.get(m.id);
    if (!job) return;
    this.pending.delete(m.id);
    const g = this.game;
    const { offer, to } = job;
    if (!m.ok) {
      const who = to == null ? [...g.players.values()] : [g.players.get(to)].filter(Boolean);
      for (const p of who) g.sendChat(p, 0, CHATF.SYSTEM, `${offer.name} could not be paid for (not enough Zombie Skulls): nobody was charged.`);
      return;
    }
    const who = to == null ? g.humans() : [g.players.get(to)].filter((p) => p && p.alive && !p.zombie);
    for (const p of who) {
      this.give(p, offer);
      g.sendChat(p, 0, CHATF.SYSTEM, offer.kind === PLEDGE_KIND.GROUP ? `Pledged together: ${offer.name}.` : `Bought with Skulls: ${offer.name}.`);
    }
  }

  // Hands an offer's goods to one survivor, the way a find would go: worn, in its weapon slot, else in the backpack
  give(p, offer) {
    const g = this.game;
    const s = p.state;
    const give = offer.give;
    for (const [cal, n] of give.ammo || []) if (cal >= 0 && cal < s.ammo.length) s.ammo[cal] += n;
    for (const [item, count] of give.items || []) {
      const def = ITEM_DEFS[item];
      if (!def) continue;
      if (def.cat === 'armor' && !p.armorItem) {
        p.armorItem = item;
        p.armor = p.armorMax = def.armor;
        continue;
      }
      if (def.cat === 'pack' && !p.backpackItem) {
        p.backpackItem = item;
        continue;
      }
      if (def.cat === 'weapon') {
        const slot = WEAPONS[item].slot;
        const mag = isFirearm(item) ? WEAPONS[item].mag : 0;
        if (!s.weapons[slot]) {
          s.weapons[slot] = item;
          if (slot === 0 || slot === 1) s.mags[slot] = mag;
          continue;
        }
        const at = freeSlot(p.inv, invCap(p));
        if (at >= 0) p.inv[at] = { item, count: 1, mag };
        else g.dropItem(item, 1, s.x, s.y, s.z, { spread: 0.8, mag });
        continue;
      }
      const put = addItem(p.inv, item, count, invCap(p));
      if (put < count) g.dropItem(item, count - put, s.x, s.y, s.z, { spread: 0.8 });
    }
    if (give.cat) g.cm.spawnBeside(s);
    p.invDirty = true;
    g.syncThrow(p);
    g.playersDirty = true;
  }

  // what one player sees: the window, or (closed) nothing but that it has
  view(p) {
    if (!this.open) return { open: false };
    const pk = this.picks.get(p.id) || { group: new Map(), own: new Set(), done: '' };
    const balance = this.balanceOf(p);
    const all = [...this.picks.values()];
    return {
      open: true,
      left: Math.max(0, Math.ceil(this.left)),
      balance,
      kept: !!p.rejoinKey,
      spend: pledgeSpend(pk.group, pk.own),
      done: pk.done,
      group: GROUP_OFFERS.map((o) => [o.id, pooled(all, o.id), pk.group.get(o.id) || 0]),
      own: [...pk.own],
      players: [...this.game.players.values()].filter((q) => !q.away).map((q) => [q.id, this.picks.get(q.id)?.done || '', this.canSpend(q) ? 1 : 0]),
    };
  }

  sendAll() {
    this.dirty = false;
    this.sendT = SEND_EVERY;
    for (const p of this.game.players.values()) this.send(p);
  }
  send(p) {
    if (p.away || !p.session?.conn) return;
    const w = this.w.reset();
    w.u8(S2C.PLEDGE);
    w.str(JSON.stringify(this.view(p)));
    p.session.conn.send(w.bytes());
  }
}

