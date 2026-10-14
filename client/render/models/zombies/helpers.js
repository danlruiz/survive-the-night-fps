// What the builders of the dead (zombies/<kind>.js) share: the detail a rig is being built at, a whole dead person on
// the humanoid rig with its leg stumps, and the wounds, skins and heads more than one kind is made of.

import { fbm3, clamp, lerp, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { buildPerson, deadHead, stump } from '../people.js';
import { oldLook } from '../deadlooks.js';
import { ringLoft, blister, onSurf, angleOn } from '../monsters.js';
import { surfPoint, torsoSurf, bodyBuild } from '../humans.js';
import { addHumanoidBones } from '../characters/skeleton.js';

const PI = Math.PI;

// The detail a rig is built at (standardHumanoid reads it): 1 near, LOD_DETAIL for the far copy of the humanoid dead
// (characters/zombie.js getRig sets it round a build).
export let buildDetail = 1;
export function setBuildDetail(d) {
  buildDetail = d;
}
// under this detail a rig is the far copy, and the small things on it are left off (people.js draws the line there too)
const FAR_DETAIL = 0.7;
export const buildingFar = () => buildDetail < FAR_DETAIL;

/** A skin tint (p, n, c) worn on the head (people.js headTint: head-bone coordinates), scaled by k, the normal n. */
export const onHead = (tint, k = 1, n = null) => (lx, ly, lz, c) => tint({ x: lx * k, y: ly * k, z: lz * k }, n, c);

/**
 * What a leg shot off at the knee leaves: a stump under each thigh, on a bone of its own so that it can be kept
 * scaled away until the shin goes (ZombieInstance.setLegs).
 */
export function legStumps(mb, P, L) {
  const r = (L.thighR || 0.078) * 0.7;
  mb.shin = L.pants && !L.pants.shorts ? L.pants.color : L.skin; // what the shin that flies off is wearing
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    mb.addBone('stump' + n, 'thigh' + n, s * P.hipW, P.kneeY, 0);
    stump(mb, 'stump' + n, r, 0.012);
  }
}

/**
 * A whole dead person (people.js) on the humanoid rig, with the stumps a shot-off leg leaves. L: a look (deadlooks.js)
 * or the keys the specials were written with before (oldLook). Returns people.js's { H, T, arms, legs, B, L }.
 */
export function standardHumanoid(mb, P, L, detail = buildDetail, prep = null) {
  addHumanoidBones(mb, P);
  const NL = L.dead ? L : oldLook(L);
  mb.dirt = NL.dirt || { y0: 0.4, k: 0.5 };
  // (prep: what must be made on the trunk before its skin is - a wound, whose hole the skin and the clothes are cut by)
  if (prep && detail >= FAR_DETAIL) prep(torsoSurf(mb, P, bodyBuild(NL)));
  const built = buildPerson(mb, P, NL, detail);
  built.L = NL;
  legStumps(mb, P, NL);
  return built;
}

/** A flank torn open: bone ribs over a wound in the side of the chest (built: standardHumanoid's). */
export function exposedRibs(mb, P, side, y0, n, built) {
  const chestY = P.chestY, cb = mb.bonePos('chest');
  for (let i = 0; i < n; i++) {
    const y = chestY + y0 + i * 0.034;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const p = surfPoint(built.T, side * (0.5 + k * 0.28), y - k * 0.006, 0.003);
      pts.push([p[0] - cb[0], p[1] - cb[1], p[2] - cb[2]]);
    }
    mb.tube('chest', pts, 0.0085, 0.007, { rs: 4, ts: 4, color: 0xd8ccb0, region: CR.BONE, blood: false, cap: false });
  }
  const L = built.L;
  const c = surfPoint(built.T, side * 1.0, chestY + y0 + n * 0.017, 0);
  (L.wounds || (L.wounds = [])).push([c[0], c[1], c[2], 0.1]);
}

/** A wound's paint on a person's skin (people.js skinTint works in model space): only on the trunk, between heights. */
export const ripTint = (T, rip, y0, y1, xw) => (p, n, c) => {
  if (p.y > y0 && p.y < y1 && Math.abs(p.x) < xw) rip.paint(angleOn(T, p.x, p.y, p.z), p.y, c);
};

