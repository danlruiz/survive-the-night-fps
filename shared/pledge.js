// The pledge window: the first seconds of a run, when the group spends Zombie Skulls on what it starts with.
// Group offers are pooled - anybody chips in any part of the price, and when the pool is full at the close every
// survivor gets it (Together or not at all: nobody is asked to carry the whole team). Personal offers are one
// survivor's own. Each player confirms what they picked or skips; the window closes when everyone has, or when the
// time is up. Nothing is paid until it closes, and only for what was bought (server/pledge.js).
//
// Skulls are the profile's (shared/economy.js, server/userloadout.js); what they buy here is for this run only: the
// items are ordinary run items, gone when the run ends. Prices are first guesses for groups of 3 to 4.
import { AMMO, ITEM } from './defs.js';

export const PLEDGE = Object.freeze({
  WINDOW_S: 30, // the longest the window stays open
  MSG_MAX: 512, // bytes of JSON a client may send in one C2S.PLEDGE
  STEP: 5, // the panel's +/- on a group pledge
});

export const PLEDGE_KIND = Object.freeze({ GROUP: 'group', OWN: 'own' });

const G = PLEDGE_KIND.GROUP;
const O = PLEDGE_KIND.OWN;

// give: what each survivor it is for is handed at the close.
//   items: [[item, count]] into the backpack (or worn / in its weapon slot, as a find would be)
//   ammo: [[calibre, rounds]] onto the reserve
//   cat: a stray cat waits beside them
// The catalog is append-only: ids are written into the Skull ledger.
export const PLEDGE_OFFERS = Object.freeze(
  [
    { id: 1, key: 'body_armor', kind: G, price: 60, name: 'Body Armor for All', icon: 'shield', desc: 'Every survivor starts wearing Kevlar.', give: { items: [[ITEM.KEVLAR, 1]] } },
    { id: 2, key: 'field_medics', kind: G, price: 40, name: 'Field Medics', icon: 'cross', desc: 'Every survivor starts with a Medkit.', give: { items: [[ITEM.MEDKIT, 1]] } },
    { id: 3, key: 'ammo_crate', kind: G, price: 30, name: 'Ammo Crate', icon: 'bolt', desc: 'Every survivor starts with 60 more 9mm rounds.', give: { ammo: [[AMMO.P9, 60]] } },
    { id: 4, key: 'cat_collar', kind: O, price: 15, name: 'Cat Collar', icon: 'paw', desc: 'A stray cat waits beside you at the start.', give: { cat: true } },
    { id: 5, key: 'trail_backpack', kind: O, price: 25, name: 'Trail Backpack', icon: 'grid', desc: 'Start wearing a backpack: more room from the first minute.', give: { items: [[ITEM.BACKPACK, 1]] } },
    { id: 6, key: 'pump_shotgun', kind: O, price: 35, name: 'Pump Shotgun', icon: 'blast', desc: 'Start with a shotgun and 12 shells.', give: { items: [[ITEM.SHOTGUN, 1]], ammo: [[AMMO.SHELL, 12]] } },
    { id: 7, key: 'molotovs', kind: O, price: 15, name: 'Two Molotovs', icon: 'flame', desc: 'Start with two Molotov cocktails.', give: { items: [[ITEM.MOLOTOV, 2]] } },
    { id: 8, key: 'energy_drinks', kind: O, price: 10, name: 'Energy Drinks', icon: 'agile', desc: 'Start with two energy drinks.', give: { items: [[ITEM.ENERGY_DRINK, 2]] } },
  ].map((o) => Object.freeze({ ...o, give: Object.freeze(o.give) }))
);

const BY_ID = new Map(PLEDGE_OFFERS.map((o) => [o.id, o]));
export const pledgeOffer = (id) => BY_ID.get(id | 0) || null;
export const GROUP_OFFERS = PLEDGE_OFFERS.filter((o) => o.kind === G);
export const OWN_OFFERS = PLEDGE_OFFERS.filter((o) => o.kind === O);

// What one player has set aside: their group pledges plus their personal buys
export function pledgeSpend(group, own) {
  let n = 0;
  for (const v of group.values()) n += v;
  for (const id of own) n += pledgeOffer(id)?.price || 0;
  return n;
}

// How much of a group offer's price is pledged (by everybody)
export function pooled(picks, id) {
  let n = 0;
  for (const pk of picks) n += pk.group.get(id) || 0;
  return n;
}
