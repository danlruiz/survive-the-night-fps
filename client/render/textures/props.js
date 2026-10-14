// The surfaces props are made of: painted metal, chrome, rubber, cloth, bone, plastic, cardboard...
import { rngf, lerp, sstep, fbm, worley, mkCanvas, filledCanvas, mixFields, ctx2d, newImg, imgToCanvas, canvasToImg, wrapDraw, eachPx, drawCracks, blotches, withField, scratches, chips } from './kit.js';
const GEN = {};
export { GEN as PROP_GEN };

// Painted sheet metal, clean. RGB: light neutral paint (tinted by vertex colour) - faintly mottled, scuffed,
// dulled in patches where the gloss has gone. A = where rust breaks through: broad weak spots plus the stone
// chips and scratches that always go first. The rust itself is laid on in the shader (SURF.paint / carpaint),
// by world-space noise, so no two cars corrode alike.
function paintedImg(W, seed, { streaks = 0.5, chipsN = 120, scuffs = 160 } = {}) {
  const r = rngf(seed);
  const a = fbm(W, W, 6, 6, 5, seed, 0.55), dull = fbm(W, W, 12, 12, 4, seed + 2), vs = fbm(W, W, 26, 2, 4, seed + 1);
  const rs = fbm(W, W, 10, 10, 5, seed + 3, 0.6), fine = fbm(W, W, 40, 40, 3, seed + 4);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    // gloss gone in patches: flatter and a touch paler
    const flat = sstep(0.5, 0.75, dull[p]);
    const k = (0.9 + a[p] * 0.14) * (1 - streaks * 0.16 + streaks * 0.2 * vs[p]) * (1 + flat * 0.05) + (fine[p] - 0.5) * 0.05;
    d[i] = 216 * k;
    d[i + 1] = 214 * k;
    d[i + 2] = lerp(208, 198, flat) * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  scratches(ctx, W, W, r, scuffs, 'rgba(250,250,246,0.16)', [6, 40]);
  scratches(ctx, W, W, r, scuffs / 2, 'rgba(40,38,34,0.2)', [4, 26]);
  blotches(ctx, W, W, r, 26, [60, 54, 44], [0.04, 0.1], [10, 46]);
  // chips and deep scratches, as a mask
  const [m, mx] = filledCanvas(W, W, '#000');
  chips(mx, W, W, r, chipsN, '#fff', [0.8, 3.6]);
  scratches(mx, W, W, r, chipsN / 4, '#fff', [6, 30]);
  const cm = canvasToImg(m).d;
  const field = new Float32Array(W * W);
  for (let p = 0; p < field.length; p++) field[p] = Math.max(rs[p] * 0.72 + fine[p] * 0.28, (cm[p * 4] / 255) * 1.1);
  return withField(c, field);
}
GEN.paint = () => paintedImg(512, 191, { streaks: 0.7, chipsN: 150 });
// brightwork: bumpers, handles, rims. Pitted where the plating has failed; A = where rust takes first.
GEN.chrome = () => {
  const W = 256;
  const r = rngf(205);
  const a = fbm(W, W, 5, 5, 5, 205), pit = fbm(W, W, 40, 40, 3, 206), rs = fbm(W, W, 12, 12, 4, 207, 0.6);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = (0.84 + a[p] * 0.2) * (1 - sstep(0.62, 0.8, pit[p]) * 0.3) + (r() - 0.5) * 0.03;
    d[i] = 150 * k;
    d[i + 1] = 153 * k;
    d[i + 2] = 156 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  scratches(ctx, W, W, r, 120, 'rgba(236,238,240,0.3)', [4, 30]);
  scratches(ctx, W, W, r, 50, 'rgba(30,30,32,0.3)', [4, 20]);
  return withField(c, mixFields(rs, 0.6, pit, 0.4));
};
// aircraft skin (4 m): light neutral paint - tinted by vertex colour - with riveted panel seams, a slightly
// different tone per panel and faint streaks of weathering. Tileable (seams wrap).
GEN.aircraft = () => {
  const W = 512;
  const r = rngf(733);
  const a = fbm(W, W, 4, 4, 5, 733), st = fbm(W, W, 36, 3, 4, 734);
  const ROWS = 4;
  const rh = W / ROWS;
  const cuts = [];
  for (let k = 0; k < ROWS; k++) {
    const row = [];
    let x = Math.floor(r() * 120);
    while (x < W) {
      row.push(x);
      x += 96 + Math.floor(r() * 110);
    }
    cuts.push(row);
  }
  const tone = [];
  for (let k = 0; k < ROWS * 16; k++) tone.push(0.955 + r() * 0.09);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const row = Math.floor(y / rh);
    const cs = cuts[row];
    let col = 0;
    let dc = W;
    for (let c = 0; c < cs.length; c++) {
      if (cs[c] <= x) col = c + 1;
      const dd = Math.abs(x - cs[c]);
      dc = Math.min(dc, dd, W - dd);
    }
    const dr = Math.min(y % rh, rh - (y % rh));
    let k = (0.88 + 0.16 * a[p]) * (0.93 + 0.1 * st[p]) * tone[row * 16 + (col % cs.length)];
    if (dr < 1.5 || dc < 1.5) k *= 0.8; // seam
    else if ((dr > 4 && dr < 6 && x % 9 < 2) || (dc > 4 && dc < 6 && y % 9 < 2)) k *= 0.92; // rivet rows
    d[i] = 214 * k;
    d[i + 1] = 212 * k;
    d[i + 2] = 207 * k;
    d[i + 3] = 255;
  });
  return img;
};
GEN.carpaint = () => paintedImg(512, 201, { streaks: 0.15, chipsN: 110, scuffs: 220 });

