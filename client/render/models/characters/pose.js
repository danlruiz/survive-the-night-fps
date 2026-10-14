// How the humanoid dead move: a pose a frame for every state (ZANIM), written into the instance's pose array, then
// the gaze, the flinch and the voice laid over it, the head kept over the hitbox, and the feet planted (poseHumanoid).
// What one kind alone does - its windup, its swing - is in its own module (zombies/<kind>.js); a survivor turned is
// posed by this too (characters/survivor.js).
import { ZTYPE, ZANIM } from '../../../../shared/defs.js';
import { CRAWL_HEAD_FWD } from '../../../../shared/constants.js';
import { CEMETERY } from '../../../../shared/cemetery.js';
import { mulberry32, noise3, clamp, lerp, smooth } from '../skinning.js';
import { ROOT, HIPS, SPINE, CHEST, NECK, HEAD, JAW, CLAV_L, UARM_L, FARM_L, HAND_L, CLAV_R, UARM_R, FARM_R, HAND_R, THIGH_L, SHIN_L, FOOT_L, THIGH_R, SHIN_R, FOOT_R } from './skeleton.js';
import { clearPose, R, A, chestPitch, arm, headLook, legCycle, legsStatic, posture, n1 } from './posekit.js';
import { ATTACKS, SPECIALS, SPECIAL_FROM_IDLE } from '../zombies/index.js';

const PI = Math.PI;
const TAU = PI * 2;
const HALF = PI / 2;

// ------------------------------------------------------------------ humanoid states
function poseIdle(z, p) {
  const st = z.st, t = z.time + z.off;
  const br = Math.sin(t * 1.3 * z.rate);
  if (st.quad) return poseQuad(z, p, false, true);
  if (st.knuckle) return poseTankLoco(z, p, false, true);
  const sway = n1(t * 0.35, z.seed) * 0.07;
  const ws = z.limpSide ? 1 : -1; // weight shifted onto the straight leg
  R(p, HIPS, 0, 0.08 * ws, -0.06 * ws - sway * 0.5);
  R(p, SPINE, st.idleLean * 0.45 + br * 0.025, sway * 0.5, 0.06 * ws + sway);
  R(p, CHEST, st.idleLean * 0.55 + br * 0.02, n1(t * 0.3, z.seed + 3) * 0.12, 0.04 * ws + sway * 0.6);
  p[z.nb * 4] = sway * 0.3 - ws * 0.02;
  posture(z, p);
  // twitch
  const tw = twitch(z, t, st.twitchy ? 2.6 : 0.7);
  headLook(p, st.headPitch + tw * 0.25 + n1(t * 0.5, z.seed + 5) * 0.1, n1(t * 0.25, z.seed + 7) * 0.5 + tw * 0.4, z.tilt * st.headTilt + tw * 0.3, 0.2);
  const jaw = st.jaw * (0.6 + 0.4 * Math.max(0, Math.sin(t * 2.2)));
  R(p, JAW, -jaw - tw * 0.2, 0, 0);
  const splay = st.legSplay || 0.05;
  if (z.limpSide) legsStatic(z, p, 0.24, -0.5, -0.02, -0.06, splay);
  else legsStatic(z, p, -0.02, -0.06, 0.24, -0.5, splay);
  z.standOn = true;
  // arms dangle
  const aw = n1(t * 0.6, z.seed + 11) * 0.12;
  if (st.mantis) {
    arm(p, 0, 0.9 + aw, 0.3, 0.3, 2.2, 0.4);
    arm(p, 1, 0.9 - aw, 0.3, 0.3, 2.2, 0.4);
  } else {
    arm(p, 0, 0.18 + aw, 0.1 + (st.armOut || 0), 0.3, 0.35 + aw, 0.35);
    arm(p, 1, 0.14 - aw, 0.1 + (st.armOut || 0), 0.3, 0.45 - aw, 0.35);
  }
  if (st.twitchy) {
    A(p, UARM_L, tw * 0.5, 0, tw * 0.3);
    A(p, CHEST, br * 0.05, 0, 0);
    A(p, CLAV_L, 0, 0, -Math.abs(br) * 0.1);
    A(p, CLAV_R, 0, 0, Math.abs(br) * 0.1);
  }
  if (st.roar) roar(z, p, t);
}

function twitch(z, t, rate) {
  // occasional sharp twitch: returns -1..1 impulses
  const cell = Math.floor(t * rate);
  const h = noise3(cell * 7.13, z.seed, 1.3, 77);
  if (h < 0.62) return 0;
  const f = t * rate - cell;
  const env = f < 0.15 ? f / 0.15 : Math.max(0, 1 - (f - 0.15) / 0.3);
  return (noise3(cell * 3.1, z.seed, 2.7, 78) * 2 - 1) * env;
}

function roar(z, p, t) {
  const per = 7;
  const u = ((t + z.seed * 3) % per) / per;
  if (u > 0.3) return;
  const k = Math.sin((u / 0.3) * PI);
  A(p, SPINE, 0.25 * k, 0, 0);
  A(p, CHEST, 0.2 * k, 0, 0);
  A(p, NECK, 0.3 * k, 0, 0);
  A(p, HEAD, 0.35 * k + Math.sin(t * 40) * 0.03 * k, 0, 0);
  A(p, JAW, -0.8 * k, 0, 0);
  A(p, UARM_L, 0.4 * k, 0, -0.9 * k);
  A(p, UARM_R, 0.4 * k, 0, 0.9 * k);
}

function poseLoco(z, p, run) {
  const st = z.st;
  if (z.legs) return poseHobble(z, p);
  if (run ? st.gRun : st.gWalk) return poseGait(z, p, run);
  if (st.quad) return poseQuad(z, p, run, false);
  if (st.knuckle) return poseTankLoco(z, p, run, false);
  const t = z.time + z.off;
  const ph = z.phase;
  const lean = run ? st.runLean : st.walkLean;
  const s1 = Math.sin(ph), c2 = Math.cos(ph * 2);
  const sw = st.sway || 1;
  R(p, HIPS, 0, -0.12 * s1, 0.05 * Math.cos(ph) * sw);
  R(p, SPINE, lean * 0.5 + 0.03 * c2, 0.1 * s1, -0.04 * s1 * sw);
  R(p, CHEST, lean * 0.5 + 0.02 * c2, 0.08 * s1, -0.03 * s1 * sw);
  if (st.waddle) {
    A(p, HIPS, 0, 0, 0.12 * Math.sin(ph));
    A(p, SPINE, 0, 0, -0.1 * Math.sin(ph));
    p[z.nb * 4] += 0.05 * Math.sin(ph);
  }
  legCycle(z, p, ph, run ? st.runStride : st.walkStride, run ? st.runKnee : st.walkKnee, st.baseT || 0, st.baseK || 0.06, run ? 0 : st.limp, st.legSplay || 0);
  posture(z, p);
  // limp hitch: shoulder dips on the limp side
  if (st.limp && !run) {
    const hitch = Math.max(0, Math.sin(ph + (z.limpSide ? PI : 0)));
    A(p, SPINE, 0, 0, (z.limpSide ? 1 : -1) * 0.08 * hitch * st.limp);
    p[z.nb * 4 + 1] -= 0.025 * hitch * st.limp;
  }
  // arms
  if (st.mantis) {
    arm(p, 0, 0.9 + 0.1 * Math.sin(ph), 0.3, 0.3, 2.2, 0.4);
    arm(p, 1, 0.9 - 0.1 * Math.sin(ph), 0.3, 0.3, 2.2, 0.4);
  } else {
    const sw2 = st.armSwing * Math.sin(ph);
    const reach = run ? st.armRun : st.armWalk;
    const n = n1(t * 0.8, z.seed + 2) * 0.1;
    const hi = z.armSide; // which arm is raised
    const out = st.armOut || 0;
    const up0 = hi === 0 ? reach : st.armDroop;
    const up1 = hi === 1 ? reach : st.armDroop;
    const a0 = (run ? reach : up0) + sw2 + n, a1 = (run ? reach : up1) - sw2 - n;
    const k0 = clamp(a0 - 0.3, 0, 1), k1 = clamp(a1 - 0.3, 0, 1);
    arm(p, 0, a0, 0.14 + out, 0.25 * k0 - 0.1 * (1 - k0), st.elbow * (1 - 0.6 * k0) * (0.5 + 0.5 * k0) + 0.1, 0.3);
    arm(p, 1, a1, 0.14 + out, 0.25 * k1 - 0.1 * (1 - k1), st.elbow * (1 - 0.6 * k1) * (0.5 + 0.5 * k1) + 0.1, 0.3);
  }
  // head
  const bob = Math.cos(ph * 2) * 0.04;
  const tw = twitch(z, t, st.twitchy ? 2 : 0.5);
  headLook(p, st.headPitch + bob + tw * 0.2 + (run ? 0.1 : 0), n1(t * 0.4, z.seed + 4) * 0.25 + tw * 0.3, z.tilt * st.headTilt + 0.05 * s1, 0.2);
  R(p, JAW, -st.jaw * (0.5 + 0.5 * Math.abs(Math.sin(t * 1.7))), 0, 0);
}

/** Quadruped-ish crawl (leaper). */
function poseQuad(z, p, run, idle) {
  const st = z.st;
  const t = z.time + z.off;
  const ph = idle ? 0 : z.phase;
  const lean = run ? st.runLean : st.walkLean;
  const breathe = Math.sin(t * 3) * 0.03;
  R(p, SPINE, lean * 0.55 + breathe, 0, 0);
  R(p, CHEST, lean * 0.45 + (run ? 0.12 * Math.sin(ph * 2) : 0), 0.06 * Math.sin(ph), 0);
  const amp = idle ? 0 : run ? st.runStride : st.walkStride;
  if (run) {
    // bounding gallop: legs in phase
    const s = Math.sin(ph);
    const k = -(st.baseK + 0.5 * Math.max(0, Math.cos(ph)));
    legsStatic(z, p, st.baseT + amp * s, k, st.baseT + amp * Math.sin(ph + 0.4), k, 0.12);
    p[z.nb * 4 + 1] += 0.08 * Math.max(0, Math.sin(ph * 2));
  } else {
    legCycle(z, p, ph, amp, idle ? 0 : st.walkKnee, st.baseT, st.baseK, 0, 0.14);
  }
  // arms reach down to the ground, alternating with legs
  const aPh = run ? ph + PI * 0.5 : ph + PI;
  const aa = idle ? 0 : run ? 0.7 : 0.4;
  for (let side = 0; side < 2; side++) {
    const s = Math.sin(aPh + (run ? side * 0.4 : side * PI));
    const c = Math.cos(aPh + (run ? side * 0.4 : side * PI));
    arm(p, side, 0.3 + aa * s + (idle ? n1(t * 0.7, z.seed + side) * 0.08 : 0), 0.18, 0.2, 0.35 + 0.5 * Math.max(0, -c) * (idle ? 0 : 1), 0.45);
  }
  const tw = twitch(z, t, 1.6);
  headLook(p, 0.35 + tw * 0.2, (idle ? n1(t * 0.6, z.seed) * 0.7 : 0) + tw * 0.4, tw * 0.3, 0.5);
  R(p, JAW, -0.2 - 0.15 * Math.abs(Math.sin(t * 2)), 0, 0);
}

