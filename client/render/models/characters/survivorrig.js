// A survivor's model: a roster survivor's or a custom one's, alive and turned, each built once and kept (custom ones
// let go when nothing has held them for a while), with what the worn pack and held things need to know of its body.
import { isLookKey, fromLookCode } from '../../../../shared/appearance.js';
import { CHARACTER_COUNT } from '../../../../shared/characters.js';
import { MeshBuilder } from '../skinning.js';
import { buildPerson } from '../people.js';
import { mouthAnchor, surfPoint } from '../humans.js';
import { LOOKS, deadLook, frameOf, lookFromAppearance } from '../looks.js';
import { humanP, addHumanoidBones } from './skeleton.js';

const PI = Math.PI;

export const SURVIVOR_LOOKS = CHARACTER_COUNT;

// A survivor's model is a roster id (shared/characters.js, looks.js LOOKS) or a custom survivor's key ('a:<code>':
// shared/appearance.js lookKey, built by looks.js lookFromAppearance). Each is built once, alive and turned, and kept
// (survivorRigs, `${ref}|h` / `${ref}|z`). A custom one costs about 1.5 MB with both: the instances holding one are
// counted (lookUse), and past the LOOK_KEEP last used, one nothing holds is let go (evictLooks). The creator's preview
// builds its own that go with it (transient).
const survivorRigs = new Map();
const lookUse = new Map(); // custom key -> { n: instances holding it, t: when last held }
const LOOK_KEEP = 8;
let lookClock = 0;
// where the worn backpack's back panel sits on the default body (chest-bone z of the jacket's back at the pack's
// pivot): each character's pack is moved back or in by how far their own back is from this
const PACK_BACK = 0.118;
export const PACK_PIVOT = [0, 0.1, 0.145]; // (chest-bone space) the top of the worn pack's back panel, under the straps
// how far the front of the default chest is (chest-bone y 0.1, in its clothes): the holds of solveArms were made on it
const HOLD_FRONT = 0.125;
/** The look object of a survivor reference: a roster id, or a custom look's key (a bad code: the first survivor). */
function lookOfRef(ref) {
  if (isLookKey(ref)) {
    const v = fromLookCode(ref.slice(2));
    return v ? lookFromAppearance(v) : LOOKS[0];
  }
  return LOOKS[(((ref | 0) % LOOKS.length) + LOOKS.length) % LOOKS.length];
}
// a custom survivor's corpse is torn and bloodied the same way every time (deadLook's seed)
function deadSeed(ref) {
  if (!isLookKey(ref)) return ref;
  let h = 0;
  for (let i = 0; i < ref.length; i++) h = (Math.imul(h, 31) + ref.charCodeAt(i)) >>> 0;
  return h % 997;
}
export function getSurvivorRig(v, zombie, transient = false) {
  const key = v + (zombie ? '|z' : '|h');
  let r = transient ? null : survivorRigs.get(key);
  if (r) return r;
  const look = lookOfRef(v);
  const L = zombie ? deadLook(look, deadSeed(v)) : { ...look, fist: true };
  const P = humanP(frameOf(look));
  const mb = new MeshBuilder();
  addHumanoidBones(mb, P);
  mb.dirt = L.dirt || { y0: 0.32, k: 0.3 };
  const built = buildPerson(mb, P, L);
  r = mb.build();
  r.P = P;
  r.mouth = mouthAnchor(built.H);
  const back = surfPoint(built.T, PI, P.chestY + PACK_PIVOT[1], built.pT)[2];
  r.packDZ = back - PACK_BACK;
  // the worn pack's straps on this body: a point of a strap (chest-bone space, the pack at WORN_AT) that would be
  // inside the chest, the shoulder or the side is moved out onto the clothes there, a strap's thickness proud. The
  // pack itself sits packDZ back, so a point is fitted where it ends up and handed back from where it started.
  const T = built.T, pT = built.pT;
  // ...and whatever is held comes forward as far as this chest is deeper than the one the holds were made on
  r.holdDZ = Math.min(0, HOLD_FRONT + surfPoint(T, 0, P.chestY + 0.1, pT)[2]);
  const strapOut = pT + 0.009;
  r.strapFit = (x, y, z) => {
    const ym = y + P.chestY, zm = z + r.packDZ;
    if (zm > 0.05 || ym > T.yHi + 0.02) return [x, y, z]; // (the back panel's own end, and over the top: as made)
    const ring = T.ring(Math.min(ym, T.yHi));
    const t = Math.atan2(x, -(zm - ring.cz));
    const s = surfPoint(T, t, Math.min(ym, T.yHi), strapOut);
    const rs = Math.hypot(s[0], s[2] - ring.cz), rp = Math.hypot(x, zm - ring.cz);
    if (rp >= rs) return [x, y, z];
    const k = rs / (rp || 1);
    return [x * k, y, (zm - ring.cz) * k + ring.cz - r.packDZ];
  };
  if (!transient) survivorRigs.set(key, r);
  return r;
}
// an instance takes a custom look and gives it back (the roster's are always kept)
export function holdLook(ref) {
  if (!isLookKey(ref)) return;
  const u = lookUse.get(ref) || { n: 0, t: 0 };
  u.n++;
  u.t = ++lookClock;
  lookUse.set(ref, u);
}
export function dropLook(ref) {
  const u = isLookKey(ref) && lookUse.get(ref);
  if (!u) return;
  u.n = Math.max(0, u.n - 1);
  u.t = ++lookClock;
  evictLooks();
}
/** Lets go of the custom survivors' models nothing holds, but for the LOOK_KEEP last used (and any in `keep`). */
export function evictLooks(keep = null) {
  const idle = [];
  for (const k of survivorRigs.keys()) {
    const ref = k.slice(0, -2);
    if (!isLookKey(ref) || idle.includes(ref)) continue;
    const u = lookUse.get(ref);
    if (!(u && u.n > 0) && !(keep && keep.has(ref))) idle.push(ref);
  }
  idle.sort((a, b) => (lookUse.get(b)?.t ?? 0) - (lookUse.get(a)?.t ?? 0));
  for (const ref of idle.slice(LOOK_KEEP)) {
    for (const s of ['|h', '|z']) {
      const r = survivorRigs.get(ref + s);
      if (r) r.geometry.dispose();
      survivorRigs.delete(ref + s);
    }
    lookUse.delete(ref);
  }
}
/** Whether a survivor's models, alive and turned, are both built (a custom look is drawn from then on: Game.lookOf). */
export function lookWarm(ref) {
  return survivorRigs.has(ref + '|h') && survivorRigs.has(ref + '|z');
}
/** Builds one of a survivor's two models if it is not yet (LookWarmer: one a slot). Returns whether it built one. */
export function warmLook(ref) {
  if (!survivorRigs.has(ref + '|h')) {
    getSurvivorRig(ref, false);
    lookUse.set(ref, lookUse.get(ref) || { n: 0, t: ++lookClock });
    return true;
  }
  if (!survivorRigs.has(ref + '|z')) {
    getSurvivorRig(ref, true);
    return true;
  }
  return false;
}

/** Builds a character's rigs (alive and turned) ahead of need: Game.warmViews. */
export function warmSurvivor(v) {
  getSurvivorRig(v, false);
  getSurvivorRig(v, true);
}

/** Debug info for the sandbox (modelStats): triangle counts of each roster survivor, alive and turned. */
export function survivorStats() {
  const out = [];
  for (let v = 0; v < SURVIVOR_LOOKS; v++) {
    out.push({ type: 'survivor', variant: v, tris: getSurvivorRig(v, false).tris });
    out.push({ type: 'survivor-z', variant: v, tris: getSurvivorRig(v, true).tris });
  }
  return out;
}
