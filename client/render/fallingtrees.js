// Felled trees coming down. A tree chopped to its last (EVT.FELL) leaves the instanced forest (Foliage hides its
// instance) and falls here as a mesh of its own: it tips about its foot away from whoever cut it, slowly at first
// and then ever faster, as a toppling pole does, and hits the ground FALL_T after the event - where every take of
// the recording (SOUND.TREE_FALL) has its crash. A bounce, a few seconds lying there, and it dithers away.
// A tree shot or blown apart (EVT.TREE_BREAK) comes down in pieces, each a slice of the same model up its height
// (its materials' band): what a bullet snapped off - which topples off what stands and down - or what a blast broke
// it into, thrown tumbling away from the blast. Splintered ends where it broke. What stands of it is not drawn here
// but with every other tree cut down to what stands of it (render/cuttrees.js), until dawn.
import * as THREE from 'three';
import { vegFellMaterial } from './materials.js';

export const FALL_T = 2.55; // s from the event to the ground: where the crash sits in each take of tree_fall.ogg
const REST_T = 3; // s it lies there...
const FADE_T = 1.5; // ...and takes to fade away
const END_T = FALL_T + REST_T + FADE_T;
const SINK = 0.35; // m it settles into the ground as it fades
const LEAN0 = 0.05; // rad over when it starts to go (the hinge of uncut wood holding it a moment)
const LIFT = 0.07; // rad short of the ground it comes to rest: its limbs hold the trunk up off it
const BOUNCE = 0.06; // rad it bounces back up off the ground
const DRAW_DIST = 260; // m: further off a tree just goes (nobody sees it fall through that much forest)
const GRAV = 9.8;
const ALL = 1e5; // a band that is the whole of the model
const TOPPLE = 1;
const FLY = 2;

// The toppling of a pole about its foot, theta'' = sin(theta) (a time scale of its own), from LEAN0 at rest: theta
// every DT. A tree's fall plays this out at the pace that brings it down where it lands at exactly FALL_T.
const DT = 1 / 500;
const PROFILE = (() => {
  const out = [];
  let th = LEAN0;
  let w = 0;
  while (th < 2.4) {
    out.push(th);
    w += Math.sin(th) * DT;
    th += w * DT;
  }
  out.push(th);
  return Float32Array.from(out);
})();
// time on the profile at which it is `th` over
function profileTime(th) {
  let lo = 0;
  let hi = PROFILE.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PROFILE[mid] < th) lo = mid;
    else hi = mid;
  }
  return (lo + (th - PROFILE[lo]) / (PROFILE[hi] - PROFILE[lo])) * DT;
}
function profileAt(t) {
  const f = t / DT;
  const i = Math.min(PROFILE.length - 2, Math.floor(f));
  return PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * (f - i);
}

// A broken end: a crown of splinters standing up to y 1 off a ring of radius 1 at y 0 (scaled to the trunk where it
// broke). Flat-shaded pale wood, both sides.
let capGeo = null;
let capMat = null;
export function capParts() {
  if (capGeo) return [capGeo, capMat];
  const N = 13;
  const p = [];
  const ring = [];
  const tips = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ring.push([Math.cos(a), 0, Math.sin(a)]);
    const b = ((i + 0.5) / N) * Math.PI * 2;
    const rr = 0.35 + Math.random() * 0.55;
    tips.push([Math.cos(b) * rr, 0.25 + Math.random() * 0.75, Math.sin(b) * rr]);
  }
  const c = [0, 0.18, 0];
  for (let i = 0; i < N; i++) {
    const b0 = ring[i];
    const b1 = ring[(i + 1) % N];
    const t0 = tips[i];
    const tp = tips[(i + N - 1) % N];
    p.push(...b0, ...t0, ...b1); // a splinter's outer face
    p.push(...c, ...tp, ...b0, ...c, ...b0, ...t0); // the torn wood between them, in to the heart
  }
  capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  capGeo.computeVertexNormals();
  capMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.78, 0.62, 0.42, THREE.SRGBColorSpace), side: THREE.DoubleSide, flatShading: true });
  capMat.name = 'tree_break';
  return [capGeo, capMat];
}

