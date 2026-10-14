// Client entity store: decodes into records, keeps per-entity interpolation sample rings, and owns
// the three.js views (zombies, remote survivors, the cat, items, structures, projectiles, crates, areas).
// What each kind of record is drawn as lives in entities/: zombies.js (and zombiekinds.js, what one kind of the dead
// does that the others do not), survivors.js, structures.js, projectiles.js, the ropes (ropes.js) and the loot glints
// (glints.js), laid onto Entities as methods; the deer is deer.js, and the vehicles, the handcar and the mounted gun
// are drawn by their own systems (vehicles.js, handcar.js, mountedgun.js).
import * as THREE from 'three';
import { ENT, PFLAG, HCAR_AT, dqpos, dqangle16, dqangle8, dqpitch } from '../../shared/protocol.js';
import { CANIM, STRUCT_DEFS, AREA, SOUND, ITEM_DEFS, structPickRadius } from '../../shared/defs.js';
import { canReach } from '../../shared/collision.js';
import { PICK_RADIUS, MATE_PICK_Y } from '../../shared/constants.js';
import { setZombieViewer } from '../render/models/characters.js';
import { createCat } from '../render/models/cat.js';
import { ScreechFx } from '../render/screechfx.js';
import { createDeerView, deerAnimChanged, removeDeerView, updateDeer } from './deer.js';
import { createPickup } from '../render/models/pickups.js';
import { StructureBatch } from '../render/structbatch.js';
import { createSupplyCrate } from '../render/models/misc.js';
import { getTexture } from '../render/textures.js';
import { Samples } from './entities/samples.js';
import { methods as zombieMethods } from './entities/zombies.js';
import { methods as survivorMethods } from './entities/survivors.js';
import { methods as structureMethods } from './entities/structures.js';
import { methods as projectileMethods } from './entities/projectiles.js';
import { methods as ropeMethods } from './entities/ropes.js';
import { methods as glintMethods } from './entities/glints.js';

const TAU = Math.PI * 2;
const PICK_STICK = 1.15; // the target already in the crosshair holds on inside this much more of its radius (pick)

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

function setShadowFlags(obj, cast, receive) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

// How far along the ray (o + d * t, d of unit length) it passes within r of c: t, or -1 when it misses or the sphere
// lies behind the eye or past maxT (+ r)
function rayReach(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const rx = cx - ox;
  const ry = cy - oy;
  const rz = cz - oz;
  const t = rx * dx + ry * dy + rz * dz;
  if (t < 0 || t > maxT + r) return -1;
  const px = rx - dx * t;
  const py = ry - dy * t;
  const pz = rz - dz * t;
  return px * px + py * py + pz * pz > r * r ? -1 : t;
}

export class Entities {
  constructor(game) {
    this.g = game;
    this.ents = new Map();
    this.charShadows = !!game.renderer?.q?.charShadows;
    this.corpses = [];
    this.zombieCount = 0;
    this.screechFx = new ScreechFx(game.scene);
    this.store = {
      ents: this.ents,
      onCreate: (e, t) => this.onCreate(e, t),
      onRemove: (e, t) => this.onRemove(e, t),
      onUpdate: (e, m, t) => this.onUpdate(e, m, t),
    };
    // flashlight cone for remote players
    const coneGeo = new THREE.ConeGeometry(4.2, 16, 20, 1, true);
    coneGeo.translate(0, -8, 0);
    coneGeo.rotateX(-Math.PI / 2);
    let coneTex = null;
    try {
      coneTex = getTexture('fx_cone');
    } catch {
      coneTex = null;
    }
    this.coneGeo = coneGeo;
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, map: coneTex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.initRopes(); // rope / tongue
    this.remoteFlash = [];
    this.fireSources = [];
    this.tmp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.bossEnt = null;
    this.frustum = _frustum; // this frame's view (update): what is out of it is not posed
    this.initGlints();
    this.caches = new Set();
    this.loose = new Set(); // every other item on the ground: a small glint up close (see update)
    this.smokes = new Set(); // the smokers' clouds (AREA.SMOKE): what the eye is in thickens the haze (Game, shared/smoke.js)
    this.stations = []; // built campfires / workbenches (crafting)
  }

