// A zombie on the humanoid rig (or on the dog's: dog.js): its rig, built once per kind, variant and distance and
// cached (getRig), its height measured (calibrate), and the instance that poses it and draws it (ZombieInstance).
import * as THREE from 'three';
import { ZTYPE, ZOMBIE_DEFS, ZANIM } from '../../../../shared/defs.js';
import { instantiateRig, setFx, getCharacterMaterial, mulberry32, clamp, smooth } from '../skinning.js';
import { createZombieDog } from '../dog.js';
import { SHIN_L, SHIN_R } from './skeleton.js';
import { blendPose } from './posekit.js';
import { poseHumanoid, gaitLen, legCycleLen, updateGaze, viewer, COVER_T } from './pose.js';
import { BUILDERS, STYLES, VARIANTS, GLOWS, POSES, CALIBRATE_RUN, LOD_TYPES } from '../zombies/index.js';
import { DOG_RIGS } from '../zombies/dogs.js';
import { setBuildDetail } from '../zombies/helpers.js';

const PI = Math.PI;
const TAU = PI * 2;

// ------------------------------------------------------------------ rig cache
const NO_EXTRAS = {};

const rigCache = new Map();
// The detail the far copy of the humanoid dead is built at (zombies/helpers.js buildDetail; 1 near).
const LOD_DETAIL = 0.5;
const LOD_FAR = 15, LOD_NEAR = 12; // (m: at 15 m a walker is some 140 px tall on a 1080p screen)
function getRig(type, variant, far = false) {
  if (far && !LOD_TYPES.has(type)) return null;
  const key = type + ':' + variant + (far ? ':far' : '');
  let r = rigCache.get(key);
  if (!r) {
    setBuildDetail(far ? LOD_DETAIL : 1);
    try {
      const { mb, P, A } = BUILDERS[type](variant);
      r = mb.build();
      r.P = P;
      r.A = A || NO_EXTRAS; // per-variant animation quirks (e.g. dislocated jaw)
      r.shin = mb.shin;
      r.type = type;
    } finally {
      setBuildDetail(1);
    }
    rigCache.set(key, r);
  }
  return r;
}

// ------------------------------------------------------------------ calibration (head height)
const calib = new Map();
const _hv = new THREE.Vector3();
function calibrate(type, rig) {
  let c = calib.get(type);
  if (c) return c;
  const def = ZOMBIE_DEFS[type];
  if (type === ZTYPE.BAT) {
    c = { k: 1, dz: 0 };
    calib.set(type, c);
    return c;
  }
  const inst = new ZombieInstance(type, 12345, rig, { k: 1, dz: 0 });
  inst.body.scale.set(1, 1, 1);
  let sumY = 0, sumZ = 0;
  const N = 8;
  // calibrate on each type's dominant locomotion state
  const states = CALIBRATE_RUN.has(type) ? [ZANIM.RUN, ZANIM.RUN] : [ZANIM.WALK, ZANIM.IDLE];
  for (let i = 0; i < N; i++) {
    inst.state = states[i & 1];
    inst.time = 0;
    inst.off = 0;
    inst.phase = (i / N) * TAU;
    inst.speed = def.speed;
    inst.tilt = 0;
    poseHumanoid(inst);
    inst.applyPose(inst.pose, true);
    inst.object.updateMatrixWorld(true);
    inst.anchorWorld(inst.headCenter, _hv);
    sumY += _hv.y;
    sumZ += _hv.z;
  }
  const hy = sumY / N, hz = sumZ / N;
  c = { k: def.headY / hy, dz: 0, hz };
  inst.dispose();
  calib.set(type, c);
  return c;
}

// ------------------------------------------------------------------ zombie instance

