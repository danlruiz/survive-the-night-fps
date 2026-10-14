// The dead on the client: what Entities (entities.js) does for an ENT.ZOMBIE record - its model, where it is drawn,
// how it is heard, how it dies and lies there. What one kind does that the others do not is in zombiekinds.js.
// Laid onto Entities as methods (addMethods), so they are called on it as this.name(...) like any of its own.
import * as THREE from 'three';
import { POSE_NEAR, POSE_HZ } from '../../render/rates.js';
import { ZSTATUS } from '../../../shared/protocol.js';
import { ZANIM, ZOMBIE_DEFS, SOUND, greenBlood, zombieLoop } from '../../../shared/defs.js';
import { groundAt } from '../../../shared/collision.js';
import { CRAWL_HEIGHT, CRAWL_HEAD_Y, CRAWL_HEAD_FWD, WATER_LEVEL, GRAVITY } from '../../../shared/constants.js';
import { createZombie } from '../../render/models/characters.js';
import { initPath, followPath } from './samples.js';
import { ZOMBIE_VIEWS, MOUTH_OPEN } from './zombiekinds.js';

const HEAVY_STEP_SHAKE = 30; // a tank's footfall shakes the camera inside this distance (m), harder the nearer it lands
const HEAVY_RUN_SHAKE = 42; // ... and from this far off, harder still, when it is charging
const BAT_REST = 0.075; // m from a dead bat's origin down to its back, lying on the ground (poseBat once it lands)
const BAT_SOAK = 0.04; // ...and how far that back sits under the surface when it comes down on the water
export const CORPSE_SINK = 7; // s a corpse lies there before it sinks into the ground...
const CORPSE_GONE = 9; // ...and is gone
const MAX_CORPSES = 40;

const _v = new THREE.Vector3();
const _sph = new THREE.Sphere();

