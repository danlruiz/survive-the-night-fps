// Trees shot to pieces (server/trees.js): the damage rounds leave in a trunk, band by band up it, and where it breaks.
//   - three pistol rounds about the same height break a thin trunk there, and two never do, wherever they strike;
//   - rounds sprayed up and down a trunk do not add up to a break; a thicker trunk takes more rounds;
//   - a trunk broken once breaks again lower down, from three rounds more, never from what was left of the first;
//   - nothing breaks off shorter than TREE_PIECE_MIN, and nothing below TREE_CUT_MIN;
//   - what a round costs the server.
// usage: node scripts/test-trees.js
import { makeCyl, COL } from '../shared/collision.js';
import { cutTree, treeTop, regrowTrees } from '../shared/felling.js';
import { hitTree, treeBroken, treeHp, TREE_HP, TREE_BIN, TREE_CUT_MIN, TREE_PIECE_MIN } from '../server/trees.js';
import { WEAPONS, ITEM } from '../shared/defs.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
};
const PISTOL = WEAPONS[ITEM.PISTOL].damage;
const world = {};
const tree = (r = 0.24, scale = 1) => makeCyl(0, 0, -1, 14 * scale, r, COL.STATIC | COL.TREE);
// rounds into a fresh tree at the heights hs: the first break (m up its foot) and after how many, or [-1, n]
const volley = (col, hs, dmg = PISTOL, st = {}) => {
  for (let k = 0; k < hs.length; k++) {
    const cut = hitTree(st, col, hs[k], dmg);
    if (cut >= 0) return [cut, k + 1];
  }
  return [-1, hs.length];
};

check('a band breaks at 2.4 pistol rounds of damage, in a thin trunk', TREE_HP === 2.4 * PISTOL, `${TREE_HP} / ${PISTOL}`);
// every height up a thin trunk, on and off the bands: two rounds never, the third always, and there
let two = 0, three = 0, where = 0;
for (let h = 0.4; h < 8; h += 0.037) {
  if (volley(tree(), [h, h])[0] >= 0) two++;
  const [cut, n] = volley(tree(), [h, h, h]);
  if (cut >= 0 && n === 3) three++;
  if (cut >= 0 && Math.abs(cut - Math.max(TREE_CUT_MIN, h)) > TREE_BIN / 2 + 1e-9) where++;
}
check('two pistol rounds in the same place never break a trunk, at any height', two === 0, `${two} broke`);
check('...the third always does', three === Math.ceil((8 - 0.4) / 0.037), `${three} of ${Math.ceil((8 - 0.4) / 0.037)}`);
check('...and it breaks where they struck (within half a band)', where === 0, `${where} elsewhere`);
// "about the same height": rounds a few tenths of a metre apart add up; rounds a metre and more apart do not
check('three rounds within 0.6 m of each other break it', volley(tree(), [3, 3.3, 2.7])[0] >= 0);
check('three rounds 1.5 m apart do not', volley(tree(), [1.5, 3, 4.5])[0] < 0);
check('...nor do six a metre apart up 6 m of it', volley(tree(), [1, 2, 3, 4, 5, 6])[0] < 0);
const spray = volley(tree(), [1, 2, 3, 4, 5, 6, 1.5, 2.5, 3.5, 4.5, 5.5]);
check('...though the rounds filling the gaps between them add up, at last', spray[0] >= 0 && spray[1] > 6, `after ${spray[1]}`);
// thicker trunks take more: as their thickness
const thick = tree(0.5);
const [tc, tn] = volley(thick, [2, 2, 2, 2, 2, 2, 2, 2]);
check('a trunk 0.5 m round takes five pistol rounds about one place', tc >= 0 && tn === 5 && Math.abs(treeHp(thick) - 120) < 1e-9, `${tn} rounds, ${treeHp(thick)} hp`);
check('a hunting rifle round breaks any trunk at once', volley(tree(0.55, 1.3), [2], WEAPONS[ITEM.HUNTING_RIFLE].damage)[0] >= 0);
// a shotgun at a few metres: 9 pellets about one place
check('a shotgun blast up close breaks a thin trunk', volley(tree(), [2, 2.05, 1.95, 2.1, 1.9, 2.02, 1.98, 2.07, 1.93], WEAPONS[ITEM.SHOTGUN].damage)[0] >= 0);

// broken once, it breaks again lower down - from three rounds more - and what is left is shorter each time
{
  const col = tree();
  const st = {};
  const [c1] = volley(col, [4, 4, 4], PISTOL, st);
  treeBroken(st, c1);
  cutTree(world, col, c1);
  check('a trunk broken at 4 m stands 4 m tall', Math.abs(treeTop(col) - c1) < 1e-9 && Math.abs(c1 - 4) <= TREE_BIN / 2, `${treeTop(col)}`);
  // right below the break: the shattered wood went with what came down
  check('one round just below the break does not break it again', hitTree(st, col, c1 - 0.6, PISTOL) < 0);
  const [c2, n2] = volley(col, [2, 2, 2], PISTOL, st);
  check('...three more lower down break it there', c2 >= 0 && n2 === 3 && Math.abs(c2 - 2) <= TREE_BIN / 2, `${c2} after ${n2}`);
  treeBroken(st, c2);
  cutTree(world, col, c2);
  const [c3] = volley(col, [0.6, 0.6, 0.6, 0.6, 0.6, 0.6], PISTOL, st);
  check('...and again, down to a low stump', c3 >= TREE_CUT_MIN && c3 <= c2 - TREE_PIECE_MIN, `${c3}`);
  treeBroken(st, c3);
  cutTree(world, col, c3);
  const [c4] = volley(col, new Array(30).fill(0.2), PISTOL, st);
  check('a stump too short to lose a piece only splinters', c4 < 0 || c4 <= treeTop(col) - TREE_PIECE_MIN, `${c4}`);
  regrowTrees(world);
  check('dawn: it stands whole again', col.y1 === 14 && !world.cut.size);
}
// nothing breaks off shorter than TREE_PIECE_MIN: rounds right at the top of what stands only splinter it
{
  const col = tree();
  const st = {};
  cutTree(world, col, 3);
  const [c] = volley(col, new Array(20).fill(2.9), PISTOL, st);
  check('rounds into the very top of a trunk break it no higher than half a metre down', c >= 0 && c <= 3 - TREE_PIECE_MIN + 1e-9, `${c}`);
  regrowTrees(world);
}

// what a round in a trunk costs the server (once per round that strikes one: nothing a tick otherwise)
{
  const cols = Array.from({ length: 200 }, (_, i) => tree(0.2 + (i % 5) * 0.08, 0.8 + (i % 4) * 0.15));
  const sts = cols.map(() => ({}));
  const N = 200000;
  let k = 0;
  for (let w = 0; w < 20000; w++) hitTree(sts[w % 200], cols[w % 200], 0.1, 1e-6);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const j = i % 200;
    if (hitTree(sts[j], cols[j], 0.5 + ((i * 7) % 70) / 10, 0.01) >= 0) k++;
  }
  const ns = Number(process.hrtime.bigint() - t0) / N;
  console.log(`      hitTree: ${ns.toFixed(0)} ns a round (${N} rounds into 200 trees)`);
  check('a round in a trunk costs the server under 2 microseconds', ns < 2000 && k === 0, `${ns.toFixed(0)} ns`);
}

console.log(failed ? `${failed} FAILED` : 'all tree checks passed');
process.exit(failed ? 1 : 0);
