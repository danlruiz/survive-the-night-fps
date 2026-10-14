// The games on this server and the lobby that lists them. Every game is a game server of its own: a worker thread
// running one Game (room-worker.js), so the games share the box's cores, a valley being generated in one of them
// holds up nobody else, and a game that crashes takes only its own players with it. This side, the network thread,
// owns the sockets and the leaderboard: it routes each socket to its game by the code in its URL, packs their
// traffic into one message per batch each way (wire.js), and answers for the records the games keep (stats.js).
// One game is a Room (room.js); this file is the Lobby that makes, finds, lists, restores and hands them over.
//
// A game is public (in the lobby's list, and where a quick join can put you) or invite-only (unlisted: only its
// link gets you in). Either way its code is the way in. An invite-only game's code is long enough not to be found by
// guessing, and an address that keeps asking for codes that are not there is told every code is not there for a
// while (find).
import { Worker } from 'node:worker_threads';
import { randomInt } from 'node:crypto';
import { availableParallelism, totalmem } from 'node:os';
import * as OWN_PROTOCOL from '../shared/protocol.js';
import { S2C, REJECT_REASON, PROTOCOL_VERSION } from '../shared/protocol.js';
import { PHASE, MAX_PLAYERS } from '../shared/constants.js';
import { Room, WORKER_LIMITS, cleanTitle } from './room.js';
import { Allowance } from './allowance.js';

export { Room, closeReason } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // (no 0 / O, 1 / I: a code gets read out loud)
const PUBLIC_CODE = 6;
const PRIVATE_CODE = 10; // 32^10: about 10^15 codes
export const CODE_RE = /^[A-Z2-9]{6,10}$/;
// An empty game shuts down after this long: long enough for a reload, or for whoever made it to get the link out
// before they join.
const IDLE_MS = 90_000;
// Per address: making games (a few in a row, then one a minute) and asking for codes that turn out not to exist.
const CREATE_BURST = 3;
const CREATE_EVERY = 60;
const BUSY = { error: 'Every game server is busy right now. Join a game that is already running, or try again in a minute.', status: 503 };
const yours = (code) => ({ error: `You already have a game going (${code}). Join it, or wait for it to end before making another.`, status: 409, code });
const MISS_BURST = 20;
const MISS_EVERY = 10;
// How long, and of how many games at most, it is remembered that a deploy ended them (Lobby.ended)
const LOST_MS = 30 * 60_000;
const LOST_MAX = 2000;
const HELD_MS = +(process.env.HANDOFF_RESERVE_SECONDS || 180) * 1000; // (gamestate.js HANDOFF_RESERVE: how long a player brought over is held)
// A worker prepared for a game the last server announced (Lobby.prepare) that no save came for in this long goes
const PREPARED_MS = 30_000;
// A server going down waits this long at most for its own build to be packed and in the store (Lobby.handoffAll):
// past it the games are saved anyway (naming the build if it is packed by then), well inside HARD_EXIT_MS
const KEEP_MS = 2000;

// Games this box runs at once, unless MAX_GAMES says otherwise. Measured with scripts/stress.js (2 Oct 2026): an
// 8-player game at night uses ~17 ms of CPU a second (45 at worst; plan on 50, so ~14 games a core with 30% to
// spare), ~62 MB on a 70 MB base (plan on 80 MB), and the network thread ~0.4 ms a second per player, which puts
// it at half a core around 150 games. Memory runs out first on most boxes, and running out of it kills every game
// at once, so the count goes by the memory the process may use (a container's limit, else the machine's).
export function defaultMaxGames() {
  const mem = process.constrainedMemory?.() || totalmem();
  const byMemory = Math.floor((mem * 0.75 - 150e6) / 80e6);
  return Math.max(4, Math.min(availableParallelism() * 14, byMemory, 150));
}

