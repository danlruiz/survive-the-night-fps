// Visual effects: pooled CPU-simulated particles rendered as two Points draw calls (additive + alpha)
// sharing a sprite atlas, ground decals (instanced), gibs (instanced), bullet tracers, muzzle flashes, explosions and
// continuous emitters (campfire, torches, molotov fires, acid pools, supply-drop smoke).
import * as THREE from 'three';
import { IMPACT } from '../../shared/defs.js';
import { lerp } from '../../shared/rng.js';
import { getTexture } from './textures.js';
import { comfort } from './comfort.js';
import { TEX, LIT, buildAtlas, ParticlePool, DecalPool } from './particles.js';
import { lumpGeometry, limbGeometry, headGeometry, GibPool } from './gibs.js';

const TORCH_GAIN = 0.3; // how much of the flashlight a drop of blood throws back, next to a matt surface facing the lamp
const ROCKET_ARM = 10; // m out from the tube an RPG grenade's motor lights (rocketTrail)
const isSpot = (o) => o.isSpotLight;

// A smoke column over a ruin: a puff every 1 / rate s that lives `life` s, rising `rise` m/s (so the column stands
// life * rise m high: 84 m) and growing from size0 to size1 m across as it leans with the wind. 21 particles a column.
const COLUMN = { rate: 0.5, life: 42, rise: 2, size0: 5, size1: 34, alpha: 0.6, wind: [0.9, 0.35] };
const BLAZE_SEEN = 260; // m: a building fire's flames are emitted for an eye this close

export class Effects {
  constructor(scene, vmScene, world) {
    this.scene = scene;
    this.world = world;
    this.atlas = buildAtlas();
    this.add = new ParticlePool(2000, true, this.atlas, scene);
    this.alpha = new ParticlePool(3000, false, this.atlas, scene);
    this.blood = new DecalPool(scene, 'decal_blood', 90, 0x7a0a0a, 0.95);
    this.acid = new DecalPool(scene, 'decal_acid', 24, 0x6aff3a, 0.85);
    this.acid.life = 7;
    this.scorch = new DecalPool(scene, 'decal_scorch', 30, 0x111111, 0.85);
    // gibs: meat, limbs (and bare bones), heads
    const gibMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.gibLumps = new GibPool(scene, lumpGeometry(), gibMat, 110);
    this.gibLimbs = new GibPool(scene, limbGeometry(), gibMat, 70);
    this.gibHeads = new GibPool(scene, headGeometry(), gibMat, 14, 0.95);
    this.gibLoad = 0; // bodies blown apart lately: a crowd going up at once throws fewer pieces each
    // tracers
    this.tracerMax = 64;
    const tg = new THREE.BufferGeometry();
    this.tPos = new Float32Array(this.tracerMax * 6);
    this.tCol = new Float32Array(this.tracerMax * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo = tg;
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.tracers = [];
    // viewmodel muzzle flash sprite
    let muzzleTex = null;
    try {
      muzzleTex = getTexture('fx_muzzle');
    } catch {
      muzzleTex = null;
    }
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    this.vmFlash.visible = false;
    this.vmFlash.renderOrder = 10;
    vmScene.add(this.vmFlash);
    this.vmFlashT = 0;
    // world muzzle flashes (remote players)
    this.wFlashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      s.visible = false;
      scene.add(s);
      this.wFlashes.push({ s, t: 0 });
    }
    this.emitters = new Set();
    this.shake = 0;
    this.time = 0;
  }

  rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  // ---------------------------------------------------------------- one-shots
  // one drop of blood (green: acid blood): dark, each its own shade, lit like the body it left. It shrinks away rather
  // than fading out, so it is red to the end instead of going pink over whatever is behind it
  drop(x, y, z, vx, vy, vz, life, size, green, grav, drag) {
    const k = this.rnd(0.6, 1);
    this.alpha.emit(x, y, z, vx, vy, vz, life, size, size * 0.3, (green ? 0.15 : 0.34) * k, (green ? 0.3 : 0.006) * k, (green ? 0.035 : 0.008) * k, 1, green ? 0.08 : 0.16, green ? 0.16 : 0, 0, 0.8, grav, drag, TEX.BLOOD + LIT, this.rnd(-4, 4));
  }
  // the red (green) haze a burst of it leaves hanging for a moment
  mist(x, y, z, vx, vy, vz, life, size, size1, green) {
    this.alpha.emit(x, y, z, vx, vy, vz, life, size, size1, green ? 0.06 : 0.12, green ? 0.12 : 0.003, green ? 0.015 : 0.004, 0.55, green ? 0.03 : 0.06, green ? 0.06 : 0, 0, 0, 0, 3, TEX.SMOKE + LIT);
  }