// ------------------------------------------------------------------ the swollen: boomer and Bloater
// gas-green skin gone livid in patches, a marbling of dark veins running down it, the stretched underside bruised
export const swollen = (seed, f = 7) => (p, n, c) => {
  const m = fbm3(p.x * f, p.y * f, p.z * f, 2, seed);
  if (m > 0.58) c.lerp(color(0x566f22), Math.min(0.6, (m - 0.58) * 5));
  if (m < 0.34) c.lerp(color(0x7a4a52), Math.min(0.45, (0.34 - m) * 5));
  c.lerp(color(0x4a3a30), clamp(-n.y * 0.5, 0, 0.35));
};
export const marbled = (seed, w = 0.022) => (t, y, c) => {
  const v = fbm3(Math.cos(t) * 2.6 + seed, y * 1.1, Math.sin(t) * 2.6, 3, seed);
  if (Math.abs(v - 0.5) < w) c.lerp(color(0x24401a), 0.75);
  const v2 = fbm3(Math.cos(t) * 5 + seed, y * 2.4, Math.sin(t) * 5, 2, seed + 9);
  if (Math.abs(v2 - 0.52) < w * 0.6) c.lerp(color(0x3a2a48), 0.6);
};
/** Blisters scattered over a patch of S: n of them between the angles and heights given, biggest first. */
export function pox(mb, S, rnd, n, t0, t1, y0, y1, r0, r1, o) {
  for (let i = 0; i < n; i++) {
    const t = lerp(t0, t1, rnd()), y = lerp(y0, y1, rnd());
    const r = lerp(r1, r0, rnd() * rnd());
    blister(mb, S, t, y, r, 0.6, { color: rnd() < 0.5 ? 0xd8d070 : 0xc4c462, glow: (o.glow ?? 0.2) * (0.6 + rnd() * 0.8), rim: 0x8a3024, ws: o.ws || 7, hs: o.hs || 5 });
  }
}
/** A split in swollen skin on S: a slit standing open from (t, y0) to (t, y1), what is under it glowing through. */
export function split(mb, S, t, y0, y1, w, o = {}) {
  const n = 5;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(surfPoint(S, t + (o.wander || 0) * Math.sin(u * 5 + t * 7), lerp(y0, y1, u), -w * 0.3));
  }
  onSurf(mb, S, () => {
    ringLoft(mb, 'root', pts.map((c, i) => ({ c, rx: w * (0.25 + Math.sin((i / n) * PI) * 0.75), ry: w * 0.55 })), { nu: 6, sub: 1, up: [Math.sin(t), 0, -Math.cos(t)], color: o.color ?? 0xb8e050, region: CR.GLOW, glow: o.glow ?? 0.45, mottle: 0.2, blood: false, cap0: w * 0.5, cap1: w * 0.5, tint: (p, nn, c) => c.lerp(color(0x6a1a12), clamp(Math.abs(nn.x * Math.cos(t) + nn.z * Math.sin(t)) * 1.5 - 0.3, 0, 0.9)) });
  });
}

// ------------------------------------------------------------------ the hulks (monsters.js)
/** A boss's head: people.js's dead face on the head bone, a little larger than its skeleton's (hs), the look's own. */
export function bossHead(mb, P, L, hs = 1) {
  const NL = L.dead ? L : { ...oldLook(L), blood: null };
  if (hs === 1) return deadHead(mb, P, NL);
  // (the bigger head is set down by what its middle rose, so the middle stays on the head anchor: where headshots land)
  const dy = P.headR * (hs - 1) * 0.9;
  const geom = mb.geom;
  mb.geom = function (bone, geo, o) {
    geo.translate(0, -dy, 0);
    return geom.call(this, bone, geo, o);
  };
  try {
    return deadHead(mb, { ...P, headR: P.headR * hs }, NL);
  } finally {
    mb.geom = geom;
  }
}
// livid, bruised dead hide: the colour of a part of the body by where it is
export const hide = (seed, bruise = 0x5a2226, rot = 0x5a5e58, f = 4) => (p, n, c) => {
  const m = fbm3(p.x * f, p.y * f, p.z * f, 3, seed);
  if (m > 0.6) c.lerp(color(bruise), Math.min(0.5, (m - 0.6) * 3));
  if (m < 0.36) c.lerp(color(rot), Math.min(0.4, (0.36 - m) * 3));
};
// where the hide is gone: raw muscle, its fibres running down the limb
export const flayed = (seed, f = 1.6, at = 0.6) => (t, y, c) => {
  const m = fbm3(Math.cos(t) * f + seed, y * f * 1.3, Math.sin(t) * f, 3, seed);
  if (m > at) {
    const k = clamp((m - at) * 9, 0, 1);
    const fib = 0.75 + 0.25 * Math.sin(t * 46 + y * 9);
    c.lerp(color(0x8e2a22).multiplyScalar(fib), k * 0.92);
    if (m < at + 0.03) c.lerp(color(0x2a0806), 0.6); // the hide's torn edge
  }
};

