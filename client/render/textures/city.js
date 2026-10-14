// The city's surfaces (citykit.js) and its atlas (2048) of shop boards, posters, graffiti, ivy, soot and stains.
import { rngf, clamp, lerp, sstep, fbm, mkCanvas, ctx2d, newImg, imgToCanvas, canvasToImg, rgb, eachPx, drawCracks, blotches } from './kit.js';
const GEN = {};
export { GEN as CITY_GEN };

// Walls and ceilings of a room that was lived in: plaster under paint or paper, 4 m to the tile. Pale and neutral
// (the kit tints it per room by vertex colour, and lays the stains, the damp and the cracks on each wall where that
// wall has them: city/room.js room()). What is in the tile is only what no eye picks out twice along a wall: the
// unevenness of old paint, hairline cracks, a few small flakes down to the render.
GEN.plaster = () => {
  const W = 512;
  const r = rngf(1301);
  const a = fbm(W, W, 5, 5, 5, 1301), b = fbm(W, W, 22, 22, 3, 1302), fl = fbm(W, W, 9, 9, 4, 1303), fine = fbm(W, W, 90, 90, 2, 1304);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const v = 0.8 + (a[p] - 0.5) * 0.14 + (b[p] - 0.5) * 0.07 + (fine[p] - 0.5) * 0.05;
    // paint flaked off, here and there and never much of it: the grey-brown render under it
    const flake = sstep(0.71, 0.75, fl[p] * 0.7 + b[p] * 0.3) * 0.7;
    let R = 226 * v, G = 222 * v, B = 208 * v;
    R = lerp(R, 168 + b[p] * 24, flake);
    G = lerp(G, 158 + b[p] * 22, flake);
    B = lerp(B, 140 + b[p] * 20, flake);
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 14, [120, 110, 84], [0.04, 0.1], [30, 90]); // (the wall's own unevenness: nothing with an edge)
  drawCracks(ctx, W, W, r, 5, { len: [40, 150], width: [0.4, 0.8], col: 'rgba(60,52,44,0.4)', light: 'rgba(240,236,224,0.15)', branch: 0.5, wander: 0.6, step: 6 });
  return { canvas: c };
};

// Vinyl tile, 0.3 m squares (2.4 m to the repeat): two faded tones of one colour laid chequered - near enough to
// one another that the floor reads as a floor and not as a board to play on - every tile worn its own way, a few
// lifted down to the adhesive, ground-in dirt along the joints. Its colour is the room's (the kit's vertex colour).
GEN.lino = () => {
  const W = 512, n = 8, cs = W / n;
  const r = rngf(1311);
  const a = fbm(W, W, 6, 6, 4, 1311), b = fbm(W, W, 40, 40, 3, 1312);
  const state = [];
  for (let k = 0; k < n * n; k++) state.push({ gone: r() < 0.03, k: 0.88 + r() * 0.24 });
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
    const t = state[cy * n + cx];
    const lx = x - cx * cs, ly = y - cy * cs;
    const e = Math.min(lx, cs - lx, ly, cs - ly);
    const v = ((cx + cy) % 2 ? 0.63 : 0.7) * t.k * (0.84 + a[p] * 0.3) * (0.92 + b[p] * 0.16);
    let R = v * 196, G = v * 192, B = v * 176;
    if (t.gone) {
      const k2 = 0.4 + b[p] * 0.1; // (a tile lifted: the grey of the screed under it, not a black square)
      R = 255 * k2 * 0.8;
      G = 255 * k2 * 0.74;
      B = 255 * k2 * 0.64;
    }
    const joint = 1 - sstep(0.4, 2.2, e);
    d[i] = R * (1 - joint * 0.34);
    d[i + 1] = G * (1 - joint * 0.34);
    d[i + 2] = B * (1 - joint * 0.34);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 20, [58, 50, 40], [0.06, 0.18], [20, 70]);
  drawCracks(ctx, W, W, r, 5, { len: [30, 120], width: [0.6, 1.2], col: 'rgba(20,18,16,0.6)', branch: 0.4, step: 5 });
  return { canvas: c };
};

// Paint on asphalt, 6 m to the repeat: the white of a runway's markings after years of weather - greyed, crazed,
// worn through to the black under it in patches and along the cracks.
GEN.roadpaint = () => {
  const W = 256;
  const r = rngf(1341);
  const a = fbm(W, W, 5, 5, 4, 1341), b = fbm(W, W, 26, 26, 3, 1342), fine = fbm(W, W, 80, 80, 2, 1343);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const v = 0.9 + (a[p] - 0.5) * 0.24 + (fine[p] - 0.5) * 0.12;
    // worn thin everywhere, the grain of the asphalt showing through it, and here and there worn off
    const thin = sstep(0.35, 0.8, b[p]) * 0.3 + sstep(0.6, 0.9, fine[p]) * 0.25;
    const worn = Math.max(thin, sstep(0.66, 0.76, a[p] * 0.5 + b[p] * 0.5) * 0.8);
    const k = 52 + fine[p] * 26;
    d[i] = lerp(186 * v, k, worn);
    d[i + 1] = lerp(184 * v, k, worn);
    d[i + 2] = lerp(174 * v, k * 1.04, worn);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  drawCracks(ctx, W, W, r, 9, { len: [40, 160], width: [0.6, 1.2], col: 'rgba(40,40,42,0.6)', branch: 0.5, wander: 0.7, step: 5 });
  return { canvas: c };
};

