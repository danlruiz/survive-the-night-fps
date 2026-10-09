// Player-built structures drawn by kind: every structure of one type in one damage stage is an instance of one
// InstancedMesh a part of its model (a material), not a mesh a part a structure. A base of forty was some 550 draw
// calls a frame - each structure several meshes, each drawn in the view and again into every shadow map - and is a
// few dozen now.
// A structure's own group (models/structures.js createStructure) stays in the scene for everything that asks about
// it - its flames' anchor, a generator's shake, a floodlight's lamp, the outline on it (game/highlight.js) - with its
// stage meshes on a layer no camera draws (HIDDEN). Each frame update() puts an instance where that group is, in the
// stage it shows, while it is shown.
import * as THREE from 'three';
import { STRUCT_ORDER } from '../../shared/defs.js';
import { structureParts } from './models/structures.js';

export const HIDDEN = 31; // (a layer no camera has: the views, the shadow maps and the warm-up all draw layer 0)
const CAP0 = 8; // instances a batch starts with (it doubles when full)

export class StructureBatch {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map(); // 'type:stage' -> { type, stage, meshes (one a part), owners (an entity an instance) }
    this.list = new Set(); // the structures drawn here
  }

  // a structure's group joins (Entities, on its creation): drawn by the batch from now on
  add(e) {
    e.obj.traverse((o) => o.isMesh && o.parent?.name.startsWith('stage') && o.layers.set(HIDDEN));
    e.sb = { key: null, i: -1, x: NaN, y: NaN, z: NaN, ry: NaN, rz: NaN };
    this.list.add(e);
  }
  remove(e) {
    if (!e.sb) return;
    this.take(e);
    this.list.delete(e);
    e.sb = null;
  }

  // every frame, after whatever moved a structure (a blow's shake, a generator's) and before the draw
  update() {
    for (const e of this.list) {
      const o = e.obj;
      const sb = e.sb;
      const key = o.visible ? `${o.userData.structType}:${o.userData.stage}` : null;
      if (key !== sb.key) {
        this.take(e);
        if (key) this.put(e, key);
      }
      if (!sb.key) continue;
      const p = o.position, r = o.rotation;
      if (p.x === sb.x && p.y === sb.y && p.z === sb.z && r.y === sb.ry && r.z === sb.rz) continue;
      sb.x = p.x;
      sb.y = p.y;
      sb.z = p.z;
      sb.ry = r.y;
      sb.rz = r.z;
      o.updateMatrix(); // (a child of the scene: its matrix is its place in the world)
      for (const m of this.batches.get(sb.key).meshes) {
        m.setMatrixAt(sb.i, o.matrix);
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // e's instance, out of its batch: the last instance takes its place
  take(e) {
    const sb = e.sb;
    if (!sb.key) return;
    const b = this.batches.get(sb.key);
    const last = b.owners.length - 1;
    if (sb.i !== last) {
      const moved = b.owners[last];
      b.owners[sb.i] = moved;
      moved.sb.i = sb.i;
      for (const m of b.meshes) {
        m.getMatrixAt(last, _m);
        m.setMatrixAt(sb.i, _m);
      }
    }
    b.owners.pop();
    this.settle(b);
    sb.key = null;
    sb.i = -1;
    sb.x = NaN; // (written again wherever it goes next)
  }
  put(e, key) {
    const b = this.batch(key);
    if (b.owners.length === b.meshes[0].instanceMatrix.count) this.grow(b);
    e.sb.key = key;
    e.sb.i = b.owners.length;
    b.owners.push(e);
    e.obj.updateMatrix();
    for (const m of b.meshes) m.setMatrixAt(e.sb.i, e.obj.matrix);
    this.settle(b);
  }
  // after an instance came or went: what is drawn, and the sphere it is culled by (round all of them)
  settle(b) {
    const n = b.owners.length;
    for (const m of b.meshes) {
      m.count = n;
      m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true;
      if (n) m.computeBoundingSphere();
    }
  }

  batch(key) {
    let b = this.batches.get(key);
    if (b) return b;
    const [type, stage] = key.split(':').map(Number);
    b = { type, stage, owners: [], meshes: structureParts(type, stage).map((p) => this.mesh(p, CAP0)) };
    for (const m of b.meshes) this.scene.add(m);
    this.batches.set(key, b);
    return b;
  }
  mesh(part, cap) {
    const m = new THREE.InstancedMesh(part.geometry, part.material, cap);
    m.name = 'structures';
    m.castShadow = m.receiveShadow = true; // (as Entities set a structure's meshes)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.visible = false;
    return m;
  }
  // a batch full: its meshes twice the size (their matrices copied over)
  grow(b) {
    b.meshes = b.meshes.map((old) => {
      const m = this.mesh({ geometry: old.geometry, material: old.material }, old.instanceMatrix.count * 2);
      m.instanceMatrix.array.set(old.instanceMatrix.array);
      this.scene.remove(old);
      old.dispose(); // (its matrices only: the geometry and the material are the model's, shared)
      this.scene.add(m);
      return m;
    });
  }

  // Game.warmViews: every structure's parts as instances, so their programs (instanced) are built before play
  warm() {
    const out = [];
    for (const t of STRUCT_ORDER) for (let d = 0; d < 3; d++) for (const p of structureParts(t, d)) {
      const m = this.mesh(p, 1);
      m.count = 1;
      m.visible = true;
      out.push(m);
    }
    return out;
  }

  // a new world: every structure was the old one's
  clear() {
    for (const e of [...this.list]) this.remove(e);
  }
}
const _m = new THREE.Matrix4();
