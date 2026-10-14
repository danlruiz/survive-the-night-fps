// The planted-foot gait of the walker and the runner styles (a style with gWalk / gRun), and the feet of anything
// standing still: where each ankle goes, pinned to the ground in the world, and the legs fitted to them with two-bone
// IK once the upper body is final (characters/pose.js poseLoco, poseHumanoid).
import { mulberry32, clamp, lerp, smooth } from '../skinning.js';
import { HIPS, SPINE, CHEST, JAW, CLAV_L, UARM_L, CLAV_R, THIGH_L, THIGH_R } from './skeleton.js';
import { R, A, arm, headLook, posture, n1, frac, twitch, rotXYZ, rotVec } from './posekit.js';

const PI = Math.PI;
const TAU = PI * 2;

// Instead of swinging leg angles, these styles plan where each ankle goes. A stance foot stays put on the ground while
// the body travels over it (one gait cycle covers exactly the ground distance that drives the phase, so feet don't
// skate), lands on the heel and rolls off the ball; the swing foot lifts, drags its toes or kicks up behind. solveLegs
// fits the legs with two-bone IK once the upper body (and the head-over-origin shift) is final.
const FOOT_HEEL = 0.085, FOOT_BALL = 0.12, FOOT_TOE = 0.17;
const hash01 = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Per-instance gait quirks (created lazily so the survivor zombie-mode shim gets them too). */
function gaitVars(z) {
  if (z.gv) return z.gv;
  const r = mulberry32(((z.seed >>> 0) * 7919 + 1013 + (z.type | 0) * 131) >>> 0);
  const limp = r(), arms = r();
  z.gv = {
    limp: limp < 0.2 ? 0 : 0.35 + 0.65 * r(), // how badly the bad leg drags (some shuffle on two good legs)
    lean: 0.85 + 0.3 * r(),
    stride: 0.92 + 0.16 * r(),
    arms: arms < 0.36 ? 0 : arms < 0.76 ? 1 : 2, // walker: dangle / one arm reaching / both; runner: pump / claw / flail
    reach: 1.05 + 0.35 * r(),
    stumble: 0.05 + 0.12 * r(), // chance per gait cycle of a stumbling lurch
    slouch: (r() - 0.5) * 0.14,
    asym: (r() - 0.5) * 0.07, // runner: uneven, galloping rhythm
  };
  return z.gv;
}

/** Ground distance (m) of one gait cycle before the instance's rate; strides shorten when moving slowly. */
export function gaitLen(z, run, speed) {
  const st = z.st;
  const base = run ? st.cycleRun : st.cycleWalk;
  const G = run ? st.gRun : st.gWalk;
  if (!G) return base;
  return base * gaitVars(z).stride * clamp(Math.sqrt(Math.max(speed, 0.01) / G.ref), 0.6, 1.15);
}

