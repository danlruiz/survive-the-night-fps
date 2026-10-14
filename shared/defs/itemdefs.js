// Items: every item's id (ITEM), what each is (ITEM_DEFS), the ammunition reserves, the weapons' numbers, and what
// throwing, eating or using one does. Numeric ids are part of the wire protocol - do not renumber.
import { FLASHLIGHT_MAX, STAMINA_MAX } from '../constants.js';
import { BASE_ITEM } from '../items.js';
import { WEAPON_LIST } from '../weapons/index.js';

// Every item's id: the ones in shared/items.js, with each weapon's (shared/weapons/) put in after the backpack, in id order.
// Two items on one id, or a weapon on a name that is taken, stop the game from loading
export const ITEM = (() => {
  const base = Object.entries(BASE_ITEM);
  const weapons = WEAPON_LIST.map((w) => [w.key, w.id]);
  const at = base.findIndex(([k]) => k === 'BACKPACK') + 1;
  const out = Object.fromEntries([...base.slice(0, at), ...weapons, ...base.slice(at)]);
  const ids = new Map();
  for (const [k, id] of [...base, ...weapons]) {
    if (ids.has(id)) throw new Error(`ITEM.${k} and ITEM.${ids.get(id)} are both item ${id}`);
    ids.set(id, k);
  }
  if (Object.keys(out).length !== ids.size) throw new Error('a weapon in shared/weapons/ is named like an item that is already there');
  return out;
})();

// ammo reserve indices: the rounds of a calibre a survivor carries (state.ammo). Ammunition is not kept in the
// backpack: it is carried apart, in the inventory's Ammunition panel, and goes on the ground from there (ACT.DROP_AMMO)
export const AMMO = { P9: 0, SHELL: 1, R762: 2, R308: 3, R556: 4, BOLT: 5, FUEL: 6, ROCKET: 7, R145: 8, FLARE: 9 };
export const AMMO_NAMES = ['9mm', 'Shells', '7.62', '.308', '5.56', 'Bolts', 'Fuel', 'RPG', '14.5mm', 'Flares'];
// the most of a calibre a survivor carries: a reserve that is full leaves the rest where it lies (also a ground stack's size)
export const AMMO_MAX = [150, 48, 240, 40, 180, 30, 300, 8, 10, 12];
// the item of each reserve index (same order as AMMO)
export const AMMO_ITEMS = [ITEM.AMMO_9MM, ITEM.AMMO_SHELLS, ITEM.AMMO_762, ITEM.AMMO_308, ITEM.AMMO_556, ITEM.AMMO_BOLTS, ITEM.AMMO_FUEL, ITEM.AMMO_ROCKET, ITEM.AMMO_145, ITEM.AMMO_FLARE];

