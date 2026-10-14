// Bark, the alpha cards of needles, leaves, bushes, ferns and grass, and rock.
import { rngf, clamp, lerp, sstep, fbm, worley, ctx2d, newImg, imgToCanvas, wrapDraw, eachPx, drawCracks, Rec, blotches, chips } from './kit.js';
const GEN = {};
export { GEN as VEGETATION_GEN };

GEN.bark = () => {
  const W = 256, H = 512;
  const r = rngf(401);
  const wo = worley(W, H, 7, 4, 401);
  const a = fbm(W, H, 20, 2, 4, 402), b = fbm(W, H, 4, 8, 4, 403), li = fbm(W, H, 8, 16, 4, 404);
  const fib = fbm(W, H, 48, 3, 3, 405);
  const img = newImg(W, H);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const e = wo.f2[p] - wo.f1[p] + (a[p] - 0.5) * 0.12;
    const crev = 1 - sstep(0.02, 0.1, e);
    const plateK = (0.72 + b[p] * 0.3 + (a[p] - 0.5) * 0.25 + (r() - 0.5) * 0.06) * (0.8 + 0.3 * fib[p]) * (0.8 + 0.25 * sstep(0.05, 0.3, e));
    let R = 78 * plateK, G = 62 * plateK, B = 52 * plateK;
    R = lerp(R, 20, crev);
    G = lerp(G, 15, crev);
    B = lerp(B, 12, crev);
    const l = sstep(0.72, 0.84, li[p]) * (1 - crev) * 0.55;
    d[i] = lerp(R, 104, l);
    d[i + 1] = lerp(G, 110, l);
    d[i + 2] = lerp(B, 88, l);
    d[i + 3] = 255;
  });
  return { canvas: imgToCanvas(img) };
};

GEN.bark_birch = () => {
  const W = 256, H = 512;
  const r = rngf(411);
  const a = fbm(W, H, 4, 8, 5, 411), b = fbm(W, H, 20, 6, 3, 412);
  const img = newImg(W, H);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.8 + a[p] * 0.22 + (b[p] - 0.5) * 0.1;
    d[i] = 196 * k;
    d[i + 1] = 190 * k;
    d[i + 2] = 176 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // lenticels
  for (let k = 0; k < 300; k++) {
    const x = r() * W, y = r() * H, l = 4 + r() * 22, h = 1 + r() * 1.8;
    ctx.fillStyle = `rgba(${40 + r() * 30},${36 + r() * 24},${34 + r() * 20},${0.5 + r() * 0.4})`;
    wrapDraw(W, H, x, y, l, (px, py) => ctx.fillRect(px - l / 2, py, l, h));
  }
  // black scars
  for (let k = 0; k < 7; k++) {
    const x = r() * W, y = r() * H, w = 10 + r() * 22, h = 6 + r() * 16;
    wrapDraw(W, H, x, y, w * 2, (px, py) => {
      ctx.fillStyle = 'rgba(20,18,16,0.92)';
      ctx.beginPath();
      ctx.moveTo(px - w, py);
      ctx.quadraticCurveTo(px, py - h, px + w, py);
      ctx.quadraticCurveTo(px, py + h * 1.4, px - w, py);
      ctx.fill();
    });
  }
  blotches(ctx, W, H, r, 12, [60, 56, 44], [0.15, 0.35], [10, 40]);
  blotches(ctx, W, H, r, 8, [150, 110, 90], [0.1, 0.3], [6, 20]);
  return { canvas: c };
};