  get scene() {
    return this.g.renderer.scene;
  }
  // what draws the structures (render/structbatch.js): each kind in one instanced call, not each structure on its own
  get structs() {
    return (this._structs ||= new StructureBatch(this.scene));
  }

  // a cutscene is on: the survivors are in its car or its plane, not standing where the server has their bodies
  hidePlayers() {
    for (const e of this.ents.values()) if (e.kind === ENT.PLAYER && e.view) e.view.object.visible = false;
  }

  clear() {
    for (const e of this.ents.values()) this.destroyView(e);
    this.ents.clear();
    this.caches.clear();
    this.loose.clear();
    this.stations.length = 0;
    for (const c of this.corpses) this.disposeZombieView(c.view);
    this.corpses.length = 0;
    for (const r of this.ropes) this.scene.remove(r);
    this.ropes.length = 0;
  }

  pushSample(e, t) {
    const q = e.q;
    let yaw = 0;
    let pitch = 0;
    if (e.kind === ENT.PLAYER) {
      yaw = dqangle16(q[3]);
      pitch = dqpitch(q[4]);
    } else if (e.kind === ENT.ZOMBIE || e.kind === ENT.CAT || e.kind === ENT.DEER) yaw = dqangle8(q[3]);
    else if (e.kind === ENT.VEHICLE) {
      yaw = dqangle16(q[3]);
      pitch = (((q[4] >> 8) << 24) >> 24) / 100; // (its steering, interpolated with the rest: game/vehicles.js)
    } else if (e.kind === ENT.HANDCAR) pitch = q[3] / HCAR_AT; // (a handcar's place on the line, interpolated as a pitch is: game/handcar.js)
    e.samples.push(t, dqpos(q[0]), dqpos(q[1]), dqpos(q[2]), yaw, pitch);
  }

  // ---------------------------------------------------------------- lifecycle
  setCharShadows(on) {
    if (on === this.charShadows) return;
    this.charShadows = on;
    for (const e of this.ents.values()) if (e.view && (e.kind === ENT.ZOMBIE || e.kind === ENT.PLAYER)) setShadowFlags(e.view.object, on, false);
  }

  // a model into the scene, casting (and receiving) shadows or not
  addToScene(obj, cast, receive) {
    setShadowFlags(obj, cast, receive);
    this.scene.add(obj);
  }

