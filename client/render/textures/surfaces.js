// The building and structure surfaces: boards, siding, masonry, roofing, sheet metal, glass, doors, canvas.
import { rngf, clamp, lerp, sstep, fbm, worley, filledCanvas, mixFields, ctx2d, newImg, imgToCanvas, canvasToImg, rgb, rgbA, wrapDraw, eachPx, colorRamp, drawCracks, woodGrainImg, boardsImg, nailsOnBoards, drips, blotches, lumHeight, withField, scratches, chips } from './kit.js';
const GEN = {};
export { GEN as SURFACE_GEN };

// ---------------------------------------------------------------- building surfaces
GEN.wood = () => {
  const W = 256;
  const img = woodGrainImg(W, W, 11, [128, 114, 97], [62, 53, 44], { rings: 14 });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  const r = rngf(12);
  drawCracks(ctx, W, W, r, 5, { len: [30, 120], width: [0.6, 1.2], wander: 0.12, step: 4, col: 'rgba(25,20,16,0.6)', along: 0 });
  // knots
  for (let k = 0; k < 2; k++) {
    const x = r() * W, y = r() * W;
    wrapDraw(W, W, x, y, 12, (px, py) => {
      ctx.fillStyle = 'rgba(45,34,26,0.8)';
      ctx.beginPath();
      ctx.ellipse(px, py, 5 + r() * 3, 3, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,46,36,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, py, 9, 5, 0, 0, 7);
      ctx.stroke();
    });
  }
  return { canvas: c };
};

GEN.planks = () => {
  const W = 512;
  const r = rngf(21);
  const info = boardsImg({ W, H: W, n: 8, seed: 21, light: [134, 120, 102], dark: [66, 57, 48], tone: 0.14, joints: 1 });
  const c = imgToCanvas(info.img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 40, [18, 14, 10], [0.05, 0.16]);
  nailsOnBoards(ctx, W, W, info, r);
  drawCracks(ctx, W, W, r, 10, { len: [20, 90], wander: 0.1, step: 4, width: [0.6, 1.1], col: 'rgba(20,16,12,0.55)', along: 0 });
  return { canvas: c, height: info.height, relief: 0.012 };
};

// barn boards, bare: grey weathered wood, nails and their rust runs. A = how well paint holds - it wears
// through along the grain and lets go first at the board edges. The red is laid on in the shader.
GEN.barn = () => {
  const W = 512;
  const r = rngf(31);
  const info = boardsImg({ W, H: W, n: 10, seed: 31, vertical: true, light: [128, 120, 110], dark: [66, 60, 54], tone: 0.1, joints: 1 });
  const streak = fbm(W, W, 30, 3, 4, 32, 0.6);
  const fine = fbm(W, W, 48, 16, 3, 35, 0.6);
  const field = new Float32Array(W * W);
  for (let p = 0; p < field.length; p++) {
    const lv = (p % W) % info.bw;
    field[p] = 1 - (streak[p] * 0.62 + fine[p] * 0.38) - (lv < 6 || lv > info.bw - 5 ? 0.14 : 0);
  }
  const c = imgToCanvas(info.img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 50, [26, 16, 12], [0.05, 0.16], [40, 260], [2, 10]);
  nailsOnBoards(ctx, W, W, info, r, { studs: 2 });
  return { ...withField(c, field), height: info.height, relief: 0.012 };
};

// lap siding, bare: weathered grey boards with the shadow of each lap, butt joints and nail heads. A = how
// well paint holds: small flakes, and water sits on the lower edge of every board, where it lets go first.
// The paint, in each building's own colour, is laid on in the shader.
GEN.clapboard = () => {
  const W = 512, n = 16, bh = W / n;
  const r = rngf(41);
  const grain = woodGrainImg(W, W, 41, [150, 144, 132], [104, 98, 90], { rings: 40, streak: 0.5, wave: 1, knots: 2, lineDark: 0.2 });
  const fine = fbm(W, W, 40, 20, 4, 42, 0.6);
  const flake = fbm(W, W, 16, 12, 4, 46, 0.55);
  const vs = fbm(W, W, 36, 2, 4, 44);
  const tone = [], off = [];
  for (let b = 0; b < n; b++) {
    tone.push(0.92 + r() * 0.14);
    off.push(Math.floor(r() * W));
  }
  const img = newImg(W, W);
  const field = new Float32Array(W * W), height = new Float32Array(W * W);
  const d = img.d, gd = grain.d;
  for (let y = 0, i = 0, p = 0; y < W; y++) {
    const b = Math.floor(y / bh), lv = y % bh;
    // the board above casts a shadow on the top of this one; its own butt edge is in shade
    let shade = lv < 1.5 ? 0.34 : lv < 6 ? lerp(0.6, 0.96, (lv - 1.5) / 4.5) : 1;
    if (lv >= bh - 1.5) shade = 0.76;
    const edgeBias = sstep(bh * 0.5, bh - 1, lv) * 0.2 + (lv < 5 ? 0.06 : 0);
    for (let x = 0; x < W; x++, i += 4, p++) {
      const gi = (y * W + ((x + off[b]) % W)) * 4;
      const g = (0.86 + 0.14 * vs[p]) * shade * tone[b];
      d[i] = gd[gi] * g;
      d[i + 1] = gd[gi + 1] * g;
      d[i + 2] = gd[gi + 2] * g;
      d[i + 3] = 255;
      field[p] = 1 - (flake[p] * 0.6 + fine[p] * 0.4) - edgeBias;
      // each board leans out toward its lower edge, then steps back under the next
      height[p] = lv < 1.5 ? 0 : 0.12 + (lv / bh) * 0.8 + (gd[gi] / 255 - 0.5) * 0.12;
    }
  }
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 40, [50, 44, 34], [0.04, 0.12], [40, 260], [2, 10]);
  // butt joints and nail heads (with the odd rust run)
  for (let b = 0; b < n; b++) {
    const x = r() * W;
    ctx.fillStyle = 'rgba(30,26,22,0.7)';
    wrapDraw(W, W, x, b * bh + bh / 2, 4, (px) => ctx.fillRect(px, b * bh + 1.5, 1.4, bh - 2));
    for (let s = 0; s < 5; s++) {
      const nx = ((s + 0.5) / 5) * W + (r() - 0.5) * 8, ny = b * bh + bh - 6;
      if (r() < 0.3) {
        const gg = ctx.createLinearGradient(0, ny, 0, ny + 26);
        gg.addColorStop(0, 'rgba(96,52,24,0.4)');
        gg.addColorStop(1, 'rgba(96,52,24,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(nx - 1.2, ny, 2.4, 26);
      }
      ctx.fillStyle = 'rgba(40,34,28,0.85)';
      ctx.fillRect(nx - 1, ny - 1, 2, 2);
    }
  }
  return { ...withField(c, field), height, relief: 0.014 };
};

