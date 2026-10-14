// A player's record: their XP and level (shared/progress.js: what this run earned, by source, on top of what their
// record held), the perks in force, and the leaderboard's tallies (stats.js: credit, sendBoard). What they had is
// loaded as they join (loadProgress; a game in a room's worker hears it from the network thread: onProgress) and
// what this run earns goes to the client as it changes (sendProgress).
import { PHASE, PLAYER_MAX_HP, STAMINA_MAX } from '../../shared/constants.js';
import { S2C, CHATF, PROGF, Writer, writeBoard } from '../../shared/protocol.js';
import { XP, XPS, XP_SRC, levelOf, perkMask } from '../../shared/progress.js';
import { playerMods } from '../loadouts.js';

const WEDGED_FOR = 15; // s one of the dead has been after a survivor without getting anywhere (z.wedgeT): its kill earns no XP

export const methods = {
  // What a joining player has earned before: their XP, the furthest day they have seen and the perks they picked.
  // The file-kept records answer at once; a game in a room's worker hears from the network thread (onProgress).
  loadProgress(p) {
    if (!p.rec) return this.setProgress(p, { first: true, xp: 0, perks: [], best: 0 }); // (nothing kept: nothing to load)
    if (this.records.remote) return;
    const got = this.records.progress?.(p.rec);
    if (got && typeof got.then === 'function') got.then((v) => v && this.players.get(p.id) === p && this.setProgress(p, { first: true, ...v }));
    else if (got) this.setProgress(p, { first: true, ...got });
  },
  // the network thread's answer for the record with this token (room-worker.js)
  onProgress(tok, m) {
    for (const p of this.players.values()) if (p.rec && p.rec.tok === tok) this.setProgress(p, m);
  },
  // ...and its bestiary (an account's: userbestiary.js)
  onBestiary(tok, mask) {
    this.bestiary.loaded(tok, mask);
  },
  // m: { first, xp, perks, best } as they join, { perks } when they pick again (validated by whoever sent it:
  // stats.js cleanPerks, server/progress.js)
  setProgress(p, m) {
    // (one brought over from the last server has theirs: the record already holds this run's XP, xpRun has it too)
    if (m.first && p.xpLoaded) return;
    if (m.first) {
      p.xpBase = Math.max(0, m.xp | 0);
      p.best = Math.max(0, m.best | 0);
      p.xpLoaded = true;
      this.playersDirty = true;
    }
    if (Array.isArray(m.perks)) {
      const mask = perkMask(m.perks);
      // a pick made while the night is on waits for dawn: nobody changes their kit mid-fight
      if (m.first || !this.fighting()) {
        if (!m.first && mask !== p.perks) this.sendChat(p, 0, CHATF.SYSTEM, 'Your perks are in force.');
        this.applyPerks(p, mask);
        p.perksNext = -1;
      } else if (mask !== p.perks) {
        p.perksNext = mask;
        this.sendChat(p, 0, CHATF.SYSTEM, 'Your new perks come into force at dawn.');
      }
    }
    p.progDirty = true;
  },
  fighting() {
    return this.phase === PHASE.NIGHT || this.escape.active;
  },
  // The perks in force for a player are these now: into the simulation (s.perks: the client hears of it as of any
  // change to the state) and onto their health
  applyPerks(p, mask) {
    p.perks = mask >>> 0;
    p.state.perks = p.perks;
    this.playersDirty = true; // (the player list carries everyone's perks, for their profile)
    if (!p.alive || p.zombie) return;
    const max = PLAYER_MAX_HP + playerMods(p).hp;
    if (!p.downed) p.hp = Math.max(1, Math.min(max, p.hp + Math.max(0, max - p.maxHp)));
    p.maxHp = max;
  },
  xpOf(p) {
    let n = p.xpBase;
    for (const v of p.xpRun) n += v;
    return n;
  },
  levelOf(p) {
    return levelOf(this.xpOf(p));
  },
  // n XP for `src` (XPS), scaled by their perks and the difficulty: on this run's tally, and on their record with the
  // leaderboard's stats
  award(p, src, n) {
    if (!p) return;
    this.creditXp(p, src, this.xpScaled(p, n));
  },
  xpScaled(p, n) {
    return Math.round(n * playerMods(p).xp * this.diff.xp);
  },
  // n XP already scaled, for `src`
  creditXp(p, src, n) {
    if (n <= 0) return;
    const was = this.levelOf(p);
    p.xpRun[src] = (p.xpRun[src] | 0) + n; // (| 0: a run brought over from a build that had fewer sources)
    this.records.bump(p.rec, 'xp', n);
    p.progDirty = true;
    if (this.levelOf(p) !== was) this.playersDirty = true;
  },
  // one of the dead put down by a survivor: half what it was worth, the other half as the fresh-night bonus on the
  // night's first XP.killsFull, and nothing for one that had been stuck for a while (z.wedgeT) - the dead piled up at
  // a wall they will never get round
  killXp(p, z, headshot) {
    if (p.zombie) return;
    const pm = playerMods(p);
    if (pm.killStamina && p.alive && !p.downed) p.state.stamina = Math.min(STAMINA_MAX, p.state.stamina + pm.killStamina);
    if (pm.killHeal && p.alive && !p.downed) p.hp = Math.min(p.maxHp, p.hp + pm.killHeal);
    this.loadouts.onKill(p);
    if (z.wedgeT > WEDGED_FOR) return;
    if (z.boss) return this.award(p, XPS.bosses, XP.boss);
    const fresh = ++p.nightKills <= XP.killsFull;
    this.killPart(p, XPS.kills, XP.kinds[z.ztype] ?? XP.kill, fresh);
    if (headshot) this.killPart(p, XPS.headshots, XP.headshot, fresh);
  },
  // the half a kill always earns, and with a fresh night the rest as the bonus: scaled whole, so the two add up to
  // what the full amount scales to
  killPart(p, src, full, fresh) {
    const half = this.xpScaled(p, Math.ceil(full / 2));
    this.creditXp(p, src, half);
    if (fresh) this.creditXp(p, XPS.fresh, this.xpScaled(p, full) - half);
  },
  // A new night or a new day: the fresh-night bonus comes back. dawn: also what is earned for seeing it, and the
  // perks picked during the night come into force
  phaseXp(dawn, night = 0) {
    for (const p of this.players.values()) {
      p.nightKills = p.nightRevives = 0;
      p.lastChance = false;
      this.loadouts.resetNight(p);
      if (!dawn) continue;
      if (p.alive && !p.zombie) {
        this.award(p, XPS.nights, Math.min(XP.nightCap, XP.night * night));
        if (p.xpLoaded && this.day > p.best) {
          if (p.best > 0 || this.day > 2) this.award(p, XPS.best, XP.best); // (day 2 is everyone's first dawn: no record broken)
          p.best = this.day;
          this.records.best?.(p.rec, this.day);
        }
      }
      if (p.perksNext >= 0) {
        this.applyPerks(p, p.perksNext);
        p.perksNext = -1;
        this.sendChat(p, 0, CHATF.SYSTEM, 'Your new perks are in force.');
      }
    }
  },

  // S2C.PROGRESS: varu XP (on record, this run's in it), u8 PROGF, this run's XP by source. Sent when it changed,
  // once a second at most - at once when the run has just ended, for the end screen
  sendProgress(p) {
    if (!p.progDirty || (this.time - p.progT < 1 && this.phase !== PHASE.GAMEOVER && this.phase !== PHASE.VICTORY)) return;
    p.progDirty = false;
    p.progT = this.time;
    const w = new Writer(8 + 4 * XP_SRC.length);
    w.u8(S2C.PROGRESS);
    w.varu(this.xpOf(p));
    w.u8((p.xpLoaded ? PROGF.LOADED : 0) | (p.rec ? PROGF.KEPT : 0));
    for (let i = 0; i < XP_SRC.length; i++) w.varu(p.xpRun[i] | 0);
    p.session.conn.send(w.bytes());
    this.stats.bytesOut += w.o;
    this.stats.msgsOut++;
  },
  // One more of `stat` on the record of each of these players (stats.js). A record is credited once however many
  // of its sessions are among them (one browser, two tabs), and a player without one gets nothing.
  credit(players, stat) {
    const done = new Set();
    for (const p of players) {
      if (!p.rec || done.has(p.rec)) continue;
      done.add(p.rec);
      this.records.bump(p.rec, stat);
    }
  },

  // The leaderboard for the player who asked (C2S.BOARD), once a second at most
  sendBoard(p) {
    if (this.time - p.boardT < 1) return;
    p.boardT = this.time;
    const here = new Set();
    for (const q of this.players.values()) if (q.rec) here.add(q.rec);
    // a game in a room's worker has its records on the network thread, which answers the player itself (rooms.js)
    if (this.records.remote) return this.records.sendBoard(p.session.conn.slot, p.rec, here);
    const { total, rows } = this.records.board(p.rec, here);
    const w = new Writer(1024);
    w.u8(S2C.BOARD);
    writeBoard(w, total, rows);
    p.session.conn.send(w.bytes());
    this.stats.bytesOut += w.o;
    this.stats.msgsOut++;
  },
};