GEN.bark_dead = () => {
  const W = 256, H = 512;
  const r = rngf(421);
  const g = fbm(W, H, 24, 2, 4, 421, 0.55), a = fbm(W, H, 4, 6, 5, 422), bp = fbm(W, H, 5, 7, 5, 423);
  const wo = worley(W, H, 5, 6, 424);
  const img = newImg(W, H);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.7 + g[p] * 0.35 + (a[p] - 0.5) * 0.25 + (r() - 0.5) * 0.05;
    let R = 74 * k, G = 68 * k, B = 60 * k;
    const bark = sstep(0.5, 0.55, bp[p]);
    if (bark > 0) {
      const crev = 1 - sstep(0.03, 0.15, wo.f2[p] - wo.f1[p]);
      const bk = 0.8 + a[p] * 0.3;
      R = lerp(R, lerp(46 * bk, 16, crev), bark);
      G = lerp(G, lerp(38 * bk, 13, crev), bark);
      B = lerp(B, lerp(31 * bk, 11, crev), bark);
    }
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // vertical deep cracks
  for (let k = 0; k < 16; k++) {
    let x = r() * W, y = r() * H;
    const L = 80 + r() * 300;
    ctx.strokeStyle = `rgba(20,18,16,${0.5 + r() * 0.4})`;
    ctx.lineWidth = 0.8 + r() * 1.6;
    const pts = [[x, y]];
    for (let s = 0; s < L; s += 6) {
      x += (r() - 0.5) * 2;
      y += 6;
      pts.push([x, y]);
    }
    for (const oy of [-H, 0, H])
      for (const ox of [-W, 0, W]) {
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
        ctx.stroke();
      }
  }
  return { canvas: c };
};

