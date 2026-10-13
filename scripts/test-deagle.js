// The Desert Eagle (ITEM.DEAGLE): the item and where it comes from - a workbench recipe of real materials, that the
// server makes it there and not away from one, and that tearing it down gives back less than it took; its numbers
// against the pistol and the hunting rifle; that it takes the pistol's slot and fires the hunting rifle's .308; and that
// the client has all it needs to show it (a model, a viewmodel, an icon).
// usage: node scripts/test-deagle.js [seed]
import { Game } from '../server/game.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { SLOT_PRIMARY, SLOT_PISTOL } from '../shared/constants.js';
import { ITEM, ITEM_DEFS, WEAPONS, RECIPES, SALVAGE, AMMO, AMMO_ITEMS, SOUND, NOTIFY, LOOT_TABLES, CONT_TABLES, ZOMBIE_LOOT, SPECIAL_LOOT } from '../shared/defs.js';
import { KILL_FEATS } from '../shared/achievements.js';
import { worldWeaponTris, viewModelTris, VM_DEBUG } from '../client/render/models/weapons.js';
import { hasItemIcon } from '../client/ui/icons.js';
import { readSnapshot } from '../client/net/decode.js';

const seed = +(process.argv[2] || 4242);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const DEF = WEAPONS[ITEM.DEAGLE];
const PISTOL = WEAPONS[ITEM.PISTOL];
const RIFLE = WEAPONS[ITEM.HUNTING_RIFLE];
const dps = (w) => (w.damage * w.pellets) / w.rate;

// ---------------------------------------------------------------- the item
check('the item: id 59, a weapon of its own', ITEM.DEAGLE === 59 && ITEM_DEFS[59]?.cat === 'weapon' && ITEM_DEFS[59].stack === 1 && ITEM_DEFS[59].name === 'Desert Eagle');
check('no id was renumbered for it', ITEM.PISTOL === 55 && ITEM.FLARE_GUN === 56 && ITEM.NUNCHAKU === 57 && ITEM.SHOTGUN === 60 && ITEM.AMMO_308 === 73);
check('the protocol version is as it was', PROTOCOL_VERSION >= 41, `${PROTOCOL_VERSION}`);
check("a sidearm (the pistol's slot), semi-automatic, firing the hunting rifle's .308", DEF.slot === SLOT_PISTOL && !DEF.melee && !DEF.auto && DEF.ammo === AMMO.R308 && AMMO_ITEMS[DEF.ammo] === ITEM.AMMO_308 && DEF.ammo === RIFLE.ammo);

// ---------------------------------------------------------------- the recipe
const rec = RECIPES.find((r) => r.out === ITEM.DEAGLE);
const cost = Object.entries(rec?.cost || {}).map(([it, n]) => [+it, n]);
check('made at the workbench, one at a time, no schematic: its id its place in the list', !!rec && rec.n === 1 && rec.station === 'bench' && !rec.schem && !rec.hide && !rec.vehicle && RECIPES[rec.id] === rec && RECIPES.every((r, i) => r.id === i), JSON.stringify(rec?.cost));
check('...from real ingredients: raw materials only, a whole number of each, none of it the gun itself', cost.length >= 2 && cost.every(([it, n]) => ITEM_DEFS[it]?.cat === 'res' && Number.isInteger(n) && n > 0 && it !== ITEM.DEAGLE), cost.map(([it, n]) => `${n} ${ITEM_DEFS[it]?.name}`).join(', '));
const tables = [...Object.values(LOOT_TABLES), ...Object.values(CONT_TABLES), ZOMBIE_LOOT, SPECIAL_LOOT];
const found = (it) => tables.some((t) => t.some((row) => row[0] === it)) || RECIPES.some((r) => r.out === it && r.out !== ITEM.DEAGLE);
check('...every one of which can be found or made', cost.every(([it]) => found(it)), cost.filter(([it]) => !found(it)).map(([it]) => ITEM_DEFS[it].name).join(', '));
check('...and it takes more than a pistol is worth: two gun parts or more', (rec?.cost[ITEM.GUNPARTS] || 0) >= 2 && (rec?.cost[ITEM.GUNPARTS] || 0) > (SALVAGE[ITEM.PISTOL][ITEM.GUNPARTS] || 0));
const sal = SALVAGE[ITEM.DEAGLE];
check('it comes apart into less than it took', !!sal && Object.entries(sal).every(([it, n]) => rec.cost[it] && n < rec.cost[it]) && Object.keys(sal).length <= Object.keys(rec.cost).length, JSON.stringify(sal));

// ---------------------------------------------------------------- the numbers
check('each round hits over twice as hard as a pistol round, under a hunting rifle round', DEF.damage > 2 * PISTOL.damage && DEF.damage < RIFLE.damage, `${DEF.damage} (pistol ${PISTOL.damage}, rifle ${RIFLE.damage})`);
check('...but it fires slower, holds fewer and kicks harder than the pistol', DEF.rate > PISTOL.rate && DEF.mag < PISTOL.mag && DEF.recoil > PISTOL.recoil && DEF.spread >= PISTOL.spread);
check('...and it puts out more damage a second than the pistol, short of twice as much', dps(DEF) > dps(PISTOL) && dps(DEF) < 2 * dps(PISTOL), `${dps(DEF).toFixed(0)}/s against ${dps(PISTOL).toFixed(0)}/s`);
check('louder than the pistol, quieter than the hunting rifle', DEF.noise > PISTOL.noise && DEF.noise < RIFLE.noise, `${DEF.noise} m`);
check('a kill with it counts for the Sidearm feat', KILL_FEATS[ITEM.DEAGLE] === 'kill_pistol');
check('it has a shot of its own to be heard by', Number.isInteger(SOUND.DEAGLE) && Object.entries(SOUND).filter(([, v]) => v === SOUND.DEAGLE).length === 1);

