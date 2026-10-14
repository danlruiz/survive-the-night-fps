// What every sound the game asks for plays: the positional categories (CATS), the recorded foley that replaces or
// layers over a procedural bank (R_* defs), SOUND id -> bank (SOUND_MAP), blows on the world (STRIKE_MAP), the
// first-person / ui sounds (LOCAL), the stingers, the positional loops and the footsteps by surface. Data only: the
// engine (audio.js) plays them.
import { SOUND } from '../../shared/defs.js';

const S = SOUND;

// ------------------------------------------------------------------ positional categories
// ref/roll: inverse distance model; max: culled beyond; air: distance (m) constant of the air-absorption low-pass;
// wet: reverb send at the reference distance - the diffuse field falls off as (ref/d)^(0.45*roll), much slower than
// the direct sound, so distant sources get wetter; hrtf: use HRTF panning when closer than this; cap: max
// simultaneous voices of the category; delay: apply speed-of-sound delay for far sources; crowd: each voice of the
// category already sounding turns the next one down (x 1/sqrt(1 + crowd * n)), so a swarm reads as a swarm instead
// of adding up to something louder than gunfire and flattening the music under the master compressor.
export const CATS = {
  gun: { ref: 7, max: 260, roll: 1.0, air: 60, wet: 0.27, hrtf: 30, cap: 16, delay: true },
  explosion: { ref: 12, max: 320, roll: 0.9, air: 90, wet: 0.27, hrtf: 35, cap: 6, delay: true },
  big: { ref: 6, max: 110, roll: 1.0, air: 45, wet: 0.2, hrtf: 30, cap: 6 },
  zombie: { ref: 2.2, max: 45, roll: 1.1, air: 28, wet: 0.16, hrtf: 18, cap: 10, crowd: 0.45 },
  fx: { ref: 2, max: 36, roll: 1.2, air: 25, wet: 0.13, hrtf: 12, cap: 14 },
  fxfar: { ref: 4, max: 75, roll: 1.0, air: 35, wet: 0.16, hrtf: 18, cap: 8 },
  step: { ref: 1.5, max: 25, roll: 1.4, air: 20, wet: 0.065, hrtf: 8, cap: 10 },
  thump: { ref: 5, max: 80, roll: 1.0, air: 40, wet: 0.22, hrtf: 0, cap: 4 }, // a tank's footfalls: heard long before it is seen
  // the chapel bell, heard from anywhere in the valley: fainter and duller with distance, and dry enough that what
  // arrives still comes from the chapel's side (the reverb is not panned, and falls off slower than the bell itself)
  bell: { ref: 30, max: 1000, roll: 0.6, air: 320, wet: 0.12, hrtf: 0, cap: 4, delay: true },
  // high overhead: a parachute flare bursting alight 40-90 m up, heard all round the place it went up over
  sky: { ref: 30, max: 380, roll: 0.9, air: 150, wet: 0.2, hrtf: 0, cap: 4, delay: true },
  // a screecher's scream: loud at any range in the fight, and carrying most of the way across the valley
  scream: { ref: 14, max: 300, roll: 0.85, air: 120, wet: 0.26, hrtf: 30, cap: 4, delay: true },
};
for (const k in CATS) CATS[k].sendExp = 0.45 * CATS[k].roll;