/** Tank knuckle walk / heavy run. */
function poseTankLoco(z, p, run, idle) {
  const st = z.st;
  const t = z.time + z.off;
  const ph = idle ? 0 : z.phase;
  const lean = idle ? st.idleLean : run ? st.runLean : st.walkLean;
  const br = Math.sin(t * 1.1) * 0.04;
  R(p, HIPS, 0, -0.08 * Math.sin(ph), 0.05 * Math.cos(ph));
  R(p, SPINE, lean * 0.5 + br * 0.5 + (run ? 0.05 * Math.cos(ph * 2) : 0), 0.1 * Math.sin(ph), 0.04 * Math.sin(ph));
  R(p, CHEST, lean * 0.5 + br, 0.12 * Math.sin(ph), 0.04 * Math.sin(ph));
  A(p, CLAV_L, 0, 0, -br);
  A(p, CLAV_R, 0, 0, br);
  if (idle) legsStatic(z, p, 0.15, -0.3, 0.1, -0.25, st.legSplay);
  else legCycle(z, p, ph, run ? st.runStride : st.walkStride, run ? st.runKnee : st.walkKnee, 0.12, 0.25, 0, st.legSplay);
  // arms: knuckles planted, swinging opposite to legs
  const amp = idle ? 0 : run ? 0.55 : 0.35;
  for (let side = 0; side < 2; side++) {
    const s = Math.sin(ph + (side ? 0 : PI));
    const c = Math.cos(ph + (side ? 0 : PI));
    arm(p, side, 0.28 + amp * s, 0.22, 0.25, 0.25 + (idle ? 0 : 0.35 * Math.max(0, c)), 0.3);
  }
  headLook(p, st.headPitch + (idle ? n1(t * 0.3, z.seed) * 0.15 : 0), idle ? n1(t * 0.2, z.seed + 4) * 0.5 : 0, 0, 0.3);
  R(p, JAW, -0.15 - 0.1 * Math.abs(Math.sin(t * 1.3)), 0, 0);
}

// ------------------------------------------------------------------ planted-foot gait (walker, runner)
// Instead of swinging leg angles, these styles plan where each ankle goes. A stance foot stays put on the ground while
// the body travels over it (one gait cycle covers exactly the ground distance that drives the phase, so feet don't
// skate), lands on the heel and rolls off the ball; the swing foot lifts, drags its toes or kicks up behind. solveLegs
// fits the legs with two-bone IK once the upper body (and the head-over-origin shift) is final.
const FOOT_HEEL = 0.085, FOOT_BALL = 0.12, FOOT_TOE = 0.17;
const frac = (x) => x - Math.floor(x);
const hash01 = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Per-instance gait quirks (created lazily so the survivor zombie-mode shim gets them too). */
function gaitVars(z) {
  if (z.gv) return z.gv;
  const r = mulberry32(((z.seed >>> 0) * 7919 + 1013 + (z.type | 0) * 131) >>> 0);
  const limp = r(), arms = r();
  z.gv = {
    limp: limp < 0.2 ? 0 : 0.35 + 0.65 * r(), // how badly the bad leg drags (some shuffle on two good legs)
    lean: 0.85 + 0.3 * r(),
    stride: 0.92 + 0.16 * r(),
    arms: arms < 0.36 ? 0 : arms < 0.76 ? 1 : 2, // walker: dangle / one arm reaching / both; runner: pump / claw / flail
    reach: 1.05 + 0.35 * r(),
    stumble: 0.05 + 0.12 * r(), // chance per gait cycle of a stumbling lurch
    slouch: (r() - 0.5) * 0.14,
    asym: (r() - 0.5) * 0.07, // runner: uneven, galloping rhythm
  };
  return z.gv;
}

/** Ground distance (m) of one gait cycle before the instance's rate; strides shorten when moving slowly. */
export function gaitLen(z, run, speed) {
  const st = z.st;
  const base = run ? st.cycleRun : st.cycleWalk;
  const G = run ? st.gRun : st.gWalk;
  if (!G) return base;
  return base * gaitVars(z).stride * clamp(Math.sqrt(Math.max(speed, 0.01) / G.ref), 0.6, 1.15);
}

/** Per-leg timing for this frame. Leg 0 = left, 1 = right; the limp leg lands at 0, the other at td. */
function gaitSetup(z, run) {
  const st = z.st, G = run ? st.gRun : st.gWalk, V = gaitVars(z);
  const k = z.gk || (z.gk = { G, len: 1, limp: 0, D: [0, 0], td: [0, 0], lift: [0, 0], drag: [0, 0], circ: [0, 0], bob: [0, 0], vault: [0, 0], x: [0, 0], w: [0, 0], stance: [false, false], load: [0, 0], u: 0 });
  k.G = G;
  k.len = gaitLen(z, run, z.speed) / ((z.rate || 1) * (z.gScale || 1)); // in rig units
  const b = z.limpSide, g = 1 - b;
  const limp = (G.limp ?? st.limp ?? 0) * V.limp;
  k.limp = limp;
  // limp: short stance on the bad leg and a quick step off it, long slow drag of the bad foot ("step... draag")
  k.D[b] = G.duty - 0.12 * limp;
  k.D[g] = G.duty + 0.12 * limp;
  k.td[b] = 0;
  k.td[g] = 0.5 - 0.1 * limp + (G.asym ? V.asym : 0);
  k.lift[b] = G.lift * (1 - 0.8 * limp);
  k.lift[g] = G.lift;
  k.drag[b] = limp;
  k.drag[g] = 0;
  k.circ[b] = 0.05 * limp;
  k.circ[g] = 0;
  // single support: vault up over a stiff stance leg; the bad knee buckles under the weight instead
  k.bob[b] = G.bob - 0.04 * limp;
  k.bob[g] = G.bob;
  k.vault[b] = (G.vault || 0) * (1 - 0.8 * limp);
  k.vault[g] = G.vault || 0;
  const u = frac(z.phase / TAU);
  k.u = u;
  for (let i = 0; i < 2; i++) {
    const x = frac(u - k.td[i]), D = k.D[i];
    k.x[i] = x;
    k.stance[i] = x < D;
    k.w[i] = x < D ? 0 : (x - D) / (1 - D);
    k.load[i] = legLoad(k, i, x);
  }
  return k;
}
function legLoad(k, i, x) {
  const D = k.D[i];
  return x < D ? smooth(Math.min(x, D - x) / 0.08) : 0;
}
/** Planned forward offset of the flat foot (rig m) at cycle time x since touchdown. */
function footFwd(k, i, x) {
  const D = k.D[i], h = D * k.len * 0.5;
  return x < D ? h - x * k.len : -h + 2 * h * smooth((x - D) / (1 - D));
}
/** Weight shift, -1 (left foot) .. 1 (right foot), at cycle time u. */
const latAt = (k, u) => legLoad(k, 1, frac(u - k.td[1])) - legLoad(k, 0, frac(u - k.td[0]));
/** Which foot leads, ~-1 (left ahead) .. 1 (right ahead), at cycle time u. */
const leadAt = (k, u) => (footFwd(k, 1, frac(u - k.td[1])) - footFwd(k, 0, frac(u - k.td[0]))) / ((k.D[0] + k.D[1]) * 0.5 * k.len);
/** Footfall jolt: a bump just after each touchdown (heavier on the limp leg). */
function jolt(k, u, b) {
  let j = 0;
  for (let i = 0; i < 2; i++) {
    const x = frac(u - k.td[i]);
    if (x < 0.2) j += Math.sin((PI * x) / 0.2) * (i === b ? 1 + k.limp : 1);
  }
  return j;
}
/** Occasional stumbling lurch: 0..1 over a whole gait cycle, on a random minority of cycles. */
function stumble(z, V) {
  const c = Math.floor(z.phase / TAU);
  if (hash01(c, z.seed) > V.stumble) return 0;
  const s = Math.sin(PI * frac(z.phase / TAU));
  return s * s;
}