// category: res | cons | throw | armor | pack | gear | weapon | ammo | part | schem | card
export const ITEM_DEFS = {
  [ITEM.WOOD]: { name: 'Planks', cat: 'res', stack: 20, color: 0x8a6a45, desc: 'Weathered wooden planks.' },
  [ITEM.STICK]: { name: 'Sticks', cat: 'res', stack: 20, color: 0x6b5236, desc: 'Dry branches.' },
  [ITEM.CLOTH]: { name: 'Cloth', cat: 'res', stack: 20, color: 0xb8ad94, desc: 'Torn fabric scraps.' },
  [ITEM.SCRAP]: { name: 'Scrap Metal', cat: 'res', stack: 20, color: 0x7a7d80, desc: 'Rusty sheet metal.' },
  [ITEM.NAILS]: { name: 'Nails', cat: 'res', stack: 60, color: 0x9a9fa3, desc: 'A handful of bent nails.' },
  [ITEM.ROPE]: { name: 'Rope', cat: 'res', stack: 10, color: 0xa08a5a, desc: 'Coarse hemp rope.' },
  [ITEM.TAPE]: { name: 'Duct Tape', cat: 'res', stack: 10, color: 0x9ea3a8, desc: 'Fixes everything.' },
  [ITEM.POWDER]: { name: 'Gunpowder', cat: 'res', stack: 30, color: 0x2e2e2e, desc: 'Black powder.' },
  [ITEM.CHEM]: { name: 'Chemicals', cat: 'res', stack: 10, color: 0x6fae3a, desc: 'Unlabeled chemical jugs.' },
  [ITEM.HERB]: { name: 'Herbs', cat: 'res', stack: 10, color: 0x4d7a36, desc: 'Medicinal plants.' },
  [ITEM.ALCOHOL]: { name: 'Alcohol', cat: 'res', stack: 10, color: 0xc4a35a, desc: 'Cheap whiskey. Burns well.' },
  [ITEM.LEATHER]: { name: 'Leather', cat: 'res', stack: 10, color: 0x6e4a2e, desc: 'Tanned hide.' },
  [ITEM.WIRE]: { name: 'Barbed Wire', cat: 'res', stack: 10, color: 0x8c8c8c, desc: 'Coiled razor wire.' },
  [ITEM.PLATE]: { name: 'Kevlar Plate', cat: 'res', stack: 4, color: 0x3b4a3a, desc: 'Military armor insert.' },
  [ITEM.GUNPARTS]: { name: 'Gun Parts', cat: 'res', stack: 6, color: 0x444444, desc: 'Springs, pins, a bolt.' },
  [ITEM.STONE]: { name: 'Stone', cat: 'res', stack: 30, color: 0x8b8a85, desc: 'Broken granite. Mine boulders for it, and the quarry for the most.' },

  [ITEM.BANDAGE]: { name: 'Bandage', cat: 'cons', stack: 5, color: 0xe8e0d0, desc: 'Heals 25 HP.' },
  [ITEM.MEDKIT]: { name: 'Medkit', cat: 'cons', stack: 3, color: 0xc0392b, desc: 'Heals 80 HP.' },
  [ITEM.PAINKILLERS]: { name: 'Painkillers', cat: 'cons', stack: 5, color: 0xf0f0f0, desc: 'Heals 15 HP, restores stamina.' },
  [ITEM.BATTERY]: { name: 'Batteries', cat: 'cons', stack: 5, color: 0xd4b106, desc: 'Recharges your flashlight. A beam held on a Shade keeps it frozen.' },
  [ITEM.TORCH]: { name: 'Torch', cat: 'cons', stack: 10, color: 0xe07b20, desc: 'Place with the hammer [5] to light your base. Shades cannot move in its light.' },
  [ITEM.TUNA]: { name: 'Canned Tuna', cat: 'cons', stack: 5, color: 0x3f6f9a, desc: 'A tin of tuna in oil. Heals 30 HP, restores stamina.' },

  [ITEM.MOLOTOV]: { name: 'Molotov', cat: 'throw', stack: 3, color: 0xd35400, desc: 'Sets an area ablaze.' },
  [ITEM.PIPEBOMB]: { name: 'Pipe Bomb', cat: 'throw', stack: 3, color: 0x566573, desc: 'Beeps, lures the horde, then a big boom.' },
  [ITEM.FLARE]: { name: 'Road Flare', cat: 'throw', stack: 4, color: 0xe04a2a, desc: 'Burns bright red for 40s. Lights the area, pinning Shades.' },
  [ITEM.GRENADE]: { name: 'Frag Grenade', cat: 'throw', stack: 3, color: 0x4b5a32, desc: 'Bounces, rolls, and bursts two seconds after the throw. No beeping: the dead never see it coming.' },
  [ITEM.DECOY]: { name: 'Noisemaker', cat: 'throw', stack: 3, color: 0xb8402c, desc: 'A wound-up alarm clock. Rings for 15s where it lands, and the dead for 45 m around go to it. Hurts nothing.' },

  [ITEM.JACKET]: { name: 'Padded Jacket', cat: 'armor', stack: 1, color: 0x5d4e37, armor: 60, absorb: 0.3, desc: 'Absorbs 30% damage.' },
  [ITEM.KEVLAR]: { name: 'Kevlar Vest', cat: 'armor', stack: 1, color: 0x2f3b2f, armor: 120, absorb: 0.5, desc: 'Absorbs 50% damage.' },

  [ITEM.BACKPACK]: { name: 'Backpack', cat: 'pack', stack: 1, color: 0x4a4430, desc: 'Canvas and leather, made at the workbench. Wear it for more room in the backpack grid.' },

  [ITEM.WALKIE]: { name: 'Walkie-Talkie', cat: 'gear', stack: 1, color: 0x3d4a3a, desc: 'Everyone carries one in slot [6]. Take it out and hold fire to talk to every survivor over it, however far apart you are.' },


  [ITEM.AMMO_9MM]: { name: '9mm Ammo', cat: 'ammo', stack: AMMO_MAX[0], color: 0xc9a227, ammo: 0, desc: 'Pistol rounds.' },
  [ITEM.AMMO_SHELLS]: { name: 'Shotgun Shells', cat: 'ammo', stack: AMMO_MAX[1], color: 0xb03a2e, ammo: 1, desc: '12 gauge.' },
  [ITEM.AMMO_762]: { name: '7.62 Ammo', cat: 'ammo', stack: AMMO_MAX[2], color: 0xa6832a, ammo: 2, desc: 'Rifle rounds.' },
  [ITEM.AMMO_308]: { name: '.308 Ammo', cat: 'ammo', stack: AMMO_MAX[3], color: 0xd4ac0d, ammo: 3, desc: 'Hunting rounds.' },
  [ITEM.AMMO_556]: { name: '5.56 Ammo', cat: 'ammo', stack: AMMO_MAX[4], color: 0x6b7a3a, ammo: 4, desc: 'NATO carbine rounds.' },
  [ITEM.AMMO_BOLTS]: { name: 'Crossbow Bolts', cat: 'ammo', stack: AMMO_MAX[5], color: 0x9a8a62, ammo: 5, desc: 'Scrap-tipped bolts. No gunpowder needed.' },
  [ITEM.AMMO_FUEL]: { name: 'Flamethrower Fuel', cat: 'ammo', stack: AMMO_MAX[6], color: 0xc0561a, ammo: 6, desc: 'A canister of thickened fuel.' },
  [ITEM.AMMO_145]: { name: '14.5mm Ammo', cat: 'ammo', stack: AMMO_MAX[8], color: 0x9c7a2e, ammo: 8, desc: 'Anti-tank rounds as long as your hand.' },
  [ITEM.AMMO_ROCKET]: { name: 'RPG Grenade', cat: 'ammo', stack: AMMO_MAX[7], color: 0x5d6b3a, ammo: 7, desc: 'A finned warhead for the RPG. Goes off on impact.' },
  [ITEM.AMMO_FLARE]: { name: 'Flare Shells', cat: 'ammo', stack: AMMO_MAX[9], color: 0xd23a26, ammo: 9, desc: '26.5mm parachute flares for the flare gun.' },

  [ITEM.CAR_BATTERY]: { name: 'Car Battery', cat: 'part', stack: 1, color: 0x1f3a93, desc: 'Car supply. Bring it to your broken-down car on Route 9.' },
  [ITEM.SPARE_TIRE]: { name: 'Spare Tire', cat: 'part', stack: 1, color: 0x1b1b1b, desc: 'Car supply. Bring it to your broken-down car on Route 9.' },
  [ITEM.SPARK_PLUGS]: { name: 'Spark Plugs', cat: 'part', stack: 1, color: 0xd0d3d4, desc: 'Car supply. Bring it to your broken-down car on Route 9.' },
  [ITEM.FUEL_CAN]: { name: 'Jerry Can', cat: 'part', stack: 3, color: 0xb71c1c, desc: 'Fuel for the car. The tank needs three cans.' },
  [ITEM.FAN_BELT]: { name: 'Fan Belt', cat: 'part', stack: 1, color: 0x212121, desc: 'Car supply. Bring it to your broken-down car on Route 9.' },

  [ITEM.PROPELLER]: { name: 'Propeller', cat: 'part', stack: 1, color: 0x8a8f94, desc: 'Plane part: a two-blade propeller off a hangar rack. Bring it to the plane at the airport.' },
  [ITEM.MAGNETO]: { name: 'Magneto', cat: 'part', stack: 1, color: 0x30343a, desc: 'Plane part: the engine fires off it. Bring it to the plane at the airport.' },
  [ITEM.HYDRAULIC_PUMP]: { name: 'Hydraulic Pump', cat: 'part', stack: 1, color: 0xa33a22, desc: 'Plane part: without it the flaps and the brakes are dead. Bring it to the plane at the airport.' },
  [ITEM.FLIGHT_RADIO]: { name: 'Flight Radio', cat: 'part', stack: 1, color: 0x3a4a3c, desc: 'Plane part: the set out of a control tower. Bring it to the plane at the airport.' },
  [ITEM.AVGAS]: { name: 'Avgas Drum', cat: 'part', stack: 3, color: 0x2f6fb0, desc: 'Aviation fuel for the plane. The tanks need three drums.' },

  [ITEM.SCHEM_SHOTGUN]: { name: 'Shotgun Schematic', cat: 'schem', stack: 1, color: 0x6c8fb5, desc: 'Unlocks the Shotgun and the Double-Barrel at the workbench for the whole team.' },
  [ITEM.SCHEM_RIFLE]: { name: 'Rifle Schematic', cat: 'schem', stack: 1, color: 0x6c8fb5, desc: 'Unlocks the Hunting Rifle, the AK-47, the M4A1 and the Anti-Tank Rifle at the workbench for the whole team.' },
  [ITEM.SCHEM_KEVLAR]: { name: 'Armor Schematic', cat: 'schem', stack: 1, color: 0x6c8fb5, desc: 'Unlocks the Kevlar Vest at the workbench for the whole team.' },
  [ITEM.SCHEM_EXPLOSIVES]: { name: 'Explosives Schematic', cat: 'schem', stack: 1, color: 0x6c8fb5, desc: 'Unlocks Pipe Bombs, Frag Grenades and the Flamethrower at the workbench for the whole team.' },
  [ITEM.SCHEM_METAL]: { name: 'Fortification Schematic', cat: 'schem', stack: 1, color: 0x6c8fb5, desc: 'Unlocks Metal Walls for the whole team.' },
  [ITEM.SCHEM_VEHICLES]: { name: 'Workshop Manual', cat: 'schem', stack: 1, color: 0xb0863a, desc: 'Unlocks building a Moped and a Bicycle at a workbench, for the whole team.' },
  [ITEM.MOPED_KIT]: { name: 'Moped', cat: 'gear', stack: 1, color: 0x9c3a2a, desc: 'Built at a workbench: it stands beside the bench when it is done, with a splash of fuel in it. Two seats.' },
  [ITEM.BIKE_KIT]: { name: 'Bicycle', cat: 'gear', stack: 1, color: 0x4a6a8a, desc: 'Built at a workbench: it stands beside the bench when it is done. Needs no fuel and makes no noise.' },

  [ITEM.VENISON_RAW]: { name: 'Raw Venison', cat: 'cons', stack: 6, color: 0x8e2f2a, desc: 'A cut off a deer. Cook it at a campfire: raw, it heals 8 HP.' },
  [ITEM.VENISON]: { name: 'Cooked Venison', cat: 'cons', stack: 6, color: 0x7a4a2c, desc: 'Venison off the fire. Heals 45 HP, restores stamina.' },
  [ITEM.CARD_PACK]: { name: 'Card Pack', cat: 'card', stack: 1, color: 0x8e2a24, desc: 'A pack of Dead Hand cards. Opened as you pick it up: three cards for your collection, which you keep from run to run [K].' },
  [ITEM.SEALED_PACK]: { name: 'Sealed Pack', cat: 'card', stack: 1, color: 0xb0863a, desc: 'A sealed pack of Dead Hand cards, still in its foil: three cards, at least one of them rare, for your collection [K].' },
  [ITEM.ENERGY_DRINK]: { name: 'Energy Drink', cat: 'cons', stack: 5, color: 0x6fc23a, desc: 'A can of something fizzy and very sweet. Refills your stamina in one go, even on the run. Quick drink [B].' },
  // the weapons: `def` in each one's file (shared/weapons/)
  ...Object.fromEntries(WEAPON_LIST.map((w) => [w.id, w.def])),
};