// Ceiling tiles on a grid, 0.6 m (4.8 m to the repeat): stained, some gone to the dark void above.
GEN.ceiling = () => {
  const W = 512, n = 8, cs = W / n;
  const r = rngf(1321);
  const a = fbm(W, W, 5, 5, 4, 1321), b = fbm(W, W, 60, 60, 2, 1322);
  const gone = [];
  for (let k = 0; k < n * n; k++) gone.push(r() < 0.13);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
    const lx = x - cx * cs, ly = y - cy * cs;
    const e = Math.min(lx, cs - lx, ly, cs - ly);
    const v = 0.74 + (a[p] - 0.5) * 0.24 + (b[p] - 0.5) * 0.1;
    let R = 214 * v, G = 210 * v, B = 196 * v;
    if (gone[cy * n + cx] && e > 3) {
      R = 16 + b[p] * 10;
      G = 15 + b[p] * 9;
      B = 14 + b[p] * 8;
    }
    if (e < 3) {
      R = 122;
      G = 120;
      B = 112;
    }
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  const ctx = ctx2d(c);
  blotches(ctx, W, W, r, 16, [110, 82, 40], [0.12, 0.34], [18, 64]); // water through the roof
  blotches(ctx, W, W, r, 8, [30, 30, 24], [0.1, 0.24], [8, 30]);
  return { canvas: c };
};

// A flat roof, 4 m: felt and tar with its gravel worn off, a seam every metre, ponding stains, moss in the low places.
GEN.roofing = () => {
  const W = 512;
  const r = rngf(1331);
  const a = fbm(W, W, 4, 4, 5, 1331), b = fbm(W, W, 70, 70, 2, 1332), m = fbm(W, W, 7, 7, 4, 1333);
  const img = newImg(W, W);
  eachPx(img, (x, y, i, d) => {
    const p = i >> 2;
    let v = 0.3 + (a[p] - 0.5) * 0.2 + (b[p] - 0.5) * 0.14;
    if (x % 128 < 2) v *= 0.6;
    const moss = sstep(0.7, 0.86, m[p]);
    d[i] = lerp(200 * v, 44 + b[p] * 22, moss * 0.6);
    d[i + 1] = lerp(194 * v, 50 + b[p] * 24, moss * 0.6);
    d[i + 2] = lerp(182 * v, 32 + b[p] * 14, moss * 0.6);
    d[i + 3] = 255;
  });
  const c = imgToCanvas(img);
  blotches(ctx2d(c), W, W, r, 14, [20, 20, 18], [0.1, 0.3], [20, 80]);
  return { canvas: c };
};