GEN.logwall = () => {
  const W = 512, n = 8, bh = W / n;
  const r = rngf(51);
  const grain = woodGrainImg(W, W, 51, [116, 90, 64], [52, 38, 27], { rings: 30, streak: 0.8, wave: 1.4, knots: 5 });
  const ch = fbm(W, W, 16, 8, 4, 52);
  const dirt = fbm(W, W, 5, 5, 4, 53);
  const img = newImg(W, W);
  const height = new Float32Array(W * W);
  const d = img.d, gd = grain.d;
  const off = [];
  for (let b = 0; b < n; b++) off.push(Math.floor(r() * W));
  for (let y = 0, i = 0, p = 0; y < W; y++) {
    const b = Math.floor(y / bh), lv = y - b * bh;
    for (let x = 0; x < W; x++, i += 4, p++) {
      const wob = (ch[p] - 0.5) * 7;
      const chinkH = 9 + wob;
      if (lv < chinkH * 0.5 || lv > bh - chinkH * 0.5) {
        // mortar chinking, set back between the logs: dirty, and dark under the log above
        const v = (84 + ch[p] * 36 - 30 * dirt[p]) * (lv < bh / 2 ? 0.62 : 1);
        d[i] = v;
        d[i + 1] = v * 0.94;
        d[i + 2] = v * 0.84;
        height[p] = 0.1 + ch[p] * 0.08;
      } else {
        const t = (lv - chinkH * 0.5) / (bh - chinkH);
        const s = Math.pow(Math.sin(Math.PI * t), 0.55);
        const gi = (((y + off[b]) % W) * W + ((x + off[b] * 3) % W)) * 4;
        const k = (0.56 + 0.52 * s * (1 - 0.2 * t)) * (0.8 + 0.3 * dirt[p]);
        d[i] = gd[gi] * k;
        d[i + 1] = gd[gi + 1] * k;
        d[i + 2] = gd[gi + 2] * k;
        height[p] = 0.2 + s * 0.74 + (gd[gi] / 255 - 0.3) * 0.12;
      }
      d[i + 3] = 255;
    }
  }
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // checks (cracks along logs)
  drawCracks(ctx, W, W, r, 22, { len: [30, 140], wander: 0.08, step: 5, width: [0.8, 1.6], col: 'rgba(22,16,12,0.7)', branch: 0, along: 0 });
  drips(ctx, W, W, r, 30, [20, 15, 10], [0.05, 0.14]);
  return { canvas: c, height, relief: 0.05 };
};