GEN.pine = () => {
  // 512x512 atlas. Left half (u 0..0.5): drooping branch spray card, base at the bottom (v=0), tip at the top.
  // Right half (u 0.5..1): whole-conifer silhouette (layered drooping tiers) for crown cores / far billboards.
  // Sprays are irregular bottlebrush branchlets (ragged envelope, gaps), needles drawn dark -> light so the
  // lighter, newer needles sit on top; tips pale.
  const W = 512, H = 512;
  const r = rngf(431);
  const layers = [[], [], [], []];
  const shades = [
    ['rgb(16,26,19)', 'rgb(20,31,22)', 'rgb(24,35,24)'],
    ['rgb(28,41,28)', 'rgb(33,47,31)', 'rgb(38,52,33)'],
    ['rgb(44,59,37)', 'rgb(50,66,40)', 'rgb(46,62,36)'],
    ['rgb(62,80,47)', 'rgb(70,86,50)', 'rgb(58,74,44)'],
  ];
  const twig = 'rgb(44,33,24)';
  const R = new Rec();
  const inX = (x, x0, x1) => Math.max(x0, Math.min(x1, x));
  // one bottlebrush branchlet; `lit` 0..1 shifts its needles towards the lighter layers
  const brush = (x0, y0, ang, len, nl, dens, lit, xr) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    layers[0].push(['l', x0, y0, inX(x0 + dx * len, ...xr), y0 + dy * len, 1.3, twig]);
    const steps = Math.max(2, Math.floor(len / dens));
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const px = x0 + dx * len * u, py = y0 + dy * len * u;
      for (let q = 0; q < 3; q++) {
        const side = r() < 0.5 ? -1 : 1;
        const na = ang + side * lerp(0.35, 1.35, r());
        const l = nl * (1 - u * 0.35) * lerp(0.65, 1.25, r());
        const v = clamp(lit * 1.6 + 0.35 + (r() - 0.5) * 1.4 + (u > 0.8 ? 0.9 : 0), 0, 3.49);
        const L = Math.floor(v);
        const c = shades[L][Math.floor(r() * 3)];
        layers[L].push(['l', px, py, inX(px + Math.cos(na) * l, ...xr), py + Math.sin(na) * l, 1.5, c]);
      }
    }
  };
  // ---- spray (x 0..256)
  const SW = 256;
  const xr = [5, SW - 5];
  const stem = (t) => [SW / 2 + Math.sin(t * 2.2) * 8, H - 4 - t * (H - 14)];
  for (let t = 0.02; t < 0.99; t += 0.024) {
    for (const side of [-1, 1]) {
      if (r() < 0.12) continue;
      const tt = t + (side > 0 ? 0.012 : 0) + (r() - 0.5) * 0.01;
      const env = Math.pow(Math.sin(Math.PI * clamp(tt * 0.82 + 0.12)), 0.55) * (0.5 + 0.5 * tt);
      const len = SW * 0.47 * env * lerp(0.55, 1.08, r());
      if (len < 8) continue;
      const [x0, y0] = stem(tt);
      const ang = -Math.PI / 2 + side * lerp(0.75, 1.15, r());
      const lit = r() * 0.8 + tt * 0.3;
      brush(x0, y0, ang, len, 11, 2.6, lit, xr);
      // secondary branchlets
      const n2 = Math.floor(len / 22);
      for (let k = 0; k < n2; k++) {
        if (r() < 0.25) continue;
        const u = (k + 0.5 + r() * 0.4) / (n2 + 0.6);
        const px = x0 + Math.cos(ang) * len * u, py = y0 + Math.sin(ang) * len * u;
        const a2 = ang + (r() < 0.5 ? -1 : 1) * lerp(0.35, 0.9, r());
        brush(px, py, a2, len * lerp(0.25, 0.45, r()) * (1 - u * 0.4), 9, 2.8, lit + 0.15, xr);
      }
    }
  }
  for (let t = 0.0; t < 1; t += 0.008) {
    const [x, y] = stem(t);
    for (const sd of [-1, 1]) {
      const na = -Math.PI / 2 + sd * lerp(0.4, 1.2, r());
      layers[t > 0.9 ? 3 : 1].push(['l', x, y, x + Math.cos(na) * 11, y + Math.sin(na) * 11, 1.5, t > 0.9 ? shades[3][0] : shades[1][Math.floor(r() * 3)]]);
    }
  }
  // ---- silhouette (x 256..512), apex at top, widest at the bottom: tiers of drooping brushes
  const cx = 384;
  const xs = [SW + 4, W - 4];
  for (let y = 12; y < H - 6; y += 6) {
    const t = (y - 12) / (H - 18);
    const hw = 6 + t * 114 * lerp(0.8, 1.05, r());
    for (const side of [-1, 1]) {
      const n = 1 + Math.floor(hw / 30);
      for (let k = 0; k < n; k++) {
        const L = hw * lerp(0.5, 1, r());
        const a = Math.PI / 2 - side * (Math.PI / 2 - lerp(0.25, 0.55, r()));
        brush(cx, y, a, L, 8, 3.4, r() * 0.7, xs);
      }
    }
  }
  layers[0].unshift(['l', cx, 6, cx, H - 2, 3, 'rgb(40,30,22)']);
  for (const layer of layers) for (const [, x0, y0, x1, y1, w, c] of layer) R.line(x0, y0, x1, y1, w, c);
  // clamped: with repeat, card edges sample the opposite edge of the atlas (dotted spokes above crowns)
  return { ...R.toImg(W, H, [26, 38, 27]), clamp: true };
};

GEN.leaves = () => {
  const W = 256;
  const r = rngf(441);
  const R = new Rec();
  const cols = ['rgb(150,110,40)', 'rgb(128,78,30)', 'rgb(106,84,40)', 'rgb(160,124,52)', 'rgb(90,60,28)', 'rgb(122,96,36)'];
  const twig = (x, y, ang, len, depth) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    R.line(x, y, x1, y1, depth === 0 ? 2.6 : 1.4, 'rgb(52,40,30)');
    const nLeaves = Math.floor(len / 14);
    for (let k = 0; k < nLeaves; k++) {
      const u = (k + 0.5) / nLeaves;
      const px = lerp(x, x1, u), py = lerp(y, y1, u);
      if (r() < 0.35) continue;
      const la = ang + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.9);
      const L = 9 + r() * 8;
      const cx = px + Math.cos(la) * L, cy = py + Math.sin(la) * L;
      R.line(px, py, cx, cy, 1, 'rgb(60,46,30)');
      R.ell(cx, cy, L * 0.55, L * 0.32, la, cols[Math.floor(r() * cols.length)]);
    }
    if (depth < 2)
      for (let k = 0; k < 2; k++) {
        const u = 0.3 + r() * 0.6;
        twig(lerp(x, x1, u), lerp(y, y1, u), ang + (r() - 0.5) * 1.8, len * 0.55, depth + 1);
      }
  };
  twig(W / 2, W - 4, -Math.PI / 2 + (r() - 0.5) * 0.3, W * 0.72, 0);
  twig(W / 2, W - 4, -Math.PI / 2 - 0.7, W * 0.45, 1);
  twig(W / 2, W - 4, -Math.PI / 2 + 0.7, W * 0.45, 1);
  return { ...R.toImg(W, W, [110, 84, 40]), clamp: true };
};

