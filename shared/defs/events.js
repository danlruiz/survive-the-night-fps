// The events of a snapshot (EVT) and the codes they carry: what woke the dead, the impacts, the notices (NOTIFY) and
// their reasons, the killfeed's killers. Numeric ids are part of the wire protocol - do not renumber.
import { uniqueIds } from '../ids.js';

export const EVT = uniqueIds('EVT', {
  SOUND: 1, // sound u8, x,y,z (i16)
  SHOT: 2, // shooterId u16, weapon u8, yaw u16, pitch i16, seed u16, spread u8, recoil pitch u8 (1/500 rad)
  IMPACT: 3, // kind u8, x,y,z, (blood/dirt/wood/metal/spark/acid)
  HITMARK: 4, // flags u8 (1 headshot, 2 kill) - private to shooter
  DAMAGE: 5, // amount u8, fromX,fromZ i16 - private to victim
  KILLFEED: 6, // killerKind u8, killerId u16, victimId u16, weapon u8, flags
  NOTIFY: 7, // msg u8, arg u16, text?
  EXPLOSION: 8, // x,y,z, radius u8
  MELEE: 9, // attackerId u16 (for third-person swing anims)
  PICKUP: 10, // item u8, count u16 (private)
  ZOMBIE_DIE: 11, // zombie id u16, ragdoll impulse dir u8 (yaw), flags (1 headshot, 2 burnt, 4 exploded, 8 gibbed)
  STRUCT_BREAK: 12, // x,y,z, type u8
  THROW: 13, // throwerId
  PING: 14, // playerId u16, kind u8, x,y,z (i16)
  SUMMARY: 15, // night u8, kills u16, structuresLost u8, downs u8, deaths u8, revives u8
  GATHER: 16, // kind u8 (1 chop, 2 salvage), x,y,z (i16) - private to the gatherer (feedback)
  FLYOVER: 17, // supply plane: x,y,z (i16) of the plane's origin at release, heading u16, eta u16 (ms until release)
  ZOMBIE_LEG: 18, // zombie id u16, legs blown off by this hit u8 (bit 0 left, bit 1 right), impulse dir u8 (yaw)
  PONG: 19, // answer to an IN_PING command packet: u8 ms the server sat on it before this snapshot left - private
  STRIPPED: 20, // u8 n, then n trees / wrecks by their collider's x, y0, z (i16): nothing left to gather from them
  REGROWN: 21, // every stripped tree and wreck gives again (dawn)
  FELL: 22, // a tree chopped to its last: its collider's x, y0, z (i16), the way it falls u8 (yaw). Out of the world until dawn
  // a melee swing that struck the world (not a body): attackerId u16, u8 the BLOW (shared/surfaces.js; +8: the heavy
  // swing), x,y,z (i16), the way the blow went (i8 x 3, unit / 127). Clients work out what it struck - the surface,
  // the mark it leaves, the bits and the sound - from their own copy of the world
  STRIKE: 23,
  // a wreck's record (shared/wrecks.js): u8 flags (WRECKF), u8 n, then n x [its collider's x, y0, z (i16), u8 salvage
  // hits left in it, u8 m, m x (x,y,z i16, yaw u8, pitch i8, u8 bits: HITF)]. Without REPLAY the hits are new ones,
  // added to what is known; with it they are the whole record (to a client that joins)
  WRECK: 24,
  WRECK_ALARM: 25, // a wreck's alarm: its collider's x, y0, z (i16), u8 what (ALARM_SAY), u8 seconds it will ring for
  GRAVE: 35, // grave u8 (index into world.cemetery.graves): its earth heaves, and CEMETERY.STIR later one of the dead climbs out
  // (private) achievements (shared/achievements.js): u8 flags (ACHF), u8 n, n x (u8 stat, varu count to add), u8 m,
  // m x u8 achievement number. A guest's: counts and feats for the browser to keep; an account's (ACHF.ACCOUNT): unlocks
  ACHIEVE: 36,
  // (private) the bestiary (shared/bestiary.js): u8 flags (BESTF), u16 mask of ZTYPEs - the whole record (BESTF.ALL)
  // or the kinds just seen
  BESTIARY: 37,
  // a tree broken - by the rounds in its trunk, or a blast: its collider's x, y0, z (i16), the way it goes u8 (yaw),
  // u8 how far up its foot it broke (0.1 m), u8 pieces (1: a shot, snapped there; 2-3: a blast; 0: none - only how
  // much of it stands, to whoever joins). What stands below stands until dawn, and can be shot again
  TREE_BREAK: 38,
  // (private) your noise woke the dead: u8 what made it (HEARD), u8 how many it woke (to 255), u8 how far it
  // carried (m, to 255), u8 n, n x u16 the entity ids of the ones it woke (the nearest HEARD_IDS). Sent to whoever
  // made it, each time it wakes HEARD_MIN or more
  HEARD: 39,
  // (private) a screecher screamed close enough to leave the survivor's ears ringing: u16 its id, u8 tenths of a second
  // the ringing lasts at most (it stops sooner if the screecher dies)
  SCREECH: 40,
});