  impact(kind, x, y, z, nx, ny, nz) {
    const A = this.alpha;
    const D = this.add;
    switch (kind) {
      case IMPACT.BLOOD:
      case IMPACT.GREEN_BLOOD: {
        const g = kind === IMPACT.GREEN_BLOOD;
        // a spit of small drops back out of the wound (the normal points back along the shot), a splash and a puff of
        // mist where it struck: gone in under half a second, and never big enough to hide what was hit. Past 5 m the
        // drops are drawn bigger (twice the size by 15 m): at their true size a hit across the road is a pixel or two
        const e = this.eye;
        const far = e ? 1 + Math.min(1, Math.max(0, (Math.hypot(x - e.x, y - e.y, z - e.z) - 5) / 10)) : 1;
        for (let i = 0; i < 9; i++) {
          const s = this.rnd(0.8, 4);
          const vx = nx * s + this.rnd(-1.1, 1.1), vy = ny * s + this.rnd(-0.4, 1.8), vz = nz * s + this.rnd(-1.1, 1.1);
          const t = this.rnd(0, 0.03); // a head start, so the very first frame is a spray and not a dot
          this.drop(x + vx * t, y + vy * t, z + vz * t, vx, vy, vz, this.rnd(0.22, 0.45), this.rnd(0.06, 0.13) * far, g, 11, 3);
        }
        this.drop(x, y, z, nx * 0.5, ny * 0.5, nz * 0.5, 0.14, 0.26 * far, g, 0, 0);
        this.mist(x, y, z, nx * 0.8, 0.3, nz * 0.8, 0.28, 0.2, 0.55, g);
        if (Math.random() < 0.55) {
          const gy = this.world.floorAt(x, z, y);
          if (y - gy < 2.2) (g ? this.acid : this.blood).add(x + this.rnd(-0.5, 0.5), gy + 0.03, z + this.rnd(-0.5, 0.5), this.rnd(0.5, 1.3));
        }
        break;
      }
      case IMPACT.DIRT:
        for (let i = 0; i < 7; i++) A.emit(x, y, z, nx * 2 + this.rnd(-1, 1), this.rnd(1, 3.5), nz * 2 + this.rnd(-1, 1), this.rnd(0.4, 0.9), 0.08, 0.12, 0.25, 0.2, 0.15, 1, 0.2, 0.17, 0.12, 0, 12, 1, TEX.BLOOD);
        A.emit(x, y, z, nx * 0.6, 0.5, nz * 0.6, 1.2, 0.3, 1.2, 0.42, 0.38, 0.32, 0.5, 0.4, 0.37, 0.33, 0, 0, 2, TEX.SMOKE, 0.5);
        break;
      case IMPACT.WOOD:
        for (let i = 0; i < 8; i++) A.emit(x, y, z, nx * 3 + this.rnd(-1.5, 1.5), this.rnd(0.5, 3), nz * 3 + this.rnd(-1.5, 1.5), this.rnd(0.4, 0.8), 0.08, 0.06, 0.45, 0.33, 0.2, 1, 0.3, 0.22, 0.14, 0.5, 12, 1, TEX.SPARK, 10);
        A.emit(x, y, z, nx * 0.5, 0.3, nz * 0.5, 0.9, 0.2, 0.8, 0.4, 0.35, 0.28, 0.45, 0.35, 0.3, 0.25, 0, 0, 2, TEX.SMOKE);
        break;
      case IMPACT.METAL:
      case IMPACT.SPARK:
        for (let i = 0; i < 12; i++) D.emit(x, y, z, nx * 4 + this.rnd(-3, 3), this.rnd(0, 4), nz * 4 + this.rnd(-3, 3), this.rnd(0.15, 0.4), 0.06, 0.02, 1, 0.8, 0.4, 1, 1, 0.4, 0.1, 0, 14, 0.5, TEX.SPARK);
        D.emit(x, y, z, 0, 0, 0, 0.07, 0.6, 0.2, 1, 0.8, 0.5, 1, 1, 0.6, 0.3, 0, 0, 0, TEX.GLOW);
        break;
      case IMPACT.ACID:
        for (let i = 0; i < 14; i++) A.emit(x, y, z, this.rnd(-2, 2), this.rnd(1, 4), this.rnd(-2, 2), this.rnd(0.4, 0.9), 0.12, 0.2, 0.4, 0.95, 0.2, 0.95, 0.2, 0.6, 0.1, 0, 10, 1, TEX.BLOOD);
        this.acid.add(x, this.world.floorAt(x, z, y) + 0.04, z, 4.6);
        break;
    }
  }

  // a body going into the water, or a stroke of someone swimming (shared/swim.js): a crown of spray thrown up and out
  // round x,z from the surface at y, and a puff of white where it broke. strength 0..1: a stroke ~0.15, a dive 1
  splash(x, y, z, strength = 1) {
    const A = this.alpha;
    const k = 0.5 + strength;
    for (let i = 0, n = Math.round(4 + 16 * strength); i < n; i++) {
      const a = this.rnd(0, Math.PI * 2);
      const s = this.rnd(0.5, 2) * k;
      A.emit(x + Math.sin(a) * 0.25, y, z + Math.cos(a) * 0.25, Math.sin(a) * s, this.rnd(1.2, 4) * k, Math.cos(a) * s, this.rnd(0.35, 0.7), 0.06, 0.03, 0.6, 0.66, 0.68, 0.8, 0.5, 0.56, 0.58, 0.3, 12, 0.6, TEX.BLOOD + LIT, this.rnd(-3, 3));
    }
    A.emit(x, y + 0.08, z, 0, 0.5 * k, 0, 0.6, 0.35 * k, 1.3 * k, 0.72, 0.76, 0.78, 0.45, 0.6, 0.64, 0.66, 0, 0, 2, TEX.SMOKE);
  }