/** Per-leg timing for this frame. Leg 0 = left, 1 = right; the limp leg lands at 0, the other at td. */
function gaitSetup(z, run) {
  const st = z.st, G = run ? st.gRun : st.gWalk, V = gaitVars(z);
  const k = z.gk || (z.gk = { G, len: 1, limp: 0, D: [0, 0], td: [0, 0], lift: [0, 0], drag: [0, 0], circ: [0, 0], bob: [0, 0], vault: [0, 0], x: [0, 0], w: [0, 0], stance: [false, false], load: [0, 0], u: 0 });
  k.G = G;
  k.len = gaitLen(z, run, z.speed) / ((z.rate || 1) * (z.gScale || 1)); // in rig units
  const b = z.limpSide, g = 1 - b;
  const limp = (G.limp ?? st.limp ?? 0) * V.limp;
  k.limp = limp;
  // limp: short stance on the bad leg and a quick step off it, long slow drag of the bad foot ("step... draag")
  k.D[b] = G.duty - 0.12 * limp;
  k.D[g] = G.duty + 0.12 * limp;
  k.td[b] = 0;
  k.td[g] = 0.5 - 0.1 * limp + (G.asym ? V.asym : 0);
  k.lift[b] = G.lift * (1 - 0.8 * limp);
  k.lift[g] = G.lift;
  k.drag[b] = limp;
  k.drag[g] = 0;
  k.circ[b] = 0.05 * limp;
  k.circ[g] = 0;
  // single support: vault up over a stiff stance leg; the bad knee buckles under the weight instead
  k.bob[b] = G.bob - 0.04 * limp;
  k.bob[g] = G.bob;
  k.vault[b] = (G.vault || 0) * (1 - 0.8 * limp);
  k.vault[g] = G.vault || 0;
  const u = frac(z.phase / TAU);
  k.u = u;
  for (let i = 0; i < 2; i++) {
    const x = frac(u - k.td[i]), D = k.D[i];
    k.x[i] = x;
    k.stance[i] = x < D;
    k.w[i] = x < D ? 0 : (x - D) / (1 - D);
    k.load[i] = legLoad(k, i, x);
  }
  return k;
}
function legLoad(k, i, x) {
  const D = k.D[i];
  return x < D ? smooth(Math.min(x, D - x) / 0.08) : 0;
}
/** Planned forward offset of the flat foot (rig m) at cycle time x since touchdown. */
function footFwd(k, i, x) {
  const D = k.D[i], h = D * k.len * 0.5;
  return x < D ? h - x * k.len : -h + 2 * h * smooth((x - D) / (1 - D));
}
/** Weight shift, -1 (left foot) .. 1 (right foot), at cycle time u. */
const latAt = (k, u) => legLoad(k, 1, frac(u - k.td[1])) - legLoad(k, 0, frac(u - k.td[0]));
/** Which foot leads, ~-1 (left ahead) .. 1 (right ahead), at cycle time u. */
const leadAt = (k, u) => (footFwd(k, 1, frac(u - k.td[1])) - footFwd(k, 0, frac(u - k.td[0]))) / ((k.D[0] + k.D[1]) * 0.5 * k.len);
/** Footfall jolt: a bump just after each touchdown (heavier on the limp leg). */
function jolt(k, u, b) {
  let j = 0;
  for (let i = 0; i < 2; i++) {
    const x = frac(u - k.td[i]);
    if (x < 0.2) j += Math.sin((PI * x) / 0.2) * (i === b ? 1 + k.limp : 1);
  }
  return j;
}
/** Occasional stumbling lurch: 0..1 over a whole gait cycle, on a random minority of cycles. */
function stumble(z, V) {
  const c = Math.floor(z.phase / TAU);
  if (hash01(c, z.seed) > V.stumble) return 0;
  const s = Math.sin(PI * frac(z.phase / TAU));
  return s * s;
}

