// Loot: what each place, each kind of container and the dead hold, and the containers themselves.
import { ITEM, WEAPONS, AMMO_ITEMS } from './itemdefs.js';
import { ZONE } from './zones.js';
import { uniqueIds } from '../ids.js';

// weighted loot tables per zone: [item, weight, min, max]
export const LOOT_TABLES = {
  [ZONE.CAMP]: [[ITEM.CLOTH, 6, 2, 3], [ITEM.STICK, 4, 2, 4], [ITEM.WOOD, 3, 1, 3]],
  [ZONE.FOREST]: [[ITEM.STICK, 8, 2, 5], [ITEM.WOOD, 4, 1, 3], [ITEM.CLOTH, 7, 1, 3], [ITEM.HERB, 3, 1, 2], [ITEM.SCRAP, 1, 1, 2], [ITEM.AMMO_9MM, 1, 6, 12]],
  [ZONE.BARN]: [[ITEM.WOOD, 8, 2, 5], [ITEM.NAILS, 8, 4, 10], [ITEM.ROPE, 4, 1, 2], [ITEM.CLOTH, 5, 1, 3], [ITEM.WIRE, 4, 1, 2], [ITEM.LEATHER, 3, 1, 2], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.BAT, 1, 1, 1], [ITEM.ALCOHOL, 2, 1, 1], [ITEM.HAMMER, 1, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1]],
  [ZONE.DOCK]: [[ITEM.ROPE, 6, 1, 3], [ITEM.SCRAP, 5, 1, 3], [ITEM.CLOTH, 4, 1, 3], [ITEM.TAPE, 4, 1, 2], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.BATTERY, 3, 1, 1], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.CHEM, 2, 1, 2], [ITEM.NAILS, 3, 3, 8], [ITEM.TUNA, 4, 1, 2], [ITEM.AMMO_FLARE, 3, 1, 3], [ITEM.FLARE_GUN, 1, 1, 1]],
  [ZONE.GAS]: [[ITEM.SCRAP, 7, 2, 4], [ITEM.TAPE, 5, 1, 2], [ITEM.CHEM, 5, 1, 2], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.PAINKILLERS, 3, 1, 2], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.NAILS, 3, 4, 10], [ITEM.PISTOL, 1, 1, 1], [ITEM.TUNA, 3, 1, 2], [ITEM.AMMO_FUEL, 3, 20, 40], [ITEM.ENERGY_DRINK, 4, 1, 2]],
  [ZONE.RANGER]: [[ITEM.GUNPARTS, 4, 1, 1], [ITEM.AMMO_308, 5, 3, 6], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.BATTERY, 4, 1, 2], [ITEM.BANDAGE, 4, 1, 2], [ITEM.ROPE, 3, 1, 2], [ITEM.POWDER, 3, 2, 5], [ITEM.MEDKIT, 1, 1, 1], [ITEM.HUNTING_RIFLE, 1, 1, 1], [ITEM.AMMO_BOLTS, 3, 2, 5], [ITEM.AMMO_FLARE, 2, 1, 2], [ITEM.FLARE_GUN, 1, 1, 1]],
  [ZONE.CABINS]: [[ITEM.LEATHER, 6, 1, 3], [ITEM.CLOTH, 6, 2, 4], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.HERB, 4, 1, 3], [ITEM.AMMO_SHELLS, 5, 4, 8], [ITEM.POWDER, 4, 2, 6], [ITEM.GUNPARTS, 2, 1, 1], [ITEM.MACHETE, 1, 1, 1], [ITEM.SHOTGUN, 1, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1], [ITEM.AMMO_BOLTS, 3, 2, 5], [ITEM.CROSSBOW, 1, 1, 1], [ITEM.TUNA, 3, 1, 2]],
  [ZONE.MILITARY]: [[ITEM.AMMO_762, 7, 15, 30], [ITEM.PLATE, 4, 1, 1], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.POWDER, 5, 3, 8], [ITEM.WIRE, 4, 1, 3], [ITEM.MEDKIT, 3, 1, 1], [ITEM.PIPEBOMB, 2, 1, 1], [ITEM.GRENADE, 1, 1, 2], [ITEM.SCRAP, 3, 2, 4], [ITEM.AMMO_556, 5, 20, 40], [ITEM.AK47, 1, 1, 1], [ITEM.M4A1, 1, 1, 1], [ITEM.KEVLAR, 1, 1, 1], [ITEM.AMMO_FUEL, 3, 30, 60], [ITEM.FLAMETHROWER, 1, 1, 1], [ITEM.AMMO_ROCKET, 2, 1, 2], [ITEM.RPG, 1, 1, 1], [ITEM.AMMO_145, 2, 2, 4], [ITEM.AT_RIFLE, 1, 1, 1]],
  [ZONE.CHURCH]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.HERB, 5, 1, 3], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.BANDAGE, 4, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.TORCH, 3, 1, 2], [ITEM.AMMO_9MM, 2, 6, 12]],
  [ZONE.CEMETERY]: [[ITEM.CLOTH, 6, 1, 3], [ITEM.TORCH, 4, 1, 2], [ITEM.HERB, 4, 1, 2], [ITEM.ALCOHOL, 3, 1, 1], [ITEM.ROPE, 2, 1, 1], [ITEM.AMMO_SHELLS, 2, 2, 5]],
  [ZONE.MOTEL]: [[ITEM.CLOTH, 7, 2, 4], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.BANDAGE, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.TAPE, 3, 1, 1], [ITEM.CHEM, 3, 1, 1], [ITEM.PISTOL, 1, 1, 1], [ITEM.FLARE, 2, 1, 2], [ITEM.TUNA, 3, 1, 1], [ITEM.ENERGY_DRINK, 3, 1, 2], [ITEM.DECOY, 1, 1, 1]],
  [ZONE.SAWMILL]: [[ITEM.WOOD, 10, 3, 6], [ITEM.NAILS, 8, 6, 12], [ITEM.STICK, 5, 3, 6], [ITEM.ROPE, 3, 1, 2], [ITEM.SCRAP, 4, 1, 3], [ITEM.TAPE, 2, 1, 1], [ITEM.WIRE, 3, 1, 2], [ITEM.HAMMER, 1, 1, 1], [ITEM.MACHETE, 1, 1, 1]],
  [ZONE.TRAILERS]: [[ITEM.CLOTH, 6, 1, 3], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.AMMO_SHELLS, 4, 4, 8], [ITEM.AMMO_9MM, 4, 6, 12], [ITEM.TAPE, 3, 1, 1], [ITEM.SCRAP, 4, 1, 2], [ITEM.PAINKILLERS, 3, 1, 1], [ITEM.BAT, 1, 1, 1], [ITEM.MOLOTOV, 1, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1], [ITEM.TUNA, 4, 1, 2], [ITEM.ENERGY_DRINK, 3, 1, 1], [ITEM.DECOY, 1, 1, 1]],
  [ZONE.VILLAGE]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.BANDAGE, 4, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.AMMO_9MM, 5, 8, 16], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.TAPE, 3, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.CHEM, 3, 1, 2], [ITEM.HERB, 2, 1, 2], [ITEM.FLARE, 2, 1, 2], [ITEM.PISTOL, 1, 1, 1], [ITEM.SHOTGUN, 1, 1, 1], [ITEM.MP5, 1, 1, 1], [ITEM.TUNA, 3, 1, 2], [ITEM.ENERGY_DRINK, 3, 1, 2], [ITEM.DECOY, 1, 1, 1]],
  [ZONE.CLINIC]: [[ITEM.BANDAGE, 7, 1, 3], [ITEM.PAINKILLERS, 6, 1, 2], [ITEM.MEDKIT, 4, 1, 1], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.CLOTH, 5, 2, 4], [ITEM.HERB, 2, 1, 2], [ITEM.BATTERY, 3, 1, 2], [ITEM.TAPE, 2, 1, 1]],
  [ZONE.CAMPGROUND]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.ROPE, 5, 1, 2], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.HERB, 4, 1, 3], [ITEM.STICK, 4, 2, 5], [ITEM.BATTERY, 3, 1, 1], [ITEM.FLARE, 3, 1, 2], [ITEM.BANDAGE, 3, 1, 2], [ITEM.AMMO_SHELLS, 2, 4, 6], [ITEM.KNIFE, 1, 1, 1], [ITEM.AMMO_BOLTS, 2, 2, 4], [ITEM.TUNA, 4, 1, 2], [ITEM.ENERGY_DRINK, 2, 1, 1]],
  [ZONE.CHECKPOINT]: [[ITEM.AMMO_762, 6, 15, 30], [ITEM.AMMO_9MM, 5, 10, 20], [ITEM.WIRE, 5, 1, 3], [ITEM.POWDER, 4, 2, 6], [ITEM.MEDKIT, 2, 1, 1], [ITEM.PLATE, 2, 1, 1], [ITEM.GUNPARTS, 3, 1, 1], [ITEM.FLARE, 3, 1, 2], [ITEM.PIPEBOMB, 1, 1, 1], [ITEM.GRENADE, 1, 1, 1], [ITEM.JACKET, 1, 1, 1], [ITEM.AMMO_556, 5, 15, 30], [ITEM.M4A1, 1, 1, 1], [ITEM.MP5, 1, 1, 1], [ITEM.AMMO_FUEL, 2, 20, 40], [ITEM.AMMO_145, 1, 2, 3], [ITEM.ENERGY_DRINK, 2, 1, 2], [ITEM.AMMO_FLARE, 2, 1, 2], [ITEM.FLARE_GUN, 1, 1, 1]],
  [ZONE.STATION]: [[ITEM.SCRAP, 7, 2, 4], [ITEM.NAILS, 5, 4, 10], [ITEM.WOOD, 5, 2, 4], [ITEM.ROPE, 4, 1, 2], [ITEM.TAPE, 3, 1, 2], [ITEM.BATTERY, 3, 1, 2], [ITEM.CHEM, 3, 1, 2], [ITEM.AMMO_9MM, 3, 8, 16], [ITEM.FLARE, 3, 1, 2], [ITEM.TUNA, 2, 1, 2], [ITEM.HAMMER, 1, 1, 1], [ITEM.ENERGY_DRINK, 2, 1, 1]],
  [ZONE.QUARRY]: [[ITEM.SCRAP, 8, 2, 4], [ITEM.POWDER, 6, 3, 8], [ITEM.CHEM, 4, 1, 2], [ITEM.WIRE, 4, 1, 2], [ITEM.TAPE, 3, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.BATTERY, 3, 1, 2], [ITEM.HAMMER, 1, 1, 1], [ITEM.AMMO_FUEL, 2, 20, 40]],
  [ZONE.RELAY]: [[ITEM.BATTERY, 6, 1, 2], [ITEM.WIRE, 5, 1, 3], [ITEM.SCRAP, 5, 1, 3], [ITEM.TAPE, 4, 1, 2], [ITEM.GUNPARTS, 3, 1, 1], [ITEM.AMMO_308, 3, 3, 6], [ITEM.AMMO_556, 2, 10, 20], [ITEM.CHEM, 3, 1, 2], [ITEM.FLARE, 2, 1, 2], [ITEM.AMMO_FLARE, 2, 1, 2]],
  [ZONE.ROADSIDE]: [[ITEM.SCRAP, 6, 1, 2], [ITEM.CLOTH, 8, 2, 3], [ITEM.TAPE, 3, 1, 1], [ITEM.ALCOHOL, 3, 1, 1], [ITEM.BATTERY, 3, 1, 1], [ITEM.AMMO_9MM, 4, 6, 12], [ITEM.AMMO_SHELLS, 2, 3, 6], [ITEM.BANDAGE, 3, 1, 1], [ITEM.PAINKILLERS, 2, 1, 1], [ITEM.NAILS, 3, 3, 8], [ITEM.FLARE, 2, 1, 1], [ITEM.CHEM, 2, 1, 1], [ITEM.TUNA, 2, 1, 1], [ITEM.ENERGY_DRINK, 2, 1, 1]],
  [ZONE.FAIR]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.TUNA, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.TAPE, 3, 1, 2], [ITEM.SCRAP, 4, 1, 3], [ITEM.ROPE, 3, 1, 2], [ITEM.FLARE, 3, 1, 2], [ITEM.AMMO_FUEL, 3, 20, 40], [ITEM.PAINKILLERS, 2, 1, 1], [ITEM.BAT, 1, 1, 1], [ITEM.ENERGY_DRINK, 4, 1, 2]],
  [ZONE.SCRAPYARD]: [[ITEM.SCRAP, 10, 2, 5], [ITEM.WIRE, 5, 1, 3], [ITEM.TAPE, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.CHEM, 3, 1, 2], [ITEM.PLATE, 1, 1, 1], [ITEM.GUNPARTS, 1, 1, 1], [ITEM.ALCOHOL, 2, 1, 1], [ITEM.HAMMER, 1, 1, 1], [ITEM.BAT, 1, 1, 1]],
  [ZONE.SUMMERCAMP]: [[ITEM.CLOTH, 7, 2, 4], [ITEM.BANDAGE, 5, 1, 2], [ITEM.ROPE, 4, 1, 2], [ITEM.HERB, 4, 1, 3], [ITEM.STICK, 3, 2, 5], [ITEM.FLARE, 3, 1, 2], [ITEM.BATTERY, 3, 1, 2], [ITEM.PAINKILLERS, 3, 1, 2], [ITEM.AMMO_BOLTS, 4, 2, 5], [ITEM.TUNA, 5, 1, 2], [ITEM.KNIFE, 1, 1, 1], [ITEM.CROSSBOW, 1, 1, 1], [ITEM.MEDKIT, 1, 1, 1], [ITEM.NUNCHAKU, 1, 1, 1]],
  [ZONE.MINE]: [[ITEM.POWDER, 8, 3, 8], [ITEM.SCRAP, 6, 2, 4], [ITEM.WIRE, 5, 1, 3], [ITEM.NAILS, 4, 4, 10], [ITEM.BATTERY, 4, 1, 2], [ITEM.ROPE, 3, 1, 2], [ITEM.TAPE, 3, 1, 2], [ITEM.CHEM, 3, 1, 2], [ITEM.FLARE, 3, 1, 2], [ITEM.TORCH, 2, 1, 2], [ITEM.PIPEBOMB, 1, 1, 1], [ITEM.HAMMER, 1, 1, 1]],
  [ZONE.LODGE]: [[ITEM.LEATHER, 6, 1, 3], [ITEM.AMMO_308, 5, 3, 6], [ITEM.AMMO_SHELLS, 5, 4, 8], [ITEM.AMMO_BOLTS, 3, 2, 5], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.TUNA, 4, 1, 2], [ITEM.GUNPARTS, 3, 1, 1], [ITEM.ROPE, 3, 1, 2], [ITEM.HERB, 3, 1, 2], [ITEM.POWDER, 3, 2, 5], [ITEM.JACKET, 1, 1, 1], [ITEM.MACHETE, 1, 1, 1], [ITEM.HUNTING_RIFLE, 1, 1, 1], [ITEM.CROSSBOW, 1, 1, 1]],
  [ZONE.DRIVEIN]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.TUNA, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.TAPE, 4, 1, 2], [ITEM.SCRAP, 4, 1, 3], [ITEM.PAINKILLERS, 3, 1, 2], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.CHEM, 3, 1, 2], [ITEM.FLARE, 2, 1, 2], [ITEM.BAT, 1, 1, 1], [ITEM.PISTOL, 1, 1, 1], [ITEM.ENERGY_DRINK, 4, 1, 2]],
  // The mainland (act 2). The island is looted by about night 3: this is where the run restocks, so its tables are
  // heavier on ammunition, medicine and gun parts than the island's places. First-pass numbers, not played.
  [ZONE.BRIDGEHEAD]: [[ITEM.CLOTH, 6, 2, 3], [ITEM.STICK, 3, 2, 4], [ITEM.WOOD, 4, 2, 4], [ITEM.NAILS, 3, 4, 8], [ITEM.AMMO_9MM, 3, 8, 14], [ITEM.BANDAGE, 2, 1, 1]],
  [ZONE.CITY]: [[ITEM.AMMO_9MM, 6, 10, 20], [ITEM.AMMO_SHELLS, 4, 4, 8], [ITEM.AMMO_556, 3, 15, 30], [ITEM.AMMO_762, 3, 15, 30], [ITEM.BANDAGE, 5, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.TUNA, 5, 1, 2], [ITEM.ENERGY_DRINK, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.TAPE, 4, 1, 2], [ITEM.CLOTH, 5, 2, 4], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.CHEM, 3, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.GUNPARTS, 3, 1, 2], [ITEM.POWDER, 4, 3, 6], [ITEM.FLARE, 2, 1, 2], [ITEM.DECOY, 1, 1, 1], [ITEM.PISTOL, 1, 1, 1], [ITEM.MP5, 1, 1, 1], [ITEM.SHOTGUN, 1, 1, 1]],
  [ZONE.SUBURB]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.TUNA, 5, 1, 2], [ITEM.BANDAGE, 4, 1, 2], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.AMMO_SHELLS, 4, 4, 8], [ITEM.AMMO_308, 2, 3, 6], [ITEM.NAILS, 4, 4, 10], [ITEM.WOOD, 3, 2, 4], [ITEM.TAPE, 3, 1, 2], [ITEM.HERB, 3, 1, 2], [ITEM.POWDER, 3, 2, 4], [ITEM.BAT, 1, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1], [ITEM.HUNTING_RIFLE, 1, 1, 1]],
  [ZONE.INDUSTRIAL]: [[ITEM.SCRAP, 9, 2, 5], [ITEM.NAILS, 6, 6, 14], [ITEM.WIRE, 5, 1, 3], [ITEM.TAPE, 5, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.POWDER, 5, 3, 8], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.PLATE, 2, 1, 1], [ITEM.BATTERY, 3, 1, 2], [ITEM.ROPE, 3, 1, 2], [ITEM.AMMO_FUEL, 3, 30, 60], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.HAMMER, 1, 1, 1], [ITEM.MACHETE, 1, 1, 1]],
  [ZONE.TERMINAL]: [[ITEM.BANDAGE, 5, 1, 2], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.TUNA, 5, 1, 2], [ITEM.ENERGY_DRINK, 5, 1, 2], [ITEM.BATTERY, 5, 1, 2], [ITEM.CLOTH, 4, 2, 4], [ITEM.ALCOHOL, 3, 1, 2], [ITEM.AMMO_9MM, 5, 10, 20], [ITEM.AMMO_556, 3, 15, 30], [ITEM.FLARE, 3, 1, 2], [ITEM.AMMO_FLARE, 3, 1, 3], [ITEM.TAPE, 3, 1, 2], [ITEM.FLARE_GUN, 1, 1, 1], [ITEM.JACKET, 1, 1, 1]],
  [ZONE.HANGARS]: [[ITEM.SCRAP, 7, 2, 4], [ITEM.TAPE, 5, 1, 2], [ITEM.WIRE, 4, 1, 3], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.BATTERY, 4, 1, 2], [ITEM.AMMO_556, 5, 15, 30], [ITEM.AMMO_762, 4, 15, 30], [ITEM.AMMO_FUEL, 3, 30, 60], [ITEM.PLATE, 2, 1, 1], [ITEM.POWDER, 3, 3, 6], [ITEM.FLARE, 3, 1, 2], [ITEM.MEDKIT, 1, 1, 1]],
  [ZONE.FUEL_DEPOT]: [[ITEM.AMMO_FUEL, 7, 30, 60], [ITEM.CHEM, 6, 1, 3], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.TAPE, 4, 1, 2], [ITEM.SCRAP, 5, 2, 4], [ITEM.CLOTH, 4, 2, 3], [ITEM.FLARE, 3, 1, 2], [ITEM.BATTERY, 3, 1, 2], [ITEM.MOLOTOV, 2, 1, 1], [ITEM.AMMO_9MM, 3, 8, 16]],
  [ZONE.TRUCKSTOP]: [[ITEM.TUNA, 6, 1, 2], [ITEM.ENERGY_DRINK, 6, 1, 2], [ITEM.SCRAP, 5, 1, 3], [ITEM.TAPE, 4, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.AMMO_9MM, 4, 8, 16], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.PAINKILLERS, 3, 1, 2], [ITEM.POWDER, 3, 2, 4], [ITEM.AMMO_FUEL, 3, 20, 40], [ITEM.PISTOL, 1, 1, 1]],
  // the places out over the plain: each is worth the walk for something of its own (first-pass numbers, not played)
  // medicine, behind the wire
  [ZONE.QUARANTINE]: [[ITEM.BANDAGE, 8, 1, 3], [ITEM.MEDKIT, 4, 1, 1], [ITEM.PAINKILLERS, 6, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.CLOTH, 5, 2, 4], [ITEM.TUNA, 4, 1, 2], [ITEM.BATTERY, 3, 1, 2], [ITEM.AMMO_556, 3, 15, 30], [ITEM.JACKET, 1, 1, 1]],
  // the army's ammunition
  [ZONE.ROADBLOCK]: [[ITEM.AMMO_556, 7, 20, 40], [ITEM.AMMO_762, 6, 15, 30], [ITEM.AMMO_9MM, 4, 10, 20], [ITEM.WIRE, 4, 1, 3], [ITEM.PLATE, 3, 1, 1], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.GRENADE, 2, 1, 1], [ITEM.FLARE, 3, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.M4A1, 1, 1, 1], [ITEM.AMMO_145, 1, 2, 3]],
  // wire, batteries and scrap: what a generator and its floodlights are built of
  [ZONE.SUBSTATION]: [[ITEM.WIRE, 8, 1, 3], [ITEM.BATTERY, 7, 1, 3], [ITEM.SCRAP, 6, 2, 4], [ITEM.TAPE, 5, 1, 2], [ITEM.GUNPARTS, 2, 1, 1], [ITEM.CHEM, 3, 1, 2], [ITEM.NAILS, 3, 4, 10]],
  [ZONE.WATERWORKS]: [[ITEM.CHEM, 7, 1, 3], [ITEM.SCRAP, 6, 2, 4], [ITEM.TAPE, 5, 1, 2], [ITEM.ROPE, 4, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.BATTERY, 3, 1, 2], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.HAMMER, 1, 1, 1]],
  [ZONE.MARINA]: [[ITEM.ROPE, 7, 1, 3], [ITEM.AMMO_FLARE, 5, 1, 3], [ITEM.FLARE, 4, 1, 2], [ITEM.TUNA, 6, 1, 3], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.TAPE, 4, 1, 2], [ITEM.AMMO_FUEL, 4, 20, 40], [ITEM.BATTERY, 3, 1, 2], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.FLARE_GUN, 1, 1, 1], [ITEM.CROSSBOW, 1, 1, 1]],
  [ZONE.TRAILERPARK]: [[ITEM.CLOTH, 6, 1, 3], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.AMMO_SHELLS, 6, 4, 8], [ITEM.AMMO_9MM, 4, 6, 12], [ITEM.TUNA, 5, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.POWDER, 4, 2, 4], [ITEM.PAINKILLERS, 3, 1, 1], [ITEM.MOLOTOV, 2, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1], [ITEM.BAT, 1, 1, 1]],
  [ZONE.SALVAGE]: [[ITEM.SCRAP, 10, 2, 5], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.WIRE, 5, 1, 3], [ITEM.TAPE, 4, 1, 2], [ITEM.BATTERY, 4, 1, 2], [ITEM.NAILS, 4, 4, 10], [ITEM.PLATE, 2, 1, 1], [ITEM.AMMO_FUEL, 3, 20, 40], [ITEM.SPIKED_BAT, 1, 1, 1]],
  // a bit of everything, by the shelf
  [ZONE.MALL]: [[ITEM.TUNA, 7, 1, 3], [ITEM.ENERGY_DRINK, 6, 1, 3], [ITEM.CLOTH, 6, 2, 4], [ITEM.BATTERY, 6, 1, 3], [ITEM.TAPE, 5, 1, 2], [ITEM.BANDAGE, 5, 1, 2], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.NAILS, 5, 6, 14], [ITEM.ROPE, 3, 1, 2], [ITEM.AMMO_SHELLS, 4, 4, 8], [ITEM.AMMO_9MM, 4, 10, 20], [ITEM.AMMO_308, 3, 3, 6], [ITEM.POWDER, 4, 3, 6], [ITEM.BAT, 1, 1, 1], [ITEM.MACHETE, 1, 1, 1], [ITEM.HUNTING_RIFLE, 1, 1, 1], [ITEM.JACKET, 1, 1, 1]],
  [ZONE.SCHOOL]: [[ITEM.CLOTH, 6, 2, 4], [ITEM.BANDAGE, 6, 1, 2], [ITEM.TUNA, 6, 1, 2], [ITEM.ENERGY_DRINK, 4, 1, 2], [ITEM.BATTERY, 5, 1, 2], [ITEM.TAPE, 5, 1, 2], [ITEM.PAINKILLERS, 4, 1, 2], [ITEM.CHEM, 3, 1, 2], [ITEM.MEDKIT, 1, 1, 1], [ITEM.BAT, 1, 1, 1], [ITEM.NUNCHAKU, 1, 1, 1]],
  [ZONE.MAST]: [[ITEM.BATTERY, 7, 1, 3], [ITEM.WIRE, 6, 1, 3], [ITEM.GUNPARTS, 4, 1, 2], [ITEM.AMMO_308, 5, 3, 6], [ITEM.AMMO_556, 3, 10, 20], [ITEM.TAPE, 4, 1, 2], [ITEM.FLARE, 3, 1, 2], [ITEM.AMMO_FLARE, 3, 1, 3], [ITEM.HUNTING_RIFLE, 1, 1, 1]],
  [ZONE.MOTORINN]: [[ITEM.CLOTH, 7, 2, 4], [ITEM.ALCOHOL, 6, 1, 2], [ITEM.PAINKILLERS, 5, 1, 2], [ITEM.BANDAGE, 5, 1, 2], [ITEM.AMMO_9MM, 5, 8, 16], [ITEM.BATTERY, 4, 1, 2], [ITEM.TUNA, 4, 1, 2], [ITEM.ENERGY_DRINK, 3, 1, 2], [ITEM.POWDER, 3, 2, 4], [ITEM.PISTOL, 1, 1, 1], [ITEM.MP5, 1, 1, 1], [ITEM.DECOY, 1, 1, 1]],
  [ZONE.GRAVEYARD]: [[ITEM.CLOTH, 6, 1, 3], [ITEM.TORCH, 5, 1, 2], [ITEM.HERB, 5, 1, 3], [ITEM.ALCOHOL, 3, 1, 1], [ITEM.ROPE, 3, 1, 1], [ITEM.AMMO_SHELLS, 3, 3, 6], [ITEM.MEDKIT, 1, 1, 1]],
  [ZONE.LOGGING]: [[ITEM.WOOD, 10, 3, 6], [ITEM.STICK, 6, 3, 6], [ITEM.NAILS, 7, 6, 12], [ITEM.ROPE, 5, 1, 2], [ITEM.AMMO_FUEL, 4, 20, 40], [ITEM.LEATHER, 3, 1, 2], [ITEM.AMMO_308, 3, 3, 6], [ITEM.MACHETE, 1, 1, 1], [ITEM.HAMMER, 1, 1, 1]],
  // what two hundred people were carrying
  [ZONE.CRASH]: [[ITEM.CLOTH, 8, 2, 4], [ITEM.PAINKILLERS, 6, 1, 2], [ITEM.BANDAGE, 5, 1, 2], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.BATTERY, 5, 1, 2], [ITEM.TUNA, 4, 1, 2], [ITEM.ENERGY_DRINK, 4, 1, 2], [ITEM.TAPE, 3, 1, 1], [ITEM.MEDKIT, 2, 1, 1], [ITEM.AMMO_9MM, 3, 8, 16], [ITEM.FLARE, 3, 1, 2], [ITEM.PISTOL, 1, 1, 1], [ITEM.KEVLAR, 1, 1, 1]],
  [ZONE.CONTAINERS]: [[ITEM.SCRAP, 7, 2, 4], [ITEM.NAILS, 6, 6, 14], [ITEM.WOOD, 5, 2, 5], [ITEM.TAPE, 5, 1, 2], [ITEM.ROPE, 4, 1, 2], [ITEM.TUNA, 5, 1, 3], [ITEM.CHEM, 4, 1, 2], [ITEM.POWDER, 4, 3, 6], [ITEM.WIRE, 3, 1, 3], [ITEM.GUNPARTS, 3, 1, 1], [ITEM.PLATE, 1, 1, 1]],
};
LOOT_TABLES[ZONE.WESTGATE] = LOOT_TABLES[ZONE.SUBURB]; // (houses are houses)
// (the third pass's places: each has what a place like it has)
LOOT_TABLES[ZONE.BOATWORKS] = LOOT_TABLES[ZONE.MARINA];
LOOT_TABLES[ZONE.DRIVEIN_M] = LOOT_TABLES[ZONE.DRIVEIN];
LOOT_TABLES[ZONE.FIREHOUSE] = LOOT_TABLES[ZONE.TERMINAL];
LOOT_TABLES[ZONE.GRAIN] = LOOT_TABLES[ZONE.BARN];
LOOT_TABLES[ZONE.DINER_M] = LOOT_TABLES[ZONE.TRUCKSTOP];
LOOT_TABLES[ZONE.CARLOT] = LOOT_TABLES[ZONE.SALVAGE];
LOOT_TABLES[ZONE.STORAGE] = LOOT_TABLES[ZONE.CONTAINERS];
LOOT_TABLES[ZONE.EVAC] = LOOT_TABLES[ZONE.QUARANTINE];
LOOT_TABLES[ZONE.NURSERY] = LOOT_TABLES[ZONE.BARN];
LOOT_TABLES[ZONE.MOTORPOOL] = LOOT_TABLES[ZONE.HELIPAD] = LOOT_TABLES[ZONE.ROADBLOCK];
LOOT_TABLES[ZONE.AGGREGATES] = LOOT_TABLES[ZONE.INDUSTRIAL];
LOOT_TABLES[ZONE.FARM_A] = LOOT_TABLES[ZONE.FARM_B] = LOOT_TABLES[ZONE.BARN];
// (Layout 12's own places, issue #232)
LOOT_TABLES[ZONE.NORTH_COAST] = LOOT_TABLES[ZONE.SUBURB];
LOOT_TABLES[ZONE.OUTPOST] = LOOT_TABLES[ZONE.ROADBLOCK];
LOOT_TABLES[ZONE.SOUTH_FOREST] = LOOT_TABLES[ZONE.CAMPGROUND];
LOOT_TABLES[ZONE.PASSAGE] = LOOT_TABLES[ZONE.MINE];
LOOT_TABLES[ZONE.LIGHTHOUSE] = LOOT_TABLES[ZONE.MARINA];

