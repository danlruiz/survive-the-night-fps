// Server entry, the network thread: uWebSockets.js transport (binary WebSocket at /ws), the lobby's HTTP API
// (/api/games), static file serving of the built client (dist/) and a /status JSON endpoint. The games themselves
// run in worker threads, one game server each (rooms.js, room-worker.js); this thread routes every socket to its
// game by the code in its URL (/ws?game=CODE), or with no code to whichever public game a quick join picks.
//
// With a database (DATABASE_URL, db/index.js) it also has accounts (/api/auth, auth.js), friends and direct
// messages (/api/friends, /api/messages and the /social socket, social.js), the leaderboard in Postgres
// (dbstats.js) and a record of every match played (matchstore.js). Without one it runs as before: the leaderboard in
// a file (stats.js), nobody signed in.
//
// A deploy does not end the games (handoff.js): on SIGTERM each is saved into the store and its players are sent
// HANDOFF_CLOSE, and the new server - up by then - restores it under the same code for them to reconnect to.
//
// This file makes the services and wires them together; what each endpoint does is elsewhere: the WebSockets in
// sockets.js, the lobby's routes and /status in http/lobby.js, the JSON API by resource in http/*.js (over http.js
// api), the client's files in http/static.js, the admin panel's API in adminpanel.js.
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import uWS from 'uWebSockets.js';
import { Lobby, defaultMaxGames } from './rooms.js';
import { PlayerStats } from './stats.js';
import { openDb, describeUrl } from './db/index.js';
import { migrate } from './db/migrate.js';
import { DbStats } from './dbstats.js';
import { MatchStore } from './matchstore.js';
import { Auth, COOKIE } from './auth.js';
import { Social } from './social.js';
import { Feedback } from './feedback.js';
import { UserSettings } from './usersettings.js';
import { ServerSettings } from './serversettings.js';
import { Progress } from './progress.js';
import { AchievementStore } from './userachievements.js';
import { BestiaryStore } from './userbestiary.js';
import { CardService, PgCardStore, MemoryCardStore } from './usercards.js';
import { LoadoutService, PgLoadoutStore, MemoryLoadoutStore } from './userloadout.js';
import { LobbyCards } from './lobbycards.js';
import { devAdminAllowed } from './devadmin.js';
import { api, parseCookies, sameOrigin } from './http.js';
import { loadDir, stampPage, clientRoutes } from './http/static.js';
import { lobbyRoutes, statusRoute } from './http/lobby.js';
import { accountRoutes } from './http/accounts.js';
import { loadoutRoutes } from './http/loadout.js';
import { feedbackRoutes } from './http/feedback.js';
import { progressRoutes } from './http/progress.js';
import { friendRoutes } from './http/friends.js';
import { statsRoutes } from './http/stats.js';
import { gameSockets, cardSockets, socialSockets } from './sockets.js';
import { FileStore, PgStore, BUILD } from './handoff.js';
import { Builds } from './builds.js';
import { compatOf } from './compat.js';
import { Cluster } from './cluster.js';
import { AdminPanel } from './adminpanel.js';
import { clientAddress } from './netaddr.js';
import { NetworkMetrics } from './netmetrics.js';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
import { DEFAULT_PORT, MAX_PLAYERS } from '../shared/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = +(process.env.PORT || DEFAULT_PORT);
const MAX = +(process.env.MAX_PLAYERS || MAX_PLAYERS); // seats in a game unless its maker picks: a quick join's
// the most seats a game can be made with. The server carries far more (scripts/stress.js: 48 in one game is ~7% of
// a core), but the game is balanced for 8 and the night's 120 zombies spread thin past about 16
const ROOM_MAX = +(process.env.ROOM_MAX_PLAYERS || Math.max(MAX, 16));
const MAX_GAMES = +(process.env.MAX_GAMES || defaultMaxGames()); // games at once on this box
// a number the env gives, or undefined when it gives none
const envNumber = (name) => (process.env[name] ? +process.env[name] : undefined);
const SEED = envNumber('SEED');
const DIST = resolve(__dirname, '../dist');
const log = (...a) => console.log('[server]', ...a);
const netMetrics = new NetworkMetrics();

