// The HTTP API of friends and direct messages (index.js; social.js). Signed-in accounts only; without a database every
// route is a 503. What happens while a page is open also comes down its /social socket (sockets.js).
import { noAccounts, signedIn } from '../auth.js';

// route: index.js's (method, path, fn, opts). auth, social: null without a database
export function friendRoutes(route, { auth, social }) {
  // A route of a signed-in account: fn(social, me, ctx, body) -> its answer's body. (No database: the 503 comes before
  // anything else in the request is looked at)
  const friendly = (method, path, fn, { status, ...opts } = {}) =>
    route(method, path, async (ctx, b) => ({ status, body: await fn(social || noAccounts(), await signedIn(auth, ctx), ctx, b) }), opts);

  // { friends: [{ id, username, status: offline|online|playing, game, unread, lastSeen, since }], incoming, outgoing }
  friendly('get', '/api/friends', (s, me) => s.list(me));
  // { username } -> { result: sent|accepted|pending|already, friend }
  friendly('post', '/api/friends/request', (s, me, ctx, b) => s.request(me, b.username), { body: true });
  // { id }: their request
  friendly('post', '/api/friends/accept', (s, me, ctx, b) => s.accept(me, b.id), { body: true });
  // { id }: turns their request down, or takes yours back
  friendly('post', '/api/friends/decline', (s, me, ctx, b) => s.decline(me, b.id), { body: true });
  friendly('post', '/api/friends/remove', (s, me, ctx, b) => s.remove(me, b.id), { body: true });
  // the game a friend is in, to join them: its info, code included
  friendly('get', '/api/friends/:id/game', (s, me, ctx) => s.findFriend(me, ctx.params[0]));
  // the conversation with a friend: ?before=<message id> for older -> { messages: [{ id, from, to, body, at, read }], more }
  friendly('get', '/api/messages/:id', (s, me, ctx) => s.history(me, ctx.params[0], ctx.query.get('before')));
  // { to, body } -> 201 { message }
  friendly('post', '/api/messages', (s, me, ctx, b) => s.send(me, b.to, b.body), { body: true, status: 201 });
  // { friendId }: everything they sent you is read
  friendly('post', '/api/messages/read', (s, me, ctx, b) => s.markRead(me, b.friendId), { body: true });
}
