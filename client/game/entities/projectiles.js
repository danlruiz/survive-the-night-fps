// What is thrown, shot or spat, on the client (entities.js, ENT.PROJECTILE): a molotov, a flare, a frag, the
// noisemaker, an RPG grenade, acid, a roper's rope. Drawn at its samples, tumbling while it flies, lying as it lies
// once it stops. Laid onto Entities as methods (addMethods), so they are called on it as this.name(...).
import * as THREE from 'three';
import { PROJ } from '../../../shared/defs.js';
import { createProjectile } from '../../render/models/misc.js';

export const methods = {
  // Entities.onCreate
  createProjectileView(e) {
    const g = this.g;
    if (e.ptype === PROJ.SKYFLARE) {
      g.skyflares.addEntity(e); // (a flare gun's flare: drawn, lit and heard by game/skyflares.js)
      return;
    }
    // (a roper's rope is drawn from its mouth: ropes.js; an RPG grenade of our own is flown and drawn by
    // game/rockets.js from the moment it was fired)
    if (e.ptype === PROJ.ROPE || (e.ptype === PROJ.ROCKET && e.owner === g.myId)) return;
    const v = createProjectile(e.ptype);
    v.position.set(e.rx, e.ry, e.rz);
    this.scene.add(v);
    e.obj = v;
    if (e.ptype === PROJ.MOLOTOV) e.emitter = g.effects.createEmitter('torch', e.rx, e.ry, e.rz);
    if (e.ptype === PROJ.FLARE) {
      e.emitter = g.effects.createEmitter('flare', e.rx, e.ry, e.rz);
      e.fire = { x: e.rx, y: e.ry, z: e.rz, intensity: 1.25, color: 0xff3d22 };
      e.loop = g.audio.createLoop?.('torch', e.rx, e.ry, e.rz);
    }
    if (e.ptype === PROJ.ROCKET) {
      e.loop = g.audio.createLoop?.('rocket', e.rx, e.ry, e.rz);
      e.tx = e.rx; // where its trail was drawn up to
      e.ty = e.ry;
      e.tz = e.rz;
      // where it was fired from, as near as we know: the shooter, or where it was first seen
      const by = this.ents.get(e.owner);
      e.lx = by ? by.rx : e.rx;
      e.ly = by ? by.ry + 1.5 : e.ry;
      e.lz = by ? by.rz : e.rz;
    }
  },

  // The frag grenade and the noisemaker (models/misc.js heldProjectile): tumbling while they fly or roll, then settling
  // into how each lies still (userData.rest) - and the noisemaker, once down, rings: it rattles on its feet, and its
  // bells are heard (the 'alarm' loop) until the server takes it away.
  updateThrowable(e, moved, dt, time) {
    const o = e.obj;
    const r = o.userData.rest;
    if (moved) {
      e.stillT = 0;
      o.rotation.x += dt * 9;
      o.rotation.z += dt * 5;
      o.position.set(e.rx, e.ry, e.rz);
      return;
    }
    e.stillT = (e.stillT || 0) + dt;
    if (e.stillT < 0.1) return o.position.set(e.rx, e.ry, e.rz); // (between two snapshots of a moving one)
    if (!e.restQ) {
      // where it settles: its rest tilt, turned to a yaw of its own
      e.restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.rot[0], ((e.id * 2.39996) % (Math.PI * 2)) + r.rot[1], r.rot[2], 'YXZ'));
      e.settle = 0;
    }
    e.settle = Math.min(1, e.settle + dt / 0.18);
    o.quaternion.slerp(e.restQ, e.settle);
    let y = e.ry - 0.08 + r.y;
    if (e.ptype === PROJ.DECOY) {
      if (!e.loop) e.loop = this.g.audio.createLoop?.('alarm', e.rx, e.ry, e.rz);
      // the hammer drumming on the bells shakes the whole clock on its feet
      const k = 0.5 + 0.5 * Math.sin(time * 3.1 + e.id);
      o.rotateZ(Math.sin(time * 118) * 0.05 * (0.6 + 0.4 * k));
      o.rotateX(Math.sin(time * 93 + 1.3) * 0.025);
      y += Math.abs(Math.sin(time * 59)) * 0.0035;
    }
    o.position.set(e.rx, y, e.rz);
  },

  // Entities.update, once a frame
  updateProjectile(e, dt, renderTick, time) {
    const g = this.g;
    const tmp = this.tmp;
    e.samples.sample(renderTick, tmp);
    const moved = Math.hypot(tmp.x - e.rx, tmp.y - e.ry, tmp.z - e.rz) > 1e-3;
    e.rx = tmp.x;
    e.ry = tmp.y;
    e.rz = tmp.z;
    if (e.obj && e.ptype === PROJ.ROCKET) {
      // nose along its flight, smoke and flame behind it
      if (moved) {
        e.obj.lookAt(e.rx * 2 - e.obj.position.x, e.ry * 2 - e.obj.position.y, e.rz * 2 - e.obj.position.z);
        g.effects.rocketTrail(e.tx, e.ty, e.tz, e.rx, e.ry, e.rz, e.lx, e.ly, e.lz);
        e.tx = e.rx;
        e.ty = e.ry;
        e.tz = e.rz;
      }
      e.obj.position.set(e.rx, e.ry, e.rz);
    } else if (e.obj?.userData.rest) this.updateThrowable(e, moved, dt, time);
    else if (e.obj) {
      e.obj.position.set(e.rx, e.ry, e.rz);
      if (moved) {
        e.obj.rotation.x += dt * 9;
        e.obj.rotation.z += dt * 5;
      } else if (e.ptype === PROJ.FLARE) {
        e.obj.rotation.set(0, e.obj.rotation.y, 0);
      }
    }
    if (e.emitter) {
      e.emitter.x = e.rx;
      e.emitter.y = e.ry + (e.ptype === PROJ.FLARE ? 0.02 : 0.15);
      e.emitter.z = e.rz;
    }
    if (e.fire) {
      e.fire.x = e.rx;
      e.fire.y = e.ry - 0.6;
      e.fire.z = e.rz;
      this.fireSources.push(e.fire);
    }
    if (e.loop) e.loop.setPosition(e.rx, e.ry, e.rz);
    if (e.ptype === PROJ.ROPE) {
      const owner = this.ents.get(e.owner);
      if (owner && owner.view) this.drawRopeTo(owner, e.rx, e.ry, e.rz);
    }
  },
};