// ---------------------------------------------------------------- the city's atlas (2048)
// One sheet for everything that is laid on a wall of Port Calder: the boards over its shops and what was painted on
// its buildings (opaque cells), what was sprayed on them and what has grown up them since (cut out), and what the
// years ran down them (soft: soot over a burnt-out window, rust under a fixing, damp). The cells are packed in rows; CITY_ATLAS[name] = [x, y, w, h] in pixels. citykit.js lays them on with two materials of
// materials.js: 'citysign' (cut out at half alpha) and 'citygrime' (blended).
const CITY_CELLS = [
  // boards over the shops: [name, w, h, text, board colour, lettering colour]
  ['shop_grocery', 400, 100, 'CALDER FOOD MARKET', '#7a2a1e', '#e2d8bc'],
  ['shop_diner', 400, 100, 'HARBOUR DINER', '#2a5a62', '#e6dcc0'],
  ['shop_pharmacy', 400, 100, 'PORT PHARMACY', '#d0c8b0', '#1f6a3a'],
  ['shop_hardware', 400, 100, 'KESSLER HARDWARE', '#34424e', '#e0c060'],
  ['shop_aero', 400, 100, 'CALDER AERO SUPPLY', '#c8c2ae', '#243a6a'],
  ['shop_liquor', 400, 100, 'LIQUOR', '#1c1a18', '#c8402a'],
  ['shop_pawn', 400, 100, 'PAWN & LOAN', '#b89a2a', '#1a1612'],
  ['shop_laundry', 400, 100, 'COIN LAUNDRY', '#8fb0b8', '#f0ece0'],
  ['shop_bakery', 400, 100, 'BAKERY', '#b8a078', '#4a2a1a'],
  ['shop_bar', 400, 100, 'DOCKSIDE BAR', '#3a1e1a', '#d8b060'],
  ['shop_books', 400, 100, 'BOOKS', '#2e4a34', '#e0d8b8'],
  ['shop_hotel', 400, 100, 'HOTEL MERIDIAN', '#4a4038', '#d8c8a0'],
  ['police', 400, 100, 'POLICE', '#1c2a44', '#e8e4d8'],
  ['depot', 400, 100, 'BUS DEPOT', '#c4b890', '#20303a'],
  ['parking', 400, 100, 'PARKING', '#1e3a5a', '#f0ecdc'],
  ['subway', 400, 100, 'HARBOUR ST', '#101010', '#e8e6de'],
  ['hospital', 804, 100, 'CALDER GENERAL HOSPITAL', '#c8c6bc', '#1a3458'],
  ['terminal', 804, 100, 'CALDER FIELD', '#b8b4a4', '#22303c'],
  ['emergency', 400, 100, 'EMERGENCY', '#9a1a14', '#f0ece0'],
  ['gas', 400, 100, 'GAS', '#b02a1c', '#f0e8d0'],
  ['church', 400, 100, "ST. BRENDAN'S", '#2a2622', '#c8b070'],
  ['rialto', 128, 512, 'RIALTO', '#5a1410', '#e8d070'],
  ['marquee', 768, 192],
  ['gasprice', 256, 512],
  ['quarantine', 448, 224],
  ['evac', 448, 224],
  ['road_airport', 256, 128], // (the island's Route 9: the way to the bridge, and past it the airfield - issue #269)
  ['billboard_a', 448, 224],
  ['billboard_b', 448, 224],
  ['poster_a', 112, 168],
  ['poster_b', 112, 168],
  ['poster_c', 112, 168],
  ['poster_d', 112, 168],
  ['redcross', 128, 128],
  ['stained_a', 112, 224],
  ['stained_b', 112, 224],
  // cut out
  ['graf_help', 384, 144],
  ['graf_dead', 384, 144],
  ['graf_room', 384, 144],
  ['graf_god', 384, 144],
  ['graf_bridge', 384, 144],
  ['graf_night', 384, 144],
  ['graf_names', 320, 192],
  ['graf_tag', 224, 168],
  ['xcode_a', 168, 168],
  ['xcode_b', 168, 168],
  ['ivy_a', 288, 512],
  ['ivy_b', 288, 512],
  ['ghost', 400, 288],
  // soft
  ['soot_a', 176, 448],
  ['soot_b', 176, 448],
  ['rust_a', 96, 512],
  ['rust_b', 96, 512],
  ['stain_a', 128, 384],
  ['stain_b', 128, 384],
  ['damp_a', 168, 168],
  ['damp_b', 168, 168],
  ['crack_a', 168, 168],
  ['crack_b', 168, 168],
  ['bullets', 168, 168],
  ['blood', 168, 168],
  ['scorch', 168, 168],
];
export const CITY_ATLAS = (() => {
  const S = 2048, PAD = 4;
  const out = {};
  let x = PAD, y = PAD, rowH = 0;
  // (the tallest first: rows of one height waste nothing)
  for (const [name, w, h] of CITY_CELLS.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1])) {
    if (x + w + PAD > S) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    out[name] = [x, y, w, h];
    x += w + PAD;
    rowH = Math.max(rowH, h);
    if (y + h + PAD > S) throw new Error(`textures: the city's atlas is full at '${name}'`);
  }
  return out;
})();
export function cityUV(name) {
  const [x, y, w, h] = CITY_ATLAS[name];
  // (half a texel in from the edge: a neighbour's colour never bleeds in under mip-mapping)
  return { u0: (x + 0.5) / 2048, u1: (x + w - 0.5) / 2048, v0: 1 - (y + h - 0.5) / 2048, v1: 1 - (y + 0.5) / 2048, w, h };
}