// a tree's trunk's radius h m up its foot, of a tree H m tall with a trunk r round at the foot (it tapers)
export const trunkAt = (r, h, H) => r * 0.85 * Math.max(0.3, 1 - (0.75 * h) / H);

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

export class FallingTrees {
  // trees: Foliage's InstancedSet of them (its data, per-instance matrices and variants)
  constructor(scene, world, trees) {
    this.scene = scene;
    this.world = world;
    this.trees = trees;
    this.active = [];
    this.pool = trees.variants.map(() => []); // finished ones, per variant, to fall again
  }

  // A tree of variant v in a group of its own, every part in materials of its own (they fade on their own), and a
  // splintered end for each of its two ends (shown on a piece that has one)
  _make(v) {
    const gone = { value: 0 };
    const band = { value: new THREE.Vector2(-ALL, ALL) };
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    for (const part of this.trees.variants[v].parts) {
      const mesh = new THREE.Mesh(part.geometry, vegFellMaterial(part.material, gone, band));
      mesh.customDepthMaterial = mesh.material.userData.depth;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // (it leaves its bounds as it falls)
      group.add(mesh);
    }
    const [geo, mat] = capParts();
    const caps = [0, 1].map(() => {
      const cap = new THREE.Mesh(geo, mat);
      cap.frustumCulled = false;
      cap.receiveShadow = true;
      cap.visible = false;
      group.add(cap);
      return cap;
    });
    return { v, group, gone, band, caps, base: new THREE.Matrix4(), C0: new THREE.Vector3(), P: new THREE.Vector3() };
  }

  _meshes(f) {
    return f.group.children.filter((m) => !f.caps.includes(m));
  }

  // Instance i where the camera at (cx, cz) could see it come down: where it stands and how. Null when too far.
  _tree(i, cx, cz) {
    const D = this.trees.data;
    const o = i * 6;
    const x = D[o];
    const y = D[o + 1];
    const z = D[o + 2];
    if (Math.hypot(x - cx, z - cz) > DRAW_DIST) return null;
    const v = D[o + 5] | 0;
    const M0 = new THREE.Matrix4().fromArray(this.trees.mats, i * 16);
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    M0.decompose(pos, rot, scale);
    return { x, y, z, v, M0, pos, scale, H: this.trees.variants[v].height * scale.y };
  }

  // A piece of tree t: the slice of it from lo to hi m up its foot, turning about the point C0 (world). ends: the
  // splintered ends it has, [lo's, hi's], each with the trunk's radius there (0: none)
  _piece(t, lo, hi, C0, ends = [0, 0]) {
    const f = this.pool[t.v].pop() || this._make(t.v);
    const sy = t.scale.y;
    f.band.value.set(lo <= 0 ? -ALL : lo / sy, hi >= t.H ? ALL : hi / sy);
    f.C0.copy(C0);
    f.P.copy(C0);
    f.base.makeTranslation(-C0.x, -C0.y, -C0.z).multiply(t.M0);
    f.t = 0;
    f.th = 0;
    f.gone.value = 0;
    for (let k = 0; k < 2; k++) {
      const cap = f.caps[k];
      const r = ends[k];
      cap.visible = r > 0;
      if (!r) continue;
      // (in the model's own frame: the group's matrix scales it, so it is unscaled here)
      cap.position.set(0, (k ? hi : lo) / sy, 0);
      cap.rotation.set(k ? 0 : Math.PI, Math.random() * 6.28, 0);
      cap.scale.set(r / t.scale.x, (r * 1.5) / sy, r / t.scale.z);
    }
    const cast = this.trees.castDist > 0; // (as the forest's own: shadows on at this quality)
    for (const m of this._meshes(f)) m.castShadow = cast;
    this.scene.add(f.group);
    this.active.push(f);
    return f;
  }

  // the axis a piece going toward d (dx, dz) tips over about
  _axis(dx, dz) {
    return new THREE.Vector3().crossVectors(_up, new THREE.Vector3(dx, 0, dz)).normalize();
  }

