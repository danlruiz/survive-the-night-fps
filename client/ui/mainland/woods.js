// The mainland field map's woods (mapmainland.js): a stamp for every tree, and the trees the picture draws where the
// world has fewer.
import { WATER_LEVEL } from '../../../shared/constants.js';

// the woods: a crown for every tree, the northern first so the southern stand in front of them (the picture
// draws its trees from a little south of overhead). Conifers are a dark pointed crown, lit on its west side; birch a
// round one; the dead a grey stroke. One path a layer: the shadows, then each tone of crown.
export function drawWoods(g, world, S, mapX, mapY) {
  const HALF = world.half;
  const PX = world.size * S;
  const T = world.trees;
  const order = new Int32Array(T.length / 6);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => T[a * 6 + 2] - T[b * 6 + 2]);
  const KIND = [0, 0, 0, 2, 2, 1, 2]; // per variant (world.js TREE_TYPES): conifer, conifer, conifer, dead, dead, birch, burnt snag
  // (each kind is a little picture, drawn once at a few sizes and stamped: a path of sixty thousand crowns is seconds to
  // fill, a stamp is microseconds. A stamp is a tree seen from the side, as the picture draws them: its foot at the
  // tree's place, its shadow thrown to the south-east)
  const SPR = treeSprites(S);
  // (cells of 6.5 m: no two stamps on one - the picture draws its woods as trees standing apart, the paper between them)
  const TC = Math.max(3, Math.round(6.5 * S));
  const TW = Math.ceil(PX / TC);
  const taken = new Uint8Array(TW * TW);
  for (let n = 0; n < order.length; n++) {
    const i = order[n] * 6;
    const x = mapX(T[i]);
    const y = mapY(T[i + 2]);
    const cell = Math.floor(y / TC) * TW + Math.floor(x / TC);
    if (taken[cell]) continue;
    taken[cell] = 1;
    const kind = KIND[T[i + 5] | 0] ?? 0;
    const set = SPR[kind];
    const sp = set[Math.max(0, Math.min(set.length - 1, Math.floor(((T[i + 3] - 0.75) * set.length) / 0.56)))];
    g.drawImage(sp, Math.round(x - sp.ox), Math.round(y - sp.oy));
  }

  // ---- the picture's woods where the world has fewer trees than it draws: round Town Center and between the suburbs'
  // streets the places keep their yards and lots clear, and the sheet drew them bare. The picture's density (forestAt)
  // is stamped there, off the roads, the water, the rock and what is built
  if (world.forestAt) {
    const STEP = 4;
    let fseed = 99991;
    const frnd = () => (fseed = (fseed * 16807) % 2147483647) / 2147483647;
    const built = (x, z) => {
      const cell = world.staticGrid.cellAt(x, z);
      if (!cell) return false;
      for (const c of cell) if (!(c.flags & 16) && c.y1 > world.heightAt(x, z) + 0.5) return true;
      return false;
    };
    for (let z = -HALF + 6; z < HALF - 6; z += STEP) {
      for (let x = -HALF + 6; x < HALF - 6; x += STEP) {
        const jx = x + (frnd() - 0.5) * STEP, jz = z + (frnd() - 0.5) * STEP;
        const fa = world.forestAt(jx, jz);
        if (fa < 0.12 || frnd() > Math.min(1, fa * 1.3)) continue;
        const px = mapX(jx), py = mapY(jz);
        const cell = Math.floor(py / TC) * TW + Math.floor(px / TC);
        if (taken[cell]) continue;
        if (world.roadDistAt(jx, jz) < 7 || world.heightAt(jx, jz) < WATER_LEVEL + 0.4 || (world.cliffAt && world.cliffAt(jx, jz) > -2) || built(jx, jz)) continue;
        taken[cell] = 1;
        const set = SPR[frnd() < 0.8 ? 0 : 1];
        const sp = set[Math.min(set.length - 1, Math.floor(frnd() * set.length))];
        g.drawImage(sp, Math.round(px - sp.ox), Math.round(py - sp.oy));
      }
    }
  }
}

