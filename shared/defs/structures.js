// What the survivors build: the pieces, what each costs, takes to repair and gives back when it is taken down.
// Numeric ids are part of the wire protocol - do not renumber.
import { ITEM } from './itemdefs.js';
import { uniqueIds } from '../ids.js';

export const STRUCT = uniqueIds('STRUCT', {
  BARRICADE: 1,
  WALL: 2,
  METAL_WALL: 3,
  SPIKES: 4,
  BARBED_WIRE: 5,
  TORCH: 6,
  GATE: 7,
  CAMPFIRE: 8,
  WORKBENCH: 9,
  DOOR: 10,
  GENERATOR: 11, // burns Flamethrower Fuel, feeds the floodlights round it, hums (shared/power.js)
  FLOODLIGHT: 12,
  STONE_WALL: 13, // dry-laid stone: between the wood wall and the metal one, and no schematic
});

// sx/sy/sz = size (m). block: blocks zombies (and players unless humanPass). hp.
// light: radius (m) lit while it burns - Shades inside it are frozen.
// station: 'fire' | 'bench' crafting station. snap: 'door' snaps into building doorways. schem: required schematic item.
// metal: rings and sparks when struck, not wood. stone: chips like rock when struck. repair: what one repair takes
// (REPAIR_COST when unset: repairCostOf). fuel: the item it burns, poured in with [E] (the item guide lists it).
// Nothing needs a base any more: build a temporary shelter wherever the team is when night falls.
export const STRUCT_DEFS = {
  [STRUCT.BARRICADE]: { name: 'Wood Barricade', sx: 3, sy: 1.15, sz: 0.4, hp: 520, block: true, cost: { [ITEM.WOOD]: 3, [ITEM.NAILS]: 2 }, desc: 'Waist-high. Survivors vault it [Space]; zombies must break it.' },
  [STRUCT.DOOR]: { name: 'Door Boards', sx: 1.5, sy: 2.25, sz: 0.22, hp: 700, block: true, humanPass: true, snap: 'door', cost: { [ITEM.WOOD]: 3, [ITEM.NAILS]: 3 }, desc: 'Snaps into a doorway. Survivors squeeze through; the dead must smash it.' },
  [STRUCT.WALL]: { name: 'Wood Wall', sx: 3, sy: 2.8, sz: 0.35, hp: 900, block: true, cost: { [ITEM.WOOD]: 5, [ITEM.NAILS]: 4 }, desc: 'Tall plank wall.' },
  [STRUCT.GATE]: { name: 'Survivor Gate', sx: 3, sy: 2.6, sz: 0.35, hp: 800, block: true, humanPass: true, cost: { [ITEM.WOOD]: 5, [ITEM.NAILS]: 4, [ITEM.SCRAP]: 1 }, desc: 'Survivors can pass through. Zombies cannot.' },
  [STRUCT.METAL_WALL]: { name: 'Metal Wall', sx: 3, sy: 2.8, sz: 0.3, hp: 2400, block: true, metal: true, schem: ITEM.SCHEM_METAL, cost: { [ITEM.SCRAP]: 5, [ITEM.NAILS]: 4, [ITEM.TAPE]: 1 }, desc: 'Scrap-metal wall. Very tough.' },
  [STRUCT.STONE_WALL]: { name: 'Stone Wall', sx: 3, sy: 2.4, sz: 0.6, hp: 1500, block: true, stone: true, cost: { [ITEM.STONE]: 5, [ITEM.WOOD]: 1 }, repair: { [ITEM.STONE]: 1 }, desc: 'Stacked stone on a timber sill. Tougher than wood; patch it with stone.' },
  [STRUCT.SPIKES]: { name: 'Spike Trap', sx: 2.2, sy: 0.5, sz: 2.2, hp: 45, block: false, trap: true, dps: 55, slow: 0.45, cost: { [ITEM.WOOD]: 2, [ITEM.NAILS]: 4 }, desc: 'Impales zombies that cross it. Wears out.' },
  [STRUCT.BARBED_WIRE]: { name: 'Barbed Wire', sx: 3, sy: 0.9, sz: 1.0, hp: 400, block: false, trap: true, dps: 12, slow: 0.3, cost: { [ITEM.WIRE]: 2, [ITEM.STICK]: 2 }, desc: 'Slows and shreds the horde.' },
  [STRUCT.TORCH]: { name: 'Standing Torch', sx: 0.3, sy: 1.7, sz: 0.3, hp: 60, block: false, light: 9, burn: 360, cost: { [ITEM.TORCH]: 1 }, desc: 'Lights the area for 6 minutes. Shades freeze in its light.' },
  [STRUCT.CAMPFIRE]: { name: 'Campfire', sx: 1.7, sy: 0.6, sz: 1.7, hp: 250, block: false, light: 13, station: 'fire', burn: 300, cost: { [ITEM.STICK]: 4, [ITEM.WOOD]: 1 }, desc: 'Crafting station (medicine, powder). Heals survivors resting nearby. Feed it wood [E].' },
  [STRUCT.WORKBENCH]: { name: 'Workbench', sx: 2.0, sy: 1.0, sz: 0.9, hp: 450, block: true, station: 'bench', cost: { [ITEM.WOOD]: 5, [ITEM.NAILS]: 6, [ITEM.SCRAP]: 2 }, desc: 'Crafting station: weapons, ammo, armor and explosives.' },
  // the generator and its floodlights: the numbers behind these two lines are in shared/power.js
  [STRUCT.GENERATOR]: { name: 'Generator', sx: 1.3, sy: 0.95, sz: 0.8, hp: 600, block: true, metal: true, fuel: ITEM.AMMO_FUEL, cost: { [ITEM.SCRAP]: 6, [ITEM.GUNPARTS]: 1, [ITEM.TAPE]: 2, [ITEM.WIRE]: 1 }, desc: 'Burns Flamethrower Fuel [E] and powers the floodlights within 16 m. It hums: the dead hear it from 40 m.' },
  [STRUCT.FLOODLIGHT]: { name: 'Floodlight', sx: 0.6, sy: 2.2, sz: 0.5, hp: 160, block: true, metal: true, cost: { [ITEM.SCRAP]: 3, [ITEM.BATTERY]: 1, [ITEM.WIRE]: 1 }, desc: 'Lights a wide cone 24 m long the way it faces, with a running generator within 16 m. Shades freeze in it.' },
};
export const STRUCT_ORDER = [STRUCT.BARRICADE, STRUCT.DOOR, STRUCT.WALL, STRUCT.STONE_WALL, STRUCT.GATE, STRUCT.METAL_WALL, STRUCT.SPIKES, STRUCT.BARBED_WIRE, STRUCT.TORCH, STRUCT.CAMPFIRE, STRUCT.WORKBENCH, STRUCT.GENERATOR, STRUCT.FLOODLIGHT];
// how near its interaction point the view ray has to pass to offer [E] on a structure (PICK_RADIUS in constants.js)
export const structPickRadius = (stype) => Math.max(0.8, STRUCT_DEFS[stype].sx * 0.5);
export const REPAIR_COST = { [ITEM.WOOD]: 1, [ITEM.NAILS]: 1 }; // per repair action (+35% hp)
// what one repair of a structure of type stype takes: its own `repair`, or planks and nails
export const repairCostOf = (stype) => STRUCT_DEFS[stype]?.repair || REPAIR_COST;
export const DEMOLISH_UNDO_SECONDS = 15;
export const DEMOLISH_REFUND_RATE = 0.75;
// What taking structure e down gives back (Game.demolish). For a short undo window after placement the whole build
// cost comes back, so a misplaced piece costs nothing. After that, each material with a cost above one refunds 75% of
// the lowest health share the piece ever reached, rounded down. A torch or campfire is capped by the fuel left from
// its original build, so a burnt-out light is not traded back for a fresh one. Repairs never raise e.minHealth.
export function demolishRefund(e, now = Infinity) {
  const def = STRUCT_DEFS[e.stype];
  const placedAt = Number.isFinite(e.placedAt) ? e.placedAt : -Infinity;
  const undo = now - placedAt <= DEMOLISH_UNDO_SECONDS;
  if (undo) return { ...def.cost };
  let share = Number.isFinite(e.minHealth) ? e.minHealth : e.maxHp > 0 ? e.hp / e.maxHp : 0;
  if (def.burn) share = Math.min(share, e.burnLeft / def.burn);
  share = Math.max(0, Math.min(1, share));
  const out = {};
  for (const k in def.cost) {
    if (def.cost[k] === 1) continue;
    const n = Math.floor(def.cost[k] * DEMOLISH_REFUND_RATE * share + 1e-9); // keep exact products from falling below their floor
    if (n > 0) out[k] = n;
  }
  return out;
}
export const CAMPFIRE_FUEL = { [ITEM.WOOD]: 70, [ITEM.STICK]: 22 }; // seconds of burn per item fed
export const CAMPFIRE_MAX_FUEL = 600;