// ---------------------------------------------------------------- the database
// Migrated on the way up (MIGRATE_ON_START=0: not); if a pre-deploy step did it already (npm run migrate,
// railway.json) this finds nothing to do. A migration that fails stops a production server here: the deploy then fails
// its health check and Railway keeps the one that is running, on the schema it knows. A database that cannot be
// reached leaves the games running and the accounts failing until it can be.
const db = await openDb(process.env.DATABASE_URL, { log }).catch((err) => {
  console.error('[server] database could not be opened:', err.message);
  return null;
});
if (db) {
  log(`database: ${describeUrl(process.env.DATABASE_URL)} (${db.kind})`);
  if (process.env.MIGRATE_ON_START !== '0') {
    try {
      const { applied } = await migrate(db, { log });
      if (applied.length) log(`database: applied ${applied.join(', ')}`);
    } catch (err) {
      console.error('[server] database migrations failed:', err.message);
      // (an SQL error carries its SQLSTATE: the migration is wrong, not the network)
      if (process.env.NODE_ENV === 'production' && /^[0-9A-Z]{5}$/.test(err.code || '')) process.exit(1);
    }
  }
}

// The leaderboard's records: in the database if there is one (dbstats.js), else in a file (stats.js): STATS_FILE, or
// stats.json on the Railway volume if the service has one, or in data/ here. A file is only as lasting as the disk it
// is on - a deploy without a volume starts from a fresh one. STATS_FILE= (empty) keeps nothing past this process.
const STATS_FILE = process.env.STATS_FILE ?? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || resolve(__dirname, '../data'), 'stats.json');
const stats = db ? new DbStats({ db, log }) : new PlayerStats({ file: STATS_FILE, log });
const matches = db ? new MatchStore({ db, stats, build: process.env.RAILWAY_GIT_COMMIT_SHA || '', log }) : null;
await matches?.closeStale().catch((err) => log(`matches: could not close the last run's (${err.message})`));
// the accounts' achievements (a guest's are kept by their browser, database or not)
const achievements = db ? new AchievementStore({ db, log }) : null;
// ...and their bestiaries (the same: a guest's is their browser's)
const bestiary = db ? new BestiaryStore({ db, log }) : null;
// Dead Hand's collections, accounts' and guests' alike (usercards.js): in the database, or without one in this
// process's memory - kept for as long as it runs. What changes here, the other servers of a cluster read again.
const cards = new CardService({ store: db ? new PgCardStore(db) : new MemoryCardStore(), log, changed: (owners) => lobby.cluster?.publish({ t: 'cards', owners }) });
if (!db) log('cards: no database - the card collections found are kept only as long as this server runs');
const loadouts = new LoadoutService({ store: db ? new PgLoadoutStore(db) : new MemoryLoadoutStore(), log, changed: (owners) => lobby.cluster?.publish({ t: 'loadout', owners }) });
if (!db) log('loadout: no database - loadout items found are kept only as long as this server runs');

// Where a game waits between the server going down and the next one (handoff.js): Postgres when there is one (it is
// what both servers of a deploy can reach), else files in HANDOFF_DIR or on the Railway volume (a restart on the
// same disk: `npm run dev`, the tests). Neither: a deploy ends every game, as it does with HANDOFF=0.
const HANDOFF_MAX_AGE = +(process.env.HANDOFF_MAX_AGE_SECONDS || 300); // a save nobody claimed in this long is dropped
const HANDOFF_DIR = process.env.HANDOFF_DIR || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'handoff') : '');
const store = process.env.HANDOFF === '0' ? null : db?.kind === 'postgres' ? new PgStore(db, { log }) : HANDOFF_DIR ? new FileStore(resolve(HANDOFF_DIR)) : null;
if (store) log(`handoff: games are handed to the next server through ${store instanceof PgStore ? 'Postgres' : store.dir}`);
else log(process.env.HANDOFF === '0' ? 'handoff: off (HANDOFF=0): a deploy ends every game' : 'handoff: no store to hand games over through (a Postgres DATABASE_URL, HANDOFF_DIR or a volume): a deploy ends every game. docs/deploys.md says what to set.');

// the settings changed in the database without a deploy (serversettings.js): the most games at once
const settings = db ? new ServerSettings({ db, log }) : null;
await settings?.start();

const lobby = new Lobby({
  settings,
  netMetrics,
  store,
  handoffMaxAge: HANDOFF_MAX_AGE,
  // how long a server going down waits for the next one to build its games' valleys before saving them (0: it does not)
  prepareMs: +(process.env.HANDOFF_PREPARE_MS ?? 3000),
  stats,
  matches,
  achievements,
  bestiary,
  cards,
  loadouts,
  maxGames: MAX_GAMES,
  maxPlayers: MAX,
  roomMaxPlayers: ROOM_MAX,
  limits: process.env.LOBBY_LIMITS !== '0', // 0: no per-address allowance on making games or asking for codes (load tests)
  idleMs: process.env.GAME_IDLE_SECONDS ? +process.env.GAME_IDLE_SECONDS * 1000 : undefined, // an empty game lasts this long (tests)
  log,
  // every game is made with these (all but the seed are for testing)
  gameOpts: {
    seed: SEED,
    dayLength: envNumber('DAY_SECONDS'),
    nightLength: envNumber('NIGHT_SECONDS'),
    startDay: envNumber('START_DAY'),
    godMode: process.env.GODMODE === '1',
    // Test, look-dev and `npm run dev` servers authorize every player without accounts. Other environments ignore it.
    devAdmin: devAdminAllowed(),
  },
});

