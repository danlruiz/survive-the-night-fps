// Bakes the field map of the valley (an old sepia survey map: hill shading, contour lines, forest
// stipple, water, roads, trails and building footprints) from the deterministic world once per world: the island's
// layers are in mapisland.js, the mainland's in mapmainland.js; the sea round the island, the bridges and the mine's
// workings are here. Names and live markers are drawn on top by the map screen / compass, never baked in.
import { MAP_HALF, MAP_SIZE } from '../../shared/constants.js';
import { drawMainland } from './mapmainland.js';
import { drawIslandRelief, drawIslandWoods, drawIslandRoads, drawRailway, drawCemetery, drawFairWheel, drawIslandBuilt, drawIslandSheet } from './mapisland.js';

// The map is baked at MAP_PPM px per metre, whatever the size of the world: 1280 px for the island, 2560 for the
// mainland (which is twice as far across). mapX / mapY are of the map baked last: the client has one world at a time.
export const MAP_PPM = 2;
const S = MAP_PPM;
let half = MAP_HALF; // of the world the map was last baked for
export let MAP_PX = MAP_SIZE * MAP_PPM; // ...and the size of its canvas

export const mapX = (x) => (x + half) * S;
export const mapY = (z) => (z + half) * S;

export function renderMapCanvas(world) {
  half = world.half;
  MAP_PX = world.size * MAP_PPM;
  const cv = document.createElement('canvas');
  cv.width = cv.height = MAP_PX;
  const g = cv.getContext('2d');
  // (the mainland is drawn as the picture it was built to: mapmainland.js)
  if (world.kind === 2) {
    drawMainland(g, world, S, mapX, mapY);
    drawWorkings(g, world);
    return cv;
  }
  // (the island, as an old survey map: mapisland.js)
  drawIslandRelief(g, world, S, mapX, mapY);
  drawIslandWoods(g, world, S, mapX, mapY);
  drawIslandRoads(g, world, S, mapX, mapY);
  drawRailway(g, world, S, mapX, mapY);
  drawWorkings(g, world);
  drawCemetery(g, world, S, mapX, mapY);
  drawFairWheel(g, world, S, mapX, mapY);
  drawIslandBuilt(g, world, S, mapX, mapY);
  // the bridge to the island (the mainland's west shore, issue #173): its spans out over the sea from the bluff,
  // past the edge of the map. The span nearest the shore is the one that fell behind the car: drawn broken
  if (world.bridge) drawBridge(g, world.bridge.x1, world.bridge.z, -1, 0, Math.max(0, world.bridge.x1 - world.bridge.x0), true);
  drawIslandSheet(g, world, S, mapX, mapY);
  return cv;
}