// Recorded foley (samples.js) replacing - or with `layer`, adding to - a procedural sound. key, vol, pitch range;
// hits/gap: repeated strikes; layers: several recordings, each `at` seconds in. layer: true adds the sound's own
// procedural bank, a bank name adds that bank instead (at layerVol). far: a distant-perspective recording that
// takes over from the close one as a positional source gets further away (FAR_NEAR..FAR_FULL m).
const R_CHOP = { key: 'chop', vol: 1.9, pitch: [0.93, 1.07] };
const R_WOOD = { key: 'chop', vol: 1.6, pitch: [1.05, 1.2] };
const R_HAMMER = { key: 'hammer', vol: 2.8, pitch: [0.92, 1.08], hits: [2, 3], gap: [0.24, 0.38] };
const R_CAMPFIRE = { layers: [{ key: 'sticks', vol: 1.7, pitch: [0.9, 1.1], at: 0 }, { key: 'fire_ignite', vol: 0.9, pitch: [0.95, 1.05], at: 0.16 }] };
const R_IGNITE = { key: 'fire_ignite', vol: 0.9, pitch: [0.85, 1.0], layer: true };
const R_SWING = { key: 'swing', vol: 0.8, pitch: [0.9, 1.15], lp: 9000 };
const R_SWING_HEAVY = { key: 'swing', vol: 1.25, pitch: [0.78, 0.9], lp: 7000 };
const R_FLESH = { key: 'hit_flesh', vol: 1.2, pitch: [0.85, 1.05], layer: true };
// bullet impacts on flesh: in the world, and as the shooter's own quiet "that hit" confirmation (no tonal chime)
const R_BULLET_FLESH = { key: 'hit_bullet', vol: 0.5, pitch: [0.85, 1.05] };
const R_HEADSHOT = { key: 'hit_head', vol: 1.8, pitch: [0.92, 1.05] };
const R_HIT_CONFIRM = { key: 'hit_bullet', vol: 1.6, pitch: [0.8, 0.95], lp: 6500 };
const R_HEAD_CONFIRM = { key: 'hit_head', vol: 1.8, pitch: [0.9, 1.0], lp: 9000 };
// zombie voices (human performances, pitched down for a heavier, less human throat). Levels measured in play: one
// zombie at arm's length sits a little under a pistol shot; a swarm is held together by the category's `crowd`.
const R_Z_GROWL = { key: 'zv_growl', vol: 1.6, pitch: [0.8, 0.94] };
const R_Z_ATTACK = { key: 'zv_attack', vol: 1.9, pitch: [0.82, 0.95] };
const R_Z_PAIN = { key: 'zv_pain', vol: 2, pitch: [0.85, 0.98] };
const R_Z_DEATH = { key: 'zv_death', vol: 2.2, pitch: [0.8, 0.92] };
const R_BODY = { key: 'imp_body', vol: 1.1, pitch: [0.85, 1.05], lp: 5000 }; // a body hitting the dirt
const R_Z_SCREAM = { key: 'zv_scream', vol: 1.9, pitch: [0.93, 1.05] };
const R_Z_MOAN = { key: 'zv_moan', vol: 1.5, pitch: [0.8, 0.95] }; // idle and wandering: long, mournful, unhurried
const R_Z_ROAR = { key: 'zv_roar', vol: 1.4, pitch: [0.88, 1.0] };
const R_Z_BOSS = { key: 'zv_boss', vol: 1.7, pitch: [0.78, 0.9] };
const R_Z_SCREECH = { key: 'zv_screech', vol: 1.8, pitch: [0.95, 1.12] };
const R_Z_SPIT = { key: 'zv_spit', vol: 1, pitch: [0.9, 1.05], layer: true, layerVol: 0.6 }; // the hock, over the procedural spit
const R_Z_GURGLE = { key: 'zv_gurgle', vol: 1.25, pitch: [0.8, 0.95] };
const R_Z_WHISPER = { key: 'zv_whisper', vol: 1.3, pitch: [0.85, 1.0] };
const R_ZP_GROWL = { key: 'zv_growl', vol: 1.6, pitch: [0.88, 1.0] };
// feral dogs (real dogs, pitched down a little: bigger and meaner) and the stray cat
const R_DOG_BARK = { key: 'dog_bark', vol: 1.3, pitch: [0.82, 0.95] };
const R_DOG_SNARL = { key: 'dog_snarl', vol: 1.2, pitch: [0.8, 0.95] };
const R_CRAWLER = { key: 'dog_snarl', vol: 0.9, pitch: [1.55, 1.8] }; // the crawler: a dog's snarl from a squirrel's throat
const R_DOG_HOWL = { key: 'dog_howl', vol: 1.85, pitch: [0.85, 0.98] };
const R_DOG_YELP = { key: 'dog_yelp', vol: 1.05, pitch: [0.9, 1.05] };
const R_CAT_MEOW = { key: 'cat_meow', vol: 2.4, pitch: [0.95, 1.08] };
// Recorded gunshots (one take set per weapon, heard both first person and from other players). In first person the
// procedural "sweetener" (sub thump + tree-line echoes, no crack) is layered underneath for weight; from far away the
// real distant recordings take over. `fp`: the first-person variant of each def.
const gunRec = (key, pitch, farPitch, gain = 1) => {
  const far = { key: 'gun_far', vol: 1.0 * gain, pitch: farPitch };
  const remote = { key, vol: 1.15 * gain, pitch, far };
  remote.fp = { key, vol: 1.25 * gain, pitch, layer: 'gsw_' + key.slice(4), layerVol: 0.55 };
  return remote;
};
const R_GUN = {
  pistol: gunRec('gun_pistol', [0.97, 1.04], [1.05, 1.15], 0.6),
  shotgun: gunRec('gun_shotgun', [0.96, 1.03], [0.78, 0.86]),
  ak47: gunRec('gun_ak47', [0.97, 1.03], [0.92, 1.0]),
  rifle: gunRec('gun_rifle', [0.97, 1.02], [0.82, 0.9]),
  m4a1: gunRec('gun_m4a1', [0.98, 1.04], [0.98, 1.06]),
  mp5: gunRec('gun_mp5', [0.98, 1.05], [1.08, 1.18]),
  dbshotgun: gunRec('gun_dbshotgun', [0.9, 0.96], [0.74, 0.8]),
  // the anti-tank rifle: the hunting rifle's recording a long way down, over its own deeper procedural boom
  atrifle: { key: 'gun_rifle', vol: 1.35, pitch: [0.74, 0.79], far: { key: 'gun_far', vol: 1.3, pitch: [0.64, 0.7] }, layer: true, layerVol: 0.6 },
  // the Desert Eagle: the pistol's recording well down, over its own heavier procedural shot
  deagle: { key: 'gun_pistol', vol: 1.3, pitch: [0.76, 0.82], far: { key: 'gun_far', vol: 1.15, pitch: [0.86, 0.94] }, layer: true, layerVol: 0.6 },
};
R_GUN.atrifle.fp = { key: 'gun_rifle', vol: 1.4, pitch: [0.74, 0.78], layer: true, layerVol: 0.65 };
R_GUN.deagle.fp = { key: 'gun_pistol', vol: 1.35, pitch: [0.76, 0.81], layer: true, layerVol: 0.6 };
// the survivors' voice (one performer for every grunt and scream)
const R_P_HURT = { key: 'pv_hurt', vol: 1.5, pitch: [0.96, 1.04] };
const R_P_DEATH = { key: 'pv_death', vol: 1.8, pitch: [0.95, 1.02] };
// explosions: real blasts over the procedural sub thump; from far off the distant recordings take over
const R_EXPLOSION = { key: 'exp_near', vol: 1.3, pitch: [0.92, 1.02], far: { key: 'exp_far', vol: 1.2, pitch: [0.9, 1.05] }, layer: true, layerVol: 0.6 };
// the RPG (there is no recording of one): the double barrel's take a long way down brings the booster's bang, the
// procedural layer under it the backblast's thump and the rocket motor tearing away; far off, the distant gunshots
// deeper still. In first person the layer is the stereo one from behind the sights.
const R_RPG = { key: 'gun_dbshotgun', vol: 1.2, pitch: [0.72, 0.78], far: { key: 'gun_far', vol: 1.1, pitch: [0.6, 0.66] }, layer: 'rpg_motor', layerVol: 0.7 };
R_RPG.fp = { key: 'gun_dbshotgun', vol: 1.25, pitch: [0.72, 0.77], layer: 'fps_rpg', layerVol: 0.7 };
const R_GLASS = { key: 'imp_glass', vol: 1.3, pitch: [0.95, 1.08] };
const R_WOOD_BREAK = { key: 'imp_wood_break', vol: 1.3, pitch: [0.9, 1.05], layer: true, layerVol: 0.5 };
// a felled tree: barely any pitch spread, so the crash stays where the tree lands (2.55 s in)
const R_TREE_FALL = { key: 'tree_fall', vol: 1.4, pitch: [0.98, 1.02] };
const R_METAL = { key: 'imp_metal', vol: 1.7, pitch: [0.9, 1.08] };
const R_ACID = { key: 'imp_acid', vol: 0.55, pitch: [0.9, 1.1], layer: true, layerVol: 0.6 };
// the horn before dark, the car
const R_HORN = { key: 'horn', vol: 1.15, pitch: [0.97, 1.03] };
const R_CAR_CRANK = { key: 'car_crank', vol: 1.1, pitch: [0.97, 1.03] };
const R_CAR_START = { key: 'car_start', vol: 1.3, pitch: [0.98, 1.02] };
// picking things up and going through containers: a hand in a pack, over the procedural cue
const R_PICKUP = { key: 'fol_bag', vol: 0.8, pitch: [0.95, 1.12], layer: true, layerVol: 0.7 };
const R_SEARCH = { key: 'fol_bag', vol: 0.9, pitch: [0.85, 1.05], hits: [2, 3], gap: [0.22, 0.4] };
// first aid, food, the flashlight, the crossbow
const R_BANDAGE = { layers: [{ key: 'fol_rip', vol: 0.7, pitch: [0.95, 1.05], at: 0 }, { key: 'cloth', vol: 1.5, pitch: [0.9, 1.1], at: 0.55 }, { key: 'cloth', vol: 1.3, pitch: [0.9, 1.1], at: 1.0 }] };
const R_CAN = { key: 'fol_can', vol: 1.5, pitch: [0.96, 1.05] };
const R_CLICK = { key: 'fol_click', vol: 1.6, pitch: [0.95, 1.06] };
const R_XBOW = { key: 'fol_xbow', vol: 0.9, pitch: [0.94, 1.04], layer: true, layerVol: 0.5 };
// an RPG grenade out of its canvas bag: a hand in a pack, deeper (something heavy), over the procedural scrape
const R_RPG_DRAW = { key: 'fol_bag', vol: 1.1, pitch: [0.8, 0.9], layer: true, layerVol: 0.7 };
// a parachute flare catching: the recorded fire taking light, pitched up into a fizz, over the procedural pop
const R_FLARE_POP = { key: 'fire_ignite', vol: 0.55, pitch: [1.2, 1.35], lp: 7000, layer: true, layerVol: 1 };
// weapon handling: real magazines, pumps, bolts and hammers
const R_MAG_OUT = { key: 'fol_mag_out', vol: 0.95, pitch: [0.96, 1.04] };
const R_MAG_IN = { key: 'fol_mag_in', vol: 0.7, pitch: [0.96, 1.04] };
const R_PUMP = { key: 'fol_pump', vol: 0.95, pitch: [0.95, 1.03] };
const R_SHELL = { key: 'fol_shell', vol: 0.6, pitch: [0.95, 1.06] };
const R_BOLT = { key: 'fol_bolt', vol: 1.4, pitch: [0.97, 1.04] };
const R_DRY = { key: 'fol_dry', vol: 0.55, pitch: [0.96, 1.05] };
const R_DRAW = { key: 'fol_draw', vol: 1.2, pitch: [0.94, 1.06] };
// the anti-tank rifle's bolt and its round: the same foley, heavier
const R_AT_BOLT = { key: 'fol_bolt', vol: 1.6, pitch: [0.8, 0.86] };
const R_AT_ROUND = { key: 'fol_shell', vol: 0.8, pitch: [0.7, 0.78] };
export const FAR_NEAR = 35;
export const FAR_FULL = 110;

