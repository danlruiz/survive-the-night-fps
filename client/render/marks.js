// Marks left on the world: a slash across a plank wall, a dent in a car door, a bullet hole in brick, the crazing of
// a windscreen. Every one of them is a quad of one atlas (textures/marks.js, a cell per kind: shared/surfaces.js
// MARK) in ONE mesh and one draw call, lit like the surface it lies on.
//
// MarkPool is the bookkeeping and has no three.js in it (scripts/test-wrecks.js holds it): a ring of RING marks that
// fade out after a while and are overwritten oldest first - a hundred rounds into one wall cost what one does - and
// KEPT slots that stay until they are given back (a wreck's dents: part of its state, render/wrecks.js). A mark has an
// owner (the structure, the tree, the wreck or the prop it is on): when that goes, or moves, its marks go or move
// with it. At rest the pool does nothing at all: update() returns at once until the next mark is due to fade.
import * as THREE from 'three';
import { MARK_COLS, MARK_ROWS } from '../../shared/surfaces.js';
import { paintMarkAtlas } from './textures/marks.js';

export const MARK_RING = 400; // marks that fade (the newest overwrite the oldest)
export const MARK_KEPT = 448; // marks that stay while their owner keeps them
export const MARK_LIFE = 150; // s a fading mark lasts...
export const MARK_FADE = 10; // ...and then takes to go
const LIFT = 0.006; // m a mark sits off its surface (the material's polygon offset does the rest)

export class MarkPool {
  constructor(ring = MARK_RING, kept = MARK_KEPT) {
    this.ring = ring;
    this.kept = kept;
    const n = (this.cap = ring + kept);
    this.pos = new Float32Array(n * 12);
    this.rest = new Float32Array(n * 12); // where each stands when its owner is at rest (moveOwner)
    this.nrm = new Float32Array(n * 12);
    this.uv = new Float32Array(n * 8);
    this.col = new Float32Array(n * 16);
    this.alpha = new Float32Array(n);
    this.dies = new Float64Array(n).fill(Infinity); // when it starts to fade (kept ones: never)
    this.owner = new Array(n).fill(null);
    this.live = new Uint8Array(n);
    this.count = 0;
    this.next = 0; // the ring's next slot
    this.free = []; // kept slots given back
    this.keptUsed = 0;
    this.due = Infinity; // the earliest `dies` of a live mark
    this.fading = []; // the slots on their way out
    this.lo = n; // the slots changed since the buffers were last sent (lo > hi: none)
    this.hi = -1;
  }

