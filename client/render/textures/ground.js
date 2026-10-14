// The ground (512, seamless): grass, dirt, forest floor, roads, mud, sand, gravel, and the terrain's noise fields.
import { rngf, lerp, sstep, fbm, worley, ctx2d, newImg, imgToCanvas, canvasToImg, rgbA, wrapDraw, eachPx, drawCracks, blotches, tintByNoise, mulByNoise, chips } from './kit.js';
const GEN = {};
export { GEN as GROUND_GEN };

function strokesWrapped(ctx, W, H, r, n, cols, len, width, angFn, alpha = 0.9) {
  ctx.lineCap = 'round';
  // (how many strokes each colour gets is drawn first: each colour is one path)
  const counts = cols.map(() => 0);
  for (let k = 0; k < n; k++) counts[Math.floor(r() * cols.length)]++;
  cols.forEach((c, ci) => {
    ctx.strokeStyle = rgbA(c, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let k = 0; k < counts[ci]; k++) {
      const x = r() * W, y = r() * H, a = angFn ? angFn(r) : r() * Math.PI * 2, l = lerp(len[0], len[1], r());
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      wrapDraw(W, H, x, y, l, (px, py) => {
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx, py + dy);
      });
    }
    ctx.stroke();
  });
}
function pebbles(ctx, W, H, r, n, cols, rad) {
  for (let k = 0; k < n; k++) {
    const x = r() * W, y = r() * H, R = lerp(rad[0], rad[1], r()), a = r() * 3.14, e = 0.6 + r() * 0.4;
    const c = cols[Math.floor(r() * cols.length)];
    wrapDraw(W, H, x, y, R * 2, (px, py) => {
      ctx.fillStyle = 'rgba(10,8,6,0.45)';
      ctx.beginPath();
      ctx.ellipse(px + R * 0.25, py + R * 0.3, R, R * e, a, 0, 7);
      ctx.fill();
      ctx.fillStyle = rgbA(c);
      ctx.beginPath();
      ctx.ellipse(px, py, R, R * e, a, 0, 7);
      ctx.fill();
      ctx.fillStyle = rgbA(c, 0.6, 1.3);
      ctx.beginPath();
      ctx.ellipse(px - R * 0.25, py - R * 0.25, R * 0.45, R * 0.3 * e, a, 0, 7);
      ctx.fill();
    });
  }
}

GEN.ground_grass = () => {
  // meadow seen from above: dark olive thatch between layered blades, a little straw, soil in the gaps
  const W = 512;
  const r = rngf(501);
  const a = fbm(W, W, 8, 8, 5, 501, 0.55), b = fbm(W, W, 16, 16, 3, 502), c2 = fbm(W, W, 6, 6, 3, 503);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const soil = sstep(0.64, 0.84, a[p]) * 0.65;
    const k = 0.78 + b[p] * 0.3 + (r() - 0.5) * 0.08;
    d[i] = lerp(lerp(36, 46, c2[p]), 54, soil) * k;
    d[i + 1] = lerp(lerp(44, 50, c2[p]), 44, soil) * k;
    d[i + 2] = lerp(24, 31, soil) * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  strokesWrapped(ctx, W, W, r, 9000, [[42, 54, 29], [50, 60, 31], [38, 48, 27], [58, 64, 35]], [3, 7], 1.1, null, 0.8);
  strokesWrapped(ctx, W, W, r, 7000, [[64, 74, 39], [72, 78, 41], [80, 82, 45], [60, 70, 35]], [3, 6], 1, null, 0.7);
  strokesWrapped(ctx, W, W, r, 1200, [[98, 92, 58], [90, 84, 52], [108, 98, 64]], [3, 6], 0.9, null, 0.45);
  pebbles(ctx, W, W, r, 14, [[80, 74, 66], [66, 60, 52]], [1.2, 2.6]);
  const img2 = canvasToImg(c);
  mulByNoise(img2, fbm(W, W, 5, 5, 4, 504), 0.82, 1.1);
  return { canvas: imgToCanvas(img2, c) };
};