GEN.bush = () => {
  const W = 256;
  const r = rngf(451);
  const R = new Rec();
  const cols = ['rgb(28,40,24)', 'rgb(36,50,28)', 'rgb(46,58,30)', 'rgb(62,66,34)', 'rgb(74,64,36)', 'rgb(24,32,20)'];
  // twigs
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
    const l = 70 + r() * 110;
    R.line(W / 2 + (r() - 0.5) * 30, W - 2, W / 2 + Math.cos(a) * l, W - 2 + Math.sin(a) * l, 2, 'rgb(44,34,26)');
  }
  // leaves inside a dome
  for (let k = 0; k < 1100; k++) {
    const a = r() * Math.PI, rr = Math.sqrt(r()) * 0.98;
    const x = W / 2 + Math.cos(a) * rr * W * 0.48;
    const y = W - 4 - Math.sin(a) * rr * W * 0.9;
    const edge = rr > 0.85;
    if (edge && r() < 0.4) continue;
    const low = y > W * 0.75 ? 0.6 : 1;
    const c = low < 1 && r() < 0.6 ? cols[5] : cols[Math.floor(r() * 5)];
    R.ell(x, y, 3 + r() * 3.2, 1.6 + r() * 1.8, r() * 3.14, c);
  }
  return { ...R.toImg(W, W, [34, 44, 26]), clamp: true };
};

GEN.fern = () => {
  const W = 128, H = 512;
  const r = rngf(461);
  const R = new Rec();
  const cols = ['rgb(34,58,28)', 'rgb(42,66,32)', 'rgb(52,74,36)', 'rgb(30,48,26)'];
  const brown = ['rgb(96,74,40)', 'rgb(80,62,34)'];
  const bx = W / 2;
  R.line(bx, H - 2, bx, 10, 2.2, 'rgb(44,54,28)');
  for (let y = H - 30; y > 14; y -= 9) {
    const t = 1 - (y - 14) / (H - 44);
    const len = (W * 0.46) * Math.pow(Math.sin(Math.PI * clamp(1 - t * 0.95)), 0.6);
    for (const sd of [-1, 1]) {
      const ang = sd > 0 ? -0.35 : Math.PI + 0.35;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const x0 = bx, y0 = y + (sd > 0 ? 3 : 0);
      R.line(x0, y0, x0 + dx * len, y0 + dy * len, 1, 'rgb(40,54,28)');
      const nl = Math.max(2, Math.floor(len / 4));
      const brownTip = r() < 0.15;
      for (let k = 0; k < nl; k++) {
        const u = (k + 0.5) / nl;
        const px = x0 + dx * len * u, py = y0 + dy * len * u;
        const lobe = 3.4 * (1 - u * 0.6);
        const c = brownTip && u > 0.5 ? brown[Math.floor(r() * 2)] : cols[Math.floor(r() * 4)];
        R.ell(px, py - 2.5, lobe * 0.7, lobe, ang, c);
        R.ell(px, py + 2.5, lobe * 0.7, lobe, ang, c);
      }
    }
  }
  return { ...R.toImg(W, H, [38, 60, 30]), clamp: true };
};

