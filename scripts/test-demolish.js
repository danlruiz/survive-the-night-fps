// Demolishing (Game.demolish: [X] in build mode, ACT.DEMOLISH), against a real Game in-process: a structure taken
// down gives back what it cost in the share of it that is left (demolishRefund, shared/defs.js) - all of it whole,
// 60% of each material at 60% health rounded down, a cost of one item only whole, a torch or a campfire no more than
// the fuel it has left - and taking it down twice at once, or building and taking down over and over, makes nothing.
// usage: node scripts/test-demolish.js [seed]
import { Game } from '../server/game.js';
import { C2S, S2C, ACT, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { SLOT_BUILD } from '../shared/constants.js';
import { ITEM, STRUCT, STRUCT_DEFS, STRUCT_ORDER, demolishRefund } from '../shared/defs.js';
import { groundAt } from '../shared/collision.js';
import { readSnapshot } from '../client/net/decode.js';

const seed = +(process.argv[2] || 4242);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (o) => JSON.stringify(o);

// ---------------------------------------------------------------- the share, on its own
const at = (stype, share, burnShare = 1) => {
  const def = STRUCT_DEFS[stype];
  return demolishRefund({ stype, hp: def.hp * share, maxHp: def.hp, burnLeft: (def.burn || 0) * burnShare });
};
const scaled = (stype, share) => {
  const out = {};
  for (const k in STRUCT_DEFS[stype].cost) {
    const n = Math.floor(STRUCT_DEFS[stype].cost[k] * share + 1e-9);
    if (n > 0) out[k] = n;
  }
  return out;
};
check('every structure taken down whole gives back all it cost', STRUCT_ORDER.every((t) => same(at(t, 1), STRUCT_DEFS[t].cost)), STRUCT_ORDER.filter((t) => !same(at(t, 1), STRUCT_DEFS[t].cost)).map((t) => STRUCT_DEFS[t].name).join(', '));
check('a wall at 60% health gives back 3 of its 5 Planks and 2 of its 4 Nails', same(at(STRUCT.WALL, 0.6), { [ITEM.WOOD]: 3, [ITEM.NAILS]: 2 }), show(at(STRUCT.WALL, 0.6)));
check('a spike trap at 60% gives back 1 of 2 Planks and 2 of 4 Nails', same(at(STRUCT.SPIKES, 0.6), { [ITEM.WOOD]: 1, [ITEM.NAILS]: 2 }), show(at(STRUCT.SPIKES, 0.6)));
check('every structure at 60% gives back 60% of each material, rounded down', STRUCT_ORDER.every((t) => same(at(t, 0.6), scaled(t, 0.6))));
check('...and at 99% still rounds down: one of a cost of one is not given back', !(ITEM.GUNPARTS in at(STRUCT.GENERATOR, 0.99)) && same(at(STRUCT.TORCH, 0.99), {}), show(at(STRUCT.GENERATOR, 0.99)));
check('a structure broken down to nothing, or with more than its health, gives back nothing / no more than it cost', same(at(STRUCT.WALL, 0), {}) && same(at(STRUCT.WALL, 1.5), STRUCT_DEFS[STRUCT.WALL].cost));
check('a burnt-out torch gives back nothing, however whole it is', same(at(STRUCT.TORCH, 1, 0), {}) && same(at(STRUCT.TORCH, 1, -0.05), {}));
check('a campfire half burnt gives back half its sticks and none of its one plank', same(at(STRUCT.CAMPFIRE, 1, 0.5), { [ITEM.STICK]: 2 }), show(at(STRUCT.CAMPFIRE, 1, 0.5)));
check('a campfire fed past its first fuel gives back no more than it cost', same(at(STRUCT.CAMPFIRE, 1, 2), STRUCT_DEFS[STRUCT.CAMPFIRE].cost));
check('the lower of health and fuel counts', same(at(STRUCT.CAMPFIRE, 0.5, 1), { [ITEM.STICK]: 2 }) && same(at(STRUCT.CAMPFIRE, 1, 0.5), at(STRUCT.CAMPFIRE, 0.5, 1)));

// ---------------------------------------------------------------- in a game
const game = new Game({ seed, godMode: true, dayLength: 36000, nightLength: 36000, themes: false, log: () => {} });
const world = game.world;
const A = { id: 0, net: { tick: 0, ack: 0 }, global: null, self: {}, store: { ents: new Map(), onCreate() {}, onRemove() {}, onUpdate() {} } };
A.handler = new Proxy({}, { get: (t, k) => t[k] || (() => {}) });
A.conn = {
  send(bytes) {
    const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
    const t = r.u8();
    if (t === S2C.WELCOME) A.id = r.u16();
    else if (t === S2C.SNAPSHOT) readSnapshot(r, A);
  },
};
A.session = game.onOpen(A.conn);
{
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str('Alice');
  game.onMessage(A.session, w.bytes().slice());
}
const p = game.players.get(A.id);
const s = p.state;
const act = (a, id) => {
  p.actionT = -1;
  p.interactT = -1;
  const w = new Writer(8);
  w.u8(C2S.ACTION);
  w.u8(a);
  w.u16(id);
  game.onMessage(A.session, w.bytes().slice());
};
const run = (ticks) => {
  for (let i = 0; i < ticks; i++) {
    for (const z of [...game.zombies]) {
      game._listRemove(game.zombies, z);
      game.removeEntity(z);
    }
    game.update();
  }
};
const put = (x, z) => {
  s.x = x;
  s.z = z;
  s.y = groundAt(world, x, z, 200, 0.3);
  s.vx = s.vy = s.vz = 0;
  game.fillHistory(p);
};
const pack = (cost) => {
  p.inv.fill(null);
  Object.entries(cost).forEach(([item, n], i) => (p.inv[i] = { item: +item, count: n }));
  p.invDirty = true;
};
const counts = () => {
  const out = {};
  for (const x of p.inv) if (x) out[x.item] = (out[x.item] || 0) + x.count;
  return out;
};
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a - b));

