// The mainland field map's raster (mapmainland.js): paper, relief, water, rock and the undergrowth, a pixel a metre,
// scaled up onto the sheet.
import { GRID_STEP, WATER_LEVEL } from '../../../shared/constants.js';

// the picture's colours
// (the picture's: a warm aged parchment, the sea a deep slate blue with lighter teal shallows, the ranges grey-brown)
const PAPER = [216, 192, 150];
const SEA = [44, 84, 112];
const SHALLOW = [86, 124, 136];
const SHORE = [22, 40, 52];
const ROCK_LIT = [190, 178, 158];
const ROCK_DARK = [92, 84, 74];
const BUSH = [74, 80, 58];

// the raster, a pixel a metre
export function drawRelief(g, world, S) {
  const SIZE = world.size;
  const HALF = world.half;
  const PX = SIZE * S;
  const N = world.gridN;
  const H = world.heights;

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
}
