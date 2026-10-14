// The network thread's WebSockets (index.js): /ws, a game's (the lobby routes it to its game: rooms.js), /cards, the
// lobby's card table (lobbycards.js), and /social, a signed-in page's line for what happens while it is open
// (social.js).
//
// A socket's handshake is answered at once, whatever has to be waited for (who its cookie signs in, a game being
// brought back): what it sends meanwhile is kept, and played once that is known (whenKnown).
import uWS from 'uWebSockets.js';
import { rejectBytes } from './rooms.js';
import { mayPlayMap2 } from './devadmin.js';
import { gameInChannel, payloadBytes } from './netmetrics.js';
import { REJECT_REASON } from '../shared/protocol.js';

const EARLY_MAX = 8; // messages kept for a socket that is still waiting for its seat (/ws open)
const KNOCK_MS = 1000; // how long a socket at a full game has to send its JOIN (seat): a page sends it as the socket opens

// What upgrading a socket needs of its handshake, read now (req is only valid until the upgrade callback returns):
// -> (res, userData) => the upgrade, then or later
function handshake(req, context) {
  const key = req.getHeader('sec-websocket-key');
  const proto = req.getHeader('sec-websocket-protocol');
  const ext = req.getHeader('sec-websocket-extensions');
  return (res, userData) => res.upgrade(userData, key, proto, ext, context);
}

// The account a socket's session token signs in (re-read, never from the minute's cache: admin role changes and
// revoked sessions must not come from it), or null; a lookup that fails is a guest
function freshUser(auth, token, log, asWhat) {
  return token
    ? auth.userForToken(token, true).catch((err) => {
        log(`session lookup failed (${err.message}): ${asWhat}`);
        return null;
      })
    : null;
}

// A socket whose user data waits on something (d.wait -> the account, or null) as it opens: what it sends meanwhile
// goes into d.early (its message handler), and once the wait is over ready(early) is called with all of it - unless it
// closed meanwhile
function whenKnown(ws, ready) {
  const d = ws.getUserData();
  d.early = [];
  d.wait.then((user) => {
    const early = d.early;
    d.wait = d.early = null;
    if (!early) return; // (closed while it waited)
    d.user = user;
    ready(early);
  });
}

