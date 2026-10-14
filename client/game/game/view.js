// Game: the first-person view - the camera, the hands and what they hold.
import * as THREE from 'three';
import { ZTYPE } from '../../../shared/defs.js';
import { ENT } from '../../../shared/protocol.js';
import { punchOf } from '../aimview.js';
import { raycastWorld } from '../../../shared/collision.js';
import { ViewModel } from '../../render/models/weapons.js';

const _wcF = new THREE.Vector3(), _wcR = new THREE.Vector3(), _wcU = new THREE.Vector3(), _wcD = new THREE.Vector3();
const _wcHit = { t: -1, col: null, terrain: false };
const WC_RAYS = [[0, 0], [0.3, -0.25]]; // (right, up) of the view: straight on, and out past the right hand

export const methods = {
  // The first-person arms and weapons. Baking their two 1024 px atlases holds the main thread for ~0.3 s, so it is
  // done in the shader warm-up behind the splash (warmViews), after the backdrop is on screen, or on the join if
  // that comes first - not in the constructor or the world build, where it held the splash's first picture back.
  ensureViewModel() {
    if (this.vm) return;
    this.vm = new ViewModel();
    this.renderer.vmScene.add(this.vm.group);
  },

  // How far the world is in front of the held item (m, along the view): two short rays from the eye, straight ahead and
  // out past the right hand where a gun's muzzle or a blade is, against walls, props, structures and the ground
  weaponClearance(cam) {
    const f = _wcF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const r = _wcR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const u = _wcU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    let near = 99;
    for (const [a, b] of WC_RAYS) {
      const d = _wcD.copy(f).addScaledVector(r, a).addScaledVector(u, b).normalize();
      raycastWorld(this.world, cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 1.4, _wcHit);
      if (_wcHit.t >= 0) near = Math.min(near, _wcHit.t * d.dot(f));
    }
    return near;
  },

  // a round of ours punches the view (aimview.js)
  punchView(def, aiming) {
    const p = punchOf(def, aiming);
    this.punch = p.amp;
    this.punchLen = p.len;
    this.punchT = 0;
  },

  // the crawler on our face, if one is (ZF.LINK: who it has hold of)
  latchedBy() {
    for (const e of this.entities.ents.values()) if (e.kind === ENT.ZOMBIE && e.ztype === ZTYPE.CRAWLER && e.q[6] === this.myId && !e.dead) return e;
    return null;
  },
};