  // Piece f topples toward d about the point C0, which comes down to G as it goes; reach: m from G out to where it
  // comes down on the ground
  _topple(f, dx, dz, G, reach) {
    const drop = G.y - this.world.heightAt(G.x + dx * reach, G.z + dz * reach);
    // steep ground falling away lets it go past level, a bank rising in front stops it short
    const land = Math.min(1.95, Math.max(1.15, Math.PI / 2 + Math.atan2(drop, reach) - LIFT));
    Object.assign(f, { mode: TOPPLE, axis: this._axis(dx, dz), G: G.clone(), land, pace: profileTime(land) / FALL_T });
  }

  // Piece f thrown from C0 with velocity (vx, vy, vz), turning toward the way it goes until it is thF over, and
  // landing with its middle `rest` m off the ground
  _fly(f, vx, vy, vz, thF, rest) {
    const C = f.C0;
    let T = 0.5;
    for (let k = 0; k < 3; k++) {
      const gy = this.world.heightAt(C.x + vx * T, C.z + vz * T) + rest;
      const h = C.y - gy;
      T = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAV * h))) / GRAV;
    }
    T = Math.max(0.25, T);
    const l = Math.hypot(vx, vz) || 1;
    Object.assign(f, { mode: FLY, axis: this._axis(vx / l, vz / l), vel: new THREE.Vector3(vx, vy, vz), T, thF });
  }

  // Instance i comes down toward yaw (the game's: -sin, -cos) - from where the camera is at (cx, cz), if it is near
  // enough to be seen. False when it is not drawn falling.
  fell(i, yaw, cx, cz) {
    const t = this._tree(i, cx, cz);
    if (!t) return false;
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const f = this._piece(t, 0, t.H, t.pos);
    // where it lands: the crown (some 60% up) comes down on the ground out there, held off it by its limbs
    this._topple(f, dx, dz, t.pos, 0.6 * t.H);
    this._pose(f);
    return true;
  }

  // Instance i shot (pieces 1) or blown apart (2-3), toward yaw, broken cut m up its foot, where `top` m of it stood
  // (Infinity: it stood whole); r: its trunk's radius at the foot. Where it broke (m up its foot, the lowest first) -
  // a blast breaks it more than once - whether or not the camera at (cx, cz) is near enough to see it drawn.
  breakTree(i, yaw, cut, top, pieces, r, cx, cz) {
    const D = this.trees.data;
    const v = D[i * 6 + 5] | 0;
    const sc = D[i * 6 + 3];
    const H = this.trees.variants[v].height * sc;
    const cuts = [cut];
    // a blast breaks it again every so far up, but leaves the crown whole
    const seg = Math.min(3.2, Math.max(1, 0.16 * H));
    while (cuts.length < pieces) {
      const c = cuts[cuts.length - 1] + seg * rnd(0.75, 1.25);
      if (c > 0.6 * H || c > top - 0.5) break;
      cuts.push(c);
    }
    const t = this._tree(i, cx, cz);
    if (!t) return cuts;
    // (what stood of it: the whole of it, crown and all, or a length of trunk broken off at the top already)
    const crown = top >= t.H;
    const end = Math.min(top, t.H);
    const trunk = (h) => trunkAt(r, h, t.H);
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const at = (h) => t.pos.clone().addScaledVector(_up, h);
    if (pieces === 1) {
      // shot: what is above slips off what stands, its foot kicking back, and topples the way the round went
      const c = cuts[0];
      const f = this._piece(t, c, end, at(c), [trunk(c), crown ? 0 : trunk(end)]);
      const bx = t.x - dx * 0.5;
      const bz = t.z - dz * 0.5;
      const G = new THREE.Vector3(bx, this.world.heightAt(bx, bz) + trunk(c), bz);
      this._topple(f, dx, dz, G, 0.6 * (end - c));
      this._pose(f);
      return cuts;
    }
    // blown apart: each length of trunk between two breaks thrown hard, tumbling, the crown heaved over after them
    const near = pieces > 2 ? 1.25 : 1;
    for (let k = 0; k < cuts.length; k++) {
      const lo = cuts[k];
      const last = k === cuts.length - 1;
      const heave = last && crown; // (the crown: heaved over, not thrown)
      const hi = last ? end : cuts[k + 1];
      const mid = heave ? lo + 0.35 * (end - lo) : (lo + hi) / 2;
      const f = this._piece(t, lo, hi, at(mid), [trunk(lo), heave ? 0 : trunk(hi)]);
      const a = Math.atan2(dz, dx) + rnd(-0.45, 0.45);
      const sp = (heave ? rnd(1.5, 3) : rnd(4, 7.5)) * near;
      const vy = heave ? rnd(1, 2.5) : rnd(3, 6) * near;
      const turn = heave ? Math.PI / 2 - LIFT : (Math.PI / 2 + (Math.random() < 0.6 ? Math.PI : 0)) * (Math.random() < 0.5 ? -1 : 1);
      this._fly(f, Math.cos(a) * sp, vy, Math.sin(a) * sp, turn, heave ? Math.min(2, 0.3 + 0.1 * (end - lo)) : trunk(mid));
      this._pose(f);
    }
    return cuts;
  }

  _pose(f) {
    const t = f.t;
    const P = f.P;
    let th = 0;
    if (f.mode === TOPPLE) {
      if (t < FALL_T) {
        th = profileAt(t * f.pace);
        const k = t / FALL_T;
        P.lerpVectors(f.C0, f.G, k * k);
      } else {
        const s = t - FALL_T;
        th = f.land - BOUNCE * Math.exp(-5 * s) * Math.abs(Math.sin(11 * s));
        P.copy(f.G);
      }
    } else if (f.mode === FLY) {
      const T = Math.min(t, f.T);
      P.copy(f.C0).addScaledVector(f.vel, T);
      P.y -= 0.5 * GRAV * T * T;
      if (t < f.T) th = (f.thF * t) / f.T;
      else {
        const s = t - f.T;
        th = f.thF - Math.sign(f.thF) * BOUNCE * Math.exp(-5 * s) * Math.abs(Math.sin(11 * s));
      }
    }
    let sink = 0;
    const k = (t - FALL_T - REST_T) / FADE_T;
    if (k > 0) {
      f.gone.value = Math.min(1, k);
      sink = SINK * k;
      if (k > 0.5) for (const cap of f.caps) cap.visible = false;
    }
    f.th = th;
    const m = f.group.matrix;
    if (th) m.makeRotationFromQuaternion(_q.setFromAxisAngle(f.axis, th)).multiply(f.base);
    else m.copy(f.base);
    m.elements[12] += P.x;
    m.elements[13] += P.y - sink;
    m.elements[14] += P.z;
    f.group.matrixWorldNeedsUpdate = true;
  }

  update(dt) {
    for (let k = this.active.length - 1; k >= 0; k--) {
      const f = this.active[k];
      f.t += dt;
      if (f.t >= END_T) {
        this._drop(f);
        this.active.splice(k, 1);
        continue;
      }
      this._pose(f);
    }
  }

  _drop(f) {
    this.scene.remove(f.group);
    this.pool[f.v].push(f);
  }

  // every tree falling now is gone (dawn: the forest stands again)
  clear() {
    for (const f of this.active) this._drop(f);
    this.active.length = 0;
  }

  // One falling tree of every variant, for the warm-up (Game.warmViews): their programs are not the forest's
  warmViews() {
    return this.trees.variants.map((_, v) => {
      const f = this._make(v);
      for (const m of this._meshes(f)) m.castShadow = true;
      for (const cap of f.caps) cap.visible = true;
      f.group.matrixAutoUpdate = true;
      return f.group;
    });
  }

  dispose() {
    this.clear();
    for (const list of this.pool) {
      for (const f of list) {
        for (const m of this._meshes(f)) {
          m.material.dispose();
          m.customDepthMaterial.dispose();
        }
      }
    }
    this.pool = this.trees.variants.map(() => []);
  }
}