function poseGait(z, p, run) {
  const st = z.st, V = gaitVars(z), k = gaitSetup(z, run), G = k.G;
  const t = z.time + z.off, n = z.nb * 4, u = k.u, b = z.limpSide;
  z.gOn = true;
  const lat = k.load[1] - k.load[0];
  const latLag = latAt(k, u - 0.1);
  const lead = leadAt(k, u), leadLag = leadAt(k, u - 0.07), leadLag2 = leadAt(k, u - 0.17);
  const jl = jolt(k, u, b), jlLag = jolt(k, u - 0.06, b);
  const tw = twitch(z, t, st.twitchy ? 2 : 0.5);
  // pelvis: turns with the leading leg, drops on the swing side (a dragged leg hikes its hip instead), shifts over the stance foot
  let roll = 0;
  for (let i = 0; i < 2; i++) if (!k.stance[i]) roll += (i ? 1 : -1) * Math.sin(PI * k.w[i]) * lerp(-G.drop, G.hike || 0, k.drag[i]);
  const yaw = G.hipYaw * lead;
  const lean = (run ? st.runLean : st.walkLean) * V.lean;
  const hl = lean * (G.hipLean || 0); // part of the lean tips the pelvis (the leg IK absorbs it)
  R(p, HIPS, hl, yaw, roll);
  p[n] = G.sway * lat + (b ? -0.015 : 0.015) * k.limp; // weight favors the good leg

  if (G.sprint) {
    // --- feral sprint: pitched far forward, shoulders whipping against the hips, head locked on the prey
    const nod = G.nod * jl, tl = lean - hl;
    R(p, SPINE, tl * 0.5 - nod * 0.4 + 0.03 * Math.sin(t * 2.3), -yaw * 0.9, -roll * 0.5 - G.roll * lat);
    R(p, CHEST, tl * 0.5 - nod * 0.3, -yaw * 1.05, -G.roll * lat * 0.5);
    posture(z, p);
    A(p, CLAV_L, 0, 0, -0.06 * Math.max(0, -lead));
    A(p, CLAV_R, 0, 0, 0.06 * Math.max(0, lead));
    headLook(p, st.headPitch - 0.2 - 0.7 * G.nod * jlLag + tw * 0.25, yaw * 0.9 + n1(t * 0.7, z.seed + 4) * 0.12 + tw * 0.35, z.tilt * st.headTilt * 0.6 + tw * 0.2, 0.5);
    R(p, JAW, -0.4 - 0.2 * jl - 0.15 * Math.abs(Math.sin(t * 5.3)), 0, 0);
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      const d = -sg * leadLag, d2 = -sg * leadLag2; // + while this arm is forward (opposite leg leads)
      const ns = n1(t * 3.1, z.seed + s * 3) * 0.25, na = n1(t * 2.3, z.seed + 9 + s) * 0.15;
      if (V.arms === 1) {
        // clawing forward at the prey, alternating grabs
        arm(p, s, 1.2 + 0.45 * d + ns, 0.28 + na, 0.3, 0.35 + 0.45 * Math.max(0, d2 - d), 0.65);
      } else if (V.arms === 2) {
        // flailing: loose, oversized and out of sync
        arm(p, s, 0.6 + 0.8 * d + ns * 1.5, 0.45 + 0.25 * Math.sin(u * TAU * 2 + s) + na, 0.3, 0.4 + 0.9 * Math.max(0, d2 - d), 0.3);
      } else {
        // sprinter's pump, wide and ragged
        arm(p, s, 0.35 + 0.95 * d + ns, 0.3 + 0.12 * Math.abs(d) + na, 0.35, 1.2 - 0.45 * d + 0.6 * Math.max(0, d2 - d), 0.35);
      }
    }
    return;
  }

  // --- shamble: hunched, lurching over the stance leg, head lolling a beat behind
  const nod = G.nod * jl;
  const stum = G.stumble ? stumble(z, V) : 0;
  const lurch = k.limp * k.load[b] * (b ? 1 : -1); // + toward the right
  const trunkRoll = -G.roll * lat - 0.22 * lurch;
  const br = Math.sin(t * 1.9) * 0.015, tl = lean - hl;
  R(p, SPINE, tl * 0.5 - nod * 0.5 - 0.14 * stum + br, -yaw * 0.7, -roll * 0.6 + trunkRoll * 0.5 + V.slouch * 0.5);
  R(p, CHEST, tl * 0.5 - nod * 0.4 - 0.1 * stum + br, -yaw * 0.75, trunkRoll * 0.5 + V.slouch * 0.5);
  p[n + 1] -= 0.03 * stum;
  posture(z, p);
  headLook(
    p,
    (G.head ?? st.headPitch) - 1.3 * G.nod * jlLag + 0.3 * stum + tw * 0.2 + (V.arms === 2 && st.reachArms ? 0.1 : 0),
    n1(t * 0.4, z.seed + 4) * 0.25 + tw * 0.3 + yaw * 0.4,
    z.tilt * st.headTilt - G.headRoll * latLag + tw * 0.15,
    G.neck || 0.2
  );
  R(p, JAW, -st.jaw * (0.5 + 0.5 * Math.abs(Math.sin(t * 1.7))) - 0.08 * jl, 0, 0);
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    const reach = st.reachArms && (V.arms === 2 || (V.arms === 1 && s === z.armSide));
    const ns = n1(t * 0.8, z.seed + 2 + s) * 0.08;
    if (reach) {
      // arm held out toward the prey, bouncing on each footfall
      arm(p, s, V.reach - 0.16 * jlLag - 0.05 * sg * lead + 0.3 * stum + ns, 0.1 + (st.armOut || 0), 0.2, 0.3 + 0.12 * jlLag, -0.15 + 0.2 * jlLag);
    } else {
      // dead weight: swings with the opposite leg, forearm trailing the upper arm (the elbow flops open and shut)
      const a1 = G.droop + G.armSwing * -sg * leadLag + ns, a2 = G.droop + G.armSwing * -sg * leadLag2 + ns;
      const flop = Math.max(0, a2 - a1);
      arm(p, s, a1 + 0.6 * stum, 0.1 + (st.armOut || 0) - 0.05 * sg * latLag, 0.3, G.elbow + 1.4 * flop + 0.1 * jlLag, 0.3 + 0.5 * flop);
    }
  }
  if (st.twitchy) {
    A(p, UARM_L, tw * 0.4, 0, tw * 0.25);
    A(p, CHEST, 0, tw * 0.1, 0);
  }
}

/** Ankle position (forward, up) of a foot pitched ph (+ toe up) whose flat position is `flat`: pivots on the heel or the ball. */
const _an = { f: 0, y: 0 };
function pivotAnkle(flat, ph, a) {
  const c = Math.cos(ph), s = Math.sin(ph);
  if (ph > 0) {
    _an.f = flat - FOOT_HEEL + FOOT_HEEL * c - a * s;
    _an.y = FOOT_HEEL * s + a * c;
  } else {
    _an.f = flat + FOOT_BALL - FOOT_BALL * c - a * s;
    _an.y = -FOOT_BALL * s + a * c;
  }
  return _an;
}
const _foot = { f: 0, y: 0, ph: 0, flat: 0 };
/** Planned ankle (forward of the stance center, height) and world pitch of leg i this frame. */
function planFoot(k, i, a) {
  const G = k.G, D = k.D[i], x = k.x[i], len = k.len;
  const fL = G.bias + D * len * 0.5, fO = G.bias - D * len * 0.5;
  if (x < D) {
    const s = x / D;
    const ph = s < G.rollIn ? G.strike * (1 - smooth(s / G.rollIn)) : s > G.heelOff ? G.toeOff * Math.pow((s - G.heelOff) / (1 - G.heelOff), 1.6) : 0;
    const q = pivotAnkle(fL - x * len, ph, a);
    _foot.f = q.f;
    _foot.y = q.y;
    _foot.ph = ph;
    _foot.flat = fL - x * len; // where the foot sits on the ground (the ankle rolls around it)
    return _foot;
  }
  const w = k.w[i];
  const q0 = pivotAnkle(fO, G.toeOff, a), f0 = q0.f, y0 = q0.y;
  const q1 = pivotAnkle(fL, G.strike, a), f1 = q1.f, y1 = q1.y;
  // Hermite: leaves and lands moving back at ground speed (world-still), so lift-off and touchdown don't snap
  const v = -len * (1 - D) * G.vt;
  const w2 = w * w, w3 = w2 * w;
  const f = (2 * w3 - 3 * w2 + 1) * f0 + (w3 - 2 * w2 + w) * v + (3 * w2 - 2 * w3) * f1 + (w3 - w2) * v;
  let ph = G.toeOff + (G.strike - G.toeOff) * smooth(w * (G.pitchRate || 1));
  ph = lerp(ph, -0.5, k.drag[i] * Math.sin(PI * w)); // foot drop: the dragged foot hangs toe-down
  let y = y0 + (y1 - y0) * w + k.lift[i] * Math.sin(PI * Math.pow(w, G.liftPow || 1));
  // never through the ground: toe and heel stay above it (a dragged toe scrapes along)
  const c = Math.cos(ph), sn = Math.sin(ph);
  y = Math.max(y, a * c - FOOT_TOE * sn, a * c + FOOT_HEEL * sn);
  _foot.f = f;
  _foot.y = y;
  _foot.ph = ph;
  return _foot;
}

const _v3 = { x: 0, y: 0, z: 0 };
/** v = R * v for three.js Euler XYZ (R = Rx Ry Rz); inv applies the transpose. */
function rotXYZ(ax, ay, az, inv) {
  let { x, y, z } = _v3, c, s, t;
  if (!inv) {
    c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
    c = Math.cos(ax); s = Math.sin(ax); t = y * c - z * s; z = y * s + z * c; y = t;
  } else {
    c = Math.cos(ax); s = Math.sin(ax); t = y * c + z * s; z = -y * s + z * c; y = t;
    c = Math.cos(ay); s = Math.sin(ay); t = x * c - z * s; z = x * s + z * c; x = t;
    c = Math.cos(az); s = Math.sin(az); t = x * c + y * s; y = -x * s + y * c; x = t;
  }
  _v3.x = x;
  _v3.y = y;
  _v3.z = z;
  return _v3;
}

const _ft = { x: [0, 0], y: [0, 0], f: [0, 0], z: [0, 0], ph: [0, 0], flat: [0, 0] };

// How far (rig m) a pinned foot may end up from the gait plan before it gets dragged along: forward/back, sideways.
const PIN_F = 0.22, PIN_X = 0.1;
/**
 * World-space foot pinning: a stance foot stays on the spot where it touched down, even when the body's actual
 * motion (interpolated network movement, crowd shoves, turning, a speed estimate that lags) differs from what the
 * gait planned. At lift-off the leftover offset fades out over the swing, so the next step lands on plan again.
 * Needs the instance's world placement (wx, wz, wyaw, wScale); culled frames re-pin.
 */
