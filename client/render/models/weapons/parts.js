// The shared kit the held items (weapons/<item>.js) are built from: shapes in weapon space, the material presets,
// the part collection a builder fills, and the hand orientations their viewmodel entries are written with.
//
// Weapon space conventions (both world and view models):
//   origin = center of the right hand's grip (palm wraps here), barrel / blade along -Z, up = +Y.
//   Guns: pistol grip passes vertically (+Y) through the fist.
//   Melee: the handle runs along Z through the fist, blade/bat toward -Z, cutting edge / hammer face toward -Y.
//   Throwables (molotov, pipebomb, road flare, frag grenade, noisemaker): long axis along +Y (held like a bottle).
import * as THREE from 'three';
import { WR } from '../charTextures.js';
import { MeshBuilder } from '../skinning.js';

export const PI = Math.PI;

// ================================================================== geometry helpers
function projUV(geo) {
  // planar projection: u along Z (length), v along Y, normalized to the bounding box
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const rz = Math.max(1e-5, bb.max.z - bb.min.z), ry = Math.max(1e-5, bb.max.y - bb.min.y);
  const rx = Math.max(1e-5, bb.max.x - bb.min.x);
  for (let i = 0; i < p.count; i++) {
    const useX = rz < rx * 0.5; // mostly flat in z -> project on x/y
    uv[i * 2] = useX ? (p.getX(i) - bb.min.x) / rx : (p.getZ(i) - bb.min.z) / rz;
    uv[i * 2 + 1] = (p.getY(i) - bb.min.y) / ry;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function makeShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  return s;
}

/** Side profile extruded along X. pts in (f = forward distance (-Z), u = up (+Y)). Centered at x. */
export function profile(mb, pts, width, o = {}) {
  const bevel = o.bevel ?? 0.0015;
  const depth = Math.max(0.0005, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(makeShape(pts), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: o.bevelSegs ?? 1,
    curveSegments: o.curveSegs ?? 6,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  if (o.widthFn) {
    // per-position width scale (f = shape x = forward distance, u = up)
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * o.widthFn(p.getX(i), p.getY(i)));
  }
  geo.rotateY(PI / 2); // (x,y,z) -> (z, y, -x): shape x = forward (-Z), extrude = X
  if (o.x) geo.translate(o.x, 0, 0);
  projUV(geo);
  return mb.geom(0, geo, { ...o, keepNormals: false });
}

/** Cross-section (x, y) extruded along Z from z0 to z1. */
export function sectionZ(mb, pts, z0, z1, o = {}) {
  const bevel = o.bevel ?? 0.001;
  const len = Math.abs(z1 - z0) - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(makeShape(pts), {
    depth: Math.max(0.0005, len),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: o.curveSegs ?? 6,
    steps: 1,
  });
  geo.translate(0, 0, Math.min(z0, z1) + bevel);
  projUV(geo);
  return mb.geom(0, geo, o);
}

/**
 * Lathe along the Z axis. prof = [[r, f], ...] where f = forward distance (-Z). Centered at (x, y).
 * Traverse so the solid is on the left (e.g. axis->out->forward->in). o.sharp duplicates points for hard edges.
 */
export function latheZ(mb, prof, x, y, o = {}) {
  const pts = [];
  for (let i = 0; i < prof.length; i++) {
    const v = new THREE.Vector2(Math.max(0, prof[i][0]), prof[i][1]);
    pts.push(v);
    if (o.sharp && i > 0 && i < prof.length - 1) pts.push(v.clone());
  }
  const geo = new THREE.LatheGeometry(pts, o.rs || 12);
  if (o.swapUV) {
    // grain along the length instead of around
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setXY(i, uv.getY(i), u);
    }
  }
  if (o.sx || o.sz) geo.scale(o.sx || 1, 1, o.sz || 1);
  geo.rotateX(-PI / 2); // lathe y -> -z (forward), lathe z -> y
  geo.translate(x, y, 0);
  return mb.geom(0, geo, o);
}

/** Lathe along the Y axis (bottles, pipes). prof = [[r, y], ...] bottom -> top. */
export function latheY(mb, prof, x, z, o = {}) {
  const pts = [];
  for (let i = 0; i < prof.length; i++) {
    const v = new THREE.Vector2(Math.max(0, prof[i][0]), prof[i][1]);
    pts.push(v);
    if (o.sharp && i > 0 && i < prof.length - 1) pts.push(v.clone());
  }
  const geo = new THREE.LatheGeometry(pts, o.rs || 12);
  geo.translate(x, 0, z);
  return mb.geom(0, geo, o);
}

/** Solid cylinder along Z between z0,z1 (flat ends). */
export function cylZ(mb, x, y, z0, z1, r, o = {}) {
  const f0 = -Math.max(z0, z1), f1 = -Math.min(z0, z1);
  return latheZ(mb, [[0, f0], [r, f0], [o.r1 ?? r, f1], [0, f1]], x, y, { sharp: true, ...o });
}

/** Tube (open-bore) along Z: outer r, bore ri visible at the front end. */
export function barrelZ(mb, x, y, z0, z1, r, ri, o = {}) {
  const f0 = -Math.max(z0, z1), f1 = -Math.min(z0, z1);
  const r1 = o.r1 ?? r;
  return latheZ(mb, [[0, f0], [r, f0], [r1, f1], [ri, f1], [ri, f1 - Math.min(0.03, (f1 - f0) * 0.4)], [0, f1 - Math.min(0.03, (f1 - f0) * 0.4)]], x, y, { sharp: true, ...o });
}

/** Outline (x, f = forward distance (-Z)) extruded along Y from y0 to y1. */
export function plateY(mb, pts, y0, y1, o = {}) {
  const bevel = o.bevel ?? 0.001;
  const geo = new THREE.ExtrudeGeometry(makeShape(pts), {
    depth: Math.max(0.0005, Math.abs(y1 - y0) - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: o.curveSegs ?? 6,
    steps: 1,
  });
  geo.rotateX(-PI / 2); // (x, y, z) -> (x, z, -y): shape y = forward (-Z), extrude = Y
  geo.translate(0, Math.min(y0, y1) + bevel, 0);
  projUV(geo);
  return mb.geom(0, geo, o);
}

/** Box from ranges. */
export function boxR(mb, x0, x1, y0, y1, z0, z1, o = {}) {
  return mb.box(0, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], o);
}

export function mirrorX(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  p.needsUpdate = true;
  n.needsUpdate = true;
  geo.index.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

// material presets (vertex color multiplies the atlas cell)
export const M = {
  gun: { region: WR.GUNMETAL, color: [1.2, 1.14, 1.02], mottle: 0.05 },
  gunDark: { region: WR.GUNMETAL, color: [0.95, 0.92, 0.88], mottle: 0.05 },
  steel: { region: WR.STEEL, color: [1.0, 1.0, 1.02], mottle: 0.05 },
  blade: { region: WR.STEEL, color: [0.86, 0.86, 0.9], mottle: 0.05 },
  poly: { region: WR.POLYMER, color: [1.5, 1.5, 1.5], mottle: 0.04 },
  polyDark: { region: WR.POLYMER, color: [1.0, 1.0, 1.0], mottle: 0.03 },
  wood: { region: WR.WOOD, color: [0.66, 0.5, 0.44], mottle: 0.05, swapUV: true, uv: [1, 0.45, 0, 0.3] },
  walnut: { region: WR.WALNUT, color: [0.95, 0.85, 0.8], mottle: 0.05, swapUV: true, uv: [1, 0.45, 0, 0.3] },
  ash: { region: WR.ASH, color: [0.92, 0.88, 0.8], mottle: 0.06, swapUV: true },
  tape: { region: WR.TAPE, color: [0.45, 0.45, 0.47], mottle: 0.05 },
  tapeGrey: { region: WR.TAPE, color: [1, 1, 1], mottle: 0.05 },
  rust: { region: WR.RUST, color: [1, 1, 1], mottle: 0.1 },
  black: { region: WR.PLAIN, color: 0x0a0a0a, mottle: 0.0, ao: false },
  brass: { region: WR.STEEL, color: [1.05, 0.78, 0.35], mottle: 0.04 },
  red: { region: WR.PLAIN, color: 0x8a1a14, mottle: 0.06 },
  leather: { region: WR.LEATHER, color: [1, 1, 1], mottle: 0.05 },
};

// ================================================================== part collection
export class PartSet {
  constructor(split, hi) {
    this.split = split;
    this.hi = hi;
    this.map = new Map();
    this.pivots = {};
    this.meta = { muzzle: null, leftHand: null, frames: {} };
  }
  get(name) {
    const key = this.split ? name : 'body';
    let mb = this.map.get(key);
    if (!mb) {
      mb = new MeshBuilder({ skinned: false, atlas: 'weapon' });
      mb.aoStrength = 0.22;
      this.map.set(key, mb);
    }
    return mb;
  }
  pivot(name, p) {
    this.pivots[name] = p;
  }
}

export const R = (hi, a, b) => (hi ? a : b);

/**
 * Blade from cross-sections: rings[i] is a closed loop of [x, y, z] points (the same count in every ring),
 * stations running along the blade. Each face between two neighbouring loop points is its own geometry with
 * mats[k] (k = the face's first point), so grind lines, spine and edge stay crisp while every face shades
 * smoothly along the length.
 */
export function facetLoft(mb, rings, mats) {
  const ns = rings.length, np = rings[0].length;
  const z0 = rings[0][0][2], z1 = rings[ns - 1][0][2];
  for (let k = 0; k < np; k++) {
    const k1 = (k + 1) % np;
    const pos = new Float32Array(ns * 6), uv = new Float32Array(ns * 4), idx = [];
    for (let i = 0; i < ns; i++) {
      for (let s = 0; s < 2; s++) {
        const p = rings[i][s ? k1 : k];
        pos.set(p, (i * 2 + s) * 3);
        uv[(i * 2 + s) * 2] = (p[2] - z0) / (z1 - z0); // brushed grain along the blade
        uv[(i * 2 + s) * 2 + 1] = (k + s) / np;
      }
      if (i < ns - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    mb.geom(0, geo, { ...mats[k], keepNormals: true });
  }
}

export function finishParts(P) {
  const out = {};
  for (const [name, mb] of P.map) {
    const rig = mb.build();
    const piv = P.pivots[name];
    if (piv) rig.geometry.translate(-piv.x, -piv.y, -piv.z);
    rig.geometry.computeBoundingSphere();
    out[name] = { geometry: rig.geometry, pivot: piv ? piv.clone() : new THREE.Vector3(), tris: rig.tris };
  }
  return out;
}

export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ================================================================== hand orientations (viewmodel entries)
export const Q = (x, y, z, order = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
// right-hand orientation (in weapon space) for gun grips: Rx(pi/2 - tilt)
export const gunGrip = (tilt, yaw = 0, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2 - tilt, yaw, roll, 'YXZ'));
/**
 * Hand orientation (weapon space) from where the fingers point and which way the palm faces.
 * side: 1 = right hand, -1 = left (mirrored geometry, palm = local +X).
 */
export function handQ(side, finger, palm) {
  const y = new THREE.Vector3(-finger[0], -finger[1], -finger[2]).normalize();
  const x = new THREE.Vector3(palm[0], palm[1], palm[2]).multiplyScalar(-side);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
// left support under a handguard: hand X -> weapon Y (palm up), fingers (-Y) -> weapon +X, tunnel Z along barrel
export const supportGrip = (roll, yaw, pitch = 0) => {
  // mirrored left hand (palm = +X_hand): X_hand -> weapon +Y (palm up), -Y_hand (fingers) -> weapon +X, Z_hand -> weapon +Z
  const base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), PI / 2);
  const tw = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  return tw.multiply(base);
};
