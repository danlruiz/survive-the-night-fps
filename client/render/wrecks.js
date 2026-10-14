// Props that react to a blow: a wreck that is taken apart, and anything light enough to rock (a barrel, a crate).
//
// The static world is merged and its vertices are on the card: a prop that is to change is lifted out of it
// (StaticWorld.lift) and drawn from the LiftBatch instead, its triangles rebuilt and kept here. A light prop rocks
// on its base, settles, and goes back as it was. A wreck stays out until dawn:
//
//   - its triangles are sorted into the solid pieces the model was built from (wreckgeo.js islands), and those into
//     parts by where they are and what they are made of: panes and lamps, wheels, lids (a bonnet), a tailgate, a
//     door that stands ajar, and whatever is small and on the outside - bumpers, mirrors, trim, lights;
//   - every blow on record (shared/wrecks.js: where, which way, with what) does the same thing on every client: a
//     dent pressed into the panel and a mark on it, and the part it landed on or beside takes a step - glass crazes
//     and then falls out, a tyre stabbed goes down and the car settles on that corner, a lid lifts on its hinge and
//     then comes away, trim is knocked askew and then off. A blow that took salvage strips the nearest part that is
//     still on; when nothing is left to take the wreck is picked clean: no glass, no trim, lids off, on its rims;
//   - what comes off is thrown clear, bounces and comes to rest on the ground beside the wreck (worked out ahead,
//     step by step, so that a client that was not there finds each piece where the others saw it land).
//
// What is not on record is cosmetic and each client's own: the rocking on the springs (from EVT.STRIKE), the sparks,
// the sounds, the marks that fade. Nothing here runs for a wreck at rest: only the ones in `active` are updated.
// (One prop out of the static world, a Lifted or a Wreck, is wreck.js; this file keeps all of them.)
import * as THREE from 'three';
import { PROPS } from '../../shared/props.js';
import { WRECK_SALVAGE, wreckOf } from '../../shared/wrecks.js';
import { LiftBatch } from './liftbatch.js';
import { propVariant } from './models/props.js';
import { refine, islands, rayPieces } from './wreckgeo.js';
import { FINE, Lifted, Wreck } from './wreck.js';

const FINES_KEPT = 24; // Wrecks.fineModel(): models kept (a car's is about 1 MB)
const PREFETCH_NEAR = 120; // m: the wrecks whose models Wrecks.prefetch makes ahead of a blow...
const PREFETCH_EVERY = 0.25; // s: ...one at a time, at most this often
const BUILD_NEAR = 170; // m: a wreck on record is built when the eye is this near

const _v2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// a wreck's model, as Wrecks.fineModel keeps it: one a type's variant
const fineKey = (prop) => `${prop.type}:${propVariant(prop.type, prop.seed)}`;
// how finely its panels are cut (refine's edge): by its size
const fineEdge = (prop) => {
  const size = PROPS[prop.type].size;
  return Math.max(FINE, Math.hypot(size[0], size[2]) * 0.062);
};


// ---------------------------------------------------------------- all of them
export class Wrecks {
  // on: { sound(name, x, y, z, vol), shatter(corners, n..., d..., count), puff(x, y, z), scrap(...), flash(x, y, z, k) }
  constructor(scene, on = {}) {
    this.scene = scene;
    this.on = on;
    this.batch = new LiftBatch(scene);
    this.world = null;
    this.staticWorld = null;
    this.marks = null;
    this.time = 0;
    this.live = new Map(); // prop -> Lifted (a Wreck, or a light prop while it rocks)
    this.records = new Map(); // wreck collider -> { left, hits, prop }: what the server has said of it
    this.pending = []; // records whose wreck is not built yet (too far off to matter)
    this.active = new Set();
    this.alarms = new Map(); // prop -> { until, blink, chirp }
    this.cache = []; // the last few props a ray was cast at: [prop, pieces]
    this.fines = new Map(); // 'type:variant' -> fineModel(): the last few wrecks' models, the latest last
    this.salvage = []; // the world's wrecks (props that give salvage and can be taken out of the static world)
    // prefetch's worker, its job, and the models it has been asked for in this world (each once: kept or not after)
    this.prep = { worker: null, tried: false, busy: null, sent: null, gen: 0, t: 0, asked: new Set() };
    this.scanT = 0;
    this.pried = new Set(); // the cars whose boot stands open (Wrecks.pry)
  }
  setWorld(world, staticWorld, marks) {
    this.clear();
    this.fines.clear();
    this.world = world;
    this.staticWorld = staticWorld;
    this.marks = marks;
    this.salvage = world && staticWorld ? world.props.filter((p) => PROPS[p.type]?.salvage && staticWorld.lifts.has(p)) : [];
    this.prep.gen++; // (what the worker is making is of the old world: dropped when it comes)
    this.prep.busy = null;
    this.prep.asked.clear();
  }
  clear() {
    for (const l of this.live.values()) {
      l.drop();
      this.marks?.pool.removeOwner(l.prop);
    }
    this.live.clear();
    this.records.clear();
    this.pending.length = 0;
    this.active.clear();
    this.alarms.clear();
    this.cache.length = 0;
    this.pried.clear();
  }
  // dawn (EVT.REGROWN): every wreck is whole again, as the trees stand again
  reset() {
    const world = this.world, sw = this.staticWorld, marks = this.marks;
    this.clear();
    this.world = world;
    this.staticWorld = sw;
    this.marks = marks;
  }
  setShadows(on) {
    this.batch.setShadows(on);
  }