// ---------------------------------------------------------------- made on the server
const game = new Game({ seed, godMode: true, dayLength: 36000, nightLength: 36000, themes: false, log: () => {} });
const A = { id: 0, net: { tick: 0, ack: 0 }, global: null, self: {}, store: { ents: new Map(), onCreate() {}, onRemove() {}, onUpdate() {} }, notes: [] };
A.handler = new Proxy({ notify: (m, a) => A.notes.push([m, a]) }, { get: (t, k) => t[k] || (() => {}) });
A.conn = {
  send(bytes) {
    const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
    const t = r.u8();
    if (t === S2C.WELCOME) A.id = r.u16();
    else if (t === S2C.SNAPSHOT) readSnapshot(r, A);
  },
};
const session = game.onOpen(A.conn);
{
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str('Eagle');
  game.onMessage(session, w.bytes().slice());
}
const p = game.players.get(A.id);
const s = p.state;
const has = (item) => p.inv.reduce((n, it) => n + (it && it.item === item ? it.count : 0), 0);
const pack = () => {
  p.inv.fill(null);
  cost.forEach(([it, n], i) => (p.inv[i] = { item: it, count: n }));
};
const nearStation = game.nearStation.bind(game);
let notes = [];
const notify = game.notify.bind(game);
game.notify = (m, a, id) => {
  if (id === p.id) notes.push(m);
  return notify(m, a, id);
};
{
  game.nearStation = (pl, kind) => (kind === 'bench' ? false : nearStation(pl, kind));
  pack();
  notes = [];
  game.craft(p, rec.id);
  check('server: not made away from a workbench, nothing spent, and told why', has(ITEM.DEAGLE) === 0 && s.weapons[SLOT_PISTOL] !== ITEM.DEAGLE && cost.every(([it, n]) => has(it) === n) && notes.includes(NOTIFY.NEED_BENCH));
}
{
  game.nearStation = (pl, kind) => kind === 'bench' || nearStation(pl, kind);
  p.inv.fill(null);
  cost.slice(1).forEach(([it, n], i) => (p.inv[i] = { item: it, count: n }));
  notes = [];
  game.craft(p, rec.id);
  check('server: not made with an ingredient missing, and told', has(ITEM.DEAGLE) === 0 && notes.includes(NOTIFY.NOT_ENOUGH));
  pack();
  const before = s.weapons[SLOT_PISTOL];
  game.craft(p, rec.id);
  const made = has(ITEM.DEAGLE) + (s.weapons[SLOT_PISTOL] === ITEM.DEAGLE ? 1 : 0);
  check('server: made at the workbench, and every ingredient spent', made === 1 && cost.every(([it]) => has(it) === 0), `pistol slot held ${ITEM_DEFS[before]?.name}`);
}
game.nearStation = nearStation;
{
  // made or picked up with the pistol's slot free, it goes there (hotbar 2), not into the primary slot (hotbar 1)
  s.weapons[SLOT_PRIMARY] = ITEM.AK47;
  s.weapons[SLOT_PISTOL] = 0;
  s.mags[0] = 17;
  p.inv.fill(null);
  game.giveItem(p, ITEM.DEAGLE, 1);
  check('server: it lands in the pistol slot, the primary slot\'s rifle untouched', s.weapons[SLOT_PISTOL] === ITEM.DEAGLE && s.mags[1] === DEF.mag && s.weapons[SLOT_PRIMARY] === ITEM.AK47 && s.mags[0] === 17 && has(ITEM.DEAGLE) === 0);
  s.weapons[SLOT_PRIMARY] = 0;
  s.weapons[SLOT_PISTOL] = 0;
  game.giveItem(p, ITEM.DEAGLE, 1);
  check('...and with the primary slot empty too, still the pistol slot', s.weapons[SLOT_PISTOL] === ITEM.DEAGLE && s.weapons[SLOT_PRIMARY] === 0);
}

// ---------------------------------------------------------------- what the client shows
{
  check('a model of its own', worldWeaponTris(ITEM.DEAGLE) > 0 && worldWeaponTris(ITEM.DEAGLE) !== worldWeaponTris(ITEM.PISTOL), `${worldWeaponTris(ITEM.DEAGLE)} triangles`);
  const vm = VM_DEBUG.VM[ITEM.DEAGLE];
  check('a viewmodel, held as a pistol in the hands fitted to the pistol\'s grip', !!vm && vm.kind === 'pistol' && vm.rPose === VM_DEBUG.VM[ITEM.PISTOL].rPose && vm.lGrip.pose === VM_DEBUG.VM[ITEM.PISTOL].lGrip.pose && viewModelTris(ITEM.DEAGLE) > 0);
  check('an icon for the backpack and the crafting list', hasItemIcon(ITEM.DEAGLE));
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