export class Lobby {
  // stats: the leaderboard (PlayerStats, or DbStats with a database). matches: where the matches played go
  // (MatchStore; none without a database). achievements: the accounts' (AchievementStore; none without a database).
  // bestiary: the kinds of the dead each account has seen (BestiaryStore; none without a database).
  // cards: Dead Hand's collections (usercards.js CardService: in the database, or in memory without one)
  // loadouts: permanent loadout item collections (userloadout.js LoadoutService)
  // gameOpts: what every Game is made with (the env's test switches)
  // limits: false lifts the per-address allowances (load tests make many games from one address). store: where games
  // are handed from one server to the next on a deploy (handoff.js; none: a deploy ends them), and how old a save may
  // be and still be restored (s)
  // prepareMs: how long a server going down waits for the next one to have its games' valleys built (announce)
  // keepMs: how long a server going down waits at most for its own build to be in the store before it saves (KEEP_MS)
  constructor({ stats, matches = null, achievements = null, bestiary = null, cards = null, loadouts = null, gameOpts = {}, maxGames = defaultMaxGames(), maxPlayers = MAX_PLAYERS, roomMaxPlayers = MAX_PLAYERS, limits = true, idleMs = IDLE_MS, store = null, handoffMaxAge = 300, prepareMs = 3000, keepMs = KEEP_MS, settings = null, netMetrics = null, log = console.log }) {
    this.stats = stats;
    this.settings = settings; // the game's settings in the database (serversettings.js; none without one)
    this.netMetrics = netMetrics;
    this.matches = matches;
    this.achievements = achievements;
    this.bestiary = bestiary;
    this.cards = cards;
    this.loadouts = loadouts;
    this.store = store;
    this.handoffMaxAge = handoffMaxAge;
    this.restoring = new Map(); // code -> the restore under way (restore)
    this.prepareMs = prepareMs;
    this.keepMs = keepMs;
    this.prepared = new Map(); // code -> { worker, congestion, info, timer, ready }: valleys built for games on their way here (prepare)
    this.builds = null; // the builds games are carried on by when this one cannot read their saves (builds.js; none: they end)
    this.lost = new Map(); // code -> { reason, at }: games a deploy handed over that could not be carried on here (ended)
    this.stopping = false; // going down: nothing more is restored here
    this.stopped = new Promise((done) => (this.onStopping = done)); // (done once it is going down: handoffAll)
    this.cluster = null; // the other servers behind the proxy (cluster.js), when there are any
    this.playing = new Map(); // account id -> Map(room -> its sockets in it): where the signed-in are playing
    this.onPresence = null; // (account id) => void: they came into a game or left one (social.js)
    this.onIncident = null; // ({ code, kind, text }) => void: a game crashed, stopped or could not be restored (adminpanel.js)
    this.closedToNew = false; // an admin stopped new games being made here (adminpanel.js): those running carry on, and can be joined
    this.gameOpts = gameOpts;
    this.maxGames = maxGames;
    this.maxPlayers = maxPlayers; // seats in a game nobody chose the size of (a quick join's)
    this.roomMaxPlayers = Math.max(maxPlayers, roomMaxPlayers); // the most a game can be made with
    this.log = log;
    this.limits = limits;
    this.idleMs = idleMs;
    this.rooms = new Map(); // code -> Room
    this.creates = new Allowance(CREATE_BURST, CREATE_EVERY); // per address: games made
    this.misses = new Allowance(MISS_BURST, MISS_EVERY); // per address: codes asked for that were not there
    this.toFlush = new Set();
    this.flushQueued = false;
    this.flushAll = () => {
      this.flushQueued = false;
      for (const room of this.toFlush) room.flushInbox();
      this.toFlush.clear();
    };
    setInterval(() => this.reap(), Math.min(5000, idleMs / 2)).unref();
  }

  queueFlush(room) {
    this.toFlush.add(room);
    if (!this.flushQueued) {
      this.flushQueued = true;
      setImmediate(this.flushAll);
    }
  }