export function poseGait(z, p, run) {
  const st = z.st, V = gaitVars(z), k = gaitSetup(z, run), G = k.G;
  const t = z.time + z.off, n = z.nb * 4, u = k.u, b = z.limpSide;
  z.gOn = true;
  const lat = k.load[1] - k.load[0];
  const latLag = latAt(k, u - 0.1);
  const lead = leadAt(k, u), leadLag = leadAt(k, u - 0.07), leadLag2 = leadAt(k, u - 0.17);
  const jl = jolt(k, u, b), jlLag = jolt(k, u - 0.06, b);
  const tw = twitch(z, t, st.twitchy ? 2 : 0.5);
  // pelvis: turns with the leading leg, drops on the swing side (a dragged leg hikes its hip instead), shifts over the stance foot
  let roll = 0;
  for (let i = 0; i < 2; i++) if (!k.stance[i]) roll += (i ? 1 : -1) * Math.sin(PI * k.w[i]) * lerp(-G.drop, G.hike || 0, k.drag[i]);
  const yaw = G.hipYaw * lead;
  const lean = (run ? st.runLean : st.walkLean) * V.lean;
  const hl = lean * (G.hipLean || 0); // part of the lean tips the pelvis (the leg IK absorbs it)
  R(p, HIPS, hl, yaw, roll);
  p[n] = G.sway * lat + (b ? -0.015 : 0.015) * k.limp; // weight favors the good leg

  if (G.sprint) {
    // --- feral sprint: pitched far forward, shoulders whipping against the hips, head locked on the prey
    const nod = G.nod * jl, tl = lean - hl;
    R(p, SPINE, tl * 0.5 - nod * 0.4 + 0.03 * Math.sin(t * 2.3), -yaw * 0.9, -roll * 0.5 - G.roll * lat);
    R(p, CHEST, tl * 0.5 - nod * 0.3, -yaw * 1.05, -G.roll * lat * 0.5);
    posture(z, p);
    A(p, CLAV_L, 0, 0, -0.06 * Math.max(0, -lead));
    A(p, CLAV_R, 0, 0, 0.06 * Math.max(0, lead));
    headLook(p, st.headPitch - 0.2 - 0.7 * G.nod * jlLag + tw * 0.25, yaw * 0.9 + n1(t * 0.7, z.seed + 4) * 0.12 + tw * 0.35, z.tilt * st.headTilt * 0.6 + tw * 0.2, 0.5);
    R(p, JAW, -0.4 - 0.2 * jl - 0.15 * Math.abs(Math.sin(t * 5.3)), 0, 0);
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      const d = -sg * leadLag, d2 = -sg * leadLag2; // + while this arm is forward (opposite leg leads)
      const ns = n1(t * 3.1, z.seed + s * 3) * 0.25, na = n1(t * 2.3, z.seed + 9 + s) * 0.15;
      if (V.arms === 1) {
        // clawing forward at the prey, alternating grabs
        arm(p, s, 1.2 + 0.45 * d + ns, 0.28 + na, 0.3, 0.35 + 0.45 * Math.max(0, d2 - d), 0.65);
      } else if (V.arms === 2) {
        // flailing: loose, oversized and out of sync
        arm(p, s, 0.6 + 0.8 * d + ns * 1.5, 0.45 + 0.25 * Math.sin(u * TAU * 2 + s) + na, 0.3, 0.4 + 0.9 * Math.max(0, d2 - d), 0.3);
      } else {
        // sprinter's pump, wide and ragged
        arm(p, s, 0.35 + 0.95 * d + ns, 0.3 + 0.12 * Math.abs(d) + na, 0.35, 1.2 - 0.45 * d + 0.6 * Math.max(0, d2 - d), 0.35);
      }
    }
    return;
  }

  // --- shamble: hunched, lurching over the stance leg, head lolling a beat behind
  const nod = G.nod * jl;
  const stum = G.stumble ? stumble(z, V) : 0;
  const lurch = k.limp * k.load[b] * (b ? 1 : -1); // + toward the right
  const trunkRoll = -G.roll * lat - 0.22 * lurch;
  const br = Math.sin(t * 1.9) * 0.015, tl = lean - hl;
  R(p, SPINE, tl * 0.5 - nod * 0.5 - 0.14 * stum + br, -yaw * 0.7, -roll * 0.6 + trunkRoll * 0.5 + V.slouch * 0.5);
  R(p, CHEST, tl * 0.5 - nod * 0.4 - 0.1 * stum + br, -yaw * 0.75, trunkRoll * 0.5 + V.slouch * 0.5);
  p[n + 1] -= 0.03 * stum;
  posture(z, p);
  headLook(
    p,
    (G.head ?? st.headPitch) - 1.3 * G.nod * jlLag + 0.3 * stum + tw * 0.2 + (V.arms === 2 && st.reachArms ? 0.1 : 0),
    n1(t * 0.4, z.seed + 4) * 0.25 + tw * 0.3 + yaw * 0.4,
    z.tilt * st.headTilt - G.headRoll * latLag + tw * 0.15,
    G.neck || 0.2
  );
  R(p, JAW, -st.jaw * (0.5 + 0.5 * Math.abs(Math.sin(t * 1.7))) - 0.08 * jl, 0, 0);
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    const reach = st.reachArms && (V.arms === 2 || (V.arms === 1 && s === z.armSide));
    const ns = n1(t * 0.8, z.seed + 2 + s) * 0.08;
    if (reach) {
      // arm held out toward the prey, bouncing on each footfall
      arm(p, s, V.reach - 0.16 * jlLag - 0.05 * sg * lead + 0.3 * stum + ns, 0.1 + (st.armOut || 0), 0.2, 0.3 + 0.12 * jlLag, -0.15 + 0.2 * jlLag);
    } else {
      // dead weight: swings with the opposite leg, forearm trailing the upper arm (the elbow flops open and shut)
      const a1 = G.droop + G.armSwing * -sg * leadLag + ns, a2 = G.droop + G.armSwing * -sg * leadLag2 + ns;
      const flop = Math.max(0, a2 - a1);
      arm(p, s, a1 + 0.6 * stum, 0.1 + (st.armOut || 0) - 0.05 * sg * latLag, 0.3, G.elbow + 1.4 * flop + 0.1 * jlLag, 0.3 + 0.5 * flop);
    }
  }
  if (st.twitchy) {
    A(p, UARM_L, tw * 0.4, 0, tw * 0.25);
    A(p, CHEST, 0, tw * 0.1, 0);
  }
}