// The order the backpack grid is sorted in after a pickup or a drop, by category: weapons, what is worn or carried for
// what it does (armor, the backpack, the walkie-talkie), ammunition, medicine and the other consumables, throwables,
// materials, car supplies, schematics (sortInventory, server/inventory.js). Empty slots come after them, and the locked ones last of all.
export const BAG_TIER = { weapon: 0, armor: 1, pack: 1, gear: 1, ammo: 2, cons: 3, throw: 4, res: 5, part: 6, schem: 7 };

// slot: 0 primary, 1 pistol, 2 melee, 4 build (hammer)
// Firearms: damage per pellet, rate = seconds between shots, spread (radians) hip / moving penalty, recoil (what a
// burst's bloom and climb come to is playersim.js's shotSpread / shotClimb; node scripts/gun-groups.js prints the groups),
// noise = radius (m) in which the shot draws zombies (default NOISE.GUNSHOT in constants.js): the louder, the more come
// autoReload: reloads by itself once the magazine is empty; quiet: no muzzle blast (no flash, the shot is a bolt)
// rocket: no bullet - each shot is a grenade that flies at `speed` (m/s), falls at `grav` (m/s^2) and bursts on the
// first thing it strikes (or `range` metres out) for `damage` to the dead within `radius` (Combat.launch)
// flame: no bullet - each shot is a puff of fire that scorches everything in a cone (half-angle `flame.cone`, rad)
// out to `range` for `damage` and sets it alight (BURN); the magazine is the fuel tank
// bossMul: damage x this against a boss or a Tank (on top of the head multiplier)
// skyflare: no bullet - the shot is a parachute flare (PROJ.SKYFLARE) that flies up along the aim and lights the
// ground under it while it drifts back down (the flight and its numbers: shared/skyflare.js)
// Melee: altDamage / altRate = the heavy attack (RMB instead of LMB). The blow lands at once like a light one, so
// what it costs is the recovery: it must hit harder and keep up less damage per second than the light attack,
// or one of the two buttons is never worth pressing. (The hammer sits in the build slot and is never swung.)
// (each weapon's row is `stats` in its file, shared/weapons/)
export const WEAPONS = Object.fromEntries(WEAPON_LIST.map((w) => [w.id, w.stats]));