  explosion(x, y, z, radius, kind) {
    const A = this.alpha;
    const D = this.add;
    if (kind === 1 || kind === 3) {
      // slam / rock: dust ring, debris
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const s = this.rnd(3, 8);
        A.emit(x, y + 0.3, z, Math.cos(a) * s, this.rnd(0.5, 2), Math.sin(a) * s, this.rnd(1, 2), 0.8, 3, 0.35, 0.31, 0.27, 0.7, 0.3, 0.28, 0.25, 0, -0.2, 2, TEX.SMOKE, 0.4);
      }
      for (let i = 0; i < 16; i++) A.emit(x, y + 0.3, z, this.rnd(-5, 5), this.rnd(3, 9), this.rnd(-5, 5), this.rnd(0.6, 1.2), 0.15, 0.1, 0.2, 0.17, 0.13, 1, 0.2, 0.17, 0.13, 1, 14, 0.5, TEX.BLOOD);
      this.shake = Math.max(this.shake, 0.6);
      return;
    }
    const green = kind === 2;
    // flash (dimmed by Settings > Accessibility: Reduce flashes)
    D.emit(x, y, z, 0, 0, 0, 0.18, radius * 2.5, radius * 4, 1, green ? 1 : 0.85, green ? 0.5 : 0.5, comfort.flash, 1, 0.4, 0.1, 0, 0, 0, TEX.GLOW);
    for (let i = 0; i < 36; i++) {
      const vx = this.rnd(-1, 1);
      const vy = this.rnd(0.2, 1.2);
      const vz = this.rnd(-1, 1);
      const s = this.rnd(3, 9);
      if (green) A.emit(x, y, z, vx * s, vy * s, vz * s, this.rnd(0.5, 1.2), 0.4, 1.2, 0.5, 0.75, 0.15, 0.9, 0.3, 0.5, 0.1, 0, 6, 2, TEX.BLOOD, 2);
      else D.emit(x, y, z, vx * s, vy * s, vz * s, this.rnd(0.3, 0.8), this.rnd(0.8, 1.6), 0.2, 1, 0.7, 0.3, 1, 0.8, 0.2, 0.05, 0, -1, 2.5, TEX.FIRE, 3);
    }
    for (let i = 0; i < 26; i++) {
      const s = this.rnd(1, 4);
      A.emit(x + this.rnd(-1, 1), y + this.rnd(0, 1), z + this.rnd(-1, 1), this.rnd(-1, 1) * s, this.rnd(0.5, 2) * s * 0.6, this.rnd(-1, 1) * s, this.rnd(2, 4), this.rnd(1, 2), this.rnd(4, 7), green ? 0.25 : 0.12, green ? 0.3 : 0.11, green ? 0.12 : 0.1, 0.75, 0.2, 0.2, 0.2, 0, -0.4, 1.2, TEX.SMOKE, 0.3);
    }
    for (let i = 0; i < 20; i++) D.emit(x, y, z, this.rnd(-12, 12), this.rnd(2, 12), this.rnd(-12, 12), this.rnd(0.5, 1.3), 0.08, 0.04, 1, 0.7, 0.3, 1, 1, 0.3, 0.05, 0, 12, 0.3, TEX.SPARK);
    const gy = this.world.floorAt(x, z, y);
    if (y - gy < 3) (green ? this.acid : this.scorch).add(x, gy + 0.05, z, radius * 1.1);
    this.shake = Math.max(this.shake, green ? 0.5 : 1);
  }

  structBreak(x, y, z) {
    for (let i = 0; i < 26; i++) this.alpha.emit(x + this.rnd(-1.4, 1.4), y + this.rnd(0.2, 2), z + this.rnd(-1.4, 1.4), this.rnd(-4, 4), this.rnd(1, 6), this.rnd(-4, 4), this.rnd(0.8, 1.6), 0.25, 0.15, 0.4, 0.3, 0.2, 1, 0.3, 0.22, 0.15, 0.8, 14, 0.5, TEX.BLOOD, 6);
    for (let i = 0; i < 10; i++) this.alpha.emit(x + this.rnd(-1.4, 1.4), y + this.rnd(0, 1.5), z + this.rnd(-1.4, 1.4), this.rnd(-1, 1), this.rnd(0.3, 1.2), this.rnd(-1, 1), 1.5, 0.8, 2.4, 0.35, 0.32, 0.28, 0.6, 0.3, 0.3, 0.28, 0, 0, 1.5, TEX.SMOKE);
  }

  // headshot kill: gory burst
  gib(x, y, z, green) {
    // bigger drops, thrown wider and longer in the air than a body hit's: the burst that says the head is gone
    for (let i = 0; i < 24; i++) {
      const s = this.rnd(1, 5);
      this.drop(x, y, z, this.rnd(-1, 1) * s, this.rnd(0, 1.2) * s, this.rnd(-1, 1) * s, this.rnd(0.45, 0.95), this.rnd(0.08, 0.2), green, 12, 1);
    }
    for (let i = 0; i < 2; i++) this.mist(x, y, z, this.rnd(-0.5, 0.5), this.rnd(0.3, 0.9), this.rnd(-0.5, 0.5), 0.45, 0.3, 0.9, green);
    const gy = this.world.floorAt(x, z, y);
    (green ? this.acid : this.blood).add(x, gy + 0.03, z, 1.6);
  }

  // overkill: the whole body comes apart. (x,y,z) = its feet, h / r = its height and radius, (dx,dz) = the way the blow
  // was travelling. opts: green (acid blood), head (it still had one to lose), limbs, fur (limbs are a dog's legs)
  gibBody(x, y, z, h, r, dx, dz, opts = {}) {
    const green = !!opts.green;
    const mass = Math.max(0.2, Math.min(3, (h / 1.75) * (r / 0.38)));
    const s = Math.sqrt(mass); // size of the pieces
    const few = this.gibLoad > 4 ? 0.5 : 1;
    this.gibLoad++;
    // blood: a burst thrown along the blow, a mist that hangs, a pool where it stood
    for (let i = Math.round((16 + 20 * Math.min(mass, 1.5)) * few); i > 0; i--) {
      const sp = this.rnd(1.5, 7);
      this.drop(x + this.rnd(-r, r) * 0.5, y + this.rnd(0.2, 1) * h, z + this.rnd(-r, r) * 0.5, (dx * 0.6 + this.rnd(-0.6, 0.6)) * sp, this.rnd(0, 1.1) * sp, (dz * 0.6 + this.rnd(-0.6, 0.6)) * sp, this.rnd(0.6, 1.3), this.rnd(0.12, 0.3) * s, green, 11, 0.8);
    }
    for (let i = 0; i < 5; i++) {
      this.mist(x + this.rnd(-r, r), y + this.rnd(0.3, 0.85) * h, z + this.rnd(-r, r), dx * this.rnd(0.4, 2) + this.rnd(-0.6, 0.6), this.rnd(0.2, 1), dz * this.rnd(0.4, 2) + this.rnd(-0.6, 0.6), this.rnd(0.7, 1.2), 0.6 * s, 2 * s, green);
    }
    const gy = this.world.floorAt(x, z, y);
    if (y - gy < 3) (green ? this.acid : this.blood).add(x + dx * 0.4, gy + 0.03, z + dz * 0.4, this.rnd(1.8, 2.6) * s);
    // the pieces: thrown along the blow, scattered sideways and up
    const toss = (pool, at, sx, sy, sz, cr, cg, cb, lift = 1) => {
      const sp = this.rnd(2, 6.5);
      pool.add(x + this.rnd(-r, r) * 0.6, y + at * h, z + this.rnd(-r, r) * 0.6, dx * sp + this.rnd(-2.6, 2.6), this.rnd(2, 6.5) * lift, dz * sp + this.rnd(-2.6, 2.6), sx, sy, sz, cr, cg, cb, green);
    };
    for (let i = Math.round(Math.min(16, 3 + 5 * mass) * few); i > 0; i--) {
      const size = this.rnd(0.08, 0.16) * s;
      const fat = !green && Math.random() < 0.15; // a paler, fattier piece
      toss(this.gibLumps, this.rnd(0.25, 0.95), size * this.rnd(1, 1.5), size, size * this.rnd(0.8, 1.2), green ? this.rnd(0.17, 0.25) : fat ? 0.42 : this.rnd(0.26, 0.4), green ? this.rnd(0.3, 0.42) : fat ? 0.25 : this.rnd(0.025, 0.045), green ? 0.07 : fat ? 0.2 : 0.03);
    }
    if (opts.limbs) {
      for (let i = 0; i < 4; i++) {
        const leg = i > 1; // a dog's four are all legs
        const len = (opts.fur ? 0.26 : leg ? 0.42 : 0.34) * s;
        const thick = (opts.fur ? 0.035 : leg ? 0.065 : 0.045) * s;
        if (opts.fur) toss(this.gibLimbs, this.rnd(0.2, 0.6), len, thick, thick, 0.2, 0.17, 0.14);
        else if (leg) toss(this.gibLimbs, this.rnd(0.15, 0.45), len, thick, thick, 0.17, 0.18, 0.22); // trouser leg
        else toss(this.gibLimbs, this.rnd(0.6, 0.85), len, thick, thick, 0.4, 0.42, 0.34); // bare, rotten arm
      }
    }
    for (let i = Math.round((1 + 2 * Math.min(mass, 2)) * few); i > 0; i--) {
      const thick = this.rnd(0.016, 0.026) * s;
      toss(this.gibLimbs, this.rnd(0.3, 0.9), this.rnd(0.14, 0.3) * s, thick, thick, 0.6, 0.57, 0.47); // bone
    }
    if (opts.head) {
      const hr = 0.115 * s;
      toss(this.gibHeads, 0.9, hr, hr, hr, 0.4, 0.42, 0.34, 1.2);
    }
  }

  // a leg shot off at the knee: the shin and foot it leaves, thrown along the shot (dx,dz) and tumbling like any other
  // piece, a burst of blood out of the stump at (x,y,z) and a pool under it. len / thick = the size of the shin,
  // (r,g,b) = what it wears
  gibLeg(x, y, z, dx, dz, len, thick, r, g, b, green) {
    for (let i = 0; i < 16; i++) {
      const sp = this.rnd(1, 4.5);
      this.drop(x, y, z, (dx * 0.5 + this.rnd(-0.7, 0.7)) * sp, this.rnd(-0.2, 1) * sp, (dz * 0.5 + this.rnd(-0.7, 0.7)) * sp, this.rnd(0.4, 0.85), this.rnd(0.08, 0.18), green, 12, 1);
    }
    this.mist(x, y, z, dx * 0.6 + this.rnd(-0.3, 0.3), this.rnd(0.2, 0.6), dz * 0.6 + this.rnd(-0.3, 0.3), 0.5, 0.25, 0.8, green);
    const gy = this.world.floorAt(x, z, y);
    if (y - gy < 2.5) (green ? this.acid : this.blood).add(x + dx * 0.2, gy + 0.03, z + dz * 0.2, this.rnd(1, 1.5));
    const sp = this.rnd(2.5, 5);
    this.gibLimbs.add(x, y - len * 0.4, z, dx * sp + this.rnd(-1.6, 1.6), this.rnd(2.2, 4.5), dz * sp + this.rnd(-1.6, 1.6), len, thick, thick, r, g, b, green);
    // splinters of bone with it
    for (let i = 0; i < 2; i++) {
      const t = this.rnd(0.014, 0.022);
      this.gibLimbs.add(x, y, z, dx * this.rnd(1, 4) + this.rnd(-2, 2), this.rnd(1.5, 4), dz * this.rnd(1, 4) + this.rnd(-2, 2), this.rnd(0.08, 0.16), t, t, 0.6, 0.57, 0.47, green);
    }
  }

  // a flying gib: the drops it trails, the smear where it lands
  gibDrip(x, y, z, green) {
    this.drop(x, y, z, this.rnd(-0.4, 0.4), this.rnd(-0.2, 0.6), this.rnd(-0.4, 0.4), this.rnd(0.35, 0.6), this.rnd(0.08, 0.15), green, 9, 1);
  }
  gibSplat(x, y, z, green) {
    for (let i = 0; i < 3; i++) this.drop(x, y + 0.05, z, this.rnd(-1.2, 1.2), this.rnd(0.6, 2), this.rnd(-1.2, 1.2), this.rnd(0.3, 0.5), this.rnd(0.08, 0.14), green, 10, 1);
    if (Math.random() < (green ? 0.2 : 0.45)) (green ? this.acid : this.blood).add(x, y + 0.03, z, this.rnd(0.35, 0.8));
  }

  // a body on fire: flames licking up it, smoke off the top. h / r = how tall and how wide it is
  burnPuff(x, y, z, h = 1.2, r = 0.3) {
    const s = Math.max(1, r / 0.4);
    this.add.emit(x + this.rnd(-r, r), y + this.rnd(0, h), z + this.rnd(-r, r), 0, this.rnd(1, 2.5), 0, this.rnd(0.3, 0.6), this.rnd(0.5, 0.9) * s, 0.1, 1, 0.55, 0.2, 0.9, 0.9, 0.2, 0.05, 0, -2, 1, TEX.FIRE, 2);
    this.alpha.emit(x, y + h + 0.1, z, this.rnd(-0.3, 0.3), 1.5, this.rnd(-0.3, 0.3), 1.6, 0.5 * s, 1.8 * s, 0.1, 0.09, 0.08, 0.6, 0.15, 0.15, 0.15, 0, -0.2, 0.8, TEX.SMOKE);
  }

  // a smoker on the move (ZTYPE.SMOKER: client side only, nothing a survivor's sight is cut by): wisps seeping off its
  // body, h tall and r round, and the trail it leaves at its feet, low and slow to thin, that marks the way it came
  smokerWisp(x, y, z, h, r) {
    const c = this.rnd(0.05, 0.08);
    this.alpha.emit(x + this.rnd(-r, r), y + this.rnd(0.6, h), z + this.rnd(-r, r), this.rnd(-0.15, 0.15), this.rnd(0.35, 0.8), this.rnd(-0.15, 0.15), this.rnd(1.5, 2.5), this.rnd(0.25, 0.4), this.rnd(1.1, 1.6), c, c * 0.95, c * 0.9, 0.75, 0.14, 0.13, 0.12, 0, -0.05, 0.6, TEX.SMOKE, this.rnd(-0.3, 0.3));
  }
  smokerTrail(x, y, z) {
    const c = this.rnd(0.045, 0.07);
    this.alpha.emit(x + this.rnd(-0.25, 0.25), y + this.rnd(0.15, 0.6), z + this.rnd(-0.25, 0.25), this.rnd(-0.08, 0.08), this.rnd(0.03, 0.12), this.rnd(-0.08, 0.08), this.rnd(4, 6), this.rnd(0.7, 1), this.rnd(2.2, 3), c, c * 0.95, c * 0.9, 0.7, 0.13, 0.12, 0.11, 0, -0.01, 0.3, TEX.SMOKE, this.rnd(-0.1, 0.1));
  }

  // flamethrower: one puff of the stream leaving (x,y,z) along (dx,dy,dz). dist = how far it gets before it hits
  // something (the puffs die there and the fire splashes off it), cone = the stream's half-angle (rad)
  flameJet(x, y, z, dx, dy, dz, dist, cone = 0.2) {
    const D = this.add;
    const SPEED = 20; // m/s at the nozzle, shed at 1/s: a puff has flown SPEED * (1 - e^-t) after t seconds
    const FULL = SPEED * 0.52; // how far the stream runs in the open
    const reach = Math.min(dist, FULL);
    const life = Math.max(0.12, -Math.log(1 - reach / SPEED));
    const j = cone * 0.6;
    for (let i = 0; i < 7; i++) {
      const s = SPEED * this.rnd(0.82, 1.08);
      // puffs come several times a second: spread each one's fire along the stretch it covers, so the stream is unbroken
      const o = Math.min(reach * 0.5, this.rnd(0, 1.7));
      // white-hot where it overlaps at the nozzle, billowing out orange, gone dark red
      D.emit(x + dx * o, y + dy * o, z + dz * o, (dx + this.rnd(-j, j)) * s, (dy + this.rnd(-j, j)) * s, (dz + this.rnd(-j, j)) * s, life * (1 - (0.6 * o) / reach) * this.rnd(0.75, 1.05), this.rnd(0.14, 0.22) + o * 0.2, this.rnd(1.2, 2.1) * (0.35 + (0.65 * reach) / FULL), 1, 0.6, 0.2, 0.9, 0.8, 0.13, 0.02, 0, -1.6, 1, TEX.FIRE, this.rnd(-3, 3));
    }
    D.emit(x + dx * 0.25, y + dy * 0.25, z + dz * 0.25, dx * SPEED * 0.5, dy * SPEED * 0.5, dz * SPEED * 0.5, 0.12, 0.3, 0.7, 1, 0.9, 0.6, 0.7, 1, 0.5, 0.1, 0, 0, 1, TEX.GLOW);
    const ex = x + dx * reach;
    const ey = y + dy * reach;
    const ez = z + dz * reach;
    if (dist < FULL - 0.3) {
      for (let i = 0; i < 2; i++) D.emit(ex - dx * 0.15, ey - dy * 0.15, ez - dz * 0.15, this.rnd(-2.5, 2.5), this.rnd(0.5, 3), this.rnd(-2.5, 2.5), this.rnd(0.25, 0.5), this.rnd(0.5, 0.9), 0.15, 1, 0.6, 0.2, 0.8, 0.8, 0.14, 0.02, 0, -2, 1.5, TEX.FIRE, this.rnd(-3, 3));
      if (Math.random() < 0.06) {
        const gy = this.world.floorAt(ex, ez, ey);
        if (ey - gy < 0.5) this.scorch.add(ex, gy + 0.05, ez, this.rnd(0.9, 1.6));
      }
    }
    if (Math.random() < 0.3) this.alpha.emit(ex, ey + 0.3, ez, dx * 1.5 + this.rnd(-0.4, 0.4), this.rnd(0.8, 1.6), dz * 1.5 + this.rnd(-0.4, 0.4), this.rnd(1.4, 2.2), 0.7, 2.6, 0.08, 0.07, 0.06, 0.4, 0.12, 0.12, 0.12, 0, -0.2, 0.6, TEX.SMOKE, 0.3);
  }

  // A flare gun's flare over one frame, from (x0,y0,z0) to (x1,y1,z1) in dt s (client/game/skyflares.js); k: its own
  // { acc } for the particle count, glow: how bright it burns (0..1). Climbing, it draws a hot spark trail and a line
  // of smoke behind it; under its chute it drips sparks that fall away under it, and the smoke it gives off rises over
  // it lit pink from underneath, leaving a trail up the sky the way it came down
  skyflare(k, x0, y0, z0, x1, y1, z1, dt, climbing, glow) {
    const D = this.add;
    const A = this.alpha;
    const rnd = (a, b) => this.rnd(a, b);
    k.acc += dt * (climbing ? 110 : 32) * Math.max(0.3, glow);
    while (k.acc >= 1) {
      k.acc -= 1;
      const f = Math.random();
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      const z = z0 + (z1 - z0) * f;
      const r = Math.random();
      if (climbing) {
        if (r < 0.55) D.emit(x, y, z, rnd(-0.7, 0.7), rnd(-0.7, 0.7), rnd(-0.7, 0.7), rnd(0.3, 0.7), rnd(0.1, 0.18), 0.03, 1, 0.86, 0.78, 1, 1, 0.35, 0.25, 0, 3, 0.5, TEX.SPARK);
        else if (r < 0.7) D.emit(x, y, z, 0, 0, 0, rnd(0.2, 0.4), rnd(0.5, 0.8), 1.3, 1, 0.55, 0.45, 0.5, 0.9, 0.25, 0.2, 0, 0, 1, TEX.GLOW);
        else A.emit(x, y, z, rnd(-0.2, 0.2), rnd(0, 0.3), rnd(-0.2, 0.2), rnd(4, 7), rnd(0.35, 0.6), rnd(2.2, 3.4), 0.78, 0.74, 0.74, 0.5, 0.6, 0.58, 0.58, 0, 0, 0.6, TEX.SMOKE, 0.2);
      } else if (r < 0.5) {
        D.emit(x + rnd(-0.08, 0.08), y - 0.05, z + rnd(-0.08, 0.08), rnd(-0.6, 0.6), rnd(-1.5, 0.4), rnd(-0.6, 0.6), rnd(0.8, 1.8), rnd(0.08, 0.16), 0.02, 1, 0.9, 0.82, 1, 1, 0.4, 0.25, 0, 6, 0.4, TEX.SPARK);
      } else if (r < 0.78) {
        D.emit(x + rnd(-0.2, 0.2), y + 0.4, z + rnd(-0.2, 0.2), rnd(-0.2, 0.2), rnd(0.3, 0.8), rnd(-0.2, 0.2), rnd(2.5, 4.5), rnd(0.6, 1), rnd(3, 5), 1, 0.62, 0.55, 0.16 * glow, 0.6, 0.28, 0.28, 0, -0.1, 0.3, TEX.SMOKE, 0.2);
      } else {
        A.emit(x + rnd(-0.2, 0.2), y + 0.8, z + rnd(-0.2, 0.2), rnd(-0.15, 0.15), rnd(0.2, 0.5), rnd(-0.15, 0.15), rnd(8, 14), rnd(0.8, 1.2), rnd(4, 7), 0.62, 0.56, 0.56, 0.3, 0.5, 0.48, 0.48, 0, 0, 0.3, TEX.SMOKE, 0.15);
      }
    }
  }

  // tracer from (x,y,z) along (dx,dy,dz) for dist meters
  tracer(x, y, z, dx, dy, dz, dist, bright = 1) {
    if (this.tracers.length >= this.tracerMax) this.tracers.shift();
    this.tracers.push({ x, y, z, dx, dy, dz, dist, t: 0, bright });
  }

  // crossbow bolt: a short, slow, pale streak instead of a hot tracer
  boltTrail(x, y, z, dx, dy, dz, dist) {
    if (this.tracers.length >= this.tracerMax) this.tracers.shift();
    this.tracers.push({ x, y, z, dx, dy, dz, dist, t: 0, bright: 0.5, speed: 150, len: 1.6, bolt: true });
  }

  // An RPG going off: fire and a cloud of grey smoke blown out of the back of the tube at (x,y,z) along (dx,dy,dz),
  // backwards from the aim
  backblast(x, y, z, dx, dy, dz) {
    const A = this.alpha;
    const D = this.add;
    for (let i = 0; i < 8; i++) {
      const s = this.rnd(4, 10);
      D.emit(x, y, z, dx * s + this.rnd(-1.5, 1.5), dy * s + this.rnd(-1, 1.5), dz * s + this.rnd(-1.5, 1.5), this.rnd(0.12, 0.25), this.rnd(0.4, 0.8), 1.2, 1, 0.7, 0.3, 0.9, 0.8, 0.25, 0.05, 0, 0, 3, TEX.FIRE, 3);
    }
    for (let i = 0; i < 18; i++) {
      const s = this.rnd(2, 8);
      const k = this.rnd(0, 1.5);
      A.emit(x + dx * k, y + dy * k, z + dz * k, dx * s + this.rnd(-1.5, 1.5), dy * s + this.rnd(0, 1.2), dz * s + this.rnd(-1.5, 1.5), this.rnd(1.5, 3.2), 0.5, this.rnd(2.5, 4.5), 0.5, 0.48, 0.45, 0.55, 0.62, 0.6, 0.58, 0, -0.1, 2.2, TEX.SMOKE, 0.4);
    }
  }

  // An RPG grenade's motor from where it was (x0,y0,z0) to where it is now: a puff of smoke every short way along it,
  // so a fast one leaves an unbroken trail, and the flame at its tail. The motor lights ROCKET_ARM metres out from
  // where it was fired (lx,ly,lz): short of that it flies dark, and the shooter's view down the line stays clear
  rocketTrail(x0, y0, z0, x1, y1, z1, lx, ly, lz) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-4) return;
    const lit = (x, y, z) => Math.hypot(x - lx, y - ly, z - lz) >= ROCKET_ARM;
    const n = Math.min(10, Math.ceil(l / 0.45));
    for (let i = 0; i < n; i++) {
      const k = (i + Math.random()) / n;
      const px = x0 + dx * k;
      const py = y0 + dy * k;
      const pz = z0 + dz * k;
      if (lit(px, py, pz)) this.alpha.emit(px, py, pz, this.rnd(-0.25, 0.25), this.rnd(0.1, 0.4), this.rnd(-0.25, 0.25), this.rnd(1.1, 1.7), 0.2, this.rnd(0.7, 1.1), 0.55, 0.53, 0.5, 0.4, 0.6, 0.6, 0.6, 0, -0.05, 1.2, TEX.SMOKE, 0.3);
    }
    if (!lit(x1, y1, z1)) return;
    const ux = dx / l;
    const uy = dy / l;
    const uz = dz / l;
    this.add.emit(x1 - ux * 0.45, y1 - uy * 0.45, z1 - uz * 0.45, -ux * 4, -uy * 4, -uz * 4, 0.06, 0.35, 0.1, 1, 0.75, 0.35, 1, 1, 0.3, 0.05, 0, 0, 0, TEX.FIRE, 2);
    this.add.emit(x1 - ux * 0.45, y1 - uy * 0.45, z1 - uz * 0.45, 0, 0, 0, 0.05, 0.6, 0.4, 1, 0.8, 0.5, 0.8, 1, 0.5, 0.2, 0, 0, 0, TEX.GLOW);
  }

  vmMuzzle(pos, scale = 1, time = 0.05) {
    this.vmFlash.position.copy(pos);
    this.vmFlash.scale.setScalar(this.rnd(0.18, 0.28) * scale);
    this.vmFlash.material.rotation = Math.random() * 6.28;
    this.vmFlash.material.opacity = comfort.flash;
    this.vmFlash.visible = true;
    this.vmFlashT = time;
  }

  worldMuzzle(pos, scale = 1) {
    const f = this.wFlashes.find((w) => w.t <= 0) || this.wFlashes[0];
    f.s.position.copy(pos);
    f.s.scale.setScalar(this.rnd(0.5, 0.8) * scale);
    f.s.material.rotation = Math.random() * 6.28;
    f.s.material.opacity = comfort.flash;
    f.s.visible = true;
    f.t = 0.06;
    this.add.emit(pos.x, pos.y, pos.z, 0, 0.6, 0, 0.5, 0.3, 1.1, 0.4, 0.4, 0.4, 0.25, 0.3, 0.3, 0.3, 0, 0, 1, TEX.SMOKE);
  }

  // ---------------------------------------------------------------- emitters
  // kind: 'campfire' | 'torch' | 'fire' | 'acid' | 'smoke_red' | 'smoke' (a smoker's cloud) | 'embers' | 'flare' |
  // 'barrel', and the two a ruined city has (the mainland's world.lights): 'column', a pillar of dark smoke standing
  // over it that is seen from the bridge, and 'blaze', a building on fire. em.loop: a sound that goes with it, stopped when it is removed.
  createEmitter(kind, x, y, z, opts = {}) {
    const em = { kind, x, y, z, acc: 0, intensity: opts.intensity ?? 1, radius: opts.radius ?? 1, active: true, loop: opts.loop || null };
    // (a column that has stood for a while: its smoke is already up there when the world appears)
    if (kind === 'column') for (let age = COLUMN.life; age > 0; age -= 1 / COLUMN.rate) this._column(em, age);
    this.emitters.add(em);
    return em;
  }
  removeEmitter(em) {
    em.loop?.stop();
    this.emitters.delete(em);
  }

  // one puff of a smoke column, `age` seconds after it left the fire: it rises at COLUMN.rise, leans downwind and
  // spreads as it goes, and thins out to nothing at the top
  _column(em, age = 0) {
    const C = COLUMN;
    const k = em.radius;
    const life = C.life - age;
    const u = age / C.life;
    const vx = C.wind[0] * this.rnd(0.7, 1.3);
    const vz = C.wind[1] * this.rnd(0.7, 1.3);
    // (the wind takes it more the higher it is: the lean is a curve, not a straight line)
    const x = em.x + vx * age * (0.4 + 0.6 * u) + this.rnd(-1.5, 1.5) * k;
    const z = em.z + vz * age * (0.4 + 0.6 * u) + this.rnd(-1.5, 1.5) * k;
    const size = lerp(C.size0, C.size1, u) * k;
    const a = lerp(C.alpha, 0, u * u);
    const g = this.rnd(0.035, 0.07);
    this.alpha.emit(x, em.y + C.rise * age, z, vx * (0.4 + 1.2 * u), C.rise, vz * (0.4 + 1.2 * u), life, size, C.size1 * k, g, g, g * 1.05, a, 0.16, 0.16, 0.17, 0, 0, 0, TEX.SMOKE, this.rnd(-0.04, 0.04));
  }

  _runEmitter(em, dt) {
    if (!em.active || em.intensity <= 0) return;
    const A = this.alpha;
    const D = this.add;
    const I = em.intensity;
    let rate;
    switch (em.kind) {
      case 'campfire':
        rate = 55 * I;
        break;
      case 'torch':
        rate = 20;
        break;
      case 'fire':
        rate = 30 * em.radius * I;
        break;
      case 'acid':
        rate = 8 * em.radius;
        break;
      case 'smoke_red':
        rate = 14;
        break;
      case 'smoke':
        rate = 3 * em.radius;
        break;
      case 'embers':
        rate = 6;
        break;
      case 'flare':
        rate = 34;
        break;
      case 'barrel':
        rate = 22;
        break;
      case 'column':
        rate = COLUMN.rate;
        break;
      case 'blaze': {
        // (its flames are not drawn for an eye too far off to see them through the haze: the column over it is)
        const e = this.eye;
        if (e && (e.x - em.x) ** 2 + (e.z - em.z) ** 2 > BLAZE_SEEN * BLAZE_SEEN) return;
        rate = 16 * em.radius * I;
        break;
      }
      default:
        rate = 10;
    }
    em.acc += dt * rate;
    while (em.acc >= 1) {
      em.acc -= 1;
      const r = Math.random();
      switch (em.kind) {
        case 'campfire': {
          const s = 0.35 + 0.6 * I;
          if (r < 0.62) D.emit(em.x + this.rnd(-0.35, 0.35) * s, em.y + this.rnd(0, 0.2), em.z + this.rnd(-0.35, 0.35) * s, this.rnd(-0.2, 0.2), this.rnd(1.2, 2.4) * s, this.rnd(-0.2, 0.2), this.rnd(0.35, 0.75), this.rnd(0.55, 0.95) * s, 0.12, 0.95, 0.45, 0.14, 0.75, 0.8, 0.14, 0.03, 0, -1.2, 1.2, TEX.FIRE, this.rnd(-2, 2));
          else if (r < 0.9) A.emit(em.x + this.rnd(-0.3, 0.3), em.y + 0.9 * s, em.z + this.rnd(-0.3, 0.3), this.rnd(-0.2, 0.2), this.rnd(0.8, 1.5), this.rnd(-0.2, 0.2), this.rnd(2.5, 4), 0.5, 2.6, 0.12, 0.11, 0.1, 0.35, 0.18, 0.18, 0.18, 0, -0.1, 0.4, TEX.SMOKE, 0.3);
          else D.emit(em.x + this.rnd(-0.3, 0.3), em.y + 0.3, em.z + this.rnd(-0.3, 0.3), this.rnd(-0.8, 0.8), this.rnd(1.5, 3.5), this.rnd(-0.8, 0.8), this.rnd(1, 2.5), 0.05, 0.02, 1, 0.6, 0.2, 1, 1, 0.3, 0.05, 0, -0.3, 0.6, TEX.SPARK);
          break;
        }
        case 'torch':
          if (r < 0.8) D.emit(em.x + this.rnd(-0.05, 0.05), em.y, em.z + this.rnd(-0.05, 0.05), this.rnd(-0.1, 0.1), this.rnd(0.6, 1.1), this.rnd(-0.1, 0.1), this.rnd(0.22, 0.42), this.rnd(0.22, 0.34), 0.04, 0.9, 0.42, 0.12, 0.6, 0.7, 0.12, 0.02, 0, -1, 1, TEX.FIRE, 2);
          else A.emit(em.x, em.y + 0.4, em.z, this.rnd(-0.1, 0.1), 0.8, this.rnd(-0.1, 0.1), 2, 0.2, 1, 0.1, 0.1, 0.1, 0.3, 0.2, 0.2, 0.2, 0, -0.1, 0.5, TEX.SMOKE);
          break;
        case 'fire': {
          const a = Math.random() * 6.283;
          const d = Math.sqrt(Math.random()) * em.radius;
          const px = em.x + Math.cos(a) * d;
          const pz = em.z + Math.sin(a) * d;
          const py = this.world.floorAt(px, pz, em.y + 0.5);
          if (r < 0.75) D.emit(px, py + 0.1, pz, 0, this.rnd(1.5, 3), 0, this.rnd(0.35, 0.7), this.rnd(0.7, 1.3), 0.2, 0.95, 0.36, 0.08, 0.75, 0.7, 0.1, 0.02, 0, -1.5, 1.2, TEX.FIRE, 2);
          else A.emit(px, py + 1.2, pz, 0, 1.6, 0, 2.5, 0.8, 3, 0.08, 0.07, 0.06, 0.55, 0.12, 0.12, 0.12, 0, -0.2, 0.4, TEX.SMOKE, 0.3);
          break;
        }
        case 'acid': {
          const a = Math.random() * 6.283;
          const d = Math.sqrt(Math.random()) * em.radius * 0.9;
          const px = em.x + Math.cos(a) * d;
          const pz = em.z + Math.sin(a) * d;
          A.emit(px, em.y + 0.05, pz, 0, this.rnd(0.3, 0.8), 0, this.rnd(0.4, 0.9), 0.08, 0.25, 0.4, 1, 0.2, 0.9, 0.3, 0.8, 0.1, 0, 0, 1, TEX.GLOW);
          break;
        }
        case 'smoke': {
          // a smoker's cloud: slow, thick, near-black billows filling the ground it covers to over a survivor's head
          const a = Math.random() * 6.283;
          const d = Math.sqrt(Math.random()) * em.radius * 0.85;
          const px = em.x + Math.cos(a) * d;
          const pz = em.z + Math.sin(a) * d;
          const py = this.world.floorAt(px, pz, em.y + 0.5);
          const c = this.rnd(0.04, 0.065);
          A.emit(px, py + this.rnd(0.3, 3.2), pz, this.rnd(-0.25, 0.25), this.rnd(0.05, 0.25), this.rnd(-0.25, 0.25), this.rnd(5, 7), this.rnd(1.6, 2.4), this.rnd(3, 4.5), c, c * 0.95, c * 0.9, 0.85, 0.12, 0.11, 0.1, 0, -0.03, 0.3, TEX.SMOKE, this.rnd(-0.15, 0.15));
          break;
        }
        case 'smoke_red':
          A.emit(em.x + this.rnd(-0.2, 0.2), em.y + 0.6, em.z + this.rnd(-0.2, 0.2), this.rnd(-0.3, 0.3) + 0.4, this.rnd(2.5, 3.5), this.rnd(-0.3, 0.3), this.rnd(6, 9), 0.6, 5.5, 0.85, 0.12, 0.1, 0.75, 0.35, 0.18, 0.18, 0, -0.25, 0.15, TEX.SMOKE, 0.2);
          if (r < 0.3) D.emit(em.x, em.y + 0.6, em.z, 0, 0.5, 0, 0.2, 0.5, 0.3, 1, 0.2, 0.1, 1, 1, 0.1, 0.1, 0, 0, 0, TEX.GLOW);
          break;
        case 'embers':
          D.emit(em.x + this.rnd(-2, 2), em.y + this.rnd(0, 1), em.z + this.rnd(-2, 2), this.rnd(-0.3, 0.3), this.rnd(0.5, 1.5), this.rnd(-0.3, 0.3), this.rnd(1.5, 3), 0.06, 0.02, 1, 0.5, 0.15, 1, 0.8, 0.2, 0.05, 0, -0.2, 0.3, TEX.SPARK);
          if (r < 0.3) A.emit(em.x + this.rnd(-1, 1), em.y + 0.5, em.z + this.rnd(-1, 1), 0, 0.8, 0, 3, 0.8, 3, 0.1, 0.1, 0.1, 0.4, 0.15, 0.15, 0.15, 0, -0.1, 0.3, TEX.SMOKE);
          break;
        case 'flare':
          // road flare: hot red core, sputtering sparks, thick pink smoke
          if (r < 0.5) D.emit(em.x + this.rnd(-0.03, 0.03), em.y + 0.05, em.z + this.rnd(-0.03, 0.03), this.rnd(-0.1, 0.1), this.rnd(0.4, 0.9), this.rnd(-0.1, 0.1), this.rnd(0.12, 0.25), this.rnd(0.25, 0.4), 0.05, 1, 0.25, 0.18, 0.9, 1, 0.1, 0.08, 0, -0.5, 1, TEX.FIRE, 3);
          else if (r < 0.78) D.emit(em.x, em.y + 0.05, em.z, this.rnd(-1.4, 1.4), this.rnd(1, 3), this.rnd(-1.4, 1.4), this.rnd(0.3, 0.8), 0.04, 0.01, 1, 0.55, 0.3, 1, 1, 0.3, 0.1, 0, -4, 0.3, TEX.SPARK);
          else A.emit(em.x + this.rnd(-0.1, 0.1), em.y + 0.3, em.z + this.rnd(-0.1, 0.1), this.rnd(-0.2, 0.2) + 0.2, this.rnd(0.8, 1.4), this.rnd(-0.2, 0.2), this.rnd(3, 5), 0.3, 2.6, 0.9, 0.35, 0.35, 0.45, 0.4, 0.2, 0.2, 0, -0.15, 0.3, TEX.SMOKE, 0.3);
          break;
        case 'column':
          this._column(em);
          break;
        case 'blaze': {
          // tongues of flame out of the windows of a storey, and the black smoke they make
          const px = em.x + this.rnd(-1, 1) * em.radius * 2.2;
          const pz = em.z + this.rnd(-1, 1) * em.radius * 2.2;
          if (r < 0.7) D.emit(px, em.y + this.rnd(-0.6, 0.4), pz, this.rnd(-0.3, 0.3), this.rnd(2.2, 4.2), this.rnd(-0.3, 0.3), this.rnd(0.6, 1.1), this.rnd(1.6, 2.8) * em.radius, 0.5, 0.95, 0.38, 0.08, 0.8, 0.75, 0.1, 0.02, 0, -1.6, 0.9, TEX.FIRE, this.rnd(-1.5, 1.5));
          else if (r < 0.9) A.emit(px, em.y + 2, pz, COLUMN.wind[0] * 0.5, this.rnd(2, 3), COLUMN.wind[1] * 0.5, this.rnd(4, 6), 1.6 * em.radius, 6 * em.radius, 0.05, 0.045, 0.04, 0.7, 0.1, 0.1, 0.1, 0, -0.2, 0.25, TEX.SMOKE, 0.2);
          else D.emit(px, em.y + 0.5, pz, this.rnd(-1.5, 1.5), this.rnd(3, 6), this.rnd(-1.5, 1.5), this.rnd(1.5, 3.5), 0.09, 0.03, 1, 0.6, 0.2, 1, 0.9, 0.3, 0.05, 0, -0.4, 0.4, TEX.SPARK);
          break;
        }
        case 'barrel':
          if (r < 0.75) D.emit(em.x + this.rnd(-0.22, 0.22), em.y, em.z + this.rnd(-0.22, 0.22), this.rnd(-0.1, 0.1), this.rnd(0.9, 1.7), this.rnd(-0.1, 0.1), this.rnd(0.3, 0.55), this.rnd(0.4, 0.6), 0.08, 0.95, 0.42, 0.12, 0.7, 0.75, 0.12, 0.02, 0, -1.1, 1.1, TEX.FIRE, 2);
          else A.emit(em.x, em.y + 0.8, em.z, this.rnd(-0.1, 0.1), 1.1, this.rnd(-0.1, 0.1), 3, 0.3, 1.8, 0.1, 0.1, 0.1, 0.4, 0.15, 0.15, 0.15, 0, -0.1, 0.4, TEX.SMOKE, 0.3);
          break;
      }
    }
  }

  // night: smoke / dust are lit only by the fire, so darken them; blood (LIT) gets the little the night sky gives a body
  setAmbient(night) {
    this.alpha.material.uniforms.uTint.value = 1 - night * 0.7;
    this.alpha.material.uniforms.uLit.value = 1 - night * 0.75;
  }

  update(dt, camera, viewportHeight) {
    this.time += dt;
    this.eye = camera.position; // (impact sizes a far hit by its distance from here)
    // what the local flashlight throws on blood: the lamp is the spot light riding on the camera (render/lights.js)
    const torch = this.torch || (this.torch = camera.children.find(isSpot));
    if (torch) {
      const u = this.alpha.material.uniforms;
      u.uTorch.value.set((torch.intensity * TORCH_GAIN) / Math.PI, Math.cos(torch.angle), Math.cos(torch.angle * (1 - torch.penumbra)), torch.distance);
      u.uTorchDecay.value = torch.decay;
    }
    for (const em of this.emitters) this._runEmitter(em, dt);
    const pixelScale = (viewportHeight * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    this.add.update(dt, pixelScale);
    this.alpha.update(dt, pixelScale);
    this.blood.update(dt);
    this.acid.update(dt);
    this.scorch.update(dt);
    this.gibLumps.update(dt, this);
    this.gibLimbs.update(dt, this);
    this.gibHeads.update(dt, this);
    this.gibLoad = Math.max(0, this.gibLoad - dt * 3);
    // tracers
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      const len = t.len || 5;
      const head = t.t * (t.speed || 380);
      if (head - len > t.dist) {
        this.tracers.splice(i, 1);
        continue;
      }
      const a = Math.max(0, head - len);
      const b = Math.min(t.dist, head);
      const o = n * 6;
      this.tPos[o] = t.x + t.dx * a;
      this.tPos[o + 1] = t.y + t.dy * a;
      this.tPos[o + 2] = t.z + t.dz * a;
      this.tPos[o + 3] = t.x + t.dx * b;
      this.tPos[o + 4] = t.y + t.dy * b;
      this.tPos[o + 5] = t.z + t.dz * b;
      const k = 0.9 * t.bright;
      this.tCol[o] = 0.25 * k;
      this.tCol[o + 1] = (t.bolt ? 0.25 : 0.2) * k;
      this.tCol[o + 2] = (t.bolt ? 0.25 : 0.12) * k;
      this.tCol[o + 3] = 1 * k;
      this.tCol[o + 4] = (t.bolt ? 0.97 : 0.85) * k;
      this.tCol[o + 5] = (t.bolt ? 0.9 : 0.55) * k;
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
    // flashes
    if (this.vmFlashT > 0) {
      this.vmFlashT -= dt;
      if (this.vmFlashT <= 0) this.vmFlash.visible = false;
    }
    for (const f of this.wFlashes) {
      if (f.t > 0) {
        f.t -= dt;
        if (f.t <= 0) f.s.visible = false;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }
}
