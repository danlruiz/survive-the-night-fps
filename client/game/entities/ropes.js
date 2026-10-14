// The ropes (entities.js): a roper's tongue, from its mouth to whoever it has caught or to the rope in flight
// (PROJ.ROPE). One mesh each, drawn again every frame; the ones not drawn this frame are hidden. Laid onto Entities
// as methods (addMethods).
import * as THREE from 'three';
import { ZOMBIE_DEFS } from '../../../shared/defs.js';

const _v = new THREE.Vector3();

export const methods = {
  initRopes() {
    this.ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
    this.ropeGeo.translate(0, 0.5, 0);
    this.ropeGeo.rotateX(Math.PI / 2);
    this.ropeMat = new THREE.MeshLambertMaterial({ color: 0x6b2a2a });
    this.ropes = [];
  },

  // after a frame's drawing: the ropes nobody drew are hidden
  hideUnusedRopes() {
    for (let i = this.ropeUsed || 0; i < this.ropes.length; i++) this.ropes[i].visible = false;
    this.ropeUsed = 0;
  },

  nextRope() {
    let r = this.ropes[this.ropeUsed];
    if (!r) {
      r = new THREE.Mesh(this.ropeGeo, this.ropeMat);
      r.frustumCulled = false;
      this.scene.add(r);
      this.ropes.push(r);
    }
    this.ropeUsed++;
    r.visible = true;
    return r;
  },

  // where a zombie's mouth is (its model's mouth anchor, or just under its head)
  mouthPos(zombie, out) {
    const m = zombie.view?.object.userData.mouth;
    if (m) zombie.view.anchorWorld(m, out);
    else out.set(zombie.rx, zombie.ry + ZOMBIE_DEFS[zombie.ztype].headY - 0.1, zombie.rz);
    return out;
  },

  // a rope from a roper's mouth to (x, y, z)
  drawRopeTo(roper, x, y, z) {
    const r = this.nextRope();
    this.mouthPos(roper, _v);
    r.position.copy(_v);
    const len = Math.hypot(x - _v.x, y - _v.y, z - _v.z);
    r.lookAt(x, y, z);
    r.scale.set(1, 1, len);
  },

  // ...to the survivor it has caught (us: where we are drawn this frame)
  drawRope(roper, playerId) {
    const g = this.g;
    if (playerId === g.myId) return this.drawRopeTo(roper, g.renderPos.x, g.renderPos.y + 1.1, g.renderPos.z);
    const p = this.ents.get(playerId);
    if (p) this.drawRopeTo(roper, p.rx, p.ry + 1.1, p.rz);
  },
};