export function isFirearm(item) {
  const w = WEAPONS[item];
  return !!(w && !w.melee);
}
export function slotForItem(item) {
  const w = WEAPONS[item];
  if (w) return w.slot;
  if (THROW_ITEMS.includes(item)) return 3;
  return -1;
}
export function isThrowable(item) {
  return THROW_ITEMS.includes(item);
}

// Player-zombie claws (not an item)
export const CLAWS = { damage: 22, rate: 0.6, range: 2.0, headMul: 1.0, leapCooldown: 4.5, leapSpeed: 12, leapUp: 5.5 };

// fuse: seconds from the throw to the bang (the flare: how long it burns). radius / damage: the blast, with the falloff
// of Combat.explode (full at the centre, 35% at the edge); it hurts the dead and player-zombies, never a survivor.
// lure: radius (m) in which the dead drop what they are doing and walk to it while it lures (the pipe bomb all
// through its fuse; the noisemaker for lureTime seconds once it has landed). noise: how far the bang carries
// (NOISE.EXPLOSION when not set). bounce: share of its fall speed it keeps off the ground; roll: rolling friction
// (m/s^2) once it stops bouncing. light: the flare's radius (m).
export const THROWABLES = {
  [ITEM.MOLOTOV]: { fuse: 0, radius: 4.5, burnTime: 8, dps: 40, speed: 17 },
  [ITEM.PIPEBOMB]: { fuse: 2.6, radius: 7, damage: 420, speed: 17, lure: 40 },
  [ITEM.FLARE]: { fuse: 40, radius: 0, speed: 16, light: 14 },
  // the frag: thrown further and faster, bursts on a short fuse wherever it has rolled to, gives itself away to nothing
  [ITEM.GRENADE]: { fuse: 2.2, radius: 5, damage: 260, speed: 19, noise: 130, bounce: 0.35, roll: 7 },
  // the noisemaker: hurts nothing, pulls the dead off a place for a quarter of a minute
  [ITEM.DECOY]: { fuse: 0, radius: 0, damage: 0, speed: 15, lure: 45, lureTime: 15 },
};
export const THROW_ITEMS = [ITEM.MOLOTOV, ITEM.PIPEBOMB, ITEM.GRENADE, ITEM.DECOY, ITEM.FLARE];

