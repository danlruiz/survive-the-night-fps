// The interpolation every replicated entity is drawn through (entities.js): a ring of the last RING snapshots' samples
// of where it was, read back at the render time, which runs a little behind the newest snapshot.
import { SERVER_TICK_RATE } from '../../../shared/constants.js';

const RING = 10;
const TAU = Math.PI * 2;

function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class Samples {
  constructor() {
    this.buf = new Float64Array(RING * 6);
    this.n = 0;
    this.head = 0; // index of oldest
  }
  last() {
    if (!this.n) return -1;
    return (this.head + this.n - 1) % RING;
  }
  push(t, x, y, z, yaw, pitch) {
    const li = this.last();
    if (li >= 0) {
      const lt = this.buf[li * 6];
      if (t <= lt) {
        // same tick: overwrite
        const o = li * 6;
        this.buf[o + 1] = x;
        this.buf[o + 2] = y;
        this.buf[o + 3] = z;
        this.buf[o + 4] = yaw;
        this.buf[o + 5] = pitch;
        return;
      }
      // entity was idle (or LOD-skipped) for a while: insert a hold sample so it doesn't slide
      if (t - lt > 2) {
        const o = li * 6;
        this._raw(t - 2, this.buf[o + 1], this.buf[o + 2], this.buf[o + 3], this.buf[o + 4], this.buf[o + 5]);
      }
    }
    this._raw(t, x, y, z, yaw, pitch);
  }
  _raw(t, x, y, z, yaw, pitch) {
    let idx;
    if (this.n < RING) {
      idx = (this.head + this.n) % RING;
      this.n++;
    } else {
      idx = this.head;
      this.head = (this.head + 1) % RING;
    }
    const o = idx * 6;
    this.buf[o] = t;
    this.buf[o + 1] = x;
    this.buf[o + 2] = y;
    this.buf[o + 3] = z;
    this.buf[o + 4] = yaw;
    this.buf[o + 5] = pitch;
  }
  // writes interpolated state at time t into out {x,y,z,yaw,pitch}
  sample(t, out) {
    const b = this.buf;
    if (!this.n) return out;
    let prev = -1;
    for (let k = 0; k < this.n; k++) {
      const i = (this.head + k) % RING;
      if (b[i * 6] <= t) prev = i;
      else {
        if (prev < 0) {
          prev = i;
          break;
        }
        const p = prev * 6;
        const q = i * 6;
        const f = (t - b[p]) / Math.max(1e-6, b[q] - b[p]);
        out.x = b[p + 1] + (b[q + 1] - b[p + 1]) * f;
        out.y = b[p + 2] + (b[q + 2] - b[p + 2]) * f;
        out.z = b[p + 3] + (b[q + 3] - b[p + 3]) * f;
        out.yaw = lerpAngle(b[p + 4], b[q + 4], f);
        out.pitch = b[p + 5] + (b[q + 5] - b[p + 5]) * f;
        return out;
      }
    }
    const p = (prev < 0 ? this.last() : prev) * 6;
    out.x = b[p + 1];
    out.y = b[p + 2];
    out.z = b[p + 3];
    out.yaw = b[p + 4];
    out.pitch = b[p + 5];
    return out;
  }
  // Like sample(), but the position follows a cubic Hermite curve through the samples (Catmull-Rom
  // tangents, clamped per axis so it never overshoots a sample), so velocity doesn't kink at every
  // tick. Also writes that velocity (per tick) to out.vx/vy/vz. Past the newest sample it coasts along
  // the last segment for up to `coast` ticks (a late packet), then holds there.
  sampleSmooth(t, out, coast) {
    const b = this.buf;
    const n = this.n;
    out.vx = out.vy = out.vz = 0;
    if (!n) return out;
    let k = -1;
    for (let j = 0; j < n; j++) {
      if (b[((this.head + j) % RING) * 6] <= t) k = j;
      else break;
    }
    if (k < 0 || k === n - 1) {
      const p = ((this.head + Math.max(k, 0)) % RING) * 6;
      out.x = b[p + 1];
      out.y = b[p + 2];
      out.z = b[p + 3];
      out.yaw = b[p + 4];
      out.pitch = b[p + 5];
      if (k > 0 && coast > 0) {
        const q = ((this.head + k - 1) % RING) * 6;
        const span = b[p] - b[q];
        if (span <= 2) {
          const dt = Math.min(t - b[p], coast);
          const vx = (b[p + 1] - b[q + 1]) / span;
          const vy = (b[p + 2] - b[q + 2]) / span;
          const vz = (b[p + 3] - b[q + 3]) / span;
          out.x += vx * dt;
          out.y += vy * dt;
          out.z += vz * dt;
          if (t - b[p] < coast) {
            out.vx = vx;
            out.vy = vy;
            out.vz = vz;
          }
        }
      }
      return out;
    }
    const p = ((this.head + k) % RING) * 6;
    const q = ((this.head + k + 1) % RING) * 6;
    const pp = k > 0 ? ((this.head + k - 1) % RING) * 6 : -1;
    const qq = k + 2 < n ? ((this.head + k + 2) % RING) * 6 : -1;
    const t0 = b[p];
    const h = Math.max(1e-6, b[q] - t0);
    const s = (t - t0) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = 3 * s2 - 2 * s3;
    const h11 = s3 - s2;
    for (let a = 1; a <= 3; a++) {
      const P0 = b[p + a];
      const P1 = b[q + a];
      const d = (P1 - P0) / h;
      let m0 = d;
      let m1 = d;
      if (Math.abs(d) < 1e-7) m0 = m1 = 0;
      else {
        if (pp >= 0) m0 = (P1 - b[pp + a]) / (b[q] - b[pp]);
        if (qq >= 0) m1 = (b[qq + a] - P0) / (b[qq] - t0);
        m0 = d > 0 ? clampRange(m0, 0, 3 * d) : clampRange(m0, 3 * d, 0);
        m1 = d > 0 ? clampRange(m1, 0, 3 * d) : clampRange(m1, 3 * d, 0);
      }
      const v = h00 * P0 + h10 * h * m0 + h01 * P1 + h11 * h * m1;
      const dv = ((6 * s2 - 6 * s) * (P0 - P1)) / h + (3 * s2 - 4 * s + 1) * m0 + (3 * s2 - 2 * s) * m1;
      if (a === 1) {
        out.x = v;
        out.vx = dv;
      } else if (a === 2) {
        out.y = v;
        out.vy = dv;
      } else {
        out.z = v;
        out.vz = dv;
      }
    }
    out.yaw = lerpAngle(b[p + 4], b[q + 4], s);
    out.pitch = b[p + 5] + (b[q + 5] - b[p + 5]) * s;
    return out;
  }
  lastTick() {
    const li = this.last();
    return li < 0 ? -Infinity : this.buf[li * 6];
  }
}