class ZombieInstance {
  constructor(type, seed, rig, cal) {
    this.type = type;
    this.def = ZOMBIE_DEFS[type];
    this.seed = seed >>> 0;
    this.rig = rig;
    this.P = rig.P;
    this.A = rig.A;
    this.st = STYLES[type] || STYLES[ZTYPE.WALKER];
    this.isBat = type === ZTYPE.BAT;
    this.crawler = !!this.def.crawl; // on its front from the start, legs and all (a Mother's baby): poseCrawl
    this.landT = -1; // s since a dead bat hit the ground (land), -1 while it is still in the air
    const rnd = mulberry32(this.seed * 2654435761 + type);
    this.off = rnd() * 100;
    this.rate = 0.9 + rnd() * 0.2;
    this.limpSide = rnd() < 0.5 ? 0 : 1;
    this.armSide = rnd() < 0.5 ? 0 : 1;
    this.deadDir = rnd() < 0.5 ? 1 : -1;
    this.tilt = rnd() < 0.5 ? -1 : 1;
    this.cal = cal;
    const inst = instantiateRig(rig, getCharacterMaterial(), rig.sphere.radius * 1.6 + 0.4, true);
    this.mesh = inst.mesh;
    this.bones = inst.bones;
    this.skeleton = inst.skeleton;
    this.fx = inst.fx;
    this.boneRoot = inst.root;
    this.nb = this.bones.length;
    this.X = {};
    for (const [name, idx] of rig.names) this.X[name] = idx;
    this.pose = new Float32Array(this.nb * 4 + 3);
    this.snap = new Float32Array(this.nb * 4 + 3);
    this.out = new Float32Array(this.nb * 4 + 3);
    this.applied = new Float32Array(this.nb * 4 + 3);
    // Bone matrices come from a flat forward-kinematics pass over the pose array (see _solve) instead of
    // the Bone objects: the rig is rigid, bones are stored parents-first and bind poses are pure
    // translations. The Bone objects only carry the anchors (headCenter, mouth) and size the skeleton.
    const nb = this.nb;
    this.parent = new Int16Array(nb);
    this.bindPos = new Float64Array(nb * 3);
    this.localPos = new Float64Array(nb * 3);
    for (let i = 0; i < nb; i++) {
      const d = rig.bones[i];
      this.parent[i] = d.parent;
      this.bindPos.set(d.pos, i * 3);
      this.localPos[i * 3] = d.local.x;
      this.localPos[i * 3 + 1] = d.local.y;
      this.localPos[i * 3 + 2] = d.local.z;
    }
    this.world = new Float64Array(nb * 12); // per bone: 3x3 rotation*scale (column-major) + translation
    // bones scaled away to nothing: a head shot off (setHeadless), a shin and foot (setLegs) - or the stump under
    // each thigh, for as long as the shin is still there
    this.gone = new Uint8Array(nb);
    this.legs = 0;
    if (this.X.stumpL !== undefined) this.gone[this.X.stumpL] = this.gone[this.X.stumpR] = 1;
    if (this.X.wound !== undefined) this.gone[this.X.wound] = 1; // (a Mother's belly, whole until setBurst)
    // The renderer calls skeleton.update() for every drawn skinned mesh every frame, which re-uploads the
    // bone texture. The bones are mesh-local (detached rig), so only a new pose or fx value changes them:
    // solve + upload then, and only for zombies that are actually drawn.
    this.poseDirty = true;
    this.fxDirty = true;
    const skeleton = this.skeleton;
    skeleton.update = () => {
      if (this._refreshBones() && skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true;
    };
    this.object = new THREE.Group();
    this.object.name = 'zombie';
    this.body = new THREE.Group();
    const sw = 1 + (rnd() - 0.5) * 0.12, sh = 1 + (rnd() - 0.5) * 0.05;
    this.baseScale = cal.k;
    this.gScale = cal.k * sw; // ground distance per rig unit (planted-foot strides)
    this.wScale = 0; // set once the instance is placed in the world (calibration poses in place)
    this.wx = this.wz = this.wyaw = 0;
    this.body.scale.set(cal.k * sw, cal.k * sh, cal.k * sw);
    this.body.add(this.mesh);
    this.object.add(this.body);
    this.state = ZANIM.IDLE;
    this.sub = 0;
    this.lastAttack = -1e9;
    this.gazeYaw = 0;
    this.gazePitch = 0;
    this.gazeW = 0;
    this.flinchT = 9;
    this.flinchSide = 1;
    this.voxT = 9;
    this.voxKind = 0;
    this.footfalls = 0; // gait touchdowns so far (footstep sounds land with the feet)
    this.posedAt = -1;
    this.stateT = 0;
    this.fadeT = 1;
    this.fadeDur = 0.2;
    this.phase = rnd() * TAU;
    this.flapPh = rnd() * TAU;
    this.time = 0;
    this.speed = 0;
    this.hit = 0;
    this.headless = false;
    this.sacPulse = 0;
    this.bellyPulse = 0;
    this.abdPulse = 0;
    this._seen = true;
    this.mesh.onBeforeRender = () => {
      this._seen = true;
    };
    // In a crowd (render/crowd.js: the game's scene) it is not drawn by its own mesh: it is a row of the crowd's bone
    // texture and an instance of its geometry's batch. The crowd asks for the bones of those it draws.
    this.member = {
      root: this.object,
      body: this.body,
      mesh: this.mesh,
      geometry: rig.geometry,
      crowd: null,
      row: 0,
      fresh: false,
      solve: (out, at, force) => {
        const changed = this._refreshBones() || force;
        if (changed) out.set(skeleton.boneMatrices, at);
        return changed;
      },
      seen: () => {
        this._seen = true;
      },
    };
    // head center marker (for calibration/debug) + mouth anchor
    const headBone = this.bones[this.X.head];
    this.headCenter = new THREE.Object3D();
    if (!this.isBat) this.headCenter.position.set(0, this.P.headR * 0.9, 0);
    headBone.add(this.headCenter);
    this.mouth = new THREE.Object3D();
    const jawBone = this.bones[this.X.jaw];
    if (this.isBat) this.mouth.position.set(0, 0, -0.06);
    else this.mouth.position.set(0, -this.P.headR * 0.35, -this.P.headR * 0.85);
    jawBone.add(this.mouth);
    this.object.userData.mouth = this.mouth;
    this.object.userData.head = this.headCenter;
    this.object.userData.ztype = type;
    // initial pose
    this.computePose();
    this.out.set(this.pose);
    this.applyPose(this.out, true);
  }

  computePose() {
    const pose = POSES[this.type]; // (the bat poses itself)
    if (pose) pose(this);
    else poseHumanoid(this);
  }

  applyPose(p, force = false) {
    const a = this.applied;
    if (!force) {
      // settled poses (corpses at rest) repeat exactly: keep the bones already uploaded
      let same = true;
      for (let i = 0, n = p.length; i < n; i++) {
        if (a[i] !== p[i]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    a.set(p);
    this.poseDirty = true;
  }

  /**
   * Forward kinematics of the applied pose: bone i's local transform is T(offset) * R(euler XYZ) * S(scale)
   * (the root's offset is the pose translation), world = parent world * local, and the skinning matrix
   * is world * T(-bind position). Writes skeleton.boneMatrices[16..] (bone 0 is the fx bone).
   */
  _solve() {
    this.poseDirty = false;
    const p = this.applied;
    const nb = this.nb;
    const W = this.world;
    const par = this.parent;
    const lp = this.localPos;
    const bp = this.bindPos;
    const bm = this.skeleton.boneMatrices;
    const gone = this.gone;
    for (let i = 1; i < nb; i++) {
      const k = i * 4;
      const cx = Math.cos(p[k]), sx = Math.sin(p[k]);
      const cy = Math.cos(p[k + 1]), sy = Math.sin(p[k + 1]);
      const cz = Math.cos(p[k + 2]), sz = Math.sin(p[k + 2]);
      const s = gone[i] ? 0.001 : p[k + 3];
      // local rotation * scale, column-major (same as Matrix4.makeRotationFromEuler, order XYZ)
      const l0 = cy * cz * s, l1 = (cx * sz + sx * cz * sy) * s, l2 = (sx * sz - cx * cz * sy) * s;
      const l3 = -cy * sz * s, l4 = (cx * cz - sx * sz * sy) * s, l5 = (sx * cz + cx * sz * sy) * s;
      const l6 = sy * s, l7 = -sx * cy * s, l8 = cx * cy * s;
      let tx, ty, tz;
      if (i === 1) {
        tx = p[nb * 4];
        ty = p[nb * 4 + 1];
        tz = p[nb * 4 + 2] + this.cal.dz;
      } else {
        tx = lp[i * 3];
        ty = lp[i * 3 + 1];
        tz = lp[i * 3 + 2];
      }
      const o = i * 12;
      const pi = par[i];
      if (pi <= 0) {
        W[o] = l0; W[o + 1] = l1; W[o + 2] = l2;
        W[o + 3] = l3; W[o + 4] = l4; W[o + 5] = l5;
        W[o + 6] = l6; W[o + 7] = l7; W[o + 8] = l8;
        W[o + 9] = tx; W[o + 10] = ty; W[o + 11] = tz;
      } else {
        const q = pi * 12;
        const a0 = W[q], a1 = W[q + 1], a2 = W[q + 2], a3 = W[q + 3], a4 = W[q + 4], a5 = W[q + 5], a6 = W[q + 6], a7 = W[q + 7], a8 = W[q + 8];
        W[o] = a0 * l0 + a3 * l1 + a6 * l2;
        W[o + 1] = a1 * l0 + a4 * l1 + a7 * l2;
        W[o + 2] = a2 * l0 + a5 * l1 + a8 * l2;
        W[o + 3] = a0 * l3 + a3 * l4 + a6 * l5;
        W[o + 4] = a1 * l3 + a4 * l4 + a7 * l5;
        W[o + 5] = a2 * l3 + a5 * l4 + a8 * l5;
        W[o + 6] = a0 * l6 + a3 * l7 + a6 * l8;
        W[o + 7] = a1 * l6 + a4 * l7 + a7 * l8;
        W[o + 8] = a2 * l6 + a5 * l7 + a8 * l8;
        W[o + 9] = a0 * tx + a3 * ty + a6 * tz + W[q + 9];
        W[o + 10] = a1 * tx + a4 * ty + a7 * tz + W[q + 10];
        W[o + 11] = a2 * tx + a5 * ty + a8 * tz + W[q + 11];
      }
      // skinning matrix = world * T(-bind)
      const bx = bp[i * 3], by = bp[i * 3 + 1], bz = bp[i * 3 + 2];
      const m = i * 16;
      bm[m] = W[o]; bm[m + 1] = W[o + 1]; bm[m + 2] = W[o + 2]; bm[m + 3] = 0;
      bm[m + 4] = W[o + 3]; bm[m + 5] = W[o + 4]; bm[m + 6] = W[o + 5]; bm[m + 7] = 0;
      bm[m + 8] = W[o + 6]; bm[m + 9] = W[o + 7]; bm[m + 10] = W[o + 8]; bm[m + 11] = 0;
      bm[m + 12] = W[o + 9] - (W[o] * bx + W[o + 3] * by + W[o + 6] * bz);
      bm[m + 13] = W[o + 10] - (W[o + 1] * bx + W[o + 4] * by + W[o + 7] * bz);
      bm[m + 14] = W[o + 11] - (W[o + 2] * bx + W[o + 5] * by + W[o + 8] * bz);
      bm[m + 15] = 1;
    }
  }

  /** Brings the bone matrices up to date with a new pose or fx value. Returns whether they changed. */
  _refreshBones() {
    let changed = false;
    if (this.poseDirty) {
      this._solve();
      changed = true;
    }
    if (this.fxDirty) {
      this.skeleton.boneMatrices.set(this.fx.matrixWorld.elements, 0);
      this.fxDirty = false;
      changed = true;
    }
    return changed;
  }

  // where the entity view has put it in the world (it sets the object before update): for pinning planted feet and
  // the gaze
  _readPlacement() {
    this.wx = this.object.position.x;
    this.wz = this.object.position.z;
    this.wyaw = this.object.rotation.y;
  }

  /** World position of an anchor object parented to one of the bones (headCenter, mouth). */
  anchorWorld(anchor, out) {
    if (this.poseDirty) this._solve();
    const o = this.bones.indexOf(anchor.parent) * 12;
    const W = this.world;
    const { x, y, z } = anchor.position;
    out.set(W[o] * x + W[o + 3] * y + W[o + 6] * z + W[o + 9], W[o + 1] * x + W[o + 4] * y + W[o + 7] * z + W[o + 10], W[o + 2] * x + W[o + 5] * y + W[o + 8] * z + W[o + 11]);
    this.mesh.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.mesh.matrixWorld);
  }

  /** World position of a knee (0 the left, 1 the right): where the shin parts from the leg when it is shot off. */
  kneeWorld(side, out) {
    if (this.poseDirty) this._solve();
    const o = (side ? SHIN_R : SHIN_L) * 12, W = this.world;
    this.mesh.updateWorldMatrix(true, false);
    return out.set(W[o + 9], W[o + 10], W[o + 11]).applyMatrix4(this.mesh.matrixWorld);
  }

  update(dt, anim, speed, time, inView = false) {
    if (dt > 0.1) dt = 0.1;
    if (anim === ZANIM.FROZEN) return this.hold(dt, time);
    // client-side sub-state, with hysteresis so a noisy speed can't flicker it:
    // ATTACK: 0 braced / 1 walking / 2 running; IDLE: 1 = menacing (it just attacked, the prey is still close)
    // the server picks IDLE from the zombie's own velocity; when the crowd or a survivor shoves it along, walk
    if (anim === ZANIM.IDLE && !this.isBat && speed > (this.state === ZANIM.WALK ? 0.35 : 0.8)) anim = ZANIM.WALK;
    let sub = 0;
    if (anim === ZANIM.ATTACK && !this.isBat) {
      const m = this.state === ZANIM.ATTACK ? this.sub : 0;
      sub = speed > (m === 2 ? 2.6 : 3.2) ? 2 : speed > (m ? 0.25 : 0.6) ? 1 : 0;
      this.lastAttack = time;
    } else if (anim === ZANIM.IDLE && time - this.lastAttack < 2.5) sub = 1;
    if (anim !== this.state || sub !== this.sub) {
      this.snap.set(this.out);
      const thawed = this.state === ZANIM.FROZEN; // a shade the light let go of snaps back into motion
      if (anim !== this.state) this.stateT = 0; // a sub-state change keeps the attack's swing timing
      this.state = anim;
      this.sub = sub;
      this.fadeT = 0;
      this.fadeDur = anim === ZANIM.DEAD ? 0.12 : anim === ZANIM.STAGGER || anim === ZANIM.STUMBLE || thawed ? 0.1 : 0.25;
    }
    if (this.fell) {
      // its second leg has just gone from under it (setLegs): it goes down onto its front rather than snapping there
      this.fell = false;
      this.snap.set(this.out);
      this.fadeT = 0;
      this.fadeDur = 0.42;
    }
    this.stateT += dt;
    if (this.landT >= 0) this.landT += dt;
    this.fadeT += dt;
    this.flinchT += dt;
    this.voxT += dt;
    this.time = time;
    this.speed = speed;
    if (this.isBat) {
      this.flapPh += dt * (7 + clamp(speed, 0, 10) * 0.5) * this.rate * (this.state === ZANIM.ATTACK ? 0 : 1);
    } else if (anim !== ZANIM.DEAD) {
      const cyc = this.legs || this.crawler ? legCycleLen(this, speed) : gaitLen(this, anim === ZANIM.RUN || (anim === ZANIM.ATTACK && sub === 2), speed);
      this.phase += (dt * speed * TAU * this.rate) / cyc;
      if (this.phase > 1e4) this.phase -= TAU * 1000;
    }
    if (this.hit > 0) {
      this.hit = Math.max(0, this.hit - dt * 5);
    }
    const kindGlow = GLOWS[this.type]; // (what glows on it throbs: zombies/<kind>.js glow)
    let glow = kindGlow ? kindGlow(time, this.off) : 1;
    if (anim === ZANIM.DEAD) glow = Math.max(0.15, 1 - this.stateT * 0.6);
    if (setFx(this.fx, this.hit, glow)) this.fxDirty = true;
    // skip posing when culled (not rendered last frame, not in view now); crossfades still time out correctly
    const seen = this._seen;
    this._seen = false;
    if (!seen && !inView && this.fadeT > this.fadeDur) return;
    this._readPlacement();
    if (!this.isBat && this.wScale) updateGaze(this, dt);
    if (this.rigFar && viewer.on) {
      // the far copy past LOD_FAR, the near one again inside LOD_NEAR (the gap keeps one on the line from flickering)
      const dx = this.wx - viewer.x, dz = this.wz - viewer.z, d2 = dx * dx + dz * dz;
      const far = d2 > (this.far ? LOD_NEAR * LOD_NEAR : LOD_FAR * LOD_FAR);
      if (far !== this.far) {
        this.far = far;
        this.mesh.geometry = this.member.geometry = far ? this.rigFar.geometry : this.rig.geometry;
      }
    }
    this.posedAt = time;
    this.computePose();
    const o = this.out;
    if (this.fadeT < this.fadeDur) blendPose(o, this.snap, this.pose, smooth(this.fadeT / this.fadeDur));
    else o.set(this.pose);
    this.applyPose(o);
  }

  flash(a) {
    this.hit = Math.max(this.hit, clamp(a, 0, 1));
    if (setFx(this.fx, this.hit, 1)) this.fxDirty = true;
  }

  /**
   * Shade pinned by light (ZANIM.FROZEN): it throws its hands up over its eyes (poseCover) in COVER_T s and holds
   * there, perfectly still, while the light under its skin flares. Seen for the first time already frozen, it is
   * already covering them.
   */
  hold(dt, time) {
    if (this.state !== ZANIM.FROZEN) {
      this.snap.set(this.out);
      this.state = ZANIM.FROZEN;
      this.sub = 0;
      this.stateT = 0;
      this.fadeDur = COVER_T;
      this.fadeT = this.posedAt < 0 ? COVER_T : 0;
      this.gazeW = 0; // (its eyes are behind its hands)
    }
    this.stateT += dt;
    this.flinchT += dt;
    this.voxT += dt;
    this.time = time;
    this.speed = 0;
    const fading = this.fadeT < this.fadeDur;
    this.fadeT += dt;
    if (fading || this.posedAt < 0) {
      // (once the hands are up the pose never changes: nothing to work out until the light lets it go)
      this._readPlacement();
      this.posedAt = time;
      this.computePose();
      blendPose(this.out, this.snap, this.pose, smooth(Math.min(1, this.fadeT / this.fadeDur)));
      this.applyPose(this.out);
    }
    if (this.hit > 0) this.hit = Math.max(0, this.hit - dt * 5);
    if (setFx(this.fx, this.hit, 2.2 + 1.2 * Math.exp(-this.stateT * 5))) this.fxDirty = true;
  }

  /** Took a hit: flinch (a fresh hit restarts it, toward a random side). */
  hurt() {
    this.flinchT = 0;
    this.flinchSide = Math.random() < 0.5 ? -1 : 1;
  }

  /** Vocalizing (0 growl, 1 scream, 2 roar): the jaw and head move with the sound. */
  vocalize(kind) {
    this.voxKind = kind;
    this.voxT = 0;
  }

  /** Gait touchdowns so far, or -1 when this frame's pose had no planted-foot gait (culled, other states). */
  footfallCount() {
    // knuckle walk (tank): legCycle puts a foot down each half cycle, as its thigh reaches the front of the swing
    if (this.st.knuckle) return this.state === ZANIM.WALK || this.state === ZANIM.RUN ? Math.floor(this.phase / PI - 0.5) : -1;
    return (this.gOn || this.hopOn) && this.posedAt === this.time ? this.footfalls : -1;
  }

  setHeadless(v) {
    this.headless = !!v;
    if (!this.isBat) this.gone[this.X.head] = v ? 1 : 0;
    this.poseDirty = true;
  }

  /** A dead bat has hit the ground: it settles there on its back (zombies/bat.js pose). */
  land() {
    if (this.landT < 0) this.landT = 0;
  }

  /**
   * Legs shot off at the knee (bit 0 the left, bit 1 the right): the shin and foot go, the stump shows. On one leg it
   * hops, with neither it crawls (poseHobble, poseCrawl). fall: it has just happened, so it goes down over a moment.
   */
  setLegs(bits, fall = false) {
    bits &= 3;
    if (bits === this.legs || this.X.stumpL === undefined) return;
    if (bits === 3 && fall) this.fell = true;
    this.legs = bits;
    const g = this.gone;
    g[SHIN_L] = bits & 1;
    g[SHIN_R] = (bits >> 1) & 1;
    g[this.X.stumpL] = bits & 1 ? 0 : 1;
    g[this.X.stumpR] = bits & 2 ? 0 : 1;
    this.poseDirty = true;
  }

  /** A Mother's belly torn open (ZSTATUS.BURST): the bump goes, the hole it leaves shows. */
  setBurst(on) {
    if (this.X.wound === undefined || !!this.burst === !!on) return;
    this.burst = !!on;
    this.gone[this.X.womb] = on ? 1 : 0;
    this.gone[this.X.wound] = on ? 0 : 1;
    this.poseDirty = true;
  }

  dispose() {
    this.member.crowd?.remove(this.member);
    this.skeleton.dispose();
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

/** What the client has to draw a kind with (scripts/test-zombie-kinds.js): rig 'humanoid' (a builder: zombies/), 'dog'
 *  (dog.js), or null (none: it would be drawn as a walker); style: it has its own animation style (STYLES; a bat poses
 *  itself). */
export function zombieModelOf(ztype) {
  return { rig: ztype in DOG_RIGS ? 'dog' : BUILDERS[ztype] ? 'humanoid' : null, style: !!STYLES[ztype] };
}

/** Number of cached model variants for a zombie type (the seed passed to createZombie picks one). */
export function zombieVariants(ztype) {
  return VARIANTS[ztype] || 1;
}

/**
 * Create a zombie of the given ZTYPE. seed picks the variant + per-instance randomness.
 */
export function createZombie(ztype, seed = 0) {
  if (ztype in DOG_RIGS) return createZombieDog(seed, DOG_RIGS[ztype]);
  const type = BUILDERS[ztype] ? ztype : ZTYPE.WALKER;
  const nv = VARIANTS[type] || 1;
  const variant = nv > 1 ? ((seed >>> 0) * 2654435761 >>> 0) % nv : 0;
  const rig = getRig(type, variant);
  const cal = calibrate(type, getRig(type, 0));
  const z = new ZombieInstance(type, seed, rig, cal);
  z.rigFar = getRig(type, variant, true); // the copy it is drawn with from LOD_FAR away (null: none)
  z.wScale = z.gScale;
  return {
    object: z.object,
    update: (dt, anim, speed, time, inView) => z.update(dt, anim, speed, time, inView),
    flash: (a) => z.flash(a),
    hurt: () => z.hurt(),
    vocalize: (kind) => z.vocalize(kind),
    footfalls: () => z.footfallCount(),
    setHeadless: (v) => z.setHeadless(v),
    setLegs: (bits, fall) => z.setLegs(bits, fall),
    setBurst: (on) => z.setBurst(on),
    land: () => z.land(),
    kneeWorld: (side, out) => z.kneeWorld(side, out),
    shin: rig.shin === undefined ? null : { color: rig.shin, len: rig.P.shinLen * cal.k, thick: 0.06 * cal.k }, // the piece a shot-off leg leaves (Effects.gibLeg)
    anchorWorld: (a, out) => z.anchorWorld(a, out),
    dispose: () => z.dispose(),
    member: z.member, // (for a Crowd to draw it: render/crowd.js)
    _inst: z,
  };
}

/** Debug info for the sandbox (modelStats): triangle counts + calibration per type/variant. */
export function zombieStats() {
  const out = [];
  for (const t of Object.values(ZTYPE)) {
    if (!BUILDERS[t]) continue;
    const nv = VARIANTS[t] || 1;
    for (let v = 0; v < nv; v++) {
      const r = getRig(t, v);
      out.push({ type: t, variant: v, tris: r.tris, bones: r.bones.length, cal: calibrate(t, getRig(t, 0)) });
    }
  }
  return out;
}

/** Debug (models sandbox, scripts): a type's rig for a variant, its near or far copy. */
export function debugRig(type, variant = 0, far = false) {
  return getRig(type, variant, far);
}