function pinFeet(z, k) {
  const L = z.pin || (z.pin = { on: [false, false], x: [0, 0], z: [0, 0], ex: [0, 0], ef: [0, 0], t: -1 });
  const s = z.wScale, c = Math.cos(z.wyaw), sn = Math.sin(z.wyaw), cz = z.gcz;
  const fresh = z.time - L.t < 0.12;
  L.t = z.time;
  for (let i = 0; i < 2; i++) {
    if (!k.stance[i]) {
      L.on[i] = false;
      if (!fresh) L.ex[i] = L.ef[i] = 0;
      const f = 1 - smooth(k.w[i]);
      _ft.x[i] += L.ex[i] * f;
      _ft.f[i] += L.ef[i] * f;
      continue;
    }
    const px = _ft.x[i], pz = cz - _ft.flat[i]; // planned ground spot, rig space
    if (!L.on[i] || !fresh) {
      if (fresh) z.footfalls++;
      L.on[i] = true;
      L.x[i] = z.wx + (px * c + pz * sn) * s;
      L.z[i] = z.wz + (pz * c - px * sn) * s;
    }
    const dx = L.x[i] - z.wx, dz = L.z[i] - z.wz;
    let ex = (dx * c - dz * sn) / s - px, ez = (dx * sn + dz * c) / s - pz;
    const e = Math.hypot(ex / PIN_X, ez / PIN_F);
    if (e > 1) {
      // shoved too far off plan: the foot slides (drag the pin along)
      ex /= e;
      ez /= e;
      const lx = px + ex, lz = pz + ez;
      L.x[i] = z.wx + (lx * c + lz * sn) * s;
      L.z[i] = z.wz + (lz * c - lx * sn) * s;
    }
    L.ex[i] = ex;
    L.ef[i] = -ez;
    _ft.x[i] += ex;
    _ft.f[i] -= ez;
  }
}
/** Pelvis height + two-bone leg IK onto the planned feet. Runs after the upper body and the head shift are final. */
function solveLegs(z, p) {
  const k = z.gk, G = k.G, P = z.P, n = z.nb * 4;
  const L1 = P.thighLen, L2 = P.shinLen, a = P.ankleY;
  // feet are planned around a low-passed copy of the hips' z, so a changing head shift can't drag planted feet along
  const rz = p[n + 2];
  if (z.gcz === undefined || Math.abs(rz - z.gcz) > 0.3) z.gcz = rz;
  else z.gcz += (rz - z.gcz) * 0.08;
  const cz = z.gcz;
  for (let i = 0; i < 2; i++) {
    const q = planFoot(k, i, a);
    _ft.f[i] = q.f;
    _ft.y[i] = q.y;
    _ft.ph[i] = q.ph;
    _ft.flat[i] = q.flat;
    _ft.x[i] = (i ? 1 : -1) * (P.hipW + G.width + (k.stance[i] ? 0 : k.circ[i] * Math.sin(PI * k.w[i])));
  }
  if (z.wScale) pinFeet(z, k);
  // pelvis height: as high as the legs reach at touchdown / lift-off (they are longest-spread there), plus the
  // vault over a walking stance leg or the dip-and-bound of a running one
  const Lr = (L1 + L2) * G.ext, wd = G.width;
  const reach = (f, y) => y + Math.sqrt(Math.max(0.01, Lr * Lr - f * f - wd * wd)) + 0.03;
  let hTD = 9, hTO = 9;
  for (let i = 0; i < 2; i++) {
    const D = k.D[i];
    const q1 = pivotAnkle(G.bias + D * k.len * 0.5, G.strike, a);
    hTD = Math.min(hTD, reach(q1.f, q1.y));
    const q0 = pivotAnkle(G.bias - D * k.len * 0.5, G.toeOff, a);
    hTO = Math.min(hTO, reach(q0.f, q0.y));
  }
  let hy;
  const s0 = k.stance[0], s1 = k.stance[1];
  if (G.sprint) {
    if (s0 || s1) {
      let m = 9;
      for (let i = 0; i < 2; i++) {
        if (!k.stance[i]) continue;
        const s = k.x[i] / k.D[i];
        m = Math.min(m, lerp(hTD, hTO, s) - G.comp * Math.sin(PI * s));
      }
      hy = m;
    } else {
      // airborne: from the last lift-off to the next touchdown
      const i = k.x[0] - k.D[0] < k.x[1] - k.D[1] ? 0 : 1, j = 1 - i;
      const tau = k.x[i] - k.D[i], f = tau / Math.max(1e-4, tau + 1 - k.x[j]);
      hy = lerp(hTO, hTD, f) + G.flight * Math.sin(PI * f);
    }
  } else {
    hy = Math.min(hTD, hTO);
    if (s0 !== s1) {
      const i = s0 ? 0 : 1, j = 1 - i;
      const tau = k.x[j] - k.D[j], f = tau / Math.max(1e-4, tau + 1 - k.x[j]);
      const mid = reach(pivotAnkle(G.bias, 0, a).f, a);
      hy += (k.bob[i] + k.vault[i] * Math.max(0, mid - hy)) * Math.sin(PI * f);
    }
  }
  p[n + 1] += hy - P.hipY;
  for (let i = 0; i < 2; i++) _ft.z[i] = cz - _ft.f[i];
  keepReach(z, p, _ft, k.stance);
  legsIK(z, p, _ft);
}

/**
 * Lowers the pelvis until every planted ankle target T (rig x, y, z) is within reach. The drop is eased (quick to
 * sink, slower to rise) so a foot landing out of reach or lifting off doesn't make the hips jump in one frame;
 * meanwhile the IK leaves that foot a little short of its target.
 */
function keepReach(z, p, T, planted) {
  const P = z.P, n = z.nb * 4, maxR = (P.thighLen + P.shinLen) * 0.999;
  const hx = p[HIPS * 4], hyw = p[HIPS * 4 + 1], hz = p[HIPS * 4 + 2];
  let need = 0;
  for (let i = 0; i < 2; i++) {
    if (!planted[i]) continue;
    _v3.x = (i ? 1 : -1) * P.hipW;
    _v3.y = -0.03;
    _v3.z = 0;
    const o = rotXYZ(hx, hyw, hz, false);
    const dx = T.x[i] - (p[n] + o.x), dz = T.z[i] - (p[n + 2] + o.z);
    const top = T.y[i] + Math.sqrt(Math.max(0, maxR * maxR - dx * dx - dz * dz));
    need = Math.max(need, p[n + 1] + P.hipY + o.y - top);
  }
  if (!z.wScale) {
    p[n + 1] -= need; // posed in place (calibration, treadmill): exact
    return;
  }
  const dt = clamp(z.time - (z.dropT ?? z.time), 0, 0.1);
  z.dropT = z.time;
  const d0 = z.drop || 0;
  z.drop = d0 + (need - d0) * Math.min(1, dt * (need > d0 ? 30 : 10));
  p[n + 1] -= z.drop;
}

/** Two-bone IK of both legs onto ankle targets T (rig x, y, z) with the feet at world pitch T.ph. */
function legsIK(z, p, T) {
  const P = z.P, n = z.nb * 4, L1 = P.thighLen, L2 = P.shinLen;
  const hx = p[HIPS * 4], hyw = p[HIPS * 4 + 1], hz = p[HIPS * 4 + 2];
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, th = i ? THIGH_R : THIGH_L;
    _v3.x = sg * P.hipW;
    _v3.y = -0.03;
    _v3.z = 0;
    const o = rotXYZ(hx, hyw, hz, false), ox = o.x, oy = o.y, oz = o.z; // o is the shared scratch vector
    _v3.x = T.x[i] - (p[n] + ox);
    _v3.y = T.y[i] - (p[n + 1] + P.hipY + oy);
    _v3.z = T.z[i] - (p[n + 2] + oz);
    const v = rotXYZ(hx, hyw, hz, true); // hip -> ankle in the hips' frame
    let d = Math.hypot(v.x, v.y, v.z);
    d = clamp(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.9995);
    const ck = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
    const kn = -Math.acos(ck);
    const Y = L1 + L2 * ck, Zk = L2 * Math.sin(kn);
    const splay = Math.asin(clamp(v.x / Y, -0.9, 0.9));
    let pitch = Math.atan2(v.z, v.y) - Math.atan2(-Zk, -Y * Math.cos(splay));
    if (pitch > PI) pitch -= TAU;
    else if (pitch < -PI) pitch += TAU;
    R(p, th, pitch, 0, splay);
    R(p, th + 1, kn, 0, 0);
    R(p, th + 2, T.ph[i] - (hx + pitch + kn), 0, -(splay + hz));
  }
}

// Standing still (idle, braced attack, menace): the feet stay planted in the world while the hips sway, and the legs
// are re-solved onto them. Turning on the spot or being shoved off the stance makes it shuffle a foot back under it.
const STEP_T = 0.3, STEP_LIFT = 0.07, STEP_X = 0.09, STEP_F = 0.14;
const _st = { x: [0, 0], y: [0, 0], z: [0, 0], ph: [0, 0], planted: [true, true] };
function plantStatic(z, p) {
  const P = z.P, n = z.nb * 4, L1 = P.thighLen, L2 = P.shinLen;
  const S = z.stand || (z.stand = { x: [0, 0], z: [0, 0], sx: [0, 0], sz: [0, 0], u: [-1, -1], t: -1 });
  const s = z.wScale, c = Math.cos(z.wyaw), sn = Math.sin(z.wyaw);
  const fresh = z.time - S.t < 0.12, dt = fresh ? z.time - S.t : 0;
  S.t = z.time;
  const rz = p[n + 2];
  if (z.gcz === undefined || Math.abs(rz - z.gcz) > 0.3) z.gcz = rz;
  else z.gcz += (rz - z.gcz) * 0.08;
  for (let i = 0; i < 2; i++) {
    // where the static pose puts this ankle under a still pelvis (thigh + shin FK), in the world
    const th = i ? THIGH_R : THIGH_L, kn = p[(th + 1) * 4];
    _v3.x = 0;
    _v3.y = -L1 - L2 * Math.cos(kn);
    _v3.z = -L2 * Math.sin(kn);
    const q = rotXYZ(p[th * 4], p[th * 4 + 1], p[th * 4 + 2], false);
    const rx = (i ? 1 : -1) * P.hipW + q.x, rzr = z.gcz + q.z;
    const wx = z.wx + (rx * c + rzr * sn) * s, wz = z.wz + (rzr * c - rx * sn) * s;
    if (!fresh) {
      S.x[i] = wx;
      S.z[i] = wz;
      S.u[i] = -1;
    }
    let px = S.x[i], pz = S.z[i], lift = 0;
    if (S.u[i] >= 0) {
      S.u[i] = Math.min(1, S.u[i] + dt / STEP_T);
      const e = smooth(S.u[i]);
      px = S.sx[i] + (wx - S.sx[i]) * e;
      pz = S.sz[i] + (wz - S.sz[i]) * e;
      lift = STEP_LIFT * Math.sin(PI * S.u[i]);
      if (S.u[i] >= 1) {
        S.u[i] = -1;
        S.x[i] = wx;
        S.z[i] = wz;
      }
    } else {
      const ex = ((px - wx) * c - (pz - wz) * sn) / s, ez = ((px - wx) * sn + (pz - wz) * c) / s;
      const e = Math.hypot(ex / STEP_X, ez / STEP_F);
      if (e > 2.5) {
        // shoved well off it before a step could fix it: the foot slides
        px = wx + (px - wx) * (2.5 / e);
        pz = wz + (pz - wz) * (2.5 / e);
        S.x[i] = px;
        S.z[i] = pz;
      }
      if (e > 1 && S.u[1 - i] < 0) {
        S.u[i] = 0;
        S.sx[i] = px;
        S.sz[i] = pz;
      }
    }
    const dx = px - z.wx, dz = pz - z.wz;
    _st.x[i] = (dx * c - dz * sn) / s;
    _st.z[i] = (dx * sn + dz * c) / s;
    _st.y[i] = P.ankleY + lift;
    _st.ph[i] = 0;
    _st.planted[i] = S.u[i] < 0;
  }
  keepReach(z, p, _st, _st.planted);
  legsIK(z, p, _st);
}

function poseAttack(z, p) {
  const st = z.st, type = z.type;
  const t = z.stateT;
  const per = (z.def.rate || 1) / z.rate;
  const u = (t % per) / per;
  // lower body: keep walking (or running) if moving, else braced
  const mv = z.sub ?? (z.speed > 0.4 ? 1 : 0);
  if (mv) poseLoco(z, p, mv === 2);
  else {
    clearPose(p, z.nb);
    if (st.quad) legsStatic(z, p, st.baseT + 0.1, -st.baseK, st.baseT - 0.1, -st.baseK + 0.1, 0.14);
    else legsStatic(z, p, 0.35, -0.35, -0.15, -0.1, st.legSplay || 0.05);
    z.standOn = true;
  }
  // a kind's own swing (zombies/<kind>.js attack), else the two-arm grab
  const attack = ATTACKS[type];
  if (attack) return attack(z, p, u);
  // two-arm grab + claw swipes, lunge with the head (walker, runner, spitter, leaper, roper)
  const lean = st.quad ? -0.75 : -0.42;
  const lunge = Math.max(0, Math.sin(u * TAU));
  R(p, SPINE, lean * 0.5 - 0.12 * lunge, 0.15 * Math.sin(u * TAU), 0);
  A(p, CHEST, lean * 0.5 - 0.1 * lunge, 0.2 * Math.sin(u * TAU), 0);
  for (let side = 0; side < 2; side++) {
    const ui = (u + side * 0.5) % 1;
    const raise = ui < 0.4 ? smooth(ui / 0.4) : ui < 0.55 ? 1 - smooth((ui - 0.4) / 0.15) * 1.35 : -0.35 * (1 - smooth((ui - 0.55) / 0.45));
    arm(p, side, 1.25 + 0.75 * raise, 0.26 - 0.12 * raise, 0.3, 0.2 + 0.25 * Math.max(0, raise), 0.7);
  }
  headLook(p, 0.05 - 0.25 * lunge, 0, z.tilt * 0.15);
  R(p, JAW, -0.25 - 0.5 * Math.max(0, Math.sin(u * TAU * 2 + 1)), 0, 0);
}