  onCreate(e, t) {
    e.samples = new Samples();
    this.pushSample(e, t);
    e.rx = dqpos(e.q[0]);
    e.ry = dqpos(e.q[1]);
    e.rz = dqpos(e.q[2]);
    e.ryaw = e.samples.sample(t, this.tmp).yaw; // spawn facing (zombies then ease toward new yaws)
    e.speed = 0;
    const g = this.g;
    if (!this.glints.parent) this.scene.add(this.glints);
    try {
      switch (e.kind) {
        case ENT.CACHE:
          this.caches.add(e);
          break;
        case ENT.ZOMBIE:
          this.createZombieView(e);
          break;
        case ENT.PLAYER:
          this.createSurvivorView(e);
          break;
        case ENT.CAT: {
          const v = createCat(e.variant, e.id);
          e.view = v;
          this.scene.add(v.object);
          e.meowT = 4 + Math.random() * 10;
          g.cat.attach(e); // (in somebody's arms: game/catcarry.js draws it there)
          break;
        }
        case ENT.GUN:
          g.gun.attach(e); // the mounted gun: client/game/mountedgun.js draws and turns it
          break;
        case ENT.VEHICLE:
          g.vehicles.attach(e); // a moped, a car, a bicycle: client/game/vehicles.js draws it
          break;
        case ENT.HANDCAR:
          g.handcar.attach(e); // a handcar on the railway: client/game/handcar.js draws it on the line
          break;
        case ENT.DEER:
          createDeerView(this, e);
          break;
        case ENT.ITEM: {
          const cat = ITEM_DEFS[e.item]?.cat;
          if (cat === 'part' || cat === 'schem') this.caches.add(e); // car supplies & schematics glint from afar
          else this.loose.add(e); // a dropped gun, a death pile, zombie loot: lost in the grass without one
          const v = createPickup(e.item);
          v.position.set(e.rx, e.ry, e.rz);
          v.rotation.y = ((e.id * 2654435761) % 1000) / 159;
          this.scene.add(v);
          e.obj = v;
          break;
        }
        case ENT.STRUCTURE:
          this.createStructureView(e);
          break;
        case ENT.PROJECTILE:
          this.createProjectileView(e);
          break;
        case ENT.CRATE: {
          const v = createSupplyCrate();
          v.position.set(e.rx, e.ry, e.rz);
          this.scene.add(v);
          e.obj = v;
          e.state = -1;
          this.applyCrateState(e);
          break;
        }
        case ENT.AREA: {
          if (e.atype === AREA.SMOKE) {
            e.emitter = g.effects.createEmitter('smoke', e.rx, e.ry, e.rz, { radius: e.radius });
            e.cloud = { x: e.rx, y: e.ry, z: e.rz, radius: e.radius };
            this.smokes.add(e.cloud);
          } else if (e.atype === AREA.FIRE) {
            e.emitter = g.effects.createEmitter('fire', e.rx, e.ry, e.rz, { radius: e.radius });
            e.fire = { x: e.rx, y: e.ry, z: e.rz, intensity: 1.6 };
            e.loop = g.audio.createLoop?.('fire', e.rx, e.ry + 0.5, e.rz);
          } else {
            e.emitter = g.effects.createEmitter('acid', e.rx, e.ry, e.rz, { radius: e.radius });
            e.loop = g.audio.createLoop?.('acid', e.rx, e.ry + 0.2, e.rz);
          }
          break;
        }
      }
    } catch (err) {
      console.error('entity view failed', e.kind, err);
    }
    this.onUpdate(e, 0xff, t, true);
  }

  onUpdate(e, mask, t, initial = false) {
    switch (e.kind) {
      case ENT.ZOMBIE:
        if (!initial && mask & 0b11) this.pushSample(e, t);
        this.zombieUpdated(e, mask, initial);
        break;
      case ENT.PLAYER:
        if (!initial && mask & 0b11) this.pushSample(e, t);
        if (mask & 0b100000 && !initial) this.survivorFired(e); // (PF.FIRE: fireCount changed -> third person anim)
        break;
      case ENT.CAT:
        if (initial) break;
        if (mask & 0b1000 && !e.q[5]) {
          // set down: drawn on the ground where it was put from the first frame, not slid down out of the arms it was in
          e.samples = new Samples();
          this.pushSample(e, t);
        } else if (mask & 0b11) this.pushSample(e, t);
        break;
      case ENT.HANDCAR:
        if (!initial && mask & 0b11) this.pushSample(e, t);
        break;
      case ENT.VEHICLE:
        if (!initial && mask & 0b11) this.pushSample(e, t);
        if (!initial) this.g.vehicles.changed(e);
        break;
      case ENT.DEER:
        if (!initial && mask & 0b11) this.pushSample(e, t);
        if (mask & 0b100) deerAnimChanged(this, e, initial);
        break;
      case ENT.ITEM:
        if (!initial && mask & 1) {
          this.pushSample(e, t);
          e.obj?.position.set(dqpos(e.q[0]), dqpos(e.q[1]), dqpos(e.q[2]));
        }
        break;
      case ENT.STRUCTURE:
        this.structureUpdated(e, mask, initial);
        break;
      case ENT.PROJECTILE:
        if (!initial && mask & 1) this.pushSample(e, t);
        break;
      case ENT.CRATE:
        if (!initial && mask & 1) this.pushSample(e, t);
        if (mask & 0b10) this.applyCrateState(e);
        break;
    }
  }

  // crate states: 3 tumbling off the plane's ramp, 0 under the canopy, 1 landed, 2 opened
  applyCrateState(e) {
    const st = e.q[3];
    if (st === e.state) return;
    const prev = e.state;
    e.state = st;
    const para = e.obj?.userData.parachute;
    if (para) {
      para.visible = st === 0;
      if (st === 0 && prev === 3) e.chuteT = 0; // the canopy blooms open
    }
    if (st === 1 && !e.emitter) e.emitter = this.g.effects.createEmitter('smoke_red', e.rx, e.ry, e.rz);
    if (st === 2 && e.emitter) {
      this.g.effects.removeEmitter(e.emitter);
      e.emitter = null;
    }
  }

