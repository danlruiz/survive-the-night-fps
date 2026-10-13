// The ids of every item that is not a weapon. Each weapon's id is in its own file (shared/weapons/), and defs.js puts
// the two together into ITEM. Kept apart from defs.js so a weapon's file can name the materials of its recipe and
// salvage without importing defs.js, which imports it.
// Numeric ids are part of the wire protocol - do not renumber.
export const BASE_ITEM = {
  NONE: 0,
  // resources
  WOOD: 1,
  STICK: 2,
  CLOTH: 3,
  SCRAP: 4,
  NAILS: 5,
  ROPE: 6,
  TAPE: 7,
  POWDER: 8,
  CHEM: 9,
  HERB: 10,
  ALCOHOL: 11,
  LEATHER: 12,
  WIRE: 13,
  PLATE: 14,
  GUNPARTS: 15,
  // (16 is no item: the mounted gun's shots and kills carry it as their weapon, MOUNTED_GUN in mountedgun.js)
  STONE: 17, // broken off boulders and the quarry's faces with a melee weapon (Game.gatherHit)
  // consumables
  BANDAGE: 20,
  MEDKIT: 21,
  PAINKILLERS: 22,
  BATTERY: 23,
  TORCH: 24,
  TUNA: 25,
  // throwables
  MOLOTOV: 30,
  PIPEBOMB: 31,
  FLARE: 32,
  GRENADE: 33,
  DECOY: 34,
  // armor
  JACKET: 40,
  KEVLAR: 41,
  // gear (works from the backpack, just by being carried)
  WALKIE: 45,
  // worn in an equipment slot of its own, like armor: more slots in the backpack grid (INVENTORY_SIZE in constants.js)
  BACKPACK: 46,
  // weapons (50-69): each in a file of its own, shared/weapons/
  // ammunition (carried apart from the backpack, a reserve per calibre: state.ammo, AMMO below)
  AMMO_9MM: 70,
  AMMO_SHELLS: 71,
  AMMO_762: 72,
  AMMO_308: 73,
  AMMO_556: 74,
  AMMO_BOLTS: 75,
  AMMO_FUEL: 76,
  AMMO_ROCKET: 77,
  AMMO_145: 78,
  AMMO_FLARE: 79,
  // car parts (quest)
  CAR_BATTERY: 80,
  SPARE_TIRE: 81,
  SPARK_PLUGS: 82,
  FUEL_CAN: 83,
  FAN_BELT: 84,
  // plane parts (act 2, the mainland: shared/acts.js)
  PROPELLER: 85,
  MAGNETO: 86,
  HYDRAULIC_PUMP: 87,
  FLIGHT_RADIO: 88,
  AVGAS: 89,
  // schematics (picked up -> unlocks recipes for the whole team)
  SCHEM_SHOTGUN: 90,
  SCHEM_RIFLE: 91,
  SCHEM_KEVLAR: 92,
  SCHEM_EXPLOSIVES: 93,
  SCHEM_METAL: 94,
  // the mainland's (shared/vehicles.js): a manual found beside its broken mopeds, and what a workbench makes with it.
  // Nothing of these is on the island: the manual is not among SCHEMATICS (which the island hides in its lockers)
  SCHEM_VEHICLES: 95,
  MOPED_KIT: 96,
  BIKE_KIT: 97,
  // consumables: what a hunted deer gives (shared/deer.js)
  VENISON_RAW: 26,
  VENISON: 27,
  // consumables: refills stamina, with a key of its own (ACTION_KEYS.drink in client/game/input.js)
  ENERGY_DRINK: 28,
  // card packs (Dead Hand, shared/cards.js): opened as they are picked up - the cards go into the finder's collection,
  // which they keep across runs (server/cards.js), and the pack takes no room in the backpack
  CARD_PACK: 98,
  SEALED_PACK: 99,
};
