// Trees chopped down. A tree that has given the last of what it gives falls (EVT.FELL) and is out of the world
// until dawn: its trunk stops nobody and no bullet any more. The server and every client take its collider out of
// their own static grid by the same rule, and put them all back at dawn (EVT.REGROWN) or when a new game starts
// on the same valley. world.felled holds the ones that are down.
// A tree shot or blown apart (EVT.TREE_BREAK) is cut instead: what stands of it stays in the world, its collider
// only as tall as the trunk left, so it can be shot again and broken lower down. world.cut holds those.
import { COL } from './collision.js';
import { qpos, dqpos } from './protocol.js';

const _near = [];

// The tree collider the server names by its quantized x, y0, z (EVT.STRIPPED / EVT.FELL), standing or felled;
// null when that is no tree.
export function treeAt(world, qx, qy, qz) {
  const same = (c) => c.flags & COL.TREE && qpos(c.x) === qx && qpos(c.y0) === qy && qpos(c.z) === qz;
  for (const c of world.staticGrid.query(dqpos(qx), dqpos(qz), 0.5, _near)) if (same(c)) return c;
  return world.felled?.find(same) || null;
}

// Takes a standing tree out of the world. False when it is down already.
export function fellTree(world, col) {
  if (!col.cells) return false;
  world.staticGrid.remove(col);
  (world.felled ||= []).push(col);
  return true;
}

// How much of tree col stands, in m up its foot (the collider reaches a metre into the ground)
export const treeFoot = (col) => col.y0 + 1;
export const treeTop = (col) => col.y1 - col.y0 - 1;
// ...and how tall it was whole
export const treeHeight = (col) => (col.full ?? col.y1) - col.y0 - 1;

// Tree col broken off `top` m up its foot: only the trunk below stands. False when no more than that stands now.
export function cutTree(world, col, top) {
  if (top >= treeTop(col)) return false;
  col.full ??= col.y1;
  col.y1 = col.y0 + 1 + top;
  (world.cut ||= new Set()).add(col);
  return true;
}

// Every felled tree stands again, and every cut one is whole.
export function regrowTrees(world) {
  if (world.cut) {
    for (const col of world.cut) col.y1 = col.full;
    world.cut.clear();
  }
  const felled = world.felled;
  if (!felled) return;
  for (const col of felled) world.staticGrid.add(col);
  felled.length = 0;
}
