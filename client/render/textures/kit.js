// What the texture generators (client/render/textures/*.js) paint with: seeded noise, the canvas and raw-pixel
// helpers, and the strokes, stains and fields several of them share.

// ------------------------------------------------------------------ math / noise
export function rngf(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Periodic (tileable) value-noise fbm, normalised to 0..1. fx/fy = lattice cells across the image for octave 0. */
export function fbm(w, h, fx, fy, oct, seed, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1;
  const ix0 = new Int32Array(w), ix1 = new Int32Array(w), txs = new Float32Array(w);
  for (let o = 0; o < oct; o++) {
    const cx = Math.max(1, Math.round(fx * 2 ** o)), cy = Math.max(1, Math.round(fy * 2 ** o));
    const r = rngf(seed * 131 + o * 977 + 7);
    const g = new Float32Array(cx * cy);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let x = 0; x < w; x++) {
      const f = (x / w) * cx, i = Math.floor(f), t = f - i;
      ix0[x] = i % cx;
      ix1[x] = (i + 1) % cx;
      txs[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < h; y++) {
      const f = (y / h) * cy, j = Math.floor(f), t0 = f - j, ty = t0 * t0 * (3 - 2 * t0);
      const r0 = (j % cy) * cx, r1 = ((j + 1) % cy) * cx, row = y * w;
      for (let x = 0; x < w; x++) {
        const a = g[r0 + ix0[x]], b = g[r0 + ix1[x]], c = g[r1 + ix0[x]], d = g[r1 + ix1[x]];
        const tx = txs[x], top = a + (b - a) * tx, bot = c + (d - c) * tx;
        out[row + x] += (top + (bot - top) * ty) * amp;
      }
    }
    amp *= gain;
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const s = 1 / (mx - mn || 1);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * s;
  return out;
}

/** Tileable worley noise. Returns {f1, f2, id} with distances in cell units. */
export function worley(w, h, cx, cy, seed) {
  const r = rngf(seed);
  const n = cx * cy, ox = new Float32Array(n), oy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ox[i] = r();
    oy[i] = r();
  }
  const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h), id = new Int32Array(w * h);
  const cw = w / cx, ch = h / cy;
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) / ch, j = Math.floor(gy);
    for (let x = 0; x < w; x++) {
      const gx = (x + 0.5) / cw, i = Math.floor(gx);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj, cj = ((jj % cy) + cy) % cy;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di, ci = ((ii % cx) + cx) % cx, k = cj * cx + ci;
          const px = ii + ox[k] - gx, py = jj + oy[k] - gy;
          const d = px * px + py * py;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
          } else if (d < d2) d2 = d;
        }
      }
      const p = y * w + x;
      f1[p] = Math.sqrt(d1);
      f2[p] = Math.sqrt(d2);
      id[p] = best;
    }
  }
  return { f1, f2, id };
}

// ------------------------------------------------------------------ canvas helpers
export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function ctx2d(c) {
  return c.getContext('2d', { willReadFrequently: true });
}
/** a w x h canvas painted all over in `fill`, and its context */
export function filledCanvas(w, h, fill) {
  const c = mkCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}
export function newImg(w, h) {
  return { w, h, d: new Uint8ClampedArray(w * h * 4) };
}
export function imgToCanvas(img, c) {
  c = c || mkCanvas(img.w, img.h);
  ctx2d(c).putImageData(new ImageData(img.d, img.w, img.h), 0, 0);
  return c;
}
export function canvasToImg(c) {
  const id = ctx2d(c).getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, d: id.data };
}
export const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
export const rgbA = (c, a = 1, k = 1) => rgb(c[0] * k, c[1] * k, c[2] * k, a);

/** calls fn(x,y) for the position and its wrapped copies when within r of an edge */
export function wrapDraw(W, H, x, y, r, fn) {
  const xs = x - r < 0 ? [0, W] : x + r > W ? [0, -W] : [0];
  const ys = y - r < 0 ? [0, H] : y + r > H ? [0, -H] : [0];
  for (const ox of xs) for (const oy of ys) fn(x + ox, y + oy);
}