/** Ankle position (forward, up) of a foot pitched ph (+ toe up) whose flat position is `flat`: pivots on the heel or the ball. */
const _an = { f: 0, y: 0 };
function pivotAnkle(flat, ph, a) {
  const c = Math.cos(ph), s = Math.sin(ph);
  if (ph > 0) {
    _an.f = flat - FOOT_HEEL + FOOT_HEEL * c - a * s;
    _an.y = FOOT_HEEL * s + a * c;
  } else {
    _an.f = flat + FOOT_BALL - FOOT_BALL * c - a * s;
    _an.y = -FOOT_BALL * s + a * c;
  }
  return _an;
}
const _foot = { f: 0, y: 0, ph: 0, flat: 0 };
/** Planned ankle (forward of the stance center, height) and world pitch of leg i this frame. */
function planFoot(k, i, a) {
  const G = k.G, D = k.D[i], x = k.x[i], len = k.len;
  const fL = G.bias + D * len * 0.5, fO = G.bias - D * len * 0.5;
  if (x < D) {
    const s = x / D;
    const ph = s < G.rollIn ? G.strike * (1 - smooth(s / G.rollIn)) : s > G.heelOff ? G.toeOff * Math.pow((s - G.heelOff) / (1 - G.heelOff), 1.6) : 0;
    const q = pivotAnkle(fL - x * len, ph, a);
    _foot.f = q.f;
    _foot.y = q.y;
    _foot.ph = ph;
    _foot.flat = fL - x * len; // where the foot sits on the ground (the ankle rolls around it)
    return _foot;
  }
  const w = k.w[i];
  const q0 = pivotAnkle(fO, G.toeOff, a), f0 = q0.f, y0 = q0.y;
  const q1 = pivotAnkle(fL, G.strike, a), f1 = q1.f, y1 = q1.y;
  // Hermite: leaves and lands moving back at ground speed (world-still), so lift-off and touchdown don't snap
  const v = -len * (1 - D) * G.vt;
  const w2 = w * w, w3 = w2 * w;
  const f = (2 * w3 - 3 * w2 + 1) * f0 + (w3 - 2 * w2 + w) * v + (3 * w2 - 2 * w3) * f1 + (w3 - w2) * v;
  let ph = G.toeOff + (G.strike - G.toeOff) * smooth(w * (G.pitchRate || 1));
  ph = lerp(ph, -0.5, k.drag[i] * Math.sin(PI * w)); // foot drop: the dragged foot hangs toe-down
  let y = y0 + (y1 - y0) * w + k.lift[i] * Math.sin(PI * Math.pow(w, G.liftPow || 1));
  // never through the ground: toe and heel stay above it (a dragged toe scrapes along)
  const c = Math.cos(ph), sn = Math.sin(ph);
  y = Math.max(y, a * c - FOOT_TOE * sn, a * c + FOOT_HEEL * sn);
  _foot.f = f;
  _foot.y = y;
  _foot.ph = ph;
  return _foot;
}

const _ft = { x: [0, 0], y: [0, 0], f: [0, 0], z: [0, 0], ph: [0, 0], flat: [0, 0] };

// How far (rig m) a pinned foot may end up from the gait plan before it gets dragged along: forward/back, sideways.
const PIN_F = 0.22, PIN_X = 0.1;
/**
 * World-space foot pinning: a stance foot stays on the spot where it touched down, even when the body's actual
 * motion (interpolated network movement, crowd shoves, turning, a speed estimate that lags) differs from what the
 * gait planned. At lift-off the leftover offset fades out over the swing, so the next step lands on plan again.
 * Needs the instance's world placement (wx, wz, wyaw, wScale); culled frames re-pin.
 */