// /ws: a game's socket. Its seat in its game (?game=CODE), or in whichever a quick join picks - or it is told why not,
// and closed. -> { sockets(): how many are open over every game }
// sessionToken(req): its cookie's, from a page of ours. address(res, req): the client's. stopping(): going down
export function gameSockets(app, { lobby, store, builds, auth, stats, netMetrics, log, stopping, sessionToken, address }) {
  const perIp = new Map(); // address -> sockets it has open
  // sockets one address may have open over all the games (a household, a LAN party). 0: no limit (load tests)
  const CONN_PER_IP = +(process.env.CONN_PER_IP ?? 24);

  // join: its JOIN, once it has sent it. At a full game the seat waits for that (d.knocked): it may be one of the game's
  // own players coming back while their old socket is still open here, who is let in (Room.mayComeBack)
  // early: everything the socket sent before it had a seat, its JOIN first (open), for a game it may have to wait on (map1Gate)
  function seat(ws, join = null, early = null) {
    const d = ws.getUserData();
    let reason = 0;
    let room = null;
    if (stopping()) reason = REJECT_REASON.FULL; // (going down: new sockets belong on the next server)
    else if (CONN_PER_IP && (perIp.get(d.ip) || 0) >= CONN_PER_IP) reason = REJECT_REASON.FULL;
    else {
      room = d.code ? lobby.find(d.code, d.ip) : lobby.quick();
      // a game that starts on the mainland: only for whoever has beaten map 1, which takes their JOIN to know (a guest is
      // their browser's id) and a look at their record first
      if (room && room.startAct === 2 && !d.map1 && !mayPlayMap2(d.user)) {
        if (join) return map1Gate(ws, room, join, early);
        if (!d.knocked) knock(ws);
        return;
      }
      if (room?.full && d.code && !join && !d.knocked) {
        knock(ws);
        return;
      }
      const slot = room ? room.attach(ws, join) : -1;
      if (slot >= 0) {
        d.room = room;
        d.slot = slot;
      } else reason = room || !d.code ? REJECT_REASON.FULL : lobby.wasLost(d.code) || REJECT_REASON.NO_GAME; // (wasLost: a deploy ended it, and why)
    }
    if (reason) return turnAway(ws, reason, room);
    perIp.set(d.ip, (perIp.get(d.ip) || 0) + 1);
    d.counted = true;
    d.at = Date.now();
  }
  // told why, the way the game tells a join it turns away (the client closes on it; this closes it anyway) - in the
  // codec of the game's own client, for one an older build carries on (or carried on, when a deploy ended it)
  function turnAway(ws, reason, room) {
    const d = ws.getUserData();
    const bytes = rejectBytes(reason, room?.proto || (d.code ? lobby.lostProto(d.code) : undefined));
    netMetrics.wsOut('game_rejects', bytes);
    ws.send(bytes, true, false);
    ws.end(1000, 'rejected');
  }
  // A socket with no seat yet waits for its JOIN (a page sends it as the socket opens): what it sends is kept, and the
  // first of it is taken for the JOIN (message). One that never sends it is seated, or turned away, without
  function knock(ws) {
    const d = ws.getUserData();
    d.knocked = true;
    d.early = [];
    setTimeout(() => {
      if (d.early && !d.room && d.knocked) seat(ws, new Uint8Array(0)); // (never said who it is: turned away, or seated if there is room now)
    }, KNOCK_MS);
  }
  // Whether the player whose JOIN this is has beaten map 1 (stats map1Cleared), before they are seated in a game that
  // starts on the mainland. What the socket sends meanwhile is kept, and goes to the game after the JOIN once they are
  // in. One who has not is told so (REJECT_REASON.MAP1_FIRST). The record that cannot be read lets them in: the gate is
  // the game's design, not anybody's safety.
  function map1Gate(ws, room, join, early) {
    const d = ws.getUserData();
    const sent = early?.length ? early : [join];
    d.knocked = false;
    d.early = []; // (message: kept here meanwhile)
    const key = room.keyOf(join, d.user);
    const who = d.user ? { userId: d.user.id } : key.startsWith('g:') ? { guestKey: key.slice(2) } : null;
    const ask = room.keys.includes(key) ? Promise.resolve(true) : who ? Promise.resolve(stats.map1Cleared(who)) : Promise.resolve(false);
    ask
      .catch((err) => {
        log(`game ${room.code}: whether a player has beaten map 1 could not be read (${err.message}): let in`);
        return true;
      })
      .then((ok) => {
        const later = d.early;
        d.early = null;
        if (!later) return; // (closed while it waited)
        if (!ok) return turnAway(ws, REJECT_REASON.MAP1_FIRST, room);
        d.map1 = true;
        seat(ws, join);
        for (const bytes of [...sent, ...later]) if (d.room) hear(ws, bytes);
      });
  }
  // a message from a game socket, for its game
  function hear(ws, bytes) {
    const d = ws.getUserData();
    if (!d.room) return;
    d.room.deliver(d.slot, bytes, !d.heard);
    d.heard = true;
  }

  app.ws('/ws', {
    compression: uWS.DISABLED, // payloads are already tightly packed binary (measured: deflate only takes ~10% more off)
    maxPayloadLength: 64 * 1024,
    maxBackpressure: 512 * 1024,
    idleTimeout: 60,
    sendPingsAutomatically: true,
    upgrade: (res, req, context) => {
      const ip = address(res, req);
      const code = String(req.getQuery('game') || '').trim().toUpperCase(); // none: a quick join
      const back = !!code && req.getQuery('back') === '1'; // the page coming back into the game it was playing (Game.handleJoin)
      // signed in (the session cookie, from a page of ours): they play as their account (Game.handleJoin)
      const token = sessionToken(req);
      const upgrade = handshake(req, context);
      // (a game the last server handed over that is still in the store: brought back first, so the socket finds it. A
      // quick join with no game to go to, in a cluster: one is made first, as the other servers have to be asked)
      // (one whose save this build could not read, being carried on by an older build instead: waited for too - settle)
      const pending = code && store && (!lobby.rooms.has(code) || (lobby.rooms.get(code).from && !lobby.rooms.get(code).ready));
      const restoring = pending ? (builds ? lobby.settle(code) : lobby.restore(code)).catch((err) => log(`game ${code} not restored (${err.message})`)) : !code && lobby.cluster && !lobby.quickPick() ? lobby.make({ quick: true }) : null;
      const user = freshUser(auth, token, log, 'joining as a guest');
      // The handshake is answered here and now, whatever has to be waited for: the socket gets its seat once that is
      // known (open). Upgrading later, from res.cork() once the promise settles, is what uWebSockets documents, and in
      // v20.52 it drops sockets (seen on Linux: most of them): after the callback, cork() still takes the socket for the
      // HTTP response it was, and reads that response's flags from where they used to be, which the upgrade has given
      // up; when what is there reads as "Connection: close, all sent" it closes the socket, straight after open (close
      // code 1006, 0 ms). Fixed upstream in uNetworking/uWebSockets#1929. (scripts/test-session-socket.js)
      const wait = user || restoring ? Promise.all([user, restoring]).then(([u]) => u, () => null) : null;
      upgrade(res, { ip, code, back, user: null, wait, early: null, knocked: false, map1: false, room: null, slot: -1, counted: false, heard: false, at: 0 });
    },
    open: (ws) => {
      if (!ws.getUserData().wait) return seat(ws);
      // who they are, or the game being brought back, is not known yet: what they send meanwhile (their JOIN) is kept
      whenKnown(ws, (early) => {
        const d = ws.getUserData();
        seat(ws, early[0] || null, early);
        for (const bytes of early) if (d.room) hear(ws, bytes); // (no room: turned away, and closed by now; knocking, or waiting on map1Gate: seat)
      });
    },
    message: (ws, message, isBinary) => {
      if (!isBinary) {
        netMetrics.wsIn('game_other', payloadBytes(message));
        return;
      }
      const bytes = new Uint8Array(message); // (copied by the room if it crosses an async boundary)
      netMetrics.wsIn(gameInChannel(bytes), bytes.byteLength);
      const d = ws.getUserData();
      if (!d.early) return hear(ws, bytes);
      if (d.knocked && !d.wait) {
        // its JOIN, at a full game: one of its own players coming back gets a seat (seat), anyone else is turned away
        const join = new Uint8Array(message.slice(0));
        d.early = null;
        seat(ws, join);
        if (d.room) hear(ws, join);
        return;
      }
      // (a client sends its JOIN and then waits for the answer: more than a few messages before it is not one of ours)
      if (d.early.length >= EARLY_MAX) return ws.end(1008, 'Too much before joining');
      d.early.push(new Uint8Array(message.slice(0)));
    },
    drain: (ws) => {
      const d = ws.getUserData();
      d.room?.drained(d.slot);
    },
    close: (ws, closeCode) => {
      const d = ws.getUserData();
      d.early = null;
      // a seat taken by a socket that went before its JOIN came: how, and how soon (a browser that gave up on the
      // handshake shows as 1006 a round trip in; the client tries again, connection.js)
      if (d.room && !d.heard) log(`socket in game ${d.room.code} closed before it joined (code ${closeCode}, ${Date.now() - d.at} ms)`);
      if (d.counted) {
        const n = (perIp.get(d.ip) || 1) - 1;
        if (n > 0) perIp.set(d.ip, n);
        else perIp.delete(d.ip);
        d.counted = false;
      }
      const room = d.room;
      d.room = null;
      room?.detach(d.slot, closeCode);
    },
  });

  return { sockets: () => [...perIp.values()].reduce((a, b) => a + b, 0) };
}

