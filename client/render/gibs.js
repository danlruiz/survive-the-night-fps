// What is left of a body blown apart by an overkill hit (Effects throws them: effects.js): instanced pieces that
// tumble, bounce off the world, come to rest lying flat and then sink away like the corpses do. Unit-sized shapes,
// vertex colours for the gore; the instance colour gives a piece its hue (blood or acid for the meat, skin / cloth /
// bone for a limb).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { raycastWorld } from '../../shared/collision.js';

const GIB_GRAV = 20;
const GIB_SINK = 1.5; // seconds a piece takes to sink away once its time is up
const _gray = { t: -1, col: null, terrain: false };

function paintVerts(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) fn(pos.getX(i), pos.getY(i), pos.getZ(i), col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const paint = (col, o, r, g, b) => {
  col[o] = r;
  col[o + 1] = g;
  col[o + 2] = b;
};

// a ragged lump of meat, flatter than it is wide
export function lumpGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * Math.sin(x * 3.1 + 1.3) * Math.sin(z * 2.7 + 0.4) + 0.14 * Math.sin(y * 4.3 + x * 2.1);
    p.setXYZ(i, x * k, y * k * 0.6, z * k);
  }
  g.computeVertexNormals();
  return paintVerts(g, (x, y, z, col, o) => {
    const s = 0.6 + 0.4 * Math.sin(x * 5.3 + y * 3.9 + z * 4.7);
    paint(col, o, s, s, s);
  });
}

// a torn-off length of limb along X: a knuckle of hand / foot (or the head of a bone) at +X, a raw stump with the
// bone showing at -X
export function limbGeometry() {
  const g = new THREE.CylinderGeometry(0.72, 1, 1, 7, 3);
  g.rotateZ(-Math.PI / 2);
  paintVerts(g, (x, y, z, col, o) => {
    if (x < -0.4) paint(col, o, 1.1, 0.1, 0.08);
    else if (x < -0.1) paint(col, o, 1, 0.5, 0.45);
    else paint(col, o, 1, 1, 1);
  });
  const bone = new THREE.CylinderGeometry(0.3, 0.34, 0.26, 5);
  bone.rotateZ(Math.PI / 2);
  bone.translate(-0.58, 0, 0);
  paintVerts(bone, (x, y, z, col, o) => paint(col, o, 1.7, 1.6, 1.4));
  const end = new THREE.SphereGeometry(1, 7, 5);
  end.scale(0.2, 1.05, 1.3);
  end.translate(0.56, 0, 0);
  paintVerts(end, (x, y, z, col, o) => paint(col, o, 0.9, 0.9, 0.9));
  return mergeGeometries([g, bone, end]);
}

// a severed head: face towards -Z, a raw neck underneath
export function headGeometry() {
  const g = new THREE.SphereGeometry(1, 12, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * 0.82 * (y < 0 ? 1 + y * 0.25 : 1), y, p.getZ(i) * 0.95);
  }
  g.computeVertexNormals();
  return paintVerts(g, (x, y, z, col, o) => {
    if (y < -0.75) paint(col, o, 1.1, 0.1, 0.08); // neck
    else if (y > 0.5 || (z > 0.25 && y > 0)) paint(col, o, 0.22, 0.2, 0.18); // hair
    else if (z < -0.6 && y > 0.1 && Math.abs(x) > 0.2) paint(col, o, 0.1, 0.08, 0.08); // eye sockets
    else if (z < -0.6 && y < -0.5 && Math.abs(x) < 0.2) paint(col, o, 0.35, 0.05, 0.05); // mouth
    else paint(col, o, 1, 1, 1);
  });
}

