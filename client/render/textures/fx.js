// Effect sprites (grey on transparent: the fire sheet, smoke, sparks, glow, muzzle flash, blood) and decals (their
// own colour and alpha: blood, acid, scorch), and the textures of the flashlight cone, ropes and the parachute.
import { rngf, clamp, lerp, sstep, fbm, ctx2d, newImg, imgToCanvas, eachPx, blotches } from './kit.js';
const GEN = {};
export { GEN as FX_GEN };

function spriteImg(W, H, fn) {
  const img = newImg(W, H);
  const tmp = [1, 1];
  eachPx(img, (x, y, i, d) => {
    fn((x + 0.5) / W, (y + 0.5) / H, tmp, x, y);
    const g = clamp(tmp[0]) * 255;
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
    d[i + 3] = clamp(tmp[1]) * 255;
  });
  return img;
}

GEN.fx_fire = () => {
  // 4x4 animated sheet, frame 0 top-left, row-major. Frames loop.
  const S = 128, N = 4, W = S * N;
  const nz = fbm(S, S * 4, 4, 16, 4, 601, 0.55);
  const nz2 = fbm(S, S * 4, 8, 32, 3, 602);
  const img = newImg(W, W);
  const d = img.d;
  for (let f = 0; f < 16; f++) {
    const fx = (f % N) * S, fy = Math.floor(f / N) * S;
    const off = f * ((S * 4) / 16);
    for (let y = 0; y < S; y++) {
      const ny = 1 - y / S; // 0 bottom .. 1 top
      const sy = Math.floor((y + off * 2) % (S * 4));
      for (let x = 0; x < S; x++) {
        const nx = (x - S / 2) / (S / 2);
        const n = nz[sy * S + x], n2 = nz2[sy * S + x];
        const width = 1.05 * Math.pow(Math.max(0, ny + 0.04), 0.3) * Math.pow(Math.max(0, 1 - ny), 0.75);
        const dx = Math.abs(nx + (n - 0.5) * 0.7 * ny);
        let v = 1 - dx / (width + 1e-3);
        v -= (n2 - 0.5) * 0.9 * ny + ny * 0.15;
        v = clamp(v * 1.5);
        const baseFade = sstep(0.0, 0.1, ny) * sstep(1.0, 0.9, Math.abs(nx));
        const a = sstep(0.0, 0.35, v) * baseFade;
        const g = 0.55 + 0.45 * sstep(0.3, 0.9, v);
        const i = ((fy + y) * W + fx + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = g * 255;
        d[i + 3] = a * 255;
      }
    }
  }
  return { ...img, clamp: true };
};

GEN.fx_smoke = () => {
  const S = 128;
  const n = fbm(S, S, 4, 4, 5, 611);
  return {
    ...spriteImg(S, S, (u, v, o, x, y) => {
      const dx = u - 0.5, dy = v - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
      const nn = n[y * S + x];
      const a = Math.pow(clamp(1 - r), 1.4) * (0.35 + 0.9 * nn);
      o[0] = 0.75 + 0.25 * nn - dy * 0.2;
      o[1] = a * 0.9;
    }),
    clamp: true,
  };
};

GEN.fx_spark = () => ({
  ...spriteImg(64, 64, (u, v, o) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2, r2 = dx * dx + dy * dy;
    o[0] = 1;
    o[1] = Math.exp(-r2 * 30) + 0.35 * Math.exp(-r2 * 5) + 0.25 * Math.exp(-(dx * dx * 40 + dy * dy * 1.5));
  }),
  clamp: true,
});

GEN.fx_glow = () => ({
  ...spriteImg(128, 128, (u, v, o) => {
    const r = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2;
    o[0] = 1;
    o[1] = Math.pow(clamp(1 - r), 2.2);
  }),
  clamp: true,
});