// EVT.HEARD: what made the noise, so the client can name it the first time ("Gunshot: heard 70 m")
export const HEARD = uniqueIds('HEARD', { GUNSHOT: 1, BLAST: 2, MOLOTOV: 3, BUILD: 4, CHOP: 5, SALVAGE: 6, PRY: 7, HORN: 8, CAR_ALARM: 9 });
export const HEARD_MIN = 1; // a noise has to wake this many of the dead to be told: one is the lesson
export const HEARD_IDS = 32; // the most of the ones it woke named in it (the nearest: the minimap shows 70 m)
export const HEARD_GAP = 1; // s: no more than one ring this often (the woken dead are lit every time) (client)

export const IMPACT = uniqueIds('IMPACT', { BLOOD: 1, DIRT: 2, WOOD: 3, METAL: 4, ACID: 5, GREEN_BLOOD: 6, SPARK: 7 });

export const NOTIFY = uniqueIds('NOTIFY', {
  NIGHT_FALLS: 1,
  DAWN: 2,
  HORDE_SOON: 3,
  BOSS: 4, // arg = zombie type
  SUPPLY_DROP: 5,
  CAR_PART: 6, // arg = item
  CAR_READY: 7,
  CAMPFIRE_LOW: 8,
  CAMPFIRE_OUT: 9,
  PLAYER_JOINED: 10, // arg = player id
  PLAYER_LEFT: 11,
  YOU_DIED: 12,
  FINAL_NIGHT: 13,
  VICTORY: 14,
  GAME_OVER: 15,
  NEED_STATION: 16,
  CANT_BUILD_HERE: 17,
  NOT_ENOUGH: 18,
  INVENTORY_FULL: 19, // arg = the item that was walked over and left lying for want of room (0 = no item to name)
  NEW_GAME: 20,
  PLAYER_DIED: 21, // arg = player id
  CAMPFIRE_LIT: 22,
  DOWNED: 23, // arg = player id
  REVIVED: 24, // arg = player id
  SUPPLY_FOUND: 25, // arg = item (someone picked up a car supply)
  SCHEMATIC: 26, // arg = schematic item (unlocked for the team)
  ENGINE_START: 27, // the final stand begins
  ESCAPE_READY: 28, // engine is warm: get to the car
  WAVE: 29, // arg = wave number (1-based)
  NEED_FIRE: 30,
  NEED_BENCH: 31,
  LOCKED: 32, // arg = schematic item needed
  STRUCT_CAP: 33,
  SEARCH_EMPTY: 34,
  SUPPLIES_DONE: 35, // every supply installed: start the engine when ready
  NEED_SUPPLIES: 36,
  DOOR_ONLY: 37, // door boards must go in a doorway
  CAR_ALARM: 38,
  SHADE: 39, // the first shade of the night is out there
  HERD: 40, // the wandering herd is onto you (sent to the survivor it noticed). arg = how many of them
  RETURNED: 41, // arg = player id: dead (or a player-zombie) since the last sunrise, a survivor again at this one
  BELL: 42, // the chapel bell is ringing. arg = seconds until the rope can be pulled again
  BELL_WAIT: 43, // (to whoever pulled the rope too soon) arg = seconds until it can be
  RADIO_CALL: 44, // arg = player id: they called a supply drop on the Relay Station's radio
  RADIO_NO: 45, // (to whoever tried the radio) arg = why not (RADIO_NO in shared/fixtures.js)
  GRAVES: 61, // the cemetery has woken: part of tonight's horde is coming up out of its graves (sent to the survivors near it)
  FAIR_ON: 55, // arg = player id: the fair's generator is running (lights, music, the rides)
  FAIR_OFF: 56, // arg = player id: shut off again
  FAIR_DRY: 57, // it has run out of fuel
  FAIR_FULL: 58, // (to the survivor at the drum) the tank takes no more
  GEN_LOW: 48, // a generator nearby has a minute of fuel left (sent to the survivors round it)
  GEN_OUT: 49, // ...it has run dry: its floodlights are out
  POCKETS: 62, // (to whoever tried) the backpack cannot come off while its extra slots hold anything
  UNDO_GONE: 63, // (to whoever asked for an undo, ACT.UNDO_DROP) arg = why nothing came back (UNDO_NO in protocol.js)
  NEED_HAMMER: 64, // (to whoever tried) a repair needs the hammer in hand
  // the two acts (shared/acts.js)
  CROSSING: 65, // the car is away: the crossing to the mainland has begun (the cutscene). arg = the driver's id
  ARRIVED: 66, // the team is on the mainland. arg = how many the checkpoint at the bridge brought back from the dead
  CACHE: 67, // (to one survivor) what the bridgehead cache gave them. arg = a CACHE_GAVE bitmask
  STAND_STAGE: 68, // the runway stand moves on. arg = 1: the tanks are full, the engines are warming; 2: warm, get in
  RUNWAY_BLOCKED: 69, // (to whoever tried to take off) the dead are on the runway. arg = how many
  CHECKPOINT: 70, // a wipe on the mainland: the run starts again from the bridgehead. arg = the day it starts on
  // vehicles (shared/vehicles.js)
  VEH_FIXED: 71, // a vehicle runs. arg = the player who fitted the last part
  VEH_BROKE: 72, // (to who is in it) it has broken down
  VEH_WRECKED: 73, // (to who is in it) it is burnt out
  SIPHONED: 74, // (to whoever drew it) arg = the Fuel that came out of the wreck's tank; 0: it was dry
  VEH_NEED: 75, // (to whoever tried) arg = VEH_NO: why nothing could be done to it
  VEH_OFF: 76, // (to the rider) arg = VEH_OFF: what took them off it
  SUPPLY_HINT: 77, // a team that has found no supply yet is told on the radio where one is. arg = the hint (shared/supplyhelp.js)
  SCOUTED: 78, // a Scout has come near where a car supply is hidden: it is on the compass now. arg = the hint (shared/roles.js)
});

// NOTIFY.VEH_NEED / VEH_OFF: why
export const VEH_NO = { FULL: 1, NO_FUEL: 2, NO_PARTS: 3, FINE: 4, SEATS: 5, BROKEN: 6, WRECK: 7, NO_ROOM: 8, NOT_HERE: 9 };
export const VEH_OFFS = { THROWN: 1, PULLED: 2, KNOCKED: 3 };

// killer kinds for killfeed
export const KILLER = { PLAYER: 1, ZOMBIE: 2, WORLD: 3 };

// NOTIFY.CACHE: what the bridgehead cache handed a survivor (acts.js BRIDGEHEAD)
export const CACHE_GAVE = { PISTOL: 1, AMMO: 2, BANDAGE: 4, MELEE: 8, BUILD: 16 };