// The bridge as a survey draws one: the deck between two chords, a tick across it every truss panel, a pier every
// span. From (x, z), along (dx, dz) for len m. fallen: the first span (from x, z) is down in the water.
const SPAN = 64;
const PANEL = 8;
const DECK = 9.2;
function drawBridge(g, x, z, dx, dz, len, fallen = false) {
  const S = MAP_PPM;
  const nx = -dz;
  const nz = dx;
  const P = (t, o) => [mapX(x + dx * t + nx * o), mapY(z + dz * t + nz * o)];
  const line = (t0, t1, o) => {
    const [ax, ay] = P(t0, o);
    const [bx, by] = P(t1, o);
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
  };
  const h = DECK / 2;
  const from = fallen ? SPAN : 0;
  g.save();
  g.lineCap = 'butt';
  // the deck
  g.strokeStyle = 'rgba(214, 199, 164, 0.95)';
  g.lineWidth = DECK * S;
  g.beginPath();
  line(from, len, 0);
  g.stroke();
  // the chords and the panels
  g.strokeStyle = '#2a2019';
  g.lineWidth = 1.6;
  g.beginPath();
  line(from, len, -h);
  line(from, len, h);
  for (let t = from + PANEL; t < len; t += PANEL) {
    line(t, t, -h);
    const [ax, ay] = P(t, -h);
    const [bx, by] = P(t, h);
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
  }
  g.stroke();
  // the piers: a block across the deck every span
  g.fillStyle = '#2a2019';
  for (let t = from; t <= len; t += SPAN) {
    const [cx, cy] = P(t, 0);
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.atan2(dz, dx));
    g.fillRect(-1.6 * S, (-h - 2) * S, 3.2 * S, (DECK + 4) * S);
    g.restore();
  }
  // the fallen span: what shows of it over the water, dashed and askew
  if (fallen) {
    g.strokeStyle = 'rgba(42, 32, 25, 0.75)';
    g.lineWidth = 1.4;
    g.setLineDash([4, 4]);
    g.beginPath();
    line(4, SPAN - 2, -h + 1.2);
    line(10, SPAN - 2, h - 0.6);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

// The island as an island (issue #173): the sea round the survey, drawn on a chart pad m wider than the map on every
// side - the bluffs the valley's rim falls into, the shore inked, the swell lines, deeper water further out - and the
// Route 9 bridge from the end of the highway on the side the mainland lies (east) out over the sea. The map itself is
// laid over the middle of it. -> { canvas (MAP_PPM px a metre, (size + 2 pad) m across), pad, bridge: { x, z } (a spot
// on the bridge out at sea, for its name) }
export function renderSeaCanvas(world, pad) {
  const S = MAP_PPM;
  const half = world.half;
  const span = world.size + pad * 2;
  const N = Math.round(span * S);
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const d = img.data;
  // the shore's line: this far out from the map's edge, wandering along it (a sum of waves along the perimeter)
  let seed = (world.seed | 0) ^ 0x5ea5ea || 99991;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = [0.011, 0.023, 0.051, 0.097].map((f, i) => ({ f, p: rnd() * 6.283, a: [1, 0.6, 0.35, 0.2][i] }));
  const shore = (q) => {
    let n = 0;
    for (const w of waves) n += Math.sin(q * w.f + w.p) * w.a;
    return 8 + n * 3.4; // m off the map's edge
  };
  for (let py = 0; py < N; py++) {
    const z = py / S - pad - half;
    for (let px = 0; px < N; px++) {
      const x = px / S - pad - half;
      const ox = Math.max(0, Math.abs(x) - half);
      const oz = Math.max(0, Math.abs(z) - half);
      const dd = Math.hypot(ox, oz); // m out from the map's edge
      // where along the perimeter: the nearest point of the edge, measured round it
      const cx = Math.max(-half, Math.min(half, x));
      const cz = Math.max(-half, Math.min(half, z));
      const q = cz <= -half ? cx + half : cx >= half ? world.size + cz + half : cz >= half ? world.size * 2 + (half - cx) : world.size * 3 + (half - cz);
      const sh = shore(q);
      let r;
      let gg;
      let b;
      if (dd < sh) {
        // the bluff: the paper of the map's edge, darker down to the water, hatched across
        const t = dd / sh;
        r = 168 - t * 40;
        gg = 150 - t * 36;
        b = 120 - t * 30;
        if (t > 0.3 && Math.floor(q * 0.9) % 3 === 0) {
          r -= 26;
          gg -= 24;
          b -= 20;
        }
      } else if (dd < sh + 0.9) {
        r = 70;
        gg = 78;
        b = 80;
      } else {
        const w = dd - sh;
        const t = Math.min(1, w / 44);
        r = 122 - t * 40;
        gg = 140 - t * 38;
        b = 142 - t * 28;
        for (const [at, a] of [[3.2, 26], [8, 18], [15, 11]]) {
          if (Math.abs(w - at) < 0.5) {
            r += a;
            gg += a;
            b += a;
          }
        }
      }
      const n = (rnd() - 0.5) * 8;
      const k = (py * N + px) * 4;
      d[k] = r + n;
      d[k + 1] = gg + n;
      d[k + 2] = b + n;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // the bridge: from Route 9's eastern end, on the way the road leaves the map, out to the edge of the chart
  let bridge = null;
  const p = world.highway?.pts;
  if (p && p.length >= 6) {
    const n = p.length / 2;
    const east = p[(n - 1) * 2] > p[0];
    const i0 = east ? n - 1 : 0;
    const i1 = east ? n - 4 : 3;
    const ex = p[i0 * 2];
    const ez = p[i0 * 2 + 1];
    let dx = ex - p[i1 * 2];
    let dz = ez - p[i1 * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    g.save();
    g.translate(pad * S, pad * S); // (drawBridge draws in the map's px: the map sits pad m in)
    drawBridge(g, ex, ez, dx, dz, pad * 3);
    g.restore();
    bridge = { x: ex + dx * (pad * 0.62), z: ez + dz * (pad * 0.62) };
  }
  return { canvas: cv, pad, bridge };
}

// the workings of a mine, as the surveyor drew them: the drifts dashed under the ground they run beneath, a tick across
// each mouth
function drawWorkings(g, world) {
  if (!world.mine) return;
  g.strokeStyle = 'rgba(52, 30, 24, 0.7)';
  g.lineWidth = 2.6;
  g.setLineDash([2.5, 4.5]);
  for (const l of [world.mine.main, ...world.mine.galleries]) {
    g.beginPath();
    g.moveTo(mapX(l.x[0]), mapY(l.z[0]));
    for (let i = 1; i < l.n; i++) g.lineTo(mapX(l.x[i]), mapY(l.z[i]));
    g.stroke();
  }
  g.setLineDash([]);
  for (const rm of world.mine.rooms) {
    g.beginPath();
    g.arc(mapX(rm.x), mapY(rm.z), rm.r * S * 0.8, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3;
  for (const p of world.mine.portals) {
    g.beginPath();
    g.moveTo(mapX(p.x - p.dz * 4.5), mapY(p.z + p.dx * 4.5));
    g.lineTo(mapX(p.x + p.dz * 4.5), mapY(p.z - p.dx * 4.5));
    g.stroke();
  }
}