  touch(i) {
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  // corners: 12 numbers, the quad's four corners (a, b, c, d going round, uv 0,0 - 1,0 - 1,1 - 0,1).
  // keep: a slot that never fades (or -1 when there are none left: the caller may fall back on a fading one)
  put(i, corners, nx, ny, nz, cell, r, g, b, a, owner, dies) {
    if (!this.live[i]) this.count++;
    this.live[i] = 1;
    this.pos.set(corners, i * 12);
    this.rest.set(corners, i * 12);
    const u0 = (cell % MARK_COLS) / MARK_COLS;
    const v1 = 1 - Math.floor(cell / MARK_COLS) / MARK_ROWS;
    const u1 = u0 + 1 / MARK_COLS;
    const v0 = v1 - 1 / MARK_ROWS;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    for (let k = 0; k < 4; k++) {
      this.nrm.set([nx, ny, nz], i * 12 + k * 3);
      this.col.set([r, g, b, a], i * 16 + k * 4);
    }
    this.alpha[i] = a;
    this.owner[i] = owner;
    this.dies[i] = dies;
    if (dies < this.due) this.due = dies;
    this.touch(i);
    return i;
  }
  add(corners, nx, ny, nz, cell, r, g, b, a, owner, now, life = MARK_LIFE) {
    const i = this.next;
    this.next = (i + 1) % this.ring;
    const f = this.fading.indexOf(i);
    if (f >= 0) this.fading.splice(f, 1);
    return this.put(i, corners, nx, ny, nz, cell, r, g, b, a, owner, now + life);
  }
  keep(corners, nx, ny, nz, cell, r, g, b, a, owner) {
    let i = -1;
    if (this.free.length) i = this.free.pop();
    else if (this.keptUsed < this.kept) i = this.ring + this.keptUsed++;
    if (i < 0) return -1;
    return this.put(i, corners, nx, ny, nz, cell, r, g, b, a, owner, Infinity);
  }

  kill(i) {
    if (!this.live[i]) return;
    this.live[i] = 0;
    this.count--;
    this.pos.fill(0, i * 12, i * 12 + 12);
    this.owner[i] = null;
    this.dies[i] = Infinity;
    if (i >= this.ring) this.free.push(i);
    this.touch(i);
  }
  // every mark on something that is gone (a wall torn down, a tree felled, a wreck made whole at dawn)
  removeOwner(owner) {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i] || this.owner[i] !== owner) continue;
      this.kill(i);
      n++;
    }
    if (n) this.fading = this.fading.filter((i) => this.live[i]);
    return n;
  }
  // the marks of `owner` within r of a point (a pane that has fallen out, a bumper that has come off); fading: only
  // the ones that fade (what the owner keeps it moves itself); spare: slots left alone whatever (a Set)
  removeNear(owner, x, y, z, r, fading = false, spare = null) {
    const P = this.rest;
    let n = 0;
    for (let i = 0, end = fading ? this.ring : this.cap; i < end; i++) {
      if (!this.live[i] || this.owner[i] !== owner || (spare && spare.has(i))) continue;
      const o = i * 12;
      if (Math.hypot((P[o] + P[o + 6]) / 2 - x, (P[o + 1] + P[o + 7]) / 2 - y, (P[o + 2] + P[o + 8]) / 2 - z) > r) continue;
      this.kill(i);
      n++;
    }
    if (n) this.fading = this.fading.filter((i) => this.live[i]);
    return n;
  }
  clear() {
    for (let i = 0; i < this.cap; i++) this.kill(i);
    this.fading.length = 0;
    this.due = Infinity;
  }
  // every mark on something that has moved: e, the 16 numbers of a matrix that takes it from rest to where it is
  // (null: back at rest)
  moveOwner(owner, e) {
    const P = this.pos, R = this.rest;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i] || this.owner[i] !== owner) continue;
      for (let k = i * 12; k < i * 12 + 12; k += 3) {
        const x = R[k], y = R[k + 1], z = R[k + 2];
        if (e) {
          P[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
          P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        } else {
          P[k] = x;
          P[k + 1] = y;
          P[k + 2] = z;
        }
      }
      this.touch(i);
    }
  }

  // Fades what is due. Returns true when anything changed (the buffers want sending). Nothing is due most of the
  // time, and then this is one comparison.
  update(now) {
    if (now >= this.due) {
      let due = Infinity;
      for (let i = 0; i < this.ring; i++) {
        if (!this.live[i]) continue;
        if (this.dies[i] <= now) {
          if (!this.fading.includes(i)) this.fading.push(i);
        } else if (this.dies[i] < due) due = this.dies[i];
      }
      this.due = due;
    }
    const f = this.fading;
    for (let k = f.length - 1; k >= 0; k--) {
      const i = f[k];
      const t = (now - this.dies[i]) / MARK_FADE;
      if (t >= 1 || !this.live[i]) {
        this.kill(i);
        f.splice(k, 1);
        continue;
      }
      const a = this.alpha[i] * (1 - t);
      for (let c = 0; c < 4; c++) this.col[i * 16 + c * 4 + 3] = a;
      this.touch(i);
    }
    return this.hi >= this.lo;
  }
}

