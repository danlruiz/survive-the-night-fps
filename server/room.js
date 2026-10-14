// One game on this server, as the network thread (index.js, sockets.js) sees it: its worker thread running the Game
// (room-worker.js), the sockets seated in it, the traffic between the two packed one message per batch each way
// (wire.js), the records it keeps on the leaderboard (stats.js), and what happens to it when the server goes down
// (handoff.js). The lobby (rooms.js) makes, finds, lists and restores them.
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as OWN_PROTOCOL from '../shared/protocol.js';
import { REJECT_REASON, ENDED_CODE, MOVED_CODE } from '../shared/protocol.js';
import { difficultyOf } from '../shared/difficulty.js';
import { PHASE } from '../shared/constants.js';
import { FramePacker, eachFrame } from './wire.js';
import { HANDOFF_CLOSE } from './handoff.js';
import { gameOutChannel } from './netmetrics.js';
import { idKey } from './stats.js';

// A WebSocket close frame's reason is at most 123 bytes of UTF-8: what fits of `text`, cut between two characters
export function closeReason(text, max = 120) {
  let out = String(text || '');
  while (Buffer.byteLength(out) > max) out = out.slice(0, -1);
  return out;
}

const SEND_LIMIT = 256 * 1024; // a socket with this much unsent is backed up: its snapshots are held back
export const WORKER_LIMITS = { maxOldGenerationSizeMb: 512 }; // a game that runs away with memory ends, not the server
// A game carried on by an older build (builds.js) for this long is closed at its next dawn, or when its run ends, so that
// a build's bugs - a fix the new one brings - do not outlive it by more than that. HANDOFF_PIN_MAX_HOURS
const PIN_MAX_HOURS = +(process.env.HANDOFF_PIN_MAX_HOURS ?? 12);
const PIN_RUN_OVER_MS = 90_000; // (a run over on an older build: its end screen stays up this long, then the game closes)