GEN.ground_dirt = () => {
  const W = 512;
  const r = rngf(511);
  const a = fbm(W, W, 8, 8, 5, 511, 0.55), b = fbm(W, W, 24, 24, 3, 512);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.8 + a[p] * 0.25 + (b[p] - 0.5) * 0.2 + (r() - 0.5) * 0.12;
    const wet = sstep(0.62, 0.85, 1 - a[p]) * 0.18;
    d[i] = 80 * k * (1 - wet);
    d[i + 1] = 64 * k * (1 - wet);
    d[i + 2] = 48 * k * (1 - wet * 0.8);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  pebbles(ctx, W, W, r, 280, [[82, 74, 64], [70, 62, 52], [90, 82, 70], [58, 48, 40]], [1, 4]);
  strokesWrapped(ctx, W, W, r, 90, [[40, 30, 22], [60, 46, 32]], [10, 30], 1.6);
  drawCracks(ctx, W, W, r, 5, { len: [40, 140], width: [0.8, 1.4], col: 'rgba(30,22,16,0.6)', step: 5 });
  return { canvas: c };
};

GEN.ground_forest = () => {
  const W = 512;
  const r = rngf(521);
  const a = fbm(W, W, 4, 4, 6, 521, 0.55), mo = fbm(W, W, 5, 5, 5, 522);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.7 + a[p] * 0.45 + (r() - 0.5) * 0.12;
    d[i] = 46 * k;
    d[i + 1] = 36 * k;
    d[i + 2] = 27 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  strokesWrapped(ctx, W, W, r, 6000, [[66, 46, 30], [82, 58, 36], [54, 40, 28], [94, 66, 40], [42, 32, 24]], [4, 9], 1.1, null, 0.8);
  // dead leaves
  const lc = [[96, 64, 34], [120, 82, 40], [78, 56, 34], [104, 70, 30], [66, 50, 34]];
  for (let k = 0; k < 320; k++) {
    const x = r() * W, y = r() * W, R = 3 + r() * 5, an = r() * 6.28;
    const col = lc[Math.floor(r() * lc.length)], sh = 0.7 + r() * 0.5;
    wrapDraw(W, W, x, y, R * 2, (px, py) => {
      ctx.fillStyle = 'rgba(12,8,6,0.4)';
      ctx.beginPath();
      ctx.ellipse(px + 1, py + 1.2, R, R * 0.5, an, 0, 7);
      ctx.fill();
      ctx.fillStyle = rgbA(col, 0.95, sh);
      ctx.beginPath();
      ctx.ellipse(px, py, R, R * 0.5, an, 0, 7);
      ctx.fill();
      ctx.strokeStyle = rgbA(col, 0.8, sh * 0.6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(an) * R, py - Math.sin(an) * R);
      ctx.lineTo(px + Math.cos(an) * R, py + Math.sin(an) * R);
      ctx.stroke();
    });
  }
  strokesWrapped(ctx, W, W, r, 4000, [[58, 42, 28], [74, 52, 32], [46, 36, 26]], [3, 8], 1, null, 0.75);
  strokesWrapped(ctx, W, W, r, 60, [[34, 26, 20], [50, 38, 28]], [14, 40], 2.2);
  const img2 = canvasToImg(c);
  tintByNoise(img2, mo, [38, 44, 26], 0.66, 0.9, 0.4);
  return { canvas: imgToCanvas(img2, c) };
};