  newCode(len) {
    for (;;) {
      let code = '';
      for (let i = 0; i < len; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  // the most games at once over every server (server_settings.max_total_games: serversettings.js), null for no total
  get maxTotal() {
    return this.settings?.maxTotalGames ?? null;
  }
  // whether this server may make another game: its own MAX_GAMES, and (on its own) the total. (In a cluster the total
  // is over every server, and Cluster.reserve keeps it.)
  get canCreate() {
    return !this.closedToNew && this.rooms.size < this.maxGames && (!!this.cluster || this.maxTotal === null || this.rooms.size < this.maxTotal);
  }
  // the game going here that this maker made, or null
  gameOf(maker) {
    if (!maker) return null;
    for (const room of this.rooms.values()) if (room.maker === maker && !room.closed) return room;
    return null;
  }

  // A new game for whoever asked: ip, for the allowance of games made a minute, and maker (u:<account id>, or a
  // guest's ip:<address>), who may have one game going at a time - on any server, in a cluster. Neither holds with
  // limits off. -> { room } or { error, status (HTTP), code (of the maker's game, when that is why) }
  async make(opts = {}, { ip = '', maker = '' } = {}) {
    if (!this.limits) maker = '';
    if (!this.canCreate) return BUSY;
    const mine = this.gameOf(maker);
    if (mine) return yours(mine.code);
    if (ip && this.limits && !this.creates.take(ip)) return { error: 'You have made several games just now. Wait a minute before making another.', status: 429 };
    if (!this.cluster) return this.create({ ...opts, maker });
    const code = this.newCode(opts.inviteOnly ? PRIVATE_CODE : PUBLIC_CODE);
    let r;
    try {
      r = await this.cluster.reserve({ code, maker, max: this.maxTotal });
    } catch (err) {
      this.log(`game not made: the cluster could not be asked (${err.message})`);
      return BUSY;
    }
    if (r.mine) return yours(r.mine);
    if (r.full) return BUSY;
    return this.create({ ...opts, code, maker });
  }

  // the seats of a game asked to have `n` (none, or junk: a quick join's), within what a game can have
  seatsFor(n) {
    return Math.max(1, Math.min(this.roomMaxPlayers, Math.floor(+n) || this.maxPlayers));
  }
  // a room made, restored or carried on by an older build is one of this server's games (in a cluster, listed as one)
  addRoom(room) {
    this.rooms.set(room.code, room);
    room.up = this.cluster?.roomUp(room) ?? null;
  }

  // A new game, made here as it is (make asks first whether it may be): { room } or { error, status }
  create({ name = '', host = '', inviteOnly = false, maxPlayers = this.maxPlayers, difficulty, startAct = 1, quick = false, maker = '', code = null } = {}) {
    if (!this.canCreate) return BUSY;
    const seats = this.seatsFor(maxPlayers);
    const room = new Room(this, {
      code: code || this.newCode(inviteOnly ? PRIVATE_CODE : PUBLIC_CODE),
      name: cleanTitle(name, 28),
      host: cleanTitle(host, 16),
      inviteOnly: !!inviteOnly,
      maxPlayers: seats,
      difficulty,
      startAct: quick ? 1 : startAct, // (a quick join is always the island)
      quick,
      maker,
    });
    this.addRoom(room);
    this.log(`game ${room.code} made: ${room.inviteOnly ? 'invite only' : 'public'}, ${seats} seats, ${room.difficulty}${room.startAct === 2 ? ', on the mainland' : ''}${room.quick ? ' (quick join)' : ''} (${this.rooms.size}/${this.maxGames} games)`);
    return { room };
  }

  // The game with this code, or null. An address asking for one code after another that is not there is told
  // none of them is there for a while, the real ones included: guessing codes gets nowhere.
  find(code, ip = '') {
    code = String(code || '').toUpperCase();
    const room = CODE_RE.test(code) ? this.rooms.get(code) : null;
    const blocked = this.limits && !this.misses.has(ip);
    if (room && !room.closed && !blocked) return room;
    if (ip && this.limits) this.misses.take(ip);
    return null;
  }

  // Where a quick join goes: the public game with the most people in it that still has a seat (a game that is
  // just ending comes last), or a new one. (In a cluster the new one is made before the socket opens, as it has to ask
  // the others: sockets.js, make)
  quick() {
    return this.quickPick() || (this.cluster ? null : this.create({ quick: true }).room) || null;
  }
  quickPick() {
    let best = null;
    let bestKey = -1;
    for (const room of this.rooms.values()) {
      if (room.inviteOnly || room.startAct === 2 || room.closed || room.noRoom || room.pin) continue; // (pin: an older build's game, for that build's client)
      const ending = room.st.phase === PHASE.GAMEOVER || room.st.phase === PHASE.VICTORY;
      const key = (ending ? 0 : 1000) + room.open;
      if (key > bestKey) {
        best = room;
        bestKey = key;
      }
    }
    return best;
  }

  // the public games, the busiest first
  list() {
    const out = [];
    // (not a game an older build carries on: it is joined from the page its link gives, that build's client)
    for (const room of this.rooms.values()) if (!room.inviteOnly && !room.closed && !room.pin) out.push(room.info());
    out.sort((a, b) => b.seats - a.seats || a.ageS - b.ageS);
    return out;
  }

  // Shuts the games that have been empty too long, and forgets allowances that have worn off.
  reap() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      // (a game brought over whose players are all still on their way is kept as long as their places are: HANDOFF_RESERVE)
      const idle = room.restored && room.st.held > 0 ? Math.max(this.idleMs, HELD_MS) : this.idleMs;
      if (room.open || !room.emptySince || now - room.emptySince < idle) continue;
      this.log(`game ${room.code} closed: empty for ${Math.round((now - room.emptySince) / 1000)} s`);
      room.shut();
    }
    this.creates.sweep();
    this.misses.sweep();
    for (const [code, l] of this.lost) if (now - l.at > LOST_MS) this.lost.delete(code);
  }

  players() {
    let n = 0;
    for (const room of this.rooms.values()) n += room.st.players;
    return n;
  }

  // the record filed under `key` has these picks now (server/progress.js): every game it is being played in hears
  progressChanged(key, perks) {
    for (const room of this.rooms.values()) room.progressChanged(key, perks);
  }

  // ---------------------------------------------------------------- where the signed-in are playing
  // An account's socket came into a game, or went from one (Room.attach / detach). Its friends hear of it (social.js)
  userIn(userId, room) {
    let rooms = this.playing.get(userId);
    if (!rooms) this.playing.set(userId, (rooms = new Map()));
    rooms.set(room, (rooms.get(room) || 0) + 1);
    this.onPresence?.(userId);
    // a friend in here already: Better Together, for both
    const others = new Set();
    for (const u of room.users) if (u && u.id !== userId) others.add(u.id);
    if (others.size) this.achievements?.together(userId, [...others], room);
  }
  userOut(userId, room) {
    const rooms = this.playing.get(userId);
    const n = rooms?.get(room);
    if (!n) return;
    if (n > 1) rooms.set(room, n - 1);
    else rooms.delete(room);
    if (!rooms.size) this.playing.delete(userId);
    this.onPresence?.(userId);
  }

  // The game an account is playing in (the one it came into last, if it is in two), or null. Friends are told it
  // in full, its code included, to join them by - an invite-only game's too: friends only (social.js)
  playingRoom(userId) {
    const rooms = this.playing.get(userId);
    if (!rooms) return null;
    let last = null;
    for (const room of rooms.keys()) if (!room.closed) last = room;
    return last;
  }

  // The server is going down (a deploy): every match being played is ended as it stands and written (Room.finish)
  finishAll(ms = 1500) {
    return Promise.all([...this.rooms.values()].map((room) => room.finish(ms)));
  }

  // ---------------------------------------------------------------- deploys (handoff.js)
  // The server is going down and the next one is up: every game with anybody in it is saved into the store for that
  // one to carry on with, all at once. One that cannot be (it did not answer in time, the store failed) has its match
  // ended as before (Room.finish) and stays here to go down with the process. -> how many were handed over
  async handoffAll(store, ms = 8000) {
    this.stopping = true;
    this.onStopping();
    for (const code of [...this.prepared.keys()]) this.dropPrepared(code, 'this server is going down itself');
    // (a game being brought back this very moment: its room is there, or its save back in the store, before the rooms
    // are gone through - restore puts back what it claims from now on)
    await Promise.race([Promise.allSettled([...this.restoring.values()]), new Promise((done) => setTimeout(done, 3000))]);
    const rooms = [...this.rooms.values()];
    // (the code these games run on, for a next server that cannot read their saves: builds.js - in the store since a
    // moment after this server started, marked as in use now and put back if it was swept meanwhile, or packed and put
    // there now, while the next server builds the valleys: the saves name it. As is every older build a game here is
    // carried on by, marked as in use. Not waited for past keepMs: the games are saved anyway)
    const keeping = rooms.some((room) => room.st.players && !room.pin) && this.builds ? this.keepOwn() : null;
    for (const room of rooms) if (room.pin) this.builds?.touch(room.pin.id);
    const targets = new Map(rooms.map((room) => [room, room.st.players ? (this.cluster?.pickTarget() ?? null) : null]));
    await Promise.all([keeping, this.announce(store, rooms, targets)]);
    const done = await Promise.all(
      rooms.map(async (room) => {
        const players = room.st.players;
        const target = targets.get(room);
        const r = await room.handoff(store, ms, target);
        if (typeof r === 'object') {
          this.log(`handoff ${room.code}: ${players} players, ${(r.bytes / 1024).toFixed(0)} KB, ${r.ms} ms${target ? `, to ${target}` : ''}`);
          return true;
        }
        if (players) this.log(`handoff ${room.code}: not handed over - ${r}`);
        await room.finish(1500);
        return false;
      })
    );
    return done.filter(Boolean).length;
  }

  // (this build in the store before the saves name it: keepMs at most. -> whether it is there)
  keepOwn() {
    let timer;
    const late = new Promise((done) => (timer = setTimeout(() => done(false), this.keepMs)));
    const kept = Promise.resolve(this.builds.ensure()).then(() => true);
    return Promise.race([kept, late]).then((ok) => {
      clearTimeout(timer);
      if (!ok) this.log(`handoff: this build was not in the store after ${this.keepMs} ms: the games are saved anyway${this.builds.id ? ` (naming build ${this.builds.id})` : ', naming no build'}`);
      return ok;
    });
  }

  // Before the games are saved, the next server is told which are coming (seed, act, the valley's fingerprint) and
  // builds each one's valley in a worker of its own (prepare); it says when each is ready, and only then is the game
  // saved and its players sent over - so they wait for the save to be loaded, not for a valley to be generated. The
  // games go on being played meanwhile. A next server that says nothing (one from before this, or none) costs at most
  // prepareMs, and its games are handed over as before.
  async announce(store, rooms, targets) {
    // (not a game on an older build: that build starts it, it is not built ahead)
    const list = rooms.filter((r) => r.st.players && r.ready && !r.closed && !r.pin).map((r) => ({ code: r.code, info: { seed: r.st.seed >>> 0, act: r.st.act || 1, shape: r.st.shape || '', target: targets.get(r) || undefined } }));
    if (!list.length || !store.announceAndWait || !(this.prepareMs > 0)) return;
    const t0 = Date.now();
    try {
      const ready = await store.announceAndWait(list, this.prepareMs);
      this.log(`handoff: the next server had ${ready.size} of ${list.length} game(s) ready for their saves after ${Date.now() - t0} ms`);
    } catch (err) {
      this.log(`handoff: the next server could not be told what is coming (${err.message})`);
    }
  }

  // The last server is about to hand this game over (announce): its valley is built here now, in the worker that will
  // run it, which then waits for the save (Room's `prepared`, room-worker.js). Once built, the store is told this server
  // is ready for it. Nothing is listed or joinable until the save comes; a worker no save comes for goes after a while.
  prepare(code, info = {}) {
    code = String(code || '').toUpperCase();
    if (!this.store?.ready || this.stopping || !CODE_RE.test(code) || this.rooms.has(code) || this.prepared.has(code)) return;
    if (info.target && this.cluster && info.target !== this.cluster.id) return; // (behind the proxy: another server's)
    if (this.rooms.size + this.prepared.size >= this.maxGames || !Number.isFinite(+info.seed)) return;
    const congestion = new SharedArrayBuffer(4 * (this.roomMaxPlayers * 2 + 2));
    let worker;
    try {
      worker = new Worker(new URL('./room-worker.js', import.meta.url), { workerData: { code, congestion, prepare: { seed: +info.seed >>> 0, act: info.act === 2 ? 2 : 1 } }, resourceLimits: WORKER_LIMITS });
    } catch (err) {
      return void this.log(`game ${code}: its valley could not be built ahead (${err.message})`);
    }
    const p = { worker, congestion, info, ready: false, timer: setTimeout(() => this.dropPrepared(code, 'no save came for it: was the server going down killed before it could hand it over? docs/deploys.md'), PREPARED_MS) };
    p.timer.unref?.();
    p.on = {
      message: (m) => {
        if (m.t === 'prepared' && this.prepared.get(code) === p) this.onPrepared(code, p, m);
      },
      error: (err) => this.dropPrepared(code, err.message),
      exit: () => this.prepared.get(code) === p && this.prepared.delete(code),
    };
    for (const [ev, fn] of Object.entries(p.on)) worker.on(ev, fn);
    this.prepared.set(code, p);
  }
  // a prepared worker has built its valley: the store is told this server is ready for the save
  onPrepared(code, p, m) {
    // (the valley this build makes of that seed is not the one the game is played on: its save takes the long way - and
    // the server going down is told so, not to wait for it)
    if (m.error || (p.info.shape && m.shape !== p.info.shape)) {
      this.store.ready(code, false).catch(() => {});
      return this.dropPrepared(code, m.error || 'this build makes another valley of its seed');
    }
    p.ready = true;
    this.store.ready(code).catch((err) => this.log(`game ${code}: could not say it is ready for its save (${err.message})`));
    this.log(`game ${code}: its valley built ahead in ${m.ms} ms, ready for its save`);
  }
  // the worker prepared for this code, now the save is here (it is the room's from now on), or null
  takePrepared(code) {
    const p = this.prepared.get(code);
    if (!p) return null;
    this.prepared.delete(code);
    clearTimeout(p.timer);
    for (const [ev, fn] of Object.entries(p.on)) p.worker.off(ev, fn); // (only ours: a Worker has listeners of its own)
    return p;
  }
  dropPrepared(code, why) {
    const p = this.takePrepared(code);
    if (!p) return;
    p.worker.terminate().catch(() => {});
    this.log(`game ${code}: the valley built ahead is let go (${why})`);
  }

  // A game the last server handed over could not be carried on here (its room's worker said so: 'restoreFailed'), so
  // it is over. Its code is remembered for a while with why (a REJECT_REASON: ENDED_MAP, ENDED_UPDATE), and whoever
  // comes for it - its players, sent back here by the deploy, or anyone with its link - is told that instead of
  // "no such game" (wasLost; sockets.js seat). Those already on a socket waiting for it are told now.
  // tell: false: whoever is on a socket in it is told otherwise (Room.pinClose)
  // proto: the codec of its players' client when it is known (an older build's: the one that ran it, or was to) - what
  // whoever comes for it later is told in (lostProto)
  ended(code, reason, { tell = true, proto = null } = {}) {
    if (this.lost.size >= LOST_MAX) this.lost.delete(this.lost.keys().next().value);
    const room = this.rooms.get(code);
    proto ||= room?.proto || null;
    this.lost.set(code, { reason, at: Date.now(), proto: proto === OWN_PROTOCOL ? null : proto });
    if (tell && room) {
      const bytes = rejectBytes(reason, room.proto);
      for (const ws of room.socks) {
        if (!ws) continue;
        this.netMetrics?.wsOut('game_rejects', bytes);
        ws.send(bytes, true, false);
      }
    }
  }
  // the codec of the players of a game a deploy ended, when it was not this build's (else undefined)
  lostProto(code) {
    return this.lost.get(String(code || '').toUpperCase())?.proto || undefined;
  }
  // Whether the game of a room whose save this build could not read can be carried on by the build that saved it: the
  // save names one, it is not this one, and it has not been tried already.
  canPin(room) {
    const build = room.from?.meta?.build;
    return !!this.builds?.canStart && !room.pin && typeof build === 'string' && !!build && build !== this.builds.id;
  }
  // The room of a save this build could not read has closed. If the build that saved it may be started here (builds.js
  // fetch says why not), the game is started again from the same save by that build's code, under the same code;
  // whoever asks for the code meanwhile waits for that (restore). Failing that, it is over (ended).
  afterFailed(room) {
    if (room.after || !this.canPin(room) || this.rooms.has(room.code)) return;
    room.after = true;
    const { code, from } = room;
    const m = from.meta;
    // (told to stop meanwhile, the fetch - and the loading of its codec - is not waited for: the save goes back at once,
    // for the next server, and the server going down waits for that - handoffAll)
    let proto = null; // (its players' codec, once known: also what they are told in if it ends here after all)
    const giveBack = async () => ((await this.putBack(code, from)) ? 'back' : null);
    const p = (this.stopping ? Promise.resolve(null) : Promise.race([this.builds.fetch(m.build), this.stopped.then(() => null)]))
      .then(async (b) => {
        // (told to stop meanwhile: the next server gets the save, and tries the same)
        if (this.stopping) return giveBack();
        if (!b || this.rooms.has(code)) return null;
        // (its players' client reads what this thread writes to them in its own codec: that build's protocol.js. One
        // that cannot be loaded here is only used if it is this build's protocol)
        proto = await Promise.race([this.builds.protocol(b), this.stopped.then(() => null)]);
        if (this.stopping) return giveBack();
        if (!proto && b.client.protocol !== PROTOCOL_VERSION) throw new Error(`its client speaks protocol ${b.client.protocol}, and its protocol.js could not be used here`);
        if (this.stopping) return giveBack();
        if (this.rooms.has(code)) return null;
        const next = new Room(this, {
          code,
          name: room.name,
          host: room.host,
          inviteOnly: room.inviteOnly,
          maxPlayers: room.maxPlayers,
          difficulty: room.difficulty,
          startAct: room.startAct,
          quick: room.quick,
          maker: room.maker,
          first: room.first,
          created: room.created,
          continues: room.continues,
          restore: from.body,
          from,
          pin: { id: m.build, dir: b.dir, client: b.client, proto, since: Number.isFinite(m.pinnedAt) ? m.pinnedAt : Date.now() },
        });
        this.addRoom(next);
        this.log(`game ${code} carried on by build ${m.build}, the one that saved it (${this.rooms.size}/${this.maxGames} games)`);
        return next;
      })
      .catch((err) => (this.log(`game ${code} not carried on by build ${m.build} (${err.message})`), null))
      .then((next) => {
        if (!next) {
          this.log(`game ${code} not restored: build ${m.build} could not be started here`);
          this.onIncident?.({ code, kind: 'not restored', text: `its build ${m.build} could not be started here` });
          this.ended(code, room.failed, { proto });
        }
        if (this.restoring.get(code) === p) this.restoring.delete(code);
        return next === 'back' ? null : next;
      });
    this.restoring.set(code, p);
  }
  // The room that goes by this code once it is known what became of its restore: up (on its own build or an older one),
  // or null. (restore answers as soon as there is a room, before its worker has read the save.)
  async settle(code) {
    for (let i = 0; i < 4; i++) {
      const room = await this.restore(code);
      if (!room) return null;
      await Promise.race([room.started, new Promise((done) => setTimeout(done, 15000))]);
      if (!room.closed) return room;
    }
    return null;
  }
  // A save this server claimed and will not run (it is going down itself): back into the store as it was, for the
  // next server (target: the one it goes to, behind the proxy)
  async putBack(code, from, target = null) {
    try {
      const meta = { ...(from.meta || {}) };
      if (target) meta.target = target;
      else delete meta.target;
      await this.store.put(code, meta, from.body);
      this.log(`game ${code}: its save is back in the store for the next server`);
      return true;
    } catch (err) {
      this.log(`game ${code}: its save could not be put back in the store (${err.message})`);
      return false;
    }
  }
  // why the game that went by this code is gone (a REJECT_REASON), or 0: it is not one a deploy ended
  wasLost(code) {
    return this.lost.get(String(code || '').toUpperCase())?.reason || 0;
  }

  // The game the last server saved under this code, if one is waiting in the store: claimed (so no other server takes
  // it too) and started here under the same code, with the room as it was. -> the Room, or null (no save, it was
  // taken, it is too old). Asked when the store says a save has come (index.js), at start-up for any already
  // waiting, and by a socket or an invite card asking for a code this server does not have yet. A save this build
  // cannot read is only found out in the room's worker: that room closes again (Room 'restoreFailed').
  restore(code) {
    code = String(code || '').toUpperCase();
    if (this.rooms.has(code)) return Promise.resolve(this.rooms.get(code));
    if (!this.store || this.stopping || !CODE_RE.test(code)) return Promise.resolve(null);
    let p = this.restoring.get(code);
    if (!p) {
      p = this._restore(code).finally(() => this.restoring.delete(code));
      this.restoring.set(code, p);
    }
    return p;
  }
  async _restore(code) {
    let row;
    try {
      row = await this.store.claim(code, this.cluster?.id ?? null);
    } catch (err) {
      this.log(`game ${code} not restored: the store failed (${err.message})`);
      return null;
    }
    if (!row) return null;
    // (told to stop while the store was asked: this server will not run it - the next one gets it, as it came)
    if (this.stopping) return void (await this.putBack(code, { meta: row.meta || {}, body: row.body })) || null;
    const age = (Date.now() - row.savedAt) / 1000;
    if (age > this.handoffMaxAge) {
      this.log(`game ${code} not restored: saved ${Math.round(age)} s ago`);
      return null;
    }
    if (this.rooms.has(code)) {
      this.log(`game ${code} not restored: a game here has that code`);
      return this.rooms.get(code);
    }
    const m = row.meta || {};
    // (a save of another build: a page of its client may still ask for that client's files - builds.js know)
    if (typeof m.build === 'string' && this.builds && m.build !== this.builds.id) this.builds.know(m.build);
    const room = new Room(this, {
      code,
      name: cleanTitle(m.name, 28),
      host: cleanTitle(m.host, 16),
      inviteOnly: !!m.inviteOnly,
      maxPlayers: this.seatsFor(m.maxPlayers),
      difficulty: m.difficulty, // absent on a save from before difficulties: the room treats that as Nightfall
      startAct: m.startAct === 2 ? 2 : 1, // (absent on a save from before map 2 games: the island)
      quick: !!m.quick,
      maker: typeof m.maker === 'string' ? m.maker.slice(0, 80) : '',
      first: cleanTitle(m.first, 16),
      created: Number.isFinite(m.created) ? m.created : Date.now(),
      continues: typeof m.match === 'string' ? m.match : null,
      restore: row.body,
      prepared: this.takePrepared(code),
      from: { meta: m, body: row.body },
    });
    this.addRoom(room);
    this.log(`game ${code} restored from the last server (saved ${age.toFixed(1)} s ago, ${(row.body.byteLength / 1024).toFixed(0)} KB${room.builtAhead ? ', its valley built ahead' : ''}) (${this.rooms.size}/${this.maxGames} games)`);
    return room;
  }
}

// What a socket that cannot have a seat is sent before it is closed: the REJECT the client shows (connection.js). proto:
// the codec of the client it goes to (a game an older build carries on: that build's - the reason by its name)
export function rejectBytes(reason = REJECT_REASON.FULL, proto = OWN_PROTOCOL) {
  if (proto && proto !== OWN_PROTOCOL) {
    try {
      const name = Object.keys(REJECT_REASON).find((k) => REJECT_REASON[k] === reason);
      const theirs = proto.REJECT_REASON?.[name];
      const id = proto.S2C?.REJECT;
      if (Number.isInteger(id) && id >= 0 && id < 256) return Uint8Array.of(id, Number.isInteger(theirs) && theirs >= 0 && theirs < 256 ? theirs : reason);
    } catch {}
  }
  return Uint8Array.of(S2C.REJECT, reason);
}