// ---------------------------------------------------------------- searchable containers
// Every place (and many roadside / woodland sites) has containers: hold [E] to search.
// table: loot table (null = the zone's table), rolls: [min, max] items, schem: may hold a schematic on top of its loot.
export const CONT = uniqueIds('CONT', {
  CRATE: 1,
  AMMO_BOX: 2,
  TRUNK: 3,
  DUFFEL: 4,
  LOCKER: 5,
  CABINET: 6,
  TOOLBOX: 7,
  SHELF: 8,
  DUMPSTER: 9,
  LOGPILE: 10,
  FRIDGE: 11,
  STRONGBOX: 12,
  FREIGHT: 13,
  CASKET: 15,
  // Mercy Clinic's own (shared/clinic.js): the cabinets of its pharmacy and wards, and the one drug locker of a map
  MEDICINE: 16,
  DRUG_LOCKER: 17,
});
// A place's own table only reaches its floor loot, crates and shelves, so whatever a recipe or an ammo type depends on
// needs a container table too: ammo crates hold the AK-47 next to the 7.62 they are full of (as rare as the M4A1) and
// kevlar plates by the pair (a vest takes two), trunks and duffels hold leather. A new entry thins every other one in
// its table, so these went in at weight 1 and the plates grew in count, not in weight. First-pass numbers. A pack of
// Dead Hand cards (ITEM.CARD_PACK: shared/cards.js) is in the bags, lockers, trunks and cabinets people kept their
// things in, at weight 1; a sealed pack is always in the mine's strongbox (its `also`) and on a boss half the time
// (BOSS_PACK_CHANCE).
export const CONT_TABLES = {
  military: [[ITEM.AMMO_762, 6, 15, 30], [ITEM.AMMO_556, 5, 15, 30], [ITEM.AMMO_9MM, 4, 10, 20], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.POWDER, 4, 3, 6], [ITEM.PLATE, 2, 2, 2], [ITEM.GUNPARTS, 3, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.PIPEBOMB, 1, 1, 1], [ITEM.GRENADE, 1, 1, 1], [ITEM.FLARE, 3, 1, 2], [ITEM.WIRE, 2, 1, 2], [ITEM.M4A1, 1, 1, 1], [ITEM.AK47, 1, 1, 1], [ITEM.AMMO_FUEL, 2, 30, 60], [ITEM.FLAMETHROWER, 1, 1, 1], [ITEM.AMMO_ROCKET, 1, 1, 2], [ITEM.RPG, 1, 1, 1], [ITEM.AMMO_145, 2, 2, 4], [ITEM.AT_RIFLE, 1, 1, 1], [ITEM.AMMO_FLARE, 2, 1, 3], [ITEM.FLARE_GUN, 1, 1, 1]],
  trunk: [[ITEM.SCRAP, 5, 1, 2], [ITEM.TAPE, 4, 1, 1], [ITEM.BATTERY, 3, 1, 1], [ITEM.CLOTH, 7, 2, 3], [ITEM.ALCOHOL, 3, 1, 1], [ITEM.FLARE, 4, 1, 2], [ITEM.AMMO_9MM, 3, 6, 12], [ITEM.AMMO_SHELLS, 2, 3, 6], [ITEM.ROPE, 2, 1, 1], [ITEM.NAILS, 2, 3, 6], [ITEM.BAT, 1, 1, 1], [ITEM.TUNA, 2, 1, 1], [ITEM.LEATHER, 1, 1, 2], [ITEM.ENERGY_DRINK, 2, 1, 1], [ITEM.AMMO_FLARE, 1, 1, 2], [ITEM.CARD_PACK, 1, 1, 1]],
  duffel: [[ITEM.BANDAGE, 5, 1, 2], [ITEM.CLOTH, 7, 2, 3], [ITEM.AMMO_9MM, 5, 8, 16], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.PAINKILLERS, 3, 1, 1], [ITEM.BATTERY, 3, 1, 1], [ITEM.MOLOTOV, 2, 1, 1], [ITEM.FLARE, 2, 1, 1], [ITEM.MEDKIT, 1, 1, 1], [ITEM.KNIFE, 1, 1, 1], [ITEM.JACKET, 1, 1, 1], [ITEM.TUNA, 3, 1, 1], [ITEM.LEATHER, 1, 1, 2], [ITEM.ENERGY_DRINK, 2, 1, 1], [ITEM.NUNCHAKU, 1, 1, 1], [ITEM.CARD_PACK, 1, 1, 1]],
  locker: [[ITEM.AMMO_9MM, 4, 10, 20], [ITEM.AMMO_308, 3, 3, 6], [ITEM.AMMO_SHELLS, 3, 4, 8], [ITEM.GUNPARTS, 4, 1, 1], [ITEM.JACKET, 2, 1, 1], [ITEM.BATTERY, 3, 1, 2], [ITEM.BANDAGE, 3, 1, 2], [ITEM.FLARE, 2, 1, 2], [ITEM.PISTOL, 1, 1, 1], [ITEM.MP5, 1, 1, 1], [ITEM.ENERGY_DRINK, 2, 1, 1], [ITEM.AMMO_FLARE, 1, 1, 2], [ITEM.CARD_PACK, 1, 1, 1]],
  cabinet: [[ITEM.BANDAGE, 5, 1, 2], [ITEM.PAINKILLERS, 5, 1, 2], [ITEM.ALCOHOL, 5, 1, 2], [ITEM.CHEM, 4, 1, 2], [ITEM.HERB, 3, 1, 2], [ITEM.CLOTH, 4, 1, 3], [ITEM.MEDKIT, 1, 1, 1], [ITEM.BATTERY, 2, 1, 1], [ITEM.TUNA, 3, 1, 2], [ITEM.CARD_PACK, 1, 1, 1]],
  toolbox: [[ITEM.NAILS, 8, 6, 14], [ITEM.SCRAP, 5, 1, 3], [ITEM.TAPE, 5, 1, 2], [ITEM.WIRE, 3, 1, 2], [ITEM.GUNPARTS, 1, 1, 1], [ITEM.HAMMER, 1, 1, 1]],
  dumpster: [[ITEM.CLOTH, 8, 2, 4], [ITEM.SCRAP, 5, 1, 2], [ITEM.CHEM, 3, 1, 1], [ITEM.ALCOHOL, 3, 1, 1], [ITEM.STICK, 3, 2, 4], [ITEM.TAPE, 2, 1, 1], [ITEM.BATTERY, 1, 1, 1]],
  logpile: [[ITEM.WOOD, 8, 3, 6], [ITEM.STICK, 5, 3, 6], [ITEM.NAILS, 2, 3, 6]],
  fridge: [[ITEM.ALCOHOL, 6, 1, 2], [ITEM.CHEM, 3, 1, 1], [ITEM.HERB, 3, 1, 2], [ITEM.PAINKILLERS, 2, 1, 1], [ITEM.BANDAGE, 2, 1, 1], [ITEM.TUNA, 5, 1, 2], [ITEM.ENERGY_DRINK, 4, 1, 2]],
  // the one strongbox of a map, in the deepest room of the mine: one roll, and every row is a gun worth the trip
  strongbox: [[ITEM.M4A1, 1, 1, 1], [ITEM.AK47, 1, 1, 1], [ITEM.FLAMETHROWER, 1, 1, 1], [ITEM.RPG, 1, 1, 1], [ITEM.AT_RIFLE, 1, 1, 1]],
  // the casket in the crypt of St. Agnes Cemetery: what somebody who meant to sit the nights out in there left behind
  crypt: [[ITEM.AMMO_SHELLS, 5, 4, 8], [ITEM.TORCH, 4, 2, 3], [ITEM.FLARE, 3, 1, 2], [ITEM.ALCOHOL, 3, 1, 2], [ITEM.BANDAGE, 3, 1, 2], [ITEM.MEDKIT, 2, 1, 1], [ITEM.GUNPARTS, 2, 1, 1], [ITEM.DB_SHOTGUN, 1, 1, 1]],
  // freight that never got where it was going (the boxcars of the stalled train, the depot's freight shed): what a
  // shelter is built of, by the crate
  freight: [[ITEM.WOOD, 8, 3, 6], [ITEM.NAILS, 7, 6, 14], [ITEM.SCRAP, 6, 2, 4], [ITEM.ROPE, 4, 1, 2], [ITEM.TAPE, 4, 1, 2], [ITEM.WIRE, 3, 1, 3], [ITEM.TUNA, 4, 1, 3], [ITEM.CHEM, 3, 1, 2], [ITEM.POWDER, 3, 2, 5], [ITEM.BATTERY, 3, 1, 2], [ITEM.ALCOHOL, 2, 1, 2], [ITEM.GUNPARTS, 1, 1, 1]],
  // what a clinic keeps under lock: the one table where a medkit is a likely find and not a lucky one
  medical: [[ITEM.BANDAGE, 7, 1, 3], [ITEM.PAINKILLERS, 6, 1, 2], [ITEM.MEDKIT, 4, 1, 1], [ITEM.ALCOHOL, 4, 1, 2], [ITEM.CHEM, 3, 1, 2]],
};
export const CONT_DEFS = {
  [CONT.CRATE]: { name: 'Crate', table: null, rolls: [2, 3] },
  [CONT.AMMO_BOX]: { name: 'Ammo Crate', table: 'military', rolls: [2, 3], schem: true },
  [CONT.TRUNK]: { name: 'Car Trunk', table: 'trunk', rolls: [1, 3] },
  [CONT.DUFFEL]: { name: 'Duffel Bag', table: 'duffel', rolls: [2, 3] },
  [CONT.LOCKER]: { name: 'Locker', table: 'locker', rolls: [2, 3], schem: true },
  [CONT.CABINET]: { name: 'Cabinet', table: 'cabinet', rolls: [1, 3] },
  [CONT.TOOLBOX]: { name: 'Toolbox', table: 'toolbox', rolls: [2, 3], schem: true },
  [CONT.SHELF]: { name: 'Shelves', table: null, rolls: [1, 3] },
  [CONT.DUMPSTER]: { name: 'Dumpster', table: 'dumpster', rolls: [1, 2] },
  [CONT.LOGPILE]: { name: 'Log Pile', table: 'logpile', rolls: [1, 2] },
  [CONT.FRIDGE]: { name: 'Fridge', table: 'fridge', rolls: [1, 2] },
  // also: what is always in it besides the rolls, [item, count]. loaded: a weapon rolled from it comes with this many
  // magazines of its ammunition (loadedAmmo). once: it is not refilled at sunrise. guide: what the item tooltips call
  // it as a place to find things (there is one to a map, so not "strongboxes").
  [CONT.STRONGBOX]: { name: 'Strongbox', table: 'strongbox', rolls: [1, 1], also: [[ITEM.PIPEBOMB, 2], [ITEM.SEALED_PACK, 1]], loaded: 2, once: true, guide: "the mine's strongbox" },
  [CONT.CASKET]: { name: 'Casket', table: 'crypt', rolls: [3, 4], guide: 'the casket in the crypt' },
  [CONT.FREIGHT]: { name: 'Freight Crate', table: 'freight', rolls: [2, 4] },
  // Mercy Clinic. The drug locker stands in its deepest ward and is filled once a game, as the strongbox is: what makes
  // the walk into the dark worth it
  [CONT.MEDICINE]: { name: 'Medicine Cabinet', table: 'medical', rolls: [2, 3] },
  [CONT.DRUG_LOCKER]: { name: 'Drug Locker', table: 'medical', rolls: [1, 1], also: [[ITEM.MEDKIT, 2], [ITEM.PAINKILLERS, 3], [ITEM.BANDAGE, 4]], once: true, guide: "the clinic's drug locker" },
};
// the ammunition that comes with weapon `item` out of a container whose weapons are loaded: [ammo item, count], or
// null for anything that takes none
export function loadedAmmo(item, mags) {
  const w = WEAPONS[item];
  return w && !w.melee && w.mag > 0 && AMMO_ITEMS[w.ammo] !== undefined ? [AMMO_ITEMS[w.ammo], w.mag * mags] : null;
}

