// What the survivors built, on the client (entities.js, ENT.STRUCTURE): each piece's collider, its damage, a torch's
// or a campfire's flame, the fire a flammer set on it, the crafting stations. Drawn in one instanced call a kind
// (render/structbatch.js). Laid onto Entities as methods (addMethods), so they are called on it as this.name(...).
import * as THREE from 'three';
import { STRUCT, STRUCT_DEFS } from '../../../shared/defs.js';
import { makeBox, COL } from '../../../shared/collision.js';
import { createStructure, setStructureDamage } from '../../render/models/structures.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

// a torch or a campfire: a flame of its own that burns down (its STRUCT_DEFS burn), lit or not (SF.STATE)
const hasFlame = (stype) => !!STRUCT_DEFS[stype].burn;

export const methods = {
  // Entities.onCreate
  createStructureView(e) {
    const g = this.g;
    const def = STRUCT_DEFS[e.stype];
    const yaw = (e.rot8 / 256) * TAU;
    const v = createStructure(e.stype);
    v.position.set(e.rx, e.ry, e.rz);
    v.rotation.y = yaw;
    this.addToScene(v, true, true);
    e.obj = v;
    e.hpFrac = e.q[3] / 255;
    setStructureDamage(v, e.hpFrac);
    let flags = COL.STRUCT;
    if (!def.block) flags |= COL.NOBLOCK;
    if (def.humanPass) flags |= COL.HUMANPASS;
    e.col = makeBox(e.rx, e.rz, e.ry - 0.3, e.ry + def.sy, def.sx, def.sz, yaw, flags, e.id);
    g.world.structGrid.add(e.col);
    if (hasFlame(e.stype)) {
      const camp = e.stype === STRUCT.CAMPFIRE;
      const a = v.userData.flameAnchor;
      if (a) {
        v.updateMatrixWorld(true);
        a.getWorldPosition(_v);
      } else _v.set(e.rx, e.ry + (camp ? 0.15 : 1.7), e.rz);
      e.emitter = g.effects.createEmitter(camp ? 'campfire' : 'torch', _v.x, _v.y, _v.z, { intensity: 1 });
      e.fire = camp ? { x: _v.x, y: _v.y, z: _v.z, intensity: 1, big: true } : { x: _v.x, y: _v.y - 1.2, z: _v.z, intensity: 0.8 };
      e.loop = g.audio.createLoop?.(camp ? 'campfire' : 'torch', _v.x, _v.y + 0.3, _v.z);
      this.applyTorchState(e);
    }
    if (def.station) this.stations.push(e);
    g.power?.add(e, v); // (a generator's drone and exhaust, a floodlight's lamp: game/power.js)
    this.structs.add(e);
  },

  // Entities.onUpdate (SF bits: 0b10 HP, 0b100 STATE)
  structureUpdated(e, mask, initial) {
    if (mask & 0b10 && e.obj) {
      const f = e.q[3] / 255;
      if (!initial && f < e.hpFrac - 0.001) e.shakeT = 0.25;
      e.hpFrac = f;
      setStructureDamage(e.obj, f);
    }
    if (mask & 0b100 && hasFlame(e.stype)) this.applyTorchState(e);
  },

  applyTorchState(e) {
    const lit = e.q[4] === 1;
    if (e.emitter) e.emitter.active = lit;
    if (e.fire) e.fire.intensity = lit ? (e.stype === STRUCT.CAMPFIRE ? 1 : 0.85) : 0;
    e.loop?.setVolume?.(lit ? 1 : 0);
    e.obj?.userData.setLit?.(lit);
  },

  // stations the local player can craft at: { fire, bench }
  stationsNear(x, z, r) {
    const out = { fire: false, bench: false };
    for (const e of this.stations) {
      if (Math.hypot(e.rx - x, e.rz - z) > r) continue;
      const def = STRUCT_DEFS[e.stype];
      if (def.station === 'fire' && e.q[4] === 1) out.fire = true;
      if (def.station === 'bench') out.bench = true;
    }
    return out;
  },

  // Entities.update, once a frame
  updateStructure(e, dt, camPos) {
    const g = this.g;
    // (past the drawing distance the haze has it: not drawn, nor its shadow, as the static world and a vehicle)
    if (e.obj) e.obj.visible = (e.rx - camPos.x) ** 2 + (e.rz - camPos.z) ** 2 < (g.viewDist ?? 1e9) ** 2;
    if (e.shakeT > 0 && e.obj) {
      e.shakeT -= dt;
      const s = e.shakeT * 0.2;
      e.obj.position.set(e.rx + (Math.random() - 0.5) * s, e.ry, e.rz + (Math.random() - 0.5) * s);
      if (e.shakeT <= 0) e.obj.position.set(e.rx, e.ry, e.rz);
    }
    if (e.fire && e.fire.intensity > 0) this.fireSources.push(e.fire);
    // a piece set alight by a flammer (SF.BURN on anything but a torch or a campfire: STRUCT_FIRE)
    if (!hasFlame(e.stype)) this.updateFireOn(e, !!e.q[5], dt, camPos, STRUCT_DEFS[e.stype].sy, 0, STRUCT_DEFS[e.stype].sx);
  },
};
