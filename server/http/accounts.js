// The HTTP API of accounts (index.js; auth.js): signing up, in and out, and what an account keeps - its lifetime stats
// and last matches, its achievements, its keybinds and its own survivors - and an account's public profile by name.
// All JSON; an error is { error } with its status (and a `field` it is about, for a form). Signed in is the
// stn_session cookie. Without a database: /api/auth/me says { accounts: false }, the reads the browser can do without
// say so too, and the rest are 503s.
import { HttpError, putOrPost } from '../http.js';
import { Auth, publicUser, noAccounts, signedIn } from '../auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// route: index.js's (method, path, fn, opts). auth, stats, matches, achievements, social, userSettings: null without a
// database (but stats, which is the file-kept leaderboard then)
export function accountRoutes(route, { auth, stats, matches, achievements, social, userSettings }) {
  // who this browser is signed in as: { accounts, user: { id, username, email, createdAt } | null }
  route('get', '/api/auth/me', async (ctx) => {
    if (!auth) return { body: { accounts: false, user: null } };
    const u = await auth.me(ctx);
    return { body: { accounts: true, user: u ? publicUser(u) : null } };
  });
  // { email, username, password, guestId? } -> 201 { user }, signed in. guestId: the browser's leaderboard id, whose
  // stats move onto the account
  route(
    'post',
    '/api/auth/register',
    async (ctx, b) => {
      if (!auth) noAccounts();
      const { user, cookie } = await auth.register(b, ctx);
      return { status: 201, body: { user: publicUser(user) }, cookies: [cookie] };
    },
    { body: true }
  );
  // { login (email or name), password, guestId? } -> { user }, signed in
  route(
    'post',
    '/api/auth/login',
    async (ctx, b) => {
      if (!auth) noAccounts();
      const { user, cookie } = await auth.login(b, ctx);
      return { body: { user: publicUser(user) }, cookies: [cookie] };
    },
    { body: true }
  );
  route(
    'post',
    '/api/auth/logout',
    async (ctx) => {
      if (auth) await auth.logout(ctx);
      return { body: { ok: true }, cookies: auth ? [auth.clearCookie(Auth.secure(ctx))] : [] };
    },
    { body: true }
  );

  // your lifetime stats and your last matches: { stats: { kills, ..., ranks } | null, recent: [match] }
  route('get', '/api/me/stats', async (ctx) => {
    const me = await signedIn(auth, ctx);
    const [mine, recent] = await Promise.all([stats.forUser(me.id), matches.recentFor(me.id)]);
    return { body: { stats: mine, recent } };
  });

  // An account's profile by the name it plays under, for the player list's profile card: { username, since, xp, level,
  // perks, stats: { kills, nights, wins, revives, games, deaths, downs, headshots, bossKills, bestDay, playSeconds } }.
  // What the leaderboard shows anyway, and their perks; nothing that says who they are beyond the name.
  route('get', '/api/players/:name', async (ctx) => {
    if (!auth) noAccounts();
    const p = await stats.profile(ctx.params[0]);
    if (!p) throw new HttpError(404, 'Nobody plays under that name.');
    return { body: p };
  });

  // your achievements (shared/achievements.js): { stats: { kills, nights, ... }, unlocked: [{ id, at (ms), source }] }.
  // Without accounts on this server: { accounts: false } - the browser keeps its own
  route('get', '/api/achievements', async (ctx) => {
    if (!auth) return { body: { accounts: false, stats: null, unlocked: [] } };
    return { body: await achievements.forUser((await signedIn(auth, ctx)).id) };
  });
  // a friend's, the same shape (anyone else's is a 403)
  route('get', '/api/achievements/:id', async (ctx) => {
    const me = await signedIn(auth, ctx);
    const id = ctx.params[0].toLowerCase();
    if (!UUID_RE.test(id)) throw new HttpError(404, 'No such player.');
    if (id !== me.id && !(await (social || noAccounts()).areFriends(me.id, id))) throw new HttpError(403, "Only your friends' achievements can be seen.");
    return { body: await achievements.forUser(id) };
  });
  // What this browser earned as a guest, { stats, unlocked: { id: ms } }, merged into your account (the greater of each
  // count, every unlock of either) -> your achievements, as GET. Taken on trust: it never touches the leaderboard
  route('post', '/api/achievements/merge', async (ctx, b) => ({ body: await achievements.merge((await signedIn(auth, ctx)).id, b) }), { body: true, max: 16384 });

  // your keybinds, as your account keeps them: { binds: { action: [primary, secondary] } | null, updatedAt: ms (0: never
  // saved) }. Only what differs from the defaults (shared/binds.js). Without accounts on this server: { accounts: false }
  // and no binds - the browser keeps its own.
  route('get', '/api/me/binds', async (ctx) => {
    if (!auth) return { body: { accounts: false, binds: null, updatedAt: 0 } };
    return { body: await userSettings.binds((await signedIn(auth, ctx)).id) };
  });
  // { binds, updatedAt } -> what the account keeps afterwards, the same shape: yours, unless it already had newer ones
  // (usersettings.js). Junk - an action that isn't one, a key that isn't one - is a 400.
  putOrPost(
    route,
    '/api/me/binds',
    async (ctx, b) => {
      const me = await signedIn(auth, ctx);
      return { body: await userSettings.saveBinds(me.id, b) };
    },
    { body: true }
  );

  // your own survivors (the character creator), as your account keeps them: { customs: { v: 2, list, gone } | null }
  // (shared/customs.js). Without accounts on this server: { accounts: false } and none - the browser keeps its own.
  route('get', '/api/me/customs', async (ctx) => {
    if (!auth) return { body: { accounts: false, customs: null } };
    return { body: await userSettings.customs((await signedIn(auth, ctx)).id) };
  });
  // { customs } -> what the account keeps afterwards: yours merged with what it had, survivor by survivor
  // (usersettings.js). Junk - not a list, too many, a survivor without a good id - is a 400; at most 32 KB.
  putOrPost(
    route,
    '/api/me/customs',
    async (ctx, b) => {
      const me = await signedIn(auth, ctx);
      return { body: await userSettings.saveCustoms(me.id, b) };
    },
    { body: true, max: 32768 }
  );
}
