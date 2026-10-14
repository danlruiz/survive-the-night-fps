// The lobby's HTTP routes (index.js; the lobby itself is rooms.js): the public games and what a new one can be, one
// game by its code (an invite card), what runs here (/api/version, which a page moved by a deploy asks), making a game,
// and /status. These are plain uWS routes, older than http.js api(): each writes its JSON itself (json).
import { abortWatch, readBody } from '../http.js';
import { chosenDifficulty } from '../../shared/difficulty.js';
import { mayPlayMap2 } from '../devadmin.js';
import { idKey } from '../stats.js';

const STATUS_TEXT = { 200: '200 OK', 201: '201 Created', 400: '400 Bad Request', 404: '404 Not Found', 409: '409 Conflict', 413: '413 Payload Too Large', 415: '415 Unsupported Media Type', 429: '429 Too Many Requests', 503: '503 Service Unavailable' };
const MAKE_BODY_MAX = 2048; // the most a POST /api/games may send
// what a player who has not beaten map 1 is told when they ask for a game on map 2 (the client says the same: rejectText)
const MAP1_FIRST = 'Map 2 opens once you have beaten map 1: fix the car and drive off the island with your team.';

// The lobby as /api/games and /status show it: how many games and players, and what a new game can be
const lobbyInfo = (lobby) => ({ games: lobby.rooms.size, maxGames: lobby.cluster || lobby.maxTotal === null ? lobby.maxGames : Math.min(lobby.maxGames, lobby.maxTotal), canCreate: lobby.canCreate, players: lobby.players(), defaultPlayers: lobby.maxPlayers, maxPlayers: lobby.roomMaxPlayers });