// SOUND id -> { bank, cat ('2d' = always non-positional), vol, jit (rate jitter), send (2D reverb send), rec }
export const SOUND_MAP = [];
// Blows on the world, by what was struck and with what (shared/surfaces.js soundFor), and a wreck coming apart
// (render/wrecks.js): the procedural banks of synth-strike.js, with the recorded impact over them where there is
// one - pitched down for a bat's thud on a panel, up for a machete's clang. rate: the bank played faster or slower
const strikeDef = (bank, cat, vol, jit = 0.07, rate = 1, rec = null) => ({ bank, cat, vol, jit, send: 0.15, rec, rate });
export const STRIKE_MAP = {
  metal_thud: strikeDef('strike_panel', 'fx', 0.95, 0.06, 1, { key: 'imp_metal', vol: 1.5, pitch: [0.6, 0.74], layer: true, layerVol: 1 }),
  metal_bang: strikeDef('strike_panel', 'fx', 0.9, 0.05, 1.3, { key: 'imp_metal', vol: 1.9, pitch: [0.84, 0.98], layer: true, layerVol: 0.7 }),
  metal_clang: strikeDef('strike_blade', 'fx', 0.8, 0.05, 1, { key: 'imp_metal', vol: 1.5, pitch: [1.16, 1.34], layer: true, layerVol: 0.8 }),
  metal_tink: strikeDef('strike_tink', 'fx', 0.6, 0.1),
  wood_slash: strikeDef('strike_cloth', 'fx', 0.35, 0.1, 0.7, { key: 'chop', vol: 0.8, pitch: [1.35, 1.6] }),
  wood_chop: strikeDef('strike_earth', 'fx', 0.5, 0.08, 1.2, { key: 'chop', vol: 1.9, pitch: [0.93, 1.07] }),
  wood_thud: strikeDef('strike_earth', 'fx', 0.7, 0.08, 1.1, { key: 'chop', vol: 1.5, pitch: [0.66, 0.78], layer: true, layerVol: 0.8 }),
  wood_knock: strikeDef('strike_earth', 'fx', 0.5, 0.08, 1.6, { key: 'chop', vol: 1.3, pitch: [1.05, 1.2] }),
  stone_scrape: strikeDef('strike_stone', 'fx', 0.5, 0.1, 1.25),
  stone_chink: strikeDef('strike_stone', 'fx', 0.7, 0.08, 1),
  stone_crack: strikeDef('strike_stone', 'fx', 0.9, 0.08, 0.72),
  earth_cut: strikeDef('strike_earth', 'fx', 0.5, 0.1, 1.35),
  earth_thud: strikeDef('strike_earth', 'fx', 0.8, 0.1, 0.9),
  cloth_rip: strikeDef('strike_cloth', 'fx', 0.6, 0.1),
  cloth_whump: strikeDef('strike_tyre', 'fx', 0.6, 0.1, 1.3),
  glass_tick: strikeDef('strike_glass', 'fx', 0.6, 0.1),
  glass_crack: strikeDef('strike_glass', 'fx', 0.9, 0.08, 0.8),
  tyre_stab: strikeDef('strike_tyre', 'fx', 0.7, 0.08, 1.2),
  tyre_thump: strikeDef('strike_tyre', 'fx', 0.9, 0.08, 0.9),
  tyre_hiss: strikeDef('tyre_hiss', 'fx', 0.7, 0.05),
  hinge_creak: strikeDef('hinge_creak', 'fx', 0.7, 0.1),
  trim_rattle: strikeDef('part_drop', 'fx', 0.4, 0.1, 1.5),
  part_drop: strikeDef('part_drop', 'fx', 0.8, 0.1, 1.1),
  part_drop_big: strikeDef('part_drop', 'fxfar', 1, 0.08, 0.66),
  car_chirp: strikeDef('car_chirp', 'fxfar', 0.7, 0.01),
  car_alarm: strikeDef('car_alarm', 'big', 0.85, 0.005),
};
export const STRIKE_NAMES = Object.keys(STRIKE_MAP);
function def(id, bank, cat, vol = 1, jit = 0.04, send = 0.15, rec = null) {
  if (id !== undefined) SOUND_MAP[id] = { bank, cat, vol, jit, send, rec };
}
def(S.PISTOL, 'gun_pistol', 'gun', 0.85, 0.04, 0.15, R_GUN.pistol);
def(S.SHOTGUN, 'gun_shotgun', 'gun', 0.9, 0.03, 0.15, R_GUN.shotgun);
def(S.AK47, 'gun_ak47', 'gun', 0.8, 0.035, 0.15, R_GUN.ak47);
def(S.RIFLE, 'gun_rifle', 'gun', 0.9, 0.03, 0.15, R_GUN.rifle);
def(S.M4A1, 'gun_m4a1', 'gun', 0.8, 0.035, 0.15, R_GUN.m4a1);
def(S.MP5, 'gun_mp5', 'gun', 0.75, 0.04, 0.15, R_GUN.mp5);
def(S.DB_SHOTGUN, 'gun_dbshotgun', 'gun', 0.95, 0.03, 0.15, R_GUN.dbshotgun);
def(S.CROSSBOW, 'xbow_shot', 'fx', 0.8, 0.05, 0.15, R_XBOW); // no blast: it carries about as far as a swing, not a gunshot
def(S.RPG, 'rpg_launch', 'gun', 1, 0.03, 0.2, R_RPG); // carries as far as any rifle
def(S.MELEE_SWING, 'swing', 'fx', 0.55, 0.08, 0.15, R_SWING);
def(S.MELEE_HIT, 'flesh_heavy', 'fx', 0.85, 0.08, 0.15, R_FLESH);
def(S.ZOMBIE_GROWL, 'z_growl', 'zombie', 0.75, 0.1, 0.15, R_Z_GROWL);
def(S.ZOMBIE_MOAN, 'z_growl', 'zombie', 0.75, 0.1, 0.15, R_Z_MOAN);
def(S.ZOMBIE_ATTACK, 'z_attack', 'zombie', 0.9, 0.08, 0.15, R_Z_ATTACK);
def(S.ZOMBIE_DEATH, 'z_death', 'zombie', 0.9, 0.08, 0.15, R_Z_DEATH);
def(S.ZOMBIE_PAIN, 'z_pain', 'zombie', 0.8, 0.1, 0.15, R_Z_PAIN);
def(S.RUNNER_SCREAM, 'z_runner', 'zombie', 1, 0.07, 0.15, R_Z_SCREAM);
def(S.TANK_ROAR, 'z_tank', 'big', 1, 0.06, 0.15, R_Z_ROAR);
def(S.SPITTER_SPIT, 'z_spit', 'zombie', 0.9, 0.08, 0.15, R_Z_SPIT);
def(S.LEAPER_SCREECH, 'z_leaper', 'zombie', 0.9, 0.08, 0.15, R_Z_SCREECH);
def(S.ROPER_SHOOT, 'z_roper', 'zombie', 0.9, 0.06);
def(S.BOOMER_GURGLE, 'z_boomer', 'zombie', 0.9, 0.08, 0.15, R_Z_GURGLE);
def(S.SMOKER_HISS, 'tyre_hiss', 'zombie', 0.9, 0.1); // (a long breath of gas let out: the burst tyre's hiss)
def(S.EXPLOSION, 'explosion', 'explosion', 1, 0.05, 0.15, R_EXPLOSION);
def(S.BAT_SCREECH, 'z_bat', 'zombie', 0.7, 0.1);
def(S.BOSS_ROAR, 'z_boss', 'big', 1, 0.05, 0.15, R_Z_BOSS);
def(S.ACID_SIZZLE, 'acid', 'fx', 0.7, 0.08, 0.15, R_ACID);
def(S.FIRE_WHOOSH, 'fire_whoosh', 'fxfar', 0.9, 0.06, 0.15, R_IGNITE);
def(S.GLASS_BREAK, 'glass', 'fx', 0.8, 0.08, 0.15, R_GLASS);
def(S.WOOD_HIT, 'wood_hit', 'fx', 0.8, 0.08, 0.15, R_WOOD);
def(S.WOOD_BREAK, 'wood_break', 'fxfar', 1, 0.06, 0.15, R_WOOD_BREAK);
def(S.METAL_HIT, 'metal_hit', 'fx', 0.75, 0.06, 0.15, R_METAL);
def(S.BUILD, 'build', 'fx', 0.8, 0.05, 0.15, R_HAMMER);
def(S.PICKUP, 'pickup', 'fx', 0.5, 0.08, 0.15, R_PICKUP);
def(S.CRAFT, 'craft', 'fx', 0.6, 0.05);
def(S.RELOAD, 'reload', 'fx', 0.55, 0.04, 0.15, R_MAG_IN);
def(S.CROSSBOW_COCK, 'xbow_cock', 'fx', 0.5, 0.03);
def(S.AT_RIFLE, 'gun_atrifle', 'gun', 1, 0.03, 0.2, R_GUN.atrifle);
def(S.DEAGLE, 'gun_deagle', 'gun', 0.95, 0.03, 0.18, R_GUN.deagle);
def(S.AT_RELOAD, 'bolt', 'fx', 0.7, 0.03, 0.15, R_AT_BOLT);
def(S.DRY_FIRE, 'dry', 'fx', 0.55, 0.05, 0.15, R_DRY);
def(S.PLAYER_HURT, 'hurt', 'fx', 0.8, 0.06, 0.15, R_P_HURT);
def(S.PLAYER_DEATH, 'pdeath', 'fxfar', 1, 0.04, 0.15, R_P_DEATH);
def(S.HEAL, 'bandage', 'fx', 0.5, 0.05, 0.15, R_BANDAGE);
def(S.CAR_PART, 'car_part', 'fx', 0.9, 0.03);
def(S.HORDE_HORN, 'horde_horn', '2d', 0.8, 0, 0.35, R_HORN);
def(S.DAWN, 'dawn', '2d', 0.7, 0, 0.3);
def(S.PLANE, 'plane', '2d', 0.8, 0, 0.2);
def(S.CRATE_LAND, 'crate', 'fxfar', 1, 0.05);
def(S.CAMPFIRE_ADD, 'campfire_add', 'fx', 0.8, 0.06, 0.15, R_CAMPFIRE);
def(S.FLESH_HIT, 'flesh', 'fx', 0.75, 0.1, 0.15, R_BULLET_FLESH);
def(S.HEADSHOT, 'headshot_w', 'fx', 0.9, 0.08, 0.15, R_HEADSHOT);
def(S.ZPLAYER_GROWL, 'zp_growl', 'zombie', 0.9, 0.08, 0.15, R_ZP_GROWL);
def(S.THROW, 'throw', 'fx', 0.55, 0.08);
def(S.FOOTSTEP, 'step_dirt', 'step', 0.55, 0.08);
def(S.LEAP, 'leap', 'fx', 0.8, 0.08);
def(S.CAR_START, 'car_start', 'fxfar', 1, 0.02, 0.15, R_CAR_START);
def(S.SLAM, 'slam', 'explosion', 1, 0.05);
def(S.SWITCH, 'switch', 'fx', 0.45, 0.06, 0.15, R_DRAW);
def(S.CHOP, 'wood_hit', 'fx', 0.9, 0.1, 0.15, R_CHOP);
def(S.SALVAGE, 'metal_hit', 'fx', 0.8, 0.1, 0.15, R_METAL);
def(S.TREE_FALL, 'wood_break', 'big', 1, 0.02, 0.15, R_TREE_FALL);
def(S.SEARCH, 'craft', 'fx', 0.4, 0.08, 0.15, R_SEARCH);
def(S.PING, 'notify', 'fx', 0.6, 0.02);
def(S.ENGINE_CRANK, 'car_start', 'big', 1, 0.02, 0.15, R_CAR_CRANK);
def(S.REVIVE, 'bandage', 'fx', 0.7, 0.05, 0.15, R_BANDAGE);
def(S.DOWNED, 'hurt', 'fxfar', 1, 0.02, 0.15, R_P_HURT);
def(S.FLARE_BURN, 'acid', 'fx', 0.45, 0.1);
def(S.CAT_MEOW, 'cat_meow', 'fx', 0.55, 0.06, 0.15, R_CAT_MEOW);
def(S.CAT_PURR, 'cat_purr', 'fx', 0.45, 0.03, 0.1); // (in somebody else's arms, stroked: heard from close by)
def(S.DOG_BARK, 'dog_bark', 'zombie', 0.95, 0.08, 0.15, R_DOG_BARK);
def(S.DOG_HOWL, 'dog_howl', 'big', 0.8, 0.06, 0.15, R_DOG_HOWL);
def(S.DOG_SNARL, 'dog_snarl', 'zombie', 0.85, 0.1, 0.15, R_DOG_SNARL);
def(S.CRAWLER_CHITTER, 'z_crawler', 'zombie', 0.8, 0.1, 0.15, R_CRAWLER);
def(S.DOG_YELP, 'dog_yelp', 'zombie', 0.8, 0.08, 0.15, R_DOG_YELP);
def(S.SHADE_WHISPER, 'z_shade_whisper', 'zombie', 0.8, 0.1, 0.15, R_Z_WHISPER);
def(S.SHADE_FREEZE, 'z_shade_freeze', 'zombie', 1, 0.06);
def(S.SHADE_SHRIEK, 'z_shade_shriek', 'zombie', 1, 0.06);
def(S.SCREECHER_SCREAM, 'z_screecher', 'scream', 1, 0.05, 0.25);
def(S.BABY_CRY, 'z_baby_cry', 'zombie', 0.8, 0.08, 0.15);
def(S.BELLY_BURST, 'flesh_heavy', 'fx', 1, 0.06, 0.15, R_FLESH); // (a Mother's belly torn open: the wettest of the flesh hits)
def(S.EAT, 'eat', 'fx', 0.5, 0.05);
def(S.DRINK, 'drink', 'fx', 0.4, 0.05); // (-2 dB: it measures that much hotter than can_open)
def(S.BODY_FALL, 'land', 'fx', 0.9, 0.1, 0.15, R_BODY);
// the chapel bell and the Relay Station's radio (synth-fixtures.js). The bell is one bell: no pitch jitter
def(S.BELL_TOLL, 'bell_toll', 'bell', 0.6, 0);
def(S.BELL_ROPE, 'bell_rope', 'fx', 0.33, 0.05);
def(S.RADIO_TUNE, 'radio_tune', 'fx', 0.35, 0.02);
def(S.RADIO_CALL, 'radio_call', 'big', 0.32, 0.02);
def(S.GRAVE_STIR, 'grave_stir', 'fxfar', 1, 0.06);
def(S.GRAVE_BURST, 'grave_burst', 'fxfar', 1, 0.06);
// the mounted gun: procedural only (no recording of one), louder than any rifle and with more room on it
def(S.MOUNTED_GUN, 'gun_hmg', 'gun', 1, 0.03, 0.2);
def(S.GUN_FEED, 'shell_insert', 'fx', 0.7, 0.08, 0.15, R_SHELL); // rounds going onto its belt
def(S.GUN_MAN, 'bolt', 'fxfar', 0.8, 0.04, 0.15, R_BOLT); // someone takes the grips and racks it
// deer (procedural only): the snort carries across a clearing, the hoofbeats only reach whoever they pass close by
def(S.DEER_SNORT, 'deer_snort', 'fxfar', 1.3, 0.06); // (a breath of noise: this puts it level with the cat's meow)
def(S.DEER_BLEAT, 'deer_bleat', 'fxfar', 0.7, 0.07);
def(S.DEER_HOOF, 'step_hoof', 'fx', 0.8, 0.1, 0.08);
def(S.DEER_SCREAM, 'deer_scream', 'zombie', 0.85, 0.08); // (the mainland's undead deer: a voice of the dead's)
// the Tri-County Fair: its generator cranking up and clunking off, fuel going into the drum, a seat taking a rider
def(S.FAIR_START, 'car_start', 'fxfar', 0.9, 0.03, 0.15, R_CAR_CRANK);
def(S.FAIR_STOP, 'car_part', 'fxfar', 0.9, 0.04);
def(S.FAIR_FUEL, 'install_part', 'fx', 0.7, 0.05);
def(S.RIDE_BOARD, 'metal_hit', 'fx', 0.5, 0.08, 0.15, R_METAL);
// the built generator and its floodlights (synth-power.js; its drone is the 'genset' loop). Measured on the effects
// bus 3 m off: the drone -16 LUFS; the start, the stop and a pour each under the player's own pistol shot
// the vehicles of the mainland (synth-vehicle.js): procedural only. The starter and what a spanner does are the
// quest car's own sounds
def(S.VEH_START, 'car_start', 'fxfar', 0.7, 0.04, 0.15, R_CAR_CRANK);
def(S.VEH_STOP, 'gen_stop', 'fxfar', 0.5, 0.04);
def(S.VEH_FIX, 'car_part', 'fx', 0.8, 0.06);
def(S.VEH_FUEL, 'gen_fuel', 'fx', 0.5, 0.05);
def(S.SIPHON, 'gen_fuel', 'fx', 0.45, 0.08);
def(S.VEH_CRASH, 'veh_crash', 'fxfar', 1, 0.06, 0.2);
def(S.VEH_THUMP, 'land', 'fx', 1, 0.1, 0.15, R_BODY);
def(S.VEH_BREAK, 'veh_break', 'fxfar', 0.9, 0.04, 0.2);
def(S.VEH_DOOR, 'veh_door', 'fx', 0.7, 0.06);
def(S.VEH_MOUNT, 'veh_mount', 'fx', 0.55, 0.08);
def(S.VEH_GLASS, 'glass', 'fx', 0.9, 0.08, 0.15, R_GLASS);
def(S.VEH_SKID, 'veh_skid', 'fx', 0.6, 0.08);
def(S.BIKE_BELL, 'bike_bell', 'fx', 0.6, 0.03);
def(S.GEN_START, 'gen_start', 'fxfar', 0.5, 0.03);
def(S.GEN_STOP, 'gen_stop', 'fxfar', 0.5, 0.03);
def(S.GEN_FUEL, 'gen_fuel', 'fx', 0.5, 0.05);
def(S.FLOOD_SWITCH, 'flood_switch', 'fx', 0.8, 0.05);
// the flare gun (synth-flare.js): procedural only. The shot is a hollow pop, softer than a pistol's report and heard
// about as far; the flare's burst at the top of its climb carries over the whole place below it (CATS.sky)
def(S.FLARE_GUN, 'gun_flare', 'gun', 0.45, 0.04, 0.15);
def(S.FLARE_POP, 'flare_pop', 'sky', 0.38, 0.05, 0.15, R_FLARE_POP);

