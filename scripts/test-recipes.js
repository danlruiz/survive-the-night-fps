// Every weapon can be crafted: each item in WEAPONS and THROWABLES has a recipe (shared/defs.js RECIPES), every
// ingredient of every recipe is a real item that can be found or made, and a real Game hands each weapon over at the
// workbench once the schematic it needs is found (and refuses it before).
// usage: node scripts/test-recipes.js [seed]
import { Game } from '../server/game.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { ITEM_DEFS, WEAPONS, THROWABLES, RECIPES, SCHEM_BIT } from '../shared/defs.js';
import { sourcesOf } from '../client/game/itemguide.js';

const seed = +(process.argv[2] || 4242);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const nameOf = (item) => ITEM_DEFS[item]?.name || `item ${item}`;

// ---------------------------------------------------------------- the tables
const weapons = [...Object.keys(WEAPONS), ...Object.keys(THROWABLES)].map(Number);
const unmade = weapons.filter((w) => !RECIPES.some((r) => r.out === w));
check('every weapon and throwable has a recipe', weapons.length > 20 && unmade.length === 0, unmade.map(nameOf).join(', ') || `${weapons.length} weapons`);

check('recipe ids are their places in the list', RECIPES.every((r, i) => r.id === i));

const fake = [];
for (const r of RECIPES) for (const k in r.cost) if (!ITEM_DEFS[k] || !(r.cost[k] >= 1) || r.cost[k] % 1) fake.push(`${nameOf(r.out)} takes ${r.cost[k]} of ${k}`);
check('every ingredient is a real item, in a whole number', fake.length === 0, fake.join('; '));

// an ingredient can be got: found somewhere (loot, containers, the dead, gathering), or made from what can be got
const got = new Set();
for (let grew = true; grew; ) {
  grew = false;
  for (const item of Object.keys(ITEM_DEFS).map(Number)) {
    if (got.has(item)) continue;
    const made = RECIPES.some((r) => r.out === item && !r.vehicle && Object.keys(r.cost).every((k) => got.has(+k)));
    if (sourcesOf(item).length || made) {
      got.add(item);
      grew = true;
    }
  }
}
const stuck = new Set();
for (const r of RECIPES) for (const k in r.cost) if (!got.has(+k)) stuck.add(`${nameOf(+k)} (for ${nameOf(r.out)})`);
check('every ingredient can be found, or made from what can be found', stuck.size === 0, [...stuck].join(', '));
const loop = weapons.filter((w) => !got.has(w));
check('...so every weapon can be got by crafting alone', loop.length === 0, loop.map(nameOf).join(', '));

// ---------------------------------------------------------------- crafted on a real server
const game = new Game({ seed, godMode: true, dayLength: 3600, log: () => {} });
const conn = { id: 0, send(bytes) { const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes); if (r.u8() === S2C.WELCOME) conn.id = r.u16(); } };
const session = game.onOpen(conn);
const w = new Writer(64);
w.u8(C2S.JOIN);
w.u8(PROTOCOL_VERSION);
w.str('Smith');
game.onMessage(session, w.bytes().slice());
const p = game.players.get(conn.id);
game.nearStation = () => true; // (a lit campfire and a workbench at hand)
const holds = (item) => p.state.weapons.includes(item) || p.inv.some((x) => x && x.item === item);
const stock = (rec) => {
  p.inv.fill(null);
  p.state.weapons.fill(0);
  Object.entries(rec.cost).forEach(([k, n], i) => (p.inv[i] = { item: +k, count: n }));
  p.invDirty = true;
};
const left = (rec) => Object.keys(rec.cost).reduce((n, k) => n + p.inv.reduce((m, x) => m + (x && x.item === +k ? x.count : 0), 0), 0);

const locked = [], refused = [], given = [];
game.unlocked = 0;
for (const rec of RECIPES.filter((r) => weapons.includes(r.out))) {
  if (!rec.schem) continue;
  stock(rec);
  game.craft(p, rec.id);
  if (holds(rec.out) || left(rec) === 0) locked.push(nameOf(rec.out));
}
check('a weapon behind a schematic is refused until the team has found it', locked.length === 0, locked.join(', '));

game.unlocked = Object.values(SCHEM_BIT).reduce((m, b) => m | (1 << b), 0);
for (const rec of RECIPES.filter((r) => weapons.includes(r.out))) {
  stock(rec);
  game.craft(p, rec.id);
  if (!holds(rec.out) || left(rec) !== 0) refused.push(`${nameOf(rec.out)} (${left(rec)} left)`);
  else given.push(nameOf(rec.out));
}
check('with the schematics found, every weapon is crafted from exactly its recipe', refused.length === 0 && given.length === weapons.length, refused.join(', ') || `${given.length} crafted`);

console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nall recipe checks passed');
process.exit(fails.length ? 1 : 0);
