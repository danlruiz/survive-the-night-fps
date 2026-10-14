// What is built, on the mainland field map (mapmainland.js): the piers, the buildings' roofs, the yards, the walls,
// the town's shrubs and the city's ruins.
import { treeSprites } from './woods.js';

// buildings: slate roofs, a lighter rim (not the galleries of the road tunnels: the picture draws a tunnel as its
// road between two mouths)
export function drawBuilt(g, world, S, mapX, mapY) {
  const inTunnel = (x, z) => (world.tunnels || []).some((t) => {
    if (t.s0 === undefined) return false;
    const dx = (t.b[0] - t.a[0]) / t.len;
    const dz = (t.b[1] - t.a[1]) / t.len;
    const s = (x - t.a[0]) * dx + (z - t.a[1]) * dz;
    return s > t.s0 - 4 && s < t.s1 + 4 && Math.abs(-(x - t.a[0]) * dz + (z - t.a[1]) * dx) < 11;
  });
  const parts = world.parts;
  // the piers: their decks as planking, a dark edge round the lot (drawn under, a little wider) and the boards over it
  const decks = parts.filter((p) => p.mat === 'dockwood' && p.sy < 0.5);
  for (const pass of [0, 1]) {
    g.fillStyle = pass ? '#a77d4e' : '#3a2a1a';
    for (const p of decks) {
      const e = pass ? 0.15 : 0.9;
      g.save();
      g.translate(mapX(p.x), mapY(p.z));
      g.rotate(-p.ry);
      g.fillRect(((-p.sx / 2 - e) * S), ((-p.sz / 2 - e) * S), (p.sx + 2 * e) * S, (p.sz + 2 * e) * S);
      g.restore();
    }
  }
  // ---- what is built, as the picture draws it: no slabs of grey under the town - its streets lie on the paper - and
  // every building a little dark roof seen from a little south of overhead, sized and turned to its footprint: its
  // shadow thrown to the south-east, the walls that face the eye under the eaves (the west lit, the rest in shade), the
  // roof over them, a gable's two slopes lit and shaded either side of its ridge. Footprints from what the world says
  // of its buildings (roofs, the city's storeys and rooms), then the flat roofs and the solid blocks of the places,
  // each only where no footprint already stands; a wall that is under no roof (a ruin, a yard's) a dark line.
  {
    const H = (x, z) => world.heightAt(x, z);
    const C = world.city;
    const CH = C ? (C.grid * C.pitch) / 2 + 10 : 0;
    const inTown = (x, z) => C && Math.abs(x - C.x) < CH && Math.abs(z - C.z) < CH;
    const foot = [];
    const FC = 16;
    const cells = new Map();
    const covered = (x, z) => {
      for (const f of cells.get(Math.floor(x / FC) * 4096 + Math.floor(z / FC)) || []) {
        const dx = x - f.x, dz = z - f.z;
        const lx = f.c * dx - f.s * dz, lz = f.s * dx + f.c * dz;
        if (Math.abs(lx) < f.w / 2 + 0.6 && Math.abs(lz) < f.d / 2 + 0.6) return true;
      }
      return false;
    };
    const add = (x, z, ry, w, d, h, kind) => {
      if (w * d < 2.5 || covered(x, z)) return;
      const f = { x, z, c: Math.cos(ry), s: Math.sin(ry), w, d, h, kind };
      foot.push(f);
      const r = Math.hypot(w, d) / 2 + 0.6;
      for (let i = Math.floor((x - r) / FC); i <= Math.floor((x + r) / FC); i++) {
        for (let j = Math.floor((z - r) / FC); j <= Math.floor((z + r) / FC); j++) {
          const k = i * 4096 + j;
          let a = cells.get(k);
          if (!a) cells.set(k, (a = []));
          a.push(f);
        }
      }
    };
    if (C) for (const b of C.buildings) add(b.x, b.z, b.ry, b.w, b.d, b.y + b.floors * b.fh - H(b.x, b.z), 'flat');
    for (const r of world.roofs || []) add(r.x, r.z, Math.atan2(r.s, r.c), r.hx * 2, r.hz * 2, Math.max(3, r.y - H(r.x, r.z)), 'gable');
    if (C) for (const r of C.rooms) add(r.x, r.z, r.ry, r.w, r.d, r.y - H(r.x, r.z) + r.h, 'flat');
    const skip = (p) => p.hidden || p.tag === 'cliff' || p.mat === 'dockwood' || inTunnel(p.x, p.z) || (world.mine && p.y + p.sy / 2 < H(p.x, p.z)) || (p.mat === 'rust' && p.sx >= 12 && p.sz >= 50) || ((p.mat === 'rust' || p.mat === 'tin_rust') && p.y > 8);
    const walls = [];
    const pads = [];
    for (const p of parts) {
      if ((p.shape !== 'box' && p.shape !== 'cyl') || skip(p)) continue;
      const up = p.y - H(p.x, p.z);
      if (p.shape === 'cyl') {
        if (p.sx >= 2 && p.sy >= 1.5 && !covered(p.x, p.z)) foot.push({ x: p.x, z: p.z, r: p.sx / 2, h: up + p.sy, kind: 'round' });
      } else if (p.sy < 0.9) {
        if (p.sx * p.sz < 20) continue;
        if (up > 1.8 && world.roadDistAt(p.x, p.z) > 2) add(p.x, p.z, p.ry, p.sx, p.sz, up + p.sy, 'flat'); // (a flat roof)
        else if (up < 1 && !inTown(p.x, p.z)) pads.push(p); // (an apron, a yard: out of town only)
      } else if (Math.min(p.sx, p.sz) >= 1.4) add(p.x, p.z, p.ry, p.sx, p.sz, up + p.sy, 'flat');
      else if (Math.max(p.sx, p.sz) >= 1.2) walls.push(p);
    }
    // the aprons and yards out of town (the docks' quay, the airfield's): a grey wash, as the picture paves its docks
    g.fillStyle = 'rgba(112, 106, 98, 0.42)';
    for (const q of world.paved || []) pads.push({ x: q.x, z: q.z, ry: q.ry || 0, sx: q.hx * 2, sz: q.hz * 2 }); // (the docks' apron: asphalt)
    for (const p of pads) {
      g.save();
      g.translate(mapX(p.x), mapY(p.z));
      g.rotate(-p.ry);
      g.fillRect((-p.sx / 2) * S, (-p.sz / 2) * S, p.sx * S, p.sz * S);
      g.restore();
    }
    // the walls under no roof
    g.strokeStyle = 'rgba(40, 32, 26, 0.85)';
    g.lineWidth = Math.max(1, 0.5 * S);
    g.beginPath();
    for (const p of walls) {
      if (covered(p.x, p.z)) continue;
      const long = p.sx >= p.sz;
      const L = (long ? p.sx : p.sz) / 2;
      const c = Math.cos(p.ry), sn = Math.sin(p.ry);
      const [dx, dz] = long ? [c * L, -sn * L] : [sn * L, c * L];
      g.moveTo(mapX(p.x - dx), mapY(p.z - dz));
      g.lineTo(mapX(p.x + dx), mapY(p.z + dz));
    }
    g.stroke();
    // the shrubs of the town and of the suburbs' yards, as the picture's little round trees among the houses
    {
      const sp = treeSprites(S)[1][0];
      const HC = 64;
      const hcell = new Set((world.homes || []).map((h) => Math.floor(h.x / HC) * 4096 + Math.floor(h.z / HC)));
      const near = (x, z) => inTown(x, z) || hcell.has(Math.floor(x / HC) * 4096 + Math.floor(z / HC));
      const tk = new Set();
      const B = world.bushes || [];
      const k7 = 0.7;
      for (let i = 0; i < B.length; i += 6) {
        const x = B[i], z = B[i + 2];
        if (!near(x, z) || world.roadDistAt(x, z) < 4 || covered(x, z)) continue;
        const k = Math.floor(x / 11) * 4096 + Math.floor(z / 11);
        if (tk.has(k)) continue;
        tk.add(k);
        g.drawImage(sp, Math.round(mapX(x) - sp.ox * k7), Math.round(mapY(z) - sp.oy * k7), sp.width * k7, sp.height * k7);
      }
    }
    const poly = (pts) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.closePath();
    };
    // the city's ruins: the rubble heaps, and the shells of what burnt - walls with the sky over them, standing in the
    // same three-quarter view (their tops lifted by their height), roofless
    if (C) {
      g.fillStyle = '#6e5e4e';
      g.strokeStyle = 'rgba(33, 27, 22, 0.8)';
      g.lineWidth = 0.8;
      for (const q of C.heaps) {
        g.beginPath();
        g.ellipse(mapX(q.x), mapY(q.z) - q.h * 0.15 * S, q.rx * S * 0.9, q.rz * S * 0.7, -q.ry, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      for (const w of C.shells) {
        const hgt = (w.heights || [w.fh * 2]).reduce((a2, v) => a2 + v, 0) / (w.heights?.length || 1);
        const e = Math.min(10 * S, Math.max(1.1 * S, hgt * 0.3 * S));
        const ax = mapX(w.x0), ay = mapY(w.z0), bx = mapX(w.x1), by = mapY(w.z1);
        g.fillStyle = '#433a33';
        poly([[ax, ay], [bx, by], [bx, by - e], [ax, ay - e]]);
        g.fill();
        g.strokeStyle = '#211b16';
        g.lineWidth = Math.max(1.2, w.t * S * 1.6);
        g.beginPath();
        g.moveTo(ax, ay - e);
        g.lineTo(bx, by - e);
        g.stroke();
      }
    }
    foot.sort((a, b) => a.z - b.z);
    const ext = (f) => Math.min(13 * S, Math.max(1.1 * S, f.h * 0.3 * S));
    const corners = (f, up) => {
      const cx = mapX(f.x), cy = mapY(f.z) - up;
      const hw = (f.w / 2) * S, hd = (f.d / 2) * S;
      return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [cx + f.c * lx + f.s * lz, cy - f.s * lx + f.c * lz]);
    };
    // the shadows first, all of them
    g.fillStyle = 'rgba(52, 36, 18, 0.26)';
    for (const f of foot) {
      const e = ext(f);
      if (f.kind === 'round') {
        g.beginPath();
        g.ellipse(mapX(f.x) + e * 0.5, mapY(f.z) + e * 0.15, f.r * S + e * 0.3, f.r * S * 0.8, 0, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      poly(corners(f, 0).map(([x, y]) => [x + e * 0.55, y + e * 0.2]));
      g.fill();
    }
    g.lineJoin = 'round';
    for (const f of foot) {
      const e = ext(f);
      if (f.kind === 'round') {
        const x = mapX(f.x), y = mapY(f.z), r = f.r * S;
        g.fillStyle = '#4b453f';
        g.fillRect(x - r, y - e, r * 2, e);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI);
        g.fill();
        const gr = g.createLinearGradient(x - r, 0, x + r, 0);
        gr.addColorStop(0, '#8f877c');
        gr.addColorStop(1, '#55504a');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y - e, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#211b16';
        g.lineWidth = 0.8;
        g.stroke();
        continue;
      }
      const lo = corners(f, 0);
      const hi = corners(f, e);
      // the walls that face the eye (their outward side down the sheet)
      for (let k = 0; k < 4; k++) {
        const a = lo[k], b = lo[(k + 1) % 4];
        const mx = (a[0] + b[0]) / 2 - mapX(f.x), my = (a[1] + b[1]) / 2 - mapY(f.z);
        if (my <= 0.01) continue;
        g.fillStyle = mx < -Math.abs(my) * 0.4 ? '#6f665c' : '#3e3832';
        poly([a, b, hi[(k + 1) % 4], hi[k]]);
        g.fill();
      }
      // the roof
      if (f.kind === 'gable') {
        const long = f.w >= f.d; // (the ridge down the long way)
        const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const [r0, r1] = long ? [m(hi[0], hi[3]), m(hi[1], hi[2])] : [m(hi[0], hi[1]), m(hi[3], hi[2])];
        const halves = long ? [[hi[0], hi[1], r1, r0], [r0, r1, hi[2], hi[3]]] : [[hi[0], r0, r1, hi[3]], [r0, hi[1], hi[2], r1]];
        for (const hf of halves) {
          const cx = (hf[0][0] + hf[1][0] + hf[2][0] + hf[3][0]) / 4 - (r0[0] + r1[0]) / 2;
          const cy = (hf[0][1] + hf[1][1] + hf[2][1] + hf[3][1]) / 4 - (r0[1] + r1[1]) / 2;
          g.fillStyle = cx + cy < 0 ? '#7a736b' : '#47413c';
          poly(hf);
          g.fill();
        }
        g.strokeStyle = '#a39b90';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(r0[0], r0[1]);
        g.lineTo(r1[0], r1[1]);
        g.stroke();
      } else {
        g.fillStyle = '#5a544e';
        poly(hi);
        g.fill();
        if (f.w * S > 8 && f.d * S > 8) {
          g.strokeStyle = 'rgba(150, 142, 130, 0.5)';
          g.lineWidth = 0.8;
          poly(corners({ ...f, w: f.w - 2.2, d: f.d - 2.2 }, e));
          g.stroke();
        }
      }
      g.strokeStyle = '#211b16';
      g.lineWidth = 0.9;
      poly(lo);
      g.stroke();
      poly(hi);
      g.stroke();
    }
  }
}