GEN.tire = () => {
  const W = 256;
  const r = rngf(211);
  const a = fbm(W, W, 6, 6, 4, 211);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    // tread blocks: lateral grooves every 16px (u = around), zig-zag center groove
    const lx = x % 16;
    const zig = 128 + Math.abs(((x / 8) % 2) - 1) * 10 - 5;
    let k = 1;
    if (lx < 3) k = 0.45;
    if (Math.abs(y - zig) < 3 || Math.abs(y - 64) < 2 || Math.abs(y - 192) < 2) k = 0.45;
    const dust = sstep(0.5, 0.9, a[p]) * 0.5;
    const v = (30 + a[p] * 10 + (r() - 0.5) * 5) * k;
    d[i] = lerp(v, 78, dust);
    d[i + 1] = lerp(v, 70, dust);
    d[i + 2] = lerp(v, 60, dust);
    d[i + 3] = 255;
  });
  return { canvas: imgToCanvas(img) };
};

GEN.cloth = () => {
  const W = 256;
  const r = rngf(221);
  const a = fbm(W, W, 4, 4, 5, 221), f = fbm(W, W, 3, 10, 4, 222);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const weave = 0.92 + 0.08 * ((x + (y % 2)) % 2);
    const k = (0.7 + a[p] * 0.25 + (f[p] - 0.5) * 0.35) * weave;
    d[i] = 214 * k;
    d[i + 1] = 210 * k;
    d[i + 2] = 200 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 20, (rr) => (rr() < 0.3 ? [70, 16, 10] : [60, 48, 30]), [0.15, 0.4], [6, 30]);
  chips(ctx, W, W, r, 8, 'rgba(10,8,6,0.9)', [1.5, 5]);
  return { canvas: c };
};

GEN.burlap = () => {
  const W = 256;
  const r = rngf(231);
  const a = fbm(W, W, 5, 5, 4, 231);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const tx = Math.abs(Math.sin((x + a[p] * 3) * 0.8)), ty = Math.abs(Math.sin((y + a[p] * 3) * 0.8));
    const thread = Math.max(tx * ((x >> 2) % 2 ? 1 : 0.6), ty * ((y >> 2) % 2 ? 0.6 : 1));
    const k = (0.35 + 0.65 * thread) * (0.75 + a[p] * 0.4) + (r() - 0.5) * 0.08;
    d[i] = 150 * k;
    d[i + 1] = 124 * k;
    d[i + 2] = 84 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  blotches(ctx2d(c), W, W, r, 14, [40, 30, 18], [0.15, 0.4], [8, 40]);
  return { canvas: c };
};

GEN.bone = () => {
  const W = 128;
  const r = rngf(241);
  const a = fbm(W, W, 4, 4, 5, 241);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const k = 0.7 + a[i >> 2] * 0.35 + (r() - 0.5) * 0.05;
    d[i] = 186 * k;
    d[i + 1] = 176 * k;
    d[i + 2] = 150 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 10, [60, 44, 26], [0.2, 0.5], [4, 18]);
  drawCracks(ctx, W, W, r, 4, { len: [10, 40], width: [0.5, 0.9], col: 'rgba(40,30,20,0.6)', step: 3 });
  return { canvas: c };
};