GEN.fx_muzzle = () => {
  const r = rngf(621);
  const spikes = [];
  const n = 6;
  for (let k = 0; k < n; k++) spikes.push({ a: (k / n) * Math.PI * 2 + (r() - 0.5) * 0.3, l: 0.55 + r() * 0.45, w: 0.08 + r() * 0.06 });
  return {
    ...spriteImg(256, 256, (u, v, o) => {
      const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2, rr = Math.sqrt(dx * dx + dy * dy), an = Math.atan2(dy, dx);
      let s = 0;
      for (const sp of spikes) {
        let da = an - sp.a;
        da = Math.abs(((da % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        const wAt = sp.w * (1 - rr / sp.l);
        if (wAt > 0) s = Math.max(s, sstep(wAt, wAt * 0.2, da * rr * 1.2 + da * 0.05));
      }
      const core = Math.exp(-rr * rr * 14);
      o[0] = 0.8 + 0.2 * core;
      o[1] = Math.min(1, s * 0.9 + core * 1.1 + Math.exp(-rr * rr * 4) * 0.25);
    }),
    clamp: true,
  };
};

GEN.fx_blood = () => {
  const r = rngf(631);
  const S = 64;
  const blobs = [{ x: 0.5, y: 0.5, r: 0.17 }];
  for (let k = 0; k < 9; k++) {
    const a = r() * 6.28, dd = 0.14 + r() * 0.2;
    blobs.push({ x: 0.5 + Math.cos(a) * dd, y: 0.5 + Math.sin(a) * dd, r: 0.02 + r() * 0.045 });
  }
  const n = fbm(S, S, 4, 4, 3, 632);
  return {
    ...spriteImg(S, S, (u, v, o, x, y) => {
      let f = 0;
      for (const b of blobs) f += (b.r * b.r) / ((u - b.x) ** 2 + (v - b.y) ** 2 + 1e-4);
      o[0] = 0.8 + 0.2 * n[y * S + x];
      o[1] = sstep(0.8, 1.3, f + (n[y * S + x] - 0.5) * 0.6);
    }),
    clamp: true,
  };
};

function decal(W, seed, fn) {
  const img = newImg(W, W);
  const n = fbm(W, W, 5, 5, 5, seed);
  const n2 = fbm(W, W, 16, 16, 3, seed + 1);
  const tmp = [0, 0, 0, 0];
  eachPx(img, (x, y, i, d) => {
    const u = (x + 0.5) / W - 0.5, v = (y + 0.5) / W - 0.5;
    fn(u, v, Math.sqrt(u * u + v * v) * 2, n[i >> 2], n2[i >> 2], tmp, Math.atan2(v, u));
    d[i] = tmp[0];
    d[i + 1] = tmp[1];
    d[i + 2] = tmp[2];
    d[i + 3] = clamp(tmp[3]) * 255;
  });
  return img;
}

GEN.decal_blood = () => {
  const r = rngf(641);
  const drops = [];
  for (let k = 0; k < 26; k++) {
    const a = r() * 6.28, dd = 0.35 + r() * 0.55;
    drops.push([Math.cos(a) * dd * 0.5, Math.sin(a) * dd * 0.5, 0.008 + r() * 0.025]);
  }
  const lobes = [];
  for (let k = 0; k < 5; k++) lobes.push([r() * 6.28, 0.1 + r() * 0.15]);
  const img = decal(256, 642, (u, v, rr, n, n2, o, an) => {
    let rad = 0.55;
    for (const [la, ls] of lobes) rad += Math.max(0, Math.cos(an - la)) ** 6 * ls;
    rad += (n - 0.5) * 0.35;
    let a = sstep(rad, rad - 0.05, rr);
    for (const [dx, dy, dr] of drops) {
      const dd = Math.sqrt((u - dx) ** 2 + (v - dy) ** 2);
      a = Math.max(a, sstep(dr, dr * 0.6, dd));
    }
    const center = 1 - sstep(0, rad, rr);
    const k = 0.7 + n2 * 0.3;
    o[0] = lerp(92, 48, center) * k;
    o[1] = lerp(10, 4, center) * k;
    o[2] = lerp(8, 4, center) * k;
    o[3] = a * (0.82 + 0.15 * center);
  });
  return { ...img, clamp: true };
};

GEN.decal_acid = () => {
  const r = rngf(651);
  const bubbles = [];
  for (let k = 0; k < 40; k++) {
    const a = r() * 6.28, dd = Math.sqrt(r()) * 0.33;
    bubbles.push([Math.cos(a) * dd, Math.sin(a) * dd, 0.008 + r() * 0.03]);
  }
  const img = decal(256, 652, (u, v, rr, n, n2, o) => {
    const rad = 0.7 + (n - 0.5) * 0.5;
    let a = sstep(rad, rad - 0.08, rr);
    const center = 1 - sstep(0, rad, rr);
    let R = lerp(60, 150, center), G = lerp(110, 210, center), B = lerp(18, 40, center);
    const k = 0.75 + n2 * 0.35;
    R *= k;
    G *= k;
    B *= k;
    for (const [bx, by, br] of bubbles) {
      const dd = Math.sqrt((u - bx) ** 2 + (v - by) ** 2);
      if (dd < br) {
        const rim = sstep(br * 0.6, br, dd);
        R = lerp(R, 200, rim * 0.8);
        G = lerp(G, 250, rim * 0.8);
        B = lerp(B, 90, rim * 0.8);
        a = Math.max(a, 0.9);
      }
    }
    o[0] = R;
    o[1] = G;
    o[2] = B;
    o[3] = a * 0.9;
  });
  return { ...img, clamp: true };
};

GEN.decal_scorch = () => {
  const img = decal(256, 661, (u, v, rr, n, n2, o) => {
    const rad = 0.75 + (n - 0.5) * 0.4;
    const a = Math.pow(sstep(rad, 0.1, rr), 0.8);
    const k = n2 > 0.7 ? 50 : 14;
    o[0] = k;
    o[1] = k * 0.95;
    o[2] = k * 0.9;
    o[3] = a * (0.75 + n2 * 0.25);
  });
  return { ...img, clamp: true };
};

GEN.fx_cone = () => ({
  // bright at the top (v=1 = light source), fading to 0 at the bottom; soft on both u edges
  ...spriteImg(64, 256, (u, v, o) => {
    const across = Math.exp(-(((u - 0.5) / 0.26) ** 2));
    const along = Math.pow(1 - v, 1.6);
    o[0] = 1;
    o[1] = across * along;
  }),
  clamp: true,
});

GEN.fx_rope = () => {
  const W = 64, H = 256;
  const n = fbm(W, H, 4, 16, 3, 671);
  const r = rngf(672);
  const img = newImg(W, H);
  eachPx(img, (x, y, i, d) => {
    const u = (x + 0.5) / W;
    const across = (u - 0.5) * 2;
    const cyl = Math.sqrt(Math.max(0, 1 - across * across));
    const strand = 0.5 + 0.5 * Math.sin(((y / H) * 16 + u * 1.5) * Math.PI * 2);
    const k = (0.45 + 0.55 * cyl) * (0.7 + 0.3 * strand) * (0.8 + 0.3 * n[i >> 2]) + (r() - 0.5) * 0.1;
    d[i] = 176 * k;
    d[i + 1] = 158 * k;
    d[i + 2] = 124 * k;
    d[i + 3] = sstep(1.0, 0.8, Math.abs(across)) * 255;
  });
  return { ...img, noAniso: true };
};

GEN.fx_parachute = () => {
  const W = 512, H = 256, gores = 8;
  const n = fbm(W, H, 6, 3, 5, 681);
  const img = newImg(W, H);
  eachPx(img, (x, y, i, d) => {
    const g = Math.floor((x / W) * gores), lx = (x / W) * gores - g;
    const col = g % 2 ? [150, 144, 118] : [86, 92, 64];
    let k = 0.8 + n[i >> 2] * 0.3;
    if (lx < 0.02 || lx > 0.98) k *= 0.55;
    if (y < 6) k *= 0.4;
    const hem = y > H - 10 ? 0.7 : 1;
    d[i] = col[0] * k * hem;
    d[i + 1] = col[1] * k * hem;
    d[i + 2] = col[2] * k * hem;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  blotches(ctx2d(c), W, H, rngf(682), 20, [40, 36, 24], [0.15, 0.35], [8, 30]);
  return { canvas: c };
};