export const CONSUMABLES = {
  [ITEM.BANDAGE]: { heal: 25, time: 2.2 },
  [ITEM.MEDKIT]: { heal: 80, time: 3.5 },
  [ITEM.PAINKILLERS]: { heal: 15, stamina: 100, time: 1.0 },
  [ITEM.BATTERY]: { flashlight: 100, time: 1.0 },
  [ITEM.TUNA]: { heal: 30, stamina: 100, time: 2.5, food: true }, // food: eaten (own sounds, first-person tin)
  // meat: food that comes in no tin (1: a raw cut, 2: a cooked one, in the hands)
  [ITEM.VENISON_RAW]: { heal: 8, time: 2.5, food: true, meat: 1 },
  [ITEM.VENISON]: { heal: 45, stamina: 100, time: 2.5, food: true, meat: 2 },
  // drink: a can, cracked and downed (own sounds, first-person can tipped to the mouth); quick, to be had mid-chase
  [ITEM.ENERGY_DRINK]: { stamina: 100, time: 0.8, drink: true },
};

// Whether using consumable `item` now would be for nothing, so it is not done (Game.useItem; the client does not even
// ask): anything at all while down (only a teammate gets you up), healing at full health unless it restores stamina
// too, an energy drink at full stamina, a battery for a flashlight that is (all but) full.
// p: { hp, maxHp, battery, downed, stamina, exhausted }
export function useWasted(item, p) {
  const c = CONSUMABLES[item];
  if (p.downed) return true;
  if (c.heal && !c.stamina && p.hp >= p.maxHp) return true;
  if (c.stamina && !c.heal && p.stamina >= STAMINA_MAX - 0.5 && !p.exhausted) return true;
  return !!c.flashlight && p.battery >= FLASHLIGHT_MAX - 1;
}

// ---------------------------------------------------------------- talking
// The voice reaches TALK_RANGE (constants.js); text chat reaches everyone. Past that range, the walkie-talkie carries
// the voice: the speaker has to have theirs keyed, and the listener has to be a survivor (everybody alive carries
// one; the dead and the turned do not).
export const radioLinked = (speakerOnRadio, listenerHasWalkie) => speakerOnRadio && listenerHasWalkie;