GEN.charred = () => {
  const W = 256;
  const r = rngf(251);
  const wo = worley(W, W, 10, 16, 251);
  const a = fbm(W, W, 5, 5, 4, 252);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const e = wo.f2[p] - wo.f1[p];
    const crack = 1 - sstep(0.02, 0.09, e);
    const k = 16 + a[p] * 22 + (r() - 0.5) * 6;
    d[i] = lerp(k * 1.05, 64, crack * 0.5);
    d[i + 1] = lerp(k, 56, crack * 0.5);
    d[i + 2] = lerp(k * 0.92, 50, crack * 0.5);
    const ember = crack * sstep(0.7, 0.9, a[p]);
    d[i] = lerp(d[i], 110, ember * 0.5);
    d[i + 1] = lerp(d[i + 1], 40, ember * 0.4);
    d[i + 3] = 255;
  });
  return { canvas: imgToCanvas(img) };
};

GEN.endgrain = () => {
  const W = 128;
  const r = rngf(261);
  const a = fbm(W, W, 4, 4, 4, 261);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const dx = x - 64 + (a[i >> 2] - 0.5) * 6, dy = y - 64 + (a[i >> 2] - 0.5) * 6;
    const rr = Math.sqrt(dx * dx + dy * dy);
    const ring = 0.75 + 0.25 * Math.sin(rr * 1.3 + a[i >> 2] * 4);
    let R = 128 * ring, G = 104 * ring, B = 74 * ring;
    if (rr > 56) {
      R = 50;
      G = 38;
      B = 28;
    } else if (rr > 52) {
      R *= 0.7;
      G *= 0.7;
      B *= 0.7;
    }
    const k = 0.85 + (r() - 0.5) * 0.1;
    d[i] = R * k;
    d[i + 1] = G * k;
    d[i + 2] = B * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  ctx.strokeStyle = 'rgba(30,20,14,0.8)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) {
    const an = r() * 6.28;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(an) * 50, 64 + Math.sin(an) * 50);
    ctx.stroke();
  }
  return { canvas: c };
};

GEN.skin = () => {
  const W = 256;
  const r = rngf(271);
  const a = fbm(W, W, 5, 5, 5, 271), b = fbm(W, W, 3, 3, 4, 272);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = 0.78 + a[p] * 0.3;
    const bruise = sstep(0.62, 0.85, b[p]) * 0.6;
    d[i] = lerp(150 * k, 80, bruise);
    d[i + 1] = lerp(142 * k, 70, bruise);
    d[i + 2] = lerp(120 * k, 82, bruise);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  blotches(ctx2d(c), W, W, r, 16, [70, 10, 8], [0.3, 0.7], [4, 22]);
  return { canvas: c };
};

GEN.mattress = () => {
  const W = 256;
  const r = rngf(281);
  const a = fbm(W, W, 4, 4, 5, 281);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const s = (x % 32) < 10 ? [96, 110, 124] : [196, 188, 170];
    const k = 0.72 + a[i >> 2] * 0.3;
    const quilt = (x % 64 < 1 || y % 64 < 1) ? 0.75 : 1;
    d[i] = s[0] * k * quilt;
    d[i + 1] = s[1] * k * quilt;
    d[i + 2] = s[2] * k * quilt;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  for (let k = 0; k < 6; k++) {
    const x = r() * W, y = r() * W, R = 20 + r() * 40;
    wrapDraw(W, W, x, y, R, (px, py) => {
      ctx.strokeStyle = 'rgba(110,84,30,0.5)';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(150,120,50,0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py, R, R * 0.8, r() * 3, 0, 7);
      ctx.fill();
      ctx.stroke();
    });
  }
  blotches(ctx, W, W, r, 5, [80, 8, 6], [0.5, 0.8], [8, 26]);
  return { canvas: c };
};

GEN.plastic = () => {
  const W = 256;
  const r = rngf(291);
  const a = fbm(W, W, 3, 8, 5, 291), b = fbm(W, W, 8, 3, 4, 292);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const wr = Math.abs(a[p] - 0.5) < 0.03 || Math.abs(b[p] - 0.5) < 0.025 ? 1.9 : 1;
    const v = (18 + a[p] * 12) * wr + (r() - 0.5) * 3;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v * 1.08;
    d[i + 3] = 255;
  });
  return { canvas: imgToCanvas(img) };
};

