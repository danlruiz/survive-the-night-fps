// A crawler on our own face, as we see it (ZTYPE.CRAWLER whose ZF.LINK is us): not a darkened screen but the raccoon
// itself, in the viewmodel scene (camera space), spread flat against the eyes with all four feet hooked round the head.
// What fills the view is its belly, the legs reaching back past the edges of the screen, the head and the tail over
// the top and the bottom. It slams in when it lands, heaves with its breathing and our struggle, jolts with every press
// of the shove key, and is pushed out from the face as the shove meter fills (the hands, ViewModel._push, push on it).
// The crawler's own world model is hidden while it is on us (entities.js), so this is the only one drawn.
import * as THREE from 'three';
import { ZANIM } from '../../shared/defs.js';
import { createZombieDog } from '../render/models/dog.js';

// camera space: where the rig's feet are held (it is latched: its feet are at the face, its belly further out), how
// much further out a full shove meter has it, and where it comes in from when it lands
const AT = [0, 0.055, -0.02];
const SHOVED = 0.12;
const TILT = 0.2; // (pitched, its hips further out than its shoulders: the hind feet show at the bottom corners)
const FROM = [0.05, -0.25, -0.9];
const IN_RATE = 9; // 1/s: the slam in
const KICK = 1.6; // a press of the shove key: m/s out from the face (a spring brings it back)

export class FaceLatch {
  constructor(vmScene) {
    this.view = createZombieDog(7, 'raccoon');
    this.view.setLatched(true);
    // (its latched pose has the belly to the rig's -Z, toward whoever it holds: turned, toward the eye)
    this.inner = new THREE.Group();
    this.inner.rotation.y = Math.PI;
    this.inner.add(this.view.object);
    this.group = new THREE.Group();
    this.group.name = 'facelatch';
    this.group.add(this.inner);
    this.group.visible = false;
    this.view.object.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // (its bounds are a dog's at ground level, far from where it is posed)
    });
    vmScene.add(this.group);
    // it starts out already clinging (no blend from a stance at its first frame on a face)
    for (let i = 0; i < 12; i++) this.view.update(0.1, ZANIM.ATTACK, 0, i * 0.1, true);
    this.k = 0; // 0..1: landed on the face
    this.on = false;
    this.kick = 0; // the jolt of the last presses (m, out from the face), and its spring's speed
    this.kickV = 0;
    this.shove = 0;
  }

  /** A press of the shove key while it is on us: it jolts out from the face. */
  jolt() {
    if (this.on) this.kickV += KICK;
  }

  /** on: a crawler has hold of our face (and we are alive to see it); shove: the meter, 0..1. */
  update(dt, on, shove, time) {
    if (on && !this.on) {
      this.k = 0;
      this.kick = this.kickV = 0;
      this.shove = 0;
    }
    this.on = on;
    this.group.visible = on;
    if (!on) return;
    this.k = Math.min(1, this.k + dt * IN_RATE);
    this.shove += ((shove || 0) - this.shove) * (1 - Math.exp(-dt * 18));
    // the jolt: a stiff, damped spring back onto the face
    this.kickV += (-this.kick * 260 - this.kickV * 18) * dt;
    this.kick = Math.max(-0.01, this.kick + this.kickV * dt);
    const e = 1 - (1 - this.k) * (1 - this.k) * (1 - this.k); // (eases out: a hard landing)
    const out = SHOVED * this.shove + this.kick;
    const writhe = 1 - 0.4 * this.shove;
    const g = this.group;
    g.position.set(
      FROM[0] + (AT[0] - FROM[0]) * e + Math.sin(time * 5.1) * 0.012 * writhe,
      FROM[1] + (AT[1] - FROM[1]) * e + Math.sin(time * 6.7 + 1) * 0.01 * writhe + Math.sin(time * 2.4) * 0.006,
      FROM[2] + (AT[2] - FROM[2]) * e - out,
    );
    // it rocks as it digs in, and twists away as it is shoved off
    g.rotation.set(TILT + Math.sin(time * 3.3) * 0.05 * writhe - 0.25 * this.shove, Math.sin(time * 4.1 + 2) * 0.06 * writhe, Math.sin(time * 2.7) * 0.08 * writhe + 0.35 * this.shove * this.shove, 'YXZ');
    // breathing: the belly heaves
    const br = 1 + Math.sin(time * 9) * 0.025;
    this.inner.scale.set(br, 1, br);
    this.view.update(dt, ZANIM.ATTACK, 0, time, true);
  }

  dispose() {
    this.view.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