function pinFeet(z, k) {
  const L = z.pin || (z.pin = { on: [false, false], x: [0, 0], z: [0, 0], ex: [0, 0], ef: [0, 0], t: -1 });
  const s = z.wScale, c = Math.cos(z.wyaw), sn = Math.sin(z.wyaw), cz = z.gcz;
  const fresh = z.time - L.t < 0.12;
  L.t = z.time;
  for (let i = 0; i < 2; i++) {
    if (!k.stance[i]) {
      L.on[i] = false;
      if (!fresh) L.ex[i] = L.ef[i] = 0;
      const f = 1 - smooth(k.w[i]);
      _ft.x[i] += L.ex[i] * f;
      _ft.f[i] += L.ef[i] * f;
      continue;
    }
    const px = _ft.x[i], pz = cz - _ft.flat[i]; // planned ground spot, rig space
    if (!L.on[i] || !fresh) {
      if (fresh) z.footfalls++;
      L.on[i] = true;
      L.x[i] = z.wx + (px * c + pz * sn) * s;
      L.z[i] = z.wz + (pz * c - px * sn) * s;
    }
    const dx = L.x[i] - z.wx, dz = L.z[i] - z.wz;
    let ex = (dx * c - dz * sn) / s - px, ez = (dx * sn + dz * c) / s - pz;
    const e = Math.hypot(ex / PIN_X, ez / PIN_F);
    if (e > 1) {
      // shoved too far off plan: the foot slides (drag the pin along)
      ex /= e;
      ez /= e;
      const lx = px + ex, lz = pz + ez;
      L.x[i] = z.wx + (lx * c + lz * sn) * s;
      L.z[i] = z.wz + (lz * c - lx * sn) * s;
    }
    L.ex[i] = ex;
    L.ef[i] = -ez;
    _ft.x[i] += ex;
    _ft.f[i] -= ez;
  }
}
/** Pelvis height + two-bone leg IK onto the planned feet. Runs after the upper body and the head shift are final. */
export function solveLegs(z, p) {
  const k = z.gk, G = k.G, P = z.P, n = z.nb * 4;
  const L1 = P.thighLen, L2 = P.shinLen, a = P.ankleY;
  // feet are planned around a low-passed copy of the hips' z, so a changing head shift can't drag planted feet along
  const rz = p[n + 2];
  if (z.gcz === undefined || Math.abs(rz - z.gcz) > 0.3) z.gcz = rz;
  else z.gcz += (rz - z.gcz) * 0.08;
  const cz = z.gcz;
  for (let i = 0; i < 2; i++) {
    const q = planFoot(k, i, a);
    _ft.f[i] = q.f;
    _ft.y[i] = q.y;
    _ft.ph[i] = q.ph;
    _ft.flat[i] = q.flat;
    _ft.x[i] = (i ? 1 : -1) * (P.hipW + G.width + (k.stance[i] ? 0 : k.circ[i] * Math.sin(PI * k.w[i])));
  }
  if (z.wScale) pinFeet(z, k);
  // pelvis height: as high as the legs reach at touchdown / lift-off (they are longest-spread there), plus the
  // vault over a walking stance leg or the dip-and-bound of a running one
  const Lr = (L1 + L2) * G.ext, wd = G.width;
  const reach = (f, y) => y + Math.sqrt(Math.max(0.01, Lr * Lr - f * f - wd * wd)) + 0.03;
  let hTD = 9, hTO = 9;
  for (let i = 0; i < 2; i++) {
    const D = k.D[i];
    const q1 = pivotAnkle(G.bias + D * k.len * 0.5, G.strike, a);
    hTD = Math.min(hTD, reach(q1.f, q1.y));
    const q0 = pivotAnkle(G.bias - D * k.len * 0.5, G.toeOff, a);
    hTO = Math.min(hTO, reach(q0.f, q0.y));
  }
  let hy;
  const s0 = k.stance[0], s1 = k.stance[1];
  if (G.sprint) {
    if (s0 || s1) {
      let m = 9;
      for (let i = 0; i < 2; i++) {
        if (!k.stance[i]) continue;
        const s = k.x[i] / k.D[i];
        m = Math.min(m, lerp(hTD, hTO, s) - G.comp * Math.sin(PI * s));
      }
      hy = m;
    } else {
      // airborne: from the last lift-off to the next touchdown
      const i = k.x[0] - k.D[0] < k.x[1] - k.D[1] ? 0 : 1, j = 1 - i;
      const tau = k.x[i] - k.D[i], f = tau / Math.max(1e-4, tau + 1 - k.x[j]);
      hy = lerp(hTO, hTD, f) + G.flight * Math.sin(PI * f);
    }
  } else {
    hy = Math.min(hTD, hTO);
    if (s0 !== s1) {
      const i = s0 ? 0 : 1, j = 1 - i;
      const tau = k.x[j] - k.D[j], f = tau / Math.max(1e-4, tau + 1 - k.x[j]);
      const mid = reach(pivotAnkle(G.bias, 0, a).f, a);
      hy += (k.bob[i] + k.vault[i] * Math.max(0, mid - hy)) * Math.sin(PI * f);
    }
  }
  p[n + 1] += hy - P.hipY;
  for (let i = 0; i < 2; i++) _ft.z[i] = cz - _ft.f[i];
  keepReach(z, p, _ft, k.stance);
  legsIK(z, p, _ft);
}

