// The HTTP API of loadout items and the auction house (index.js; userloadout.js LoadoutService): what a player owns and
// has equipped, and the market where accounts trade items for Zombie Skulls. A guest has a loadout (by their browser's
// id) but no market.
import { HttpError, putOrPost } from '../http.js';
import { noAccounts } from '../auth.js';
import { ownerKey as loadoutOwnerKey } from '../userloadout.js';
import { LOADOUT_CATALOG, LOADOUT_SLOTS, cleanLoadoutSlots } from '../../shared/loadout.js';
import { AUCTION, SKULLS, SKULL_EARN } from '../../shared/economy.js';

// what the market's refusals (LoadoutService's error codes) are as HTTP
const MARKET_STATUS = new Map([
  ['guest_market', 401],
  ['bad_listing', 400],
  ['bad_price', 400],
  ['insufficient_skulls', 409],
  ['not_owned', 409],
  ['listed', 409],
  ['not_listing_owner', 409],
  ['sold', 409],
  ['expired', 409],
  ['own_listing', 409],
]);
const marketError = (err) => {
  if (err instanceof HttpError) throw err;
  const msg = err?.message || 'That auction action did not work.';
  const status = MARKET_STATUS.get(err?.code || '');
  if (status) throw new HttpError(status, msg);
  throw err;
};

// route: index.js's (method, path, fn, opts). auth: null without a database
export function loadoutRoutes(route, { auth, loadouts }) {
  // a guest's id comes in the body, or for a GET in the X-STN-Guest header: never from the query string, which proxies,
  // the CDN and browser history keep (it is the only key to that guest's items and Zombie Skulls)
  const loadoutOwner = async (ctx, body = null) => {
    const u = auth ? await auth.me(ctx) : null;
    if (u) return `a:${u.id}`;
    const key = loadoutOwnerKey('', body?.guestId || ctx.guest || '');
    if (!key) throw new HttpError(400, 'This browser has no player id yet.');
    return key;
  };
  const loadoutAccountOwner = async (ctx) => {
    const u = auth ? await auth.need(ctx) : noAccounts();
    return `a:${u.id}`;
  };

  route('get', '/api/loadout', async (ctx) => {
    const owner = await loadoutOwner(ctx);
    return { body: { catalog: LOADOUT_CATALOG, slotCount: LOADOUT_SLOTS, currency: SKULLS, ...(await loadouts.profile(owner)) } };
  });
  putOrPost(
    route,
    '/api/loadout',
    async (ctx, b) => {
      const owner = await loadoutOwner(ctx, b);
      const got = await loadouts.equip(owner, cleanLoadoutSlots(b.slots));
      return { body: { catalog: LOADOUT_CATALOG, slotCount: LOADOUT_SLOTS, currency: SKULLS, balance: await loadouts.balance(owner), ...got } };
    },
    { body: true, max: 4096 }
  );

  route('get', '/api/loadout/auction', async (ctx) => {
    const owner = await loadoutOwner(ctx);
    return { body: { catalog: LOADOUT_CATALOG, currency: SKULLS, auction: AUCTION, earn: SKULL_EARN, ...(await loadouts.auction(owner)) } };
  });
  // a move on the market, by an account: fn(owner, body) -> the route's answer; a refusal is its HTTP status (marketError)
  const marketAct = (path, fn) =>
    route(
      'post',
      path,
      async (ctx, b) => {
        try {
          return await fn(await loadoutAccountOwner(ctx), b);
        } catch (err) {
          marketError(err);
        }
      },
      { body: true, max: 2048 }
    );
  marketAct('/api/loadout/auction/list', async (owner, b) => ({ status: 201, body: { listing: await loadouts.listItem(owner, b.itemId, b.price), ...(await loadouts.auction(owner)) } }));
  marketAct('/api/loadout/auction/buy', async (owner, b) => ({ body: { result: await loadouts.buyListing(owner, b.listingId), ...(await loadouts.auction(owner)) } }));
  marketAct('/api/loadout/auction/cancel', async (owner, b) => ({ body: { listing: await loadouts.cancelListing(owner, b.listingId), ...(await loadouts.auction(owner)) } }));
}
