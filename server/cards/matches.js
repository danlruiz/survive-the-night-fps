// Dead Hand in a game: the matches (laid onto Cards, server/cards.js, whose header has the whole flow: called on it as
// this.name(...)). Put up with loadout items ('staking', both confirm), the bets put into an escrow by the network
// thread ('locking'), played MOVE by MOVE ('live'), then the bets paid to the winner or given back ('paying') before
// MATCH_END goes out.
import { randomUUID } from 'node:crypto';
import { CARDMSG, CARDNOTE } from '../../shared/protocol.js';
import * as CG from '../../shared/cardgame.js';
import { D, cleanMove, loadoutViews, sideOf, keepEvents } from './common.js';

// a match being put up, played or having its bets put in, and not called off
export const inPlay = (m) => (m.phase === 'staking' || m.phase === 'live' || m.phase === 'locking') && !m.voided;

export const matchMethods = {
  side(p, bet = 0, stake = []) {
    const owner = p.rejoinKey || '';
    return { pid: p.id, owner, name: p.name, bet, stake: [...(stake || [])], stakeInfo: this.stakeView(stake || [], owner), ok: false };
  },
  startMatch(players, decks, bets, stakes = [[], []]) {
    const id = randomUUID();
    const hasStake = stakes.some((s) => s?.length);
    const m = { id, sides: players.map((p, i) => this.side(p, bets[i], stakes[i])), state: null, phase: hasStake ? 'staking' : 'locking', ver: 0, seed: Math.floor(this.rng() * 0x100000000) >>> 0, decks, locks: null, pays: null, voided: '', reason: '' };
    this.matches.set(id, m);
    for (const s of m.sides) this.dirty(s.pid, D.MATCH);
    if (hasStake) return;
    this.lockMatch(m);
  },
  lockMatch(m) {
    if (m.phase !== 'locking') m.phase = 'locking';
    const cardMoves = m.sides.filter((s) => s.bet).map((s) => [s.owner, `m:${m.id}`, s.bet, 1]);
    const loadoutMoves = m.sides.flatMap((s) => (s.stake || []).map((id) => [s.owner, id]));
    m.locks = { cards: !cardMoves.length, loadouts: !loadoutMoves.length };
    for (const s of m.sides) this.dirty(s.pid, D.MATCH);
    if (!cardMoves.length && !loadoutMoves.length) return this.go(m);
    if (cardMoves.length) this.xfer(`${m.id}:lock`, 'lock', cardMoves, m.id);
    if (loadoutMoves.length) this.xfer(`${m.id}:loadout_wager_lock`, 'loadout_wager_lock', loadoutMoves, m.id);
  },
  finishLock(m, part) {
    if (!m || m.phase !== 'locking') return;
    m.locks ||= { cards: true, loadouts: true };
    m.locks[part] = true;
    if (!m.locks.cards || !m.locks.loadouts) return;
    if (m.forfeitWinner === 0 || m.forfeitWinner === 1) {
      m.phase = 'paying';
      return this.settleMatch(m, 'pay', m.forfeitWinner);
    }
    if (m.voided) {
      m.phase = 'paying';
      return this.settleMatch(m, 'back', -1);
    }
    this.go(m);
  },
  // the bets are in (or there were none): it is played
  go(m) {
    m.state = CG.newMatch({ seed: m.seed, decks: m.decks });
    m.decks = null;
    m.phase = 'live';
    m.ver = 1;
    for (const s of m.sides) this.dirty(s.pid, D.MATCH);
  },
  // the match a player is playing (or whose bets are going in), or null
  matchOf(pid) {
    for (const m of this.matches.values()) if (inPlay(m) && m.sides.some((s) => s.pid === pid)) return m;
    return null;
  },
  // the loadout items a side plays for (ids), as its owner's collection has them
  stakeView(ids, owner = '') {
    return loadoutViews(ids, this.loadoutColl(owner)?.items);
  },
  // ...or the one they finished, still being paid out (what MATCH shows them)
  matchFor(pid) {
    let last = null;
    for (const m of this.matches.values()) {
      if (!m.sides.some((s) => s.pid === pid)) continue;
      if (inPlay(m)) return m;
      last = m;
    }
    return last;
  },
  // the table changed: a new version, and what happened to each side, which goes out with it
  changed(m, events) {
    m.ver++;
    m.sides.forEach((s, side) => {
      const st = this.ofP.get(s.pid);
      if (!st || this.game.players.get(s.pid) !== this.present(s)) return;
      st.dirty |= D.MATCH;
      keepEvents(st, events, side);
    });
  },
  move(p, d) {
    const m = this.matchOf(p.id);
    if (!m || m.phase !== 'live') return this.note(p, CARDNOTE.NOMATCH);
    const side = sideOf(m, p.id);
    if (d.v !== m.ver) {
      this.dirty(p.id, D.MATCH);
      return this.note(p, CARDNOTE.STALE);
    }
    const move = cleanMove(d.move);
    if (!move) return this.note(p, CARDNOTE.MOVE, 'bad');
    const r = CG.applyMove(m.state, side, move);
    if (!r.ok) {
      this.dirty(p.id, D.MATCH);
      return this.note(p, CARDNOTE.MOVE, String(r.error || 'refused').slice(0, 60));
    }
    this.changed(m, r.events);
    if (m.state.phase === 'over') this.end(m);
  },
  forfeit(p) {
    const m = this.matchOf(p.id);
    if (!m) return this.note(p, CARDNOTE.NOMATCH);
    if (m.phase === 'staking') return this.void(m, 'forfeit');
    if (m.phase === 'locking') {
      const side = sideOf(m, p.id);
      if (m.forfeitWinner !== 0 && m.forfeitWinner !== 1) m.forfeitWinner = side === 0 ? 1 : 0;
      m.reason = 'forfeit';
      return;
    }
    const r = CG.applyMove(m.state, sideOf(m, p.id), { t: 'forfeit' });
    if (r.ok) this.changed(m, r.events);
    if (m.state.phase === 'over') this.end(m);
  },
  stake(p, d) {
    const m = this.matchOf(p.id);
    if (!m || m.phase !== 'staking') return this.note(p, CARDNOTE.NOMATCH);
    const side = sideOf(m, p.id);
    const sk = this.stakeFor(p, d.items || d.stake || [], m);
    if (sk.error) return this.note(p, sk.error);
    m.sides[side].stake = sk.items;
    m.sides[side].stakeInfo = this.stakeView(sk.items, m.sides[side].owner);
    for (const s of m.sides) {
      s.ok = false;
      this.dirty(s.pid, D.MATCH);
    }
  },
  stakeConfirm(p, d) {
    const m = this.matchOf(p.id);
    if (!m || m.phase !== 'staking') return this.note(p, CARDNOTE.NOMATCH);
    const side = sideOf(m, p.id);
    const sk = this.stakeFor(p, m.sides[side].stake || [], m);
    if (sk.error) return this.note(p, sk.error);
    m.sides[side].ok = d.on !== false;
    for (const s of m.sides) this.dirty(s.pid, D.MATCH);
    if (!m.sides.every((s) => s.ok)) return;
    for (const s of m.sides) {
      const pl = this.present(s);
      const chk = pl ? this.stakeFor(pl, s.stake || [], m) : { error: CARDNOTE.GONE };
      if (chk.error) return this.void(m, 'not_owned');
    }
    this.lockMatch(m);
  },
  // the rules ended it: the bets to the winner, or back on a draw
  end(m) {
    if (m.phase !== 'live') return;
    const res = m.state.result || { winner: -1, reason: 'lives' };
    m.reason = res.reason || '';
    m.phase = 'paying';
    this.settleMatch(m, res.winner === 0 || res.winner === 1 ? 'pay' : 'back', res.winner);
  },
  // called off: nobody wins; bets back (once they are in: a lock still under way is waited for, onXfered)
  void(m, reason) {
    if (m.voided || m.phase === 'paying') return;
    m.voided = reason;
    m.reason = reason;
    if (m.phase === 'staking') return this.finish(m, true);
    if (m.phase === 'locking') return;
    m.phase = 'paying';
    this.settleMatch(m, 'back', -1);
  },
  settleMatch(m, how, winner = -1) {
    const hasCards = m.sides.some((s) => s.bet);
    const hasLoadouts = m.sides.some((s) => (s.stake || []).length);
    m.pays = { cards: !hasCards, loadouts: !hasLoadouts };
    if (!hasCards && !hasLoadouts) return this.finish(m, true);
    const esc = `m:${m.id}`;
    if (hasCards) {
      const moves = how === 'pay' && (winner === 0 || winner === 1) ? m.sides.map((s) => [esc, m.sides[winner].owner, s.bet, 1]) : m.sides.map((s) => [esc, s.owner, s.bet, 1]);
      this.xfer(`${m.id}:${how}`, how, moves, m.id);
    }
    if (hasLoadouts) {
      const moves = [];
      for (let i = 0; i < 2; i++) {
        const to = how === 'pay' && (winner === 0 || winner === 1) ? m.sides[winner].owner : m.sides[i].owner;
        for (const item of m.sides[i].stake || []) moves.push([m.sides[i].owner, to, item]);
      }
      this.xfer(`${m.id}:loadout_wager_${how}`, `loadout_wager_${how}`, moves, m.id);
    }
  },
  finishPay(m, part) {
    if (!m || m.phase !== 'paying') return;
    m.pays ||= { cards: true, loadouts: true };
    m.pays[part] = true;
    if (m.pays.cards && m.pays.loadouts) this.finish(m, true);
  },
  // Over and settled (paid: the bets are where the outcome sends them): the last table, then MATCH_END, to whoever of
  // the two is still here
  finish(m, paid) {
    this.matches.delete(m.id);
    const winner = m.state?.result?.winner ?? -1;
    m.sides.forEach((s, side) => {
      const p = this.present(s);
      const st = p && this.ofP.get(p.id);
      if (!st) return;
      if (st.dirty & D.MATCH && m.state && !this.matchOf(p.id)) {
        st.dirty &= ~D.MATCH;
        this.out(p, CARDMSG.MATCH, this.matchMsg(m, side, st));
      }
      const outcome = m.voided ? 'void' : winner === side ? 'win' : winner === 1 - side ? 'loss' : 'draw';
      this.out(p, CARDMSG.MATCH_END, { opp: m.sides[1 - side].pid, outcome, reason: m.reason, bet: { mine: s.bet, theirs: m.sides[1 - side].bet, paid }, stake: this.stakeEnd(m, side, paid) });
    });
  },
  matchMsg(m, side, st) {
    return { me: side, opp: m.sides[1 - side].pid, v: m.ver, bet: m.sides.map((s) => s.bet), stake: this.stakeMsg(m, side), view: m.state ? CG.viewFor(m.state, side) : null, events: st.events.splice(0) };
  },
  stakeMsg(m, side) {
    const me = m.sides[side];
    const them = m.sides[1 - side];
    return {
      phase: m.phase === 'staking' ? 'staking' : m.phase === 'locking' ? 'locking' : '',
      mine: this.stakeShown(me),
      theirs: this.stakeShown(them),
      loadouts: this.stakeView((this.loadoutColl(me.owner)?.items || []).map((it) => it.id), me.owner),
      ok: [!!me.ok, !!them.ok],
    };
  },
  stakeEnd(m, side, paid) {
    const mine = m.sides[side];
    const theirs = m.sides[1 - side];
    return { mine: this.stakeShown(mine), theirs: this.stakeShown(theirs), paid };
  },
  // the loadout items a side plays for as its players are shown them (kept from when they were put up)
  stakeShown(s) {
    return s.stakeInfo || this.stakeView(s.stake || [], s.owner);
  },
};