export class GibPool {
  // sit: how much of a piece's half thickness stays above the ground when it lies there
  constructor(scene, geo, material, max, sit = 0.75) {
    this.sit = sit;
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.next = 0;
    this.state = new Uint8Array(max); // 0 free, 1 flying, 2 landed
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3); // roll about its length, yaw, pitch (applied yaw * pitch * roll)
    this.spin = new Float32Array(max * 3);
    this.scale = new Float32Array(max * 3);
    this.rad = new Float32Array(max); // half its thickness: how high its centre rests above the ground
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.rest = new Float32Array(max); // seconds since it landed for good
    this.trail = new Float32Array(max);
    this.bounces = new Uint8Array(max);
    this.green = new Uint8Array(max);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, this._c);
    }
    scene.add(this.mesh);
  }

  // a piece at (x,y,z) thrown with velocity v: sx = length, sy/sz = thickness, (r,g,b) its hue (sRGB)
  add(x, y, z, vx, vy, vz, sx, sy, sz, r, g, b, green) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    const k = i * 3;
    this.state[i] = 1;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    for (let c = 0; c < 3; c++) {
      this.rot[k + c] = Math.random() * 6.283;
      this.spin[k + c] = (Math.random() - 0.5) * 22;
    }
    this.scale[k] = sx;
    this.scale[k + 1] = sy;
    this.scale[k + 2] = sz;
    this.rad[i] = Math.min(sy, sz) * this.sit;
    this.age[i] = 0;
    this.life[i] = 8 + Math.random() * 3;
    this.rest[i] = 0;
    this.trail[i] = Math.random() * 0.07;
    this.bounces[i] = 0;
    this.green[i] = green ? 1 : 0;
    this.mesh.setColorAt(i, this._c.setRGB(r, g, b, THREE.SRGBColorSpace));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, fx) {
    const world = fx.world;
    const P = this.pos, V = this.vel, R = this.rot, W = this.spin;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const st = this.state[i];
      if (!st) continue;
      const k = i * 3;
      const rad = this.rad[i];
      const age = (this.age[i] += dt);
      let size = 1;
      let sink = 0;
      if (st === 1) {
        V[k + 1] -= GIB_GRAV * dt;
        const mx = V[k] * dt, my = V[k + 1] * dt, mz = V[k + 2] * dt;
        const len = Math.hypot(mx, my, mz);
        let floor = null; // height of what it came down on
        let wall = false;
        if (len > 1e-6) {
          raycastWorld(world, P[k], P[k + 1] - rad, P[k + 2], mx / len, my / len, mz / len, len, _gray);
          const c = _gray.col;
          // (the ground is checked below; a piece that starts inside something just falls out of it)
          if (c && _gray.t > 1e-3) {
            const hy = P[k + 1] - rad + (my / len) * _gray.t;
            if (my < 0 && hy > c.y1 - 0.08) {
              floor = hy;
              P[k] += mx * (_gray.t / len);
              P[k + 2] += mz * (_gray.t / len);
            } else wall = true;
          }
        }
        if (wall) {
          V[k] *= -0.3;
          V[k + 2] *= -0.3;
          P[k + 1] += my;
        } else if (floor === null) {
          P[k] += mx;
          P[k + 1] += my;
          P[k + 2] += mz;
          // down in the mine the rock round the drift stops it: back where it was, and off the way it came
          const mine = world.mine;
          if (mine && P[k + 1] < world.heightAt(P[k], P[k + 2]) - 0.3 && Number.isNaN(mine.voidFloor(P[k], P[k + 2], P[k + 1])) && !Number.isNaN(mine.voidFloor(P[k] - mx, P[k + 2] - mz, P[k + 1] - my))) {
            P[k] -= mx;
            P[k + 1] -= my;
            P[k + 2] -= mz;
            V[k] *= -0.3;
            V[k + 1] = Math.min(0, V[k + 1]);
            V[k + 2] *= -0.3;
          }
        }
        const gy = world.floorAt(P[k], P[k + 2], P[k + 1]);
        if (floor === null && P[k + 1] - rad <= gy) floor = gy;
        for (let c = 0; c < 3; c++) R[k + c] += W[k + c] * dt;
        if (age < 0.9 && (this.trail[i] -= dt) <= 0) {
          this.trail[i] = 0.07;
          fx.gibDrip(P[k], P[k + 1], P[k + 2], this.green[i]);
        }
        if (floor !== null) {
          P[k + 1] = floor + rad;
          if (!this.bounces[i]) fx.gibSplat(P[k], floor, P[k + 2], this.green[i]);
          if (V[k + 1] < -3 && this.bounces[i] < 2) {
            this.bounces[i]++;
            V[k] *= 0.55;
            V[k + 1] *= -0.32;
            V[k + 2] *= 0.55;
            for (let c = 0; c < 3; c++) W[k + c] *= 0.5;
          } else {
            this.state[i] = 2;
          }
        }
      } else {
        const over = age - this.life[i];
        if (over >= GIB_SINK) {
          this.state[i] = 0;
          size = 0;
        } else if (over > 0) {
          size = 1 - (over / GIB_SINK) * 0.6;
          sink = over * 0.2;
        } else if (this.rest[i] > 0.4) continue; // lying still
        else {
          // it flops over onto its side
          this.rest[i] += dt;
          const e = Math.min(1, dt * 16);
          R[k] += (Math.round(R[k] / Math.PI) * Math.PI - R[k]) * e;
          R[k + 2] += (Math.round(R[k + 2] / Math.PI) * Math.PI - R[k + 2]) * e;
        }
      }
      this._q.setFromEuler(this._e.set(R[k], R[k + 1], R[k + 2], 'YZX'));
      this._p.set(P[k], P[k + 1] - sink, P[k + 2]);
      this._s.set(this.scale[k] * size, this.scale[k + 1] * size, this.scale[k + 2] * size);
      this.mesh.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
