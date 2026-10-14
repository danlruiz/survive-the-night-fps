// The HTTP API of the leaderboard and the stats page (index.js; stats.js / dbstats.js, publicstats.js).
import { HttpError } from '../http.js';
import { signedIn } from '../auth.js';
import { PublicStats, RANGES } from '../publicstats.js';

// route: index.js's (method, path, fn, opts). db, auth, cluster: null without them
export function statsRoutes(route, { db, auth, stats, lobby, cluster, log }) {
  // The splash has no game socket yet, so it reads the public, all-time board here. Once in a game the binary board
  // message is still used: that version also includes the requesting player and everyone currently in their game.
  route('get', '/api/leaderboard', async () => {
    const { total, rows } = await stats.board(null, new Set());
    return {
      body: {
        total,
        rows: rows.map((r) => ({
          name: r.name,
          me: false,
          here: false,
          kills: r.kills,
          nights: r.nights,
          wins: r.wins,
          revives: r.revives,
          ranks: null,
        })),
      },
    };
  });

  // The stats page (/stats, publicstats.js): the whole game's numbers for anyone, ?range=7d|30d|90d|all. Without a
  // database: { enabled: false, live } - only what is being played now.
  const liveList = (list) => list.slice(0, 20).map((g) => ({ code: g.code, name: g.name, players: g.players, max: g.max, day: g.day, phase: g.phase, difficulty: g.difficulty }));
  const liveNow = async () => {
    if (cluster) {
      const list = await db
        .query(`SELECT info FROM cluster_games WHERE NOT invite_only AND server_id IN (SELECT id FROM cluster_servers WHERE seen_at > now() - interval '30 seconds')`)
        .then((r) => r.rows.map((x) => x.info))
        .catch(() => []);
      return { games: cluster.servers.reduce((n, s) => n + s.games, 0), players: cluster.servers.reduce((n, s) => n + s.players, 0), list: liveList(list) };
    }
    return { games: lobby.rooms.size, players: lobby.players(), list: liveList(lobby.list()) };
  };
  const publicStats = db ? new PublicStats({ db, live: liveNow, log }) : null;
  const statsRange = (ctx) => (ctx.query.get('range') in RANGES ? ctx.query.get('range') : '30d');
  route('get', '/api/stats', async (ctx) => ({ body: publicStats ? await publicStats.publicView(statsRange(ctx)) : { enabled: false, live: await liveNow() } }));
  // ...and what only an admin sees: who comes back, how long they stay, the server's health, each deploy's matches
  route('get', '/api/stats/admin', async (ctx) => {
    const me = await signedIn(auth, ctx);
    if (!me.isAdmin) throw new HttpError(403, 'Only an admin can see this.');
    return { body: await publicStats.adminView(statsRange(ctx)) };
  });
}
