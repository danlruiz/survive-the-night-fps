// The mainland's field map (issue #232: "Mainland Layout 12" redrawn as the field map). It is the island's survey map in
// the colours and the symbols of the picture the mainland was built to: paper, the sea and the lake in blue with their
// shallows and a light rim round every islet, the mountains as ranges of lit and shaded faces with the crests inked
// (no outline: their feet go into the woods), the woods as the picture draws them - tree after tree, a crown each,
// the nearer over the further - the roads by the picture's legend, the buildings in slate, and the picture's marks: the
// town, the airport, the industry, the gas station, the passes and the mines, the camps, the lighthouse, the radio
// tower, the quarry; and its legend in the corner of the sea. Place names are not baked (the map screen writes them as
// they are discovered), but "TO ISLAND" is, as the picture has it.
//
// Everything is drawn from the world as generated (mainland.js), at MAP_PPM pixels a metre: the raster (paper, relief,
// water, rock) at a pixel a metre, scaled up, and the rest as vectors over it.
import { GRID_STEP, WATER_LEVEL } from '../../shared/constants.js';

// the picture's colours
// (the picture's: a warm aged parchment, the sea a deep slate blue with lighter teal shallows, the ranges grey-brown)
const PAPER = [216, 192, 150];
const SEA = [44, 84, 112];
const SHALLOW = [86, 124, 136];
const SHORE = [22, 40, 52];
const ROCK_LIT = [190, 178, 158];
const ROCK_DARK = [92, 84, 74];
const BUSH = [74, 80, 58];
const INK = '#2a2018';