// Several game servers behind the proxy (cluster.js, server/proxy/): CLUSTER=1, with Postgres for them to share.
// Without it this server is the whole game, as it always was.
const cluster = process.env.CLUSTER === '1' && db?.kind === 'postgres' ? new Cluster({ db, lobby, port: PORT, deployment: BUILD, log }) : null;
if (process.env.CLUSTER === '1' && !cluster) log('CLUSTER=1 needs a Postgres DATABASE_URL: running as a server on its own');
lobby.cluster = cluster;
cluster?.on('cards', (m) => cards.reload(m.owners));
cluster?.on('loadout', (m) => loadouts.reload(m.owners));
// bets left in escrow by games that never settled them (usercards.js ESCROW_MAX_AGE) go back, now and every hour
if (db) {
  cards.sweep();
  loadouts.sweep({ startup: true });
  setInterval(() => cards.sweep(), 3600_000).unref();
  setInterval(() => loadouts.sweep(), 3600_000).unref();
}

let stopping = false;

// accounts, friends and messages: only with a database
const auth = db ? new Auth({ db, stats, cards, loadouts, log }) : null;
const lobbyCards = new LobbyCards({ service: cards, loadouts, log, netMetrics });
const social = db ? new Social({ db, auth, lobby, cluster, log, netMetrics }) : null;
const feedback = db ? new Feedback({ db, matches, log }) : null; // what players think of the game: the end screen's poll
const userSettings = db ? new UserSettings({ db }) : null; // a player's own settings on their account: their keybinds, their survivors
if (auth) setInterval(() => auth.sweep().catch(() => {}), 3600_000).unref();
// levels and perks: kept with the stats, database or file (a pick reaches the games the player is in at once)
const progress = new Progress({
  stats,
  changed: (key, perks) => {
    lobby.progressChanged(key, perks);
    cluster?.publish({ t: 'progress', key, perks });
  },
});
cluster?.on('progress', (m) => lobby.progressChanged(m.key, m.perks));

// ---------------------------------------------------------------- static files (prod build)
const files = new Map(); // the client's files (http/static.js loadDir)
loadDir(files, DIST);
if (files.size) console.log(`[server] serving ${files.size} static files from dist/`);
else console.log('[server] no dist/ build found - run `npm run build` (or use `npm run dev` for the Vite dev server)');

// What is deployed, as a page knows it (/api/version, and written into the page itself):
//   build   the client: a hash of the page, which names its bundles by their content, so it changes when the client does
//           and only then. (CLIENT_BUILD: a build of another name, for the tests)
//   compat  the code the client and the server both run - shared/, and the protocol. A page of another compat cannot
//           play a game here: it would build another valley, predict other moves (client/net/moveback.js).
//           (CLIENT_COMPAT: another, for the tests)
const CLIENT_BUILD = process.env.CLIENT_BUILD || (files.get('/index.html') ? createHash('sha256').update(files.get('/index.html').body).digest('hex').slice(0, 12) : BUILD);
//           (compat.js: shared/, the protocol, and the wire codec outside shared/)
const COMPAT = process.env.CLIENT_COMPAT || compatOf(resolve(__dirname, '..'), PROTOCOL_VERSION);
stampPage(files, { build: CLIENT_BUILD, compat: COMPAT, protocol: PROTOCOL_VERSION });

