// The pieces every pose of the humanoid dead (and of a survivor) is written with. A pose is a Float32Array of nb * 4 + 3:
// per bone its rotation (euler XYZ) and scale, then the root's offset. characters/pose.js poses with these, and so do
// the kinds' own windups and swings (zombies/<kind>.js special, attack).
import { noise3 } from '../skinning.js';
import { HIPS, SPINE, CHEST, NECK, HEAD, CLAV_L, CLAV_R, UARM_L, UARM_R, THIGH_L, SHIN_L, FOOT_L, THIGH_R, SHIN_R, FOOT_R } from './skeleton.js';

const PI = Math.PI;

export function clearPose(p, nb) {
  for (let i = 0; i < nb; i++) {
    const k = i * 4;
    p[k] = 0;
    p[k + 1] = 0;
    p[k + 2] = 0;
    p[k + 3] = 1;
  }
  p[nb * 4] = 0;
  p[nb * 4 + 1] = 0;
  p[nb * 4 + 2] = 0;
}
export function R(p, b, x, y, z) {
  const k = b * 4;
  p[k] = x;
  p[k + 1] = y;
  p[k + 2] = z;
}
export function A(p, b, x, y, z) {
  const k = b * 4;
  p[k] += x;
  p[k + 1] += y;
  p[k + 2] += z;
}
export const chestPitch = (p) => p[HIPS * 4] + p[SPINE * 4] + p[CHEST * 4];

/** Arm with WORLD-ish pitch (compensating torso lean). side 0 = left, 1 = right. */
export function arm(p, side, pitch, abd, twist, elbow, wrist = 0) {
  const ua = side ? UARM_R : UARM_L;
  const sg = side ? 1 : -1;
  const k = ua * 4;
  p[k] = pitch - chestPitch(p);
  p[k + 1] = twist * sg;
  p[k + 2] = abd * sg;
  p[(ua + 1) * 4] = elbow;
  p[(ua + 2) * 4] = wrist;
}
export function headLook(p, pitch, yaw, roll, neckShare = 0.45) {
  const need = pitch - chestPitch(p) - p[NECK * 4] - p[HEAD * 4];
  p[NECK * 4] += need * neckShare;
  p[HEAD * 4] += need * (1 - neckShare);
  p[NECK * 4 + 1] += yaw * 0.4;
  p[HEAD * 4 + 1] += yaw * 0.6;
  p[HEAD * 4 + 2] += roll;
}
/** Leg cycle; grounds the body via root y. */
export function legCycle(z, p, ph, amp, knee, baseT, baseK, limp, splay = 0) {
  const P = z.P;
  let ext = -1;
  for (let side = 0; side < 2; side++) {
    const th = side ? THIGH_R : THIGH_L;
    const phi = ph + side * PI;
    const s = Math.sin(phi), c = Math.cos(phi);
    let a = amp, k = knee;
    if (limp && side === z.limpSide) {
      a *= 1 - 0.4 * limp;
      k *= 1 - 0.8 * limp;
    }
    const t = baseT + a * s;
    const kn = -(baseK + k * Math.max(0, c) * (0.6 + 0.4 * Math.max(0, s + 0.3)));
    const ft = -(t + kn) * 0.9 + (c > 0 ? 0.25 * c * (amp > 0.05 ? 1 : 0) : 0);
    const sg = side ? 1 : -1;
    R(p, th, t, limp && side === z.limpSide ? sg * 0.25 * limp : 0, sg * splay);
    R(p, th + 1, kn, 0, 0);
    R(p, th + 2, ft, 0, 0);
    const e = P.thighLen * Math.cos(t) * Math.cos(splay) + P.shinLen * Math.cos(t + kn);
    if (e > ext) ext = e;
  }
  p[z.nb * 4 + 1] += ext - (P.thighLen + P.shinLen);
}
/** Static leg pose (both legs), grounded. */
export function legsStatic(z, p, tL, kL, tR, kR, splay = 0) {
  const P = z.P;
  R(p, THIGH_L, tL, 0, -splay);
  R(p, SHIN_L, kL, 0, 0);
  R(p, FOOT_L, -(tL + kL) * 0.9, 0, 0);
  R(p, THIGH_R, tR, 0, splay);
  R(p, SHIN_R, kR, 0, 0);
  R(p, FOOT_R, -(tR + kR) * 0.9, 0, 0);
  const eL = P.thighLen * Math.cos(tL) * Math.cos(splay) + P.shinLen * Math.cos(tL + kL);
  const eR = P.thighLen * Math.cos(tR) * Math.cos(splay) + P.shinLen * Math.cos(tR + kR);
  p[z.nb * 4 + 1] += Math.max(eL, eR) - (P.thighLen + P.shinLen);
}

/** Zombie posture: neck thrust forward, shoulders rolled forward/uneven. */
export function posture(z, p) {
  const st = z.st;
  const nf = st.neckFwd ?? 0.3;
  A(p, NECK, -nf, 0, 0);
  const r = st.shoulderRoll ?? 0.12;
  const u = (z.limpSide ? 1 : -1) * 0.06;
  A(p, CLAV_L, 0, -r, -u);
  A(p, CLAV_R, 0, r, -u);
}

/** Writes into out the pose a crossfade from `from` to `to` has reached, w (0..1) of the way. */
export function blendPose(out, from, to, w) {
  for (let i = 0, n = out.length; i < n; i++) out[i] = from[i] + (to[i] - from[i]) * w;
}

// deterministic per-instance noise helpers
export const n1 = (t, seed) => noise3(t, seed * 1.7, 0.5, 11) * 2 - 1;
