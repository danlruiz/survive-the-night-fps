// Trees shot or blown down to what stands of them (EVT.TREE_BREAK), until dawn. Foliage leaves them out of the
// instanced forest and they are drawn here instead: every cut tree of a variant an instance of one InstancedMesh a
// part of its model, the material cutting the model off at the instance's own height (aVegTop: materials.js
// VEG_TOP), and every splintered top an instance of one more. However many stand cut, it is a handful of draws -
// none while none does - and nothing a frame: the buffers are filled when a tree is cut, or the eye has moved.
import * as THREE from 'three';
import { vegCutMaterial } from './materials.js';
import { capParts, trunkAt } from './fallingtrees.js';

const CAP = 256; // cut trees of a variant drawn at the most (the nearest)
const REBUILD = 8; // m the eye moves before the buffers are filled again (as the forest's)

const _m = new THREE.Matrix4();
const _c = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class CutTrees {
  // trees: Foliage's InstancedSet of them (its data, per-instance matrices and variants)
  constructor(scene, trees) {
    this.scene = scene;
    this.trees = trees;
    this.tops = new Map(); // instance -> [m of it that stands, its trunk's radius at the foot]
    this.parts = trees.variants.map(() => null); // per variant, made when one is first cut: [{ mesh, top, minY }] a part
    this.caps = null;
    this.dirty = false;
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.radius = 0;
    this._list = [];
  }

  // instance i stands `top` m up its foot; r: its trunk's radius at the foot
  set(i, top, r) {
    this.tops.set(i, [top, r]);
    this.dirty = true;
  }

  // dawn: every tree stands whole again
  clear() {
    if (!this.tops.size) return;
    this.tops.clear();
    this.dirty = true;
  }

  _variant(v) {
    if (this.parts[v]) return this.parts[v];
    this.parts[v] = this.trees.variants[v].parts.map((part) => {
      // the part's own vertex buffers, and a per-instance top of its own
      const src = part.geometry;
      const geo = new THREE.BufferGeometry();
      geo.setIndex(src.index);
      for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
      const top = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
      top.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aVegTop', top);
      if (!src.boundingBox) src.computeBoundingBox();
      const mat = vegCutMaterial(part.material);
      const mesh = new THREE.InstancedMesh(geo, mat, CAP);
      mesh.customDepthMaterial = mat.userData.depth;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // (a few trees, near: not worth the bounds)
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, top, minY: src.boundingBox.min.y };
    });
    return this.parts[v];
  }

  _caps() {
    if (this.caps) return this.caps;
    const [geo, mat] = capParts();
    const mesh = new THREE.InstancedMesh(geo, mat, CAP * this.trees.variants.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    return (this.caps = mesh);
  }

  // the eye at (cx, cz), trees drawn out to `radius` m
  update(cx, cz, radius) {
    const cast = this.trees.castDist > 0;
    if (!this.dirty && radius === this.radius && Math.hypot(cx - this.lastX, cz - this.lastZ) < REBUILD) {
      for (const parts of this.parts) if (parts) for (const p of parts) p.mesh.castShadow = cast;
      return;
    }
    this.dirty = false;
    this.radius = radius;
    this.lastX = cx;
    this.lastZ = cz;
    const D = this.trees.data;
    const mats = this.trees.mats;
    const variants = this.trees.variants;
    // the cut trees in range, nearest first
    const list = this._list;
    list.length = 0;
    for (const [i, tr] of this.tops) {
      const d2 = (D[i * 6] - cx) ** 2 + (D[i * 6 + 2] - cz) ** 2;
      if (d2 <= radius * radius) list.push([d2, i, tr[0], tr[1]]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const n = variants.map(() => 0);
    const counts = this.parts.map((parts) => parts && parts.map(() => 0));
    let nc = 0;
    const caps = list.length ? this._caps() : this.caps;
    for (const [, i, top, r] of list) {
      const v = D[i * 6 + 5] | 0;
      if (n[v] >= CAP) continue;
      n[v]++;
      const parts = this._variant(v);
      const cnt = (counts[v] ||= parts.map(() => 0));
      const M = mats.subarray(i * 16, i * 16 + 16);
      _m.fromArray(M);
      _m.decompose(_p, _q, _s);
      const up = top / _s.y; // (up its own model, which the instance stretches)
      parts.forEach((p, k) => {
        if (p.minY >= up) return; // (a part all of it above the break: none of it stands)
        const at = cnt[k]++;
        p.mesh.instanceMatrix.array.set(M, at * 16);
        p.top.array[at] = up;
      });
      // its splintered top, the size of the trunk where it broke
      const rr = trunkAt(r, top, variants[v].height * _s.y);
      _c.compose(_p.addScaledVector(_up.set(0, 1, 0), top), _q.setFromAxisAngle(_up, i * 2.399), _s.set(rr, rr * 1.5, rr));
      _c.toArray(caps.instanceMatrix.array, nc++ * 16);
    }
    this.parts.forEach((parts, v) => {
      if (!parts) return;
      parts.forEach((p, k) => {
        const c = counts[v]?.[k] || 0;
        p.mesh.count = c;
        p.mesh.visible = c > 0;
        p.mesh.castShadow = cast;
        if (!c) return;
        p.mesh.instanceMatrix.clearUpdateRanges();
        p.mesh.instanceMatrix.addUpdateRange(0, c * 16);
        p.mesh.instanceMatrix.needsUpdate = true;
        p.top.clearUpdateRanges();
        p.top.addUpdateRange(0, c);
        p.top.needsUpdate = true;
      });
    });
    if (caps) {
      caps.count = nc;
      caps.visible = nc > 0;
      if (nc) {
        caps.instanceMatrix.clearUpdateRanges();
        caps.instanceMatrix.addUpdateRange(0, nc * 16);
        caps.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // how many draws it adds, of the view (not the shadow maps): the work it costs the frame
  draws() {
    let k = this.caps?.visible ? 1 : 0;
    for (const parts of this.parts) if (parts) for (const p of parts) if (p.mesh.visible) k++;
    return k;
  }

  dispose() {
    // (the geometries' buffers are the forest's own: only the per-instance ones go, with the meshes)
    for (const parts of this.parts) {
      if (!parts) continue;
      for (const p of parts) {
        p.mesh.removeFromParent();
        p.mesh.dispose();
      }
    }
    this.caps?.removeFromParent();
    this.caps?.dispose();
    this.parts = this.trees.variants.map(() => null);
    this.caps = null;
  }
}
