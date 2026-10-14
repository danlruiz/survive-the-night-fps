// What a kind of the dead does on the client beyond what every one of them does (entities/zombies.js): how it sounds,
// how it steps, and the few hooks of its own - the client twin of server/specials/. A kind with nothing here is drawn,
// heard and stepped like a walker. What is the same on both ends (how big it is, its blood, its loop and its growl)
// is on its ZOMBIE_DEFS row (shared/defs/zombies.js), not here.
//
// Voice: firstGrowl / growlGap [min, spread] s before its first growl and between two (Math.random() * spread on top);
//   pause [chance, s]: now and then a longer silence after one; quicken: the gap is this much shorter (a dog's snarls
//   come quick); mouthY: m up from its feet the sound comes from; volume; pitch (x its own voice); growl: a SOUND key
//   for the kinds whose row names none.
// Steps: heavy: its footfalls thump, carry as far as its voice and shake the ground close by (a boss by default);
//   paws: four of them, a quick light patter; stepVol: how loud a step is (a heavy one is always 1).
// Hooks, (ents, e, ...) called in this order each frame, the zombie's view drawn where it is:
//   onAnim(ents, e, anim)               its ZF.ANIM changed (not on its create)
//   prePose(ents, e, view)              before it is posed
//   onFx(ents, e, dt, distC)            after its fire is drawn (distC: its square distance from the camera)
//   preVoice(ents, e, view, time)       before it is heard (alive and within earshot only, as postVoice)
//   postVoice(ents, e, dt, distC)       after it is heard
//   postDraw(ents, e)                   last, alive or dead
import { groundAt } from '../../../shared/collision.js';
import { ZTYPE, ZANIM, ZOMBIE_DEFS, SOUND } from '../../../shared/defs.js';

const SMOKER_TRAIL = 0.45; // m a smoker walks between the puffs of smoke it leaves behind it

// how wide the mouth opens for what it utters (the model's vocalize: 0 a growl, 1 a scream, 2 a roar)
export const MOUTH_OPEN = { [SOUND.RUNNER_SCREAM]: 1, [SOUND.DOG_BARK]: 1, [SOUND.BABY_CRY]: 1, [SOUND.TANK_ROAR]: 2, [SOUND.BOSS_ROAR]: 2 };

// the drawing breath, and then the scream (render/screechfx.js)
function screech(ents, e, anim) {
  if ((anim === ZANIM.SPECIAL) === !!e.screeching) return;
  e.screeching = anim === ZANIM.SPECIAL;
  const def = ZOMBIE_DEFS[e.ztype];
  ents.screechFx.special(e, e.screeching, def.headY, def.screamWindup * 0.75);
}

function crawlerPerch(ents, e, v) {
  const g = ents.g;
  // on somebody's face (ZF.LINK: whose): it clings there. On ours it is not drawn here - it is right in front of
  // the eyes, and what we see of it is its belly, drawn in the view (facelatch.js)
  v.setLatched?.(e.q[6] !== 0);
  v.object.visible = !(e.q[6] !== 0 && e.q[6] === g.myId && e.q[4] === ZANIM.ATTACK);
  // ...or up a tree (the server's perch): as high off the ground as only a tree would hold it, and not in the air
  const up = e.q[4] === ZANIM.AIRBORNE ? 0 : Math.min(1, Math.max(0, (e.ry - groundAt(g.world, e.rx, e.rz, e.ry + 0.5, 0.2, false) - 0.8) / 1.2));
  v.setPerched?.(up);
  e.perched = up > 0.99; // (its hitbox: shared/hitbox.js)
}

