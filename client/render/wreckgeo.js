// The geometry of a prop taken out of the static world (render/wrecks.js): its triangles sorted into the solid
// pieces the model was built from ("islands": a bumper, a pane, a wheel), panels cut finer so that a dent has
// something to bend, a ray against the triangles themselves. No three.js scene here: typed arrays in, typed arrays
// out, so scripts/test-wrecks.js can hold it.
import { NO_STRIKE } from '../../shared/surfaces.js';

// ---------------------------------------------------------------- finer panels
// The materials a blow dents: painted and bare sheet metal.
export const PANEL = new Set(['carpaint', 'paint', 'aircraft', 'olive', 'tin', 'tin_rust', 'rust', 'metal', 'flat']);

/**
 * A piece's triangles of the PANEL materials cut until no edge is longer than `edge`: every edge longer than that is
 * halved, whichever triangle it belongs to, so the two sides of a shared edge are cut alike and no crack opens.
 * piece: { count, pos, nrm, uv, col, ground, tint, names: [{ name, first, count }] } (StaticWorld.pieces); changed in
 * place. max: no more than this many vertices come of one piece.
 */
export function refine(piece, edge, max = 60000) {
  const ranges = piece.names.filter((n) => PANEL.has(n.name));
  if (!ranges.length) return;
  const e2 = edge * edge;
  const chans = CHANS.filter(([k]) => piece[k]);
  // a vertex is a row of its channels' values (pos first), side by side: S numbers
  const S = chans.reduce((s, [, w]) => s + w, 0);
  let out = new Float32Array(Math.max(1024, piece.count * S * 2));
  let n = 0;
  const names = [];
  const read = (i) => {
    const v = new Array(S);
    let o = 0;
    for (const [k, w] of chans) for (let j = 0, a = piece[k]; j < w; j++) v[o++] = a[i * w + j];
    return v;
  };
  const mid = (a, b) => {
    const m = new Array(S);
    for (let j = 0; j < S; j++) m[j] = (a[j] + b[j]) / 2;
    return m;
  };
  const emit = (v) => {
    if ((n + 1) * S > out.length) {
      const big = new Float32Array(out.length * 2);
      big.set(out);
      out = big;
    }
    out.set(v, n * S);
    n++;
  };
  const len2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const tri = (a, b, c, depth) => {
    const ab = len2(a, b) > e2, bc = len2(b, c) > e2, ca = len2(c, a) > e2;
    if (depth > 7 || n > max || !(ab || bc || ca)) {
      emit(a);
      emit(b);
      emit(c);
      return;
    }
    const mab = ab && mid(a, b), mbc = bc && mid(b, c), mca = ca && mid(c, a);
    if (ab && bc && ca) {
      tri(a, mab, mca, depth + 1);
      tri(mab, b, mbc, depth + 1);
      tri(mca, mbc, c, depth + 1);
      tri(mab, mbc, mca, depth + 1);
    } else if (ab && bc) {
      tri(mab, b, mbc, depth + 1);
      tri(a, mab, mbc, depth + 1);
      tri(a, mbc, c, depth + 1);
    } else if (bc && ca) {
      tri(mbc, c, mca, depth + 1);
      tri(a, b, mbc, depth + 1);
      tri(a, mbc, mca, depth + 1);
    } else if (ca && ab) {
      tri(a, mab, mca, depth + 1);
      tri(mab, b, c, depth + 1);
      tri(mab, c, mca, depth + 1);
    } else if (ab) {
      tri(a, mab, c, depth + 1);
      tri(mab, b, c, depth + 1);
    } else if (bc) {
      tri(a, b, mbc, depth + 1);
      tri(a, mbc, c, depth + 1);
    } else {
      tri(a, b, mca, depth + 1);
      tri(mca, b, c, depth + 1);
    }
  };
  for (const r of piece.names) {
    const first = n;
    if (!PANEL.has(r.name)) for (let i = r.first; i < r.first + r.count; i++) emit(read(i));
    else for (let i = r.first; i < r.first + r.count; i += 3) tri(read(i), read(i + 1), read(i + 2), 0);
    names.push({ name: r.name, first, count: n - first });
  }
  // the rows back into one array a channel
  let at = 0;
  for (const [k, w] of chans) {
    const a = (piece[k] = new Float32Array(n * w));
    for (let v = 0, o = at; v < n; v++, o += S) for (let j = 0; j < w; j++) a[v * w + j] = out[o + j];
    at += w;
  }
  // (cut edges leave their halves' normals a little short)
  const N = piece.nrm;
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l;
    N[i + 1] /= l;
    N[i + 2] /= l;
  }
  piece.count = n;
  piece.names = names;
}
const CHANS = [['pos', 3], ['nrm', 3], ['uv', 2], ['col', 3], ['ground', 1], ['tint', 3]];

// ---------------------------------------------------------------- islands
/**
 * The solid pieces a prop's triangles fall into: triangles of one material that share a corner belong together.
 * pieces: StaticWorld.pieces (in the world); inv(x, y, z, out): a point into the prop's own frame.
 * Returns [{ piece (index), name (the model's material), verts (Uint32Array: its vertices in that piece),
 * min, max, mid ([x, y, z] in the prop's frame), size (its box's diagonal) }], biggest first.
 */
