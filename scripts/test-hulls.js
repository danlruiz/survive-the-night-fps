// A prop's lofted skin (MeshBuilder.loft: a fuselage, a bag, a hull) faces out. Its materials draw the front faces
// only, so a skin wound the wrong way round is seen from inside: the near side vanishes and the far side's inner face
// shows through it (the helicopter at the crash site, 2026-10-12). loft's own winding faces in for a profile that
// goes round anticlockwise; `flip` turns it out.
//
// Every loft of every prop, every variant, is checked: each of its triangles must face away from its section's axis.
// INNER names the ones that are meant to be seen from inside.
// usage: node scripts/test-hulls.js
import './clip/dom-stub.js';
import { MeshBuilder } from '../client/render/materials.js';
const { createProp } = await import('../client/render/models/props.js');
const { PROPS } = await import('../shared/props.js');

// prop:material of the lofts that are an inside surface
const INNER = new Set(['boat:wood']); // the boat's planking, seen from inside it

const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : info}`);
  if (!ok) fails.push(name);
};

let current = '';
const lofts = new Map(); // `prop:mat` -> [fraction of triangles facing out, ...]
const loft = MeshBuilder.prototype.loft;
MeshBuilder.prototype.loft = function (mat, sections, profile, around = 10, o = {}) {
  const mesh = loft.call(this, mat, sections, profile, around, o);
  const N = around, ring = N + 1;
  const pts = [];
  for (const sec of sections)
    for (let k = 0; k <= N; k++) {
      const [px, py] = profile(k / N, sec);
      pts.push([px * sec.w * 0.5 + (sec.x || 0), py * sec.h * 0.5 + (sec.y || 0), sec.z, sec.x || 0, sec.y || 0]);
    }
  let out = 0, all = 0;
  const tri = (i, j, k) => {
    const [A, B, C] = [pts[i], pts[j], pts[k]];
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2]];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(n[0], n[1], nz) < 1e-9) return; // a section shrunk to a point
    const m = [(A[0] + B[0] + C[0] - A[3] - B[3] - C[3]) / 3, (A[1] + B[1] + C[1] - A[4] - B[4] - C[4]) / 3];
    all++;
    if (n[0] * m[0] + n[1] * m[1] > 0) out++;
  };
  // the same triangles as MeshBuilder.loft
  for (let s = 0; s < sections.length - 1; s++)
    for (let k = 0; k < N; k++) {
      const a = s * ring + k, b = a + 1, c = a + ring, d = c + 1;
      if (o.flip) { tri(a, b, c); tri(b, d, c); }
      else { tri(a, c, b); tri(b, c, d); }
    }
  const key = `${current}:${mat}`;
  if (!lofts.has(key)) lofts.set(key, []);
  lofts.get(key).push(all ? out / all : 1);
  return mesh;
};

for (const type of Object.keys(PROPS)) {
  current = type;
  for (let seed = 0; seed < 8; seed++) createProp(type, seed);
}
MeshBuilder.prototype.loft = loft;

check('some props are lofted (the check sees them)', lofts.size >= 5, `${lofts.size}`);
for (const [key, fr] of lofts) {
  const worst = Math.min(...fr), best = Math.max(...fr);
  if (INNER.has(key)) check(`${key}: faces in (an inside surface)`, best < 0.1, `max facing out ${best.toFixed(2)}`);
  else check(`${key}: faces out`, worst > 0.9, `min facing out ${worst.toFixed(2)}`);
}
for (const key of INNER) check(`${key} (INNER) is still lofted`, lofts.has(key));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
