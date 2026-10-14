// Every item a survivor holds in their hands, one file each: the client half of a weapon in shared/weapons/ (the same
// file name), and the throwables and the walkie-talkie. A held item's file holds all there is to drawing it:
//   id     its item id (ITEM)
//   build  its model builder, in weapon space at real size (parts.js): fills a PartSet with its parts, its pivots
//          and its meta (muzzle, leftHand, sight, ...). The same builder makes the world / pickup model (merged into
//          one 'body', low detail) and the viewmodel (split into its moving parts, high detail)
//   vm     how it is held in first person (below)
//   poses  optional: hand poses fitted to it alone (HAND_POSES entries, see hands.js), added to HAND_POSES here. Each
//          is fitted against its own model (clip:fit, docs/clippy.md: the palm seated on the surface along its normal,
//          every finger closed until it touches, the thumb laid along it), so nothing of the hand is inside it; a
//          throwable's closes round its own shape (a fist made for a 3 cm handle buries its fingers in anything thicker)
//
// vm, the viewmodel entry. kind: rifle | shotgun | pistol | melee | throw | radio (picks the animations and the tuck
// off walls); hip: the weapon pose at the hip [px, py, pz, rx, ry, rz]; rPose / rGrip: the right hand's pose and
// where it holds (p, q in weapon space); lGrip: the left hand's (p defaults to the model's meta.leftHand), or none;
// sprint (and talk): added to the hip pose; recoil: the kick.
// chargeFire: false = the charging handle stays put while firing; chargeQ: left-hand Euler on the charging handle;
// chargeTravel: how far the handle is pulled on reload (0 = the hand just slaps meta.chargeKnob, e.g. a bolt catch);
// breakAction: break-open shotgun (barrels part hinges down to reload)
// swing / heavySwing: a melee weapon's swing (SWINGS in weapons.js; heavySwing for the heavy attack, else swing too);
// with neither, a gun or a throwable shoves. pry: how it is worked under a lid ('blade' twisted, 'hammer' hooked and
// pulled; else jammed in and leant on)
// crossbow: limbs and string follow the cocked state (update() is told whether a bolt is loaded)
// adsFov: the viewmodel's field of view when aimed (VM_FOV at the hip): iron sights are a few pixels of a 68 degree
// view, so the aimed view of a gun that has them is narrowed onto them a little (not much: the gun grows with them).
// adsZ: how far down the view axis the sight point sits when aimed. The three guns that pivot on a front bead
// (shotgun, double-barrel, crossbow) carry their grip a whole gun length behind it, so adsZ is set to bring that
// grip back to the eye plane: any further out and the right fist rises into the frame under the point of aim.
//
// To add a held item: a new file here, and its line in each of the two lists below (in file-name order), and its
// icon in client/ui/icons/ (the same file name). scripts/test-weapons.js checks that every weapon has a model, a
// viewmodel and an icon.
import { HAND_POSES } from './hands.js';
import ak47 from './ak47.js';
import atRifle from './at-rifle.js';
import bat from './bat.js';
import crossbow from './crossbow.js';
import dbShotgun from './db-shotgun.js';
import deagle from './deagle.js';
import decoy from './decoy.js';
import flamethrower from './flamethrower.js';
import flareGun from './flare-gun.js';
import flare from './flare.js';
import grenade from './grenade.js';
import hammer from './hammer.js';
import huntingRifle from './hunting-rifle.js';
import knife from './knife.js';
import m4a1 from './m4a1.js';
import machete from './machete.js';
import molotov from './molotov.js';
import mp5 from './mp5.js';
import nunchaku from './nunchaku.js';
import pipebomb from './pipebomb.js';
import pistol from './pistol.js';
import revolver from './revolver.js';
import rpg from './rpg.js';
import shotgun from './shotgun.js';
import spikedBat from './spiked-bat.js';
import walkie from './walkie.js';

export const HELD_ITEMS = [
  ak47,
  atRifle,
  bat,
  crossbow,
  dbShotgun,
  deagle,
  decoy,
  flamethrower,
  flareGun,
  flare,
  grenade,
  hammer,
  huntingRifle,
  knife,
  m4a1,
  machete,
  molotov,
  mp5,
  nunchaku,
  pipebomb,
  pistol,
  revolver,
  rpg,
  shotgun,
  spikedBat,
  walkie,
];

// the tables the models are drawn from, by item id
export const BUILDERS = {};
export const VM = {};
for (const item of HELD_ITEMS) {
  if (BUILDERS[item.id]) throw new Error(`two held items with item id ${item.id}`);
  BUILDERS[item.id] = item.build;
  VM[item.id] = item.vm;
  for (const name in item.poses) {
    if (HAND_POSES[name]) throw new Error(`hand pose ${name} is defined twice`);
    HAND_POSES[name] = item.poses[name];
  }
}