export function islands(pieces, inv) {
  const out = [];
  const p3 = [0, 0, 0];
  pieces.forEach((piece, pi) => {
    for (const r of piece.names) {
      const n = r.count;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;
      const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
      };
      // (corners within 2 mm are one: a position to the 1/500 m, as one number within the run's own box)
      const P = piece.pos;
      const q = new Int32Array(n * 3);
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < n * 3; i += 3) {
        const o = r.first * 3 + i;
        const x = (q[i] = Math.round(P[o] * 500)), y = (q[i + 1] = Math.round(P[o + 1] * 500)), z = (q[i + 2] = Math.round(P[o + 2] * 500));
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      const ny = y1 - y0 + 1, nz = z1 - z0 + 1;
      const at = new Map();
      for (let i = 0; i < n; i++) {
        const key = ((q[i * 3] - x0) * ny + (q[i * 3 + 1] - y0)) * nz + (q[i * 3 + 2] - z0);
        const j = at.get(key);
        if (j === undefined) at.set(key, i);
        else parent[find(i)] = find(j);
      }
      for (let i = 0; i < n; i += 3) {
        parent[find(i + 1)] = find(i);
        parent[find(i + 2)] = find(i);
      }
      const groups = new Map();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        let g = groups.get(root);
        if (!g) groups.set(root, (g = []));
        g.push(r.first + i);
      }
      for (const verts of groups.values()) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const v of verts) {
          inv(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], p3);
          for (let c = 0; c < 3; c++) {
            if (p3[c] < min[c]) min[c] = p3[c];
            if (p3[c] > max[c]) max[c] = p3[c];
          }
        }
        out.push({ piece: pi, name: r.name, verts: Uint32Array.from(verts), min, max, mid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], size: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) });
      }
    }
  });
  out.sort((a, b) => b.size - a.size || a.piece - b.piece || a.verts[0] - b.verts[0]);
  return out;
}

// how far a point (in the prop's frame) is from an island's box (0 inside it)
export function boxDist(is, x, y, z) {
  const dx = Math.max(is.min[0] - x, 0, x - is.max[0]);
  const dy = Math.max(is.min[1] - y, 0, y - is.max[1]);
  const dz = Math.max(is.min[2] - z, 0, z - is.max[2]);
  return Math.hypot(dx, dy, dz);
}

// ---------------------------------------------------------------- a ray against the triangles
/**
 * The nearest triangle of `pieces` a ray from o along d (unit) strikes within maxT: out = { t, piece, vert (the
 * triangle's first vertex), nx, ny, nz (its normal, turned to face the ray) }, t -1 for none. pos(piece): the
 * positions to test (the shape as it is now). Triangles of what is no surface (grass cards) and collapsed ones
 * are passed through.
 */
export function rayPieces(pieces, pos, ox, oy, oz, dx, dy, dz, maxT, out, only = null, okTri = null) {
  out.t = -1;
  let best = maxT;
  for (let pi = 0; pi < pieces.length; pi++) {
    const piece = pieces[pi];
    const P = pos(pi);
    for (const r of piece.names) {
      // (only: just the materials of that set - what lies behind a panel)
      if (only ? !only.has(r.name) : NO_STRIKE.has(r.name)) continue;
      for (let v = r.first, end = r.first + r.count; v < end; v += 3) {
        const o = v * 3;
        const ax = P[o], ay = P[o + 1], az = P[o + 2];
        const e1x = P[o + 3] - ax, e1y = P[o + 4] - ay, e1z = P[o + 5] - az;
        const e2x = P[o + 6] - ax, e2y = P[o + 7] - ay, e2z = P[o + 8] - az;
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det;
        const tx = ox - ax, ty = oy - ay, tz = oz - az;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const w = (dx * qx + dy * qy + dz * qz) * inv;
        if (w < 0 || u + w > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t < 0 || t >= best || (okTri && !okTri(pi, v))) continue;
        best = t;
        out.t = t;
        out.piece = pi;
        out.vert = v;
        out.name = r.name;
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const l = Math.hypot(nx, ny, nz) || 1;
        const s = nx * dx + ny * dy + nz * dz > 0 ? -1 / l : 1 / l;
        out.nx = nx * s;
        out.ny = ny * s;
        out.nz = nz * s;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- a dent
/**
 * Pushes the PANEL vertices of `pieces` within `radius` of p in along d by up to `depth`. pos (piece): the positions
 * to bend (nrm: not used, see below). ok(piece, vertex): may this vertex be bent (not a part
 * that has come off). room: see below. Returns how many moved.
 */
export function dent(pieces, pos, nrm, ok, px, py, pz, dx, dy, dz, radius, depth, room = null, names = PANEL) {
  let moved = 0;
  void nrm;
  const r2 = radius * radius;
  for (let pi = 0; pi < pieces.length; pi++) {
    const P = pos(pi);
    for (const r of pieces[pi].names) {
      if (!names.has(r.name)) continue;
      for (let v = r.first, end = r.first + r.count; v < end; v++) {
        const o = v * 3;
        const rx = P[o] - px, ry = P[o + 1] - py, rz = P[o + 2] - pz;
        const q = rx * rx + ry * ry + rz * rz;
        if (q >= r2 || !ok(pi, v)) continue;
        // (how far a vertex goes depends on where it is and nothing else: the faces that meet at an edge - the side
        // of a wing and the lip of its wheel arch - have a vertex each there, and they must stay together)
        const k = 1 - q / r2;
        let h = depth * k * k;
        // (room(x, y, z, h): how far in a vertex can go before it is through what lies behind the panel)
        if (room) h = Math.min(h, room(P[o], P[o + 1], P[o + 2], h));
        if (h <= 0) continue;
        P[o] += dx * h;
        P[o + 1] += dy * h;
        P[o + 2] += dz * h;
        // (the normals are left as they are: the weathered paint finds its rust and its dirt by them and by where
        // the vertex is in the world, and a normal leant into the hollow sends the whole pattern sliding across the
        // panel. The light and shade of the hollow's lip is the mark's to draw: marks.js DENT_METAL)
        moved++;
      }
    }
  }
  return moved;
}
