// The HTTP API of levels and perks (index.js; server/progress.js). Signed in, they are the account's; else guestId, the
// browser's leaderboard id, says whose (posted, never in a URL: it is what proves who a guest is). Every route answers
// what /api/progress does: { xp, level, into, need, frac, perks, picks, points, pending, nextPick, respecs }
import { COOKIE } from '../auth.js';

// route: index.js's (method, path, fn, opts). auth: null without a database
export function progressRoutes(route, { auth, progress }) {
  const progressWho = async (ctx, b) => {
    const user = auth ? await auth.userForToken(ctx.cookies[COOKIE]) : null;
    return user ? { userId: user.id } : { guestId: typeof b?.guestId === 'string' ? b.guestId : '' };
  };
  // { guestId? }
  route('post', '/api/progress', async (ctx, b) => ({ body: await progress.view(await progressWho(ctx, b)) }), { body: true });
  // { perk, guestId? }: a point on a perk of the tree that is open to you
  route('post', '/api/progress/pick', async (ctx, b) => ({ body: await progress.pick(await progressWho(ctx, b), b.perk) }), { body: true });
  // { perk, guestId? }: the point on a perk back, when nothing else you have needs it
  route('post', '/api/progress/unpick', async (ctx, b) => ({ body: await progress.unpick(await progressWho(ctx, b), b.perk) }), { body: true });
  // { guestId? }: every point back, to be spent again
  route('post', '/api/progress/respec', async (ctx, b) => ({ body: await progress.respec(await progressWho(ctx, b)) }), { body: true });
}