function poseSpecial(z, p) {
  // a kind's own windup (zombies/<kind>.js special), else the lunge bite (walker, runner)
  const special = SPECIALS[z.type];
  if (!special) return poseAttack(z, p);
  if (SPECIAL_FROM_IDLE.has(z.type)) poseIdle(z, p);
  special(z, p);
}

/** Standing over the prey between swipes: braced like the attack, arms up clutching at it, heaving, jaw snapping. */
function poseMenace(z, p) {
  const st = z.st;
  if (st.quad || st.knuckle || st.mantis || st.waddle || z.def.boss) return poseIdle(z, p);
  const t = z.time + z.off;
  legsStatic(z, p, 0.35, -0.35, -0.15, -0.1, st.legSplay || 0.05);
  z.standOn = true;
  const heave = Math.sin(t * 3.4 * z.rate);
  const tw = twitch(z, t, st.twitchy ? 2.2 : 1.1);
  const sway = n1(t * 0.7, z.seed + 13);
  R(p, SPINE, -0.21 + 0.035 * heave - 0.08 * Math.abs(tw), 0.12 * sway, 0.05 * sway);
  R(p, CHEST, -0.21 + 0.03 * heave, 0.08 * sway + 0.1 * tw, 0);
  p[z.nb * 4] = 0.03 * sway;
  posture(z, p);
  for (let s = 0; s < 2; s++) {
    // each hand grabs on its own slow rhythm: reach out, clutch, pull back
    const g = Math.sin(t * (2.1 + 0.4 * s) * z.rate + s * 2.3 + z.seed);
    const n = n1(t * 1.3, z.seed + 20 + s);
    arm(p, s, 1.3 + 0.18 * g + 0.1 * n + 0.2 * tw, 0.24 - 0.06 * g, 0.3, 0.25 + 0.35 * Math.max(0, -g), 0.55 + 0.25 * Math.max(0, g));
  }
  headLook(p, 0.05 + 0.04 * heave + tw * 0.25, n1(t * 0.9, z.seed + 6) * 0.2 + tw * 0.35, z.tilt * 0.2 + tw * 0.2, 0.5);
  R(p, JAW, -0.3 - 0.35 * Math.max(0, Math.sin(t * 6.3 + 0.7 * n1(t, z.seed))) - 0.2 * Math.abs(tw), 0, 0);
}

/** Shade pinned by light (ZANIM.FROZEN): it shrinks back from it, hunched, head down behind both hands over its eyes. */
function poseCover(z, p) {
  const st = z.st;
  legsStatic(z, p, 0.3, -0.45, -0.12, -0.15, st.legSplay || 0.08);
  z.standOn = true;
  R(p, HIPS, 0.05, 0, 0);
  R(p, SPINE, -0.2, 0.1, 0);
  R(p, CHEST, -0.22, 0.06, 0);
  posture(z, p);
  headLook(p, -0.35, -0.1, z.tilt * 0.15, 0.4);
  arm(p, 0, 0.75, -0.35, 0.35, 2.4, -0.4);
  arm(p, 1, 0.7, -0.35, 0.35, 2.45, -0.4);
  R(p, JAW, -0.55, 0, 0);
}

/** Hit reaction: torso and head snap back, arms jerk out, then it recovers (additive, upper body only). */
function poseFlinch(z, p) {
  const t = z.flinchT, s = z.flinchSide;
  const e = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 7);
  A(p, SPINE, 0.12 * e, 0.12 * s * e, 0.06 * s * e);
  A(p, CHEST, 0.1 * e, 0.1 * s * e, 0);
  A(p, NECK, 0.1 * e, 0, 0);
  A(p, HEAD, 0.3 * e, 0.25 * s * e, 0.22 * s * e);
  A(p, JAW, -0.3 * e, 0, 0);
  A(p, UARM_L, 0.25 * e, 0, -0.35 * e);
  A(p, UARM_R, 0.25 * e, 0, 0.35 * e);
  A(p, FARM_L, 0.3 * e, 0, 0);
  A(p, FARM_R, 0.3 * e, 0, 0);
}

// growl / scream / roar: jaw gape, head lift or thrust, chest heave
const VOX = [
  { dur: 1.4, jaw: 0.5, head: 0.14, chest: 0.04 },
  { dur: 1.0, jaw: 0.95, head: -0.2, chest: -0.08 },
  { dur: 1.6, jaw: 0.85, head: 0.35, chest: 0.12 },
];
function poseVocal(z, p) {
  const V = VOX[z.voxKind], u = z.voxT / V.dur, t = z.time + z.off;
  const e = smooth(u / 0.12) * (1 - smooth((u - 0.75) / 0.25)) * (0.8 + 0.2 * Math.sin(u * 23 + z.seed));
  A(p, JAW, -V.jaw * e - 0.05 * e * Math.sin(t * 37), 0, 0);
  A(p, NECK, V.head * 0.4 * e, 0, 0);
  A(p, HEAD, V.head * 0.6 * e, 0, z.tilt * 0.1 * e);
  A(p, CHEST, V.chest * e, 0, 0);
}

// ------------------------------------------------------------------ gaze: nearby zombies turn their heads to stare at the viewer
export const viewer = { x: 0, y: 0, z: 0, on: false };
/** Camera position the zombies may stare at this frame (call once per frame). */
export function setZombieViewer(x, y, z) {
  viewer.x = x;
  viewer.y = y;
  viewer.z = z;
  viewer.on = true;
}
const GAZE_NEAR = 13, GAZE_FAR = 19;
export const COVER_T = 0.14; // s a shade the light catches takes to get its hands up over its eyes (hold)
/** Updates the instance's smoothed gaze (yaw/pitch relative to its facing, weight). */
export function updateGaze(z, dt) {
  const st = z.state;
  let want = 0, yaw = z.gazeYaw, pitch = z.gazePitch;
  if (viewer.on && st !== ZANIM.DEAD && st !== ZANIM.STAGGER && st !== ZANIM.AIRBORNE && st !== ZANIM.SPECIAL) {
    const o = z.object.position;
    const dx = viewer.x - o.x, dz = viewer.z - o.z;
    const d = Math.hypot(dx, dz);
    const c = Math.cos(z.wyaw), sn = Math.sin(z.wyaw);
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // viewer in the body's frame (front = -z)
    const a = Math.atan2(-lx, -lz);
    // feeding zombies only look up when someone gets close
    const range = st === ZANIM.EAT ? 7 : GAZE_FAR;
    if (d < range && Math.abs(a) < 1.9) {
      want = clamp((range - d) / (range - (st === ZANIM.EAT ? 5 : GAZE_NEAR)), 0, 1) * (st === ZANIM.RUN ? 0.6 : 1);
      yaw = clamp(a, -1.15, 1.15);
      pitch = clamp(Math.atan2(viewer.y - (o.y + z.def.headY), Math.max(d, 0.5)), -0.75, 0.6);
    }
  }
  // the head follows in quick jerks (fast when far off, settling slowly), not a smooth servo
  const ky = Math.min(1, dt * (Math.abs(yaw - z.gazeYaw) > 0.35 ? 9 : 3));
  z.gazeYaw += (yaw - z.gazeYaw) * ky;
  z.gazePitch += (pitch - z.gazePitch) * Math.min(1, dt * 4);
  z.gazeW += (want - z.gazeW) * Math.min(1, dt * (want > z.gazeW ? 2.5 : 1.5));
}
/** Turns neck + head (and a little chest) so the face points along the gaze. */
function applyGaze(z, p) {
  const w = z.gazeW;
  const curYaw = p[HIPS * 4 + 1] + p[SPINE * 4 + 1] + p[CHEST * 4 + 1] + p[NECK * 4 + 1] + p[HEAD * 4 + 1];
  const curPitch = chestPitch(p) + p[NECK * 4] + p[HEAD * 4];
  const dy = (z.gazeYaw - curYaw) * w, dp = (z.gazePitch - curPitch) * w;
  p[CHEST * 4 + 1] += dy * 0.15;
  p[NECK * 4 + 1] += dy * 0.35;
  p[HEAD * 4 + 1] += dy * 0.5;
  p[NECK * 4] += dp * 0.4;
  p[HEAD * 4] += dp * 0.6;
  p[HEAD * 4 + 2] += z.tilt * 0.12 * w; // head cocked while it stares
}

function poseAir(z, p) {
  const t = z.stateT, st = z.st, type = z.type;
  if (type === ZTYPE.LEAPER || st.quad) {
    // pounce: limbs spread forward
    const k = smooth(t / 0.2);
    legsStatic(z, p, 0.2 - 0.6 * k, -0.4 - 0.6 * k, 0.1 - 0.5 * k, -0.5 - 0.5 * k, 0.25);
    p[z.nb * 4 + 1] = 0;
    R(p, SPINE, -0.55, 0, 0);
    R(p, CHEST, -0.3, 0, 0);
    arm(p, 0, 1.7 + Math.sin(t * 20) * 0.08, 0.7, 0.2, 0.3, 0.5);
    arm(p, 1, 1.7 - Math.sin(t * 20) * 0.08, 0.7, 0.2, 0.3, 0.5);
    headLook(p, 0.1, 0, 0, 0.4);
    R(p, JAW, -0.8, 0, 0);
    return;
  }
  const f = Math.sin(t * 9);
  R(p, SPINE, -0.1, 0, 0);
  R(p, CHEST, 0.05, 0, 0);
  R(p, THIGH_L, 0.7 + 0.2 * f, 0, -0.1);
  R(p, SHIN_L, -1.0, 0, 0);
  R(p, THIGH_R, 0.3 - 0.2 * f, 0, 0.1);
  R(p, SHIN_R, -0.6, 0, 0);
  arm(p, 0, 1.9 + 0.3 * f, 0.7, 0, 0.4, 0.3);
  arm(p, 1, 1.9 - 0.3 * f, 0.7, 0, 0.4, 0.3);
  headLook(p, 0.2, 0, 0);
  R(p, JAW, -0.6, 0, 0);
}

