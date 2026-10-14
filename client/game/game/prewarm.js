// Game: the shader warm-up behind the splash.
import * as THREE from 'three';
import { ITEM, WEAPONS, STRUCT_ORDER, THROW_ITEMS, ZTYPE, PROJ } from '../../../shared/defs.js';
import { CHARACTER_COUNT } from '../../../shared/characters.js';
import { DEER_UNDEAD } from '../../../shared/deer.js';
import { createGhost, createStructure } from '../../render/models/structures.js';
import { createZombie, createSurvivor, zombieVariants, warmSurvivor } from '../../render/models/characters.js';
import { createCat } from '../../render/models/cat.js';
import { createDeer } from '../../render/models/deer.js';
import { createPickup } from '../../render/models/pickups.js';
import { createSupplyCrate, createProjectile } from '../../render/models/misc.js';

const _v = new THREE.Vector3();

export const methods = {
  // three.js builds a material's shader program the first time it is drawn and waits for it on the main thread,
  // so the frame in which the first torch, gate, muzzle flash or spitter appeared used to stall. Instead every
  // program play can need at this quality is built behind the splash: started without waiting for it (the driver
  // compiles in the background), not used until it is built, and then one frame nobody sees draws one of
  // everything (warmFrame). Runs again for a new map (other props, other materials) and when the quality changes
  // (other lights and shadows: another program for every lit material).
  prewarm() {
    const key = `${this.renderer.quality}:${this.seed}:${this.act}`;
    if (!this.world || this.halfBuilt || key === this.warmKey) return; // (a world half built: its own build warms it when done)
    this.warmKey = key;
    this.warmTodo ||= this.warmViews();
    this.scene.add(this.warmSet);
    // hold: the frame loop draws nothing (the scene's own programs are still being built)
    const w = (this.warm = { hold: true, ready: false, sync: false, t0: performance.now() });
    w.steps = this.warmSteps(w);
    const tick = () => {
      if (this.warm !== w) return; // finished early (play began), or the quality changed again
      const step = w.steps.next();
      if (step.done) w.ready = true; // update() draws the warm frame
      else setTimeout(tick, step.value);
    };
    setTimeout(tick, 0);
  },

  // A warm-up's work in slices short enough to leave the splash responsive. Each yield is the wait before the
  // next slice (ms); with w.sync set it runs straight through.
  *warmSteps(w) {
    const R = this.renderer;
    const compile = () => {
      R.compilePrograms();
      const stage = this.warmStage();
      R.compileDepth(stage.casters);
      stage.undo();
    };
    // first what the scene holds already. The frame loop waits for these, then draws again: the splash gets its
    // backdrop while the views are still being built
    compile();
    while (!w.sync && !R.programsReady()) yield 16;
    w.hold = false;
    if (!this.warmTodo.length) return;
    if (!w.sync) yield 50; // (the backdrop's first frames go out before the views' build holds the thread again)
    while (this.warmTodo.length) {
      this.warmTodo.shift()();
      if (!w.sync) yield 0;
    }
    compile(); // the views' own
    while (!w.sync && !R.programsReady()) yield 16;
  },

  // One of every view that does not exist until the game needs it (what Entities draws, the build ghosts, the
  // supply plane, the weapons in the hands), as a list of small build steps. Building them also bakes what they
  // are made from - zombie rigs, pickup and weapon meshes - which used to happen in the frame the first one
  // showed up. The views stay in this.warmSet (hidden: only the warm frame shows it) for the next warm-up.
  // Anything new that the game creates on demand with a material of its own belongs here, or its program is
  // built mid-game again.
  warmViews() {
    const set = (this.warmSet = new THREE.Group());
    set.visible = false;
    const chars = (set.userData.chars = []); // these cast shadows on the presets where characters do
    const steps = [() => this.ensureViewModel()];
    // every zombie rig. createZombie picks the variant from its seed, so go through seeds until a rig turns up that
    // has not been built yet; one view is kept, they all share a material
    for (const t of Object.values(ZTYPE)) {
      const rigs = new Set();
      let seed = 0;
      for (let v = zombieVariants(t); v > 0; v--) {
        steps.push(() => {
          for (let fresh = false, tries = 0; !fresh && tries < 64; tries++) {
            const z = createZombie(t, seed++);
            const rig = z.object.getObjectByProperty('isSkinnedMesh', true).geometry;
            if (z.member) this.crowd.batch(rig); // (its batch in the crowd, in the scene from now on: its programs are built with the scene's)
            fresh = !rigs.has(rig);
            rigs.add(rig);
            if (chars.length) z.dispose();
            else set.add(chars[0] = z.object);
          }
        });
      }
    }
    // every survivor's model, and each one turned, built now rather than when a player picks them or dies
    for (let v = 0; v < CHARACTER_COUNT; v++) steps.push(() => warmSurvivor(v));
    steps.push(() => {
      const sv = createSurvivor(1);
      sv.setWeapon(ITEM.PISTOL);
      chars.push(sv.object);
      // (Entities draws these three with its own geometry: a teammate's flashlight cone, a roper's rope, the loot glints)
      const e = this.entities;
      set.add(sv.object, new THREE.Mesh(e.coneGeo, e.coneMat), new THREE.Mesh(e.ropeGeo, e.ropeMat), new THREE.Points(e.glints.geometry, e.glints.material));
      set.add(...this.highlight.warm(sv.object.getObjectByProperty('isSkinnedMesh', true))); // the outline on what [E] would act on (a downed one too)
    });
    steps.push(() => set.add(createCat(0, 1).object));
    for (const v of [0, 2, 1]) steps.push(() => set.add(createDeer(v, 1).object)); // a doe of each coat, the buck
    for (const v of [0, 2, 1]) steps.push(() => set.add(createDeer(v | DEER_UNDEAD, 1).object)); // ...and the mainland's undead
    steps.push(() => set.add(createSupplyCrate()));
    for (const p of Object.values(PROJ)) steps.push(() => set.add(createProjectile(p)));
    const items = Object.values(ITEM).filter((it) => it);
    for (let i = 0; i < items.length; i += 3) {
      steps.push(() => {
        for (const it of items.slice(i, i + 3)) set.add(createPickup(it));
      });
    }
    for (const t of STRUCT_ORDER) {
      steps.push(() => {
        const s = createStructure(t);
        s.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true)); // as Entities sets them up
        set.add(s, createGhost(t));
      });
    }
    steps.push(() => set.add(...this.entities.structs.warm())); // the structures as their batches draw them (instanced)
    steps.push(() => set.add(...this.power.warm())); // a floodlight's lens, glow and beam
    steps.push(() => set.add(...this.foliage.falling.warmViews())); // a felled tree coming down, in its fading twins
    steps.push(() => set.add(this.skyflares.warm())); // a flare gun flare's glow
    for (const vk of [1, 2, 3]) steps.push(() => set.add(this.vehicles.warm(vk))); // the mainland's vehicles: lamps lit, clocks, the pools of light on the road
    steps.push(() => {
      // the supply plane, in the materials Flyover gives it
      this.flyover.start(0, 0, 0, 0, 0, this.time, null);
      set.add(this.flyover.planes.pop().obj);
    });
    // the viewmodel builds a weapon's mesh the first time it is held
    for (const it of [...Object.keys(WEAPONS), ...THROW_ITEMS, ITEM.WALKIE]) steps.push(() => this.vm.setItem(+it));
    steps.push(() => {
      this.vm.setItem(0);
      this.vmItem = -1;
    });
    return steps;
  },

  // Sets the scenes up for the warm frame: one mesh of every static-world material, everything else that is
  // hidden or out of view shown, and every mesh that can cast a shadow at this quality casting one. Returns those
  // casters and the way back. The shadow passes draw the casters with depth materials three keeps to itself; it
  // only picks a program for one when the kind of mesh changes, by the sides and texture of the mesh that came by
  // just then, so here every caster makes it pick again (needsUpdate) and every combination play can meet exists.
  warmStage() {
    const set = this.warmSet;
    const undo = [];
    const casters = [];
    for (const o of set.userData.chars) o.traverse((m) => m.isSkinnedMesh && (m.castShadow = this.entities.charShadows));
    // vegetation that can cast at this quality (InstancedSet.update: within castDist, never the near tree LOD)
    const f = this.foliage;
    for (const s of [f.trees, f.bushes, f.rocks]) {
      if (!(s.castDist > 0)) continue;
      for (const lods of s.meshes) {
        lods.forEach((parts, l) => {
          if (lods.length > 1 && l === 0) return;
          for (const m of parts) {
            if (m.castShadow) continue;
            m.castShadow = true;
            undo.push(() => (m.castShadow = false));
          }
        });
      }
    }
    const show = (o) => {
      if (!o.visible) {
        o.visible = true;
        undo.push(() => (o.visible = false));
      }
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      if (o.frustumCulled) {
        o.frustumCulled = false;
        undo.push(() => (o.frustumCulled = true));
      }
      if (o.castShadow) {
        casters.push(o);
        const own = Object.hasOwn(o, 'onBeforeShadow') && o.onBeforeShadow;
        o.onBeforeShadow = function (...a) {
          a[5].needsUpdate = true; // (the depth material this mesh is about to be drawn with)
          if (own) own.apply(this, a);
        };
        undo.push(() => (own ? (o.onBeforeShadow = own) : delete o.onBeforeShadow));
      }
    };
    // the static world: one mesh of each material will do (StaticWorld.update sets their visibility again), and
    // one of its shadow casters for each shadow side - they are what the shadow passes draw of it. Their group is
    // left as StaticWorld.setShadows has it: hidden when the quality has no shadows.
    const statics = this.staticWorld.group;
    const shade = this.staticWorld.casters;
    const mats = new Set();
    for (const m of [...statics.children, ...(shade.visible ? shade.children : [])]) {
      if (m === shade) continue;
      m.visible = !mats.has(m.material);
      mats.add(m.material);
      if (m.visible) show(m);
    }
    const showAll = (o) => {
      if (o === statics) return;
      show(o);
      for (const c of o.children) showAll(c);
    };
    showAll(this.scene);
    showAll(this.renderer.vmScene);
    return { casters, undo: () => undo.forEach((u) => u()) };
  },

  // One frame through the whole pipeline that is never seen (the frame loop draws the real one over it before the
  // browser presents), with one of everything in it and every post pass on: it uses each program once, so not
  // even a program's first use is left for play.
  warmFrame() {
    const R = this.renderer;
    this.camera.getWorldDirection(_v);
    this.warmSet.position.copy(this.camera.position).addScaledVector(_v, 6);
    const stage = this.warmStage();
    const fl = this.lights.flashlight;
    const flI = fl.intensity;
    fl.intensity = 1; // the beam pass only runs with the flashlight on, the sun shafts with the sun on screen
    R.render({ time: this.time, night: this.env.night, damage: 0, lowHealth: 0, infected: 0, dead: 0, exposure: this.env.exposure, rays: { ...this.env.rays, sunDir: _v, strength: 1 }, beam: { light: fl, density: 0.001 }, adaptRef: 0.1, dt: 0.016 }, true);
    R.adaptReset = true; // the eye adaptation does not start from this frame
    fl.intensity = flI;
    stage.undo();
  },

  // Ends a warm-up. If play has begun before it is done (a quick join, a new map or quality mid-game), the rest
  // happens here in one go, as it used to on the first frame.
  finishPrewarm() {
    const w = this.warm;
    const programs = this.renderer.renderer.info.programs;
    w.sync = true;
    while (!w.steps.next().done);
    const n = programs.length;
    const t = performance.now();
    this.warmFrame();
    this.scene.remove(this.warmSet);
    this.warm = null;
    console.log(`[client] shaders: ${programs.length} programs ${w.ready ? 'built' : 'built in one go (play had begun)'} ${(t - w.t0).toFixed(0)}ms after the world, warm frame ${(performance.now() - t).toFixed(0)}ms${programs.length > n ? `, which had to build ${programs.length - n} itself` : ''}`);
  },
};