// playLocal(name): first-person / UI 2D sounds. bus: 'sfx' (world, muffled when dead) or 'ui' (always clear)
export const LOCAL = {
  pistol: { bank: 'fp_pistol', vol: 0.95, jit: 0.03, send: 0.14, rec: R_GUN.pistol.fp },
  shotgun: { bank: 'fp_shotgun', vol: 1, jit: 0.025, send: 0.18, rec: R_GUN.shotgun.fp },
  ak47: { bank: 'fp_ak47', vol: 0.88, jit: 0.03, send: 0.13, rec: R_GUN.ak47.fp },
  rifle: { bank: 'fp_rifle', vol: 1, jit: 0.02, send: 0.2, rec: R_GUN.rifle.fp },
  m4a1: { bank: 'fp_m4a1', vol: 0.86, jit: 0.03, send: 0.13, rec: R_GUN.m4a1.fp },
  mp5: { bank: 'fp_mp5', vol: 0.8, jit: 0.035, send: 0.1, rec: R_GUN.mp5.fp },
  dbshotgun: { bank: 'fp_dbshotgun', vol: 1, jit: 0.025, send: 0.2, rec: R_GUN.dbshotgun.fp },
  atrifle: { bank: 'fp_atrifle', vol: 1, jit: 0.02, send: 0.22, rec: R_GUN.atrifle.fp },
  deagle: { bank: 'fp_deagle', vol: 1, jit: 0.025, send: 0.18, rec: R_GUN.deagle.fp },
  crossbow: { bank: 'fp_crossbow', vol: 0.7, jit: 0.03, send: 0.05, rec: R_XBOW },
  flaregun: { bank: 'fp_flare', vol: 0.55, jit: 0.03, send: 0.16 },
  flare_open: { bank: 'flare_open', vol: 0.75 }, // the flare gun broken open, the spent case out, a shell in...
  flare_close: { bank: 'flare_close', vol: 0.65 }, // ...and snapped shut
  hmg: { bank: 'fp_hmg', vol: 1, jit: 0.025, send: 0.18 }, // the mounted gun, from behind its grips
  purr: { bank: 'cat_purr', vol: 0.5, jit: 0.03, send: 0.05 }, // the stray cat in our own arms, as we stroke it
  rpg: { bank: 'fp_rpg', vol: 1, jit: 0.02, send: 0.22, rec: R_RPG.fp },
  reload_start: { bank: 'reload_start', vol: 0.55, rec: R_MAG_OUT },
  reload_end: { bank: 'reload_end', vol: 0.6, rec: R_MAG_IN },
  shell_insert: { bank: 'shell_insert', vol: 0.55, rec: R_SHELL },
  bolt: { bank: 'bolt', vol: 0.6, rec: R_BOLT },
  at_bolt: { bank: 'bolt', vol: 0.7, rec: R_AT_BOLT },
  at_round: { bank: 'shell_insert', vol: 0.65, rec: R_AT_ROUND },
  pump: { bank: 'pump', vol: 0.7, rec: R_PUMP },
  xbow_cock: { bank: 'xbow_cock', vol: 0.6, jit: 0.02 },
  xbow_load: { bank: 'xbow_load', vol: 0.5 },
  rpg_draw: { bank: 'rpg_draw', vol: 0.38, rec: R_RPG_DRAW }, // reload start: a grenade out of the bag
  rpg_load: { bank: 'rpg_load', vol: 0.5 }, // reload end: slid into the tube, seated
  dry: { bank: 'dry', vol: 0.55, rec: R_DRY },
  swing: { bank: 'swing', vol: 0.5, jit: 0.08, rec: R_SWING },
  swing_heavy: { bank: 'swing_heavy', vol: 0.6, jit: 0.06, rec: R_SWING_HEAVY },
  hit: { bank: 'flesh_heavy', vol: 0.75, jit: 0.08, rec: R_FLESH },
  hit_wood: { bank: 'wood_hit', vol: 0.7, jit: 0.08, rec: R_WOOD },
  switch: { bank: 'switch', vol: 0.45, rec: R_DRAW },
  pickup: { bank: 'pickup', vol: 0.5, jit: 0.06, rec: R_PICKUP },
  craft: { bank: 'craft', vol: 0.55 },
  // the crossing (synth-bridge.js; game/cutscene.js plays them, the camera being the listener): the last span of the
  // bridge letting go and going into the sea, and the car's tyres over a joint in the deck
  bridge_groan: { bank: 'bridge_groan', vol: 0.6, jit: 0.01, send: 0.3 },
  bridge_fall: { bank: 'bridge_fall', vol: 1, jit: 0.01, send: 0.35 },
  deck_thump: { bank: 'deck_thump', vol: 0.5, jit: 0.06, send: 0.12 },
  build: { bank: 'build', vol: 0.65, rec: R_HAMMER },
  build_fail: { bank: 'build_fail', vol: 0.45, bus: 'ui' },
  hitmarker: { bank: 'flesh', vol: 0.1, bus: 'ui', jit: 0.06, send: 0, rec: R_HIT_CONFIRM },
  headshot: { bank: 'headshot_w', vol: 0.15, bus: 'ui', jit: 0.05, send: 0, rec: R_HEAD_CONFIRM },
  hurt: { bank: 'hurt', vol: 0.65, jit: 0.05, send: 0.05, rec: R_P_HURT },
  heal: { bank: 'heal', vol: 0.35, bus: 'ui', jit: 0, send: 0 },
  bandage: { bank: 'bandage', vol: 0.5, rec: R_BANDAGE },
  ui_click: { bank: 'ui_click', vol: 0.35, bus: 'ui', jit: 0.02, send: 0 },
  ui_hover: { bank: 'ui_hover', vol: 0.12, bus: 'ui', jit: 0.03, send: 0 },
  // a hold-to-act key down, and a hold broken off (game/holdring.js)
  hold_press: { bank: 'hold_press', vol: 0.3, bus: 'ui', jit: 0.03, send: 0 },
  hold_cancel: { bank: 'hold_cancel', vol: 0.35, bus: 'ui', jit: 0, send: 0 },
  // Dead Hand, the card game (game/cards.js): heard by the one playing, whatever is going on around them
  card_play: { bank: 'card_play', vol: 0.45, bus: 'ui', jit: 0.05, send: 0 },
  card_draw: { bank: 'card_draw', vol: 0.3, bus: 'ui', jit: 0.06, send: 0 },
  card_flip: { bank: 'card_flip', vol: 0.35, bus: 'ui', jit: 0.05, send: 0 },
  card_shuffle: { bank: 'card_shuffle', vol: 0.4, bus: 'ui', jit: 0.03, send: 0 },
  card_burn: { bank: 'card_burn', vol: 0.45, bus: 'ui', jit: 0.03, send: 0 },
  card_round_win: { bank: 'card_round_win', vol: 0.4, bus: 'ui', jit: 0, send: 0 },
  card_round_lose: { bank: 'card_round_lose', vol: 0.4, bus: 'ui', jit: 0, send: 0 },
  heartbeat: { bank: 'heartbeat', vol: 0.8, bus: 'ui', jit: 0, send: 0 },
  jump: { bank: 'jump', vol: 0.35, jit: 0.06, send: 0.03 },
  land: { bank: 'land', vol: 0.45, jit: 0.08, send: 0.03 },
  flashlight: { bank: 'flashlight', vol: 0.4, jit: 0.03, send: 0, rec: R_CLICK },
  breath: { bank: 'breath', vol: 0.45, jit: 0.04, send: 0.02 },
  throw: { bank: 'throw', vol: 0.5 },
  claw: { bank: 'claw', vol: 0.65, jit: 0.07 },
  zombie_player_growl: { bank: 'zp_growl', vol: 0.65, jit: 0.07, rec: R_ZP_GROWL },
  death: { bank: 'death_local', vol: 0.9, bus: 'ui', send: 0 },
  notify: { bank: 'notify', vol: 0.3, bus: 'ui', jit: 0.02, send: 0 },
  mate_down: { bank: 'mate_down', vol: 0.35, bus: 'ui', jit: 0, send: 0 }, // a teammate is down (game/matedown.js)
  achieve: { bank: 'achieve', vol: 0.4, bus: 'ui', jit: 0, send: 0 },
  achieve_rare: { bank: 'achieve_rare', vol: 0.45, bus: 'ui', jit: 0, send: 0 },
  chat: { bank: 'chat', vol: 0.25, bus: 'ui', jit: 0.02, send: 0 },
  radio: { bank: 'radio', vol: 0.3, bus: 'ui', jit: 0.03, send: 0 }, // walkie-talkie squelch: someone keys up / a radio message
  install_part: { bank: 'install_part', vol: 0.7 },
  campfire_add: { bank: 'campfire_add', vol: 0.6, rec: R_CAMPFIRE },
  eat: { bank: 'eat', vol: 0.5 },
  can_open: { bank: 'can_open', vol: 0.5, rec: R_CAN },
  drink: { bank: 'drink', vol: 0.4 },
};