function poseStagger(z, p) {
  const t = z.stateT, st = z.st;
  const e = Math.exp(-t * 4.5);
  const w = Math.sin(t * 9) * Math.exp(-t * 3);
  const lean = st.quad ? -0.8 : st.knuckle ? -0.3 : -0.1;
  legsStatic(z, p, -0.25 * e + (st.baseT || 0) * 0.7, -0.35 - (st.baseK || 0) * 0.7, 0.3 * e + (st.baseT || 0) * 0.7, -0.3 * e - (st.baseK || 0) * 0.7, 0.1);
  R(p, SPINE, lean * 0.5 + 0.35 * e + 0.05 * w, 0.2 * w, 0.1 * w);
  R(p, CHEST, lean * 0.5 + 0.3 * e, 0.1 * w, 0);
  arm(p, 0, 0.8 * e + 0.2, 0.6 * e + 0.15, 0, 0.5, 0.3);
  arm(p, 1, 0.9 * e + 0.2, 0.7 * e + 0.15, 0, 0.6, 0.3);
  headLook(p, 0.6 * e + 0.1 + 0.1 * w, 0.2 * w, 0.3 * w);
  R(p, JAW, -0.5 * e - 0.1, 0, 0);
  p[z.nb * 4 + 2] += 0.12 * (1 - e);
}

function poseDead(z, p) {
  const t = z.stateT;
  const dir = z.deadDir; // 1 = fall forward (face down), -1 = backward (face up)
  const P = z.P;
  const buckle = smooth(t / 0.28);
  const k = clamp((t - 0.08) / 0.55, 0, 1);
  const fall = k * k;
  const settle = t > 0.63 ? Math.exp(-(t - 0.63) * 10) * Math.sin((t - 0.63) * 25) * 0.04 : 0;
  const up = 1 - fall;
  // legs: knees buckle, then lie flat (face-up: one knee raised)
  const bentL = z.seed & 2 ? 1 : 0;
  if (dir > 0) {
    R(p, THIGH_L, 0.55 * buckle * up, 0, -0.1 * fall);
    R(p, SHIN_L, -0.9 * buckle * up - (bentL ? 0.9 : 0.15) * fall, 0, 0);
    R(p, FOOT_L, 0.6 * fall, 0, 0);
    R(p, THIGH_R, 0.4 * buckle * up, 0, 0.18 * fall);
    R(p, SHIN_R, -0.7 * buckle * up - 0.1 * fall, 0, 0);
    R(p, FOOT_R, 0.7 * fall, 0, 0);
  } else {
    R(p, THIGH_L, 0.55 * buckle * up + (bentL ? 0.7 : 0.05) * fall, 0, -0.12 * fall);
    R(p, SHIN_L, -0.9 * buckle * up - (bentL ? 1.2 : 0.05) * fall, 0, 0);
    R(p, FOOT_L, -0.3 * fall, 0, 0);
    R(p, THIGH_R, 0.4 * buckle * up + 0.05 * fall, 0, 0.2 * fall);
    R(p, SHIN_R, -0.7 * buckle * up - 0.05 * fall, 0, 0);
    R(p, FOOT_R, -0.4 * fall, 0, 0);
  }
  // straighten the spine as the body lands
  const sp = (z.st.idleLean || 0) * up;
  R(p, SPINE, sp * 0.5, 0.12 * fall * dir, 0.05 * fall);
  R(p, CHEST, sp * 0.5, 0.1 * fall * dir, 0);
  R(p, NECK, 0, 0, 0);
  R(p, HEAD, 0, (z.seed & 4 ? 1 : -1) * 1.2 * fall, 0);
  R(p, JAW, -0.35, 0, 0);
  // arms flop out in the ground plane (abduction, not pitch, so they rest on the ground)
  const as = z.seed & 8 ? 1 : 0;
  R(p, UARM_L, 0.4 * up, 0, -(0.25 * up + (as ? 2.6 : 0.6) * fall));
  R(p, FARM_L, 0.35 * up + 0.12 * fall, 0, 0);
  R(p, HAND_L, 0, 0, 0);
  R(p, UARM_R, 0.4 * up, 0, 0.25 * up + (as ? 0.5 : 2.3) * fall);
  R(p, FARM_R, 0.3 * up + 0.12 * fall, 0, 0);
  R(p, HAND_R, 0, 0, 0);
  // topple the whole body around the feet
  R(p, ROOT, -dir * (HALF * fall + settle), 0, 0);
  const n = z.nb * 4;
  const drop = (P.thighLen + P.shinLen) * (1 - Math.cos(0.55)) * buckle * up * 0.6;
  p[n + 1] = -drop + (P.depth || 0.12) * 1.15 * fall;
  p[n + 2] = dir * 0.45 * fall * (P.hipY / 0.93);
}

function poseEat(z, p) {
  const t = z.time + z.off;
  const P = z.P;
  // kneel
  const th = 0.3;
  R(p, THIGH_L, th, 0, -0.15);
  R(p, SHIN_L, -(HALF + th) - 0.05, 0, 0);
  R(p, FOOT_L, 0.5, 0, 0);
  R(p, THIGH_R, th + 0.25, 0, 0.12);
  R(p, SHIN_R, -(HALF + th + 0.25) - 0.05, 0, 0);
  R(p, FOOT_R, 0.5, 0, 0);
  const hipH = P.thighLen * Math.cos(th) + (z.st.knuckle ? 0.12 : 0.06);
  p[z.nb * 4 + 1] = hipH - P.thighY;
  const tear = Math.max(0, Math.sin(t * 2.4));
  const chew = Math.sin(t * 9);
  R(p, SPINE, -0.55 + 0.1 * tear, 0, 0);
  R(p, CHEST, -0.5 + 0.12 * tear, 0.1 * Math.sin(t * 1.2), 0);
  headLook(p, -0.45 + 0.35 * tear, 0.25 * Math.sin(t * 5) * tear, 0.2 * tear);
  R(p, JAW, -0.25 - 0.2 * chew, 0, 0);
  const pl = Math.sin(t * 2.4 + 1);
  arm(p, 0, 0.45 + 0.25 * pl, 0.3, 0.3, 0.7 + 0.5 * Math.max(0, pl), 0.6);
  arm(p, 1, 0.45 - 0.25 * pl, 0.3, 0.3, 0.7 + 0.5 * Math.max(0, -pl), 0.6);
}

/**
 * Climbing out of a grave (ZANIM.RISE). The server brings its feet up from a body's height under the grass in two
 * heaves (riseDepth in shared/cemetery.js: the ground hides what is not out yet); this is what the body does
 * meanwhile. It claws its way up with its arms over its head, plants its hands on the grass with its chest out,
 * then gets a knee over the lip and stands.
 */
function poseRise(z, p) {
  const st = z.st, t = z.time + z.off;
  if (st.quad || st.knuckle) return poseIdle(z, p);
  const u = clamp(z.stateT / CEMETERY.RISE, 0, 1);
  const up = 1 - smooth((u - 0.28) / 0.2); // clawing up through the earth
  const stand = smooth((u - 0.55) / 0.45); // straightening up at the end
  const haul = 1 - stand; // (and between the two: hands planted, hauling)
  const claw = Math.sin(t * 8.5), shake = Math.sin(t * 31) * 0.03 * haul;
  const lean = lerp(lerp(-0.72, -0.12, up), st.idleLean || 0, stand);
  // a knee comes up over the lip of the grave half way through the second heave
  const step = Math.sin(PI * clamp((u - 0.55) / 0.4, 0, 1));
  const kL = z.limpSide ? 0 : step, kR = z.limpSide ? step : 0;
  legsStatic(z, p, 1.05 * kL, -1.5 * kL, 1.05 * kR, -1.5 * kR, 0.06);
  R(p, SPINE, lean * 0.55 + shake, 0.12 * claw * up, 0.05 * claw * up);
  R(p, CHEST, lean * 0.45, 0.1 * claw * up, 0);
  posture(z, p);
  // overhead, one hand after the other; then forward and down onto the grass; then hanging as they always do
  for (let side = 0; side < 2; side++) {
    const c = side ? -claw : claw;
    const pitch = lerp(lerp(1.0, 2.7 + 0.3 * c, up), side ? 0.14 : 0.18, stand);
    const elbow = lerp(lerp(0.3, 0.7 - 0.45 * c, up), 0.4, stand);
    arm(p, side, pitch, lerp(0.3, 0.1 + (st.armOut || 0), stand), 0.25, elbow, lerp(0.65, 0.35, stand));
  }
  headLook(p, lerp(lerp(0.35, 0.75, up), st.headPitch, stand), 0.3 * Math.sin(t * 2.3) * haul, z.tilt * st.headTilt + 0.2 * claw * up, 0.3);
  R(p, JAW, -st.jaw - 0.45 * haul - 0.1 * claw * up, 0, 0);
}

// ------------------------------------------------------------------ legs shot off (ZombieInstance.setLegs)
// A shot in the leg trips it (ZANIM.STUMBLE). With one leg gone it hops along on the other, with both gone it lies
// prone and drags itself forward by its arms. The server's speeds (HOBBLE_SPEED, CRAWL_SPEED in constants.js) and its
// crawler hitbox (CRAWL_HEAD_FWD) are what these poses are drawn to.
const HOP_MIN = 0.42, HOP_MAX = 1.0; // ground one hop covers (m), by speed
const CRAWL_CYCLE = 0.95; // ground one crawl cycle covers (m): a pull of each arm
const CRAWL_REACH = 2.75, CRAWL_TUCK = 1.05; // upper arm swung out ahead of the shoulder / drawn back beside the ribs (rad)

/** Ground covered by one cycle of the phase for a zombie that has lost legs. */
export function legCycleLen(z, speed) {
  return z.legs === 3 || z.crawler ? CRAWL_CYCLE : clamp(0.34 + 0.2 * speed, HOP_MIN, HOP_MAX);
}

