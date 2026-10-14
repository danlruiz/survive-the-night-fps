// Every sound the server tells a client to play (EVT.SOUND), and the ones the client plays of its own accord.
// Numeric ids are part of the wire protocol - do not renumber.
import { uniqueIds } from '../ids.js';

export const SOUND = uniqueIds('SOUND', {
  NONE: 0,
  PISTOL: 1,
  SHOTGUN: 2,
  AK47: 3,
  RIFLE: 4,
  MELEE_SWING: 5,
  MELEE_HIT: 6,
  ZOMBIE_GROWL: 7,
  ZOMBIE_ATTACK: 8,
  ZOMBIE_DEATH: 9,
  ZOMBIE_PAIN: 10,
  RUNNER_SCREAM: 11,
  TANK_ROAR: 12,
  SPITTER_SPIT: 13,
  LEAPER_SCREECH: 14,
  ROPER_SHOOT: 15,
  BOOMER_GURGLE: 16,
  EXPLOSION: 17,
  BAT_SCREECH: 18,
  BOSS_ROAR: 19,
  ACID_SIZZLE: 20,
  FIRE_WHOOSH: 21,
  GLASS_BREAK: 22,
  WOOD_HIT: 23,
  WOOD_BREAK: 24,
  METAL_HIT: 25,
  BUILD: 26,
  PICKUP: 27,
  CRAFT: 28,
  RELOAD: 29,
  DRY_FIRE: 30,
  PLAYER_HURT: 31,
  PLAYER_DEATH: 32,
  HEAL: 33,
  CAR_PART: 34,
  HORDE_HORN: 35,
  DAWN: 36,
  PLANE: 37,
  CRATE_LAND: 38,
  CAMPFIRE_ADD: 39,
  FLESH_HIT: 40,
  HEADSHOT: 41,
  ZPLAYER_GROWL: 42,
  THROW: 43,
  FOOTSTEP: 44,
  LEAP: 45,
  CAR_START: 46,
  SLAM: 47,
  SWITCH: 48,
  CHOP: 49,
  SALVAGE: 50,
  SEARCH: 51,
  PING: 52,
  ENGINE_CRANK: 53,
  REVIVE: 54,
  DOWNED: 55,
  FLARE_BURN: 56,
  M4A1: 57,
  MP5: 58,
  DB_SHOTGUN: 59,
  CAT_MEOW: 60,
  DOG_BARK: 61,
  DOG_HOWL: 62,
  DOG_SNARL: 63,
  DOG_YELP: 64,
  CROSSBOW: 65,
  CROSSBOW_COCK: 66,
  EAT: 67,
  SHADE_WHISPER: 68, // a shade stalking in the dark
  SHADE_FREEZE: 69, // light catches it
  SHADE_SHRIEK: 70, // the light is gone
  ZOMBIE_MOAN: 71, // an idle or wandering zombie (client-side vocalisation; a chasing one growls)
  BODY_FALL: 72, // a killed zombie hitting the ground (client-side, timed to the fall)
  BELL_TOLL: 73, // the chapel bell: heard all over the valley, from the chapel
  BELL_ROPE: 74, // the rope taken up and hauled on
  RADIO_TUNE: 75, // the Relay Station's radio keyed up
  RADIO_CALL: 76, // ...and the call for a supply drop going out
  GRAVE_STIR: 111, // the earth of a grave heaving: something under it is on its way up (client-side, from EVT.GRAVE)
  GRAVE_BURST: 112, // ...and breaking through
  MOUNTED_GUN: 91, // a round from the mounted gun (client-side, from its EVT.SHOT)
  GUN_FEED: 92, // rounds going into its belt
  GUN_MAN: 93, // someone takes its grips
  DEER_SNORT: 79, // a deer blows through its nose: the group has seen, heard or smelt something, and bolts
  DEER_BLEAT: 80, // a deer hit, or brought down
  DEER_HOOF: 81, // a hoof coming down at a run (client-side, timed to the bound)
  FAIR_START: 97, // the fair's generator catching
  FAIR_STOP: 98, // ...and winding down
  FAIR_FUEL: 99, // fuel going into its drum
  RIDE_BOARD: 100, // a survivor getting onto a ride
  GEN_START: 85, // the built generator: the cord pulled, it catches
  GEN_STOP: 86, // it coughs and dies (switched off, run dry)
  GEN_FUEL: 87, // fuel going into its tank
  FLOOD_SWITCH: 88, // a floodlight's lamp coming on or going out (client-side, from its replicated state)
  RPG: 113, // an RPG grenade leaving the tube
  AT_RIFLE: 118, // the anti-tank rifle's shot
  AT_RELOAD: 119, // ...and its bolt worked to feed it another round
  TREE_FALL: 120, // a felled tree creaking over and crashing down (client-side, from EVT.FELL)
  DRINK: 121, // a can cracked open and gulped down (an energy drink)
  FLARE_GUN: 122, // a flare gun's shot (client-side, from EVT.SHOT)
  FLARE_POP: 123, // a parachute flare bursting alight at the top of its climb (client-side, from its flight)
  SCREECHER_SCREAM: 126, // a screecher's scream: the dead hear it from far off, and come
  DEER_SCREAM: 124, // an undead deer (the mainland's): a rotten-throated bellow as it lowers its antlers, is hit, or dies
  CAT_PURR: 125, // the stray cat purring while it is stroked (client-side, from its CANIM.PET)
  SMOKER_HISS: 143, // a smoker breathing out its cloud
  DEAGLE: 144, // the Desert Eagle's shot
  BABY_CRY: 151, // a Mother's baby crawling after you, wailing (client-side, from its own growl timer)
  BELLY_BURST: 152, // a Mother's belly torn open by a shot (client-side, from ZSTATUS.BURST)
  // vehicles (shared/vehicles.js)
  VEH_START: 130, // an engine turned over and caught (somebody at the wheel of one that runs)
  VEH_STOP: 131, // ...and switched off, or run dry
  VEH_FIX: 132, // a part fitted: a ratchet, a clank
  VEH_FUEL: 133, // fuel glugging into a tank
  VEH_CRASH: 134, // sheet metal into something solid
  VEH_THUMP: 135, // a body struck by one
  VEH_BREAK: 136, // one breaking down: a bang under the bonnet, steam
  VEH_DOOR: 137, // a car door shut (somebody getting in or out)
  SIPHON: 138, // fuel drawn out of a wreck's tank
  VEH_GLASS: 139, // a car's windows going in (the dead getting at who is inside)
  BIKE_BELL: 140, // a bicycle's bell
  VEH_MOUNT: 141, // somebody swinging a leg over a moped or a bicycle
  VEH_SKID: 142, // tyres letting go (client-side, from the vehicle's replicated state)
  CRAWLER_CHITTER: 150, // a crawler springing at a face, and chittering on it once it has it
});
