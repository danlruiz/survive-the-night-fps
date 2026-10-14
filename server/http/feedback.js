// The HTTP API of the end screen's poll (index.js; feedback.js): how hard the run that just ended was, its best or
// worst moment, and whether the player plays survival / FPS games at all. Signed in, a vote is the account's; else
// guestId, the browser's leaderboard id, says whose it is (as it does in a JOIN).
import { HttpError } from '../http.js';
import { COOKIE } from '../auth.js';
import { idKey } from '../stats.js';

// route: index.js's (method, path, fn, opts). feedback: null without a database
export function feedbackRoutes(route, { auth, feedback }) {
  // a vote: fn(who, body) -> the answer. who: { userId } signed in, or { guestKey } (feedback.js)
  const vote = (path, fn) =>
    route(
      'post',
      path,
      async (ctx, b) => {
        if (!feedback) throw new HttpError(503, 'Votes are not kept on this server.');
        const user = await auth.userForToken(ctx.cookies[COOKIE]);
        return { body: await fn(user ? { userId: user.id } : { guestKey: idKey(b.guestId) }, b) };
      },
      { body: true }
    );

  // How hard the run that just ended was, from its end screen: { rating: 1 too easy .. 5 too hard, guestId? } ->
  // { mine, counts: [votes for 1..5], total }. A 404 when they have no run that just ended.
  vote('/api/feedback/difficulty', (who, b) => feedback.voteDifficulty(who, b.rating));
  // The run that just ended's best or worst moment, from its end screen: { which: 'best' | 'worst', moment: one of
  // feedback.js MOMENTS or null to take it back, guestId? } -> { which, moment }. Filed as the difficulty vote is.
  vote('/api/feedback/moment', (who, b) => feedback.pickMoment(who, b.which, b.moment));
  // "Do you play survival / FPS games?", asked once per account or guest: { plays?: true | false, guestId? } ->
  // { plays: true | false | null }. Without plays it only says what the answer is (null: never asked); the first answer stays.
  vote('/api/feedback/genre', (who, b) => feedback.genre(who, b.plays));
}