  get(prop) {
    return this.live.get(prop) || null;
  }
  // A wreck's model with its panels cut finer (refine) and sorted into its solid pieces (islands), in its own frame:
  // { pieces (StaticWorld.model's, cut), isles } or null. Made once a model, not once a car: the cutting and the
  // sorting were most of the frame a car's first blow froze for (80 to 150 ms).
  fineModel(prop) {
    const key = fineKey(prop);
    let f = this.fines.get(key);
    if (f !== undefined) this.fines.delete(key);
    else {
      // (not made ahead - prefetch - or not yet: made here, now)
      const model = this.staticWorld.model(prop.type, prop.seed);
      f = null;
      if (model) {
        // (refine puts new arrays on the piece it is given: the model's own are left as they are)
        const pieces = model.map((p) => ({ ...p }));
        for (const p of pieces) refine(p, fineEdge(prop));
        f = { pieces, isles: islands(pieces, (x, y, z, o) => ((o[0] = x), (o[1] = y), (o[2] = z), o)) };
      }
    }
    this.keepFine(key, f);
    return f;
  }
  keepFine(key, f) {
    this.fines.set(key, f);
    if (this.fines.size > FINES_KEPT) this.fines.delete(this.fines.keys().next().value);
  }

  // In the background: the model of the nearest wreck whose model is not made yet, cut and sorted by a worker
  // (wreckworker.js), so that a car's first blow finds it made and costs what any other blow does. One at a time, at
  // most every PREFETCH_EVERY s, within PREFETCH_NEAR m; here on the main thread only StaticWorld.model (a few ms).
  // Without workers (node, an old browser) nothing is made ahead: fineModel makes it at the blow, as before.
  prefetch(dt, eye) {
    const P = this.prep;
    if (P.busy || !eye || !this.salvage.length || (P.t -= dt) > 0) return;
    P.t = PREFETCH_EVERY;
    let best = null, bd = PREFETCH_NEAR * PREFETCH_NEAR;
    for (const pr of this.salvage) {
      const d = (pr.x - eye.x) ** 2 + (pr.z - eye.z) ** 2;
      if (d < bd && !P.asked.has(fineKey(pr)) && !this.fines.has(fineKey(pr))) {
        best = pr;
        bd = d;
      }
    }
    if (!best) return;
    const w = this.prepWorker();
    if (!w) return;
    const key = fineKey(best);
    P.asked.add(key); // (once: more wrecks about than are kept must not make the same ones over and over)
    const model = this.staticWorld.model(best.type, best.seed);
    if (!model) return this.keepFine(key, null);
    // (copies: the model's own arrays stay with StaticWorld, these go to the worker)
    const pieces = model.map((p) => ({ count: p.count, names: p.names.map((r) => ({ ...r })), pos: p.pos.slice(), nrm: p.nrm.slice(), uv: p.uv.slice(), col: p.col && p.col.slice(), ground: p.ground && p.ground.slice(), tint: p.tint && p.tint.slice() }));
    const bufs = [];
    for (const p of pieces) for (const c of ['pos', 'nrm', 'uv', 'col', 'ground', 'tint']) if (p[c]) bufs.push(p[c].buffer);
    P.busy = key;
    P.sent = model;
    w.postMessage({ key, gen: P.gen, edge: fineEdge(best), pieces }, bufs);
  }
  prepWorker() {
    const P = this.prep;
    if (P.worker || P.tried) return P.worker;
    P.tried = true;
    if (typeof Worker === 'undefined') return null;
    try {
      P.worker = new Worker(new URL('./wreckworker.js', import.meta.url), { type: 'module' });
    } catch {
      return null;
    }
    P.worker.onmessage = (e) => {
      const { key, gen, pieces, isles, error } = e.data;
      const sent = P.sent;
      P.busy = P.sent = null;
      if (error) return this.dropWorker(error);
      // (a world swapped meanwhile, or a blow came first and made it on the main thread)
      if (gen !== P.gen || this.fines.has(key)) return;
      pieces.forEach((p, i) => (p.mat = sent[i].mat));
      this.keepFine(key, { pieces, isles });
    };
    P.worker.onerror = (e) => {
      e?.preventDefault?.();
      this.dropWorker(e?.message);
    };
    return P.worker;
  }
  dropWorker(why) {
    const P = this.prep;
    console.warn('[wrecks] the model worker failed: wrecks are made at their first blow', why);
    P.worker?.terminate();
    P.worker = null;
    P.busy = P.sent = null;
  }
  wreck(prop) {
    let w = this.live.get(prop);
    if (w && !w.wreck) {
      // (it was rocking as a light prop would: it is a wreck now)
      w.drop();
      this.active.delete(w);
      w = null;
    }
    if (!w) {
      if (!this.staticWorld.lifts.has(prop)) return null;
      w = new Wreck(this, prop);
      this.live.set(prop, w);
      w.lift();
      if (this.pried.has(prop)) w.pry(true, false);
    }
    return w;
  }
  // A car's boot has been forced (its container is searched), or is shut again (the container was refilled). The
  // car leaves the static world for it, as one that is hit does. live: it is happening now, in front of us.
  // Returns whether there was a lid to move.
  pry(prop, on, live = false) {
    if (this.pried.has(prop) === on && (!on || this.live.get(prop)?.wreck)) return false;
    const w = on ? this.wreck(prop) : this.live.get(prop);
    if (on) this.pried.add(prop);
    else this.pried.delete(prop);
    if (!w || !w.wreck) return false;
    w.pry(on, live);
    if (live) this.active.add(w);
    else w.flush();
    return !!w.bootLid();
  }
  // whether a car's boot is shut by its lid still: false once it is forced, lifted by a blow or off
  bootShut(prop) {
    const w = this.live.get(prop);
    if (!w || !w.wreck) return !this.pried.has(prop);
    const p = w.bootLid();
    return !!p && p.state === 0 && !w.pried;
  }