  onRemove(e) {
    if (e.kind === ENT.ZOMBIE && this.keepCorpse(e)) return; // (the dead lie there a while)
    if (e.kind === ENT.DEER && removeDeerView(this, e)) return;
    this.destroyView(e);
  }

  destroyView(e) {
    if (e.kind === ENT.VEHICLE) this.g.vehicles.detach(e);
    const g = this.g;
    if (e.kind === ENT.CACHE || e.kind === ENT.ITEM) this.caches.delete(e);
    if (e.cloud) this.smokes.delete(e.cloud);
    if (e.kind === ENT.ITEM) this.loose.delete(e);
    if (e.kind === ENT.STRUCTURE) {
      const i = this.stations.indexOf(e);
      if (i >= 0) this.stations.splice(i, 1);
      this.structs.remove(e);
    }
    if (e.kind === ENT.ZOMBIE) {
      this.zombieCount--;
      this.disposeZombieView(e.view);
      if (this.bossEnt === e) this.bossEnt = null;
    } else if (e.kind === ENT.PLAYER || e.kind === ENT.CAT || e.kind === ENT.DEER) {
      if (e.kind === ENT.CAT) g.cat.detach(e);
      if (e.view) {
        this.scene.remove(e.view.object);
        e.view.dispose?.();
      }
      if (e.cone) this.scene.remove(e.cone);
    } else if (e.obj) {
      this.scene.remove(e.obj);
    }
    if (e.col) {
      g.world.structGrid.remove(e.col);
      g.impacts?.gone(e.col); // (what was scratched or shot into it goes with it)
    }
    if (e.skyView) g.skyflares.removeEntity(e);
    if (e.emitter) g.effects.removeEmitter(e.emitter);
    if (e.loop) e.loop.stop();
    if (e.burnLoop) e.burnLoop.stop();
    e.view = null;
    e.obj = null;
  }