function clampRange(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}

// A body that walks the world - a zombie, a deer - is drawn along a smooth path through its samples (sampleSmooth),
// with the velocity it is drawn moving at (m/s), and a correction offset that fades (see followPath)
export function initPath(e) {
  e.vx = e.vy = e.vz = 0; // rendered velocity (m/s) and fading correction offset
  e.ex = e.ey = e.ez = 0;
  e.sx = e.rx; // where its path was sampled last frame (the drawn position is this + the offset)
  e.sy = e.ry;
  e.sz = e.rz;
}

// Once a frame: where it is drawn (e.rx/ry/rz, e.ryaw), how fast it goes (e.speed, eased) and its velocity, from its
// samples at the render time. tmp: scratch { x, y, z, yaw, pitch, vx, vy, vz }
export function followPath(e, renderTick, latestTick, dt, tmp) {
  // coast through a late packet only if it was still moving in the newest snapshot
  // (one that is missing from a snapshot that did arrive simply didn't move)
  e.samples.sampleSmooth(renderTick, tmp, e.samples.lastTick() >= latestTick - 1 ? 2 : 0);
  const sp = Math.hypot(tmp.vx, tmp.vz) * SERVER_TICK_RATE;
  e.speed += (Math.min(sp, 14) - e.speed) * Math.min(1, dt * 6);
  // when a late packet makes the sampled path jump, carry the jump as an offset that fades out: the body
  // glides onto the corrected path instead of popping (a real teleport still snaps). The jump is measured
  // on the path itself, not on the drawn position: there the offset's own fading reads as a jump and gets
  // put straight back, and the body stays beside its hitbox for good
  const fade = Math.exp(-dt * 8);
  e.ex *= fade;
  e.ey *= fade;
  e.ez *= fade;
  const jx = tmp.x - (e.sx + e.vx * dt);
  const jy = tmp.y - (e.sy + e.vy * dt);
  const jz = tmp.z - (e.sz + e.vz * dt);
  e.sx = tmp.x;
  e.sy = tmp.y;
  e.sz = tmp.z;
  const jump = Math.hypot(jx, jy, jz);
  if (jump > 3) e.ex = e.ey = e.ez = 0;
  else if (jump > 0.02 + 40 * dt * dt) {
    e.ex -= jx;
    e.ey -= jy;
    e.ez -= jz;
  }
  e.vx = tmp.vx * SERVER_TICK_RATE;
  e.vy = tmp.vy * SERVER_TICK_RATE;
  e.vz = tmp.vz * SERVER_TICK_RATE;
  e.rx = tmp.x + e.ex;
  e.ry = tmp.y + e.ey;
  e.rz = tmp.z + e.ez;
  // ease the facing toward the (8-bit, 20 Hz) server yaw so turns don't step
  e.ryaw += wrapAngle(tmp.yaw - e.ryaw) * Math.min(1, dt * 12);
}