  // EVT.WRECK: what is left in a wreck and the blows on its record. replay: `hits` is the whole record (and nothing
  // is seen or heard happening); otherwise they are new ones, on top of what is known
  record(col, left, hits, replay, eye) {
    const prop = wreckOf(col);
    if (!prop || !this.staticWorld?.lifts.has(prop)) return;
    let rec = this.records.get(col);
    if (!rec) this.records.set(col, (rec = { col, prop, left: WRECK_SALVAGE, hits: [], built: 0 }));
    if (replay) {
      rec.hits = hits.slice();
      rec.built = 0;
      const old = this.live.get(prop);
      if (old) {
        // (told all over again: from the beginning)
        old.drop();
        this.marks?.pool.removeOwner(prop);
        this.live.delete(prop);
        this.active.delete(old);
      }
    } else rec.hits.push(...hits);
    rec.left = left;
    const near = !eye || Math.hypot(eye.x - prop.x, eye.z - prop.z) < BUILD_NEAR;
    if (near) this.build(rec, !replay);
    else if (!this.pending.includes(rec)) this.pending.push(rec);
  }
  build(rec, live) {
    const w = this.wreck(rec.prop);
    if (!w) return;
    // (a wreck of several colliders - a lorry and its trailer - is one wreck here: every collider's blows land on it)
    while (rec.built < rec.hits.length) w.apply(rec.hits[rec.built++], live);
    let left = 0, n = 0;
    for (const r of this.records.values()) {
      if (r.prop !== rec.prop) continue;
      left += r.left;
      n++;
    }
    w.setLeft(n ? left / n < 0.5 ? 0 : Math.ceil(left / n) : rec.left, live);
    if (live) this.active.add(w);
    else {
      w.finish();
      w.flush();
    }
  }