GEN.grass_blade = () => {
  // dense clump card: a low layer of short blades fills the base, taller blades and a few straw ones on top
  // (base -> tip darkening and straw tips come from the vertex attributes)
  const W = 256;
  const r = rngf(471);
  const R = new Rec();
  const low = ['rgb(46,56,30)', 'rgb(54,64,33)', 'rgb(42,52,28)', 'rgb(60,68,36)'];
  const mid = ['rgb(66,76,39)', 'rgb(76,84,43)', 'rgb(86,92,48)', 'rgb(70,76,40)', 'rgb(94,96,52)'];
  const straw = ['rgb(124,114,72)', 'rgb(110,100,62)', 'rgb(138,124,80)'];
  const blade = (x0, h, lean, w, c) => {
    // keep every blade inside the card: clipped blades leave straight edges
    lean = Math.max(8 - x0, Math.min(W - 8 - x0, lean));
    const cx = x0 + lean * 0.3, cy = W - h * 0.55;
    const tx = x0 + lean, ty = W - h;
    const pts = [];
    const N = 8;
    const P = (t) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * W + 2 * (1 - t) * t * cy + t * t * ty];
    for (let s = 0; s <= N; s++) {
      const t = s / N, [px, py] = P(t);
      pts.push(px - w * (1 - t) * 0.5, py);
    }
    for (let s = N; s >= 0; s--) {
      const t = s / N, [px, py] = P(t);
      pts.push(px + w * (1 - t) * 0.5, py);
    }
    R.poly(pts, c);
  };
  for (let k = 0; k < 80; k++) blade(6 + r() * (W - 12), 50 + r() * 90, (r() - 0.5) * 70, 2.2 + r() * 2.6, low[Math.floor(r() * low.length)]);
  for (let k = 0; k < 64; k++) {
    const dry = r() < 0.22;
    const h = 110 + r() * 140;
    const x0 = 10 + r() * (W - 20);
    blade(x0, h, (r() - 0.5) * 100, 2.2 + r() * 3, dry ? straw[Math.floor(r() * straw.length)] : mid[Math.floor(r() * mid.length)]);
    if (dry && r() < 0.35) for (let s = 0; s < 6; s++) R.ell(x0 + (r() - 0.5) * 6 + (r() - 0.5) * 20, W - h + s * 4, 1.8, 3.2, 0.3, 'rgb(128,110,70)');
  }
  return { ...R.toImg(W, W, [62, 70, 38]), clamp: true };
};

GEN.rock = () => {
  const W = 512;
  const r = rngf(481);
  const a = fbm(W, W, 4, 4, 6, 481, 0.55), b = fbm(W, W, 20, 20, 3, 482), wo = worley(W, W, 6, 6, 483);
  const li = fbm(W, W, 10, 10, 4, 484);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const vein = 1 - sstep(0.0, 0.05, wo.f2[p] - wo.f1[p]);
    let k = 0.62 + a[p] * 0.45 + (b[p] - 0.5) * 0.15 + (r() - 0.5) * 0.12 - vein * 0.08;
    const sp = r();
    if (sp < 0.03) k *= 0.6;
    else if (sp > 0.98) k *= 1.25;
    let R = 108 * k, G = 106 * k, B = 100 * k;
    const l = sstep(0.74, 0.82, li[p]) * 0.6;
    R = lerp(R, 128, l);
    G = lerp(G, 132, l);
    B = lerp(B, 100, l);
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drawCracks(ctx, W, W, r, 8, { len: [40, 200], width: [0.8, 1.6], col: 'rgba(22,20,18,0.8)', light: 'rgba(160,156,146,0.25)', wander: 0.4, step: 5 });
  chips(ctx, W, W, r, 60, (rr) => (rr() < 0.5 ? 'rgba(150,120,60,0.5)' : 'rgba(140,146,110,0.5)'), [1, 3]);
  return { canvas: c };
};