GEN.concrete = () => {
  const W = 512;
  const r = rngf(61);
  const a = fbm(W, W, 6, 6, 6, 61, 0.55), b = fbm(W, W, 16, 16, 3, 62);
  const st = fbm(W, W, 26, 2, 4, 63), agg = fbm(W, W, 96, 96, 2, 66);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    // cement with a fine aggregate grain and a little run-off streaking
    let v = 0.46 + (a[p] - 0.5) * 0.3 + (b[p] - 0.5) * 0.14 + (agg[p] - 0.5) * 0.16 + (r() - 0.5) * 0.06;
    v *= 0.9 + 0.12 * st[p];
    d[i] = lerp(48, 132, v);
    d[i + 1] = lerp(47, 129, v);
    d[i + 2] = lerp(44, 121, v);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 14, [30, 28, 24], [0.05, 0.13], [16, 50]);
  drips(ctx, W, W, r, 24, [24, 24, 20], [0.04, 0.12], [60, 260], [4, 16]);
  // bug holes left by air against the formwork
  for (let k = 0; k < 220; k++) {
    const x = r() * W, y = r() * W, R = 0.6 + r() * 1.5;
    ctx.fillStyle = `rgba(26,26,24,${0.2 + r() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 7);
    ctx.fill();
  }
  drawCracks(ctx, W, W, r, 3, { len: [50, 150], width: [0.5, 1], col: 'rgba(22,21,20,0.42)', light: 'rgba(150,146,138,0.12)', branch: 0.5, wander: 0.5, step: 6 });
  // a control joint along each edge of the 3 m pour
  for (const [x, y, w, h] of [[0, 0, W, 2], [0, 0, 2, W]]) {
    ctx.fillStyle = 'rgba(20,20,18,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(160,156,148,0.14)';
    ctx.fillRect(x + (w < h ? 2 : 0), y + (w < h ? 0 : 2), w < h ? 1.5 : w, w < h ? h : 1.5);
  }
  return { canvas: c, height: lumHeight(canvasToImg(c), 2), relief: 0.006 };
};

// running bond, 2 m: 28 courses of 9 bricks. Red-brown stock with dark clinkers, pale salmon ones and the odd
// spalled face; recessed mortar in the shadow of the brick above; salt runs from a few joints.
GEN.brick = () => {
  const W = 1024, rows = 28, rh = W / rows, cols = 9, cw = W / cols, mort = 5;
  const r = rngf(71);
  const tex = fbm(W, W, 48, 48, 3, 72);
  const body = fbm(W, W, 18, 36, 3, 76);
  const chip = fbm(W, W, 64, 64, 3, 74);
  const bc = [];
  for (let k = 0; k < rows * cols; k++) {
    const t = r();
    const base = t < 0.06 ? [86, 54, 46] : t < 0.14 ? [136, 92, 72] : t < 0.18 ? [104, 82, 72] : [lerp(108, 124, r()), lerp(62, 70, r()), lerp(50, 57, r())];
    bc.push({ c: base, spall: r() < 0.05, sx: r(), sy: r(), k: 0.94 + r() * 0.12 });
  }
  const img = newImg(W, W);
  const height = new Float32Array(W * W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const row = Math.floor(y / rh), ly = y - row * rh;
    const xo = (x + (row % 2) * (cw / 2)) % W;
    const col = Math.floor(xo / cw), lx = xo - col * cw;
    const e = Math.min(lx, cw - lx, ly, rh - ly) - (chip[p] - 0.5) * 4;
    const face = sstep(mort * 0.5 - 0.8, mort * 0.5 + 1.2, e);
    // mortar: sandy grey, darker under the brick above
    let v = 122 + tex[p] * 30 + (r() - 0.5) * 10;
    if (ly < mort * 0.5 + 1.5) v *= 0.7;
    let R = v, G = v * 0.97, B = v * 0.9, h = 0.22 + tex[p] * 0.1;
    if (face > 0) {
      const b = bc[row * cols + col];
      let k = b.k * (0.8 + tex[p] * 0.24 + body[p] * 0.16) + (r() - 0.5) * 0.07;
      // the top arris catches the light, the bottom one is in shadow
      if (e < mort * 0.5 + 3) k *= ly < rh / 2 ? 1.1 : 0.84;
      let fr = b.c[0] * k, fg = b.c[1] * k, fb = b.c[2] * k, fh = 0.86 + tex[p] * 0.14;
      if (b.spall) {
        // the fired face has flaked off: a paler, rougher core
        const sp = sstep(0.34, 0.26, Math.hypot(lx / cw - 0.2 - b.sx * 0.6, (ly / rh - 0.2 - b.sy * 0.6) * 0.5) + (chip[p] - 0.5) * 0.2);
        fr = lerp(fr, 150 * (0.8 + tex[p] * 0.3), sp * 0.8);
        fg = lerp(fg, 106 * (0.8 + tex[p] * 0.3), sp * 0.8);
        fb = lerp(fb, 84 * (0.8 + tex[p] * 0.3), sp * 0.8);
        fh -= sp * 0.3;
      }
      R = lerp(R, fr, face);
      G = lerp(G, fg, face);
      B = lerp(B, fb, face);
      h = lerp(h, fh, face);
    }
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
    height[p] = h;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 26, [30, 22, 18], [0.04, 0.12], [80, 400], [6, 24]);
  return { canvas: c, height, relief: 0.012 };
};

// weathered white-painted wood for window casings and sashes
GEN.sash = () => {
  const W = 256;
  const r = rngf(151);
  const img = woodGrainImg(W, W, 151, [184, 180, 170], [148, 142, 132], { rings: 12, streak: 0.4, lineDark: 0.14 });
  const worn = fbm(W, W, 24, 12, 3, 152);
  eachPx(img, (x, y, i, d) => {
    const t = sstep(0.76, 0.8, worn[i >> 2]);
    d[i] = lerp(d[i], 118, t);
    d[i + 1] = lerp(d[i + 1], 110, t);
    d[i + 2] = lerp(d[i + 2], 98, t);
  });
  const c = imgToCanvas(img);
  drips(ctx2d(c), W, W, r, 12, [60, 54, 44], [0.06, 0.16], [20, 120], [2, 8]);
  return { canvas: c };
};

// asphalt shingles, 2 m: 12 courses of three-tab strips, granules worn thin in places. A = where moss takes
// hold (the slots between tabs and the damp lower edge of each course); the moss is laid on in the shader.
GEN.shingles = () => {
  const W = 512, rows = 12, rh = W / rows, tabs = 6, tw = W / tabs;
  const r = rngf(81);
  const gran = fbm(W, W, 96, 96, 2, 82);
  const worn = fbm(W, W, 12, 12, 4, 84);
  const mo = fbm(W, W, 10, 10, 4, 83);
  const tc = [];
  for (let k = 0; k < rows * tabs; k++) {
    const v = lerp(0.8, 1.16, r());
    tc.push({ c: [60 * v, 56 * v, 53 * v + r() * 6], curl: r() < 0.1 ? 1 : 0, off: (r() - 0.5) * 2 });
  }
  const img = newImg(W, W);
  const field = new Float32Array(W * W), height = new Float32Array(W * W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const row = Math.floor(y / rh), ly = y - row * rh;
    const xo = (x + (row % 2) * (tw / 2)) % W;
    const col = Math.floor(xo / tw), lx = xo - col * tw;
    const T = tc[row * tabs + col];
    let k = 0.8 + gran[p] * 0.42 + (r() - 0.5) * 0.2;
    // granules gone: the darker mat shows through
    k *= 1 - sstep(0.62, 0.8, worn[p]) * 0.28;
    // shadow under the course above, a lighter lifted lower edge, dark slots between the tabs
    if (ly < 6) k *= lerp(0.38, 1, ly / 6);
    if (ly > rh - 2.5) k *= 1.16 + T.curl * 0.2;
    const slot = lx < 1.8 || lx > tw - 0.8;
    if (slot) k *= 0.42;
    d[i] = T.c[0] * k;
    d[i + 1] = T.c[1] * k;
    d[i + 2] = T.c[2] * k;
    d[i + 3] = 255;
    field[p] = mo[p] * 0.8 + (slot ? 0.3 : 0) + sstep(rh - 9, rh, ly) * 0.16 + (ly < 6 ? 0.16 : 0);
    height[p] = slot || ly < 1.5 ? 0 : 0.2 + (ly / rh) * (0.55 + T.curl * 0.25) + gran[p] * 0.2;
  });
  return { ...withField(imgToCanvas(img), field), height, relief: 0.008 };
};

// corrugated galvanised sheet, 2 m, clean: mottled zinc spangle, an overlap every metre and two rows of
// fasteners. A = where rust starts: in the valleys, along the laps and in the run below each fastener. The
// rust itself is laid on in the shader (SURF.tin / SURF.tin_rust share this tile).
GEN.tin = () => {
  const W = 512, period = 16;
  const r = rngf(91);
  const mot = fbm(W, W, 10, 10, 4, 92);
  const spang = fbm(W, W, 64, 64, 2, 93);
  const vs = fbm(W, W, 40, 3, 4, 94);
  const rustN = fbm(W, W, 14, 10, 4, 95, 0.6);
  const img = newImg(W, W);
  const field = new Float32Array(W * W), height = new Float32Array(W * W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const ph = (x / period) * Math.PI * 2;
    const s = Math.sin(ph);
    const lap = x % 256;
    const g = 120 + mot[p] * 30 + (spang[p] - 0.5) * 18;
    let k = (0.84 + 0.12 * s + 0.07 * Math.max(0, Math.sin(ph - 0.6)) ** 8) * (0.88 + 0.16 * vs[p]);
    if (lap < 2) k *= 0.5;
    else if (lap < 5) k *= 1.1;
    d[i] = g * 0.97 * k;
    d[i + 1] = g * k;
    d[i + 2] = g * 1.01 * k;
    d[i + 3] = 255;
    field[p] = rustN[p] * 0.58 + vs[p] * 0.3 + sstep(0.2, -0.8, s) * 0.12 + (lap < 12 ? 0.14 : 0);
    height[p] = 0.5 + 0.5 * s + (lap < 3 ? 0.2 : 0);
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 26, [34, 32, 30], [0.04, 0.1], [40, 220], [2, 7]);
  drips(ctx, W, W, r, 16, [206, 208, 204], [0.04, 0.1], [30, 160], [2, 6]);
  for (const yy of [18, 274]) {
    for (let x = period / 2; x < W; x += period * 2) {
      const fx = x + period / 4;
      ctx.fillStyle = 'rgba(70,68,66,0.9)';
      ctx.beginPath();
      ctx.arc(fx, yy, 3, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,28,26,0.95)';
      ctx.beginPath();
      ctx.arc(fx, yy, 1.7, 0, 7);
      ctx.fill();
      // water runs down from every screw hole
      const L = 30 + r() * 170;
      for (let dy = 0; dy < L; dy++) {
        const row = ((yy + dy) % W) * W, a = 0.5 * (1 - dy / L);
        for (let dx = -2; dx <= 2; dx++) field[row + Math.round(fx) + dx] += a * (1 - Math.abs(dx) / 3);
      }
    }
  }
  return { ...withField(c, field), height, relief: 0.018 };
};

// steel rusted through: dark scale with orange bloom in patches, pitted, flaking along faint plates
GEN.rust = () => {
  const W = 512;
  const r = rngf(101);
  const a = fbm(W, W, 8, 8, 6, 101, 0.6), b = fbm(W, W, 28, 28, 4, 102, 0.6), c2 = fbm(W, W, 72, 72, 3, 104);
  const vs = fbm(W, W, 30, 3, 3, 105);
  const wo = worley(W, W, 18, 18, 103);
  const rr = colorRamp([[0, 30, 21, 17], [0.3, 58, 37, 25], [0.55, 88, 56, 32], [0.78, 114, 76, 42], [1, 134, 98, 60]]);
  const tmp = [0, 0, 0];
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const edge = sstep(0.0, 0.1, wo.f2[p] - wo.f1[p]);
    const t = a[p] * 0.5 + b[p] * 0.3 + c2[p] * 0.2 + (vs[p] - 0.5) * 0.16 + (r() - 0.5) * 0.1 - (1 - edge) * 0.09;
    rr(t, tmp);
    d[i] = tmp[0];
    d[i + 1] = tmp[1];
    d[i + 2] = tmp[2];
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  for (let k = 0; k < 700; k++) {
    ctx.fillStyle = `rgba(20,12,8,${0.25 + r() * 0.45})`;
    ctx.beginPath();
    ctx.arc(r() * W, r() * W, 0.5 + r() * 1.7, 0, 7);
    ctx.fill();
  }
  drips(ctx, W, W, r, 22, [24, 14, 10], [0.06, 0.16], [30, 180], [2, 8]);
  return { canvas: c, height: lumHeight(canvasToImg(c), 2.2), relief: 0.005 };
};

// bare dark steel: mill scale, scratches down to bright metal and a few dings. A = where rust takes first.
GEN.metal = () => {
  const W = 512;
  const r = rngf(111);
  const a = fbm(W, W, 8, 8, 5, 111), vs = fbm(W, W, 30, 2, 4, 112), rs = fbm(W, W, 18, 18, 4, 113, 0.6);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = (0.78 + a[p] * 0.36) * (0.84 + 0.22 * vs[p]) + (r() - 0.5) * 0.05;
    d[i] = 64 * k;
    d[i + 1] = 72 * k;
    d[i + 2] = 74 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  scratches(ctx, W, W, r, 260, 'rgba(150,152,150,0.35)');
  scratches(ctx, W, W, r, 80, 'rgba(20,20,20,0.35)');
  chips(ctx, W, W, r, 50, 'rgba(26,26,26,0.7)', [1, 4]);
  drips(ctx, W, W, r, 24, [20, 20, 18], [0.06, 0.16], [30, 160], [2, 7]);
  return { ...withField(c, mixFields(rs, 0.7, vs, 0.3)), height: lumHeight(canvasToImg(c), 2.4), relief: 0.003 };
};

// coursed rubble, 2 m: rough-faced blocks of uneven size in recessed mortar. A = where moss takes hold
// (the joints and the block edges first); the moss is laid on in the shader.
GEN.stone = () => {
  const W = 512;
  const r = rngf(121);
  // courses
  const rows = [];
  let yy = 0;
  while (yy < W) {
    let hgt = Math.floor(lerp(48, 88, r()));
    if (W - yy - hgt < 48) hgt = W - yy;
    const cuts = [];
    let xx = 0;
    const off = Math.floor(r() * W);
    while (xx < W) {
      let wd = Math.floor(lerp(64, 150, r()));
      if (W - xx - wd < 50) wd = W - xx;
      cuts.push(xx);
      xx += wd;
    }
    rows.push({ y0: yy, h: hgt, cuts, off, cols: cuts.map(() => [lerp(88, 128, r()), 0, 0, r(), r() - 0.5, r() - 0.5]) });
    yy += hgt;
  }
  for (const row of rows)
    for (const c of row.cols) {
      const warm = c[3];
      c[1] = c[0] * (0.95 + warm * 0.03);
      c[2] = c[0] * (0.86 + (1 - warm) * 0.08);
      c[0] *= 1 + warm * 0.06;
    }
  const tex = fbm(W, W, 12, 12, 4, 122), fine = fbm(W, W, 48, 48, 3, 123), mo = fbm(W, W, 9, 9, 5, 124);
  const img = newImg(W, W);
  const field = new Float32Array(W * W), height = new Float32Array(W * W);
  let ri = 0;
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    if (y < rows[ri].y0) ri = 0;
    while (y >= rows[ri].y0 + rows[ri].h) ri++;
    const row = rows[ri];
    const ly = y - row.y0;
    const xo = (x + row.off) % W;
    let s = 0;
    while (s < row.cuts.length - 1 && xo >= row.cuts[s + 1]) s++;
    const x0 = row.cuts[s], x1 = s < row.cuts.length - 1 ? row.cuts[s + 1] : W;
    const e = Math.min(xo - x0, x1 - xo, ly, row.h - ly) + (tex[p] - 0.5) * 7;
    const c0 = row.cols[s];
    // each block's face is split a little out of true: one side stands prouder than the other
    const tilt = ((xo - x0) / (x1 - x0) - 0.5) * c0[4] + (ly / row.h - 0.5) * c0[5];
    let R, G, B;
    if (e < 3) {
      const v = 52 + tex[p] * 20;
      R = v;
      G = v * 0.96;
      B = v * 0.88;
      height[p] = 0.12 + fine[p] * 0.1;
    } else {
      const k = (0.74 + tex[p] * 0.4 + (fine[p] - 0.5) * 0.2) * (e < 7 ? 0.82 : 1) * (1 + tilt * 0.2) + (r() - 0.5) * 0.06;
      R = c0[0] * k;
      G = c0[1] * k;
      B = c0[2] * k;
      height[p] = clamp(0.3 + sstep(3, 12, e) * 0.34 + tex[p] * 0.22 + (fine[p] - 0.5) * 0.12 + tilt * 0.3);
    }
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
    field[p] = mo[p] * 0.84 + (e < 3 ? 0.22 : e < 8 ? 0.1 : 0);
  });
  const c = imgToCanvas(img);
  drips(ctx2d(c), W, W, r, 30, [15, 14, 12], [0.06, 0.18], [40, 200], [4, 14]);
  return { ...withField(c, field), height, relief: 0.035 };
};

GEN.dockwood = () => {
  const W = 512;
  const r = rngf(131);
  const info = boardsImg({ W, H: W, n: 8, seed: 131, light: [88, 70, 52], dark: [38, 30, 24], tone: 0.2, grime: 0.5, warm: 4 });
  const alg = fbm(W, W, 8, 8, 5, 132);
  eachPx(info.img, (x, y, i, d) => {
    const lv = y % info.bw;
    const nearEdge = lv < 8 || lv > info.bw - 8 ? 0.35 : 0;
    const t = clamp(sstep(0.6, 0.85, alg[i >> 2]) * 0.5 + nearEdge * alg[i >> 2]);
    d[i] = lerp(d[i], 36, t);
    d[i + 1] = lerp(d[i + 1], 44, t);
    d[i + 2] = lerp(d[i + 2], 26, t);
  });
  const c = imgToCanvas(info.img);
  const ctx = ctx2d(c);
  nailsOnBoards(ctx, W, W, info, r, { studs: 3, rust: 0.8 });
  drawCracks(ctx, W, W, r, 14, { len: [30, 140], wander: 0.08, step: 5, width: [0.8, 1.5], col: 'rgba(12,10,8,0.7)', branch: 0, along: 0 });
  return { canvas: c, height: info.height, relief: 0.014 };
};

// A starred impact: `rays` cracks wandering out from (cx, cy) in steps of `step` px (each `len(r)` long, its start
// `spread` and each step `turn` radians off true), joined by a ring of cracks at each of the steps in `ring`. In the
// context's stroke; rayWidth / ringWidth, when given, set the line width of the rays and the rings.
function starCrack(ctx, r, cx, cy, { rays, step, spread, turn, len, ring, rayWidth = 0, ringWidth = 0 }) {
  const pts = [];
  for (let k = 0; k < rays; k++) {
    let ang = (k / rays) * Math.PI * 2 + r() * spread, x = cx, y = cy;
    const ray = [[x, y]];
    const L = len(r);
    for (let s = 0; s < L; s += step) {
      ang += (r() - 0.5) * turn;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      ray.push([x, y]);
    }
    pts.push(ray);
    if (rayWidth) ctx.lineWidth = rayWidth;
    ctx.beginPath();
    ray.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  if (ringWidth) ctx.lineWidth = ringWidth;
  for (const ri of ring) {
    ctx.beginPath();
    for (let k = 0; k <= rays; k++) {
      const ray = pts[k % rays];
      const q = ray[Math.min(ri, ray.length - 1)];
      if (k === 0) ctx.moveTo(q[0], q[1]);
      else ctx.lineTo(q[0] + (r() - 0.5) * 3, q[1] + (r() - 0.5) * 3);
    }
    ctx.stroke();
  }
}

// window glass, 2 m: a dark room behind dusty panes - rain-streaked dirt, one starred impact and a couple
// of long cracks in the whole tile (the static world shifts every pane to a different part of it).
GEN.glass = () => {
  const W = 512;
  const r = rngf(141);
  const a = fbm(W, W, 5, 5, 5, 141), b = fbm(W, W, 14, 14, 3, 142), vs = fbm(W, W, 30, 3, 4, 143);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const grime = sstep(0.42, 0.88, a[p] * 0.65 + vs[p] * 0.35);
    d[i] = lerp(15, 60 + b[p] * 22, grime * 0.7);
    d[i + 1] = lerp(19, 58 + b[p] * 20, grime * 0.7);
    d[i + 2] = lerp(22, 48 + b[p] * 16, grime * 0.7);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drips(ctx, W, W, r, 34, [74, 68, 54], [0.05, 0.16], [30, 180], [2, 9]);
  // starred impact
  const cx = 150, cy = 330;
  ctx.strokeStyle = 'rgba(170,180,182,0.5)';
  ctx.lineWidth = 0.8;
  starCrack(ctx, r, cx, cy, { rays: 11, step: 7, spread: 0.4, turn: 0.25, len: (rr) => 30 + rr() * 80, ring: [2, 4] });
  ctx.fillStyle = 'rgba(200,205,205,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, 7);
  ctx.fill();
  drawCracks(ctx, W, W, r, 3, { len: [120, 300], width: [0.6, 1], col: 'rgba(170,180,182,0.42)', branch: 0.4, wander: 0.22, step: 7 });
  return { canvas: c };
};

// A vehicle's window, 2 m (materials.js `carglass`: see-through, so this is only what lies ON the glass). RGB: the
// film - road dust, and the pale lines of cracks; alpha: how much of it there is at that spot (0: clean glass).
// The shader turns the film up or down by the pane's own dirt, so one tile is a clean screen and a filthy one; each
// pane shows a different part of it (the builder shifts its UVs), and the starred impact falls on a few.
GEN.carglass = () => {
  const W = 512;
  const r = rngf(1741);
  const a = fbm(W, W, 4, 4, 5, 1741), b = fbm(W, W, 22, 22, 3, 1742), vs = fbm(W, W, 40, 2, 4, 1743), wipe = fbm(W, W, 3, 9, 3, 1744);
  // cracks, drawn white on black and read back as a mask (under node there is no canvas: no cracks, which no tool needs)
  const [cc, ctx] = filledCanvas(W, W, '#000');
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const star = (cx, cy, rays, len, ring) => {
    starCrack(ctx, r, cx, cy, { rays, step: 6, spread: 0.5, turn: 0.3, len: (rr) => len * (0.4 + rr() * 0.8), ring, rayWidth: 1.1, ringWidth: 0.8 });
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 7);
    ctx.fill();
  };
  star(130, 350, 12, 90, [2, 4, 7]);
  star(400, 120, 8, 46, [2, 3]);
  drawCracks(ctx, W, W, r, 2, { len: [140, 300], width: [0.9, 1.3], col: 'rgba(255,255,255,1)', branch: 0.5, wander: 0.2, step: 7 });
  const mask = canvasToImg(cc).d;
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    // dust in broad patches, run down in streaks by the rain, wiped thin in places
    const patch = sstep(0.34, 0.86, a[p] * 0.62 + vs[p] * 0.38);
    const thin = sstep(0.55, 0.8, wipe[p]);
    const film = clamp(patch * (0.9 - 0.5 * thin) + (b[p] - 0.5) * 0.22 + 0.06);
    const crack = mask[i] / 255;
    const g = 70 + b[p] * 36;
    d[i] = lerp(g * 1.08, 226, crack);
    d[i + 1] = lerp(g, 234, crack);
    d[i + 2] = lerp(g * 0.84, 236, crack);
    d[i + 3] = Math.max(film * 0.86, crack) * 255;
  });
  return { ...img };
};

// What a vehicle is lined and upholstered with (materials.js `cabin`; the colour is the vertex's): a close weave,
// worn in patches and stained, nothing in it loud enough to read as a pattern on a wall.
GEN.cabin = () => {
  const W = 256;
  const a = fbm(W, W, 3, 3, 4, 1751), b = fbm(W, W, 64, 64, 2, 1752), c = fbm(W, W, 8, 2, 3, 1753);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const weave = ((x + y) & 1 ? 1 : -1) * 3 + (b[p] - 0.5) * 16;
    const worn = sstep(0.55, 0.85, a[p]) * 22 - sstep(0.6, 0.9, c[p]) * 18;
    const v = clamp(206 + weave + worn + (a[p] - 0.5) * 20, 0, 255);
    d[i] = v;
    d[i + 1] = v * 0.985;
    d[i + 2] = v * 0.96;
    d[i + 3] = 255;
  });
  return { ...img };
};

GEN.door = () => {
  const W = 256, H = 512;
  const r = rngf(151);
  const grain = boardsImg({ W, H, n: 4, seed: 151, vertical: true, light: [112, 100, 86], dark: [58, 50, 42], tone: 0.1, joints: 0 });
  const pm = fbm(W, H, 4, 8, 5, 152);
  const dirt = fbm(W, H, 3, 6, 4, 153);
  const img = grain.img;
  // panel layout (px)
  const panels = [[28, 36, 90, 190], [138, 36, 90, 190], [28, 262, 90, 200], [138, 262, 90, 200]];
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const paint = sstep(0.34, 0.38, pm[p]);
    let R = lerp(d[i], 58 + dirt[p] * 22, paint), G = lerp(d[i + 1], 70 + dirt[p] * 22, paint), B = lerp(d[i + 2], 58 + dirt[p] * 16, paint);
    let k = 1;
    for (const [px, py, pw, ph] of panels) {
      if (x >= px && x < px + pw && y >= py && y < py + ph) {
        const ex = Math.min(x - px, px + pw - x), ey = Math.min(y - py, py + ph - y);
        const e = Math.min(ex, ey);
        if (e < 7) {
          const topLeft = x - px < 7 || y - py < 7;
          k = topLeft ? 0.55 : 1.25;
        } else k = 0.92;
      }
    }
    const bottom = sstep(360, 512, y) * 0.45;
    k *= 1 - bottom * (0.5 + dirt[p] * 0.5);
    d[i] = R * k;
    d[i + 1] = G * k;
    d[i + 2] = B * k;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // knob + plate
  ctx.fillStyle = 'rgba(40,32,22,1)';
  ctx.fillRect(214, 236, 16, 44);
  ctx.fillStyle = 'rgba(110,86,40,1)';
  ctx.beginPath();
  ctx.arc(222, 250, 7, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,130,70,0.8)';
  ctx.beginPath();
  ctx.arc(220, 248, 2.5, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,8,6,1)';
  ctx.fillRect(220, 266, 4, 8);
  // claw scratches
  ctx.strokeStyle = 'rgba(140,120,96,0.7)';
  ctx.lineWidth = 1.6;
  const sx = 60 + r() * 60, sy = 250 + r() * 80;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(sx + k * 9, sy);
    ctx.quadraticCurveTo(sx + k * 9 + 12, sy + 60, sx + k * 9 + 6, sy + 120);
    ctx.stroke();
  }
  // bloody hand smear
  ctx.fillStyle = 'rgba(70,8,6,0.55)';
  const hx = 150 + r() * 40, hy = 200 + r() * 40;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 14, 17, 0.2, 0, 7);
  ctx.fill();
  for (let f = 0; f < 4; f++) {
    ctx.beginPath();
    ctx.ellipse(hx - 12 + f * 8, hy - 26 - Math.abs(f - 1.5) * -3, 3.4, 11, (f - 1.5) * 0.12, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,6,4,0.4)';
  ctx.fillRect(hx - 8, hy, 16, 90 + r() * 60);
  drips(ctx, W, H, r, 30, [25, 20, 14], [0.08, 0.2], [30, 160], [2, 8]);
  return { canvas: c };
};

GEN.hay = () => {
  const W = 256;
  const r = rngf(161);
  const base = fbm(W, W, 6, 6, 4, 161);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const v = 0.6 + base[i >> 2] * 0.4;
    d[i] = 108 * v;
    d[i + 1] = 88 * v;
    d[i + 2] = 46 * v;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  ctx.lineCap = 'round';
  const cols = [[172, 150, 90], [150, 124, 64], [124, 100, 50], [190, 170, 110], [96, 78, 44], [80, 66, 40]];
  for (let pass = 0; pass < 2; pass++)
    for (const col of cols) {
      ctx.strokeStyle = rgbA(col, 0.85);
      ctx.lineWidth = pass ? 1 : 1.6;
      ctx.beginPath();
      for (let k = 0; k < 420; k++) {
        const x = r() * W, y = r() * W, a = (r() - 0.5) * 1.3 + (r() < 0.2 ? Math.PI / 2 : 0), l = 8 + r() * 26;
        wrapDraw(W, W, x, y, l, (px, py) => {
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, py + Math.sin(a) * l * 0.5 + (r() - 0.5) * 4, px + Math.cos(a) * l, py + Math.sin(a) * l);
        });
      }
      ctx.stroke();
    }
  blotches(ctx, W, W, r, 14, [30, 24, 12], [0.2, 0.45], [10, 40]);
  return { canvas: c };
};

GEN.canvas = () => {
  const W = 512;
  const r = rngf(171);
  const a = fbm(W, W, 5, 5, 6, 171), st = fbm(W, W, 8, 8, 4, 172), vs = fbm(W, W, 28, 3, 3, 173);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const weave = 0.93 + 0.07 * Math.sin(x * 2.1) * Math.sin(y * 2.1) + ((x + y) % 3 === 0 ? -0.03 : 0.02);
    let k = (0.78 + a[p] * 0.35) * weave * (0.85 + 0.2 * vs[p]);
    const ring = Math.abs(st[p] - 0.62);
    if (ring < 0.015) k *= 0.72;
    else if (st[p] > 0.62) k *= 0.88;
    d[i] = 118 * k;
    d[i + 1] = 112 * k;
    d[i + 2] = 88 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  // sewn patches
  for (let k = 0; k < 3; k++) {
    const x = r() * W, y = r() * W, w = 40 + r() * 60, h = 30 + r() * 50;
    const v = 0.8 + r() * 0.3;
    wrapDraw(W, W, x + w / 2, y + h / 2, Math.max(w, h), (px, py) => {
      ctx.fillStyle = rgb(104 * v, 106 * v, 80 * v, 0.9);
      ctx.fillRect(px - w / 2, py - h / 2, w, h);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(40,36,26,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - w / 2 + 3, py - h / 2 + 3, w - 6, h - 6);
      ctx.setLineDash([]);
    });
  }
  blotches(ctx, W, W, r, 30, [30, 28, 20], [0.1, 0.3], [8, 40]);
  blotches(ctx, W, W, r, 40, [40, 46, 30], [0.1, 0.25], [3, 10]);
  drips(ctx, W, W, r, 30, [30, 28, 20], [0.05, 0.14], [40, 220], [4, 16]);
  return { canvas: c };
};

// military drab paint: chalky and scuffed. A = where rust breaks through (the rust is laid on in the shader).
GEN.olive = () => {
  const W = 512;
  const r = rngf(181);
  const a = fbm(W, W, 8, 8, 5, 181), vs = fbm(W, W, 30, 2, 4, 182), b = fbm(W, W, 18, 18, 3, 183), rs = fbm(W, W, 14, 14, 4, 184, 0.6);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const k = (0.8 + a[p] * 0.28 + (b[p] - 0.5) * 0.1) * (0.86 + 0.2 * vs[p]) + (r() - 0.5) * 0.04;
    d[i] = 72 * k;
    d[i + 1] = 78 * k;
    d[i + 2] = 50 * k;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  chips(ctx, W, W, r, 110, 'rgba(46,48,40,0.9)', [0.8, 4]);
  scratches(ctx, W, W, r, 120, 'rgba(120,122,100,0.3)');
  drips(ctx, W, W, r, 30, [25, 25, 16], [0.08, 0.2], [40, 180], [3, 10]);
  return withField(c, mixFields(rs, 0.75, vs, 0.25));
};

// chain-link fence mesh (alpha): 4x4 diamonds, galvanised wire with rust spots
GEN.chainlink = () => {
  const W = 128, cell = 32;
  const n = fbm(W, W, 4, 4, 3, 921);
  const img = newImg(W, W);
  const hw = 1.9;
  eachPx(img, (x, y, i, d) => {
    const u = (x + 0.5) / cell, v = (y + 0.5) / cell;
    const f1 = u + v, f2 = u - v;
    const d1 = (Math.abs(f1 - Math.round(f1)) * cell) / Math.SQRT2;
    const d2 = (Math.abs(f2 - Math.round(f2)) * cell) / Math.SQRT2;
    const dd = Math.min(d1, d2);
    const cov = clamp(hw + 0.5 - dd);
    // round-wire shading across the strand + knuckle highlight at crossings
    const across = clamp(dd / hw);
    const knuckle = Math.max(d1, d2) < 3 ? 1.15 : 1;
    const rust = sstep(0.66, 0.86, n[i >> 2]) * 0.8;
    const k = (0.72 + 0.35 * Math.sqrt(1 - across * across)) * knuckle;
    d[i] = lerp(150, 120, rust) * k;
    d[i + 1] = lerp(152, 78, rust) * k;
    d[i + 2] = lerp(150, 48, rust) * k;
    d[i + 3] = cov * 255;
  });
  return { ...img };
};
