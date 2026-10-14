// The escape: the supplies the car on Route 9 (or the plane on the mainland) needs, the schematics the team finds,
// and where the ones still missing are rumoured to be.
import { ITEM } from './itemdefs.js';

// Your car broke down on Route 9. Install every supply, start the engine and survive the final stand.
export const SUPPLIES = [ITEM.CAR_BATTERY, ITEM.SPARE_TIRE, ITEM.SPARK_PLUGS, ITEM.FAN_BELT, ITEM.FUEL_CAN];
export const SUPPLY_NEED = [1, 1, 1, 1, 3];
// ...and on the mainland (act 2, shared/acts.js) the same loop with a plane: its parts are at set places, the fuel at
// the depot. The list has the car's shape - four single parts, then the fuel by threes - so the global state, the
// rumours and the objective tracker read either the same way.
export const PLANE_PARTS = [ITEM.PROPELLER, ITEM.MAGNETO, ITEM.HYDRAULIC_PUMP, ITEM.FLIGHT_RADIO, ITEM.AVGAS];
export const PLANE_NEED = [1, 1, 1, 1, 3];
// what the escape of an act takes: { items, need }
export const suppliesOf = (act) => (act === 2 ? { items: PLANE_PARTS, need: PLANE_NEED } : { items: SUPPLIES, need: SUPPLY_NEED });

// Where supply i is still worth looking for. hints: the place each hidden one is rumoured to be in (the 4 parts,
// then the 3 jerry cans; 255: none); found: a bit per hint, set once that one has been taken from its hiding place.
// -> { zones: the places left to search, found: how many have been taken }
export function supplyRumours(i, hints, found = 0) {
  const zones = [];
  let n = 0;
  (hints || []).forEach((z, k) => {
    if (Math.min(k, SUPPLIES.length - 1) !== i || z == null || z === 255) return;
    if (found & (1 << k)) n++;
    else zones.push(z);
  });
  return { zones, found: n };
}

// schematics: bit index into the team's unlock mask
export const SCHEMATICS = [ITEM.SCHEM_SHOTGUN, ITEM.SCHEM_RIFLE, ITEM.SCHEM_KEVLAR, ITEM.SCHEM_EXPLOSIVES, ITEM.SCHEM_METAL];
export const SCHEM_BIT = { [ITEM.SCHEM_SHOTGUN]: 0, [ITEM.SCHEM_RIFLE]: 1, [ITEM.SCHEM_KEVLAR]: 2, [ITEM.SCHEM_EXPLOSIVES]: 3, [ITEM.SCHEM_METAL]: 4, [ITEM.SCHEM_VEHICLES]: 5 }; // (the last: a bit of the mask, not one of SCHEMATICS)

// Where the schematics the team still lacks are rumoured to be. hints: the place each SCHEMATICS entry is hidden
// in (255: none); unlocked: the team's mask. -> [{ item, zone }]
export function schematicRumours(hints, unlocked = 0) {
  const out = [];
  SCHEMATICS.forEach((item, k) => {
    const zone = hints?.[k];
    if (zone == null || zone === 255 || unlocked & (1 << SCHEM_BIT[item])) return;
    out.push({ item, zone });
  });
  return out;
}
