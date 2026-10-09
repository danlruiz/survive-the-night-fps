// Demolishing (Game.demolish: [X] in build mode, ACT.DEMOLISH), against a real Game in-process: a structure taken
// down within its undo window gives back its whole build cost; after that it gives 75% of each material, scaled by the
// lowest health share the structure ever reached, rounded down. Single-count build costs only come back in the undo
// window. A torch or a campfire is worth no more than its original fuel left, and taking one down twice at once, or
// building and taking down over and over, makes nothing.
// usage: node scripts/test-demolish.js [seed]
import { Game } from '../server/game.js';
import { envelope, encode, decode } from '../server/handoff.js';
import { C2S, S2C, ACT, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { SLOT_BUILD } from '../shared/constants.js';
import { ITEM, STRUCT, STRUCT_DEFS, STRUCT_ORDER, DEMOLISH_REFUND_RATE, DEMOLISH_UNDO_SECONDS, REPAIR_COST, demolishRefund } from '../shared/defs.js';
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
const NOW = 60;
const PLACED_AFTER_WINDOW = NOW - DEMOLISH_UNDO_SECONDS - 1;
const PLACED_IN_WINDOW = NOW - DEMOLISH_UNDO_SECONDS + 1;
const at = (stype, share, burnShare = 1) => {
  const def = STRUCT_DEFS[stype];
  return demolishRefund({ stype, hp: def.hp * share, maxHp: def.hp, minHealth: share, burnLeft: (def.burn || 0) * burnShare, placedAt: PLACED_AFTER_WINDOW }, NOW);
};
const undo = (stype, burnShare = 1) => {
  const def = STRUCT_DEFS[stype];
  return demolishRefund({ stype, hp: def.hp, maxHp: def.hp, minHealth: 1, burnLeft: (def.burn || 0) * burnShare, placedAt: PLACED_IN_WINDOW }, NOW);
};
const scaled = (stype, share, burnShare = 1) => {
  const out = {};
  const scale = Math.max(0, Math.min(1, Math.min(share, burnShare)));
  for (const k in STRUCT_DEFS[stype].cost) {
    if (STRUCT_DEFS[stype].cost[k] === 1) continue;
    const n = Math.floor(STRUCT_DEFS[stype].cost[k] * DEMOLISH_REFUND_RATE * scale + 1e-9);
    if (n > 0) out[k] = n;
  }
  return out;
};
const leq = (a, b) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] || 0) > (b[k] || 0)) return false;
  return true;
};
check('inside 15 seconds, every structure gives back all it cost, including single-count items', STRUCT_ORDER.every((t) => same(undo(t), STRUCT_DEFS[t].cost)), STRUCT_ORDER.filter((t) => !same(undo(t), STRUCT_DEFS[t].cost)).map((t) => `${STRUCT_DEFS[t].name}:${show(undo(t))}`).join(', '));
check('after the undo window, a full wood wall gives back 75% rounded down', same(at(STRUCT.WALL, 1), { [ITEM.WOOD]: 3, [ITEM.NAILS]: 3 }), show(at(STRUCT.WALL, 1)));
check('after the undo window, single-count costs do not come back even at full health', !(ITEM.GUNPARTS in at(STRUCT.GENERATOR, 1)) && !(ITEM.WIRE in at(STRUCT.GENERATOR, 1)) && !(ITEM.TAPE in at(STRUCT.METAL_WALL, 1)) && same(at(STRUCT.TORCH, 1), {}), show(at(STRUCT.GENERATOR, 1)));
check('a wall that reached 60% health gives back 75% of that share', same(at(STRUCT.WALL, 0.6), { [ITEM.WOOD]: 2, [ITEM.NAILS]: 1 }), show(at(STRUCT.WALL, 0.6)));
check('a spike trap that reached 60% gives back one Nail and no Planks', same(at(STRUCT.SPIKES, 0.6), { [ITEM.NAILS]: 1 }), show(at(STRUCT.SPIKES, 0.6)));
check('every structure after the window gives 75% of its lowest health share, rounded down', STRUCT_ORDER.every((t) => same(at(t, 0.6), scaled(t, 0.6))));
check('a structure broken down to nothing, or with more than its health, gives back nothing / no more than 75%', same(at(STRUCT.WALL, 0), {}) && same(at(STRUCT.WALL, 1.5), scaled(STRUCT.WALL, 1)), `${show(at(STRUCT.WALL, 0))} / ${show(at(STRUCT.WALL, 1.5))}`);
check('a burnt-out torch gives back nothing after the undo window, however whole it is', same(at(STRUCT.TORCH, 1, 0), {}) && same(at(STRUCT.TORCH, 1, -0.05), {}));
check('a campfire half burnt gives back 75% of its fuel share and none of its one plank', same(at(STRUCT.CAMPFIRE, 1, 0.5), { [ITEM.STICK]: 1 }), show(at(STRUCT.CAMPFIRE, 1, 0.5)));
check('a campfire fed past its first fuel gives back no more than the after-window cap', same(at(STRUCT.CAMPFIRE, 1, 2), scaled(STRUCT.CAMPFIRE, 1)), show(at(STRUCT.CAMPFIRE, 1, 2)));
check('the lower of health and fuel counts after the undo window', same(at(STRUCT.CAMPFIRE, 0.5, 1), scaled(STRUCT.CAMPFIRE, 0.5)) && same(at(STRUCT.CAMPFIRE, 1, 0.5), at(STRUCT.CAMPFIRE, 0.5, 1)));

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
const expire = (e) => {
  e.placedAt = game.time - DEMOLISH_UNDO_SECONDS - 1;
};
const damageTo = (e, share) => {
  game.damageStructure(e, e.hp - e.maxHp * share);
};
const repair = (e) => {
  pack(REPAIR_COST);
  put(e.x - 2.5, e.z);
  s.slot = SLOT_BUILD;
  s.weapons[SLOT_BUILD] = ITEM.HAMMER;
  act(ACT.REPAIR, e.id);
  run(2);
};

