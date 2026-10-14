// Game: the world in play - built (at once, or a step at a time behind the splash), swapped for the next map, taken
// down - and the trees in it chopped, shot apart and grown back.
import { SOUND } from '../../../shared/defs.js';
import { worldFor } from '../../../shared/worlds.js';
import { WORLD } from '../../../shared/acts.js';
import { setAct, wordsOf } from '../act.js';
import { usePos } from '../../../shared/protocol.js';
import { Crows } from '../../render/crows.js';
import { treeAt, fellTree, regrowTrees, cutTree, treeFoot, treeTop } from '../../../shared/felling.js';
import { strippedKey } from '../harvest.js';
import { Impacts } from '../impacts.js';
import { textureSteps } from '../../render/textures.js';
import { terrainSteps } from '../../render/terrain.js';
import { buildWater } from '../../render/water.js';
import { buildMine } from '../../render/mine.js';
import { buildShips } from '../../render/ships.js';
import { buildClinic, disposeClinic } from '../../render/clinic.js';
import { Graves } from '../../render/cemetery.js';
import { buildRailway } from '../../render/railway.js';
import { BridgeView } from '../../render/bridge.js';
import { LoadingCard, liveProps } from '../cutscene.js';
import { StaticWorld } from '../../render/staticworld.js';
import { Foliage } from '../../render/foliage.js';
import { Effects } from '../../render/effects.js';
import { Flyover } from '../../render/flyover.js';
import { Atmosphere } from '../../render/atmosphere.js';
import { WeatherFX } from '../../render/weatherfx.js';
import { G } from '../../render/globals.js';

// A world with mountains (the mainland) is seen far: the distance haze is whole up to HAZE_BASE m and thins over that
// by e every HAZE_THIN m of the height the eye's ray runs at (globals.js uHaze), so a range stands up out of the haze
// from across the map while the plain at its foot is lost in it; the camera's far plane goes out to FAR_BIG for it.
const HAZE_BASE = 28;
const HAZE_THIN = 22;
const FAR_SMALL = 520;
const FAR_BIG = 1700;
const BUILD_SLICE_MS = 10; // loadWorldSoon: the longest the world's build holds the page at a time (a frame is 16)

// fn, once, as soon as the loading card is on screen: the frame after it is drawn, or after a second at most (a hidden
// tab draws no frames)
function whenPainted(card, fn) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    fn();
  };
  const wait = () => (card.painted ? go() : requestAnimationFrame(wait));
  requestAnimationFrame(wait);
  setTimeout(go, 1000);
}