// A game whose save this build cannot read is carried on by the build that saved it (builds.js, docs/deploys.md): this
// build's code goes into the store for the servers after it, and a save names the build its game runs on. Only signed
// builds are started (HANDOFF_BUILD_KEY, the deploy's secret): without the key, none is kept or started, and a game a
// later build cannot read ends at that deploy. HANDOFF_PIN=0: none of it. HANDOFF_PIN=unsigned: the store is trusted
// to hand this server code (a development server, the tests).
const PIN = process.env.HANDOFF_PIN ?? '1';
const BUILD_KEY = process.env.HANDOFF_BUILD_KEY || '';
const builds = store && PIN !== '0' && (BUILD_KEY || PIN === 'unsigned') ? new Builds({ store, root: resolve(__dirname, '..'), client: { build: CLIENT_BUILD, compat: COMPAT, protocol: PROTOCOL_VERSION }, dist: files, key: BUILD_KEY, unsigned: !BUILD_KEY && PIN === 'unsigned', log }) : null;
lobby.builds = builds;
if (store && PIN !== '0' && !builds) log('handoff: HANDOFF_BUILD_KEY is not set, so no build is kept for the servers after this one or started from the store: a game a later build cannot read (another map, save format or enums) will end at that deploy, its players told why. docs/deploys.md says what to set.');
else if (builds && builds.unsigned) log('handoff: HANDOFF_PIN=unsigned - builds in the store are started here unsigned: anyone who can write to the store can run code on this server');
const PACK_AFTER_MS = +(process.env.HANDOFF_PACK_AFTER_MS ?? 0); // (see app.listen; the tests put it off)

// The games the last server handed over: whatever is waiting already (a server that started after the last one went),
// and each one as it is saved - this server is up before the old one is told to stop. (Not while this one is
// stopping itself: it hears its own saves too.)
if (store) {
  await store.sweep(HANDOFF_MAX_AGE).catch((err) => log(`handoff: could not sweep old saves (${err.message})`));
  store.listen((code) => stopping || lobby.restore(code));
  // (and the games a server going down is about to hand over: their valleys are built here while it still plays them)
  store.listenComing?.((code, info) => stopping || lobby.prepare(code, info));
  for (const code of await store.pending().catch(() => [])) lobby.restore(code);
  setInterval(() => store.sweep(HANDOFF_MAX_AGE).catch(() => {}), 60_000).unref();
}

// ---------------------------------------------------------------- who is connecting
// The session token a request or socket's handshake carries (auth.js), '' for none - or for one sent by a page on
// another site, which could otherwise have a signed-in player's browser play, or listen to their messages, as them
function sessionToken(req) {
  if (!auth || !sameOrigin(req.getHeader('origin'), req.getHeader('host'))) return '';
  return parseCookies(req.getHeader('cookie'))[COOKIE] || '';
}
const isStopping = () => stopping;

const app = uWS.App();
// ---------------------------------------------------------------- the sockets (sockets.js)
const gameSocks = gameSockets(app, { lobby, store, builds, auth, stats, netMetrics, log, stopping: isStopping, sessionToken, address: clientAddress });
cardSockets(app, { lobbyCards, auth, netMetrics, log, sessionToken, address: clientAddress });

// ---------------------------------------------------------------- the lobby (http/lobby.js)
lobbyRoutes(app, { lobby, store, builds, auth, stats, netMetrics, log, stopping: isStopping, version: { protocol: PROTOCOL_VERSION, build: CLIENT_BUILD, compat: COMPAT }, sessionToken, address: clientAddress });

// ---------------------------------------------------------------- accounts, friends, messages, the records
// All JSON (http.js api); an error is { error } with its status. Signed in is the stn_session cookie.
const route = (method, path, fn, opts = {}) => api(app, method, path, fn, { address: clientAddress, metrics: netMetrics, ...opts });
statsRoutes(route, { db, auth, stats, lobby, cluster, log });
accountRoutes(route, { auth, stats, matches, achievements, social, userSettings });
loadoutRoutes(route, { auth, loadouts });
feedbackRoutes(route, { auth, feedback });
progressRoutes(route, { auth, progress });
friendRoutes(route, { auth, social });
socialSockets(app, { social, auth, netMetrics, sessionToken });

// ---------------------------------------------------------------- how the box is doing
let mainCpuAt = process.threadCpuUsage();
let mainElu = performance.eventLoopUtilization();
let mainLoad = { cpuMs: 0, elu: 0 }; // this thread over the last second: CPU ms per second, share of time busy
setInterval(() => {
  const cpu = process.threadCpuUsage(mainCpuAt);
  mainCpuAt = process.threadCpuUsage();
  const e = performance.eventLoopUtilization(mainElu);
  mainElu = performance.eventLoopUtilization();
  mainLoad = { cpuMs: Math.round((cpu.user + cpu.system) / 10) / 100, elu: Math.round(e.utilization * 1000) / 1000 };
}, 1000).unref();
// the network thread's load and its game sockets, for /status and the admin panel
const networkLoad = () => ({ ...mainLoad, sockets: gameSocks.sockets() });

// ---------------------------------------------------------------- the admin panel
// /admin (client/admin.html) and its API, /api/admin/* (adminpanel.js): an admin account only, checked on every request.
// Registered without a database too, where every route says there are no accounts.
new AdminPanel({
  auth,
  db,
  lobby,
  cluster,
  settings,
  social,
  store,
  info: { build: BUILD, clientBuild: CLIENT_BUILD, port: PORT },
  net: networkLoad,
  bandwidth: (ctx) => netMetrics.snapshot(ctx),
  stopping: isStopping,
  restart: (code) => shutdown('admin restart', code),
  log,
}).routes(route);