// ---------------------------------------------------------------- where a mark lies
const _c = new Float32Array(12);
/**
 * The four corners of a mark at p on a surface whose normal is n: w along t (the stroke: any vector, taken into the
 * surface's plane; null: an angle of its own, `spin`), h across it. Returns a shared array (copy it to keep it).
 */
export function markCorners(px, py, pz, nx, ny, nz, w, h, tx, ty, tz, spin = 0) {
  // a first axis in the plane: the stroke's part of it, or whatever is most across the normal
  let ax, ay, az;
  let d = tx === undefined || tx === null ? 0 : tx * nx + ty * ny + tz * nz;
  if (tx !== undefined && tx !== null) {
    ax = tx - nx * d;
    ay = ty - ny * d;
    az = tz - nz * d;
  }
  let l = tx === undefined || tx === null ? 0 : Math.hypot(ax, ay, az);
  if (l < 0.05) {
    // (a stroke straight into the surface has no way across it)
    if (Math.abs(ny) < 0.9) {
      ax = -nz;
      ay = 0;
      az = nx;
    } else {
      ax = 1;
      ay = 0;
      az = 0;
    }
    d = ax * nx + ay * ny + az * nz;
    ax -= nx * d;
    ay -= ny * d;
    az -= nz * d;
    l = Math.hypot(ax, ay, az);
  }
  ax /= l;
  ay /= l;
  az /= l;
  let bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
  if (spin) {
    const c = Math.cos(spin), s = Math.sin(spin);
    const cx = ax * c + bx * s, cy = ay * c + by * s, cz = az * c + bz * s;
    bx = bx * c - ax * s;
    by = by * c - ay * s;
    bz = bz * c - az * s;
    ax = cx;
    ay = cy;
    az = cz;
  }
  const hw = w / 2, hh = h / 2;
  const ox = px + nx * LIFT, oy = py + ny * LIFT, oz = pz + nz * LIFT;
  _c[0] = ox - ax * hw - bx * hh;
  _c[1] = oy - ay * hw - by * hh;
  _c[2] = oz - az * hw - bz * hh;
  _c[3] = ox + ax * hw - bx * hh;
  _c[4] = oy + ay * hw - by * hh;
  _c[5] = oz + az * hw - bz * hh;
  _c[6] = ox + ax * hw + bx * hh;
  _c[7] = oy + ay * hw + by * hh;
  _c[8] = oz + az * hw + bz * hh;
  _c[9] = ox - ax * hw + bx * hh;
  _c[10] = oy - ay * hw + by * hh;
  _c[11] = oz - az * hw + bz * hh;
  return _c;
}

// ---------------------------------------------------------------- the mesh
export class Marks {
  constructor(scene) {
    const pool = (this.pool = new MarkPool());
    const n = pool.cap;
    const g = (this.geometry = new THREE.BufferGeometry());
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', (this.aPos = dyn(pool.pos, 3)));
    g.setAttribute('normal', (this.aNrm = dyn(pool.nrm, 3)));
    g.setAttribute('uv', (this.aUv = dyn(pool.uv, 2)));
    g.setAttribute('color', (this.aCol = dyn(pool.col, 4)));
    const idx = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    const tex = new THREE.CanvasTexture(paintMarkAtlas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.material = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, side: THREE.DoubleSide });
    this.material.name = 'marks';
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'marks';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1; // (with the other decals: before the smoke and the sparks)
    this.mesh.visible = false; // (nothing to draw until the first mark)
    scene.add(this.mesh);
    this.scene = scene;
  }

  // now: the game's clock (s)
  update(now) {
    const p = this.pool;
    if (!p.update(now)) return;
    for (const [a, k] of [[this.aPos, 12], [this.aNrm, 12], [this.aUv, 8], [this.aCol, 16]]) {
      a.addUpdateRange(p.lo * k, (p.hi - p.lo + 1) * k);
      a.needsUpdate = true;
    }
    p.lo = p.cap;
    p.hi = -1;
    this.mesh.visible = p.count > 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.map.dispose();
    this.material.dispose();
  }
}