export function drawMainland(g, world, S, mapX, mapY) {
  const SIZE = world.size;
  const HALF = world.half;
  const PX = SIZE * S;
  const N = world.gridN;
  const H = world.heights;

  // ---- the raster, a pixel a metre
  const R = SIZE;
  const raster = document.createElement('canvas');
  raster.width = raster.height = R;
  const rg = raster.getContext('2d');
  const img = rg.createImageData(R, R);
  const d = img.data;
  // (the heights at every pixel, read straight off the grid: GRID_STEP is 2 m, a pixel 1 m)
  const hs = new Float32Array(R * R);
  for (let py = 0; py < R; py++) {
    const fz = Math.min(N - 1.001, (py + 0.5) / GRID_STEP);
    const j = fz | 0;
    const tz = fz - j;
    for (let px = 0; px < R; px++) {
      const fx = Math.min(N - 1.001, (px + 0.5) / GRID_STEP);
      const i = fx | 0;
      const tx = fx - i;
      const k = j * N + i;
      const a = H[k] + (H[k + 1] - H[k]) * tx;
      const b = H[k + N] + (H[k + N + 1] - H[k + N]) * tx;
      hs[py * R + px] = a + (b - a) * tz;
    }
  }
  // the mountains and the water's distance from its shore, every 4 m (bilinear lookups of the world's fields are a
  // function call a pixel: a coarse grid of them is read instead)
  const C = 4;
  const CN = Math.ceil(R / C) + 1;
  const mtn = new Float32Array(CN * CN);
  const wet = new Float32Array(CN * CN); // metres out on the water (sea or lake), negative on land
  for (let cj = 0; cj < CN; cj++) {
    for (let ci = 0; ci < CN; ci++) {
      const x = -HALF + ci * C;
      const z = -HALF + cj * C;
      mtn[cj * CN + ci] = world.cliffAt ? world.cliffAt(x, z) : -99;
      wet[cj * CN + ci] = Math.max(world.sea?.at ? world.sea.at(x, z) : -99, world.lakeAt ? world.lakeAt(x, z) : -99);
    }
  }
  const coarse = (arr, px, py) => {
    const fx = Math.min(CN - 1.001, px / C);
    const fy = Math.min(CN - 1.001, py / C);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * CN + i;
    const a = arr[k] + (arr[k + 1] - arr[k]) * tx;
    const b = arr[k + CN] + (arr[k + CN + 1] - arr[k + CN]) * tx;
    return a + (b - a) * ty;
  };
  // (what repeats is worked out once: the grain of the paper and the ripples on the water as tiles of 256 px, the
  // stains of the paper - low waves - every 4 px)
  let seed = 7654321;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grain = new Float32Array(256 * 256);
  for (let k = 0; k < grain.length; k++) grain[k] = (rnd() - 0.5) * 9;
  const ripple = new Uint8Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) ripple[y * 256 + x] = Math.sin(y * 0.9 + Math.sin(x * 0.045 * 2.4) * 3) * Math.sin(x * 0.021 * 2.4 + y * 0.007) > 0.82 ? 1 : 0;
  const SN = Math.ceil(R / 4) + 1;
  const stains = new Float32Array(SN * SN);
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) stains[j * SN + i] = 0.5 * Math.sin(i * 4 * 0.0041 + Math.sin(j * 4 * 0.0033) * 2.2) * Math.cos(j * 4 * 0.0037 - i * 4 * 0.0011) + 0.5 * Math.sin(i * 4 * 0.017 + j * 4 * 0.013);
  // (and the picture's tea stains and the browning toward the sheet's edges: soft rings and blots, on the same 4 px grid)
  for (let n = 0; n < 9; n++) {
    const sx = rnd() * SN, sy = rnd() * SN, sr = (0.05 + rnd() * 0.09) * SN, ring = rnd() < 0.5;
    for (let j = Math.max(0, (sy - sr * 1.3) | 0); j < Math.min(SN, sy + sr * 1.3); j++) {
      for (let i = Math.max(0, (sx - sr * 1.3) | 0); i < Math.min(SN, sx + sr * 1.3); i++) {
        const q = Math.hypot(i - sx, j - sy) / sr;
        stains[j * SN + i] -= ring ? Math.max(0, 1 - Math.abs(q - 1) * 9) * 0.9 : Math.max(0, 1 - q) * 0.7;
      }
    }
  }
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const e = Math.min(i, j, SN - 1 - i, SN - 1 - j) / SN; // (0 at the edge, 0.5 in the middle)
    stains[j * SN + i] -= Math.max(0, 0.09 - e) * 26;
  }
  const stain = (px, py) => stains[(py >> 2) * SN + (px >> 2)];
  const RIVER = world.river;
  for (let py = 0; py < R; py++) {
    for (let px = 0; px < R; px++) {
      const k = py * R + px;
      const h = hs[k];
      const hl = hs[py * R + (px > 0 ? px - 1 : px)];
      const hr = hs[py * R + (px < R - 1 ? px + 1 : px)];
      const hu = hs[(py > 0 ? py - 1 : py) * R + px];
      const hd = hs[(py < R - 1 ? py + 1 : py) * R + px];
      const gx = (hr - hl) * 0.5;
      const gz = (hd - hu) * 0.5;
      // light from the north-west, a little above (a lambert of the slope)
      const nl = Math.sqrt(gx * gx + 1 + gz * gz);
      const lit = (gx * -0.55 + gz * -0.55 + 0.63) / nl; // 0.63 on the flat
      let r, gg, b;
      const m = coarse(mtn, px, py);
      if (h < WATER_LEVEL) {
        // the water: deep blue out on it, the shallows lighter, an inked shore
        const out = coarse(wet, px, py);
        const depth = Math.min(1, Math.max(0, (WATER_LEVEL - h) / 6));
        const near = Math.max(0, 1 - Math.max(out, (WATER_LEVEL - h) * 3) / 26);
        r = SEA[0] + (SHALLOW[0] - SEA[0]) * near * (1 - depth * 0.4);
        gg = SEA[1] + (SHALLOW[1] - SEA[1]) * near * (1 - depth * 0.4);
        b = SEA[2] + (SHALLOW[2] - SEA[2]) * near * (1 - depth * 0.4);
        // ripples: faint lines across the open water, as the picture hatches it
        if (ripple[(py & 255) * 256 + (px & 255)] && out > 18) {
          r += 12;
          gg += 14;
          b += 14;
        }
        if (hr >= WATER_LEVEL || hd >= WATER_LEVEL || hl >= WATER_LEVEL || hu >= WATER_LEVEL) {
          r = SHORE[0];
          gg = SHORE[1];
          b = SHORE[2];
        }
      } else if (m > 0.5) {
        // rock: the faces in the light pale, those away from it dark, steeper darker; the crests inked
        const t = Math.max(0, Math.min(1, (lit - 0.18) / 0.72));
        r = ROCK_DARK[0] + (ROCK_LIT[0] - ROCK_DARK[0]) * t;
        gg = ROCK_DARK[1] + (ROCK_LIT[1] - ROCK_DARK[1]) * t;
        b = ROCK_DARK[2] + (ROCK_LIT[2] - ROCK_DARK[2]) * t;
        // hachures down the faces in shade: short strokes along the fall of the ground
        const sl = Math.sqrt(gx * gx + gz * gz);
        if (sl > 0.25 && t < 0.55) {
          const along = (px * -gz + py * gx) / sl; // (across the fall line)
          const hatch = Math.sin(along * 1.7) > 0.55 ? 1 : 0;
          const f = hatch * (0.55 - t) * 0.9;
          r -= f * 46;
          gg -= f * 46;
          b -= f * 44;
        }
        // a crest: the ground falls away both sides (the four neighbours two pixels off all lower)
        if (px > 2 && py > 2 && px < R - 3 && py < R - 3) {
          const c = hs[py * R + px - 2] + hs[py * R + px + 2] + hs[(py - 2) * R + px] + hs[(py + 2) * R + px] - 4 * h;
          if (c < -1.7) {
            const a = Math.min(1, (-c - 1.7) / 2.4) * 0.85;
            r = r * (1 - a) + 40 * a;
            gg = gg * (1 - a) + 35 * a;
            b = b * (1 - a) + 28 * a;
          }
        }
        // into the woods at the foot (the first few metres take the paper's colour back)
        const foot = Math.max(0, Math.min(1, (m - 0.5) / 5));
        r = PAPER[0] * (1 - foot) + r * foot;
        gg = PAPER[1] * (1 - foot) + gg * foot;
        b = PAPER[2] * (1 - foot) + b * foot;
      } else {
        // paper, the land lightly shaded by its slope, the foothills and the river's ravine with it
        const sh = (lit - 0.63) * 1.4;
        const st = stain(px, py);
        r = PAPER[0] + sh * 60 + st * 9;
        gg = PAPER[1] + sh * 56 + st * 10;
        b = PAPER[2] + sh * 46 + st * 9;
        // the shore as the picture draws it round every islet and along the coast: a light rim at the water's edge, and
        // rock behind it - grey-brown, lit and shaded by its slope, broken - fading into the land over a dozen metres
        // (an islet that small is rock all over)
        const out = coarse(wet, px, py);
        if (out > -14) {
          const dd = Math.max(0, -out);
          const t = Math.max(0, Math.min(1, (lit - 0.18) / 0.72 + (grain[(py & 255) * 256 + (px & 255)] + st * 4) * 0.025));
          const a = dd < 2.5 ? 0 : (1 - (dd - 2.5) / 11.5) * 0.8;
          r = r * (1 - a) + (ROCK_DARK[0] + (ROCK_LIT[0] - ROCK_DARK[0]) * t) * a;
          gg = gg * (1 - a) + (ROCK_DARK[1] + (ROCK_LIT[1] - ROCK_DARK[1]) * t) * a;
          b = b * (1 - a) + (ROCK_DARK[2] + (ROCK_LIT[2] - ROCK_DARK[2]) * t) * a;
          const rim = dd < 3.5 ? (1 - dd / 3.5) * 0.7 : 0;
          r = r * (1 - rim) + 236 * rim;
          gg = gg * (1 - rim) + 218 * rim;
          b = b * (1 - rim) + 178 * rim;
        }
        // faint contours every 5 m (the quarry's steps among them)
        const c0 = Math.floor(h / 5);
        if (Math.floor(hr / 5) !== c0 || Math.floor(hd / 5) !== c0) {
          r -= 14;
          gg -= 16;
          b -= 14;
        }
      }
      const n = grain[(py & 255) * 256 + (px & 255)];
      d[k * 4] = r + n;
      d[k * 4 + 1] = gg + n;
      d[k * 4 + 2] = b + n;
      d[k * 4 + 3] = 255;
    }
  }
  void RIVER;
  // the undergrowth, as the picture dots its open ground: every bush of the world a dark speck (two pixels a metre's
  // raster, under the trees' stamps)
  const BU = world.bushes || [];
  for (let i = 0; i < BU.length; i += 6) {
    const px = (BU[i] + HALF) | 0, py = (BU[i + 2] + HALF) | 0;
    if (px < 1 || py < 1 || px >= R - 1 || py >= R - 1 || hs[py * R + px] < WATER_LEVEL) continue;
    for (const o of [0, 1, R, R + 1]) {
      const k4 = (py * R + px + o) * 4;
      d[k4] = (d[k4] + BUSH[0] * 2) / 3;
      d[k4 + 1] = (d[k4 + 1] + BUSH[1] * 2) / 3;
      d[k4 + 2] = (d[k4 + 2] + BUSH[2] * 2) / 3;
    }
  }
  rg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(raster, 0, 0, PX, PX);

  // ---- the woods: a crown for every tree, the northern first so the southern stand in front of them (the picture
  // draws its trees from a little south of overhead). Conifers are a dark pointed crown, lit on its west side; birch a
  // round one; the dead a grey stroke. One path a layer: the shadows, then each tone of crown.
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

  // ---- roads, by the picture's legend: main roads a grey band in a dark casing with a light line down it; secondary
  // roads orange-brown; dirt roads a red-brown dash; trails a black dash; the streets of the places as the main roads,
  // narrower; the runway its own
  const path = (road) => {
    const p = road.pts;
    g.beginPath();
    g.moveTo(mapX(p[0]), mapY(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(mapX(p[i]), mapY(p[i + 1]));
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const styleOf = (road) => (road.width > 6 ? 'runway' : road.kind === 3 ? 'trail' : road.kind === 1 ? 'dirt' : road.width >= 3.6 ? 'main' : road.width >= 3.3 ? 'street' : road.width >= 2.7 ? 'secondary' : 'lane');
  const STYLE = {
    main: [[17, '#2a2420'], [11, '#8e8a82'], [2.2, '#d4cec2']],
    street: [[12, '#2e2824'], [7.6, '#9a958c']],
    secondary: [[11, '#4a2a14'], [6.6, '#b9733a']],
    lane: [[6.4, 'rgba(84, 52, 28, 0.8)'], [3.6, '#d2a06a']],
  };
  for (const road of world.roads) {
    if (styleOf(road) !== 'runway') continue;
    path(road);
    g.strokeStyle = '#2a2420';
    g.lineCap = 'butt';
    g.lineWidth = road.width * 2 * S + 4;
    g.stroke();
    g.strokeStyle = '#6f6c66';
    g.lineWidth = road.width * 2 * S;
    g.stroke();
    g.setLineDash([12, 9]);
    g.strokeStyle = '#e4ddcf';
    g.lineWidth = 1.6;
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'round';
  }
  for (const pass of [0, 1, 2]) {
    for (const road of world.roads) {
      const st = styleOf(road);
      if (st === 'runway') continue;
      if (st === 'dirt' || st === 'trail') {
        if (pass !== 1) continue;
        path(road);
        g.setLineDash(st === 'dirt' ? [15, 9] : [9, 7]);
        g.strokeStyle = st === 'dirt' ? 'rgba(122, 40, 22, 0.92)' : 'rgba(24, 18, 14, 0.88)';
        g.lineWidth = st === 'dirt' ? 5 : 3.4;
        g.stroke();
        g.setLineDash([]);
        continue;
      }
      const layer = STYLE[st][pass];
      if (!layer) continue;
      path(road);
      g.strokeStyle = layer[1];
      g.lineWidth = layer[0];
      g.stroke();
    }
  }

  // (Town Center's ring is its grid's edge streets, square at the corners where the avenues come to it: drawn above as
  // the streets they are, not as a main road of its own with rounded corners the avenues ran out past)

  // ---- the bridge to the island: its deck out over the sea to the edge of the map, and the picture's arrow
  if (world.bridge) {
    const br = world.bridge;
    const y = mapY(br.z);
    g.fillStyle = '#2a2420';
    g.fillRect(0, y - 7 * S, mapX(br.x1), 14 * S);
    g.fillStyle = '#7d7972';
    g.fillRect(0, y - 4.4 * S, mapX(br.x1), 8.8 * S);
    g.strokeStyle = '#2a2420';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = mapX(br.x1); x > 0; x -= 16 * S) {
      g.moveTo(x, y - 6.6 * S);
      g.lineTo(x, y + 6.6 * S);
    }
    g.stroke();
  }

  // ---- buildings: slate roofs, a lighter rim (not the galleries of the road tunnels: the picture draws a tunnel as its
  // road between two mouths)
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
  // the boats: a hull each, on the water
  g.fillStyle = '#e8dcc0';
  g.strokeStyle = '#3a2c1e';
  g.lineWidth = 1;
  for (const pr of world.props) {
    if (pr.type !== 'boat') continue;
    g.save();
    g.translate(mapX(pr.x), mapY(pr.z));
    g.rotate(-pr.ry);
    g.beginPath();
    g.moveTo(0, -4.6 * S);
    g.quadraticCurveTo(1.6 * S, -1 * S, 1.2 * S, 3.6 * S);
    g.lineTo(-1.2 * S, 3.6 * S);
    g.quadraticCurveTo(-1.6 * S, -1 * S, 0, -4.6 * S);
    g.fill();
    g.stroke();
    g.restore();
  }

  // ---- a ship moored at the quay: its hull, pointed at the bow, the deck lighter; and every container as a small
  // coloured block, on the apron, the ship and the wagons, as the picture draws the stacks
  for (const p of parts) {
    if (p.mat !== 'rust' || p.sx < 12 || p.sz < 50 || p.sy < 6) continue;
    g.save();
    g.translate(mapX(p.x), mapY(p.z));
    g.rotate(-p.ry);
    const hw = (p.sx / 2) * S, hl = (p.sz / 2) * S;
    g.beginPath();
    g.moveTo(-hw, hl);
    g.lineTo(hw, hl);
    g.lineTo(hw, -hl);
    g.lineTo(0, -hl - 9 * S);
    g.lineTo(-hw, -hl);
    g.closePath();
    g.fillStyle = '#4a3f38';
    g.fill();
    g.strokeStyle = '#1c1612';
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = '#d8d0c0';
    g.fillRect(-hw * 0.8, hl - 13 * S, hw * 1.6, 8 * S); // (its house at the stern)
    g.restore();
  }
  const CONTAINER = ['#a5462a', '#24548a', '#3f6e3a', '#b08a2e'];
  for (const pr of world.props) {
    if (pr.type !== 'shipping_container') continue;
    g.save();
    g.translate(mapX(pr.x), mapY(pr.z));
    g.rotate(-pr.ry);
    g.fillStyle = CONTAINER[(pr.seed ?? 0) & 3];
    g.fillRect(-1.25 * S, -3.05 * S, 2.5 * S, 6.1 * S);
    g.strokeStyle = 'rgba(20, 16, 12, 0.7)';
    g.lineWidth = 0.6;
    g.strokeRect(-1.25 * S, -3.05 * S, 2.5 * S, 6.1 * S);
    g.restore();
  }

  const seenCrane = new Set();
  // ---- the docks' cranes: the gantry on its four legs (a rust square, crossed) and its jib out over the water
  for (const p of parts) {
    if (p.mat !== 'rust' || p.sx < 55 || p.sx > 70 || p.sy < 2 || p.sy > 2.5 || p.y < 25) continue;
    const ck = Math.round(p.x) + ',' + Math.round(p.z / 8);
    if (seenCrane.has(ck)) continue;
    seenCrane.add(ck);
    const c = Math.cos(p.ry), sn = Math.sin(p.ry);
    // (the jib's quay end, where the gantry stands: its centre is 14 m on from there, toward the land)
    const qx = p.x + c * 23.9, qz = p.z - sn * 23.9;
    g.save();
    g.translate(mapX(qx), mapY(qz));
    g.rotate(-p.ry);
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 2.6;
    g.strokeRect(-8 * S, -8 * S, 16 * S, 16 * S);
    g.strokeStyle = RUST;
    g.lineWidth = 1.6;
    g.strokeRect(-8 * S, -8 * S, 16 * S, 16 * S);
    g.beginPath();
    g.moveTo(-8 * S, -8 * S);
    g.lineTo(8 * S, 8 * S);
    g.moveTo(8 * S, -8 * S);
    g.lineTo(-8 * S, 8 * S);
    g.stroke();
    // the jib: out from the gantry over the water
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(7.6 * S, 0);
    g.lineTo(-55.4 * S, 0);
    g.stroke();
    g.strokeStyle = RUST;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#e0d6c0';
    g.fillRect(-3 * S, -1.6 * S, 3.2 * S, 3.2 * S);
    g.restore();
  }

  // ---- the picture's marks
  drawMarks(g, world, S, mapX, mapY);

  // ---- "TO ISLAND", as the picture writes it on the bridge's way out
  if (world.bridge) {
    const y = mapY(world.bridge.z);
    const x = 18 * S;
    g.save();
    g.translate(x, y);
    g.scale(2.2 * (S / 2), 2.2 * (S / 2));
    g.translate(-x, -y);
    g.fillStyle = '#a32a1a';
    g.strokeStyle = 'rgba(246, 236, 212, 0.95)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x, y - 36);
    g.lineTo(x + 26, y - 50);
    g.lineTo(x + 26, y - 41);
    g.lineTo(x + 70, y - 41);
    g.lineTo(x + 70, y - 31);
    g.lineTo(x + 26, y - 31);
    g.lineTo(x + 26, y - 22);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    g.fillStyle = '#a32a1a';
    g.strokeStyle = 'rgba(246, 236, 212, 0.95)';
    g.lineWidth = 9;
    g.font = `bold ${Math.round(64 * (S / 2))}px Georgia, serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.strokeText('TO ISLAND', x - 8, y + 70);
    g.fillText('TO ISLAND', x - 8, y + 70);
  }

  // ---- the legend, in the south-west corner of the sea where the picture has it
  drawLegend(g, PX);

  // ---- the sheet's title, as the picture writes its own over the north-west corner: spaced bold capitals in a light
  // halo, a rule under them
  {
    const k = PX / 4096;
    const t = 'THE CALDER COAST';
    g.save();
    g.font = `bold ${Math.round(124 * k)}px Georgia, serif`;
    g.letterSpacing = `${Math.round(7 * k)}px`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const x = 84 * k;
    const y = 170 * k;
    const w = g.measureText(t).width;
    g.lineJoin = 'round';
    g.lineWidth = 16 * k;
    g.strokeStyle = 'rgba(232, 214, 176, 0.94)';
    g.strokeText(t, x, y);
    g.fillStyle = INK;
    g.fillText(t, x, y);
    g.fillStyle = 'rgba(232, 214, 176, 0.94)';
    g.fillRect(x - 6 * k, y + 20 * k, w + 12 * k, 14 * k);
    g.fillStyle = INK;
    g.fillRect(x, y + 24 * k, w, 3 * k);
    g.fillRect(x, y + 30 * k, w, 1.4 * k);
    g.restore();
  }

  // ---- grid (a square of 128 m) and the age of the sheet
  g.strokeStyle = 'rgba(70, 48, 30, 0.1)';
  g.lineWidth = 1;
  g.beginPath();
  for (let v = 0; v <= SIZE; v += 128) {
    g.moveTo(v * S, 0);
    g.lineTo(v * S, PX);
    g.moveTo(0, v * S);
    g.lineTo(PX, v * S);
  }
  g.stroke();
  const grad = g.createRadialGradient(PX / 2, PX / 2, PX * 0.3, PX / 2, PX / 2, PX * 0.74);
  grad.addColorStop(0, 'rgba(70,44,18,0)');
  grad.addColorStop(0.7, 'rgba(70,44,18,0.16)');
  grad.addColorStop(1, 'rgba(60,36,14,0.46)');
  g.fillStyle = grad;
  g.fillRect(0, 0, PX, PX);
}

// The trees' stamps, as the picture draws a tree: [conifers, broadleaves, the dead], each a few sizes (smallest first);
// a stamp is a canvas with its foot at (ox, oy)
function treeSprites(S) {
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

// a badge of the picture's: a rounded square of colour with a light glyph on it (r: half its size, px)
function badge(g, x, y, r, fill, glyph) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(246, 236, 212, 0.9)';
  roundRect(g, -r - 3, -r - 3, r * 2 + 6, r * 2 + 6, r * 0.45);
  g.fill();
  g.fillStyle = fill;
  roundRect(g, -r, -r, r * 2, r * 2, r * 0.35);
  g.fill();
  g.fillStyle = '#f2e8d2';
  g.strokeStyle = '#f2e8d2';
  glyph(g, r);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const RUST = '#a5462a';
const NAVY = '#24548a';
const BLACK = '#1c1a18';
// the glyphs, each drawn in a square of half size r about the origin
export const GLYPH = {
  // a civic building: a pediment over columns
  town(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.75, -r * 0.2);
    g.lineTo(0, -r * 0.72);
    g.lineTo(r * 0.75, -r * 0.2);
    g.closePath();
    g.fill();
    for (let k = -2; k <= 2; k++) g.fillRect(k * r * 0.3 - r * 0.07, -r * 0.12, r * 0.14, r * 0.62);
    g.fillRect(-r * 0.8, r * 0.55, r * 1.6, r * 0.18);
  },
  church(g, r) {
    g.fillRect(-r * 0.45, -r * 0.1, r * 0.9, r * 0.8);
    g.beginPath();
    g.moveTo(-r * 0.55, -r * 0.05);
    g.lineTo(0, -r * 0.5);
    g.lineTo(r * 0.55, -r * 0.05);
    g.closePath();
    g.fill();
    g.fillRect(-r * 0.06, -r * 0.85, r * 0.12, r * 0.4);
    g.fillRect(-r * 0.2, -r * 0.72, r * 0.4, r * 0.1);
  },
  // a factory: saw-tooth roof and a stack
  industrial(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.8, r * 0.7);
    g.lineTo(-r * 0.8, -r * 0.05);
    for (let k = 0; k < 3; k++) {
      g.lineTo(-r * 0.8 + (k + 1) * r * 0.4, -r * 0.35);
      g.lineTo(-r * 0.8 + (k + 1) * r * 0.4, -r * 0.05);
    }
    g.lineTo(r * 0.4, -r * 0.05);
    g.lineTo(r * 0.4, -r * 0.8);
    g.lineTo(r * 0.65, -r * 0.8);
    g.lineTo(r * 0.65, r * 0.7);
    g.closePath();
    g.fill();
  },
  gas(g, r) {
    g.fillRect(-r * 0.5, -r * 0.65, r * 0.65, r * 1.35);
    g.fillStyle = RUST;
    g.fillRect(-r * 0.38, -r * 0.5, r * 0.41, r * 0.32);
    g.fillStyle = '#f2e8d2';
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.moveTo(r * 0.15, -r * 0.2);
    g.lineTo(r * 0.5, -r * 0.2);
    g.lineTo(r * 0.5, r * 0.4);
    g.stroke();
  },
  airport(g, r) {
    g.beginPath();
    g.moveTo(0, -r * 0.85);
    g.lineTo(r * 0.12, -r * 0.2);
    g.lineTo(r * 0.85, r * 0.1);
    g.lineTo(r * 0.85, r * 0.25);
    g.lineTo(r * 0.12, r * 0.12);
    g.lineTo(r * 0.1, r * 0.55);
    g.lineTo(r * 0.35, r * 0.75);
    g.lineTo(-r * 0.35, r * 0.75);
    g.lineTo(-r * 0.1, r * 0.55);
    g.lineTo(-r * 0.12, r * 0.12);
    g.lineTo(-r * 0.85, r * 0.25);
    g.lineTo(-r * 0.85, r * 0.1);
    g.lineTo(-r * 0.12, -r * 0.2);
    g.closePath();
    g.fill();
  },
  // a tent (the picture's "pass" mark, which it sets at the camps)
  tent(g, r) {
    g.beginPath();
    g.moveTo(0, -r * 0.7);
    g.lineTo(r * 0.75, r * 0.6);
    g.lineTo(-r * 0.75, r * 0.6);
    g.closePath();
    g.fill();
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(0, -r * 0.05);
    g.lineTo(r * 0.25, r * 0.6);
    g.lineTo(-r * 0.25, r * 0.6);
    g.closePath();
    g.fill();
  },
  // a mouth in the rock: an arch (a tunnel, a mine, an adit)
  mine(g, r) {
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.7);
    g.lineTo(-r * 0.7, -r * 0.05);
    g.arc(0, -r * 0.05, r * 0.7, Math.PI, 0);
    g.lineTo(r * 0.7, r * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = BLACK;
    g.beginPath();
    g.moveTo(-r * 0.36, r * 0.7);
    g.lineTo(-r * 0.36, r * 0.05);
    g.arc(0, r * 0.05, r * 0.36, Math.PI, 0);
    g.lineTo(r * 0.36, r * 0.7);
    g.closePath();
    g.fill();
  },
  // crossed pick and hammer
  quarry(g, r) {
    g.lineWidth = r * 0.16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.6, r * 0.6);
    g.lineTo(r * 0.5, -r * 0.5);
    g.moveTo(r * 0.6, r * 0.6);
    g.lineTo(-r * 0.5, -r * 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(-r * 0.75, -r * 0.25);
    g.quadraticCurveTo(-r * 0.4, -r * 0.8, r * 0.05, -r * 0.75);
    g.stroke();
    g.fillRect(r * 0.25, -r * 0.8, r * 0.5, r * 0.3);
  },
};

// the marks the world asks for (world.marks: { kind, x, z }): the lighthouse and the radio tower drawn as the picture
// draws them, the rest as badges
function drawMarks(g, world, S, mapX, mapY) {
  const u = S / 2; // (the marks are sized for a map baked at 2 px a metre)
  for (const m of world.marks || []) {
    const x = mapX(m.x);
    const y = mapY(m.z);
    if (m.kind === 'pit') {
      // the quarry's pit: dark in its depth, its benches ringed
      const r = m.r * S;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(58, 52, 46, 0.62)');
      gr.addColorStop(0.75, 'rgba(84, 76, 66, 0.35)');
      gr.addColorStop(1, 'rgba(84, 76, 66, 0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(40, 34, 28, 0.7)';
      g.lineWidth = 2.4 * u;
      for (let k = 0; k < m.steps; k++) {
        g.beginPath();
        g.arc(x, y, m.r * S - ((k + 1) * (m.r - m.floor) * S) / m.steps, 0, Math.PI * 2);
        g.stroke();
      }
      continue;
    }
    if (m.kind === 'lighthouse' || m.kind === 'tower' || m.kind === 'watertower') {
      g.save();
      g.translate(x, y);
      g.scale(2.4 * u, 2.4 * u);
      g.lineJoin = 'round';
      if (m.kind === 'lighthouse') {
        g.fillStyle = 'rgba(246, 236, 212, 0.85)';
        g.beginPath();
        g.ellipse(0, 12, 10, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f0e6d0';
        g.strokeStyle = INK;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-5, 12);
        g.lineTo(-3, -12);
        g.lineTo(3, -12);
        g.lineTo(5, 12);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#a32a1a';
        g.fillRect(-4, -4, 8, 4);
        g.fillRect(-4.6, 5, 9.2, 4);
        g.fillRect(-4, -18, 8, 6);
        g.beginPath();
        g.moveTo(-5, -18);
        g.lineTo(0, -24);
        g.lineTo(5, -18);
        g.fill();
      } else if (m.kind === 'tower') {
        g.strokeStyle = 'rgba(246, 236, 212, 0.8)';
        g.lineWidth = 4;
        const lattice = () => {
          g.beginPath();
          g.moveTo(-9, 16);
          g.lineTo(-2, -26);
          g.lineTo(2, -26);
          g.lineTo(9, 16);
          for (let k = 0; k < 5; k++) {
            const t = k / 5;
            const y0 = 16 - t * 42;
            const w0 = 9 - t * 7;
            g.moveTo(-w0, y0);
            g.lineTo(w0 - 1.4, y0 - 8);
            g.moveTo(w0, y0);
            g.lineTo(-w0 + 1.4, y0 - 8);
          }
          g.moveTo(0, -26);
          g.lineTo(0, -34);
          g.stroke();
        };
        lattice();
        g.strokeStyle = '#a32a1a';
        g.lineWidth = 1.6;
        lattice();
      } else {
        g.fillStyle = '#4a4a48';
        g.strokeStyle = '#2a2420';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-5, 12);
        g.lineTo(-2, -4);
        g.moveTo(5, 12);
        g.lineTo(2, -4);
        g.stroke();
        g.beginPath();
        g.arc(0, -8, 6.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      continue;
    }
    const small = m.kind === 'tent' || m.kind === 'mine' || m.kind === 'tunnel';
    const fill = m.kind === 'airport' ? NAVY : small ? BLACK : RUST;
    const glyph = GLYPH[m.kind === 'tunnel' ? 'mine' : m.kind];
    if (glyph) badge(g, x, y, (small ? 24 : 34) * u, fill, glyph);
  }
}

// the picture's legend: the roads, the marks, a north arrow and a scale of the map's own (2 km across)
function drawLegend(g, PX) {
  const k = PX / 4096;
  const x0 = 46 * k;
  const y0 = PX * 0.806;
  const w = PX * 0.262;
  const h = PX * 0.176;
  g.save();
  g.fillStyle = 'rgba(234, 218, 180, 0.97)';
  g.strokeStyle = INK;
  g.lineWidth = 5 * k;
  g.fillRect(x0, y0, w, h);
  g.strokeRect(x0, y0, w, h);
  g.lineWidth = 2 * k;
  g.strokeRect(x0 + 12 * k, y0 + 12 * k, w - 24 * k, h - 24 * k);
  g.font = `${Math.round(40 * k)}px Georgia, serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const row = 78 * k;
  const top = y0 + 62 * k;
  const lines = [
    ['Main Road (vehicles)', [[17, '#2a2420'], [11, '#8e8a82'], [2.2, '#d4cec2']], null],
    ['Secondary Road', [[11, '#4a2a14'], [6.6, '#b9733a']], null],
    ['Dirt Road', [[5, 'rgba(122, 40, 22, 0.92)']], [15, 9]],
    ['Trail (foot / moped)', [[3.4, 'rgba(24, 18, 14, 0.88)']], [9, 7]],
  ];
  g.lineCap = 'butt';
  lines.forEach(([t, strokes, dash], i) => {
    const y = top + row * i;
    for (const [lw, c] of strokes) {
      g.strokeStyle = c;
      g.lineWidth = lw * k;
      g.setLineDash(dash ? dash.map((v) => v * k) : []);
      g.beginPath();
      g.moveTo(x0 + 40 * k, y);
      g.lineTo(x0 + 180 * k, y);
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = INK;
    g.fillText(t, x0 + 200 * k, y);
  });
  const icons = [
    ['Town / POI', RUST, 'town'],
    ['Airport', NAVY, 'airport'],
    ['Industrial', RUST, 'industrial'],
    ['Gas Station', RUST, 'gas'],
    ['Camp', BLACK, 'tent'],
    ['Tunnel / Mine', BLACK, 'mine'],
  ];
  const cx = x0 + w * 0.64;
  icons.forEach(([t, fill, kind], i) => {
    const y = top + row * i * 0.92;
    badge(g, cx, y, 24 * k, fill, GLYPH[kind]);
    g.fillStyle = INK;
    g.fillText(t, cx + 44 * k, y);
  });
  // the north arrow and the scale (half the map's width: 1 km)
  const rx = x0 + 80 * k;
  const ry = y0 + h - 86 * k;
  g.fillStyle = INK;
  for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    g.beginPath();
    g.moveTo(rx + ax * 58 * k, ry + ay * 58 * k);
    g.lineTo(rx + ay * 12 * k, ry - ax * 12 * k);
    g.lineTo(rx - ay * 12 * k, ry + ax * 12 * k);
    g.closePath();
    g.fill();
  }
  g.font = `bold ${Math.round(38 * k)}px Georgia, serif`;
  g.textAlign = 'center';
  g.fillText('N', rx, ry - 84 * k);
  const sx = x0 + 180 * k;
  const sy = y0 + h - 56 * k;
  const len = (w - 240 * k) / 500; // (a metre: 500 m across the bar)
  g.lineWidth = 4 * k;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(sx + 500 * len, sy);
  for (let m = 0; m <= 500; m += 125) {
    g.moveTo(sx + m * len, sy - 12 * k);
    g.lineTo(sx + m * len, sy + 12 * k);
  }
  g.stroke();
  g.font = `${Math.round(32 * k)}px Georgia, serif`;
  for (const m of [0, 250, 500]) g.fillText(m === 500 ? '500 m' : String(m), sx + m * len, sy - 34 * k);
  g.restore();
}