  // Fire on a survivor or on a piece of what was built (a flammer's doing): flames over it (h m tall, r round it; w m
  // wide along its yaw, for a wall), its light, its crackle. Off: all of that goes
  updateFireOn(e, on, dt, camPos, h, r, w = 0) {
    if (!on) {
      if (e.blaze) {
        e.burnLoop?.stop();
        e.burnLoop = null;
        e.blaze = null;
      }
      return;
    }
    const g = this.g;
    const f = e.blaze || (e.blaze = { x: 0, y: 0, z: 0, intensity: w ? 0.8 : 0.45, big: w > 0 });
    f.x = e.rx;
    f.y = e.ry + h * 0.5 - 0.6; // (the light pool lifts a fire's light 1.2 m)
    f.z = e.rz;
    this.fireSources.push(f);
    const d2 = (e.rx - camPos.x) ** 2 + (e.rz - camPos.z) ** 2;
    if (d2 < 70 * 70) {
      const yaw = w ? ((e.rot8 || 0) / 256) * TAU : 0;
      const n = w ? Math.max(1, Math.round(w)) : 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() >= dt * (w ? 9 : 14)) continue;
        const u = w ? (Math.random() - 0.5) * w : 0;
        g.effects.burnPuff(e.rx + Math.cos(yaw) * u, e.ry, e.rz - Math.sin(yaw) * u, h * (w ? 0.8 : 0.9), w ? 0.15 : r);
      }
    }
    if (!e.burnLoop) e.burnLoop = g.audio.createLoop?.('burning', e.rx, e.ry + 1, e.rz) || null;
    e.burnLoop?.setPosition(e.rx, e.ry + 1, e.rz);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, renderTick, time, camPos) {
    const g = this.g;
    this.remoteFlash.length = 0;
    this.fireSources.length = 0;
    const flashCands = [];
    const cam = g.camera;
    setZombieViewer(cam.position.x, cam.position.y, cam.position.z);
    this.screechFx.update(dt);
    // this frame's view frustum: a zombie turning into view is posed now, not one frame late (with a stale pose)
    cam.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const e of this.ents.values()) {
      switch (e.kind) {
        case ENT.ZOMBIE:
          this.updateZombie(e, dt, renderTick, time, camPos);
          break;
        case ENT.PLAYER:
          this.survivorUpdate(e, dt, renderTick, time, camPos, flashCands);
          break;
        case ENT.CAT:
          this.updateCat(e, dt, renderTick, time, camPos);
          break;
        case ENT.DEER:
          updateDeer(this, e, dt, renderTick, time, camPos);
          break;
        case ENT.PROJECTILE:
          this.updateProjectile(e, dt, renderTick, time);
          break;
        case ENT.CRATE:
          this.updateCrate(e, dt, renderTick);
          break;
        case ENT.STRUCTURE:
          this.updateStructure(e, dt, camPos);
          break;
        case ENT.AREA:
          if (e.fire) this.fireSources.push(e.fire);
          break;
      }
    }
    g.cat.placeHeld(dt, time, camPos);
    g.vehicles.lampCands(flashCands, camPos); // (a lit headlamp is a light like a survivor's torch)
    flashCands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(2, flashCands.length); i++) this.remoteFlash.push(flashCands[i]);
    this.updateCorpses(dt, time);
    this.hideUnusedRopes();
    this.updateGlints(time, camPos);
  }

  // the stray cat on the ground (in somebody's arms, game/catcarry.js places it once they have moved: g.cat.placeHeld)
  updateCat(e, dt, renderTick, time, camPos) {
    if (e.q[5]) return;
    const g = this.g;
    const tmp = this.tmp;
    e.samples.sample(renderTick, tmp);
    const sp = Math.hypot(tmp.x - e.rx, tmp.z - e.rz) / Math.max(dt, 1e-3);
    e.speed += (Math.min(sp, 8) - e.speed) * Math.min(1, dt * 8);
    e.rx = tmp.x;
    e.ry = tmp.y;
    e.rz = tmp.z;
    e.ryaw = tmp.yaw;
    const v = e.view;
    if (!v) return;
    v.object.position.set(e.rx, e.ry, e.rz);
    v.object.rotation.y = e.ryaw;
    const distC = (e.rx - camPos.x) ** 2 + (e.rz - camPos.z) ** 2;
    if (distC < 60 * 60 || ((g.frame + e.id) & 1) === 0) v.update(distC < 60 * 60 ? dt : dt * 2, e.q[4], e.speed, time);
    // meows now and then when someone is close enough to hear (client-side, no bandwidth)
    e.meowT -= dt;
    if (e.meowT <= 0) {
      e.meowT = 9 + Math.random() * 16;
      if (distC < 20 * 20 && e.q[4] !== CANIM.RUN) g.audio.play(SOUND.CAT_MEOW, { x: e.rx, y: e.ry + 0.3, z: e.rz });
    }
  }

  // a supply drop: down off the plane's ramp, under its canopy, landed (its red smoke)
  updateCrate(e, dt, renderTick) {
    const tmp = this.tmp;
    e.samples.sample(renderTick, tmp);
    e.rx = tmp.x;
    e.ry = tmp.y;
    e.rz = tmp.z;
    if (e.obj) {
      e.obj.position.set(e.rx, e.ry, e.rz);
      if (e.state === 0) e.obj.rotation.y += dt * 0.3;
      if (e.chuteT !== undefined) {
        // streamer -> canopy: narrow and long, then it snaps open with a little overshoot
        const k = (e.chuteT = Math.min(1, e.chuteT + dt / 0.9));
        const b = k - 1;
        const w = 0.1 + 0.9 * (1 + 2.70158 * b * b * b + 1.70158 * b * b);
        e.obj.userData.parachute.scale.set(w, 1.3 - 0.3 * k, w);
        if (k >= 1) e.chuteT = undefined;
      }
    }
    if (e.emitter) {
      e.emitter.x = e.rx;
      e.emitter.y = e.ry;
      e.emitter.z = e.rz;
    }
  }

  // closest interactable along the view ray; with reachTop, only ones not behind a wall (see canReach). The radii
  // are shared with the server, which works out from them how far away an interaction can come from (Game.reachOf).
  // stick: the target picked last frame, held a little longer (PICK_STICK) so that a crosshair riding its edge does
  // not flick the prompt and the outline on and off (well inside the server's INTERACT_SLACK)
  pick(ox, oy, oz, dx, dy, dz, maxDist, reachTop, stick) {
    let best = null;
    let bestT = maxDist;
    for (const e of this.ents.values()) {
      let cx;
      let cy;
      let cz;
      let r;
      if (e.kind === ENT.ITEM) {
        cx = e.rx;
        cy = e.ry + 0.15;
        cz = e.rz;
        r = PICK_RADIUS.ITEM;
      } else if (e.kind === ENT.CRATE && e.state === 1) {
        cx = e.rx;
        cy = e.ry + 0.6;
        cz = e.rz;
        r = PICK_RADIUS.CRATE;
      } else if (e.kind === ENT.STRUCTURE) {
        cx = e.rx;
        cy = e.ry + Math.min(1, STRUCT_DEFS[e.stype].sy * 0.5);
        cz = e.rz;
        r = structPickRadius(e.stype);
      } else if (e.kind === ENT.CACHE) {
        cx = dqpos(e.q[0]);
        cy = dqpos(e.q[1]);
        cz = dqpos(e.q[2]);
        r = PICK_RADIUS.CACHE;
      } else if (e.kind === ENT.PLAYER && e.downed) {
        cx = e.rx;
        cy = e.ry + 0.3;
        cz = e.rz;
        r = PICK_RADIUS.DOWNED;
      } else if (e.kind === ENT.CAT && !e.q[5]) {
        cx = e.rx;
        cy = e.ry + 0.18;
        cz = e.rz;
        r = PICK_RADIUS.CAT;
      } else continue;
      if (e === stick) r *= PICK_STICK;
      const t = rayReach(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, bestT);
      if (t < 0) continue;
      const adj = e.kind === ENT.STRUCTURE ? t + 0.6 : e.kind === ENT.CACHE ? t + 0.15 : t; // prefer items over containers over structures
      if (adj < bestT && (reachTop === undefined || canReach(this.g.world, ox, oy, oz, cx, cy, cz, reachTop))) {
        bestT = adj;
        best = e;
      }
    }
    return best;
  }

  // A teammate in the crosshair to deal cards with (Dead Hand, game/cards.js): a survivor on their feet - alive, not
  // turned, not downed or held by the dead, not on a ride, a handcar or in a vehicle - and not us, aimed at round the
  // chest (MATE_PICK_Y up, PICK_RADIUS.MATE), within max of the eye and in its reach (the server's own check: reachOf,
  // a standing mate)
  pickMate(ox, oy, oz, dx, dy, dz, max, reachTop) {
    const g = this.g;
    const r = PICK_RADIUS.MATE;
    let best = null;
    let bestT = max;
    for (const e of this.ents.values()) {
      if (e.kind !== ENT.PLAYER || e.id === g.myId || !e.view) continue;
      const flags = e.q[5];
      if (flags & (PFLAG.DEAD | PFLAG.ZOMBIE | PFLAG.DOWNED | PFLAG.PINNED | PFLAG.ROPED) || e.seatK > 0 || e.cartK > 0 || e.vK > 0) continue;
      const cx = e.rx;
      const cy = e.ry + MATE_PICK_Y;
      const cz = e.rz;
      const t = rayReach(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, bestT);
      if (t < 0) continue;
      if (t < bestT && (reachTop === undefined || canReach(g.world, ox, oy, oz, cx, cy, cz, reachTop))) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }
}

for (const methods of [zombieMethods, survivorMethods, structureMethods, projectileMethods, ropeMethods, glintMethods]) {
  // laid on as if they had been written in the class (not enumerable, like a class's own); a name given twice is a mistake
  for (const [k, v] of Object.entries(methods)) {
    if (k in Entities.prototype) throw new Error(`Entities.${k} is defined twice`);
    Object.defineProperty(Entities.prototype, k, { value: v, writable: true, configurable: true });
  }
}
