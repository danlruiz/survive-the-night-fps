// Trees shot to pieces. A round in a trunk does damage where it struck, and a little less up and down the trunk
// from there (out to TREE_SPREAD either way): the trunk keeps that damage in a row of TREE_BIN-high bands, and one
// band that has taken the tree's TREE_HP breaks there. Rounds put about the same height add up; rounds sprayed up
// and down the trunk mostly do not. What stood above comes down (Game.breakTree); what stands below keeps the damage
// it took lower down, can be shot again, and breaks again lower still - down to a stump TREE_CUT_MIN high.
// The state is the tree's record in Game.gather ({ left, dmg, top }): saved with it, cleared with it at dawn.
import { treeTop, treeHeight } from '../shared/felling.js';

export const TREE_BIN = 0.25; // m: the bands up the trunk the damage is kept in
export const TREE_SPREAD = 1.5; // m: a round's damage falls off to nothing this far above and below where it struck
// the damage a band takes to break, in a trunk TREE_HP_R thick or thinner (thicker trunks take more, as their
// thickness): 2.4 pistol rounds, so three put about the same place break it and two never do
export const TREE_HP = 72;
export const TREE_HP_R = 0.3;
export const TREE_CUT_MIN = 0.4; // m above its foot, at the least, a tree breaks: the stump left
export const TREE_CUT_MAX = 12; // ...and at the most (a shot higher, in the crown, counts as one there)
export const TREE_PIECE_MIN = 0.5; // m: the shortest length of trunk that breaks off (higher than that it only splinters)

export const treeHp = (col) => TREE_HP * Math.max(1, col.r / TREE_HP_R);
// how high up its foot tree col can break: below its crown, which comes down whole
export const treeCutMax = (col) => Math.min(TREE_CUT_MAX, 0.6 * treeHeight(col));

// A round of `dmg` into tree col (state st: its Game.gather record) h m up its foot. Where it breaks now, m up its
// foot - the band that has taken the most past the tree's TREE_HP - or -1: it stands.
export function hitTree(st, col, h, dmg) {
  const top = treeTop(col);
  const most = treeCutMax(col);
  h = Math.max(0, Math.min(h, most, top));
  const n = Math.ceil(most / TREE_BIN) + 1;
  const d = (st.dmg ||= new Array(n).fill(0));
  const lo = Math.max(0, Math.floor((h - TREE_SPREAD) / TREE_BIN));
  const hi = Math.min(n - 1, Math.ceil((h + TREE_SPREAD) / TREE_BIN));
  const highest = top - TREE_PIECE_MIN; // (a break higher than this leaves no piece to fall)
  let best = -1;
  let bestD = treeHp(col);
  for (let i = lo; i <= hi; i++) {
    const c = (i + 0.5) * TREE_BIN;
    const w = 1 - Math.abs(c - h) / TREE_SPREAD;
    if (w <= 0) continue;
    d[i] += dmg * w;
    if (d[i] >= bestD && Math.max(TREE_CUT_MIN, c) <= highest) {
      best = i;
      bestD = d[i];
    }
  }
  return best < 0 ? -1 : Math.max(TREE_CUT_MIN, (best + 0.5) * TREE_BIN);
}

// Tree st broken `cut` m up its foot: what was above is gone, damage and all, and so is the shattered wood round
// the break - the trunk left takes three rounds again to break anew near its top.
export function treeBroken(st, cut) {
  st.top = cut;
  const d = st.dmg;
  if (!d) return;
  for (let i = Math.max(0, Math.floor((cut - TREE_SPREAD) / TREE_BIN)); i < d.length; i++) d[i] = 0;
}