// The trees' stamps, as the picture draws a tree: [conifers, broadleaves, the dead], each a few sizes (smallest first);
// a stamp is a canvas with its foot at (ox, oy)
export function treeSprites(S) {
  const k = S / 2;
  const make = (w, h, ox, oy, draw) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    draw(c.getContext('2d'));
    c.ox = ox;
    c.oy = oy;
    return c;
  };
  const conifer = (H) =>
    make(H * 0.95 + 4, H + 4, H * 0.32 + 1, H + 1, (g) => {
      const W = H * 0.64;
      const cx = H * 0.32 + 1;
      const foot = H + 1;
      g.fillStyle = 'rgba(46, 36, 22, 0.34)';
      g.beginPath();
      g.ellipse(cx + W * 0.42, foot - 0.5, W * 0.62, W * 0.24, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4a3624';
      g.fillRect(cx - 0.8 * k, foot - H * 0.16, 1.6 * k, H * 0.16);
      const tiers = [[0.98, 0.5], [0.72, 0.42], [0.46, 0.3]]; // (from its foot: where each tier's base is, how wide)
      const tri = (b, half, top) => {
        g.beginPath();
        g.moveTo(cx, foot - H * top);
        g.lineTo(cx + W * half, foot - H * (1 - b) - H * 0.12);
        g.lineTo(cx - W * half, foot - H * (1 - b) - H * 0.12);
        g.closePath();
      };
      tiers.forEach(([b, half], t) => {
        const top = t === 2 ? 1 : 0.62 + t * 0.2;
        tri(b, half, top);
        g.fillStyle = '#34443a';
        g.fill();
        g.lineWidth = 0.9 * k;
        g.strokeStyle = '#18251d';
        g.stroke();
        g.save();
        g.beginPath();
        g.rect(0, 0, cx, H + 4);
        g.clip();
        tri(b, half, top);
        g.fillStyle = '#5b7262';
        g.fill();
        g.restore();
      });
    });
  const broad = (H) =>
    make(H * 1.1 + 4, H + 4, H * 0.42 + 1, H + 1, (g) => {
      const cx = H * 0.42 + 1;
      const foot = H + 1;
      const r = H * 0.34;
      g.fillStyle = 'rgba(46, 36, 22, 0.32)';
      g.beginPath();
      g.ellipse(cx + r * 0.7, foot - 0.5, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a4630';
      g.fillRect(cx - 0.8 * k, foot - H * 0.32, 1.6 * k, H * 0.32);
      for (const [dx, dy, rr, c] of [[0, -0.62, 1, '#4c5a3a'], [-0.32, -0.5, 0.7, '#5b6a45'], [0.3, -0.48, 0.7, '#404c32'], [-0.18, -0.74, 0.55, '#71805a']]) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(cx + dx * H, foot + dy * H, r * rr, 0, Math.PI * 2);
        g.fill();
      }
    });
  const dead = (H) =>
    make(H * 0.8 + 4, H + 4, H * 0.4 + 1, H + 1, (g) => {
      const cx = H * 0.4 + 1;
      const foot = H + 1;
      g.strokeStyle = '#4d4438';
      g.lineWidth = 1.3 * k;
      g.beginPath();
      g.moveTo(cx, foot);
      g.lineTo(cx, foot - H * 0.9);
      g.moveTo(cx, foot - H * 0.55);
      g.lineTo(cx - H * 0.26, foot - H * 0.8);
      g.moveTo(cx, foot - H * 0.45);
      g.lineTo(cx + H * 0.24, foot - H * 0.68);
      g.stroke();
    });
  return [[26, 30, 34, 38].map((h) => conifer(h * k)), [22, 26, 30].map((h) => broad(h * k)), [17, 21].map((h) => dead(h * k))];
}