statusRoute(app, { lobby, db, cluster, net: networkLoad, netMetrics });
// the page and the client's files: every GET the routes above do not answer
clientRoutes(app, { files, builds, lobby, stopping: isStopping, log });

app.listen(PORT, (token) => {
  if (!token) {
    console.error(`[server] failed to listen on port ${PORT}`);
    process.exit(1);
  }
  // (this build into the store for the servers after it - only where it can be used (builds: a key, or
  // HANDOFF_PIN=unsigned), and not on the way up: once it listens, off the event loop but for a few ms at a time (about
  // 75 ms in all), so it is ready long before this server can be told to stop. Its games' saves name it, so a server
  // told to stop before it is done waits for it: Lobby.handoffAll)
  if (builds) setTimeout(() => stopping || builds.pack(), PACK_AFTER_MS).unref();
  console.log(`[server] listening on http://localhost:${PORT} (ws /ws) up to ${MAX_GAMES} games of ${MAX} players (${ROOM_MAX} at most)`);
  // (only once it can be reached: then the proxy may send it players)
  if (cluster) {
    const join = () =>
      stopping ||
      cluster.start({ build: CLIENT_BUILD }).catch((err) => {
        log(`cluster: could not join the other servers (${err.message}): trying again`);
        setTimeout(join, 2000).unref();
      });
    join();
  }
});

// a file-kept leaderboard goes to disk every half minute if it changed, and once more on the way out
if (stats.save) setInterval(() => stats.save(), 30000);
process.on('exit', () => stats.saveSync?.());

// Going down (a deploy sends SIGTERM; the next server is already taking the new connections): every game with players
// in it is handed over to the next server (Lobby.handoffAll). Every match left - a game that could not be handed over,
// one with nobody in it - is ended as it stands and written, with what was still on its way to the database, before
// the process goes. All within HARD_EXIT_MS, whatever happens, which has to stay under the time Railway gives a
// deployment to stop before it kills it (drainingSeconds in railway.json).
const HARD_EXIT_MS = 20_000;
const HANDOFF_WAIT_MS = 8000; // the most a game's worker may take to save it
// exitCode: 0 for a signal; an admin's restart (adminpanel.js) exits with another, for a host that starts the server
// again only after a failure
async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(exitCode), HARD_EXIT_MS).unref();
  // (behind the proxy: nothing new is sent here now, and the servers the games go to are known)
  if (cluster) await Promise.race([cluster.drain(), new Promise((r) => setTimeout(r, 2000))]).catch((err) => log(`cluster: could not say this server is going (${err.message})`));
  if (store) await handOverGames(signal);
  if (db) await writeAndClose(signal);
  else await store?.close();
  process.exit(exitCode);
}
// every game with players in it, to the next server (Lobby.handoffAll)
async function handOverGames(signal) {
  log(`${signal}: handing the games over to the next server`);
  const t0 = Date.now();
  try {
    const n = await lobby.handoffAll(store, HANDOFF_WAIT_MS);
    log(`${signal}: ${n} game(s) handed over in ${Date.now() - t0} ms`);
  } catch (err) {
    console.error('[server] handing over:', err.message);
  }
}
// the matches left ended and written, everything still on its way to the database written, and the database closed
async function writeAndClose(signal) {
  log(`${signal}: writing the matches being played`);
  try {
    await lobby.finishAll(1500);
    await matches.close();
    for (const room of lobby.rooms.values()) if (room.match) await matches.interrupt(room.match);
    await stats.close();
    await achievements.close();
    await bestiary.close();
    await lobbyCards.closeAll();
    await cards.close([...lobby.rooms.values()]); // (the bets of the games not handed over go back; the finds are written)
    await loadouts.close();
    await store?.close();
    await cluster?.stop().catch((err) => log(`cluster: rows of this server left for the others to sweep (${err.message})`));
    settings?.stop();
    await db.close();
  } catch (err) {
    console.error('[server] shutting down:', err.message);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// A Windows process cannot be sent SIGTERM (it is killed outright), so a process manager there - pm2 - asks a server
// with an IPC channel to stop with the message 'shutdown' instead; the tests stop a server that way on Windows too.
// (Only a parent that spawned this server with an IPC channel can send it.)
process.on('message', (m) => (m === 'shutdown' || m?.t === 'shutdown') && shutdown('shutdown message'));