// /cards: the lobby's card table (lobbycards.js), for guests and the signed-in alike
export function cardSockets(app, { lobbyCards, auth, netMetrics, log, sessionToken, address }) {
  app.ws('/cards', {
    compression: uWS.DISABLED,
    maxPayloadLength: 16 * 1024,
    maxBackpressure: 256 * 1024,
    idleTimeout: 120,
    sendPingsAutomatically: true,
    upgrade: (res, req, context) => {
      const token = sessionToken(req);
      const upgrade = handshake(req, context);
      const wait = freshUser(auth, token, log, 'playing lobby cards as a guest');
      upgrade(res, { ip: address(res, req), user: null, wait, early: null, cardsJoined: false });
    },
    open: (ws) => {
      if (!ws.getUserData().wait) return lobbyCards.open(ws);
      whenKnown(ws, (early) => {
        lobbyCards.open(ws);
        for (const bytes of early) lobbyCards.message(ws, bytes);
      });
    },
    message: (ws, message, isBinary) => {
      netMetrics.wsIn('lobby_cards', payloadBytes(message));
      if (!isBinary) return;
      const d = ws.getUserData();
      const bytes = new Uint8Array(message.slice(0));
      if (!d.early) return lobbyCards.message(ws, bytes);
      if (d.early.length >= EARLY_MAX) return ws.end(1008, 'Too much before joining');
      d.early.push(bytes);
    },
    close: (ws) => {
      ws.getUserData().early = null;
      lobbyCards.close(ws);
    },
  });
}

// /social: a signed-in page's line for what happens while it is open (social.js): text frames of JSON, server to page
export function socialSockets(app, { social, auth, netMetrics, sessionToken }) {
  app.ws('/social', {
    compression: uWS.DISABLED,
    maxPayloadLength: 1024, // (it says nothing that matters: everything it does goes by the HTTP API)
    idleTimeout: 120,
    sendPingsAutomatically: true,
    upgrade: (res, req, context) => {
      const token = sessionToken(req);
      const upgrade = handshake(req, context);
      const refuse = () => res.cork(() => res.writeStatus('401 Unauthorized').end('Sign in first'));
      if (!token) return refuse();
      let aborted = false;
      res.onAborted(() => {
        aborted = true;
      });
      auth.userForToken(token).then(
        (user) => aborted || (user ? res.cork(() => upgrade(res, { user })) : refuse()),
        () => aborted || res.cork(() => res.writeStatus('503 Service Unavailable').end())
      );
    },
    open: (ws) => social.socketOpened(ws),
    message: (ws, message) => {
      netMetrics.wsIn('social', payloadBytes(message));
    },
    close: (ws) => social.socketClosed(ws),
  });
}