// zombie loot drops: [item, weight, min, max]
export const ZOMBIE_LOOT = [[ITEM.CLOTH, 8, 1, 2], [ITEM.AMMO_9MM, 5, 4, 10], [ITEM.SCRAP, 3, 1, 1], [ITEM.AMMO_SHELLS, 2, 2, 4], [ITEM.AMMO_762, 2, 6, 15], [ITEM.AMMO_556, 2, 6, 15], [ITEM.HERB, 2, 1, 1], [ITEM.NAILS, 3, 2, 6], [ITEM.BANDAGE, 1, 1, 1], [ITEM.POWDER, 4, 1, 3], [ITEM.BATTERY, 1, 1, 1]];
export const SPECIAL_LOOT = [[ITEM.AMMO_762, 4, 15, 30], [ITEM.AMMO_556, 4, 15, 30], [ITEM.AMMO_SHELLS, 4, 4, 8], [ITEM.MEDKIT, 2, 1, 1], [ITEM.POWDER, 3, 3, 6], [ITEM.GUNPARTS, 2, 1, 1], [ITEM.PLATE, 1, 1, 1], [ITEM.TAPE, 3, 1, 2], [ITEM.CHEM, 2, 1, 2], [ITEM.AMMO_145, 1, 1, 3], [ITEM.GRENADE, 1, 1, 1]];
// a boss brought down leaves a sealed pack of Dead Hand cards this often, besides its loot (Cards.bossDrop, server/cards.js)
export const BOSS_PACK_CHANCE = 0.5;