GEN.pumpkin = () => {
  const W = 256;
  const a = fbm(W, W, 5, 5, 5, 301), rot = fbm(W, W, 4, 4, 5, 302);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const rib = 0.8 + 0.2 * Math.abs(Math.sin((x / W) * Math.PI * 8));
    const k = (0.75 + a[p] * 0.35) * rib;
    let R = 168 * k, G = 86 * k, B = 26 * k;
    const rt = sstep(0.6, 0.78, rot[p]);
    R = lerp(R, 40, rt);
    G = lerp(G, 32, rt);
    B = lerp(B, 18, rt);
    const mold = sstep(0.8, 0.9, rot[p]) * 0.7;
    d[i] = lerp(R, 110, mold);
    d[i + 1] = lerp(G, 112, mold);
    d[i + 2] = lerp(B, 96, mold);
    d[i + 3] = 255;
  });
  return { canvas: imgToCanvas(img) };
};

GEN.ash = () => {
  const W = 256;
  const r = rngf(311);
  const a = fbm(W, W, 6, 6, 5, 311);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const v = 44 + a[i >> 2] * 60 + (r() - 0.5) * 18;
    d[i] = v;
    d[i + 1] = v * 0.97;
    d[i + 2] = v * 0.94;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  chips(ctx2d(c), W, W, r, 160, (rr) => (rr() < 0.7 ? 'rgba(12,10,9,0.9)' : 'rgba(60,40,30,0.8)'), [1, 5]);
  return { canvas: c };
};

GEN.cardboard = () => {
  const W = 256;
  const r = rngf(321);
  const a = fbm(W, W, 4, 4, 5, 321);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const k = (0.78 + a[i >> 2] * 0.3) * (y % 6 < 1 ? 0.94 : 1);
    d[i] = 150 * k;
    d[i + 1] = 118 * k;
    d[i + 2] = 78 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 12, [60, 44, 26], [0.2, 0.45], [8, 36]);
  ctx.fillStyle = 'rgba(170,160,130,0.55)';
  ctx.fillRect(0, 118, W, 20);
  return { canvas: c };
};

// ---------------------------------------------------------------- burlap scarecrow head (equirect, face at u=0.75)
GEN.scareface = () => {
  const W = 256, H = 128;
  const base = canvasToImg(GEN.burlap().canvas);
  const c = mkCanvas(W, H);
  const ctx = ctx2d(c);
  ctx.drawImage(imgToCanvas(base), 0, 0, 256, 256, 0, 0, W, H);
  ctx.drawImage(imgToCanvas(base), 0, 0, 256, 256, 0, 0, W, H);
  const cx = W * 0.75, cy = H * 0.5;
  ctx.strokeStyle = 'rgba(16,10,8,0.95)';
  ctx.lineCap = 'round';
  // X-stitched eyes (uneven)
  ctx.lineWidth = 3;
  for (const [ex, ey, s] of [[cx - 17, cy - 10, 8], [cx + 15, cy - 12, 6]]) {
    ctx.beginPath();
    ctx.moveTo(ex - s, ey - s);
    ctx.lineTo(ex + s, ey + s);
    ctx.moveTo(ex + s, ey - s);
    ctx.lineTo(ex - s, ey + s);
    ctx.stroke();
  }
  // dark hollow eye stains
  ctx.fillStyle = 'rgba(20,12,8,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - 17, cy - 8, 12, 12, 0, 0, 7);
  ctx.ellipse(cx + 15, cy - 10, 10, 10, 0, 0, 7);
  ctx.fill();
  // stitched grin
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy + 12);
  ctx.quadraticCurveTo(cx, cy + 26, cx + 24, cy + 9);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const x = lerp(cx - 26, cx + 24, t), y = cy + 12 + Math.sin(t * Math.PI) * 9 - t * 3;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 5);
    ctx.lineTo(x + 1, y + 5);
    ctx.stroke();
  }
  // blood drip from mouth
  ctx.fillStyle = 'rgba(70,10,6,0.6)';
  ctx.fillRect(cx - 4, cy + 20, 3, 20);
  ctx.fillRect(cx + 6, cy + 19, 2, 12);
  return { canvas: c };
};
