// Crafting and salvage: what each thing is made of, where, and what it comes apart into.
import { ITEM, ITEM_DEFS } from './itemdefs.js';
import { WEAPON_LIST } from '../weapons/index.js';

// station: undefined = by hand anywhere, 'fire' = near a lit campfire, 'bench' = near a workbench.
// schem: the team must have found this schematic first.
// id: the item it makes (an item has one recipe at most). It is what C2S.CRAFT sends and what RECIPE_BY_ID is keyed
// by, never a place in the list, so a recipe can go anywhere without renumbering any other (the list's order is only
// the crafting panel's, where it breaks ties).
export const STATION_NAMES = { fire: 'Campfire', bench: 'Workbench' };
const BASE_RECIPES = [
  { out: ITEM.TORCH, n: 1, cost: { [ITEM.STICK]: 1, [ITEM.CLOTH]: 1 } },
  { out: ITEM.BANDAGE, n: 1, cost: { [ITEM.CLOTH]: 2 } },
  { out: ITEM.MEDKIT, n: 1, cost: { [ITEM.CLOTH]: 2, [ITEM.HERB]: 2, [ITEM.ALCOHOL]: 1 }, station: 'fire' },
  { out: ITEM.MOLOTOV, n: 1, cost: { [ITEM.ALCOHOL]: 1, [ITEM.CLOTH]: 1 } },
  { out: ITEM.PIPEBOMB, n: 1, cost: { [ITEM.SCRAP]: 2, [ITEM.POWDER]: 4, [ITEM.TAPE]: 1 }, station: 'bench', schem: ITEM.SCHEM_EXPLOSIVES },
  { out: ITEM.AMMO_9MM, n: 12, cost: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 2 }, station: 'bench' },
  { out: ITEM.AMMO_SHELLS, n: 6, cost: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 3 }, station: 'bench' },
  { out: ITEM.AMMO_762, n: 20, cost: { [ITEM.SCRAP]: 2, [ITEM.POWDER]: 4 }, station: 'bench' },
  { out: ITEM.JACKET, n: 1, cost: { [ITEM.CLOTH]: 6, [ITEM.LEATHER]: 2, [ITEM.TAPE]: 1 }, station: 'bench' },
  { out: ITEM.KEVLAR, n: 1, cost: { [ITEM.PLATE]: 2, [ITEM.CLOTH]: 4, [ITEM.TAPE]: 2 }, station: 'bench', schem: ITEM.SCHEM_KEVLAR },
  { out: ITEM.AMMO_308, n: 5, cost: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 3 }, station: 'bench' },
  { out: ITEM.ROPE, n: 1, cost: { [ITEM.CLOTH]: 3 } },
  { out: ITEM.WOOD, n: 1, cost: { [ITEM.STICK]: 3 } },
  { out: ITEM.POWDER, n: 6, cost: { [ITEM.CHEM]: 1, [ITEM.STICK]: 2 }, station: 'fire' },
  { out: ITEM.PAINKILLERS, n: 1, cost: { [ITEM.HERB]: 2, [ITEM.ALCOHOL]: 1 }, station: 'fire' },
  { out: ITEM.NAILS, n: 10, cost: { [ITEM.SCRAP]: 1 }, station: 'bench' },
  { out: ITEM.FLARE, n: 2, cost: { [ITEM.POWDER]: 2, [ITEM.CHEM]: 1, [ITEM.CLOTH]: 1 } },
  { out: ITEM.BATTERY, n: 1, cost: { [ITEM.SCRAP]: 1, [ITEM.CHEM]: 1 }, station: 'bench' },
  { out: ITEM.AMMO_556, n: 15, cost: { [ITEM.SCRAP]: 2, [ITEM.POWDER]: 3 }, station: 'bench' },
  { out: ITEM.AMMO_BOLTS, n: 4, cost: { [ITEM.STICK]: 2, [ITEM.SCRAP]: 1 }, station: 'bench' },
  { out: ITEM.AMMO_FUEL, n: 50, cost: { [ITEM.ALCOHOL]: 1, [ITEM.CHEM]: 1 }, station: 'bench' },
  { out: ITEM.VENISON, n: 1, cost: { [ITEM.VENISON_RAW]: 1 }, station: 'fire' },
  { out: ITEM.GRENADE, n: 1, cost: { [ITEM.SCRAP]: 2, [ITEM.POWDER]: 3 }, station: 'bench', schem: ITEM.SCHEM_EXPLOSIVES },
  { out: ITEM.DECOY, n: 1, cost: { [ITEM.SCRAP]: 1, [ITEM.WIRE]: 1, [ITEM.BATTERY]: 1 }, station: 'bench' },
  // a step past the Padded Jacket: the rope is 3 cloth apiece, and the leather is a trip out (barn, cabins, lodge, trunks)
  { out: ITEM.BACKPACK, n: 1, cost: { [ITEM.LEATHER]: 4, [ITEM.CLOTH]: 6, [ITEM.ROPE]: 2 }, station: 'bench' },
  { out: ITEM.AMMO_ROCKET, n: 1, cost: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 4, [ITEM.CHEM]: 1 }, station: 'bench', schem: ITEM.SCHEM_EXPLOSIVES },
  { out: ITEM.AMMO_145, n: 2, cost: { [ITEM.SCRAP]: 2, [ITEM.POWDER]: 5 }, station: 'bench' },
  { out: ITEM.AMMO_FLARE, n: 1, cost: { [ITEM.POWDER]: 3, [ITEM.CHEM]: 1, [ITEM.CLOTH]: 1 }, station: 'bench' },
];
// vehicles, built (shared/vehicles.js; `vehicle`: the kind that stands beside the bench when it is made - nothing goes
// into the pack). Mainland only, and not listed anywhere until the team has the manual (`hide`)
const VEHICLE_RECIPES = [
  { out: ITEM.BIKE_KIT, n: 1, cost: { [ITEM.SCRAP]: 6, [ITEM.WIRE]: 2, [ITEM.TAPE]: 2, [ITEM.LEATHER]: 1 }, station: 'bench', schem: ITEM.SCHEM_VEHICLES, vehicle: 3, hide: true },
  { out: ITEM.MOPED_KIT, n: 1, cost: { [ITEM.SCRAP]: 14, [ITEM.GUNPARTS]: 2, [ITEM.WIRE]: 3, [ITEM.TAPE]: 2, [ITEM.BATTERY]: 2 }, station: 'bench', schem: ITEM.SCHEM_VEHICLES, vehicle: 1, hide: true },
];
// the weapons' (`recipe` in each one's file, shared/weapons/) after the others, the vehicles last
export const RECIPES = [...BASE_RECIPES, ...WEAPON_LIST.filter((w) => w.recipe).map((w) => ({ out: w.id, ...w.recipe })), ...VEHICLE_RECIPES].map((r) => ({ id: r.out, ...r }));
export const RECIPE_BY_ID = new Map();
for (const r of RECIPES) {
  if (RECIPE_BY_ID.has(r.id)) throw new Error(`two recipes make ${ITEM_DEFS[r.out]?.name ?? r.out}: a recipe's id is the item it makes`);
  RECIPE_BY_ID.set(r.id, r);
}