/** Tripped by a shot in the leg: that knee gives, the body pitches forward over it and the arms fly out to catch it. */
function poseStumble(z, p) {
  if (z.legs) return poseHobble(z, p);
  const st = z.st, P = z.P, n = z.nb * 4, t = z.stateT;
  const k = smooth(t / 0.1) * Math.exp(-Math.max(0, t - 0.1) * 3.4); // snaps in, then it catches itself
  const w = Math.sin(t * 12) * Math.exp(-t * 3.5);
  const b = z.limpSide; // the leg that gives way
  const lean = (st.idleLean || 0) * 0.5;
  const tB = 0.75 * k, kB = -1.35 * k - 0.1; // buckled: the knee drops forward
  const tC = -0.3 * k, kC = -0.45 * k - 0.08; // the other is left behind, bent
  if (b) legsStatic(z, p, tC, kC, tB, kB, 0.07);
  else legsStatic(z, p, tB, kB, tC, kC, 0.07);
  p[n + 1] -= (P.thighLen + P.shinLen) * 0.16 * k; // (legsStatic grounds the straighter leg; the trip drops it further)
  R(p, HIPS, 0, (b ? -1 : 1) * 0.2 * k, (b ? 1 : -1) * 0.14 * k);
  R(p, SPINE, lean - 0.38 * k + 0.05 * w, 0.14 * w, (b ? -1 : 1) * 0.12 * k);
  R(p, CHEST, lean - 0.3 * k, 0.1 * w, 0);
  posture(z, p);
  arm(p, 0, 0.35 + 0.95 * k, 0.2 + 0.5 * k, 0.1, 0.45 - 0.2 * k, 0.4);
  arm(p, 1, 0.3 + 1.1 * k, 0.2 + 0.4 * k, 0.1, 0.5 - 0.25 * k, 0.4);
  headLook(p, st.headPitch - 0.35 * k + 0.12 * w, 0.2 * w, z.tilt * st.headTilt + 0.25 * w, 0.3);
  R(p, JAW, -st.jaw - 0.45 * k, 0, 0);
}

/**
 * One leg left: it hops. Each cycle of the phase is one hop - the foot lands ahead, the body vaults over it, the knee
 * sinks and shoves off - while the stump swings and the arms flail for balance. A fresh hit (ZANIM.STUMBLE) nearly
 * has it over.
 */
function poseHobble(z, p) {
  const st = z.st, P = z.P, n = z.nb * 4, t = z.time + z.off;
  const side = z.legs === 1 ? 1 : 0; // the leg it has left (legs: bit 0 = the left is gone)
  const sg = side ? 1 : -1;
  const good = side ? THIGH_R : THIGH_L, gone = side ? THIGH_L : THIGH_R;
  const u = frac(z.phase / TAU);
  const trip = z.state === ZANIM.STUMBLE ? smooth(z.stateT / 0.1) * Math.exp(-Math.max(0, z.stateT - 0.1) * 3.2) : 0;
  const hops = Math.floor(z.phase / TAU);
  if (z.hopN !== undefined && hops !== z.hopN) z.footfalls++;
  z.hopN = hops;
  z.hopOn = true;
  // On the ground for the first ST of the cycle, in the air for the rest. The ankle is placed and the leg fitted to
  // it: planted, it is left behind by exactly the ground the body covers meanwhile, so the foot does not skate
  const ST = 0.62, L1 = P.thighLen, L2 = P.shinLen, L = L1 + L2;
  const half = Math.min(L * 0.45, (legCycleLen(z, z.speed) * ST) / (2 * (z.rate || 1) * (z.gScale || 1))); // half the planted stretch (rig units)
  const top = Math.sqrt(L * L * 0.96 - half * half); // hip height with the leg all but straight at either end of it
  let fz, hip, foot = 0, toe = 0;
  if (u < ST) {
    const s = u / ST;
    fz = -half * (1 - 2 * s); // lands ahead, is left behind
    hip = top - L * (0.07 + 0.05 * trip) * Math.sin(PI * Math.min(1, s * 1.3)); // sinks on landing, straightens to shove off
  } else {
    const f = (u - ST) / (1 - ST), arc = Math.sin(PI * f);
    fz = half * (1 - 2 * smooth(f));
    hip = top + L * (0.045 + 0.03 * Math.min(1, z.speed / 2.5)) * arc;
    foot = L * 0.09 * arc;
    toe = 0.5 * arc;
  }
  // (the two-bone fit of legsIK, in the plane the leg swings in)
  const vy = -(hip - foot);
  const d = clamp(Math.hypot(fz, vy), Math.abs(L1 - L2) + 0.02, L * 0.9995);
  const ck = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const kn = -Math.acos(ck);
  let th = Math.atan2(fz, vy) - Math.atan2(-L2 * Math.sin(kn), -(L1 + L2 * ck));
  if (th > PI) th -= TAU;
  else if (th < -PI) th += TAU;
  R(p, good, th, 0, sg * 0.04);
  R(p, good + 1, kn, 0, 0);
  R(p, good + 2, toe - (th + kn), 0, 0);
  // the stump: held up in front, pumping against the hop
  const pump = Math.sin(z.phase);
  R(p, gone, 0.5 + 0.28 * pump, 0, -sg * 0.1);
  R(p, gone + 1, -0.3, 0, 0);
  p[n + 1] += hip - L;
  // the weight is over the one foot: the hips shift across, the shoulders lean back out to balance
  p[n] -= sg * P.hipW * 0.8;
  const land = u < 0.25 ? Math.sin((u / 0.25) * PI) : 0; // the jolt of each landing
  const lean = st.walkLean * 0.55;
  R(p, HIPS, 0.04 * land, -sg * 0.1 + 0.08 * pump, -sg * (0.1 + 0.05 * land));
  R(p, SPINE, lean * 0.5 - 0.06 * land - 0.3 * trip, 0.08 * pump, sg * (0.12 + 0.04 * land));
  R(p, CHEST, lean * 0.5 - 0.05 * land - 0.25 * trip, 0.06 * pump, sg * 0.06);
  posture(z, p);
  const wave = n1(t * 1.6, z.seed + 17) * 0.2;
  arm(p, side, 0.45 + 0.3 * pump + 0.6 * trip, 0.5 + 0.15 * land + wave, 0.1, 0.5 + 0.2 * land, 0.3);
  arm(p, 1 - side, 0.75 - 0.3 * pump + 0.7 * trip, 0.75 + 0.2 * land - wave, 0.1, 0.35, 0.3);
  headLook(p, st.headPitch - 0.08 * land - 0.3 * trip, n1(t * 0.5, z.seed + 4) * 0.25, z.tilt * st.headTilt - sg * 0.08, 0.3);
  R(p, JAW, -st.jaw * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.1))) - 0.3 * trip, 0, 0);
}

/** Standing (not hopping) on the one leg it has left: the hips shift across over that foot, the shoulders back out. */
function oneLegged(z, p) {
  if (z.hopOn) return;
  const P = z.P, n = z.nb * 4, t = z.time + z.off;
  const sg = z.legs === 1 ? 1 : -1;
  const wob = n1(t * 0.9, z.seed + 31);
  p[n] -= sg * P.hipW * 0.8 + wob * 0.02;
  A(p, HIPS, 0, 0, -sg * 0.08);
  A(p, SPINE, 0, 0, sg * (0.1 + 0.03 * wob));
  A(p, UARM_L, 0, 0, -0.18 - 0.08 * wob);
  A(p, UARM_R, 0, 0, 0.18 - 0.08 * wob);
}

/** Head centre (y up, z back) of the spine chain bent only about X, in the root's frame: rig units. */
const _hc = { y: 0, z: 0 };
function headYZ(z, p) {
  const P = z.P;
  let th = p[HIPS * 4];
  let y = P.hipY + Math.cos(th) * P.spineLen, zz = Math.sin(th) * P.spineLen;
  th += p[SPINE * 4];
  y += Math.cos(th) * P.chestLen;
  zz += Math.sin(th) * P.chestLen;
  th += p[CHEST * 4];
  y += Math.cos(th) * P.neckOff - Math.sin(th) * P.neckZ;
  zz += Math.sin(th) * P.neckOff + Math.cos(th) * P.neckZ;
  th += p[NECK * 4];
  y += Math.cos(th) * P.neckLen - Math.sin(th) * (P.headZ - P.neckZ);
  zz += Math.sin(th) * P.neckLen + Math.cos(th) * (P.headZ - P.neckZ);
  th += p[HEAD * 4];
  _hc.y = y + Math.cos(th) * P.headR * 0.9;
  _hc.z = zz + Math.sin(th) * P.headR * 0.9;
  return _hc;
}

/** Height over the entity's ground (rig units) of the point (0, ly, 0) of a bone, from the pose alone. */
function boneHeight(z, p, b, ly) {
  const par = z.parent, lp = z.localPos, n = z.nb * 4;
  _v3.x = 0;
  _v3.y = ly;
  _v3.z = 0;
  for (let i = b; i > 0; i = par[i]) {
    rotXYZ(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], false);
    if (i === ROOT) _v3.y += p[n + 1];
    else {
      _v3.x += lp[i * 3];
      _v3.y += lp[i * 3 + 1];
      _v3.z += lp[i * 3 + 2];
    }
  }
  return _v3.y;
}

/**
 * An arm of a body lying prone, from _arm[side * 6..]: swung `out` from the ribs towards straight ahead, lifted, the
 * elbow hitched `up` off the ground. The elbow then bends as far as it takes to put the hand `hand` above the ground
 * (0: flat on it), or by `elbow` when hand < 0 (in the air).
 */
const _arm = new Float32Array(12);
function crawlArm(z, p, side) {
  const o = side * 6, sg = side ? 1 : -1, ua = side ? UARM_R : UARM_L;
  const hand = _arm[o + 5];
  let elbow = _arm[o + 3];
  R(p, ua, _arm[o + 1], -sg * _arm[o + 2], sg * _arm[o]);
  R(p, ua + 2, _arm[o + 4], 0, 0);
  if (hand >= 0 && z.parent) {
    // the forearm swings down towards the ground as the elbow bends: bisect for the bend that lands the palm
    const tip = -z.P.handLen * 0.6, want = 0.035 + hand;
    let lo = 0.05, hi = 2.1;
    for (let i = 0; i < 9; i++) {
      elbow = (lo + hi) * 0.5;
      p[(ua + 1) * 4] = elbow;
      if (boneHeight(z, p, ua + 2, tip) > want) lo = elbow;
      else hi = elbow;
    }
  }
  R(p, ua + 1, elbow, 0, 0);
}

/**
 * Both legs gone: it lies on its front, chest propped up, and hauls itself along - one arm reaches out, plants and
 * drags the body past it while the other comes forward, the stumps trailing. Every state is played from the ground:
 * it rears and swipes to attack, drops flat when hit and goes limp when it dies. The root is placed so that the head
 * is CRAWL_HEAD_FWD ahead of the entity, where the server's hitbox for a crawler has it.
 */