export const methods = {
  // Entities.onCreate
  createZombieView(e) {
    const g = this.g;
    initPath(e);
    const v = createZombie(e.ztype, e.variant * 7 + e.id);
    e.view = v;
    this.addToScene(v.object, this.charShadows, false);
    if (v.member) g.crowd?.add(v.member); // (drawn with every other of its kind in one call: render/crowd.js)
    v.setLegs?.(e.q[7]); // legs it lost before it came into view
    e.burst = !!(e.q[8] & ZSTATUS.BURST); // a Mother's belly, torn open before it came into view
    v.setBurst?.(e.burst);
    const growl = ZOMBIE_VIEWS[e.ztype].firstGrowl;
    e.growlT = growl[0] + Math.random() * growl[1];
    e.voice = 0.92 + ((((e.id * 2654435761) >>> 0) % 997) / 997) * 0.2; // its own throat: everything it utters is pitched by this
    e.stepT = Math.random();
    e.lastHp = e.q[5];
    e.dead = e.q[4] === ZANIM.DEAD;
    if (ZOMBIE_DEFS[e.ztype].boss) this.bossEnt = e;
    // the loop its row says it carries (a boss's breath; by default the wet, rattling breath of the dead, of which
    // only the nearest few are ever heard: the audio engine caps the loop)
    const loop = zombieLoop(e.ztype);
    if (loop === 'boss_breath') e.loop = g.audio.createLoop?.(loop, e.rx, e.ry + 2, e.rz);
    else if (loop && !e.dead) e.loop = g.audio.createLoop?.(loop, e.rx, e.ry + 1.5, e.rz);
    this.zombieCount++;
  },

  // Entities.onUpdate (ZF bits: 0b100 ANIM, 0b1000 HP, 0b100000 LEGS, 0b1000000 STATUS)
  zombieUpdated(e, mask, initial) {
    if (mask & 0b1000) {
      if (e.q[5] < e.lastHp) {
        e.view?.flash(1);
        e.view?.hurt();
        e.hurtT = 0.2;
      }
      e.lastHp = e.q[5];
    }
    if (mask & 0b100) {
      const anim = e.q[4];
      if (anim === ZANIM.DEAD && !e.dead) e.dead = true;
      if (!initial) ZOMBIE_VIEWS[e.ztype].onAnim?.(this, e, anim);
    }
    if (mask & 0b100000 && !initial) e.view?.setLegs?.(e.q[7], true); // ZF.LEGS: a leg has just been shot off
    if (mask & 0b1000000 && !initial && e.q[8] & ZSTATUS.BURST && !e.burst) this.bellyBurst(e); // ZF.STATUS
  },

  // Entities.onRemove: a dead one lies there a while (true); a live one just goes (false)
  keepCorpse(e) {
    if (!e.dead || !e.view) return false;
    this.corpses.push({ view: e.view, t: 0, x: e.rx, y: e.ry, z: e.rz, yaw: e.ryaw, burning: e.burning, fall: e.fall });
    e.view = null;
    this.zombieCount--;
    if (e.loop) e.loop.stop();
    if (e.burnLoop) e.burnLoop.stop();
    if (this.bossEnt === e) this.bossEnt = null;
    return true;
  },

  disposeZombieView(v) {
    if (!v) return;
    this.scene.remove(v.object);
    v.dispose?.();
  },

  // Entities.update, once a frame
  updateZombie(e, dt, renderTick, time, camPos) {
    const g = this.g;
    followPath(e, renderTick, g.latestTick, dt, this.tmp);
    const v = e.view;
    if (!v) return;
    const def = ZOMBIE_DEFS[e.ztype];
    const kind = ZOMBIE_VIEWS[e.ztype];
    if (e.dead && def.flying) e.ry = this.batDrop(e.fall || (e.fall = { y: e.ry, v: 0, landed: false }), e.rx, e.rz, v, dt);
    const distC = (e.rx - camPos.x) ** 2 + (e.rz - camPos.z) ** 2;
    v.object.position.set(e.rx, e.ry, e.rz);
    v.object.rotation.y = e.ryaw;
    kind.prePose?.(this, e, v);
    // How often it is posed. Past 60 m: every other frame. Nearer, but past POSE_NEAR (where its far copy is
    // drawn): no more than POSE_HZ times a second - at 80 frames a second or fewer that is every frame, as it
    // always was; at 240 the horde's limbs are worked out a third as often, and where each body stands and
    // which way it faces is still every frame's.
    e.poseDt = (e.poseDt ?? ((e.id % 8) / 8) / POSE_HZ) + dt;
    const far = distC >= 60 * 60;
    if (far ? ((g.frame + e.id) & 1) === 0 : distC < POSE_NEAR * POSE_NEAR || e.poseDt >= 1 / POSE_HZ) {
      _sph.center.set(e.rx, e.ry + def.height * 0.5, e.rz);
      _sph.radius = def.height * 0.75 + 0.4;
      v.update(far ? dt * 2 : Math.min(e.poseDt, 0.1), e.q[4], e.speed, time, this.frustum.intersectsSphere(_sph));
      e.poseDt = 0;
    }
    if (e.burning > 0) {
      e.burning -= dt;
      if (Math.random() < dt * 20) g.effects.burnPuff(e.rx, e.ry, e.rz);
    }
    this.updateBurning(e, dt, distC);
    kind.onFx?.(this, e, dt, distC);
    if (e.loop) {
      if (e.dead) {
        e.loop.stop();
        e.loop = null;
      } else e.loop.setPosition(e.rx, e.ry + 2, e.rz);
    }
    // ambient vocalizations + footsteps (client-side, no bandwidth)
    if (!e.dead && distC < 45 * 45) this.zombieSounds(e, v, dt, time, distC);
    kind.postDraw?.(this, e);
  },

  // what it utters now and then, and its footfalls
  zombieSounds(e, v, dt, time, distC) {
    const g = this.g;
    const def = ZOMBIE_DEFS[e.ztype];
    const kind = ZOMBIE_VIEWS[e.ztype];
    kind.preVoice?.(this, e, v, time);
    e.growlT -= dt;
    if (e.growlT <= 0) {
      e.growlT = kind.growlGap[0] + Math.random() * kind.growlGap[1];
      // what its row says it utters (shared/defs/zombies.js ZOMBIE_DEFS sounds): on the run, its fast one; else its growl,
      // a boss's roar, or - shambling about somewhere off in the trees, it moans; on the hunt or on top of you, it growls
      const say = def.sounds;
      const growl = say?.growl ?? kind.growl;
      const snd = say?.fast && e.speed > 3 && Math.random() < (say.fastChance ?? 1) ? SOUND[say.fast] : growl ? SOUND[growl] : def.boss ? SOUND.BOSS_ROAR : e.speed < 1.2 && distC > 14 * 14 && e.q[4] !== ZANIM.ATTACK ? SOUND.ZOMBIE_MOAN : SOUND.ZOMBIE_GROWL;
      if (kind.pause && Math.random() < kind.pause[0]) e.growlT += kind.pause[1];
      e.growlT *= kind.quicken;
      g.audio.play(snd, { x: e.rx, y: e.ry + kind.mouthY, z: e.rz, volume: kind.volume, rate: e.voice * kind.pitch });
      v.vocalize?.(MOUTH_OPEN[snd] || 0);
    }
    kind.postVoice?.(this, e, dt, distC);
    // a tank's (or a boss's) footfalls thump: they carry as far as its voice, and close by they shake the ground
    const heavy = kind.heavy;
    if (e.speed > 0.4 && !def.flying && !def.crawl && e.q[7] !== 3 && (heavy || distC < 22 * 22)) {
      // a visible planted-foot gait sounds its steps as the feet land; otherwise keep a cadence timer
      const stepVol = heavy ? 1 : kind.stepVol;
      const falls = v.footfalls ? v.footfalls() : -1;
      let stepped = false;
      if (falls >= 0) {
        stepped = e.falls !== undefined && falls !== e.falls;
        e.falls = falls;
        e.stepT = 1;
      } else {
        e.falls = undefined;
        e.stepT -= dt * (0.8 + e.speed * 0.45) * (kind.paws ? 1.8 : 1); // four paws: a quick, light patter
        if (e.stepT <= 0) {
          e.stepT = 1;
          stepped = true;
        }
      }
      if (stepped) {
        g.audio.footstep(g.surfaceAt(e.rx, e.ry, e.rz), e.rx, e.ry, e.rz, stepVol, { heavy });
        if (heavy) {
          // (Game.quake) a charge is its run: the footfalls come faster than one dies away, and the thumps run into a rumble
          const run = e.q[4] === ZANIM.RUN;
          const near = 1 - Math.sqrt(distC) / (run ? HEAVY_RUN_SHAKE : HEAVY_STEP_SHAKE);
          if (near > 0) g.quake = Math.min(1, g.quake + (run ? 1 : 0.7) * near);
        }
      }
    }
  },

  // a zombie that is alight (ZSTATUS.BURNING): flames up its body, its fire lights the dark around it, it crackles
  updateBurning(e, dt, distC) {
    if (e.dead || !(e.q[8] & ZSTATUS.BURNING)) {
      if (e.burnLoop) {
        e.burnLoop.stop();
        e.burnLoop = null;
      }
      return;
    }
    const g = this.g;
    const def = ZOMBIE_DEFS[e.ztype];
    if (distC < 70 * 70 && Math.random() < dt * 16) g.effects.burnPuff(e.rx, e.ry, e.rz, (e.q[7] === 3 ? CRAWL_HEIGHT : def.height) * 0.9, def.radius);
    const f = e.burnLight || (e.burnLight = { x: 0, y: 0, z: 0, intensity: 0.4 });
    f.x = e.rx;
    f.y = e.ry + def.height - 0.6; // (the light pool lifts a fire's light 1.2 m: this one sits over its head)
    f.z = e.rz;
    this.fireSources.push(f);
    if (!e.burnLoop) e.burnLoop = g.audio.createLoop?.('burning', e.rx, e.ry + 1, e.rz) || null;
    e.burnLoop?.setPosition(e.rx, e.ry + 1, e.rz);
  },

  // the dead lie where they fell for CORPSE_SINK s, then sink into the ground (MAX_CORPSES at most: the oldest go first)
  updateCorpses(dt, time) {
    const g = this.g;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      if (c.fall && !c.fall.landed) c.view.object.position.y = c.y = this.batDrop(c.fall, c.x, c.z, c.view, dt);
      c.view.update(dt, ZANIM.DEAD, 0, time);
      if (c.burning > 0) {
        c.burning -= dt;
        if (Math.random() < dt * 15) g.effects.burnPuff(c.x, c.y, c.z);
      }
      if (c.t > CORPSE_SINK) {
        c.view.object.position.y = c.y - (c.t - CORPSE_SINK) * 0.5;
        if (c.t > CORPSE_GONE) {
          this.disposeZombieView(c.view);
          this.corpses.splice(i, 1);
        }
      }
    }
    if (this.corpses.length > MAX_CORPSES) {
      const c = this.corpses.shift();
      this.disposeZombieView(c.view);
    }
  },

  // ---------------------------------------------------------------- events from server
  zombieDie(id, yaw, flags) {
    const e = this.ents.get(id);
    if (!e) return;
    e.dead = true;
    if (e.loop) {
      e.loop.stop(); // its breathing stops with it
      e.loop = null;
    }
    const g = this.g;
    const def = ZOMBIE_DEFS[e.ztype];
    const green = greenBlood(e.ztype);
    const crawl = e.q[7] === 3; // both legs shot off: it was lying on the ground, its head ahead of it
    if (flags & 8) {
      // overkill: the body is blown apart along the blow (yaw), nothing is left to fall over
      const biped = !def.flying && !def.headFwd;
      g.effects.gibBody(e.rx, e.ry, e.rz, crawl ? CRAWL_HEIGHT : def.height, def.radius, -Math.sin(yaw), -Math.cos(yaw), { green, head: biped && !(flags & 1), limbs: !def.flying, fur: !biped });
      g.audio.play(SOUND.HEADSHOT, { x: e.rx, y: e.ry + def.height * 0.5, z: e.rz, volume: 1.3, rate: 0.8 });
      g.audio.play(SOUND.MELEE_HIT, { x: e.rx, y: e.ry + def.height * 0.5, z: e.rz, rate: 0.7 });
      this.disposeZombieView(e.view);
      e.view = null;
      return;
    }
    if (flags & 1) {
      e.view?.setHeadless(true);
      const f = crawl ? CRAWL_HEAD_FWD : def.headFwd || 0; // quadrupeds carry the head ahead of the body
      g.effects.gib(e.rx - Math.sin(e.ryaw) * f, e.ry + (crawl ? CRAWL_HEAD_Y : def.headY), e.rz - Math.cos(e.ryaw) * f, green);
    }
    if (flags & 2) e.burning = 3;
    // the body hits the ground a moment after the kill: a thud, heavier for the big ones, a light flop for a dog
    if (!def.flying && !crawl) {
      const big = def.height > 2.5;
      const pup = def.headFwd && !def.boss; // a dog flops; the Alpha comes down like a horse
      g.audio.play(SOUND.BODY_FALL, { x: e.rx, y: e.ry + 0.2, z: e.rz, delay: big ? 0.8 : 0.5, volume: big ? 1.5 : pup ? 0.55 : def.headFwd ? 1.2 : 1, rate: big ? 0.72 : pup ? 1.25 : def.headFwd ? 0.85 : 1 });
    }
  },

  // A bat shot out of the air drops: the server leaves the dead where they died, so the fall is drawn here, under
  // GRAVITY from a standstill onto the floor under it (on the water it floats). f: { y, v, landed }, carried from the
  // live entity on into its corpse. Returns the height to draw it at.
  batDrop(f, x, z, view, dt) {
    const g = this.g;
    const floor = Math.max(groundAt(g.world, x, z, f.y - BAT_REST, 0.2, false), WATER_LEVEL - BAT_SOAK);
    if (f.landed) return (f.y = floor + BAT_REST); // (the drawn path can still carry it a little way after it lands)
    f.v += GRAVITY * dt;
    f.y -= f.v * dt;
    if (f.y - BAT_REST > floor) return f.y;
    f.y = floor + BAT_REST;
    f.landed = true;
    view.land();
    if (floor < WATER_LEVEL) {
      g.effects.splash(x, WATER_LEVEL, z, 0.2);
      g.audio.footstep('water', x, WATER_LEVEL, z, 0.5);
    } else g.audio.play(SOUND.BODY_FALL, { x, y: floor, z, volume: 0.35, rate: 1.6 });
    return f.y;
  },

  // A leg shot off (EVT.ZOMBIE_LEG; bits: 1 the left, 2 the right): the shin and foot fly off along the shot (yaw),
  // blood bursts from the knee. The model itself changes with the replicated ZF.LEGS field (zombieUpdated), which is
  // also what a client that was not there to see it gets.
  zombieLeg(id, bits, yaw) {
    const e = this.ents.get(id);
    const v = e?.view;
    if (!v?.shin) return;
    const g = this.g;
    const green = greenBlood(e.ztype);
    const c = v.shin.color;
    for (let side = 0; side < 2; side++) {
      if (!(bits & (1 << side))) continue;
      v.kneeWorld(side, _v);
      g.effects.gibLeg(_v.x, _v.y, _v.z, -Math.sin(yaw), -Math.cos(yaw), v.shin.len, v.shin.thick, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, green);
      g.audio.play(SOUND.HEADSHOT, { x: _v.x, y: _v.y, z: _v.z, volume: 1.1, rate: 0.85 });
    }
    v.hurt();
    // with neither leg left it goes down on its front
    if ((e.q[7] | bits) === 3 && !e.dead) g.audio.play(SOUND.BODY_FALL, { x: e.rx, y: e.ry + 0.2, z: e.rz, delay: 0.3, volume: 0.9 });
  },

  // A Mother's belly torn open by a shot (ZSTATUS.BURST): the bump bursts in blood and gore, and the model shows the
  // hole it leaves. Her babies come over the wire as zombies of their own.
  bellyBurst(e) {
    e.burst = true;
    const g = this.g;
    const v = e.view;
    v?.setBurst?.(true);
    v?.hurt();
    const def = ZOMBIE_DEFS[e.ztype];
    const y = e.ry + def.height * 0.55, f = 0.25;
    const x = e.rx - Math.sin(e.ryaw) * f, z = e.rz - Math.cos(e.ryaw) * f;
    g.effects.gib(x, y, z, false);
    g.audio.play(SOUND.BELLY_BURST, { x, y, z });
  },
};