// What a thing comes apart into when a survivor tears it down (ACT.SALVAGE): by hand, anywhere, one at a time or
// part of a stack. Something on a recipe gives about half of what the recipe takes, and never all of it back, so
// making a thing and tearing it down again is always a loss: no round trip of the two makes anything. What nobody
// can make gives what it is plainly made of. A gun's magazine goes back into the pack as rounds besides.
// Left off: raw materials, ammunition, food and car supplies - they are what things are made of, or what the run is for.
export const SALVAGE = {
  [ITEM.BANDAGE]: { [ITEM.CLOTH]: 1 },
  [ITEM.MEDKIT]: { [ITEM.CLOTH]: 1, [ITEM.HERB]: 1 },
  [ITEM.PAINKILLERS]: { [ITEM.HERB]: 1 },
  [ITEM.TORCH]: { [ITEM.CLOTH]: 1 },
  [ITEM.MOLOTOV]: { [ITEM.ALCOHOL]: 1 },
  [ITEM.PIPEBOMB]: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 2 },
  [ITEM.FLARE]: { [ITEM.POWDER]: 1 },
  [ITEM.JACKET]: { [ITEM.CLOTH]: 3, [ITEM.LEATHER]: 1 },
  [ITEM.KEVLAR]: { [ITEM.PLATE]: 1, [ITEM.CLOTH]: 2 },
  [ITEM.WALKIE]: { [ITEM.BATTERY]: 1, [ITEM.SCRAP]: 1 },
  [ITEM.GRENADE]: { [ITEM.SCRAP]: 1, [ITEM.POWDER]: 1 },
  [ITEM.DECOY]: { [ITEM.BATTERY]: 1 },
  [ITEM.BACKPACK]: { [ITEM.LEATHER]: 2, [ITEM.CLOTH]: 3, [ITEM.ROPE]: 1 },
  // the weapons: `salvage` in each one's file (shared/weapons/)
  ...Object.fromEntries(WEAPON_LIST.filter((w) => w.salvage).map((w) => [w.id, w.salvage])),
};
// What worn gear (armor, the backpack) taken apart from its equipment row [Shift+LMB] gives back: its SALVAGE row
// - a backpack 2 Leather, 3 Cloth and 1 Rope. -> { item: count }, or null for anything that is not worn or has none.
export function salvageOf(item) {
  const cat = ITEM_DEFS[item]?.cat;
  return ((cat === 'armor' || cat === 'pack') && SALVAGE[item]) || null;
}