function poseCrawl(z, p) {
  const st = z.st, P = z.P, n = z.nb * 4, t = z.time + z.off, s = z.state;
  const dead = s === ZANIM.DEAD;
  const limp = dead ? smooth(z.stateT / 0.5) : 0;
  const hit = s === ZANIM.STUMBLE || s === ZANIM.STAGGER ? Math.exp(-z.stateT * 3.5) : 0;
  const up = (1 - limp) * (1 - 0.75 * hit); // how much of its propped-up posture it is holding
  const attack = s === ZANIM.ATTACK;
  const drag = !dead && !attack && (s === ZANIM.WALK || s === ZANIM.RUN || z.speed > 0.3) ? Math.min(1, z.speed / 0.5) : 0;
  const ph = z.phase;
  const br = Math.sin(t * 1.5 * z.rate);
  // the pull of each arm: 0..1 from its reach to its tuck while planted (the first PULL of its cycle), then back
  const PULL = 0.58;
  let rear = 0, lunge = 0, bite = 0;
  if (attack) {
    const per = (z.def.rate || 1) / z.rate;
    const a = (z.stateT % per) / per;
    rear = a < 0.3 ? smooth(a / 0.3) : 1 - smooth((a - 0.3) / 0.14); // rears up on one arm...
    lunge = a < 0.3 ? 0 : a < 0.48 ? smooth((a - 0.3) / 0.18) : 1 - smooth((a - 0.48) / 0.4); // ...and throws itself at the ankles
    bite = Math.max(0, Math.sin(a * TAU * 2 + 1));
  }
  const special = s === ZANIM.SPECIAL ? smooth(z.stateT / 0.3) : 0;
  if (special) z.bellyPulse = 0.12;
  // torso: prone, arched up off the ground from the hips to the head
  const arch = (0.9 + 0.1 * br * (1 - drag) + 0.35 * rear - 0.25 * lunge + 0.2 * special) * up;
  const sway = Math.sin(ph) * drag; // +1 while the right arm pulls
  R(p, ROOT, -HALF, 0.1 * sway * up + 0.05 * limp * z.tilt, 0);
  R(p, HIPS, 0.04 * arch, 0, 0.1 * sway * up);
  R(p, SPINE, 0.14 * arch, 0.06 * sway, -0.12 * sway * up);
  R(p, CHEST, 0.2 * arch, 0.1 * sway, -0.06 * sway * up);
  const look = n1(t * 0.4, z.seed + 4) * 0.3 * up * (1 - drag * 0.5);
  R(p, NECK, 0.3 * arch, look * 0.3, look * 0.5 + 0.9 * limp * z.tilt);
  R(p, HEAD, 0.38 * arch + 0.1 * bite * up, look * 0.3, look * 0.6 + z.tilt * st.headTilt * 0.5 * up);
  R(p, JAW, -(st.jaw * (0.6 + 0.4 * Math.abs(Math.sin(t * 1.9))) + 0.45 * bite + 0.3 * hit + 0.25 * special) * (1 - 0.6 * limp) - 0.2 * limp, 0, 0);
  // the stumps trail behind, twitching with each pull
  const kick = Math.sin(ph + 0.6) * drag;
  R(p, THIGH_L, -0.06 - 0.1 * Math.max(0, kick) * up, 0, -0.1 - 0.05 * limp);
  R(p, THIGH_R, -0.06 - 0.1 * Math.max(0, -kick) * up, 0, 0.1 + 0.16 * limp);
  // arms
  for (let side = 0; side < 2; side++) {
    const a = frac(ph / TAU + (side ? 0 : 0.5));
    const pull = a < PULL ? a / PULL : 1 - smooth((a - PULL) / (1 - PULL)); // 0 at full reach, 1 tucked
    const swing = a < PULL ? 0 : Math.sin(((a - PULL) / (1 - PULL)) * PI); // off the ground on the way forward
    // at rest it is propped on both hands, elbows out
    let out = lerp(1.75 + 0.12 * br * (side ? 1 : -1), lerp(CRAWL_REACH, CRAWL_TUCK, pull), drag);
    let lift = lerp(0.12, 0.1 + 0.3 * swing, drag);
    let hitch = lerp(0.35, 0.5 * Math.sin(PI * pull) * (1 - swing), drag) * up; // elbows up and out, like a lizard's
    let wrist = lerp(-0.45, -0.45 + 0.4 * swing, drag);
    let hand = 0.16 * swing * drag; // how far off the ground the hand is carried
    let elbow = 0;
    if (attack && side === z.armSide) {
      // the swiping arm: drawn back and up as it rears, flung out at the ankles
      out = lerp(1.5, 2.7, lunge);
      lift = 0.75 * rear + 0.25 * lunge;
      hitch = 0;
      elbow = 1.2 * rear * (1 - lunge) + 0.25;
      wrist = 0.5 * lunge;
      hand = -1;
    } else if (attack) out = 1.6;
    // hit: the arms splay and it drops onto its chest; dead: they lie where they fall
    const o = side * 6;
    _arm[o] = lerp(out, side === (z.seed & 8 ? 1 : 0) ? 2.5 : 1.1, limp) + 0.35 * hit * (side ? 1 : -1) * (z.flinchSide || 1);
    _arm[o + 1] = lerp(lift, 0.02, limp);
    _arm[o + 2] = hitch;
    _arm[o + 3] = elbow;
    _arm[o + 4] = lerp(wrist, -0.1, limp);
    _arm[o + 5] = hand;
  }
  // on its belly, the hips on the ground; the head CRAWL_HEAD_FWD ahead of the entity
  const h = headYZ(z, p);
  p[n] = 0;
  p[n + 1] = (P.depth || 0.12) * 1.12 - 0.015 * Math.abs(sway) * up;
  p[n + 2] = -(z.crawler ? z.def.headFwd : CRAWL_HEAD_FWD) / (z.gScale || 1) + h.y - (z.cal ? z.cal.dz : 0);
  // (the hands go down once the body is where it will be)
  for (let side = 0; side < 2; side++) crawlArm(z, p, side);
}

export function poseHumanoid(z) {
  const p = z.pose;
  clearPose(p, z.nb);
  z.sacPulse = 0;
  z.bellyPulse = 0;
  z.abdPulse = 0;
  z.gOn = false;
  z.standOn = false;
  z.hopOn = false;
  if (z.legs === 3 || z.crawler) poseCrawl(z, p);
  else switch (z.state) {
    case ZANIM.STUMBLE: poseStumble(z, p); break;
    case ZANIM.WALK: poseLoco(z, p, false); break;
    case ZANIM.RUN: poseLoco(z, p, true); break;
    case ZANIM.ATTACK: poseAttack(z, p); break;
    case ZANIM.SPECIAL: poseSpecial(z, p); break;
    case ZANIM.AIRBORNE: poseAir(z, p); break;
    case ZANIM.STAGGER: poseStagger(z, p); break;
    case ZANIM.DEAD: poseDead(z, p); break;
    case ZANIM.EAT: poseEat(z, p); break;
    case ZANIM.RISE: poseRise(z, p); break;
    case ZANIM.FROZEN: poseCover(z, p); break;
    default: if (z.sub === 1) poseMenace(z, p); else poseIdle(z, p); break;
  }
  poseExtras(z, p);
  const jh = z.A ? z.A.jawHang : 0; // survivor zombie-mode state has no per-variant extras
  if (jh) A(p, JAW, -jh, 0, z.tilt * jh * 0.35); // dislocated jaw hangs open and askew
  const alive = z.state !== ZANIM.DEAD;
  if (alive && z.voxT < VOX[z.voxKind]?.dur) poseVocal(z, p);
  if (alive && z.state !== ZANIM.STAGGER && z.flinchT < 0.6) poseFlinch(z, p);
  if (z.legs === 3 || z.crawler) return; // prone: poseCrawl has put the head where the server's hitbox has it
  if (z.legs && alive) oneLegged(z, p);
  if (z.gazeW > 0.01) applyGaze(z, p);
  if (z.state !== ZANIM.DEAD && z.state !== ZANIM.EAT) {
    // keep the head over the object origin (server head hitbox is centered on the entity axis)
    p[z.nb * 4 + 2] -= headForward(z, p);
  }
  if (z.gOn) solveLegs(z, p);
  else if (z.standOn && z.wScale) plantStatic(z, p);
}

/** 2D forward kinematics of the spine chain: head-center Z offset relative to the hips. */
function headForward(z, p) {
  const P = z.P;
  let th = p[HIPS * 4];
  let zz = Math.sin(th) * P.spineLen;
  th += p[SPINE * 4];
  zz += Math.sin(th) * P.chestLen;
  th += p[CHEST * 4];
  zz += Math.sin(th) * P.neckOff + Math.cos(th) * P.neckZ;
  th += p[NECK * 4];
  zz += Math.sin(th) * P.neckLen + Math.cos(th) * (P.headZ - P.neckZ);
  th += p[HEAD * 4];
  zz += Math.sin(th) * P.headR * 0.9;
  return zz;
}

function poseExtras(z, p) {
  const t = z.time + z.off;
  const X = z.X;
  const dead = z.state === ZANIM.DEAD;
  if (X.sac !== undefined) {
    const s = 1 + (dead ? -0.2 : 0.06 * Math.sin(t * 3.1) + z.sacPulse);
    p[X.sac * 4 + 3] = s;
  }
  if (X.belly !== undefined) {
    const idle = z.state === ZANIM.IDLE || z.state === ZANIM.SPECIAL;
    const s = 1 + (dead ? 0 : (idle ? 0.05 : 0.025) * Math.sin(t * (z.state === ZANIM.SPECIAL ? 9 : 2.6)) + z.bellyPulse * Math.max(0, Math.sin(t * 9)));
    p[X.belly * 4 + 3] = s;
  }
  if (X.abdomen !== undefined) {
    const walk = z.state === ZANIM.WALK || z.state === ZANIM.RUN;
    R(p, X.abdomen, 0.1 + (walk ? 0.06 * Math.sin(z.phase * 2) : 0.03 * Math.sin(t)), walk ? 0.08 * Math.sin(z.phase) : 0, 0);
    p[X.abdomen * 4 + 3] = 1 + 0.03 * Math.sin(t * 2.2) + z.abdPulse;
  }
  if (X.sleg0 !== undefined) {
    // spider legs: gait synced with phase, alternate pairs
    const walk = z.state === ZANIM.WALK || z.state === ZANIM.RUN || z.speed > 0.3;
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1;
      const ph = z.phase + (i === 0 || i === 3 ? 0 : PI) + i * 0.3;
      const lift = walk ? Math.max(0, Math.sin(ph)) * 0.35 : 0.05 * Math.sin(t * 1.5 + i);
      const swing = walk ? Math.cos(ph) * 0.35 : 0;
      const u = X['sleg' + i], l = X['slegb' + i];
      R(p, u, -chestPitch(p) * 0.8 + swing * 0.3 - lift * 0.2, swing, s * lift);
      R(p, l, lift * 0.6, 0, -s * lift * 0.5);
      if (dead) R(p, u, 0.6, 0, -s * 0.8);
    }
  }
  if (X.xarmL !== undefined) {
    for (let side = 0; side < 2; side++) {
      const u = side ? X.xarmR : X.xarmL, f = side ? X.xfarmR : X.xfarmL;
      const tw = n1(t * 1.3, z.seed + side * 5);
      R(p, u, 0.9 + 0.35 * tw - chestPitch(p), 0, (side ? 1 : -1) * (0.35 + 0.2 * n1(t * 0.9, side)));
      R(p, f, 0.9 + 0.5 * n1(t * 1.7, z.seed + side), 0, 0);
    }
  }
}

