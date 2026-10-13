// The revolver (ITEM.REVOLVER): a six-shot sidearm in the pistol's slot, made at the workbench. Its row holds six
// 9mm rounds and hits harder and slower than the pistol; its recipe exists, sits at its own id, and takes real
// materials, as every other weapon's recipe must; and against a real Game in-process it is made at a workbench from
// those materials (all of them spent), refused away from one with nothing spent, and torn down for less than it took.
// usage: node scripts/test-revolver.js [seed]
import { Game } from '../server/game.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader } from '../shared/protocol.js';
import { SLOT_PISTOL } from '../shared/constants.js';
import { ITEM, ITEM_DEFS, WEAPONS, RECIPES, RECIPE_BY_ID, SALVAGE, AMMO_ITEMS, NOTIFY, slotForItem, isFirearm } from '../shared/defs.js';
import { KILL_FEATS } from '../shared/achievements.js';

const seed = +(process.argv[2] || 4242);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};

// ---------------------------------------------------------------- the data
const def = ITEM_DEFS[ITEM.REVOLVER];
const w = WEAPONS[ITEM.REVOLVER];
const pistol = WEAPONS[ITEM.PISTOL];
check('the revolver is a weapon item', !!def && def.cat === 'weapon' && def.stack === 1);
check("...a firearm in the pistol's slot", !!w && isFirearm(ITEM.REVOLVER) && slotForItem(ITEM.REVOLVER) === SLOT_PISTOL);
check('...with six rounds, of 9mm, one at a pull', w.mag === 6 && AMMO_ITEMS[w.ammo] === ITEM.AMMO_9MM && !w.auto && w.pellets === 1);
check("...harder per round than the pistol, slower between shots and to reload", w.damage > pistol.damage && w.rate > pistol.rate && w.reload > pistol.reload);
check('...and a kill with it counts for the sidearm feat', KILL_FEATS[ITEM.REVOLVER] === KILL_FEATS[ITEM.PISTOL]);

// every recipe that makes a weapon takes real materials: items that exist, are not weapons themselves, a whole count
const real = (cost) => Object.keys(cost).length > 0 && Object.entries(cost).every(([it, n]) => ITEM_DEFS[+it] && ITEM_DEFS[+it].cat !== 'weapon' && Number.isInteger(n) && n > 0);
const weaponRecipes = RECIPES.filter((r) => ITEM_DEFS[r.out]?.cat === 'weapon');
const bad = weaponRecipes.filter((r) => !real(r.cost));
check('every weapon recipe takes real materials', !bad.length, bad.map((r) => ITEM_DEFS[r.out].name).join(', '));
check('every recipe is found by its id, the item it makes (the client and server look them up by it)', RECIPES.every((r) => r.id === r.out && RECIPE_BY_ID.get(r.id) === r));

const rec = RECIPES.find((r) => r.out === ITEM.REVOLVER);
check('the revolver has a recipe', !!rec);
check('...one at a time, at the workbench, with no schematic to find and listed for everyone', rec.n === 1 && rec.station === 'bench' && !rec.schem && !rec.hide);
check('...made of gun parts and more', real(rec.cost) && rec.cost[ITEM.GUNPARTS] > 0 && Object.keys(rec.cost).length >= 2, JSON.stringify(rec.cost));
const back = SALVAGE[ITEM.REVOLVER];
check('...and torn down it gives back less than it took', !!back && Object.entries(back).every(([it, n]) => n <= (rec.cost[it] || 0)) && Object.entries(back).some(([it, n]) => n < (rec.cost[it] || 0) || !rec.cost[it]) && Object.values(back).reduce((a, b) => a + b, 0) < Object.values(rec.cost).reduce((a, b) => a + b, 0));

// ---------------------------------------------------------------- against the server
const game = new Game({ seed, godMode: true, dayLength: 36000, nightLength: 36000, themes: false, log: () => {} });
const A = { id: 0, notes: [] };
A.conn = {
  send(bytes) {
    const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
    if (r.u8() === S2C.WELCOME) A.id = r.u16();
  },
};
A.session = game.onOpen(A.conn);
{
  const jw = new Writer(64);
  jw.u8(C2S.JOIN);
  jw.u8(PROTOCOL_VERSION);
  jw.str('Alice');
  game.onMessage(A.session, jw.bytes().slice());
}
const p = game.players.get(A.id);
const s = p.state;
const notify = game.notify.bind(game);
game.notify = (m, a, to) => {
  if (to === p.id) A.notes.push(m);
  return notify(m, a, to);
};
const pack = (...list) => {
  p.inv.fill(null);
  list.forEach(([item, count], i) => (p.inv[i] = { item, count }));
  p.invDirty = true;
};
const has = (item) => p.inv.reduce((n, x) => n + (x && x.item === item ? x.count : 0), 0) + (s.weapons.includes(item) ? 1 : 0);
// a workbench in reach or not, as test-autocraft has it
const nearStation = game.nearStation;
const atBench = (on) => (game.nearStation = (pp, kind) => (on && kind === 'bench' ? {} : null));
const kit = () => pack(...Object.entries(rec.cost).map(([it, n]) => [+it, n]));

game.update();
{
  atBench(false);
  kit();
  A.notes.length = 0;
  game.craft(p, rec.id);
  check('server: no revolver away from a workbench, nothing spent, and told why', has(ITEM.REVOLVER) === 0 && A.notes.includes(NOTIFY.NEED_BENCH) && Object.entries(rec.cost).every(([it, n]) => has(+it) === n));
}
{
  atBench(true);
  kit();
  game.craft(p, rec.id);
  check('server: at a workbench the revolver is made', has(ITEM.REVOLVER) === 1);
  check('...and everything it took is spent', Object.keys(rec.cost).every((it) => has(+it) === 0));
}
{
  atBench(true);
  pack([ITEM.GUNPARTS, 1], [ITEM.SCRAP, 3], [ITEM.WOOD, 1]);
  const before = has(ITEM.REVOLVER);
  game.craft(p, rec.id);
  check('server: a gun part short, no second revolver', has(ITEM.REVOLVER) === before);
}
game.nearStation = nearStation;

console.log(fails.length ? `\n${fails.length} FAILED:\n  ${fails.join('\n  ')}` : '\nall revolver checks passed');
process.exit(fails.length ? 1 : 0);
