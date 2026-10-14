// The city's soup (citykit.js): what it builds, written straight into one list of triangles a material and a tier.
import { cityUV } from '../textures.js';
import { VERTEX_COLOR_MATERIALS } from '../materials.js';
import { PI, WHITE, hash } from './kit.js';

// ------------------------------------------------------------------ the soup
// Triangles gathered per material and tier, in world space, handed to the static world as one piece each.
export class Soup {
  constructor() {
    this.lists = new Map();
    this.frame(0, 0, 0, 0);
  }
  // where what follows stands: origin (world), yaw (a Builder's ry)
  // tilt: tipped about its own z as well, its +x end up (a length of tower lying not quite level)
  frame(ox, oy, oz, ry, tilt = 0) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.c = Math.cos(ry);
    this.s = Math.sin(ry);
    this.tc = Math.cos(tilt);
    this.ts = Math.sin(tilt);
  }
  list(mat, tier) {
    const key = mat + '|' + tier;
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = { mat, tier, pos: [], nrm: [], uv: [], col: VERTEX_COLOR_MATERIALS.has(mat) ? [] : null }));
    return l;
  }
  // a direction of the frame, in the world (a normal given by hand: tri's nrm)
  dir(x, y, z) {
    return [this.c * x + this.s * z, y, -this.s * x + this.c * z];
  }
  // a triangle of the frame's points [x, y, z], counter-clockwise from outside. col: one colour, or one for each
  // corner (light falling off across a wall)
  tri(mat, tier, a, b, c, ua, ub, uc, col = WHITE, nrm = null) {
    const l = this.list(mat, tier);
    const { ox, oy, oz, c: cs, s: sn, tc, ts } = this;
    if (ts) [a, b, c] = [a, b, c].map((q) => [q[0] * tc - q[1] * ts, q[0] * ts + q[1] * tc, q[2]]);
    const ax = ox + cs * a[0] + sn * a[2], ay = oy + a[1], az = oz - sn * a[0] + cs * a[2];
    const bx = ox + cs * b[0] + sn * b[2], by = oy + b[1], bz = oz - sn * b[0] + cs * b[2];
    const cx = ox + cs * c[0] + sn * c[2], cy = oy + c[1], cz = oz - sn * c[0] + cs * c[2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    if (nrm) [nx, ny, nz] = nrm;
    l.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    l.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    l.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    if (!l.col) return;
    if (typeof col[0] === 'number') l.col.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    else l.col.push(col[0][0], col[0][1], col[0][2], col[1][0], col[1][1], col[1][2], col[2][0], col[2][1], col[2][2]);
  }
  // a quad of four points round its edge, counter-clockwise from outside; uv: four pairs, or null for metres laid
  // along its first edge and up its last
  quad(mat, tier, p0, p1, p2, p3, uv = null, col = WHITE, nrm = null) {
    if (!uv) {
      const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      const u0 = hash(p0[0] * 31, p0[1] * 17, p0[2] * 13) * 3;
      uv = [[u0, 0], [u0 + w, 0], [u0 + w, h], [u0, h]];
    }
    const each = typeof col[0] !== 'number'; // (a colour for each corner)
    this.tri(mat, tier, p0, p1, p2, uv[0], uv[1], uv[2], each ? [col[0], col[1], col[2]] : col, nrm);
    this.tri(mat, tier, p0, p2, p3, uv[0], uv[2], uv[3], each ? [col[0], col[2], col[3]] : col, nrm);
  }
  // ...seen from both sides
  quad2(mat, tier, p0, p1, p2, p3, uv = null, col = WHITE) {
    this.quad(mat, tier, p0, p1, p2, p3, uv, col);
    this.quad(mat, tier, p1, p0, p3, p2, uv, col);
  }
  // a quad of the city's atlas: cell, the name of one (textures.js CITY_ATLAS)
  cell(mat, tier, name, p0, p1, p2, p3, flip = false) {
    const a = cityUV(name);
    const [u0, u1] = flip ? [a.u1, a.u0] : [a.u0, a.u1];
    this.quad(mat, tier, p0, p1, p2, p3, [[u0, a.v0], [u1, a.v0], [u1, a.v1], [u0, a.v1]]);
  }
  // a box: its middle, its size, turned by yaw about y, then tipped (rx, rz) - metres on every face. skip: a mask of
  // faces left out (1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z)
  box(mat, tier, cx, cy, cz, sx, sy, sz, o = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cy_ = Math.cos(o.ry || 0), sy_ = Math.sin(o.ry || 0);
    const cxr = Math.cos(o.rx || 0), sxr = Math.sin(o.rx || 0);
    const czr = Math.cos(o.rz || 0), szr = Math.sin(o.rz || 0);
    // (as three's Euler 'XYZ' on a part: about z, then y, then x - the order world parts are turned in)
    const P = (x, y, z) => {
      let x1 = x * czr - y * szr, y1 = x * szr + y * czr, z1 = z;
      const x2 = x1 * cy_ + z1 * sy_, z2 = -x1 * sy_ + z1 * cy_;
      x1 = x2;
      z1 = z2;
      const y3 = y1 * cxr - z1 * sxr, z3 = y1 * sxr + z1 * cxr;
      return [cx + x1, cy + y3, cz + z3];
    };
    const skip = o.skip || 0;
    const col = o.c || WHITE;
    const u0 = o.u0 ?? hash(cx * 7, cy * 11, cz * 13) * 4;
    const face = (bit, a, b, c, d, w, h) => {
      if (skip & bit) return;
      this.quad(mat, tier, a, b, c, d, [[u0, cy - hy], [u0 + w, cy - hy], [u0 + w, cy - hy + h], [u0, cy - hy + h]], col);
    };
    face(1, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), sz, sy);
    face(2, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), sz, sy);
    face(4, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), sx, sz);
    face(8, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), sx, sz);
    face(16, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), sx, sy);
    face(32, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), sx, sy);
  }
  // a bar from a to b, square, `t` across (a pipe, a rail, a length of rebar)
  bar(mat, tier, a, b, t, col = WHITE, sides = 4) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    // two axes across it
    let ux = dz, uy = 0, uz = -dx;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-5) {
      ux = 1;
      uz = 0;
      ul = 1;
    }
    ux /= ul;
    uz /= ul;
    const vx = (dy * uz - dz * uy) / len, vy = (dz * ux - dx * uz) / len, vz = (dx * uy - dy * ux) / len;
    const r = t / 2;
    const ring = (p) => {
      const out = [];
      for (let k = 0; k < sides; k++) {
        const an = (k / sides) * PI * 2 + PI / 4;
        const cu = Math.cos(an) * r, sv = Math.sin(an) * r;
        out.push([p[0] + ux * cu + vx * sv, p[1] + uy * cu + vy * sv, p[2] + uz * cu + vz * sv]);
      }
      return out;
    };
    const A = ring(a), B = ring(b);
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides;
      this.quad(mat, tier, A[k], A[n], B[n], B[k], [[0, 0], [t, 0], [t, len], [0, len]], col);
    }
  }
  // a cylinder standing on (cx, y0, cz): radius, height, sides; cap: its top closed
  cyl(mat, tier, cx, y0, cz, r, h, sides = 10, cap = true, col = WHITE, rTop = r) {
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * PI * 2, a1 = ((k + 1) / sides) * PI * 2;
      const p0 = [cx + Math.cos(a0) * r, y0, cz - Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz - Math.sin(a1) * r];
      const q0 = [cx + Math.cos(a0) * rTop, y0 + h, cz - Math.sin(a0) * rTop], q1 = [cx + Math.cos(a1) * rTop, y0 + h, cz - Math.sin(a1) * rTop];
      const u0 = a0 * r, u1 = a1 * r;
      this.quad(mat, tier, p0, p1, q1, q0, [[u0, y0], [u1, y0], [u1, y0 + h], [u0, y0 + h]], col);
      if (cap && rTop > 0.01) this.tri(mat, tier, [cx, y0 + h, cz], q0, q1, [0, 0], [q0[0] - cx, q0[2] - cz], [q1[0] - cx, q1[2] - cz], col);
    }
  }
  flush(add, x, z) {
    for (const l of this.lists.values()) {
      const n = l.pos.length / 3;
      if (!n) continue;
      const pos = new Float32Array(l.pos);
      let r = 0;
      for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i] - x, pos[i + 2] - z));
      add(x, z, l.mat, { count: n, pos, nrm: new Float32Array(l.nrm), uv: new Float32Array(l.uv), col: l.col ? new Float32Array(l.col) : null, radius: Math.max(r, 12) }, l.tier);
    }
    this.lists.clear();
  }
}