// a smoker alive and in sight: wisps off its body all the time, and a puff of trail every SMOKER_TRAIL m it walks
function smokerTrail(ents, e, dt, distC) {
  if (e.dead || distC > 70 * 70) {
    e.trailX = undefined;
    return;
  }
  const fx = ents.g.effects;
  const def = ZOMBIE_DEFS[e.ztype];
  if (Math.random() < dt * 24) fx.smokerWisp(e.rx, e.ry, e.rz, def.height, def.radius * 0.8);
  if (e.trailX === undefined || Math.hypot(e.rx - e.trailX, e.rz - e.trailZ) > 3) {
    // (first seen, or put somewhere new: the trail starts here)
    e.trailX = e.rx;
    e.trailZ = e.rz;
    return;
  }
  if (Math.hypot(e.rx - e.trailX, e.rz - e.trailZ) >= SMOKER_TRAIL) {
    fx.smokerTrail(e.rx, e.ry, e.rz);
    e.trailX = e.rx;
    e.trailZ = e.rz;
  }
}

// the sounds to listen for: light catching it, and light letting it go. Pinned, it is silent.
function shadeFreeze(ents, e, v, time) {
  const frozen = e.q[4] === ZANIM.FROZEN;
  if (frozen !== e.frozen) {
    if (e.frozen !== undefined && time - (e.thawT || 0) > 0.5) {
      e.thawT = time;
      ents.g.audio.play(frozen ? SOUND.SHADE_FREEZE : SOUND.SHADE_SHRIEK, { x: e.rx, y: e.ry + 1.6, z: e.rz });
      if (!frozen) v.vocalize?.(1);
    }
    e.frozen = frozen;
  }
  if (frozen) e.growlT = Math.max(e.growlT, 1.5);
}

// a bat's wings, beat after beat while it is near: what gives away the ones coming over the wall
function batWings(ents, e, dt, distC) {
  if (distC >= 25 * 25) return;
  e.flapT = (e.flapT ?? Math.random() * 0.4) - dt;
  if (e.flapT <= 0) {
    e.flapT = 0.36 + Math.random() * 0.08;
    ents.g.audio.playBank('z_bat_flap', { x: e.rx, y: e.ry + 0.2, z: e.rz, cat: 'step', volume: 0.7, rate: e.voice });
  }
}

// a roper's rope, to whoever it has caught (ZF.LINK)
function roperRope(ents, e) {
  if (e.q[6]) ents.drawRope(e, e.q[6]);
}

const VOICE = { firstGrowl: [2, 8], growlGap: [4, 9], pause: null, quicken: 1, mouthY: 1.5, volume: 0.9, pitch: 1, growl: undefined, paws: false, stepVol: 0.45 };
const DOG_VOICE = { quicken: 0.6, paws: true }; // a dog's bark and snarl, quick, and a quick light patter of paws

const KINDS = {
  [ZTYPE.TANK]: { heavy: true, pause: [0.6, 4] },
  [ZTYPE.BAT]: { volume: 0.6, postVoice: batWings },
  [ZTYPE.ROPER]: { postDraw: roperRope },
  [ZTYPE.DOG]: { ...DOG_VOICE, mouthY: 0.6, stepVol: 0.25 },
  // a dog's bark and snarl from a chest the size of a pony's; it runs on pads: no quake
  [ZTYPE.BOSS_ALPHA]: { ...DOG_VOICE, heavy: false, mouthY: 1.2, volume: 1.4, pitch: 0.66, stepVol: 0.7 },
  [ZTYPE.BOSS_BLOATER]: { pitch: 0.62 },
  [ZTYPE.SHADE]: { firstGrowl: [0.5, 2], growlGap: [1.8, 2.2], stepVol: 0.2, preVoice: shadeFreeze },
  [ZTYPE.SMOKER]: { onFx: smokerTrail },
  [ZTYPE.SCREECHER]: { onAnim: screech },
  [ZTYPE.CRAWLER]: { ...DOG_VOICE, stepVol: 0.12, prePose: crawlerPerch },
  // a Mother's baby wails all the way: one cry runs into the next, each a little apart from its twin's
  [ZTYPE.BABY]: { growlGap: [1.6, 1.2], growl: 'BABY_CRY', mouthY: 0.3, volume: 0.95 },
};

// every kind's, the defaults filled in
export const ZOMBIE_VIEWS = {};
for (const t of Object.values(ZTYPE)) ZOMBIE_VIEWS[t] = { ...VOICE, heavy: !!ZOMBIE_DEFS[t].boss, ...KINDS[t] };