// stinger(name): cinematic cues. bus 'music' follows the music volume, 'ui' is unaffected by the dead-muffle.
// rec: a recorded cue (samples.js) that plays instead once loaded, at recVol (else vol).
export const STINGERS = {
  night: { bank: 'stg_night', vol: 0.9, bus: 'music', duck: 7, rec: 'stg_night', recVol: 1.05 },
  dawn: { bank: 'stg_dawn', vol: 0.75, bus: 'music', duck: 6, birds: true, rec: 'stg_dawn', recVol: 1 },
  death: { bank: 'stg_death', vol: 0.85, bus: 'ui', duck: 5, rec: 'stg_death', recVol: 0.6 },
  boss: { bank: 'stg_boss', vol: 1, bus: 'music', duck: 4.5, rec: 'stg_boss' },
  victory: { bank: 'stg_victory', vol: 0.85, bus: 'music', duck: 8, rec: 'stg_victory', recVol: 1 },
  gameover: { bank: 'stg_gameover', vol: 0.85, bus: 'music', duck: 12, rec: 'stg_gameover' },
  supply: { bank: 'plane', vol: 0.75, bus: 'amb', duck: 0 },
  jumpscare: { bank: 'stg_jumpscare', vol: 0.85, bus: 'music', duck: 1.8 },
  join: { bank: 'stg_join', vol: 0.5, bus: 'music', duck: 0 },
  car_part: { bank: 'stg_car_part', vol: 0.75, bus: 'music', duck: 2 },
};