export const methods = {
  // The server says which world the game is on now (S2C.WORLD_RESET): a new run's island, or - CROSSING.SWAP seconds
  // into the crossing, as the cutscene cuts to black - the mainland. Entities that follow are that world's, and their
  // positions are in its units from this message on.
  // Building the mainland holds the thread for seconds, and nothing is drawn until it is done: the crossing's loading
  // card must be on screen first. If it has not been drawn yet (this clock a little behind the server's), it goes up
  // now and the build waits a frame or two for it, with what the server sends after this held back until then.
  onWorld(seed, act) {
    const card = this.cine?.card;
    if (card && !card.painted && act !== this.act) {
      card.set(true, true);
      this.conn.hold();
      whenPainted(card, () => {
        this.swapWorld(seed, act);
        this.conn.release();
      });
      return;
    }
    // A new world in play with no cutscene to cover it (/map2, a new run's island): a loading card of its own goes up
    // first, as the crossing's does, and the build waits for it to be on screen - the page shows nothing else for the
    // seconds it takes (the server holds the dead off meanwhile: Game.newWorldForAll)
    if (!card && this.state !== 'menu' && this.world && (act !== this.act || seed !== this.seed)) {
      const root = document.createElement('div');
      root.className = 'cine';
      document.body.appendChild(root);
      // (of whatever map it is: its number, and where it is as the game words it - act.js)
      const where = wordsOf(act).where;
      const own = new LoadingCard(root, null, { title: `Loading map ${act}`, sub: where[0].toUpperCase() + where.slice(1) });
      own.set(true, true);
      this.conn.hold();
      whenPainted(own, () => {
        try {
          this.swapWorld(seed, act);
        } finally {
          this.conn.release();
          own.set(false);
          setTimeout(() => root.remove(), 600);
        }
      });
      return;
    }
    this.swapWorld(seed, act);
  },

  swapWorld(seed, act) {
    this.loadWorld(seed, act);
    this.stripped.clear();
    this.cine?.worldChanged();
  },

  // The world of seed (and act), built here and now: a join, the crossing, a new map - the game wants it before its
  // next frame. (One being built a step at a time - loadWorldSoon - is finished first.)
  // act: which of the run's two maps to make of the seed (shared/acts.js)
  loadWorld(seed, act = WORLD.ISLAND) {
    this.finishBuild();
    if (this.seed === seed && this.act === act && this.world) return;
    const steps = this.buildWorld(seed, act);
    while (!steps.next().done);
  },

  // ...or a step at a time, the page answering in between: the backdrop behind the splash, whose build held the main
  // thread for seconds (a click or a key on the splash waited for all of it). The steps run for at most
  // BUILD_SLICE_MS a task: first the textures made ahead of their first use (most of the time a build took: each is a
  // block of its own), then buildWorld's. Nothing is updated or drawn of the world until it is whole (update, main.js).
  // A loadWorld meanwhile finishes it at once (and the textures not made yet are made when first wanted, as ever).
  // Resolves when the world is built.
  loadWorldSoon(seed, act = WORLD.ISLAND) {
    this.finishBuild();
    if (this.seed === seed && this.act === act && this.world) return Promise.resolve();
    const b = (this.building = { pre: textureSteps(), steps: this.buildWorld(seed, act), done: null });
    return new Promise((done) => {
      b.done = done;
      const slice = () => {
        if (this.building !== b) return; // (finished at once by a loadWorld)
        const t0 = performance.now();
        try {
          while (performance.now() - t0 < BUILD_SLICE_MS) {
            if (b.pre && !b.pre.next().done) continue;
            b.pre = null;
            if (!b.steps.next().done) continue;
            this.building = null;
            return done();
          }
        } catch (err) {
          // (as a build in one go would have thrown: the page goes on without a backdrop, a join builds its world anew)
          console.error('world build failed', err);
          this.building = null;
          this.halfBuilt = false;
          this.seed = undefined; // (so that a loadWorld of the same seed builds it again)
          return done();
        }
        setTimeout(slice, 0);
      };
      setTimeout(slice, 0);
    });
  },

  finishBuild() {
    const b = this.building;
    if (!b) return;
    this.building = null;
    while (!b.steps.next().done);
    b.done?.();
  },

  // (a generator: it yields between pieces of the build small enough to leave the page a frame)
  *buildWorld(seed, act) {
    const t0 = performance.now();
    this.halfBuilt = true; // (until the end: prewarm waits for the whole of it)
    if (this.world) this.unloadWorld();
    this.seed = seed;
    this.act = act;
    setAct(act);
    this.waypoint = null; // it pointed into the old valley
    this.world = worldFor(seed, act);
    usePos(this.world); // (what a metre is in a position on the wire: protocol.js)
    this.prediction.setWorld(this.world);
    const t1 = performance.now();
    // (a world with mountains in it - the mainland - is seen far: the haze thins with height, so the ranges stand up
    // out of it from across the map, and the camera's far plane is taken out to them)
    G.uHaze.value.set(this.world.size > 1000 ? HAZE_BASE : 0, this.world.size > 1000 ? 1 / HAZE_THIN : 0);
    this.renderer.camera.far = this.world.size > 1000 ? FAR_BIG : FAR_SMALL;
    this.renderer.camera.updateProjectionMatrix();
    yield;
    this.terrain = yield* terrainSteps(this.world);
    this.terrain.userData.setShadows(!!this.renderer.q.shadows); // hills shade the valleys at low sun
    this.scene.add(this.terrain);
    this.water = buildWater(this.world);
    this.scene.add(this.water);
    this.mine = buildMine(this.world); // (null in a valley without the workings)
    if (this.mine) this.scene.add(this.mine);
    this.clinic = buildClinic(this.world); // the lining of Mercy Clinic's dark wards and its signs (null on a map without it)
    if (this.clinic) this.scene.add(this.clinic);
    this.fair.setWorld(this.world);
    this.handcar.setWorld(this.world);
    this.vehicles.setWorld(this.world);
    this.railway = buildRailway(this.world); // (the ballast, sleepers and rails of the line)
    if (this.railway) this.scene.add(this.railway);
    this.bridge = this.world.bridge ? new BridgeView(this.scene, this.world) : null; // (the mainland: the bridge the car came over)
    this.live = liveProps(this.scene, this.world); // (...the car they came in and the plane: the props a cutscene moves)
    this.ships = buildShips(this.scene, this.world); // (the mainland's: the freighter at the docks' quay, drawn only)
    this.under = 0;
    const t2 = performance.now();
    yield;
    const sw = new StaticWorld(this.scene, this.world, { stepwise: true });
    yield* sw.steps;
    this.staticWorld = sw;
    this.staticWorld.setShadows(!!this.renderer.q.shadows);
    const t3 = performance.now();
    yield;
    this.foliage = new Foliage(this.scene, this.world, this.renderer.q, this.settings.grassDistance);
    const t4 = performance.now();
    yield;
    if (!this.effects) this.effects = new Effects(this.scene, this.renderer.vmScene, this.world);
    else this.effects.world = this.world;
    // the marks blows and bullets leave, and the wrecks taken apart (none of the old world's are left)
    if (!this.impacts) this.impacts = new Impacts(this);
    else this.impacts.setWorld();
    if (!this.flyover) this.flyover = new Flyover(this.scene, this.effects.atlas);
    (this.crows ||= new Crows(this.scene)).setWorld(this.world); // over every hiding place still holding a car supply
    (this.graves ||= new Graves(this)).setWorld(this.world); // the earth of St. Agnes Cemetery, when it breaks open
    if (!this.atmosphere) this.atmosphere = new Atmosphere(this.scene);
    this.weather.setWorld(this.world);
    if (!this.weatherFx) this.weatherFx = new WeatherFX(this.scene, this.renderer.quality);
    this.weatherFx.setWorld(this.world, this.weather);
    this.staticFires = [];
    this.staticEmitters = [];
    for (const l of this.world.lights) {
      if (l.kind === 'embers') {
        // burning barrels / smouldering wrecks
        this.staticEmitters.push(this.effects.createEmitter('barrel', l.x, l.y, l.z));
        this.staticFires.push({ x: l.x, y: l.y - 0.4, z: l.z, intensity: 0.75 });
      } else if (l.kind === 'lamp') {
        // a lamp still burning down a mine (the mainland's passage): a steady glow, no flame
        // (a lamp: warm white and steady - an electric bulb, not a flame - hung where it is, not over it)
        this.staticFires.push({ x: l.x, y: l.y - 1.3, z: l.z, intensity: 1.0, color: 0xffdcae, steady: true });
      } else if (l.kind === 'smoke') {
        // a column of smoke standing over a ruin (the mainland's city: it is what shows where it is from the bridge)
        this.staticEmitters.push(this.effects.createEmitter('column', l.x, l.y, l.z, { radius: l.r || 1 }));
      } else if (l.kind === 'fire') {
        // a building burning: its flames, the smoke over them, its light on the street and its roar
        const loop = this.audio.createLoop?.('blaze', l.x, l.y, l.z) || null;
        this.staticEmitters.push(this.effects.createEmitter('blaze', l.x, l.y, l.z, { radius: l.r || 1, loop }));
        this.staticEmitters.push(this.effects.createEmitter('column', l.x, l.y + 3, l.z, { radius: 0.8 }));
        this.staticFires.push({ x: l.x, y: l.y - 0.4, z: l.z, intensity: 1, big: true });
      }
    }
    yield;
    this.ui.map.setWorld(this.world);
    this.ui.map.baked(); // (the minimap draws from it at once: bake it here, in the load, not on the first frame)
    this.halfBuilt = false;
    this.prewarm();
    console.log(`[client] world ${seed}: gen ${(t1 - t0).toFixed(0)}ms, terrain ${(t2 - t1).toFixed(0)}ms, static ${(t3 - t2).toFixed(0)}ms, foliage ${(t4 - t3).toFixed(0)}ms, rest ${(performance.now() - t4).toFixed(0)}ms`);
  },

  // (the server deals a new map every playthrough, so worlds come and go for as long as the page is open)
  unloadWorld() {
    this.scene.remove(this.terrain, this.water);
    this.terrain.userData.dispose();
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.bridge?.dispose();
    this.bridge = null;
    this.live?.dispose();
    this.live = null;
    for (const g of this.ships || []) this.scene.remove(g); // (their models are the props' kit's, cached: nothing to free)
    this.ships = [];
    if (this.mine) {
      this.scene.remove(this.mine);
      for (const mesh of this.mine.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.mine = null;
    }
    if (this.clinic) {
      this.scene.remove(this.clinic);
      disposeClinic(this.clinic);
      this.clinic = null;
    }
    if (this.railway) {
      this.scene.remove(this.railway);
      for (const mesh of this.railway.children) mesh.geometry.dispose(); // (its materials are the shared ones)
      this.railway = null;
    }
    this.impacts?.wrecks.clear(); // (what it lifted out of the static world goes with that world)
    this.staticWorld?.dispose();
    this.foliage?.dispose();
    this.fair.setWorld(null);
    this.handcar.setWorld(null);
    this.vehicles.setWorld(null);
    for (const em of this.staticEmitters) this.effects.removeEmitter(em);
    this.flyover?.clear();
    this.crows?.setWorld(null);
    this.highlight.reset();
    this.world = null;
  },

  setShadowQuality(q) {
    this.entities.setCharShadows(!!q.charShadows);
    this.terrain?.userData.setShadows(!!q.shadows);
    this.staticWorld?.setShadows(!!q.shadows);
    this.impacts?.wrecks.setShadows(!!q.shadows);
  },

  // A tree chopped down (EVT.FELL; yaw: the way it falls), or one that was down before we came (EVT.STRIPPED,
  // yaw null): out of the world until dawn, and out of the forest - the one falling now crashes down first.
  fellTree(qx, qy, qz, yaw = null) {
    const col = this.world && treeAt(this.world, qx, qy, qz);
    if (!col || !fellTree(this.world, col)) return;
    this.impacts?.gone(col); // (the cuts in its bark go down with it)
    this.foliage?.fell(col.ti, yaw);
    if (yaw === null) return;
    // heard from a little way out along its fall: between the creaking stump and where the crown comes down
    const out = 0.3 * (col.y1 - col.y0);
    const x = col.x - Math.sin(yaw) * out;
    const z = col.z - Math.cos(yaw) * out;
    this.audio.play(SOUND.TREE_FALL, { x, y: this.world.heightAt(x, z) + 1.5, z });
  },

  // A tree shot (pieces 1) or blown apart (2-3; EVT.TREE_BREAK): it bursts cut m up its foot, and what was above
  // comes down toward yaw - a blast's pieces thrown that way. What stands below stands until dawn, its collider cut
  // down to it, and can be shot again; it gives no wood. Pieces 0: it was cut so before we came.
  breakTree(qx, qy, qz, yaw, cut, pieces) {
    const col = this.world && treeAt(this.world, qx, qy, qz);
    if (!col?.cells) return; // (none, or chopped down)
    const top = col.full === undefined ? Infinity : treeTop(col); // (what stood of it: the whole, or a trunk)
    if (!cutTree(this.world, col, cut)) return;
    this.stripped.add(strippedKey(qx, qy, qz));
    this.impacts?.gone(col); // (the marks in its bark go: the ones above went with what came down)
    const cuts = this.foliage?.breakTree(col.ti, yaw, cut, top, pieces, col.r) || [cut];
    if (!pieces) return;
    const x = col.x;
    const z = col.z;
    const foot = treeFoot(col);
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const near = Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 160;
    for (const c of cuts) {
      if (near) this.impacts?.fx.treeBurst(x, foot + c, z, col.r, dx, dz, pieces > 1);
      this.audio.play(SOUND.WOOD_BREAK, { x, y: foot + c, z });
    }
    // a shot one comes down as a chopped one does, and is heard so - unless it is only a length of trunk; a blast's
    // pieces land in the blast's noise
    const fell = Math.min(top, col.full - foot) - cut;
    if (pieces > 1 || fell < 2) return;
    const out = 0.3 * fell;
    this.audio.play(SOUND.TREE_FALL, { x: x + dx * out, y: this.world.heightAt(x + dx * out, z + dz * out) + 1.5, z: z + dz * out });
  },

  regrowTrees() {
    if (!this.world) return;
    regrowTrees(this.world);
    this.foliage?.regrow();
  },
};
