// The leaper (ZTYPE.LEAPER): its model, how it moves and its windup (gathered by zombies/index.js).
import * as THREE from 'three';
import { ZTYPE } from '../../../../shared/defs.js';
import { MeshBuilder, fbm3, smooth, color } from '../skinning.js';
import { CR } from '../charTextures.js';
import { bloodied } from '../deadlooks.js';
import { bigHand, bigFoot, shard } from '../monsters.js';
import { surfPoint, headPoint, headSurface } from '../humans.js';
import { SPINE, CHEST, JAW, humanP } from '../characters/skeleton.js';
import { clearPose, R, arm, headLook, legsStatic } from '../characters/posekit.js';
import { buildingFar, mulColor, standardHumanoid } from './helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

export const type = ZTYPE.LEAPER;
export const calibrateRun = true;

/**
 * The leaper: somebody young in a hooded top who now goes on all fours. All sinew - forearms and shins too long, the
 * hands and feet grown into hooks - the hood still up over a face that is eyes and teeth, the back of the top split
 * open down a spine that has grown spurs.
 */
function buildLeaper() {
  const P = humanP({ hipY: 0.98, hipW: 0.1, thighLen: 0.46, shinLen: 0.46, spineLen: 0.13, chestLen: 0.19, neckOff: 0.18, neckLen: 0.1, headR: 0.1, shoulderW: 0.17, uarmLen: 0.36, farmLen: 0.35, handLen: 0.2 });
  const far = buildingFar();
  const hoodC = 0x2c3a2e, skinC = 0x8e8e84;
  const L = {
    dead: true, skin: skinC, eye: 0xffe070, eyeGlow: 0.9, noBrows: true,
    face: { sockets: 1.9, gaunt: 1, rot: 0.6, lips: 0.3, jaw: 1.1, cheek: 1.3 },
    gaunt: 0.9, build: { w: 0.94, arm: 0.86, leg: 0.88, neck: 0.85 },
    top: { kind: 'hoodie', color: hoodC, region: CR.FLEECE, sleeves: 'long', tear: 0.24, hem: 0.03, collar: 'crew', backOpen: true, loose: 0.004, tint: bloodied(7, 0.6) },
    pants: { color: 0x2a2a2c, region: CR.TWILL, tear: 0.2, tearY: 0.3, tint: bloodied(9, 0.5) },
    shoes: null, hair: null, fingerMul: 1.3, claws: 0.035, curl: 1.1, fang: true, missingTeeth: 0x08,
    noHands: !far, noFeet: !far,
    blood: [[[0, 1.5, -0.1], 0.1, 1], [[0.2, 0.7, -0.05], 0.1, 0.8]], dirt: { y0: 0.45, k: 0.7 },
  };
  const mb = new MeshBuilder();
  const built = standardHumanoid(mb, P, L);
  const { H, T } = built;
  const hr = P.headR;
  const head = mb.bi('head'), jaw = mb.bi('jaw');
  // the hood, up: a shell round the head, open over the face, peaked at the back
  {
    const depth = (phi, lam) => Math.hypot(phi / 0.86, (lam + 0.1) / 0.8) - 1;
    const push = (phi, lam) => hr * (0.17 + 0.16 * smooth((Math.abs(phi) - 1.0) / 1.6) + 0.1 * Math.max(0, Math.sin(lam)) + 0.1 * smooth(-lam - 0.5));
    const { geo, wts } = headSurface(H, far ? 14 : 24, far ? 9 : 14, head, jaw, { depth }, push);
    for (let i = 0; i < wts.length; i += 4) {
      wts[i + 1] = 1;
      wts[i + 3] = 0;
    }
    mb.geom('head', geo, { color: hoodC, region: CR.FLEECE, mottle: 0.2, double: true, keepNormals: true, wts, tint: (p, n, c) => p.z > 0 && c.multiplyScalar(0.9) });
    // its hem round the face
    const pts = [], hp = new THREE.Vector3();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU;
      const phi = Math.sin(a) * 0.88, lam = -0.1 + Math.cos(a) * 0.82;
      headPoint(H, phi, lam, hp);
      const r = Math.hypot(hp.x, hp.y - H.cy, hp.z), k = 1 + (push(phi, lam) + 0.004) / r;
      pts.push([hp.x * k, H.cy + (hp.y - H.cy) * k, hp.z * k - hr * 0.06]);
    }
    if (!far) mb.tube('head', pts, hr * 0.085, hr * 0.085, { rs: 5, ts: 26, color: mulColor(hoodC, 0.8), region: CR.FLEECE, cap: false });
  }
  // ...and its skirts on the shoulders
  mb.lathe('neck', [0, 0, 0.012], [[0.105, -0.07], [0.112, -0.01], [0.098, 0.06], [0.088, 0.1]], { rs: far ? 8 : 12, sx: 1.42, sz: 1.22, color: hoodC, region: CR.FLEECE, double: true, mottle: 0.2 });
  if (!far) {
    const skinT = (p, n, c) => fbm3(p.x * 9, p.y * 9, p.z * 9, 2, 33) > 0.6 && c.lerp(color(0x4a3040), 0.3);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      bigHand(mb, 'hand' + n, s, { scale: 1.3, curl: 0.85, spread: 1.2, fingerMul: 1.35, claws: 0.05, skin: skinC, region: CR.ROT, tint: skinT });
      bigFoot(mb, 'foot' + n, s, { w: 1.1, l: 1.45, h: 1.05, skin: skinC, region: CR.ROT, tint: skinT, claws: 0.035 });
    }
    // the spine, through the split in the back of the top: a spur a vertebra
    for (let i = 0; i < 10; i++) {
      const y = P.hipY + 0.06 + i * 0.047;
      const a = surfPoint(T, PI, y, -0.006);
      const len = 0.03 + 0.022 * Math.sin((i / 9) * PI);
      shard(mb, T.wts(y, 0), a, [0, a[1] + len * 0.5, a[2] + len], 0.013, { rs: 4, color: 0xb8ac8c });
    }
  }
  return { mb, P };
}

// how it moves (characters/pose.js reads it as z.st)
export const style = {
  walkLean: -1.0, runLean: -1.05, cycleWalk: 1.2, cycleRun: 2.6, walkStride: 0.45, walkKnee: 0.7, runStride: 0.7, runKnee: 0.9,
  baseT: 1.05, baseK: 1.75, limp: 0, sway: 0.4, elbow: 0.4, headPitch: 0.2, headTilt: 0.1, jaw: 0.25, quad: true,
  idleLean: -1.05,
};

/** Its windup (ZANIM.SPECIAL): deep crouch windup, trembling */
function poseCrouch(z, p) {
  const t = z.stateT, st = z.st;
  clearPose(p, z.nb);
  const k = smooth(t / 0.35);
  const tr = Math.sin(t * 50) * 0.02 * k;
  legsStatic(z, p, st.baseT + 0.35 * k, -st.baseK - 0.45 * k, st.baseT + 0.35 * k, -st.baseK - 0.45 * k, 0.2);
  R(p, SPINE, -0.6 - 0.15 * k + tr, 0, 0);
  R(p, CHEST, -0.5 - 0.1 * k, 0, 0);
  arm(p, 0, 0.15 + tr, 0.35, 0.2, 0.9 + 0.3 * k, 1.0);
  arm(p, 1, 0.15 - tr, 0.35, 0.2, 0.9 + 0.3 * k, 1.0);
  headLook(p, 0.45, 0, 0, 0.5);
  R(p, JAW, -0.45 * k, 0, 0);
}

export { buildLeaper as build, poseCrouch as special };
