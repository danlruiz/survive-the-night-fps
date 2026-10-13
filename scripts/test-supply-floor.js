// Car supplies and floor loot lie on the floor, not under it.
// The island's places author their supply spots and floor-loot points 2 cm over a building's base, and the floor is a
// 12 cm slab on that base: a fan belt or a box of spark plugs (3-4 cm) put down there was hidden under the floorboards.
// The server sets each one down on the floor over its spot (Game.onFloor). In-process against a real Game on a few
// seeds: every hidden supply and every floor-loot item has nothing walkable over it within a hand's breadth.
// usage: node scripts/test-supply-floor.js [seed ...]
import { Game } from '../server/game.js';
import { groundAt } from '../shared/collision.js';
import { STEP_HEIGHT } from '../shared/constants.js';
import { ITEM_DEFS, ZONE_NAMES } from '../shared/defs.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';

const SEEDS = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [4242, 1, 2, 8, 9];
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};

function join(game, name) {
  const session = game.onOpen({ send() {} });
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  game.onMessage(session, w.bytes().slice());
}
// the top of the floor (or anything walkable) over an item, up to 15 cm above it: above the item means it is under it
const ABOVE = 0.15;
const floorOver = (w, e) => groundAt(w, e.x, e.z, e.y + ABOVE - STEP_HEIGHT - 0.02, 0);

for (const seed of SEEDS) {
  const game = new Game({ seed, godMode: true, dayLength: 3600, log: () => {} });
  join(game, 'Alice');
  for (let i = 0; i < 2; i++) game.update();
  const supplies = game.items.filter((e) => ITEM_DEFS[e.item]?.cat === 'part' && e.hint >= 0);
  const loot = game.items.filter((e) => e.point);
  const under = (list) => list.filter((e) => floorOver(game.world, e) > e.y + 1e-3);
  const name = (e) => `${ITEM_DEFS[e.item]?.name} in ${ZONE_NAMES[game.world.zones.reduce((m, z) => (Math.hypot(z.x - e.x, z.z - e.z) < Math.hypot(m.x - e.x, m.z - e.z) ? z : m)).id]}`;
  const us = under(supplies);
  check(`seed ${seed}: every hidden car supply lies on the floor, none under it`, supplies.length > 0 && !us.length, us.length ? us.map(name).join('; ') : `(${supplies.length} hidden)`);
  const ul = under(loot);
  check(`seed ${seed}: ...and every piece of floor loot`, !ul.length, ul.length ? `${ul.length} of ${loot.length} under a floor, e.g. ${ul.slice(0, 3).map(name).join('; ')}` : `(${loot.length} on the ground)`);
  // and none is lifted off the ground it was on: outdoors, or on a desk, it stays at its spot
  const lifted = supplies.filter((e) => {
    const sp = game.world.partSpots.find((s) => Math.hypot(s.x - e.x, s.z - e.z) < 1e-6);
    return sp && e.y - sp.y > ABOVE;
  });
  check(`seed ${seed}: ...lifted no further than onto the floor over its spot`, !lifted.length, lifted.map(name).join('; '));
}

if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