run(3);
game.unlocked = ~0; // (every schematic found: the metal wall needs one)
{
  const e = build(STRUCT.SPIKES);
  check('a spike trap is built, and its cost is spent', !!e && same(counts(), {}), show(counts()));
  if (e) takeDown(e);
  check('...and taken down inside the undo window it gives back every plank and nail it took', e && e.removed && same(sorted(counts()), sorted(STRUCT_DEFS[STRUCT.SPIKES].cost)), show(counts()));
}
{
  const e = build(STRUCT.WORKBENCH);
  if (e) {
    expire(e);
    takeDown(e);
  }
  check('after the undo window, a whole structure gives back 75% of each material', e && e.removed && same(sorted(counts()), sorted(scaled(STRUCT.WORKBENCH, 1))), show(counts()));
}
{
  const e = build(STRUCT.WALL);
  if (e) {
    expire(e);
    damageTo(e, 0.6);
    takeDown(e);
  }
  check('a wall that reached 60% gives back 75% of that share', e && e.removed && same(sorted(counts()), sorted({ [ITEM.WOOD]: 2, [ITEM.NAILS]: 1 })), show(counts()));
}
{
  const e = build(STRUCT.METAL_WALL);
  if (e) {
    expire(e);
    damageTo(e, 0.6);
    takeDown(e);
  }
  check('a metal wall that reached 60% gives back scaled Scrap and Nails, never its one Tape', e && e.removed && same(sorted(counts()), sorted({ [ITEM.SCRAP]: 2, [ITEM.NAILS]: 1 })), show(counts()));
}
{
  const e = build(STRUCT.TORCH);
  if (e) {
    expire(e);
    run(30); // (a second of burning)
    takeDown(e);
  }
  check('a torch after the undo window gives nothing back (its one torch only comes back during undo)', e && e.removed && same(counts(), {}), show(counts()));
}
{
  const e = build(STRUCT.WALL);
  let ok = false;
  if (e) {
    expire(e);
    damageTo(e, 0.3);
    const before = demolishRefund(e, game.time);
    repair(e);
    repair(e);
    const after = demolishRefund(e, game.time);
    ok = e.hp === e.maxHp && same(sorted(after), sorted(before)) && leq(after, before);
    takeDown(e);
  }
  check('repair then demolish does not improve a wood wall refund after it reached 30%', ok, show(counts()));
}
{
  const e = build(STRUCT.METAL_WALL);
  let ok = false;
  if (e) {
    expire(e);
    damageTo(e, 0.3);
    const before = demolishRefund(e, game.time);
    repair(e);
    repair(e);
    const after = demolishRefund(e, game.time);
    ok = e.hp === e.maxHp && same(sorted(after), sorted(before)) && !(ITEM.TAPE in after);
    takeDown(e);
  }
  check('repair then demolish does not turn cheap repairs into a metal wall Tape refund', ok, show(counts()));
}
{
  const e = build(STRUCT.GENERATOR);
  let ok = false;
  if (e) {
    expire(e);
    damageTo(e, 0.3);
    const before = demolishRefund(e, game.time);
    repair(e);
    repair(e);
    const after = demolishRefund(e, game.time);
    ok = e.hp === e.maxHp && same(sorted(after), sorted(before)) && !(ITEM.GUNPARTS in after) && !(ITEM.WIRE in after);
    takeDown(e);
  }
  check('repair then demolish does not turn cheap repairs into Generator Gun Parts or Wire', ok, show(counts()));
}
{
  const e = build(STRUCT.WALL);
  let ok = false;
  if (e) {
    expire(e);
    damageTo(e, 0.42);
    const restored = new Game({ restore: decode(encode(envelope(game))), godMode: true, dayLength: 36000, nightLength: 36000, themes: false, log: () => {} });
    const r = restored.ents[e.id];
    ok = !!r && r.kind === e.kind && r.stype === e.stype && r.placedAt === e.placedAt && Math.abs(r.minHealth - e.minHealth) < 1e-9;
  }
  check('min health and placement time survive handoff serialization', ok, e ? `${e.minHealth} at ${e.placedAt}` : '');
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
  // built and taken down again and again inside the undo window: each time exactly what it cost comes back, never more
  const cost = sorted(STRUCT_DEFS[STRUCT.GATE].cost);
  let ok = true;
  for (let i = 0; i < 10; i++) {
    const e = build(STRUCT.GATE);
    if (!e) ok = false;
    else takeDown(e);
    if (!leq(sorted(counts()), cost) || !same(sorted(counts()), cost)) ok = false;
  }
  check('a gate built and taken down ten times gives back exactly its cost each time, never more', ok, show(counts()));
}

console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nall demolish checks passed');
process.exit(fails.length ? 1 : 0);