// createLoop(name) definitions. rec: recorded layers used instead of the procedural bank once loaded
// (key, vol relative to the loop's vol, optional lowpass / playback rate)
export const LOOPS = {
  campfire: { bank: 'loop_campfire', ref: 2.5, max: 32, roll: 1.2, vol: 0.8, wet: 0.12, rec: [{ key: 'fire_roar', vol: 2 }, { key: 'fire_loop', vol: 2.2 }] },
  torch: { bank: 'loop_torch', ref: 1.2, max: 16, roll: 1.4, vol: 0.45, wet: 0.08, rec: [{ key: 'fire_roar', vol: 2.2, lp: 4500, rate: 1.1 }] },
  fire: { bank: 'loop_fire', ref: 3, max: 45, roll: 1.1, vol: 0.9, wet: 0.15, rec: [{ key: 'fire_roar', vol: 3 }, { key: 'fire_loop', vol: 2 }] },
  flamethrower: { bank: 'loop_fire', ref: 3, max: 55, roll: 1.1, vol: 1, wet: 0.15, rec: [{ key: 'fire_roar', vol: 3.4, rate: 1.45 }] }, // the jet: a fire's roar pitched up into a hiss
  burning: { bank: 'loop_torch', ref: 1.5, max: 24, roll: 1.3, vol: 0.6, wet: 0.1, cap: 4, rec: [{ key: 'fire_roar', vol: 2.4, lp: 5000, rate: 1.2 }] }, // a body on fire
  // an RPG grenade's motor in flight: heard rushing past well before it lands, duller with distance
  rocket: { bank: 'loop_rocket', ref: 4, max: 120, roll: 1.0, vol: 0.75, wet: 0.14, cap: 4, air: true, jit: 0.03 },
  acid: { bank: 'loop_acid', ref: 1.5, max: 18, roll: 1.4, vol: 0.5, wet: 0.08 },
  // every zombie carries one; only the nearest few are ever heard
  zombie_idle: { bank: 'loop_zombie_idle', ref: 1.5, max: 18, roll: 1.3, vol: 0.34, wet: 0.12, cap: 8, jit: 0.14, rec: [{ key: 'zv_idle', vol: 0.9, rate: 0.9, lp: 7000 }] },
  boss_breath: { bank: 'loop_boss_breath', ref: 5, max: 70, roll: 1.0, vol: 0.9, wet: 0.2, cap: 3 },
  generator: { bank: 'loop_generator', ref: 2.5, max: 40, roll: 1.2, vol: 0.6, wet: 0.1 },
  genset: { bank: 'loop_genset', ref: 3, max: 60, roll: 1.1, vol: 0.62, wet: 0.1, cap: 3 }, // a generator the survivors built, running
  // a handcar rolling on the railway (synth-handcar.js): played at the car's speed, louder the faster it goes
  handcar: { bank: 'loop_handcar', ref: 3, max: 70, roll: 1.1, vol: 0.7, wet: 0.12, cap: 2, jit: 0 },
  // the car on the crossing (synth-bridge.js): played at its speed, heard from every camera the cutscene cuts to
  car: { bank: 'loop_car', ref: 9, max: 220, roll: 1.0, vol: 0.75, wet: 0.14, always: true, jit: 0 },
  // the vehicles of the mainland (synth-vehicle.js; game/vehicles.js plays each by its revs): a car's engine is the
  // crossing's, a moped's a two-stroke buzz; a horn held down
  veh_car: { bank: 'loop_car', ref: 5, max: 110, roll: 1.0, vol: 0.7, wet: 0.12, cap: 3, jit: 0 },
  veh_moped: { bank: 'loop_moped', ref: 4, max: 90, roll: 1.0, vol: 0.6, wet: 0.1, cap: 3, jit: 0 },
  veh_horn: { bank: 'loop_horn', ref: 6, max: 150, roll: 1.0, vol: 0.8, wet: 0.16, cap: 2, jit: 0 },
  // a building burning in Port Calder (the mainland's world.lights 'fire'): a fire's roar, carrying down the street
  blaze: { bank: 'loop_fire', ref: 8, max: 110, roll: 1.0, vol: 1, wet: 0.2, cap: 2, rec: [{ key: 'fire_roar', vol: 3 }, { key: 'fire_loop', vol: 2 }] },
  // supply plane: heard from far off, duller with distance (air), never dropped by the loop cap
  plane: { bank: 'loop_plane', ref: 45, max: 950, roll: 1.0, vol: 1.1, wet: 0.25, air: true, always: true },
  // the Tri-County Fair's calliope, while its generator runs: heard as far as the dead hear it (NOISE.FAIR), duller
  // with distance, in tune with itself on every client (no rate jitter)
  calliope: { bank: 'loop_calliope', ref: 9, max: 160, roll: 1.0, vol: 0.85, wet: 0.3, air: true, always: true, jit: 0 },
  // a noisemaker ringing where it landed (synth-throw.js): shrill and carrying, never dropped for a zombie's breath
  alarm: { bank: 'loop_alarm', ref: 3, max: 75, roll: 1.05, vol: 0.55, wet: 0.18, cap: 3, always: true, jit: 0.02 },
  // a parachute flare burning (synth-flare.js): mostly high overhead, so a soft hiss that thins with height; one that
  // has come down to the ground fizzes like a road flare's louder cousin
  skyflare: { bank: 'loop_skyflare', ref: 10, max: 90, roll: 1.0, vol: 0.4, wet: 0.18, air: true, cap: 3 },
};
export const LOOP_CAP_TOTAL = 28;

export const STEP_BANKS = {
  dirt: 'step_dirt', grass: 'step_grass', wood: 'step_wood', water: 'step_water', metal: 'step_metal',
  forest: 'step_grass', leaves: 'step_grass', moss: 'step_grass', gravel: 'step_dirt', road: 'step_dirt', path: 'step_dirt', mud: 'step_dirt',
};
// surface -> recorded footsteps; STEP_TONE: [gain (matched to the procedural steps), lowpass Hz]
export const STEP_REC = {
  dirt: 'fs_dirt', path: 'fs_dirt', road: 'fs_gravel', gravel: 'fs_gravel', grass: 'fs_grass', forest: 'fs_forest', moss: 'fs_forest',
  leaves: 'fs_leaves', mud: 'fs_mud', wood: 'fs_wood', water: 'fs_water',
};
export const STEP_TONE = {
  fs_dirt: [1.8, 14000], fs_gravel: [1.9, 16000], fs_grass: [2.9, 13000], fs_forest: [2.6, 11000], fs_leaves: [2.9, 16000],
  fs_mud: [1.8, 10000], fs_wood: [2, 16000], fs_water: [1.9, 16000],
};