// Gunpowder where an ordinary day's looting goes (issue #89). It used to be kept only by the mine, the quarry, the
// military places, the hunters' (lookout, cabins, lodge), ammo crates and freight crates: a day of seven searches in
// three other places found none nine days in ten, whatever POWDER_MORE made of a find. A gun locker is the likeliest
// place for it, a toolbox, a duffel or a car trunk less so; the places get it on their own table (their crates and
// shelves, and what lies about), all but the farm, the woods, the camps, the church, the cemetery and the clinic. The
// dead drop it twice as often too (ZOMBIE_LOOT, weight 2 -> 4). Written like every other row, so POWDER_MORE below
// scales these as well. First-pass numbers.
const POWDER_IN = [
  [CONT_TABLES.locker, 5, 2, 4],
  [CONT_TABLES.toolbox, 3, 2, 3],
  [CONT_TABLES.duffel, 3, 2, 3],
  [CONT_TABLES.trunk, 3, 1, 2],
  [LOOT_TABLES[ZONE.GAS], 4, 2, 3],
  [LOOT_TABLES[ZONE.TRAILERS], 4, 2, 3],
  [LOOT_TABLES[ZONE.VILLAGE], 4, 2, 3],
  [LOOT_TABLES[ZONE.STATION], 4, 2, 3],
  [LOOT_TABLES[ZONE.SCRAPYARD], 4, 2, 3],
  [LOOT_TABLES[ZONE.FAIR], 4, 2, 3],
  [LOOT_TABLES[ZONE.RELAY], 3, 1, 3],
  [LOOT_TABLES[ZONE.DRIVEIN], 3, 1, 3],
  [LOOT_TABLES[ZONE.DOCK], 3, 1, 3],
  [LOOT_TABLES[ZONE.ROADSIDE], 3, 1, 2],
  [LOOT_TABLES[ZONE.MOTEL], 3, 1, 2],
];
for (const [t, weight, min, max] of POWDER_IN) t.push([ITEM.POWDER, weight, min, max]);

// More gunpowder (issue #89: ammunition was too scarce to craft). Every row of it in the tables above - the places',
// the containers', the dead's - gives POWDER_MORE times as much as it was written with: its count, not its weight,
// so no other find in the table gets rarer for it (the low end rounded down, the high end to the nearest, which keeps
// each row's average close to POWDER_MORE times). With the campfire's 6 to a chemical (recipe 19, from 4).
export const POWDER_MORE = 1.5;
for (const t of [...Object.values(LOOT_TABLES), ...Object.values(CONT_TABLES), ZOMBIE_LOOT, SPECIAL_LOOT]) {
  for (const row of t) {
    if (row[0] !== ITEM.POWDER) continue;
    row[2] = Math.floor(row[2] * POWDER_MORE);
    row[3] = Math.round(row[3] * POWDER_MORE);
  }
}