// version: { protocol, build, compat } of what runs here (index.js CLIENT_BUILD, COMPAT). stopping(): going down.
// sessionToken(req): its cookie's, from a page of ours. address(res, req): the client's
export function lobbyRoutes(app, { lobby, store, builds, auth, stats, netMetrics, log, stopping, version, sessionToken, address }) {
  const json = (res, status, obj) => {
    const body = JSON.stringify(obj);
    netMetrics.httpOut(body);
    res.cork(() => {
      res.writeStatus(STATUS_TEXT[status] || String(status)).writeHeader('Content-Type', 'application/json').writeHeader('Cache-Control', 'no-store').end(body);
    });
  };

  // the public games, and what a new one can be
  app.get('/api/games', (res) => json(res, 200, { ...lobbyInfo(lobby), list: lobby.list() }));

  // one game by its code (an invite link asks before joining: who is in it, is there a seat)
  app.get('/api/games/:code', (res, req) => {
    const code = req.getParameter(0);
    const ip = address(res, req);
    const answer = () => {
      const room = lobby.find(code, ip);
      if (room) json(res, 200, room.info());
      else json(res, 404, { error: 'No game goes by that code. It may have ended.' });
    };
    if (!store || lobby.rooms.has(String(code).toUpperCase())) return answer();
    // (one the last server handed over and nobody has asked for yet)
    const aborted = abortWatch(res);
    lobby
      .restore(code)
      .catch(() => null)
      .then(() => aborted() || answer());
  });

  // What runs here: { protocol, build, compat } (see CLIENT_BUILD in index.js). A client moved by a deploy (handoff.js)
  // asks before going back in, with its game's code (?game=CODE): whether it can go back in as it is, or has to be
  // loaded again first, is client/net/moveback.js's to decide. (A page from before compat compares the build alone.)
  // A server going down answers 503: its answer is not what the page will be playing on (the edge may send the page's
  // next request to the new server, or this one, until this one is gone), so the page asks again. (The body is the same,
  // for a page from before this, which reads it whatever the status and joins, and is turned away here as before.)
  // With ?game=CODE it is what runs that game: an older build's client for a game that build carries on here (builds.js),
  // once it is known what became of the game's restore.
  const versionOf = (room) => (room?.pin ? { protocol: room.pin.client.protocol, build: room.pin.client.build, compat: room.pin.client.compat, pinned: true } : version);
  app.get('/api/version', (res, req) => {
    if (stopping()) return json(res, 503, { ...version, stopping: true });
    const code = String(req.getQuery('game') || '')
      .trim()
      .toUpperCase();
    const room = code ? lobby.rooms.get(code) : null;
    if (!code || !builds || (room && room.ready && !room.closed)) return json(res, 200, versionOf(room));
    const aborted = abortWatch(res);
    lobby
      .settle(code)
      .catch(() => null)
      .then((r) => aborted() || json(res, stopping() ? 503 : 200, versionOf(r)));
  });

  // makes a game: { name, host, inviteOnly, maxPlayers, difficulty, map, guestId } -> its info, code included.
  // difficulty is ember, nightfall or blackout (shared/difficulty.js). Left off, it is Nightfall, which plays as the valley always has.
  // map: 1 (the island, and left off) or 2: every run begins on the mainland (acts.js MAINLAND_START), for whoever has
  // beaten map 1 - signed in, their account; a guest, their browser's id (guestId, posted as a JOIN carries it).
  app.post('/api/games', (res, req) => {
    const ip = address(res, req);
    const token = sessionToken(req);
    // (JSON only: a form on another site cannot post that without the browser asking this server first)
    if (!/^application\/json\b/i.test(req.getHeader('content-type'))) return json(res, 415, { error: 'Send JSON' });
    const aborted = abortWatch(res);
    readBody(res, MAKE_BODY_MAX, netMetrics).then(
      (body) => {
        let o;
        try {
          o = JSON.parse(body.toString('utf8') || '{}');
        } catch {
          return json(res, 400, { error: 'Bad request' });
        }
        if (!o || typeof o !== 'object') return json(res, 400, { error: 'Bad request' });
        const difficulty = chosenDifficulty(o.difficulty);
        if (!difficulty) return json(res, 400, { error: 'Pick easy, standard, or hard.' });
        if (o.map !== undefined && o.map !== 1 && o.map !== 2) return json(res, 400, { error: 'Pick map 1 or map 2.' });
        const startAct = o.map === 2 ? 2 : 1;
        // who it is made by, for their one game at a time: the account signed in, else the address
        const user = token ? auth.userForToken(token).catch(() => null) : null;
        Promise.resolve(user)
          .then(async (u) => {
            if (startAct === 2 && !mayPlayMap2(u) && !(await stats.map1Cleared(u ? { userId: u.id } : { guestKey: idKey(o.guestId) }))) return { error: MAP1_FIRST, status: 403 };
            return lobby.make({ name: o.name, host: o.host, inviteOnly: o.inviteOnly === true, maxPlayers: o.maxPlayers, difficulty, startAct }, { ip, maker: u ? `u:${u.id}` : `ip:${ip}` });
          })
          .then(async (made) => {
            if (made.error) return aborted() || json(res, made.status, made.code ? { error: made.error, code: made.code } : { error: made.error });
            // (behind the proxy: listed before its maker hears the code, so the proxy can send them to it)
            await made.room.up;
            aborted() || json(res, 201, made.room.info());
          })
          .catch((err) => {
            log(`game not made (${err.message})`);
            aborted() || json(res, 503, { error: 'The game could not be made. Try again in a moment.' });
          });
      },
      () => json(res, 413, { error: 'Too much' })
    );
  });
}

// /status: how the box is doing, for anyone. Timings and counts only, no codes (an invite-only game's code is its key).
// tick: per game, the last 10 s window, the totals since it started and its last slow tick. net(): the network
// thread's { cpuMs, elu, sockets }
export function statusRoute(app, { lobby, db, cluster, net, netMetrics }) {
  app.get('/status', (res) => {
    const mem = process.memoryUsage();
    const games = [...lobby.rooms.values()].map((r) => ({ players: r.st.players, max: r.maxPlayers, public: !r.inviteOnly, phase: r.st.phase, day: r.st.day, load: r.st.load, heapMb: r.st.heapMb, tick: r.st.tick }));
    const body = JSON.stringify({ ...lobbyInfo(lobby), db: db ? db.kind : null, server: cluster ? { id: cluster.id, deployment: cluster.deployment, draining: cluster.draining } : undefined, net: net(), rssMb: Math.round(mem.rss / 1e6), list: games });
    netMetrics.httpOut(body);
    res.writeHeader('Content-Type', 'application/json').writeHeader('Cache-Control', 'no-store').writeHeader('Access-Control-Allow-Origin', '*').end(body);
  });
}