// a game's or a player's name as the lobby shows it: letters, digits and a little punctuation, at most `max` long
export const cleanTitle = (v, max) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _\-.'!?&#]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export class Room {
  // restore: the game the last server saved under this code (handoff.js), with first / created / continues from what
  // that server knew of the room (Room.meta). prepared: a worker that has built the game's valley already, waiting for
  // the save (Lobby.prepare). from: that save as it was claimed ({ meta, body }), kept until the game is up. pin: the
  // build whose code runs this game instead of this server's ({ id, dir, client, since }: builds.js), because this
  // server's could not read its save
  constructor(lobby, { code, name, host, inviteOnly, maxPlayers, quick, difficulty, startAct = 1, maker = '', restore = null, first = '', created = Date.now(), continues = null, prepared = null, from = null, pin = null }) {
    this.lobby = lobby;
    this.code = code;
    this.name = name; // as its maker called it ('' for one a quick join made)
    this.host = host; // who made it ('' for a quick join's: then whoever has been in it longest)
    this.maker = maker; // ...as the lobby knows them, for their one game at a time: u:<account id> or ip:<address> ('' for a quick join's)
    this.first = first; // the name the first socket in it joined under (a quick join's game is theirs until it has a lead)
    this.inviteOnly = inviteOnly;
    this.quick = quick;
    this.difficulty = difficultyOf(difficulty).id; // Ember, Nightfall or Blackout (a quick join, and a save from before this, is Nightfall)
    // the map every run of it begins on: 1 the island, 2 the mainland (acts.js MAINLAND_START). A game that starts on
    // the mainland is only for whoever has beaten map 1: making one (http/lobby.js POST /api/games) and joining (sockets.js map1Gate)
    this.startAct = startAct === 2 ? 2 : 1;
    this.maxPlayers = maxPlayers;
    this.created = created;
    this.emptySince = Date.now(); // (a restored game nobody comes back to closes as any empty one does)
    this.continues = continues; // the match the last server ended as 'handoff', which this game's next one carries on (matchstore.js)
    this.closed = false;
    this.ready = false;
    // sockets by slot. A slot whose socket closed stays taken until the worker says it is done with it (so nothing
    // still on its way out for the old socket can reach a new one): hence twice as many as the game has seats
    this.socks = new Array(maxPlayers * 2 + 2).fill(null);
    this.draining = new Uint8Array(this.socks.length);
    // per slot: the account its socket is signed in to ({ id, name, isAdmin }, null for a guest: sockets.js found it by the
    // session cookie), and the name its player joined under ('' before the JOIN)
    this.users = new Array(this.socks.length).fill(null);
    this.names = new Array(this.socks.length).fill('');
    this.keys = new Array(this.socks.length).fill(''); // per slot: who its player is, from its JOIN (keyOf, mayComeBack)
    this.match = null; // the id of the match being played in it, while one is (matchstore.js)
    this.open = 0; // live sockets (a seat each, joined or about to)
    this.inbox = new FramePacker();
    // (a prepared worker's was made for the most seats a game can have: at least as many slots as this one's)
    this.congestion = prepared && prepared.congestion.byteLength >= 4 * this.socks.length ? prepared.congestion : new SharedArrayBuffer(4 * this.socks.length);
    this.congested = new Int32Array(this.congestion);
    this.recs = new Map(); // the game's record tokens -> records (RemoteRecords in room-worker.js)
    this.st = { players: 0, held: 0, lead: '', phase: PHASE.WAITING, day: 0, seed: 0, tick: null, load: { cpuMs: 0, elu: 0 }, heapMb: 0 };
    this.saved = null; // (handoff: waiting for the worker's save)
    this.movingTo = null; // (handoff: the server it is being handed to, cluster.js)
    this.up = null; // (cluster.js: its row being written, which a new game's maker waits for)
    this.asks = new Map(); // the admin panel's questions the worker has not answered yet: id -> { done, fail, timer } (ask)
    this.askN = 0;
    this.restored = restore ? Date.now() : 0; // (when its save was claimed, for the log)
    this.from = from; // the save as it was claimed ({ meta, body }), kept until the game is up (handoff)
    this.pin = pin;
    // What this thread writes to the players itself (ROOM, BOARD, REJECT, the close codes) is in their client's codec:
    // an older build's, from that build's own shared/protocol.js, for a game it carries on (builds.js protocolOf)
    this.proto = pin?.proto || OWN_PROTOCOL;
    this.failed = 0; // why its save could not be used here (a REJECT_REASON), once the worker has said so
    this.after = false; // (Lobby.afterFailed has been through it)
    this.pinEnd = 0; // (a game on an older build: when it closes - pinCheck)
    this.started = new Promise((done) => (this.onStarted = done)); // (up, or closed without ever being: Lobby.settle)

    // (analytics: the game records its matches - only worth it with a database to write them to. achievements and the
    // bestiary: an account's go to the database too, and a guest's to their browser either way)
    const opts = { ...lobby.gameOpts, maxPlayers, inviteOnly, difficulty: this.difficulty, startAct: this.startAct, analytics: !!lobby.matches, achievements: !!lobby.achievements, bestiary: !!lobby.bestiary };
    this.builtAhead = !pin && !!prepared && this.congestion === prepared.congestion;
    if (this.builtAhead) {
      this.worker = prepared.worker;
      this.worker.postMessage({ t: 'start', opts, restore });
    } else {
      prepared?.worker.terminate().catch(() => {});
      // (an older build's worker: its own code, from where builds.js unpacked it)
      const url = pin ? pathToFileURL(join(pin.dir, 'server', 'room-worker.js')) : new URL('./room-worker.js', import.meta.url);
      this.worker = new Worker(url, { workerData: { code, opts, congestion: this.congestion, restore }, resourceLimits: WORKER_LIMITS });
    }
    this.worker.on('message', (m) => this.fromWorker(m));
    this.worker.on('error', (err) => {
      if (this.failed) return; // (its save could not be used, and it has said so)
      lobby.log(`game ${code} crashed:`, err);
      lobby.onIncident?.({ code, kind: 'crashed', text: String(err?.message || err).slice(0, 200) });
    });
    this.worker.on('exit', (exitCode) => {
      if (!this.closed && !this.failed) {
        lobby.log(`game ${code} stopped (exit ${exitCode})`);
        lobby.onIncident?.({ code, kind: 'stopped', text: `its thread ended by itself (exit ${exitCode}) with ${this.open} connected` });
      }
      this.shut(1011, 'Game ended');
      this.onStarted();
      if (this.failed) lobby.afterFailed(this);
    });
  }

  get title() {
    if (this.name) return this.name;
    const who = this.host || this.st.lead || this.first;
    return who ? `${who}'s game` : 'Open game';
  }
  // every socket a seat: no more can come in (attach)
  get full() {
    return this.open >= this.maxPlayers;
  }
  // ...or the seats left are kept for players who dropped, or who were brought over from the last server: no room for a
  // newcomer (a quick join, the lobby's list). Their own sockets still come in: the game knows them (Game.handleJoin)
  get noRoom() {
    return this.full || this.open + (this.st.held || 0) >= this.maxPlayers;
  }

  // what the lobby shows of it (its code included: list() only hands out public games', find() only to whoever has it)
  info() {
    const s = this.st;
    return { code: this.code, name: this.title, players: Math.max(s.players, 0), seats: this.open, max: this.maxPlayers, full: this.noRoom, phase: s.phase, day: s.day, seed: s.seed, inviteOnly: this.inviteOnly, difficulty: this.difficulty, map: this.startAct, ready: this.ready, ageS: Math.round((Date.now() - this.created) / 1000) };
  }

  // ---------------------------------------------------------------- sockets
  // A seat for this socket: its slot, or -1 when the game is full.
  // join: its JOIN, when the socket has sent it already (sockets.js seat waits for it at a full game: mayComeBack)
  attach(ws, join = null) {
    if (this.closed || (this.full && !this.mayComeBack(join && this.keyOf(join, ws.getUserData().user)))) return -1;
    const slot = this.socks.findIndex((s, i) => !s && !this.draining[i]);
    if (slot < 0) return -1;
    this.flushInbox(); // (in order with whatever is still on its way in)
    this.socks[slot] = ws;
    Atomics.store(this.congested, slot, 0);
    this.open++;
    this.emptySince = 0;
    const d = ws.getUserData();
    const user = d.user ? { id: d.user.id, name: d.user.name, isAdmin: d.user.isAdmin === true } : null;
    this.users[slot] = user;
    if (user) this.lobby.userIn(user.id, this);
    this.worker.postMessage({ t: 'open', slot, ip: d.ip, user, back: !!d.back });
    return slot;
  }

  // A full game still lets in a socket that is one of its own players coming back: its JOIN is from the same account,
  // or a guest's same browser id, as a socket in here. A lost link is often noticed by the page long before the server
  // sees its old socket go (idleTimeout), and that socket still fills its seat; the game gives the body to the new one
  // and lets the stale one go (Game.handleJoin / takeOver). (A few over at most: the slots kept for closed sockets
  // draining stay free)
  mayComeBack(key) {
    return !!key && this.open < 2 * this.maxPlayers && this.keys.includes(key);
  }
  // who a JOIN is from, as Game.handleJoin knows them: 'a:<account id>' signed in, 'g:<hash of the browser id>' a
  // guest's, '' neither (or not a JOIN)
  keyOf(bytes, user) {
    if (user) return `a:${user.id}`;
    try {
      const { C2S, Reader } = this.proto;
      const r = new Reader(bytes);
      if (r.u8() !== C2S.JOIN) return '';
      r.u8();
      r.str();
      const id = r.left > 0 ? idKey(r.str()) : '';
      return id ? `g:${id}` : '';
    } catch {
      return '';
    }
  }

  // code: the socket's close code (LEFT_CODE: the player left on purpose; anything else is a drop the game holds them through)
  detach(slot, code = 0) {
    if (this.socks[slot] === null) return;
    this.socks[slot] = null;
    const user = this.users[slot];
    this.users[slot] = null;
    this.names[slot] = '';
    this.keys[slot] = '';
    if (user) this.lobby.userOut(user.id, this);
    this.open--;
    if (!this.open) this.emptySince = Date.now();
    if (this.closed) return;
    this.flushInbox(); // everything they sent goes in before they leave
    this.draining[slot] = 1;
    this.worker.postMessage({ t: 'close', slot, code });
  }

  // a message from a socket, for the game (copied: uWS reuses the buffer). first: it is the socket's first
  deliver(slot, bytes, first = false) {
    if (this.closed) return;
    if (first) {
      this.keys[slot] = this.keyOf(bytes, this.users[slot]);
      this.greet(slot, bytes);
    }
    this.inbox.push(slot, bytes);
    this.lobby.queueFlush(this);
  }

  // What this thread writes to the players itself (ROOM, BOARD), in their own codec: write(this.proto). Should an older
  // build's codec throw on it after all, in this build's - a message the page may misread, never a network thread that
  // throws. what: the message, for the log
  inTheirCodec(what, write) {
    try {
      return write(this.proto);
    } catch (err) {
      if (this.proto === OWN_PROTOCOL) throw err;
      this.lobby.log(`game ${this.code}: its build's codec failed to write ${what} (${err.message}): written in this build's`);
      return write(OWN_PROTOCOL);
    }
  }

  // Tells a socket which game it is in, before the game answers its first message (its JOIN): a quick join learns
  // its code here, for its invite link. The game's first player names a quick join's game. (A signed-in player
  // plays under their account's name, as Game.handleJoin has it.)
  greet(slot, bytes) {
    this.inTheirCodec('ROOM', (proto) => this.greetIn(proto, slot, bytes));
  }
  greetIn(proto, slot, bytes) {
    const { C2S, S2C, ROOMF, Writer, Reader } = proto;
    if (bytes[0] === C2S.JOIN) {
      try {
        const r = new Reader(bytes);
        r.u8();
        r.u8();
        const name = this.users[slot]?.name || cleanTitle(r.str(), 16);
        if (!this.first) this.first = name;
        this.names[slot] = name || 'Survivor';
      } catch {}
    }
    const w = new Writer(128);
    w.u8(S2C.ROOM);
    w.str(this.code);
    w.str(this.title);
    w.u8(this.inviteOnly ? ROOMF.INVITE_ONLY : 0);
    w.str(this.difficulty); // after the flags, so a client from before difficulties never reads it
    w.u8(this.startAct); // ...and the map every run of it begins on, after that (acts.js WORLD)
    const out = w.bytes();
    if (this.socks[slot]) {
      this.lobby.netMetrics?.wsOut('game_room', out);
      this.socks[slot].send(out, true, false);
    }
  }
  flushInbox() {
    if (this.inbox.empty || this.closed) return;
    const buf = this.inbox.take();
    this.worker.postMessage({ t: 'in', buf }, [buf]);
  }

  // the game's messages for its sockets: each socket's run of them corked into one write
  sendOut(buf) {
    let ws = null;
    let at = -1;
    const runs = [];
    eachFrame(buf, (slot, bytes) => {
      if (slot !== at) {
        at = slot;
        ws = this.socks[slot];
        if (ws) runs.push(ws, slot, []);
      }
      if (ws) runs[runs.length - 1].push(bytes);
    });
    for (let i = 0; i < runs.length; i += 3) {
      const sock = runs[i];
      const slot = runs[i + 1];
      const msgs = runs[i + 2];
      // A backed-up client is held back by the game (congested: no snapshot until it drains), never by losing what
      // the game already wrote for it. A snapshot is the delta from what the game takes the client to have, so one
      // that went missing left entities created in it unknown to the client, and every later update of them threw
      // there ("update for unknown entity") until they left its view. What a socket may hold is still bounded:
      // uWS's maxBackpressure (sockets.js), a tick or two past SEND_LIMIT.
      sock.cork(() => {
        for (const bytes of msgs) {
          this.lobby.netMetrics?.wsOut(gameOutChannel(bytes), bytes);
          sock.send(bytes, true, false);
        }
      });
      if (sock.getBufferedAmount() > SEND_LIMIT) Atomics.store(this.congested, slot, 1);
    }
  }
  // uWS: a socket's backlog went out
  drained(slot) {
    const ws = this.socks[slot];
    if (ws && ws.getBufferedAmount() <= SEND_LIMIT) Atomics.store(this.congested, slot, 0);
  }

  // ---------------------------------------------------------------- the worker
  fromWorker(m) {
    switch (m.t) {
      case 'out':
        return this.sendOut(m.buf);
      case 'closed':
        this.draining[m.slot] = 0;
        return;
      case 'kick':
        // (with a code: an admin removed its player - gameadmin.js)
        this.socks[m.slot]?.end(m.code || 4000, closeReason(m.why || 'Never joined'));
        return;
      case 'admin': {
        const a = this.asks.get(m.id);
        if (!a) return; // (answered too late: ask gave up on it)
        this.asks.delete(m.id);
        clearTimeout(a.timer);
        const answer = { ...m };
        delete answer.t;
        delete answer.id;
        a.done(answer);
        return;
      }
      case 'status': {
        const st = { ...m };
        delete st.t;
        const was = this.st;
        this.st = st;
        if (this.pin) this.pinCheck(was, st);
        return;
      }
      case 'ready':
        this.ready = true;
        this.from = null; // (the game runs here now: its save is this server's to make)
        this.st.seed = m.seed;
        if (this.restored) this.lobby.log(`game ${this.code} up in ${Date.now() - this.restored} ms${this.pin ? ` (on build ${this.pin.id})` : ''}`);
        this.onStarted(); // (since its save was claimed: what a deploy's players wait for, docs/deploys.md)
        return;
      case 'rec':
        return this.record(m);
      case 'board':
        return this.board(m);
      case 'an':
        return this.lobby.matches?.push(m.rec, this);
      case 'ach':
        return this.lobby.achievements?.add(m.user, m.add, m.feats, m.strangers, this);
      case 'seen':
        return this.lobby.bestiary?.add(m.user, m.mask);
      case 'cards':
        return this.lobby.cards?.fromRoom(this, m); // (Dead Hand's collections: usercards.js, which never throws)
      case 'loadout':
        return this.lobby.loadouts?.fromRoom(this, m);
      case 'finished':
        this.finished?.();
        return;
      case 'saved':
      case 'saveFailed':
        this.saved?.(m);
        return;
      case 'restoreFailed':
        this.failed = m.world ? REJECT_REASON.ENDED_MAP : REJECT_REASON.ENDED_UPDATE;
        // (the build that saved it may still carry it on: Lobby.afterFailed, once this worker has gone - which it does
        // now. Whoever comes for the code meanwhile waits for that: restore)
        if (this.lobby.canPin(this)) this.lobby.log(`game ${this.code} cannot be carried on by this build (${m.why}): build ${this.from.meta.build} will`);
        else {
          this.lobby.log(`game ${this.code} not restored${this.pin ? ` by build ${this.pin.id} either` : ''}: ${m.why}`);
          this.lobby.onIncident?.({ code: this.code, kind: 'not restored', text: String(m.why).slice(0, 200) });
          this.lobby.ended(this.code, this.failed);
        }
        if (this.closed) this.lobby.afterFailed(this);
        else this.worker.terminate().catch(() => {});
        return;
    }
  }

  // The admin panel asks something of the game (gameadmin.js: op and what it needs, already checked by adminpanel.js).
  // -> its answer, { ok, ... } or { ok: false, error }; a game that does not answer in `ms` (a thread that hangs) is an
  // answer too. Never throws, never waits longer.
  ask(op, args = {}, ms = 3000) {
    if (this.closed) return Promise.resolve({ ok: false, error: 'That game has ended.' });
    return new Promise((done) => {
      const id = ++this.askN;
      const timer = setTimeout(() => {
        this.asks.delete(id);
        done({ ok: false, error: 'The game did not answer in time.', timeout: true });
      }, ms);
      this.asks.set(id, { done, timer });
      try {
        this.worker.postMessage({ ...args, t: 'admin', id, op });
      } catch (err) {
        clearTimeout(timer);
        this.asks.delete(id);
        done({ ok: false, error: `The game could not be asked (${err.message}).` });
      }
    });
  }

  // an account's achievements unlocked (userachievements.js): the game tells its player
  achieved(userId, ids) {
    if (!this.closed && ids.length) this.worker.postMessage({ t: 'achieved', user: userId, ids });
  }

  record(m) {
    const stats = this.lobby.stats;
    if (m.op === 'enter') {
      const rec = stats.enter(m.id, m.name, m.user || '');
      this.recs.set(m.tok, rec);
      // what they have earned before (progress.js): their level, and the perks they picked - the database's in a moment
      if (rec && stats.progress) {
        Promise.resolve(stats.progress(rec)).then(
          (p) => p && !this.closed && this.recs.get(m.tok) === rec && this.worker.postMessage({ t: 'progress', tok: m.tok, first: true, ...p }),
          (err) => this.lobby.log(`progress of a player could not be read (${err.message})`)
        );
      }
      if (m.user) this.lobby.achievements?.played(m.user, this); // (another day played on, if it is one)
      // the kinds of the dead the account has seen: read once, here, and held by the game from then on
      if (m.user && this.lobby.bestiary) {
        this.lobby.bestiary.load(m.user).then(
          (mask) => !this.closed && this.recs.get(m.tok) === rec && this.worker.postMessage({ t: 'bestiary', tok: m.tok, mask }),
          (err) => this.lobby.log(`bestiary of a player could not be read (${err.message})`)
        );
      }
    } else if (m.op === 'leave') {
      stats.leave(this.recs.get(m.tok));
      this.recs.delete(m.tok);
    } else if (m.op === 'bump') stats.bump(this.recs.get(m.tok), m.stat, m.n);
    else if (m.op === 'best') stats.best?.(this.recs.get(m.tok), m.day);
  }

  // a player's picks changed (/api/progress/pick): whoever plays on that record in this game gets them
  progressChanged(key, perks) {
    if (this.closed) return;
    for (const [tok, rec] of this.recs) if (rec && rec.key === key) this.worker.postMessage({ t: 'progress', tok, perks });
  }

  board(m) {
    const ws = this.socks[m.slot];
    if (!ws) return;
    const here = new Set();
    for (const tok of m.here) {
      const r = this.recs.get(tok);
      if (r) here.add(r);
    }
    const write = (proto, total, rows) => {
      const { Writer, S2C, writeBoard } = proto;
      const w = new Writer(1024);
      w.u8(S2C.BOARD);
      writeBoard(w, total, rows);
      return w.bytes();
    };
    const send = ({ total, rows }) => {
      if (this.socks[m.slot] !== ws) return; // (gone while the database was asked)
      const bytes = this.inTheirCodec('BOARD', (proto) => write(proto, total, rows));
      if (ws.getBufferedAmount() <= SEND_LIMIT) {
        this.lobby.netMetrics?.wsOut('game_board', bytes);
        ws.send(bytes, true, false);
      }
    };
    // the file-kept board answers at once, the database's (dbstats.js) in a moment
    const board = this.lobby.stats.board(this.recs.get(m.me) ?? null, here);
    if (typeof board?.then === 'function') board.then(send, (err) => this.lobby.log(`board failed (${err.message})`));
    else send(board);
  }

  // Ends the match being played now, as a server going down does (Lobby.finishAll): the worker writes what it has of
  // it and says when it has. -> a promise, done then or after `ms` regardless
  finish(ms = 1500) {
    if (this.closed || !this.match) return Promise.resolve();
    return new Promise((done) => {
      const t = setTimeout(done, ms);
      this.finished = () => {
        clearTimeout(t);
        this.finished = null;
        done();
      };
      this.worker.postMessage({ t: 'finish' });
    });
  }

  // What the next server needs of this room besides the game (Lobby.restore). match: the one being played as it was
  // saved, which the next server's carries on.
  // build: the code this game runs on (builds.js) - this server's, or the older build's that carries it on here, with
  // since when it has been (pinnedAt)
  meta(match) {
    const build = this.pin?.id || this.lobby.builds?.id || undefined;
    return { name: this.name, host: this.host, maker: this.maker, first: this.first, inviteOnly: this.inviteOnly, quick: this.quick, maxPlayers: this.maxPlayers, difficulty: this.difficulty, startAct: this.startAct, created: this.created, match, build, pinnedAt: this.pin ? this.pin.since : undefined };
  }

  // A game carried on by an older build is not kept on it for ever: when its run is over (after its end screen has had
  // PIN_RUN_OVER_MS), or at the first dawn once it has been on it PIN_MAX_HOURS, it closes, and its players are told why
  // - the next game they join is on the new build. (Never at a deploy: a deploy carries it on, as any game.)
  pinCheck(was, st) {
    if (this.closed || this.pinEnd) return;
    const over = st.phase === PHASE.GAMEOVER || st.phase === PHASE.VICTORY;
    const dawn = was.phase === PHASE.NIGHT && st.phase === PHASE.DAY;
    const hours = (Date.now() - this.pin.since) / 3600e3;
    if (over) this.pinClose(PIN_RUN_OVER_MS, 'Your run is over. That game was being carried on by an older version of the game, and has closed: start or join a new one to play the latest.');
    else if (dawn && hours >= PIN_MAX_HOURS) this.pinClose(0, `The sun is up. That game had been carried on by an older version of the game for ${Math.floor(hours)} hours since an update, and has closed so that everyone gets the update: start or join a new one.`);
  }
  pinClose(ms, why) {
    this.pinEnd = Date.now() + ms;
    this.lobby.log(`game ${this.code} on build ${this.pin.id}: closes ${ms ? `in ${ms / 1000} s` : 'now'} (${why.split('.')[0]})`);
    const close = () => {
      if (this.closed) return;
      this.lobby.ended(this.code, REJECT_REASON.ENDED_UPDATE, { tell: false });
      this.shut(ENDED_CODE, why);
    };
    if (ms) setTimeout(close, ms).unref?.();
    else close();
  }

  // The server is going down and the next one takes this game over: the worker stops and saves it, the save goes into
  // the store, and only then is every socket closed with HANDOFF_CLOSE (a client that came back sooner would find
  // nothing to come back to). -> { bytes, ms } once it is handed over, or why it was not (a string): then nothing has
  // been closed, and the match is still the caller's to end.
  // target: the server it goes to (cluster.js pickTarget; null: whichever claims it first)
  handoff(store, ms = 8000, target = null) {
    if (this.closed) return Promise.resolve('closed');
    // A game this server was still bringing back when it was told to stop (a deploy on the heels of a deploy): its save
    // goes back into the store as it came, for the next server - the game did not run here.
    if (this.from && !this.ready) {
      const from = this.from;
      return this.lobby.putBack(this.code, from, target).then((ok) => (ok ? (this.shut(HANDOFF_CLOSE, 'Server updating', { handedOff: true }), { bytes: from.body.byteLength, ms: 0, back: true }) : 'its save could not be put back'));
    }
    // (a game brought back and up, whose first word on who is in it is not heard yet: saved all the same)
    if (!this.st.players && (this.st.tick !== null || !this.restored)) return Promise.resolve('nobody in it');
    const match = this.match;
    const t0 = Date.now();
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.saved = null;
        done(`no save from the game after ${ms} ms`);
      }, ms);
      this.saved = async (m) => {
        clearTimeout(timer);
        this.saved = null;
        if (m.t === 'saveFailed') return done(`the save failed (${m.error.split('\n')[0]})`);
        if (target) this.movingTo = target; // (from here its row is the next server's: cluster.js beat leaves it be)
        try {
          await store.put(this.code, target ? { ...this.meta(match), target } : this.meta(match), new Uint8Array(m.buf));
        } catch (err) {
          this.movingTo = null;
          return done(`the store would not take it (${err.message})`);
        }
        if (target) await this.lobby.cluster?.moved(this, target).catch((err) => this.lobby.log(`game ${this.code}: its row not moved to ${target} (${err.message})`));
        this.shut(HANDOFF_CLOSE, 'Server updating', { handedOff: true });
        done({ bytes: m.buf.byteLength, ms: Date.now() - t0 });
      };
      this.worker.postMessage({ t: 'save' });
    });
  }

  // Ends the game: the worker goes, every socket is closed, and the records it had open are let go. handedOff: the
  // next server has the game, and its match (ended as 'handoff' by the worker) goes on there.
  shut(code = 1001, why = 'Game closed', { handedOff = false } = {}) {
    if (this.closed) return;
    this.closed = true;
    // (the game's close codes as its players' client has them: an older build's, for a game it carries on)
    if (code === ENDED_CODE) code = this.proto.ENDED_CODE ?? code;
    else if (code === MOVED_CODE) code = this.proto.MOVED_CODE ?? code;
    this.lobby.rooms.delete(this.code);
    this.lobby.cluster?.roomDown(this);
    this.worker.terminate().catch(() => {});
    for (const a of this.asks.values()) {
      clearTimeout(a.timer);
      a.done({ ok: false, error: 'That game has ended.' });
    }
    this.asks.clear();
    for (let i = 0; i < this.socks.length; i++) {
      const ws = this.socks[i];
      if (!ws) continue;
      this.socks[i] = null;
      ws.getUserData().room = null;
      try {
        ws.end(code, closeReason(why));
      } catch {}
    }
    this.open = 0;
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i]) this.lobby.userOut(this.users[i].id, this);
      this.users[i] = null;
    }
    for (const rec of this.recs.values()) this.lobby.stats.leave(rec);
    this.recs.clear();
    // a match it was in the middle of stops where it was
    if (this.match && !handedOff) this.lobby.matches?.interrupt(this.match);
    this.match = null;
    // its card owners are let go, and the bets its matches held go back - unless the next server carries it on
    this.lobby.cards?.roomGone(this, handedOff);
    this.lobby.loadouts?.roomGone(this, handedOff);
  }
}