// compacted dirt road surface. Isotropic on purpose: ruts, the grassy crown and the verge are drawn by the
// terrain shader along the road itself, so this tiles in any direction.
GEN.ground_road = () => {
  const W = 512;
  const r = rngf(531);
  const a = fbm(W, W, 4, 4, 6, 531, 0.55), b = fbm(W, W, 12, 12, 4, 532), gr = fbm(W, W, 64, 64, 2, 533);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    // packed fines with a sandy grain, darker damp patches and paler dry, dusty ones
    let k = 0.84 + (a[p] - 0.5) * 0.3 + (b[p] - 0.5) * 0.16 + (gr[p] - 0.5) * 0.3 + (r() - 0.5) * 0.16;
    const dry = sstep(0.55, 0.8, a[p]) * 0.14;
    const damp = sstep(0.62, 0.85, 1 - b[p]) * 0.12;
    k *= 1 - damp;
    d[i] = lerp(96, 112, dry) * k;
    d[i + 1] = lerp(82, 100, dry) * k;
    d[i + 2] = lerp(64, 82, dry) * k * (1 + damp * 0.1);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // gravel pressed into the surface (each stone casts a small shadow): mostly the dirt's own tones, a
  // share of paler grey stones, never white
  pebbles(ctx, W, W, r, 700, [[92, 82, 68], [78, 68, 56], [104, 94, 80], [66, 58, 48]], [0.7, 1.8]);
  pebbles(ctx, W, W, r, 260, [[124, 116, 104], [110, 106, 98], [132, 122, 106]], [0.8, 2.2]);
  pebbles(ctx, W, W, r, 40, [[112, 104, 94], [96, 90, 82]], [2.2, 3.6]);
  // clods and small ruts of loose dirt
  blotches(ctx, W, W, r, 60, [58, 46, 34], [0.12, 0.28], [3, 9]);
  strokesWrapped(ctx, W, W, r, 90, [[58, 46, 34], [70, 58, 42]], [8, 24], 1.2, null, 0.5);
  drawCracks(ctx, W, W, r, 6, { len: [30, 110], width: [0.6, 1.1], col: 'rgba(40,30,22,0.5)', step: 4 });
  return { canvas: c };
};