GEN.city = () => {
  const S = 2048;
  const c = mkCanvas(S, S);
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, S, S);
  const r = rngf(1401);
  const sans = (px) => `bold ${px}px "Arial Black", "Arial", sans-serif`;
  const serif = (px) => `bold ${px}px "Georgia", "Times New Roman", serif`;
  const hand = (px) => `bold ${px}px "Segoe Print", "Comic Sans MS", "Marker Felt", cursive`;
  const cell = (g, name, fn) => {
    const [x, y, w, h] = CITY_ATLAS[name];
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.translate(x, y);
    fn(w, h);
    g.restore();
  };
  // what years do to a painted board: rust runs from the top, the paint gone in patches, dirt
  const weather = (w, h, amt = 1) => {
    for (let k = 0; k < 14 * amt; k++) {
      const px = r() * w, py = r() * h, R = 8 + r() * Math.min(w, h) * 0.4;
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, `rgba(34,26,18,${0.22 + r() * 0.3})`);
      g.addColorStop(1, 'rgba(34,26,18,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
    }
    for (let k = 0; k < 22 * amt; k++) {
      const px = r() * w, l = h * (0.3 + r() * 0.7), wd = 2 + r() * 7;
      const g = ctx.createLinearGradient(0, 0, 0, l);
      g.addColorStop(0, `rgba(118,62,26,${0.25 + r() * 0.3})`);
      g.addColorStop(1, 'rgba(118,62,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px, 0, wd, l);
    }
    // flaked to the primer
    for (let k = 0; k < 26 * amt; k++) {
      ctx.fillStyle = `rgba(${150 + r() * 40},${140 + r() * 36},${120 + r() * 30},${0.5 + r() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 2 + r() * 10, 1.5 + r() * 6, r() * 3, 0, 7);
      ctx.fill();
    }
  };
  const fit = (t, w, px, fontOf) => {
    ctx.font = fontOf(px);
    const m = ctx.measureText(t).width;
    if (m > w) ctx.font = fontOf(Math.floor((px * w) / m));
  };
  for (const [name, w, h, text, board, ink] of CITY_CELLS) {
    if (!text) continue;
    cell(ctx, name, () => {
      ctx.fillStyle = board;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 4;
      ctx.strokeRect(9, 9, w - 18, h - 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (h > w) {
        // letters down a blade sign
        const n = text.length;
        ctx.font = sans(Math.floor(Math.min(w * 0.72, (h / n) * 0.8)));
        for (let k = 0; k < n; k++) ctx.fillText(text[k], w / 2, ((k + 0.5) * (h - 30)) / n + 15);
      } else {
        fit(text, w - 44, Math.floor(h * 0.6), name === 'church' || name === 'shop_hotel' || name === 'shop_books' ? serif : sans);
        ctx.fillText(text, w / 2, h / 2 + 3);
      }
      // a letter or two gone from it
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = board;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(30 + r() * (w - 60), 16 + r() * (h - 50), 8 + r() * 22, 10 + r() * 22);
        ctx.globalAlpha = 1;
      }
      weather(w, h, w / 512);
    });
  }
  // the picture house's letter board: black letters on white rails, half of them fallen
  cell(ctx, 'marquee', (w, h) => {
    ctx.fillStyle = '#cfcab8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(40,36,30,0.5)';
    for (let k = 1; k < 3; k++) ctx.fillRect(0, (k * h) / 3 - 2, w, 3);
    ctx.fillStyle = '#16130f';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ['NOW SHOWING', 'THE LAST TRAIN OUT', 'CLOSED UNTIL FURTHER NOTICE'].forEach((t, k) => {
      const cw = Math.min(54, (w - 80) / t.length);
      for (let j = 0; j < t.length; j++) {
        if (t[j] === ' ' || r() < 0.24) continue;
        ctx.save();
        ctx.translate(w / 2 + (j - (t.length - 1) / 2) * cw, ((k + 0.5) * h) / 3 + 2);
        ctx.rotate(r() < 0.12 ? (r() - 0.5) * 1.2 : 0);
        ctx.font = sans(Math.floor(Math.min(60, cw * 1.25)));
        ctx.fillText(t[j], 0, 0);
        ctx.restore();
      }
    });
    weather(w, h, 1.4);
  });
  cell(ctx, 'gasprice', (w, h) => {
    ctx.fillStyle = '#b8b2a0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a02418';
    ctx.fillRect(0, 0, w, 120);
    ctx.fillStyle = '#f0e8d4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = sans(84);
    ctx.fillText('GAS', w / 2, 64);
    ctx.fillStyle = '#141210';
    [['REGULAR', '9.99'], ['PLUS', '--.--'], ['DIESEL', 'NONE']].forEach(([a, b], k) => {
      ctx.textAlign = 'left';
      ctx.font = sans(24);
      ctx.fillText(a, 16, 170 + k * 116);
      ctx.textAlign = 'center';
      ctx.font = sans(62);
      ctx.fillText(b, w / 2, 222 + k * 116);
    });
    weather(w, h, 1.2);
  });
  const stencilBoard = (name, lines, bg, ink) =>
    cell(ctx, name, (w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach(([t, px], k) => {
        fit(t, w - 40, px, sans);
        ctx.fillText(t, w / 2, ((k + 0.5) * (h - 20)) / lines.length + 10);
      });
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      weather(w, h, 1);
      // shot at
      for (let k = 0; k < 7; k++) {
        const px = 20 + r() * (w - 40), py = 20 + r() * (h - 40);
        ctx.fillStyle = '#0c0b0a';
        ctx.beginPath();
        ctx.arc(px, py, 4 + r() * 3, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,84,40,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  stencilBoard('quarantine', [['QUARANTINE ZONE', 64], ['NO ENTRY BEYOND THIS POINT', 40], ['LETHAL FORCE AUTHORIZED', 40]], '#c9c4b2', '#8a1a12');
  stencilBoard('evac', [['EVACUATION ROUTE', 60], ['CALDER FIELD  9 MI  >>>', 50]], '#1e5a34', '#e8e4d4');
  // hoardings: what was being sold when it stopped
  const hoarding = (name, top, big, sub, bg, ink) =>
    cell(ctx, name, (w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, bg[0]);
      g.addColorStop(1, bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = sans(30);
      ctx.fillText(top, w / 2, 40);
      fit(big, w - 50, 96, serif);
      ctx.fillText(big, w / 2, h / 2 + 6);
      ctx.font = sans(26);
      ctx.fillText(sub, w / 2, h - 36);
      // the paper torn off in strips, the last advert under it
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = `rgba(${170 + r() * 50},${160 + r() * 50},${130 + r() * 40},0.92)`;
        const px = r() * w, wd = 16 + r() * 60;
        ctx.beginPath();
        ctx.moveTo(px, r() * h * 0.4);
        ctx.lineTo(px + wd, r() * h * 0.3);
        ctx.lineTo(px + wd * (0.6 + r() * 0.6), h * (0.5 + r() * 0.5));
        ctx.lineTo(px - wd * 0.2, h * (0.5 + r() * 0.5));
        ctx.fill();
      }
      weather(w, h, 1.6);
    });
  hoarding('billboard_a', 'FLY THE COAST', 'Pacific & Northern', 'DAILY FROM CALDER FIELD', ['#3a6a8a', '#c8b890'], '#f4ecd8');
  hoarding('billboard_b', 'STAY INDOORS  -  STAY CALM', 'HELP IS COMING', 'CIVIL DEFENSE AUTHORITY', ['#b8b4a8', '#8a867a'], '#7a1812');
  // notices pasted up: the missing, the orders
  ['poster_a', 'poster_b', 'poster_c', 'poster_d'].forEach((name, n) =>
    cell(ctx, name, (w, h) => {
      ctx.fillStyle = ['#d8d2bc', '#c8c0a4', '#dcd8cc', '#b8b29a'][n];
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1a1612';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = sans(n % 2 ? 20 : 22);
      ctx.fillText(['MISSING', 'CURFEW', 'HAVE YOU SEEN', 'NOTICE'][n], w / 2, 20, w - 8);
      if (n % 2 === 0) {
        ctx.fillStyle = '#6a665a';
        ctx.fillRect(w * 0.2, 38, w * 0.6, 78);
        ctx.fillStyle = '#3a3630';
        ctx.beginPath();
        ctx.arc(w / 2, 68, 18, 0, 7);
        ctx.fill();
        ctx.fillRect(w * 0.32, 88, w * 0.36, 28);
      }
      ctx.fillStyle = 'rgba(30,26,20,0.75)';
      for (let k = 0; k < (n % 2 ? 11 : 5); k++) ctx.fillRect(12, (n % 2 ? 44 : 128) + k * 12, (w - 24) * (0.6 + r() * 0.4), 4);
      weather(w, h, 0.5);
      // a corner torn away
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(w, h);
      ctx.lineTo(w - 20 - r() * 40, h);
      ctx.lineTo(w, h - 20 - r() * 50);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }),
  );
  cell(ctx, 'redcross', (w, h) => {
    ctx.fillStyle = '#d6d2c6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9a1c16';
    ctx.fillRect(w * 0.38, h * 0.14, w * 0.24, h * 0.72);
    ctx.fillRect(w * 0.14, h * 0.38, w * 0.72, h * 0.24);
    weather(w, h, 0.5);
  });
  // leaded glass: panes of colour between black cames, a figure in the middle of it, panes knocked out
  ['stained_a', 'stained_b'].forEach((name, n) =>
    cell(ctx, name, (w, h) => {
      ctx.fillStyle = '#0c0b0a';
      ctx.fillRect(0, 0, w, h);
      const cols = n ? ['#8a2a22', '#b8902a', '#2a4a7a', '#4a7a4a', '#7a3a6a'] : ['#24467a', '#9a2a20', '#c0a030', '#3a6a5a', '#6a4a8a'];
      for (let j = 0; j < 10; j++) {
        for (let i = 0; i < 5; i++) {
          if (r() < 0.14) continue; // (knocked out)
          ctx.fillStyle = cols[Math.floor(r() * cols.length)];
          ctx.globalAlpha = 0.55 + r() * 0.4;
          ctx.beginPath();
          const cx = ((i + (j % 2) * 0.5) * w) / 4.5, cy = ((j + 0.5) * h) / 10;
          ctx.moveTo(cx, cy - h / 20 + 1.5);
          ctx.lineTo(cx + w / 9 - 1.5, cy);
          ctx.lineTo(cx, cy + h / 20 - 1.5);
          ctx.lineTo(cx - w / 9 + 1.5, cy);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = n ? '#c8b060' : '#d0c8a0';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.36, w * 0.16, h * 0.07, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = n ? '#2a4a7a' : '#8a2a22';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.42);
      ctx.lineTo(w * 0.76, h * 0.86);
      ctx.lineTo(w * 0.24, h * 0.86);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#0c0b0a';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      weather(w, h, 0.25);
    }),
  );
  // ---- sprayed on a wall: by hand, dripping
  const spray = (name, lines, col, runs = 34) =>
    cell(ctx, name, (w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((t, k) => {
        const cy = ((k + 0.5) * h * 0.86) / lines.length + h * 0.04;
        fit(t, w - 36, Math.floor(((h * 0.86) / lines.length) * 0.78), hand);
        ctx.save();
        ctx.translate(w / 2, cy);
        ctx.rotate((r() - 0.5) * 0.06);
        // (the can's soft edge, then the line)
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.25;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(t, dx, dy);
        ctx.globalAlpha = 0.95;
        ctx.fillText(t, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 0.8;
        for (let j = 0; j < 7; j++) ctx.fillRect(30 + r() * (w - 60), cy + 6 + r() * 10, 2 + r() * 2.5, 10 + r() * runs);
        ctx.globalAlpha = 1;
      });
    });
  spray('graf_help', ['HELP US'], '#b8b4a6');
  spray('graf_dead', ['DEAD INSIDE', 'DO NOT OPEN'], '#8a1810');
  spray('graf_room', ['NO MORE ROOM', 'AT THE HOSPITAL'], '#16140f');
  spray('graf_god', ['GOD FORGIVE US'], '#c0bcae');
  spray('graf_bridge', ['BRIDGE IS OUT', 'GO TO THE AIRFIELD ->'], '#b8902a');
  spray('graf_night', ['THEY COME', 'AT NIGHT'], '#8a1810', 60);
  spray('graf_names', ['MARIA + KIDS', 'GONE TO', 'CALDER FIELD', 'WAIT FOR US'], '#d0ccbe', 12);
  spray('graf_tag', ['KSR 9'], '#2a5a7a');
  // the searchers' mark: a cross, the date, the count of the dead
  ['xcode_a', 'xcode_b'].forEach((name, n) =>
    cell(ctx, name, (w, h) => {
      ctx.strokeStyle = n ? '#c05a1c' : '#b8b4a6';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(22, 22);
      ctx.lineTo(w - 22, h - 22);
      ctx.moveTo(w - 22, 22);
      ctx.lineTo(22, h - 22);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = hand(30);
      ctx.fillText(n ? '9-14' : '9-11', w / 2, 26);
      ctx.fillText(n ? '7 D' : '0', w / 2, h - 24);
      ctx.fillText(n ? 'NG' : 'TF2', 30, h / 2);
      ctx.fillText(n ? 'X' : 'NE', w - 30, h / 2);
    }),
  );
  // ivy up a wall: a thick sheet of leaves from the ground, thinning to runners at its top and edges
  ['ivy_a', 'ivy_b'].forEach((name, n) =>
    cell(ctx, name, (w, h) => {
      // (how high it has got at x: three tongues of it of their own heights, ragged)
      const tongues = [[0.22 + r() * 0.12, 0.5 + r() * 0.45, 0.2], [0.5 + r() * 0.1, 0.6 + r() * 0.4, 0.26], [0.78 - r() * 0.12, 0.35 + r() * 0.5, 0.18]];
      const reach = (x) => h * Math.min(0.98, 0.1 + tongues.reduce((m, [c, top, wd]) => Math.max(m, top * Math.exp(-(((x / w - c) / wd) ** 2))), 0) * (0.85 + 0.15 * Math.sin(x * 0.11 + n * 2)));
      ctx.strokeStyle = '#2a2014';
      ctx.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        let x = w * (0.1 + r() * 0.8), y = h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const top = h - reach(x) * (0.8 + r() * 0.3);
        while (y > top) {
          x += (r() - 0.5) * 26;
          y -= 14 + r() * 20;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let k = 0; k < 2600; k++) {
        const x = r() * w;
        const y = h - Math.pow(r(), 1.5) * reach(x);
        const s = 6 + r() * 9;
        const dead = n === 1 && r() < 0.35;
        const sh = 0.55 + r() * 0.6;
        ctx.fillStyle = dead ? rgb(82 * sh, 62 * sh, 32 * sh) : rgb(24 * sh + r() * 14, 52 * sh + r() * 20, 20 * sh);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * 6.3);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.9, -s * 0.5, s * 0.75, s * 0.2);
        ctx.quadraticCurveTo(s * 0.3, s * 0.3, 0, s);
        ctx.quadraticCurveTo(-s * 0.3, s * 0.3, -s * 0.75, s * 0.2);
        ctx.quadraticCurveTo(-s * 0.9, -s * 0.5, 0, -s);
        ctx.fill();
        ctx.restore();
      }
    }),
  );
  // a wall painted with an advertisement before anyone here was born: all but gone
  cell(ctx, 'ghost', (w, h) => {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#d8d0b8';
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1e2a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = serif(70);
    ctx.fillText('KESSLER', w / 2, 96);
    ctx.font = sans(44);
    ctx.fillText('IRON & STEEL', w / 2, 190);
    ctx.font = serif(34);
    ctx.fillText('PORT CALDER  EST. 1894', w / 2, 290, w - 30);
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 500; k++) {
      ctx.globalAlpha = 0.5 + r() * 0.5;
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 3 + r() * 16, 2 + r() * 8, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  });
  // a highway sign on the island's Route 9, on the way to the bridge: the airport, straight on (issue #269)
  cell(ctx, 'road_airport', (cw, ch) => {
    // (drawn at 384 x 192 and scaled into its cell: the atlas has no more room than this)
    ctx.scale(cw / 384, ch / 192);
    const w = 384, h = 192;
    const q = rngf(1403);
    ctx.fillStyle = '#1f5a36';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8e6da';
    ctx.lineWidth = 7;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ece9dc';
    // the plane, seen from above, nose up
    ctx.save();
    ctx.translate(74, h / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 46, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-50, 6);
    ctx.lineTo(50, 6);
    ctx.lineTo(8, -16);
    ctx.lineTo(-8, -16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-20, 42);
    ctx.lineTo(20, 42);
    ctx.lineTo(5, 30);
    ctx.lineTo(-5, 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fit('AIRPORT', 190, 58, sans);
    ctx.fillText('AIRPORT', 236, 64);
    fit('CALDER FIELD  VIA BRIDGE', 210, 22, sans);
    ctx.fillText('CALDER FIELD  VIA BRIDGE', 236, 112);
    // straight on
    ctx.beginPath();
    ctx.moveTo(236, 128);
    ctx.lineTo(262, 156);
    ctx.lineTo(246, 156);
    ctx.lineTo(246, 176);
    ctx.lineTo(226, 176);
    ctx.lineTo(226, 156);
    ctx.lineTo(210, 156);
    ctx.closePath();
    ctx.fill();
    // years by the road: dirt, rust from the bolts, a few shots
    for (let k = 0; k < 18; k++) {
      const px = q() * w, py = q() * h, R = 8 + q() * 40;
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, `rgba(34,26,18,${0.12 + q() * 0.2})`);
      g.addColorStop(1, 'rgba(34,26,18,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - R, py - R, R * 2, R * 2);
    }
    for (const bx of [24, w - 24]) {
      const g = ctx.createLinearGradient(0, 18, 0, 90);
      g.addColorStop(0, 'rgba(118,62,26,0.6)');
      g.addColorStop(1, 'rgba(118,62,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - 3, 18, 6, 72);
    }
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#0c0b0a';
      ctx.beginPath();
      ctx.arc(20 + q() * (w - 40), 20 + q() * (h - 40), 3 + q() * 3, 0, 7);
      ctx.fill();
    }
  });
  // ---- soft: read back and written per pixel (noise shapes them; a canvas gradient is too clean)
  const img = canvasToImg(c);
  const D = img.d;
  const NW = 256;
  const soft = (name, seed, fn) => {
    const [x0, y0, w, h] = CITY_ATLAS[name];
    const n1 = fbm(NW, NW, 4, 4, 4, seed), n2 = fbm(NW, NW, 18, 18, 3, seed + 1), n3 = fbm(NW, NW, 24, 3, 4, seed + 2);
    const o = [0, 0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (((y * NW) / h) | 0) * NW + (((x * NW) / w) | 0);
        const kk = (y & 255) * NW + (x & 255);
        fn(x / w, y / h, n1[k], n2[kk], n3[kk], o);
        // (soft to nothing at the cell's edge, whatever the shape)
        const e = Math.min(x, w - 1 - x, y, h - 1 - y);
        const i = ((y0 + y) * S + x0 + x) * 4;
        D[i] = o[0];
        D[i + 1] = o[1];
        D[i + 2] = o[2];
        D[i + 3] = clamp(o[3] * sstep(0, 10, e)) * 255;
      }
    }
  };
  // soot from a window that burnt: densest at the lintel (the foot of the cell), spreading and thinning upward
  for (const [name, seed] of [['soot_a', 1411], ['soot_b', 1421]]) {
    soft(name, seed, (u, v, a, b, st, o) => {
      const up = 1 - v; // (0 at the foot)
      const side = Math.abs(u - 0.5 + (a - 0.5) * 0.3 * up) / (0.2 + up * 0.26);
      const dens = (1 - sstep(0.35, 1, side)) * Math.pow(1 - up, 1.25) * (0.75 + st * 0.5);
      const k = 10 + b * 14;
      o[0] = k;
      o[1] = k * 0.95;
      o[2] = k * 0.9;
      o[3] = clamp(dens * 1.5) * 0.94;
    });
  }
  // rust run down from a fixing at the head of the cell
  for (const [name, seed] of [['rust_a', 1431], ['rust_b', 1441]]) {
    soft(name, seed, (u, v, a, b, st, o) => {
      const side = Math.abs(u - 0.5 + (a - 0.5) * 0.25) / (0.14 + v * 0.3);
      const dens = (1 - sstep(0.2, 1, side)) * Math.pow(1 - v, 0.8) * (0.4 + st * 0.9);
      o[0] = 92 + b * 30;
      o[1] = 52 + b * 18;
      o[2] = 28 + b * 10;
      o[3] = clamp(dens) * 0.62;
    });
  }
  // what the rain has run down a wall from a sill or a coping: dark streaks
  for (const [name, seed] of [['stain_a', 1451], ['stain_b', 1461]]) {
    soft(name, seed, (u, v, a, b, st, o) => {
      const streak = sstep(0.42, 0.7, st) * (1 - sstep(0.5, 1, Math.abs(u - 0.5) * 2));
      const dens = streak * Math.pow(1 - v, 0.6) * (0.6 + a * 0.6);
      o[0] = 26 + b * 16;
      o[1] = 30 + b * 20;
      o[2] = 22 + b * 10;
      o[3] = clamp(dens) * 0.78;
    });
  }
  for (const [name, seed, col] of [['damp_a', 1471, [30, 40, 24]], ['damp_b', 1481, [22, 20, 18]]]) {
    soft(name, seed, (u, v, a, b, st, o) => {
      const dens = sstep(0.95, 0.2, Math.hypot(u - 0.5, v - 0.5) * 2 + (a - 0.5) * 0.9) * (0.5 + b * 0.7);
      o[0] = col[0] + b * 20;
      o[1] = col[1] + b * 24;
      o[2] = col[2] + b * 10;
      o[3] = clamp(dens) * 0.72;
    });
  }
  soft('scorch', 1491, (u, v, a, b, st, o) => {
    const k = 8 + b * 12;
    o[0] = k;
    o[1] = k;
    o[2] = k;
    o[3] = clamp(sstep(1, 0.1, Math.hypot(u - 0.5, v - 0.5) * 2 + (a - 0.5) * 0.7)) * 0.92;
  });
  const c2 = imgToCanvas(img, c);
  const g2 = ctx2d(c2);
  for (const name of ['crack_a', 'crack_b']) {
    cell(g2, name, (w, h) => {
      const rc = rngf(name === 'crack_a' ? 1501 : 1502);
      drawCracks(g2, w, h, () => 0.15 + rc() * 0.7, 3, { len: [120, 260], width: [1.2, 2.6], col: 'rgba(14,12,10,0.86)', light: 'rgba(190,184,170,0.25)', branch: 2.4, wander: 0.7, step: 6 });
    });
  }
  cell(g2, 'bullets', (w, h) => {
    for (let k = 0; k < 16; k++) {
      const px = 24 + r() * (w - 48), py = 24 + r() * (h - 48), R = 3 + r() * 5;
      const g = g2.createRadialGradient(px, py, R * 0.5, px, py, R * 2.6);
      g.addColorStop(0, 'rgba(150,146,136,0.85)');
      g.addColorStop(1, 'rgba(150,146,136,0)');
      g2.fillStyle = g;
      g2.fillRect(px - R * 3, py - R * 3, R * 6, R * 6);
      g2.fillStyle = 'rgba(10,9,8,0.95)';
      g2.beginPath();
      g2.arc(px, py, R, 0, 7);
      g2.fill();
    }
  });
  cell(g2, 'blood', (w, h) => {
    g2.fillStyle = 'rgba(70,10,6,0.85)';
    // a hand dragged down the wall, twice
    for (const [hx, hy] of [[70, 50], [160, 90]]) {
      for (let f = 0; f < 4; f++) {
        g2.beginPath();
        g2.ellipse(hx + f * 9 - 14, hy - 16 + Math.abs(f - 1.5) * 4, 3.5, 11, 0, 0, 7);
        g2.fill();
        g2.globalAlpha = 0.5;
        g2.fillRect(hx + f * 9 - 16, hy - 6, 4, 60 + r() * 70);
        g2.globalAlpha = 1;
      }
      g2.beginPath();
      g2.ellipse(hx, hy + 8, 17, 15, 0, 0, 7);
      g2.fill();
    }
    for (let k = 0; k < 30; k++) {
      g2.beginPath();
      g2.arc(r() * w, h * 0.3 + r() * h * 0.6, 1 + r() * 5, 0, 7);
      g2.fill();
    }
  });
  return { canvas: c2, clamp: true };
};
