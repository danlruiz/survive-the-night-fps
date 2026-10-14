// The icon of every item a survivor holds in their hands, one file each, named as its model is
// (client/render/models/weapons/<name>.js) and, for a weapon, as its shared/weapons/ file. icons.js adds them to
// the item icons. Guns are drawn in side profile, muzzle to the right; melee weapons blade or head to the right;
// throwables standing up. To add one: a new file here and its line in each of the two lists below (file-name order).
import ak47 from './ak47.js';
import atRifle from './at-rifle.js';
import bat from './bat.js';
import crossbow from './crossbow.js';
import dbShotgun from './db-shotgun.js';
import deagle from './deagle.js';
import decoy from './decoy.js';
import flamethrower from './flamethrower.js';
import flare from './flare.js';
import flareGun from './flare-gun.js';
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

// item id -> [viewBox width, viewBox height, inner markup]
export const HELD_ICONS = {};
for (const { id, icon } of [
  ak47,
  atRifle,
  bat,
  crossbow,
  dbShotgun,
  deagle,
  decoy,
  flamethrower,
  flare,
  flareGun,
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
]) {
  if (HELD_ICONS[id]) throw new Error(`two held item icons for item id ${id}`);
  HELD_ICONS[id] = icon;
}