/**
 * Lowers the pelvis until every planted ankle target T (rig x, y, z) is within reach. The drop is eased (quick to
 * sink, slower to rise) so a foot landing out of reach or lifting off doesn't make the hips jump in one frame;
 * meanwhile the IK leaves that foot a little short of its target.
 */
function keepReach(z, p, T, planted) {
  const P = z.P, n = z.nb * 4, maxR = (P.thighLen + P.shinLen) * 0.999;
  const hx = p[HIPS * 4], hyw = p[HIPS * 4 + 1], hz = p[HIPS * 4 + 2];
  let need = 0;
  for (let i = 0; i < 2; i++) {
    if (!planted[i]) continue;
    rotVec.x = (i ? 1 : -1) * P.hipW;
    rotVec.y = -0.03;
    rotVec.z = 0;
    const o = rotXYZ(hx, hyw, hz, false);
    const dx = T.x[i] - (p[n] + o.x), dz = T.z[i] - (p[n + 2] + o.z);
    const top = T.y[i] + Math.sqrt(Math.max(0, maxR * maxR - dx * dx - dz * dz));
    need = Math.max(need, p[n + 1] + P.hipY + o.y - top);
  }
  if (!z.wScale) {
    p[n + 1] -= need; // posed in place (calibration, treadmill): exact
    return;
  }
  const dt = clamp(z.time - (z.dropT ?? z.time), 0, 0.1);
  z.dropT = z.time;
  const d0 = z.drop || 0;
  z.drop = d0 + (need - d0) * Math.min(1, dt * (need > d0 ? 30 : 10));
  p[n + 1] -= z.drop;
}

/** Two-bone IK of both legs onto ankle targets T (rig x, y, z) with the feet at world pitch T.ph. */
function legsIK(z, p, T) {
  const P = z.P, n = z.nb * 4, L1 = P.thighLen, L2 = P.shinLen;
  const hx = p[HIPS * 4], hyw = p[HIPS * 4 + 1], hz = p[HIPS * 4 + 2];
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, th = i ? THIGH_R : THIGH_L;
    rotVec.x = sg * P.hipW;
    rotVec.y = -0.03;
    rotVec.z = 0;
    const o = rotXYZ(hx, hyw, hz, false), ox = o.x, oy = o.y, oz = o.z; // o is the shared scratch vector
    rotVec.x = T.x[i] - (p[n] + ox);
    rotVec.y = T.y[i] - (p[n + 1] + P.hipY + oy);
    rotVec.z = T.z[i] - (p[n + 2] + oz);
    const v = rotXYZ(hx, hyw, hz, true); // hip -> ankle in the hips' frame
    let d = Math.hypot(v.x, v.y, v.z);
    d = clamp(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.9995);
    const ck = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
    const kn = -Math.acos(ck);
    const Y = L1 + L2 * ck, Zk = L2 * Math.sin(kn);
    const splay = Math.asin(clamp(v.x / Y, -0.9, 0.9));
    let pitch = Math.atan2(v.z, v.y) - Math.atan2(-Zk, -Y * Math.cos(splay));
    if (pitch > PI) pitch -= TAU;
    else if (pitch < -PI) pitch += TAU;
    R(p, th, pitch, 0, splay);
    R(p, th + 1, kn, 0, 0);
    R(p, th + 2, T.ph[i] - (hx + pitch + kn), 0, -(splay + hz));
  }
}