GEN.ground_asphalt = () => {
  const W = 512;
  const r = rngf(541);
  const a = fbm(W, W, 4, 4, 6, 541, 0.55), m = fbm(W, W, 3, 3, 5, 542), wo = worley(W, W, 18, 18, 543);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    let k = 0.8 + a[p] * 0.3;
    const g = r();
    if (g < 0.08) k *= 0.6;
    else if (g > 0.9) k *= 1.45;
    else k *= 0.95 + (r() - 0.5) * 0.1;
    let v = 50 * k;
    const crackMask = sstep(0.55, 0.7, m[p]);
    const crack = (1 - sstep(0.0, 0.06, wo.f2[p] - wo.f1[p])) * crackMask;
    v = lerp(v, 14, crack * 0.9);
    const weed = crack * sstep(0.6, 0.8, a[p]);
    d[i] = lerp(v, 50, weed);
    d[i + 1] = lerp(v, 58, weed);
    d[i + 2] = lerp(v * 1.03, 32, weed);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  for (let k = 0; k < 2; k++) {
    const x = r() * W, y = r() * W, w = 40 + r() * 60, h = 30 + r() * 50;
    wrapDraw(W, W, x + w / 2, y + h / 2, Math.max(w, h), (px, py) => {
      ctx.fillStyle = 'rgba(34,34,36,0.4)';
      ctx.fillRect(px - w / 2, py - h / 2, w, h);
      ctx.strokeStyle = 'rgba(16,16,16,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    });
  }
  blotches(ctx, W, W, r, 10, [14, 14, 16], [0.2, 0.45], [10, 36]);
  drawCracks(ctx, W, W, r, 6, { len: [100, 300], width: [1, 2.2], col: 'rgba(10,10,10,0.9)', branch: 1, step: 6, wander: 0.5 });
  return { canvas: c };
};

// wet soil: dark, glossy where it is wettest, a few smooth-edged puddles, clods, tracks and straw
GEN.ground_mud = () => {
  const W = 512;
  const r = rngf(551);
  const a = fbm(W, W, 6, 6, 5, 551, 0.55), b = fbm(W, W, 40, 40, 3, 552), w2 = fbm(W, W, 5, 5, 5, 553), cl = fbm(W, W, 20, 20, 3, 554);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const wet = sstep(0.45, 0.8, w2[p]);
    let k = 0.86 + (a[p] - 0.5) * 0.3 + (b[p] - 0.5) * 0.18 + (r() - 0.5) * 0.05;
    // clumpy texture where it is drier
    k += (cl[p] - 0.5) * 0.24 * (1 - wet);
    k *= 1 - wet * 0.22;
    let R = 60 * k, G = 47 * k, B = 34 * k;
    // puddles: rare, smooth rims, a dull grey sheen of sky
    const pud = sstep(0.8, 0.84, w2[p] + (a[p] - 0.5) * 0.06);
    R = lerp(R, 33, pud);
    G = lerp(G, 31, pud);
    B = lerp(B, 29, pud);
    const rim = sstep(0.76, 0.8, w2[p]) * (1 - pud) * 0.18;
    d[i] = R * (1 - rim);
    d[i + 1] = G * (1 - rim);
    d[i + 2] = B * (1 - rim);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  pebbles(ctx, W, W, r, 160, [[72, 58, 44], [58, 46, 34], [80, 68, 54]], [1, 3.2]);
  strokesWrapped(ctx, W, W, r, 110, [[96, 84, 52], [80, 68, 44]], [8, 20], 1.1, null, 0.55);
  strokesWrapped(ctx, W, W, r, 80, [[30, 22, 16], [40, 30, 22]], [6, 16], 1.4, null, 0.5);
  return { canvas: c };
};

GEN.ground_sand = () => {
  const W = 512;
  const r = rngf(561);
  const a = fbm(W, W, 6, 6, 5, 561, 0.55), b = fbm(W, W, 40, 6, 3, 562), w2 = fbm(W, W, 8, 8, 4, 563);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.8 + a[p] * 0.28 + (b[p] - 0.5) * 0.1 + (r() - 0.5) * 0.14;
    const wet = sstep(0.58, 0.8, w2[p]) * 0.2;
    d[i] = 124 * k * (1 - wet);
    d[i + 1] = 114 * k * (1 - wet);
    d[i + 2] = 96 * k * (1 - wet * 0.9);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  pebbles(ctx, W, W, r, 260, [[110, 104, 96], [88, 82, 74], [140, 132, 120], [70, 64, 58]], [1, 4]);
  strokesWrapped(ctx, W, W, r, 60, [[50, 40, 30], [70, 60, 44]], [6, 20], 1.4);
  return { canvas: c };
};

// independent tileable noise fields in R / G / B (linear data, sampled by the terrain at several scales)
GEN.ground_noise = () => {
  const W = 256;
  const f = [fbm(W, W, 4, 4, 5, 571, 0.5), fbm(W, W, 4, 4, 5, 572, 0.5), fbm(W, W, 5, 5, 5, 573, 0.5)];
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    d[i] = f[0][p] * 255;
    d[i + 1] = f[1][p] * 255;
    d[i + 2] = f[2][p] * 255;
    d[i + 3] = 255;
  });
  return { ...img, linear: true };
};

// crushed grey quarry gravel (seamless)
GEN.gravel = () => {
  const W = 256;
  const r = rngf(911);
  const a = fbm(W, W, 5, 5, 4, 911);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const v = 84 + a[i >> 2] * 44 + (r() - 0.5) * 16;
    d[i] = v;
    d[i + 1] = v * 0.98;
    d[i + 2] = v * 0.95;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  const cols = [[118, 116, 110], [100, 98, 94], [128, 122, 112], [90, 88, 86], [112, 104, 94], [136, 132, 124]];
  pebbles(ctx, W, W, r, 700, cols, [1.6, 3.6]);
  pebbles(ctx, W, W, r, 500, cols, [0.8, 1.8]);
  chips(ctx, W, W, r, 140, 'rgba(24,22,20,0.5)', [0.8, 2]);
  return { canvas: c };
};