  // EVT.WRECK_ALARM: say 0 quiet, 1 chirp, 2 ringing for secs, 3 armed (its trunk sets it off: a chirp and a blink)
  alarm(col, say, secs) {
    const prop = wreckOf(col);
    if (!prop) return;
    if (say === 0) return void this.alarms.delete(prop);
    if (say === 3 && this.ringing(prop)) return;
    this.alarms.set(prop, { until: say === 2 ? this.time + secs : this.time + 0.75, ring: say === 2, blink: 0, whoop: 0, n: 0 });
    if (say === 1 || say === 3) this.on.sound?.('car_chirp', prop.x, prop.y + 0.9, prop.z, say === 3 ? 0.6 : 1);
  }
  ringing(prop) {
    return !!this.alarms.get(prop)?.ring;
  }
  // where a wreck's lamps are (a wreck that was never hit has no parts sorted out: the corners of its box)
  lampsOf(prop) {
    const w = this.live.get(prop);
    if (w?.wreck) return w.lamps();
    const s = PROPS[prop.type].size;
    const out = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(new THREE.Vector3(sx * s[0] * 0.4, s[1] * 0.45, (sz * s[2]) / 2).applyAxisAngle(Y, prop.ry).add(_v2.set(prop.x, prop.y, prop.z)));
    return out;
  }

  // A blow (not on record: any melee swing, a bullet) on a prop: it rocks. Light props are lifted for as long as
  // they move; a wreck that has never been on record rocks the same way and goes back.
  push(prop, px, py, pz, dx, dy, dz, k) {
    if (!this.staticWorld?.lifts.has(prop)) return;
    let l = this.live.get(prop);
    if (!l) {
      l = new Lifted(this, prop, !!PROPS[prop.type].salvage);
      l.heavy = !!PROPS[prop.type].salvage;
      this.live.set(prop, l);
      l.temp = true;
      l.lift();
    }
    l.quiet = 0;
    l.push(px, py, pz, dx, dy, dz, k);
  }

  /**
   * A ray (the world's) against a prop's own triangles - as it stands now if it has been lifted, otherwise the
   * model's. out: { t (-1: it went through), name (the material struck), nx, ny, nz }.
   */
  ray(prop, ox, oy, oz, dx, dy, dz, maxT, out) {
    const l = this.live.get(prop);
    if (l) return l.ray(ox, oy, oz, dx, dy, dz, maxT, out);
    let c = this.cache.find((e) => e[0] === prop);
    if (!c) {
      const pieces = this.staticWorld.pieces(prop);
      if (!pieces) {
        out.t = -2; // (no model to ask: the caller goes by the collider)
        return out;
      }
      c = [prop, pieces];
      this.cache.push(c);
      if (this.cache.length > 6) this.cache.shift();
    }
    return rayPieces(c[1], (pi) => c[1][pi].pos, ox, oy, oz, dx, dy, dz, maxT, out);
  }

  update(dt, time, eye) {
    this.time = time;
    this.prefetch(dt, eye);
    for (const l of this.active) {
      const busy = l.update(dt);
      if (busy) continue;
      this.active.delete(l);
      if (l.temp) {
        // a light prop at rest goes back into the static world
        l.drop();
        this.live.delete(l.prop);
      }
    }
    // alarms: the lamps blink, the horn sounds
    for (const [prop, a] of this.alarms) {
      if (time >= a.until) {
        this.alarms.delete(prop);
        continue;
      }
      if (time >= a.blink) {
        a.blink = time + (a.ring ? 0.42 : 0.28);
        if (a.n++ % 2 === 0) for (const p of this.lampsOf(prop)) this.on.flash?.(p.x, p.y, p.z, a.ring ? 1 : 0.6);
      }
      if (a.ring && time >= a.whoop) {
        a.whoop = time + 0.84;
        this.on.sound?.('car_alarm', prop.x, prop.y + 0.9, prop.z, 1);
      }
    }
    // wrecks on record that were too far off to build: one at a time as the eye comes near
    if (this.pending.length && (this.scanT -= dt) <= 0 && eye) {
      this.scanT = 0.25;
      const i = this.pending.findIndex((r) => Math.hypot(eye.x - r.prop.x, eye.z - r.prop.z) < BUILD_NEAR);
      if (i >= 0) this.build(this.pending.splice(i, 1)[0], false);
    }
  }

  dispose() {
    this.clear();
    this.batch.dispose();
    this.prep.worker?.terminate();
    this.prep.worker = null;
  }
}