/** multiplies image by a per-pixel function returning a scalar or modifies directly */
export function eachPx(img, fn) {
  const { w, h, d } = img;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) fn(x, y, i, d);
}

export function colorRamp(stops) {
  return (t, out) => {
    t = clamp(t);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1];
    const f = clamp((t - a[0]) / (b[0] - a[0] || 1));
    out[0] = a[1] + (b[1] - a[1]) * f;
    out[1] = a[2] + (b[2] - a[2]) * f;
    out[2] = a[3] + (b[3] - a[3]) * f;
    return out;
  };
}

/** random crack polyline (random walk), drawn wrapped */
export function drawCracks(ctx, W, H, r, count, { len = [40, 160], width = [0.8, 1.6], col = 'rgba(15,12,10,0.7)', light = null, branch = 0.3, step = 5, wander = 0.5, along = null } = {}) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const paths = [];
  const walk = (x, y, ang, L, depth) => {
    const pts = [[x, y]];
    for (let s = 0; s < L; s += step) {
      ang += (r() - 0.5) * wander;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      pts.push([x, y]);
      if (depth < 2 && r() < branch * 0.06) walk(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.5 + r()), L * 0.4, depth + 1);
    }
    paths.push({ pts, w: lerp(width[0], width[1], r()) * (depth ? 0.7 : 1) });
  };
  // `along`: every crack starts within 0.12 rad of that direction (checks follow the grain)
  for (let i = 0; i < count; i++) walk(r() * W, r() * H, along === null ? r() * Math.PI * 2 : along + (r() < 0.5 ? Math.PI : 0) + (r() - 0.5) * 0.24, lerp(len[0], len[1], r()), 0);
  const stroke = (style, dx, dy, wmul) => {
    ctx.strokeStyle = style;
    for (const p of paths) {
      ctx.lineWidth = p.w * wmul;
      for (const ox of [-W, 0, W])
        for (const oy of [-H, 0, H]) {
          ctx.beginPath();
          ctx.moveTo(p.pts[0][0] + ox + dx, p.pts[0][1] + oy + dy);
          for (let k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0] + ox + dx, p.pts[k][1] + oy + dy);
          ctx.stroke();
        }
    }
  };
  if (light) stroke(light, 0.8, 1, 1);
  stroke(col, 0, 0, 1);
}