// Standing still (idle, braced attack, menace): the feet stay planted in the world while the hips sway, and the legs
// are re-solved onto them. Turning on the spot or being shoved off the stance makes it shuffle a foot back under it.
const STEP_T = 0.3, STEP_LIFT = 0.07, STEP_X = 0.09, STEP_F = 0.14;
const _st = { x: [0, 0], y: [0, 0], z: [0, 0], ph: [0, 0], planted: [true, true] };
export function plantStatic(z, p) {
  const P = z.P, n = z.nb * 4, L1 = P.thighLen, L2 = P.shinLen;
  const S = z.stand || (z.stand = { x: [0, 0], z: [0, 0], sx: [0, 0], sz: [0, 0], u: [-1, -1], t: -1 });
  const s = z.wScale, c = Math.cos(z.wyaw), sn = Math.sin(z.wyaw);
  const fresh = z.time - S.t < 0.12, dt = fresh ? z.time - S.t : 0;
  S.t = z.time;
  const rz = p[n + 2];
  if (z.gcz === undefined || Math.abs(rz - z.gcz) > 0.3) z.gcz = rz;
  else z.gcz += (rz - z.gcz) * 0.08;
  for (let i = 0; i < 2; i++) {
    // where the static pose puts this ankle under a still pelvis (thigh + shin FK), in the world
    const th = i ? THIGH_R : THIGH_L, kn = p[(th + 1) * 4];
    rotVec.x = 0;
    rotVec.y = -L1 - L2 * Math.cos(kn);
    rotVec.z = -L2 * Math.sin(kn);
    const q = rotXYZ(p[th * 4], p[th * 4 + 1], p[th * 4 + 2], false);
    const rx = (i ? 1 : -1) * P.hipW + q.x, rzr = z.gcz + q.z;
    const wx = z.wx + (rx * c + rzr * sn) * s, wz = z.wz + (rzr * c - rx * sn) * s;
    if (!fresh) {
      S.x[i] = wx;
      S.z[i] = wz;
      S.u[i] = -1;
    }
    let px = S.x[i], pz = S.z[i], lift = 0;
    if (S.u[i] >= 0) {
      S.u[i] = Math.min(1, S.u[i] + dt / STEP_T);
      const e = smooth(S.u[i]);
      px = S.sx[i] + (wx - S.sx[i]) * e;
      pz = S.sz[i] + (wz - S.sz[i]) * e;
      lift = STEP_LIFT * Math.sin(PI * S.u[i]);
      if (S.u[i] >= 1) {
        S.u[i] = -1;
        S.x[i] = wx;
        S.z[i] = wz;
      }
    } else {
      const ex = ((px - wx) * c - (pz - wz) * sn) / s, ez = ((px - wx) * sn + (pz - wz) * c) / s;
      const e = Math.hypot(ex / STEP_X, ez / STEP_F);
      if (e > 2.5) {
        // shoved well off it before a step could fix it: the foot slides
        px = wx + (px - wx) * (2.5 / e);
        pz = wz + (pz - wz) * (2.5 / e);
        S.x[i] = px;
        S.z[i] = pz;
      }
      if (e > 1 && S.u[1 - i] < 0) {
        S.u[i] = 0;
        S.sx[i] = px;
        S.sz[i] = pz;
      }
    }
    const dx = px - z.wx, dz = pz - z.wz;
    _st.x[i] = (dx * c - dz * sn) / s;
    _st.z[i] = (dx * sn + dz * c) / s;
    _st.y[i] = P.ankleY + lift;
    _st.ph[i] = 0;
    _st.planted[i] = S.u[i] < 0;
  }
  keepReach(z, p, _st, _st.planted);
  legsIK(z, p, _st);
}
