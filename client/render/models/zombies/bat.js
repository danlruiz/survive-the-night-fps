// The bat (ZTYPE.BAT): its model and its whole animation (it flies) (gathered by zombies/index.js).
import * as THREE from 'three';
import { ZTYPE, ZANIM } from '../../../../shared/defs.js';
import { MeshBuilder, fbm3, clamp, lerp, smooth, color, mulColor } from '../skinning.js';
import { CR } from '../charTextures.js';
import { ringLoft, bound } from '../monsters.js';
import { clearPose, R, n1 } from '../characters/posekit.js';

const PI = Math.PI;

export const type = ZTYPE.BAT;

/**
 * The bat: a big fruit bat's frame gone to rot. A furred barrel of a body with the ribs through one side, a fox's
 * head with tall ears, a leaf of a nose and long fangs, and wings that are an arm and a hand: upper arm, forearm, a
 * hooked thumb at the wrist, three fingers fanned through a membrane that is torn at its edge and holed between them.
 */
function buildBat() {
  const mb = new MeshBuilder();
  mb.addBone('root', null, 0, 0, 0);
  mb.addBone('body', 'root', 0, 0, 0);
  mb.addBone('head', 'body', 0, 0.03, -0.13);
  mb.addBone('jaw', 'head', 0, -0.01, -0.03);
  const fur = 0x54443c, skinC = 0x5a3c3a, mem = 0x7c4c46;
  const body = [mb.bi('body'), 1, 0, 0], head = [mb.bi('head'), 1, 0, 0], jaw = [mb.bi('jaw'), 1, 0, 0];
  const furT = (p, n, c) => {
    const m = fbm3(p.x * 30, p.y * 30, p.z * 30, 2, 7);
    if (m > 0.6) c.lerp(color(0x7c6a64), Math.min(0.8, (m - 0.6) * 6)); // mange
    if (n.y < -0.3) c.multiplyScalar(1.25); // a paler belly
  };
  // the body: shoulders the widest of it, tapering to the rump
  ringLoft(mb, 'body', [
    { c: [0, -0.012, 0.215], rx: 0.016, ry: 0.014 }, { c: [0, -0.008, 0.16], rx: 0.036, ry: 0.032 }, { c: [0, -0.002, 0.08], rx: 0.054, ry: 0.05 },
    { c: [0, 0.004, 0.0], rx: 0.066, ru: 0.058, rd: 0.064 }, { c: [0, 0.012, -0.065], rx: 0.058, ru: 0.052, rd: 0.05 }, { c: [0, 0.024, -0.115], rx: 0.036, ry: 0.034 },
  ], {
    nu: 9, sub: 2, color: fur, region: CR.HAIR, mottle: 0.25, mf: 50, tint: furT, cap0: 0.012,
    dr: (s, a) => 0.005 * Math.sin(a * 7 + s * 23) * Math.sin(s * PI), // a ragged pelt
    tear: { amt: 0, fn: (x, y, z) => x > 0.03 && Math.hypot((z - 0.005) / 0.055, (y + 0.005) / 0.04) < 1 },
  });
  // the ribs through its right side
  bound(mb, body, () => {
    mb.ellip('root', [0.036, -0.004, 0.005], [0.02, 0.036, 0.05], { ws: 6, hs: 5, color: 0x3a0a08, region: CR.GORE, mottle: 0.3, blood: false });
    for (let i = 0; i < 4; i++) {
      const z = -0.035 + i * 0.026;
      mb.tube('root', [[0.04, 0.03, z], [0.058, 0.002, z + 0.004], [0.048, -0.03, z + 0.008]], 0.0034, 0.0028, { rs: 3, ts: 4, color: 0xc8bc9c, region: CR.BONE, blood: false, cap: false });
    }
  });
  // head: a long skull, a short snout, the lips off the teeth
  ringLoft(mb, 'head', [
    { c: [0, 0.03, -0.1], rx: 0.03, ry: 0.03 }, { c: [0, 0.038, -0.135], rx: 0.043, ru: 0.04, rd: 0.036 }, { c: [0, 0.036, -0.168], rx: 0.038, ru: 0.03, rd: 0.03 },
    { c: [0, 0.03, -0.195], rx: 0.024, ru: 0.02, rd: 0.018 }, { c: [0, 0.027, -0.214], rx: 0.015, ru: 0.013, rd: 0.011 },
  ], {
    nu: 8, sub: 2, color: fur, region: CR.HAIR, mottle: 0.25, mf: 50, cap1: 0.006,
    tint: (p, n, c) => {
      furT(p, n, c);
      if (p.z < -0.185 && p.y < 0.03) c.lerp(color(0x4a0e10), 0.8);
    },
  });
  bound(mb, head, () => {
    // a nose-leaf standing up off the snout
    mb.spike('root', [0, 0.036, -0.212], [0, 0.064, -0.208], 0.011, { rs: 4, color: skinC, region: CR.MEMBRANE });
    mb.ellip('root', [0, 0.03, -0.218], [0.009, 0.007, 0.006], { ws: 5, hs: 3, color: 0x120c0c, region: CR.PLAIN, mottle: 0 });
    for (const s of [-1, 1]) {
      // tall ears, their insides bare
      for (const inner of [false, true]) {
        const g = new THREE.ConeGeometry(inner ? 0.02 : 0.03, inner ? 0.085 : 0.11, 4, 1);
        g.rotateY(PI / 4);
        g.scale(1, 1, 0.4);
        g.translate(0, inner ? 0.04 : 0.05, inner ? -0.006 : 0);
        g.rotateZ(-s * 0.42);
        g.rotateX(0.2);
        g.translate(s * 0.03, 0.066, -0.118);
        mb.geom('root', g, { color: inner ? 0x7a4a48 : mulColor(fur, 0.8), region: inner ? CR.MEMBRANE : CR.HAIR, mottle: 0.2 });
      }
      mb.ellip('root', [s * 0.026, 0.048, -0.172], [0.011, 0.0095, 0.008], { ws: 5, hs: 3, color: 0x1c0808, region: CR.FLESH, ao: false, mottle: 0 });
      mb.ellip('root', [s * 0.0275, 0.0485, -0.1765], [0.0078, 0.007, 0.0055], { ws: 5, hs: 3, color: 0xff2010, glow: 1, region: CR.PLAIN, ao: false, mottle: 0, blood: false });
      mb.spike('root', [s * 0.011, 0.022, -0.203], [s * 0.012, -0.006, -0.206], 0.0045, { rs: 4, color: 0xe8e0c8, region: CR.BONE, blood: false });
      mb.spike('root', [s * 0.019, 0.022, -0.19], [s * 0.019, 0.01, -0.191], 0.003, { rs: 3, color: 0xe8e0c8, region: CR.BONE, blood: false });
    }
  });
  ringLoft(mb, 'jaw', [{ c: [0, 0.014, -0.14], rx: 0.026, ru: 0.006, rd: 0.012 }, { c: [0, 0.012, -0.175], rx: 0.02, ru: 0.006, rd: 0.01 }, { c: [0, 0.012, -0.204], rx: 0.011, ru: 0.005, rd: 0.007 }], {
    nu: 6, sub: 1, color: fur, region: CR.HAIR, mottle: 0.25, cap0: 0.004, cap1: 0.004,
    tint: (p, n, c) => n.y > 0.4 && c.copy(color(0x3a0a0a)),
  });
  bound(mb, jaw, () => {
    for (const s of [-1, 1]) mb.spike('root', [s * 0.008, 0.015, -0.198], [s * 0.008, 0.034, -0.2], 0.0036, { rs: 4, color: 0xe8e0c8, region: CR.BONE, blood: false });
  });
  // wings: w1 (upper arm) -> w2 (forearm) -> w3 (the hand)
  const memO = { color: mem, region: CR.MEMBRANE, double: true, mottle: 0.25 };
  const blend = (a, b, t) => (t <= 0 ? [a, 1, b, 0] : t >= 1 ? [b, 1, a, 0] : [a, 1 - t, b, t]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    mb.addBone('w1' + n, 'body', s * 0.06, 0.02, -0.04);
    mb.addBone('w2' + n, 'w1' + n, s * 0.24, 0.03, -0.02);
    mb.addBone('w3' + n, 'w2' + n, s * 0.44, 0.02, 0.02);
    const b1 = mb.bi('w1' + n), b2 = mb.bi('w2' + n), b3 = mb.bi('w3' + n);
    const J0 = [s * 0.06, 0.02, -0.04], J1 = [s * 0.24, 0.03, -0.02], J2 = [s * 0.44, 0.02, 0.02];
    const F = [[s * 0.62, 0.0, 0.0], [s * 0.6, 0.01, 0.16], [s * 0.5, 0.02, 0.26]]; // the fingers' tips
    const R0 = [s * 0.035, -0.02, 0.2]; // where the membrane meets the leg
    const L3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    // the arm: fur on the upper arm, bare bone-thin forearm, a hooked thumb at the wrist
    ringLoft(mb, 'w1' + n, [{ c: L3(J0, J1, -0.15), rx: 0.02 }, { c: J0, rx: 0.019 }, { c: L3(J0, J1, 0.6), rx: 0.013 }, { c: J1, rx: 0.012 }], { nu: 5, sub: 1, color: fur, region: CR.HAIR, mottle: 0.25, tint: furT });
    ringLoft(mb, 'w2' + n, [{ c: J1, rx: 0.012 }, { c: L3(J1, J2, 0.5), rx: 0.008 }, { c: J2, rx: 0.009 }], { nu: 5, sub: 1, color: skinC, region: CR.MEMBRANE, mottle: 0.2 });
    bound(mb, [b3, 1, 0, 0], () => {
      mb.spike('root', J2, [J2[0] + s * 0.02, J2[1] + 0.022, J2[2] - 0.055], 0.006, { rs: 4, color: 0x1a1410, region: CR.BONE });
      for (const f of F) mb.tube('root', [J2, L3(J2, f, 0.55), f], 0.0062, 0.0022, { rs: 3, ts: 3, color: skinC, region: CR.MEMBRANE, cap: false });
    });
    // the membrane from the arm back to the leg and out to the third finger: one sheet, bending at the elbow and wrist
    {
      const nu = 9, nv = 4;
      const pos = [], idx = [], wts = [], uv = [];
      const lead = (u) => (u < 0.47 ? L3(J0, J1, u / 0.47) : L3(J1, J2, (u - 0.47) / 0.53));
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const a = lead(u);
        const tr = L3(R0, F[2], u);
        tr[2] -= 0.05 * Math.sin(u * PI); // the trailing edge drawn in between the leg and the finger
        const w = u < 0.39 ? [b1, 1, b2, 0] : u < 0.55 ? blend(b1, b2, (u - 0.39) / 0.16) : u < 0.8 ? [b2, 1, b3, 0] : blend(b2, b3, (u - 0.8) / 0.2);
        for (let j = 0; j <= nv; j++) {
          const v = j / nv;
          const p = L3(a, tr, v);
          pos.push(p[0], p[1] - 0.008 * Math.sin(v * PI) * (0.5 + u), p[2] + (j === nv ? 0.012 * Math.sin(u * 40 + s) : 0));
          uv.push(u, v);
          wts.push(...(u < 0.12 && v > 0.5 ? blend(b1, body[0], (v - 0.5) * 1.4) : w));
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        if (s > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      mb.geom('root', geo, { ...memO, keepNormals: true, wts: new Float32Array(wts), tear: { amt: 0.33, f: 16, seed: s > 0 ? 3 : 8 } });
    }
    // ...and between the fingers, on the hand: each web's edge scalloped back toward the wrist
    for (let k = 0; k < 2; k++) {
      const fa = F[k + 1], fb = F[k];
      const nu = 4, nv = 2;
      const pos = [], idx = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const e = L3(fa, fb, u);
        const sag = 0.3 * Math.sin(u * PI);
        const edge = L3(e, J2, sag);
        for (let j = 0; j <= nv; j++) {
          const p = L3(J2, edge, j / nv);
          pos.push(p[0], p[1] - 0.006 * Math.sin((j / nv) * PI), p[2]);
        }
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        if (s > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      bound(mb, [b3, 1, 0, 0], () => mb.geom('root', geo, { ...memO, keepNormals: true, tear: { amt: 0.3, f: 22, seed: 11 + k + (s > 0 ? 0 : 5) } }));
    }
  }
  // legs trailing behind, hooked feet, a scrap of membrane between them
  bound(mb, body, () => {
    for (const s of [-1, 1]) {
      mb.tube('root', [[s * 0.026, -0.022, 0.12], [s * 0.04, -0.03, 0.18], [s * 0.046, -0.045, 0.235]], 0.011, 0.006, { rs: 4, ts: 3, color: skinC, region: CR.MEMBRANE, cap: false });
      for (let c = 0; c < 3; c++) mb.spike('root', [s * 0.046, -0.045, 0.235], [s * (0.04 + c * 0.008), -0.075, 0.245 + c * 0.004], 0.004, { rs: 3, color: 0x1a1410, region: CR.BONE });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.03, -0.022, 0.13, 0.03, -0.022, 0.13, -0.044, -0.04, 0.225, 0.044, -0.04, 0.225, 0, -0.03, 0.2], 3));
    g.setIndex([0, 2, 4, 0, 4, 1, 1, 4, 3]);
    g.computeVertexNormals();
    mb.geom('root', g, { ...memO, keepNormals: true });
  });
  mb.blood([0, 0.02, -0.2], 0.04, 1);
  mb.dirt = null;
  mb.aoStrength = 0.15;
  return { mb, P: null };
}

// ------------------------------------------------------------------ bat animation
function poseBat(z) {
  const p = z.pose;
  clearPose(p, z.nb);
  const t = z.time + z.off;
  const X = z.X;
  const st = z.state;
  const dead = st === ZANIM.DEAD;
  const dive = st === ZANIM.ATTACK;
  const f = 7 + clamp(z.speed, 0, 10) * 0.5;
  const ph = z.flapPh;
  const s = Math.sin(ph), c = Math.cos(ph);
  if (dead) {
    const k = smooth(z.stateT / 0.5);
    // down on the ground (land): over onto its back, the head thrown back so the ears lie flat, the elbows on the
    // ground and the hands up off it, the body the lowest of it (BAT_REST, entities.js)
    const g = z.landT < 0 ? 0 : smooth(z.landT / 0.15);
    R(p, X.body, 0.3 * k, 0, lerp(2.6 * k, PI, g) * (z.seed & 1 ? 1 : -1));
    R(p, X.head, -0.9 * g, 0, 0);
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1;
      R(p, side ? X.w1R : X.w1L, 0, 0, sg * lerp(0.2 + 0.4 * k, 0.25, g));
      R(p, side ? X.w2R : X.w2L, 0, sg * 1.2 * k, 0);
      R(p, side ? X.w3R : X.w3L, 0, sg * 1.0 * k, 0);
    }
    p[z.nb * 4 + 1] = 0;
    return f;
  }
  const bob = dive ? 0 : -s * 0.035;
  p[z.nb * 4 + 1] = bob;
  R(p, X.body, dive ? -0.7 : -0.1 + 0.08 * c + (st === ZANIM.STAGGER ? 0.5 * Math.exp(-z.stateT * 5) : 0), 0, 0.05 * Math.sin(t * 1.3));
  R(p, X.head, dive ? 0.5 : 0.1 - 0.08 * c + 0.15 * n1(t * 1.5, z.seed), n1(t, z.seed) * 0.3, 0);
  R(p, X.jaw, dive ? -0.6 : -0.15 - 0.15 * Math.max(0, Math.sin(t * 5)), 0, 0);
  for (let side = 0; side < 2; side++) {
    const sg = side ? 1 : -1;
    const w1 = side ? X.w1R : X.w1L, w2 = side ? X.w2R : X.w2L, w3 = side ? X.w3R : X.w3L;
    if (dive) {
      // wings swept back
      const tr = Math.sin(t * 30) * 0.05;
      R(p, w1, 0, sg * -0.9, sg * (0.25 + tr));
      R(p, w2, 0, sg * -1.3, 0);
      R(p, w3, 0, sg * -0.6, sg * 0.1);
    } else {
      const flap = s * 0.95 + 0.1;
      const fold = Math.max(0, -c) * 0.5; // fold on the upstroke
      R(p, w1, 0.1 * c, sg * -fold * 0.4, sg * flap);
      R(p, w2, 0, sg * -fold * 0.9, sg * Math.sin(ph - 0.5) * 0.4);
      R(p, w3, 0, sg * -fold * 0.7, sg * Math.sin(ph - 1.0) * 0.35);
    }
  }
  return f;
}

export { buildBat as build, poseBat as pose };