// Shape recorder for alpha textures: draws the same shapes to a colour canvas and a mask canvas.
export class Rec {
  constructor() {
    this.ops = [];
  }
  line(x0, y0, x1, y1, w, c) {
    this.ops.push({ k: 0, x0, y0, x1, y1, w, c });
  }
  quad(x0, y0, cx, cy, x1, y1, w, c) {
    this.ops.push({ k: 1, x0, y0, cx, cy, x1, y1, w, c });
  }
  ell(x, y, rx, ry, rot, c) {
    this.ops.push({ k: 2, x, y, rx, ry, rot, c });
  }
  poly(pts, c) {
    this.ops.push({ k: 3, pts, c });
  }
  render(ctx, mask) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const o of this.ops) {
      const col = mask ? '#fff' : o.c;
      if (o.k === 0 || o.k === 1) {
        ctx.strokeStyle = col;
        ctx.lineWidth = o.w;
        ctx.beginPath();
        ctx.moveTo(o.x0, o.y0);
        if (o.k === 0) ctx.lineTo(o.x1, o.y1);
        else ctx.quadraticCurveTo(o.cx, o.cy, o.x1, o.y1);
        ctx.stroke();
      } else if (o.k === 2) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, Math.max(0.1, o.rx), Math.max(0.1, o.ry), o.rot, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(o.pts[0], o.pts[1]);
        for (let k = 2; k < o.pts.length; k += 2) ctx.lineTo(o.pts[k], o.pts[k + 1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  /** returns alpha image; bg = rgb under transparent pixels (avoids dark fringes) */
  toImg(w, h, bg, { post, alphaPow = 1 } = {}) {
    const [c, cx] = filledCanvas(w, h, rgbA(bg));
    const [m, mx] = filledCanvas(w, h, '#000');
    this.render(cx, false);
    this.render(mx, true);
    if (post) post(cx);
    const ci = canvasToImg(c), mi = canvasToImg(m);
    for (let i = 0; i < ci.d.length; i += 4) {
      let a = mi.d[i] / 255;
      if (alphaPow !== 1) a = Math.pow(a, alphaPow);
      ci.d[i + 3] = a * 255;
    }
    return ci;
  }
}

// ------------------------------------------------------------------ shared wood field
// Grain runs along u: gently wavy growth lines that pinch around a few knots. `wave` = how far the lines
// wander (large values give the looping figure of plywood), `knots` per image.
export function woodGrainImg(W, H, seed, light, dark, { rings = 24, streak = 0.6, lineDark = 0.28, fine = 0.08, wave = 2.2, knots = 3 } = {}) {
  const g1 = fbm(W, H, 1, 28, 4, seed, 0.55);
  const g2 = fbm(W, H, 2, 6, 3, seed + 1);
  const g3 = fbm(W, H, 4, 4, 4, seed + 2);
  const r = rngf(seed + 3);
  const kn = [];
  for (let k = 0; k < knots; k++) kn.push([r() * W, r() * H, 5 + r() * 7]);
  const img = newImg(W, H);
  const d = img.d;
  for (let y = 0, i = 0, p = 0; y < H; y++)
    for (let x = 0; x < W; x++, i += 4, p++) {
      // each knot lifts the lines over itself and leaves a dark eye
      let bulge = 0, eye = 0;
      for (const [kx, ky, kr] of kn) {
        let dx = Math.abs(x - kx), dy = Math.abs(y - ky);
        if (dx > W / 2) dx = W - dx;
        if (dy > H / 2) dy = H - dy;
        const q = (dx * dx) / (kr * kr * 9) + (dy * dy) / (kr * kr);
        if (q < 9) {
          bulge += Math.exp(-q) * 2.6;
          eye = Math.max(eye, Math.exp(-q * 3.2));
        }
      }
      const t = (y / H) * rings + g2[p] * wave + g1[p] * 1.2 + bulge;
      const s = Math.abs(Math.sin(t * Math.PI));
      const line = s ** 10;
      let v = 0.32 + (g1[p] - 0.5) * streak + 0.35 * g3[p] - line * lineDark + (r() - 0.5) * fine - eye * 0.3;
      v = clamp(v);
      d[i] = lerp(dark[0], light[0], v);
      d[i + 1] = lerp(dark[1], light[1], v);
      d[i + 2] = lerp(dark[2], light[2], v);
      d[i + 3] = 255;
    }
  return img;
}

/**
 * Board layout texture. Boards run along u (horizontal) unless vertical=true.
 * returns img plus the per-pixel "board local v" and edge info for further passes.
 */
export function boardsImg({ W = 512, H = 512, n = 8, seed = 1, vertical = false, light, dark, tone = 0.16, gap = [18, 14, 11], joints = 2, grime = 0.35, warm = 0 }) {
  const grainW = 512, grainH = 512;
  const grain = woodGrainImg(grainW, grainH, seed, light, dark, { rings: 26 });
  const gd = grain.d;
  const gl = fbm(W, H, 5, 5, 5, seed + 9);
  const streaks = fbm(W, H, vertical ? 3 : 40, vertical ? 40 : 2, 4, seed + 11);
  const r = rngf(seed + 5);
  const L = vertical ? H : W; // board length axis size
  const A = vertical ? W : H; // across axis size
  const bw = A / n;
  const boards = [];
  for (let b = 0; b < n; b++) {
    const js = [];
    for (let k = 0; k < joints; k++) js.push(Math.floor(r() * L));
    js.sort((a, c) => a - c);
    const seg = [];
    for (let k = 0; k <= joints; k++) seg.push({ tone: 1 + (r() - 0.5) * 2 * tone, ox: Math.floor(r() * grainW), oy: Math.floor(r() * grainH), warm: (r() - 0.5) * 12 + warm });
    boards.push({ js, seg, w: bw });
  }
  const img = newImg(W, H);
  const d = img.d;
  const height = new Float32Array(W * H);
  for (let y = 0, i = 0, p = 0; y < H; y++)
    for (let x = 0; x < W; x++, i += 4, p++) {
      const u = vertical ? y : x, v = vertical ? x : y;
      const b = Math.min(n - 1, Math.floor(v / bw));
      const lv = v - b * bw;
      const B = boards[b];
      let cnt = 0;
      let nearJ = 99;
      for (const j of B.js) {
        if (u >= j) cnt++;
        const dj = Math.abs(u - j);
        if (dj < nearJ) nearJ = dj;
      }
      const S = B.seg[B.js.length ? cnt % B.js.length : 0];
      const gx = (u + S.ox) % grainW, gy = (Math.floor(lv) + S.oy) % grainH;
      const gi = (gy * grainW + gx) * 4;
      let k = S.tone * (1 - grime * 0.5 + grime * gl[p]) * (0.85 + 0.3 * streaks[p]);
      // edge shading across the board
      if (lv < 2.2) k *= 0.25;
      else if (lv < 4) k *= 1.12;
      else if (lv > bw - 3) k *= 0.6;
      if (nearJ < 1.2 && B.js.length) k *= 0.3;
      else if (nearJ < 2.5 && B.js.length) k *= 0.8;
      let R = gd[gi] * k + S.warm, G = gd[gi + 1] * k + S.warm * 0.4, Bc = gd[gi + 2] * k - S.warm * 0.3;
      if (lv < 2.2) {
        R = lerp(R, gap[0], 0.7);
        G = lerp(G, gap[1], 0.7);
        Bc = lerp(Bc, gap[2], 0.7);
      }
      d[i] = R;
      d[i + 1] = G;
      d[i + 2] = Bc;
      d[i + 3] = 255;
      // gaps and butt joints are cut in, each board is slightly cupped and its grain stands out
      let hgt = 0.62 + 0.12 * Math.sin((Math.PI * lv) / bw) + ((gd[gi] + gd[gi + 1] + gd[gi + 2]) / 765) * 0.26;
      if (lv < 2.2 || (nearJ < 1.2 && B.js.length)) hgt = 0;
      else if (lv < 4 || lv > bw - 2) hgt *= 0.7;
      height[p] = hgt;
    }
  return { img, boards, bw, vertical, n, height };
}

export function nailsOnBoards(ctx, W, H, info, r, { studs = 3, rust = 0.35 } = {}) {
  const { n, bw, vertical } = info;
  const L = vertical ? H : W;
  const off = r() * L;
  for (let b = 0; b < n; b++) {
    for (let s = 0; s < studs; s++) {
      const u = (off + (s * L) / studs + (r() - 0.5) * 6 + L) % L;
      for (const f of [0.3, 0.72]) {
        if (r() < 0.15) continue;
        const v = b * bw + bw * f + (r() - 0.5) * 3;
        const x = vertical ? v : u, y = vertical ? u : v;
        wrapDraw(W, H, x, y, 30, (px, py) => {
          if (r() < rust) {
            const g = ctx.createLinearGradient(px, py, px, py + 26);
            g.addColorStop(0, 'rgba(90,45,20,0.45)');
            g.addColorStop(1, 'rgba(90,45,20,0)');
            ctx.fillStyle = g;
            ctx.fillRect(px - 1.5, py, 3, 26);
          }
          ctx.fillStyle = 'rgba(20,16,14,0.9)';
          ctx.beginPath();
          ctx.arc(px, py, 2.1, 0, 7);
          ctx.fill();
          ctx.fillStyle = 'rgba(130,120,110,0.5)';
          ctx.fillRect(px - 1, py - 1.2, 1.2, 1);
        });
      }
    }
  }
}

/** darkening water streaks running down (vertical) */
export function drips(ctx, W, H, r, count, col = [20, 16, 12], alpha = [0.05, 0.18], len = [30, 200], wdt = [2, 10]) {
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = r() * H, l = lerp(len[0], len[1], r()), w = lerp(wdt[0], wdt[1], r());
    const a = lerp(alpha[0], alpha[1], r());
    wrapDraw(W, H, x, y + l / 2, Math.max(w, l), (px, py) => {
      const g = ctx.createLinearGradient(0, py - l / 2, 0, py + l / 2);
      g.addColorStop(0, rgbA(col, a));
      g.addColorStop(1, rgbA(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - w / 2, py - l / 2, w, l);
    });
  }
}

/** soft blotches (stains, moss), wrapped */
export function blotches(ctx, W, H, r, count, col, alpha, rad) {
  for (let i = 0; i < count; i++) {
    const x = r() * W, y = r() * H, R = lerp(rad[0], rad[1], r()), a = lerp(alpha[0], alpha[1], r());
    const c = typeof col === 'function' ? col(r) : col;
    wrapDraw(W, H, x, y, R, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, rgbA(c, a));
      g.addColorStop(1, rgbA(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
    });
  }
}

/** overlay an fbm-based tint: where mask(noise) -> mix toward colour */
export function tintByNoise(img, noise, col, lo, hi, strength) {
  eachPx(img, (x, y, i, d) => {
    const t = sstep(lo, hi, noise[i >> 2]) * strength;
    if (t <= 0) return;
    d[i] = lerp(d[i], col[0], t);
    d[i + 1] = lerp(d[i + 1], col[1], t);
    d[i + 2] = lerp(d[i + 2], col[2], t);
  });
}
export function mulByNoise(img, noise, lo, hi) {
  eachPx(img, (x, y, i, d) => {
    const k = lo + (hi - lo) * noise[i >> 2];
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  });
}

/** a field that is ka of a and kb of b, pixel by pixel */
export function mixFields(a, ka, b, kb) {
  const out = new Float32Array(a.length);
  for (let p = 0; p < out.length; p++) out[p] = a[p] * ka + b[p] * kb;
  return out;
}

/** height field from an image's luminance (dark = cut in): cracks, chips, pits and scratches for free */
export function lumHeight(img, gain = 1) {
  const { w, h, d } = img;
  const out = new Float32Array(w * h);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = clamp(((d[i] + d[i + 1] + d[i + 2]) / 765) * gain);
  return out;
}

/** the canvas as raw pixels with a wear field (0..1) written to its alpha - never premultiplied */
export function withField(c, field) {
  const img = canvasToImg(c);
  for (let p = 0; p < field.length; p++) img.d[p * 4 + 3] = clamp(field[p]) * 255;
  return img;
}

export function scratches(ctx, W, H, r, n, col, len = [4, 30]) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI * 2, l = lerp(len[0], len[1], r());
    ctx.lineWidth = 0.5 + r() * 0.9;
    wrapDraw(W, H, x, y, l, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      ctx.stroke();
    });
  }
}

export function chips(ctx, W, H, r, n, col, rad = [1, 5]) {
  for (let k = 0; k < n; k++) {
    const x = r() * W, y = r() * H, R = lerp(rad[0], rad[1], r());
    const c = typeof col === 'function' ? col(r) : col;
    wrapDraw(W, H, x, y, R * 2, (px, py) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let s = 0; s < 7; s++) {
        const an = (s / 7) * Math.PI * 2, rr = R * (0.5 + r() * 0.7);
        ctx.lineTo(px + Math.cos(an) * rr, py + Math.sin(an) * rr);
      }
      ctx.fill();
    });
  }
}
