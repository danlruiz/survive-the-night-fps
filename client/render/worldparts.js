// The shapes of the world's own parts (world.parts: walls, roofs, posts, panes) as the static world (staticworld.js)
// draws them: boxes, cylinders, cones and roof prisms with their UVs in metres, the joinery round a window and a door,
// and the faded paint of a painted building.
import * as THREE from 'three';
// faded paint per painted wall material (sRGB): siding is mostly white and cream, barns oxide red
const hexes = (list) => list.map((h) => new THREE.Color(h));
const PAINT = {
  clapboard: hexes([0xcfccc0, 0xcfccc0, 0xc8c1af, 0xc8c1af, 0xadb8bd, 0xb0b9a1, 0xc9bf9d, 0xabbbaf, 0xb8b5af, 0xc6b2a9, 0x93a2ab, 0xc2b287]),
  barn: hexes([0x7a3229, 0x7a3229, 0x6e2c25, 0x853a2e, 0x652823, 0x80402f, 0x76352d]),
};

// one paint colour per building: painted parts that touch (walls, gable ends, towers) form a building
export function paintByBuilding(parts) {
  const idx = [];
  parts.forEach((p, i) => PAINT[p.mat] && idx.push(i));
  const parent = idx.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const box = idx.map((i) => {
    const p = parts[i];
    const r = Math.max(p.sx, p.sz) / 2 + 0.3;
    return [p.x - r, p.x + r, p.z - r, p.z + r, p.y - p.sy / 2 - 0.3, p.y + p.sy / 2 + 0.3];
  });
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const A = box[a];
      const B = box[b];
      if (A[0] < B[1] && B[0] < A[1] && A[2] < B[3] && B[2] < A[3] && A[4] < B[5] && B[4] < A[5]) parent[find(a)] = find(b);
    }
  }
  const tint = new Map();
  idx.forEach((i, k) => {
    const root = parts[idx[find(k)]];
    const h = Math.abs(Math.sin(Math.round(root.x) * 12.9898 + Math.round(root.z) * 78.233) * 43758.5453) % 1;
    const pal = PAINT[parts[i].mat];
    tint.set(i, pal[Math.floor(h * pal.length)]);
  });
  return tint;
}

// Window joinery around a glass part, as boxes [x, y, z, sx, sy, sz] in its frame (x along the wall, y up,
// z through it): casing and sill proud of both wall faces, a sash around the pane and muntins across it.
export function windowTrim(sx, sy, t) {
  const d = t + 0.06;
  const out = [
    [-(sx / 2 + 0.045), 0.015, 0, 0.09, sy + 0.17, d],
    [sx / 2 + 0.045, 0.015, 0, 0.09, sy + 0.17, d],
    [0, sy / 2 + 0.05, 0, sx + 0.34, 0.1, d + 0.01],
    [0, -sy / 2 - 0.035, 0, sx + 0.3, 0.07, t + 0.16],
    [-(sx / 2 - 0.025), 0, 0, 0.05, sy, 0.07],
    [sx / 2 - 0.025, 0, 0, 0.05, sy, 0.07],
    [0, sy / 2 - 0.025, 0, sx - 0.1, 0.05, 0.07],
    [0, -sy / 2 + 0.025, 0, sx - 0.1, 0.05, 0.07],
  ];
  const nx = Math.min(3, Math.max(1, Math.round(sx / 0.6)));
  const ny = Math.min(2, Math.max(1, Math.round(sy / 0.6)));
  for (let k = 1; k < nx; k++) out.push([-sx / 2 + (k * sx) / nx, 0, 0, 0.035, sy - 0.1, 0.05]);
  for (let k = 1; k < ny; k++) out.push([0, -sy / 2 + (k * sy) / ny, 0, sx - 0.1, 0.035, 0.05]);
  return out;
}

// wall material -> door casing material
export const DOOR_TRIM = { clapboard: 'sash', logwall: 'trim', planks: 'trim', brick: 'trim', concrete: 'trim' };

export function boxGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z (4 verts each) -> meters
  const dims = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

export function cylGeo(r, h, sides) {
  const g = new THREE.CylinderGeometry(r, r, h, sides, 1);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}

export function coneGeo(r, h, sides) {
  const g = new THREE.ConeGeometry(r, h, sides, 1);
  const uv = g.attributes.uv;
  const slant = Math.hypot(r, h);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * slant);
  return g;
}

export function prismGeo(sx, sy, sz) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const A = [-hx, -hy];
  const B = [hx, -hy];
  const T = [0, hy];
  const pos = [];
  const uvs = [];
  const tri = (p, u) => {
    pos.push(...p);
    uvs.push(...u);
  };
  // front (z+) and back (z-) triangles
  tri([A[0], A[1], hz], [0, 0]);
  tri([B[0], B[1], hz], [sx, 0]);
  tri([T[0], T[1], hz], [hx, sy]);
  tri([B[0], B[1], -hz], [0, 0]);
  tri([A[0], A[1], -hz], [sx, 0]);
  tri([T[0], T[1], -hz], [hx, sy]);
  const slope = Math.hypot(hx, sy);
  // left slope A->T
  const quad = (p0, p1, p2, p3) => {
    tri(p0, [0, 0]);
    tri(p1, [sz, 0]);
    tri(p2, [sz, slope]);
    tri(p0, [0, 0]);
    tri(p2, [sz, slope]);
    tri(p3, [0, slope]);
  };
  quad([A[0], A[1], -hz], [A[0], A[1], hz], [T[0], T[1], hz], [T[0], T[1], -hz]);
  quad([B[0], B[1], hz], [B[0], B[1], -hz], [T[0], T[1], -hz], [T[0], T[1], hz]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
