// The pledge window (server/pledge.js, shared/pledge.js):
// - a run opens it; it shuts once everyone who can spend has confirmed or skipped, or when its time is up
// - a full group pool is paid by its pledgers in one go and every survivor gets it; a short pool costs nobody
// - personal buys go to the buyer; a pick past a player's Skulls is refused
// - a spend that cannot be paid at the close charges nobody and hands out nothing (both stores: all or none)
import { createHash, randomUUID } from 'node:crypto';
import { LoadoutService, MemoryLoadoutStore, PgLoadoutStore } from '../server/userloadout.js';
import { openDb } from '../server/db/index.js';
import { migrate } from '../server/db/migrate.js';
import { LocalLoadouts } from '../server/loadouts.js';
import { Game } from '../server/game.js';
import { AMMO, ITEM } from '../shared/defs.js';
import { C2S, PROTOCOL_VERSION, S2C, Writer } from '../shared/protocol.js';
import { PLEDGE, PLEDGE_OFFERS, pledgeOffer } from '../shared/pledge.js';

const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : info}`);
  if (!ok) fails.push(name);
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};
const ownerOf = (pid) => `g:${createHash('sha256').update(pid).digest('hex')}`;
const offer = (key) => PLEDGE_OFFERS.find((o) => o.key === key);

function fakeSession(out) {
  return { send: (b) => out.push(new Uint8Array(b)), cork(fn) { fn(); }, closed: false, slot: 0, user: null, ip: '127.0.0.1', congested: () => false };
}
function join(game, name, pid) {
  const out = [];
  const session = game.onOpen(fakeSession(out));
  const w = new Writer(128);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  w.str(pid);
  game.onMessage(session, w.bytes());
  const p = [...game.players.values()].find((q) => q.name === name);
  p.out = out;
  return p;
}
function send(game, p, data) {
  const w = new Writer(256);
  w.u8(C2S.PLEDGE);
  w.str(JSON.stringify(data));
  game.onMessage(p.session, w.bytes());
}
// the last S2C.PLEDGE this player was sent
function lastView(p) {
  for (let i = p.out.length - 1; i >= 0; i--) {
    const b = p.out[i];
    if (b[0] !== S2C.PLEDGE) continue;
    const n = b[1] | (b[2] << 8);
    return JSON.parse(new TextDecoder().decode(b.subarray(3, 3 + n)));
  }
  return null;
}
const tick = (game, n = 1) => {
  for (let i = 0; i < n; i++) game.update();
};

async function setup(seed, skulls) {
  const service = new LoadoutService({ store: new MemoryLoadoutStore() });
  const link = new LocalLoadouts(service);
  const game = new Game({ seed, cards: null, loadouts: link, dayLength: 999, nightLength: 999, godMode: true });
  game.code = 'PLDG';
  const pids = skulls.map(() => randomUUID());
  for (let i = 0; i < pids.length; i++) if (skulls[i]) await service.earnSkulls(ownerOf(pids[i]), skulls[i], { kind: 'test' }, `test:seed${seed}:${i}`);
  const players = [];
  for (let i = 0; i < pids.length; i++) {
    players.push(join(game, `P${i}`, pids[i]));
    await settle();
  }
  return { game, service, players, owners: pids.map(ownerOf) };
}

async function pooledArmor() {
  console.log('\n-- a full pool and a personal buy');
  const { game, service, players: [a, b], owners: [oa, ob] } = await setup(31, [100, 20]);
  const armor = offer('body_armor');
  const cat = offer('cat_collar');
  tick(game);
  check('a run opens the window', game.pledges.open && lastView(a)?.open === true && lastView(a).left <= PLEDGE.WINDOW_S);
  check('each player sees their own Skulls', lastView(a).balance === 100, JSON.stringify(lastView(a)));
  send(game, a, { op: 'pledge', offer: armor.id, amount: 45 });
  send(game, b, { op: 'pledge', offer: armor.id, amount: 30 });
  tick(game);
  const vb = lastView(b);
  check('a pledge never goes past what the pool still needs', vb.group.find(([id]) => id === armor.id)?.[1] === armor.price && vb.group.find(([id]) => id === armor.id)?.[2] === 15, JSON.stringify(vb.group));
  send(game, b, { op: 'buy', offer: offer('pump_shotgun').id, on: true });
  tick(game);
  check('a buy past a player’s Skulls is refused', lastView(b).own.length === 0);
  send(game, a, { op: 'buy', offer: cat.id, on: true });
  const cats = game.cats.length;
  send(game, a, { op: 'confirm' });
  tick(game);
  check('the window waits for everyone who can spend', game.pledges.open);
  send(game, b, { op: 'confirm' });
  tick(game);
  check('it shuts once everyone has decided', !game.pledges.open && lastView(a)?.open === false);
  await settle();
  check('the pool is paid by its pledgers, the buy by its buyer', (await service.balance(oa)) === 100 - 45 - cat.price && (await service.balance(ob)) === 5, `${await service.balance(oa)} ${await service.balance(ob)}`);
  check('every survivor starts in the armor', a.armorItem === ITEM.KEVLAR && b.armorItem === ITEM.KEVLAR);
  check('the buyer has a cat beside them', game.cats.length === cats + 1);
  return game;
}

async function shortPool() {
  console.log('\n-- a short pool, and the time running out');
  const { game, service, players: [a], owners: [oa] } = await setup(32, [100]);
  send(game, a, { op: 'pledge', offer: offer('body_armor').id, amount: 20 });
  send(game, a, { op: 'buy', offer: offer('energy_drinks').id, on: true });
  tick(game, Math.ceil(PLEDGE.WINDOW_S * 20) - 5);
  check('the window is still open just short of its time', game.pledges.open);
  tick(game, 10);
  check('...and shut at its time with nobody deciding', !game.pledges.open);
  await settle();
  check('a short pool costs nobody anything (the personal buy is still paid)', (await service.balance(oa)) === 100 - offer('energy_drinks').price, String(await service.balance(oa)));
  check('...and hands out nothing', a.armorItem !== ITEM.KEVLAR);
  check('the personal buy is handed over', a.inv.some((it) => it?.item === ITEM.ENERGY_DRINK && it.count >= 2));
}

async function skipAndBroke() {
  console.log('\n-- skips, and nobody able to spend');
  const { game, players: [a] } = await setup(33, [0]);
  tick(game);
  check('nobody with Skulls: the window shuts at once', !game.pledges.open);
  const s2 = await setup(34, [50]);
  send(s2.game, s2.players[0], { op: 'buy', offer: offer('molotovs').id, on: true });
  send(s2.game, s2.players[0], { op: 'skip' });
  tick(s2.game);
  await settle();
  check('a skip drops the picks and costs nothing', !s2.game.pledges.open && (await s2.service.balance(s2.owners[0])) === 50);
  void a;
}

async function shortAtClose() {
  console.log('\n-- a balance gone by the close');
  const { game, service, players: [a, b], owners: [oa, ob] } = await setup(35, [40, 40]);
  const medics = offer('field_medics');
  send(game, a, { op: 'pledge', offer: medics.id, amount: 20 });
  send(game, b, { op: 'pledge', offer: medics.id, amount: 20 });
  // b spends their Skulls elsewhere (the auction house, another tab) while the window is open
  await service.store.spendSkulls({ id: 'elsewhere', kind: 'test', entries: [{ owner: ob, delta: -30 }] });
  send(game, a, { op: 'confirm' });
  send(game, b, { op: 'confirm' });
  tick(game);
  await settle();
  check('the pool is not paid by anyone', (await service.balance(oa)) === 40 && (await service.balance(ob)) === 10, `${await service.balance(oa)} ${await service.balance(ob)}`);
  check('...and nobody gets it', !a.inv.some((it) => it?.item === ITEM.MEDKIT) && !b.inv.some((it) => it?.item === ITEM.MEDKIT));
}

async function serviceRules() {
  console.log('\n-- the network thread’s checks');
  const db = await openDb('pglite:memory');
  await migrate(db);
  for (const [label, store] of [
    ['memory', new MemoryLoadoutStore()],
    ['postgres', new PgLoadoutStore(db)],
  ]) {
    const svc = new LoadoutService({ store });
    const a = ownerOf(randomUUID());
    const b = ownerOf(randomUUID());
    const stranger = ownerOf(randomUUID());
    await svc.earnSkulls(a, 50, {}, `t:${label}:a`);
    await svc.earnSkulls(b, 10, {}, `t:${label}:b`);
    const got = [];
    const room = { code: 'R', closed: false, worker: { postMessage: (m) => got.push(m) } };
    svc.fromRoom(room, { op: 'enter', owner: a });
    svc.fromRoom(room, { op: 'enter', owner: b });
    await settle();
    check(`${label}: the collection a game is sent carries the balance`, got.some((m) => m.op === 'coll' && m.owner === a && m.balance === 50));
    svc.fromRoom(room, { op: 'spend', id: 'pledge:R:1:1:g1', entries: [{ owner: a, delta: -20 }, { owner: b, delta: -20 }] });
    await settle();
    await settle();
    check(`${label}: one short pledger and nobody is charged`, got.some((m) => m.op === 'spent' && m.id === 'pledge:R:1:1:g1' && !m.ok) && (await svc.balance(a)) === 50 && (await svc.balance(b)) === 10);
    svc.fromRoom(room, { op: 'spend', id: 'pledge:R:1:1:g2', entries: [{ owner: a, delta: -20 }, { owner: b, delta: -10 }] });
    await settle();
    await settle();
    check(`${label}: a pool that can be paid is paid by all`, got.some((m) => m.op === 'spent' && m.id === 'pledge:R:1:1:g2' && m.ok) && (await svc.balance(a)) === 30 && (await svc.balance(b)) === 0);
    check(`${label}: ...and the game hears the new balances`, got.some((m) => m.op === 'coll' && m.owner === a && m.balance === 30));
    for (const [why, entries, id] of [
      ['an owner not in that game', [{ owner: stranger, delta: -1 }], 'pledge:R:1:1:x1'],
      ['a credit', [{ owner: a, delta: 5 }], 'pledge:R:1:1:x2'],
      ['an id that is not a pledge', [{ owner: a, delta: -1 }], 'auction:x'],
    ]) {
      svc.fromRoom(room, { op: 'spend', id, entries });
      await settle();
      check(`${label}: refused: ${why}`, got.some((m) => m.op === 'spent' && m.id === id && !m.ok) && (await svc.balance(a)) === 30);
    }
    await svc.close();
  }
}

check('offers are unique and priced', new Set(PLEDGE_OFFERS.map((o) => o.id)).size === PLEDGE_OFFERS.length && PLEDGE_OFFERS.every((o) => o.price > 0 && pledgeOffer(o.id) === o));
check('every group offer and every ammo grant is something a survivor can carry', PLEDGE_OFFERS.every((o) => (o.give.ammo || []).every(([cal]) => cal >= 0 && cal <= AMMO.FLARE)));
await pooledArmor();
await shortPool();
await skipAndBroke();
await shortAtClose();
await serviceRules();

if (fails.length) {
  console.log(`\n${fails.length} FAILED`);
  process.exit(1);
}
console.log('\nall pledge checks passed');
process.exit(0);