// built with the hammer out on open ground round the car, paid for with exactly its cost
let spot = 0;
function build(type) {
  const car = world.car;
  for (; spot < 16 * 13; spot++) {
    const r = 12 + Math.floor(spot / 16) * 4;
    const a = ((spot % 16) / 16) * Math.PI * 2;
    const x = car.x + Math.cos(a) * r;
    const z = car.z + Math.sin(a) * r;
    pack(STRUCT_DEFS[type].cost);
    put(x - 2.5, z);
    s.slot = SLOT_BUILD;
    s.weapons[SLOT_BUILD] = ITEM.HAMMER;
    p.actionT = -1;
    const before = new Set(game.structures);
    game.build(p, type, x, z, 64);
    const e = game.structures.find((o) => !before.has(o));
    if (e) {
      spot++;
      return e;
    }
  }
  return null;
}
const takeDown = (e) => {
  put(e.x - 2.5, e.z);
  act(ACT.DEMOLISH, e.id);
  run(2);
};

run(3);
game.unlocked = ~0; // (every schematic found: the metal wall needs one)
{
  const e = build(STRUCT.SPIKES);
  check('a spike trap is built, and its cost is spent', !!e && same(counts(), {}), show(counts()));
  if (e) takeDown(e);
  check('...and taken down whole it gives back every plank and nail it took', e && e.removed && same(sorted(counts()), sorted(STRUCT_DEFS[STRUCT.SPIKES].cost)), show(counts()));
}
{
  const e = build(STRUCT.WALL);
  if (e) {
    e.hp = e.maxHp * 0.6;
    takeDown(e);
  }
  check('a wall at 60% gives back 3 Planks and 2 Nails', e && e.removed && same(sorted(counts()), sorted({ [ITEM.WOOD]: 3, [ITEM.NAILS]: 2 })), show(counts()));
}
{
  const e = build(STRUCT.METAL_WALL);
  if (e) {
    e.hp = e.maxHp * 0.6;
    takeDown(e);
  }
  check('a metal wall at 60% gives back 3 Scrap, 2 Nails and not its one Tape', e && e.removed && same(sorted(counts()), sorted({ [ITEM.SCRAP]: 3, [ITEM.NAILS]: 2 })), show(counts()));
}
{
  const e = build(STRUCT.TORCH);
  if (e) {
    run(30); // (a second of burning)
    takeDown(e);
  }
  check('a torch lit a second ago gives nothing back (its one torch only comes back whole)', e && e.removed && same(counts(), {}), show(counts()));
}
{
  // two demolish actions for the same structure in one tick: the second finds nothing
  const e = build(STRUCT.WORKBENCH);
  if (e) {
    put(e.x - 2.5, e.z);
    act(ACT.DEMOLISH, e.id);
    act(ACT.DEMOLISH, e.id);
    run(2);
  }
  check('a structure taken down twice at once gives back its cost once', e && e.removed && same(sorted(counts()), sorted(STRUCT_DEFS[STRUCT.WORKBENCH].cost)), show(counts()));
}
{
  // built and taken down again and again: each time exactly what it cost comes back, never more
  const cost = sorted(STRUCT_DEFS[STRUCT.GATE].cost);
  let ok = true;
  for (let i = 0; i < 10; i++) {
    const e = build(STRUCT.GATE);
    if (!e) ok = false;
    else takeDown(e);
    if (!same(sorted(counts()), cost)) ok = false;
  }
  check('a gate built and taken down ten times gives back exactly its cost each time, never more', ok, show(counts()));
}

console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nall demolish checks passed');
process.exit(fails.length ? 1 : 0);
