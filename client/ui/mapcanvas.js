// Bakes the field map of the valley (an old sepia survey map: hill shading, contour lines, forest
// stipple, water, roads, trails and building footprints) from the deterministic world once per world.
// Names and live markers are drawn on top by the map screen / compass, never baked in.
import { MAP_HALF, MAP_SIZE, GRID_STEP, WATER_LEVEL } from '../../shared/constants.js';
import { WHEEL } from '../../shared/fair.js';

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
  const MAP_HALF = half;
  const MAP_SIZE = world.size;
  const cv = document.createElement('canvas');
  cv.width = cv.height = MAP_PX;
  const g = cv.getContext('2d');

  // ---- raster: paper + hillshade + contours + water (1 px per metre, scaled up)
  const R = MAP_SIZE;
  const raster = document.createElement('canvas');
  raster.width = raster.height = R;
  const rg = raster.getContext('2d');
  const img = rg.createImageData(R, R);
  const d = img.data;
  const H = world.heights;
  const N = world.gridN;
  const hAt = (x, z) => {
    let fx = (x + MAP_HALF) / GRID_STEP;
    let fz = (z + MAP_HALF) / GRID_STEP;
    fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > N - 1.001 ? N - 1.001 : fz;
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * N + i;
    const a = H[k] + (H[k + 1] - H[k]) * tx;
    const b = H[k + N] + (H[k + N + 1] - H[k + N]) * tx;
    return a + (b - a) * tz;
  };
  const hs = new Float32Array(R * R);
  for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) hs[py * R + px] = hAt(px - MAP_HALF + 0.5, py - MAP_HALF + 0.5);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rock = world.cliffAt || null;
  const forest = world.forestAt || null;
  for (let py = 0; py < R; py++) {
    for (let px = 0; px < R; px++) {
      const k = py * R + px;
      const h = hs[k];
      const hl = hs[py * R + Math.max(0, px - 1)];
      const hr = hs[py * R + Math.min(R - 1, px + 1)];
      const hu = hs[Math.max(0, py - 1) * R + px];
      const hd = hs[Math.min(R - 1, py + 1) * R + px];
      // light from the north-west
      const shade = Math.max(-1, Math.min(1, ((hl - hr) + (hu - hd)) * 0.55));
      let r = 214;
      let gg = 199;
      let b = 164;
      // elevation tint: valleys a touch greener, heights paler
      const e = Math.max(0, Math.min(1, (h + 6) / 36));
      r += (e - 0.4) * 22;
      gg += (e - 0.4) * 16;
      b += (e - 0.4) * 6;
      r += shade * 34;
      gg += shade * 30;
      b += shade * 24;
      // contour lines every 2.5 m (index line every 10 m)
      const step = rock && rock(px - MAP_HALF + 0.5, py - MAP_HALF + 0.5) > 0 ? 10 : 2.5;
      const c0 = Math.floor(h / step);
      if (Math.floor(hr / step) !== c0 || Math.floor(hd / step) !== c0) {
        const idx = Math.floor(Math.max(h, hr, hd) / step) % 4 === 0;
        const a = idx ? 0.34 : 0.18;
        r = r * (1 - a) + 96 * a;
        gg = gg * (1 - a) + 64 * a;
        b = b * (1 - a) + 38 * a;
      }
      // the mainland's forest (mainland.js forestAt): the woods a shade darker and greener under their stipple
      if (forest) {
        const f = forest(px - MAP_HALF + 0.5, py - MAP_HALF + 0.5);
        if (f > 0.15 && h > WATER_LEVEL) {
          const u = Math.min(1, (f - 0.15) * 0.9) * 0.32;
          r = r * (1 - u) + 92 * u;
          gg = gg * (1 - u) + 104 * u;
          b = b * (1 - u) + 72 * u;
        }
      }
      // the mainland's mountains (shared/mainland.js cliffAt): rock, grey and hatched with light, no contours on them
      // but every 10 m; their cliffs at the foot inked
      if (rock) {
        const m = rock(px - MAP_HALF + 0.5, py - MAP_HALF + 0.5);
        if (m > -1.5) {
          const u = Math.max(0, Math.min(1, (m + 1.5) / 6));
          const lit = 150 + shade * 70 + (e - 0.5) * 30;
          r = r * (1 - u) + (lit + 4) * u;
          gg = gg * (1 - u) + (lit - 4) * u;
          b = b * (1 - u) + (lit - 14) * u;
          if (m < 2.5 && m > -1.5) {
            r = 92;
            gg = 80;
            b = 66;
          }
        }
      }
      if (h < WATER_LEVEL) {
        const depth = Math.min(1, (WATER_LEVEL - h) / 5);
        r = 118 - depth * 34;
        gg = 136 - depth * 30;
        b = 138 - depth * 20;
        // shoreline ink
        if (hr >= WATER_LEVEL || hd >= WATER_LEVEL || hl >= WATER_LEVEL || hu >= WATER_LEVEL) {
          r = 70;
          gg = 78;
          b = 80;
        }
      }
      const n = (rnd() - 0.5) * 10;
      d[k * 4] = r + n;
      d[k * 4 + 1] = gg + n;
      d[k * 4 + 2] = b + n;
      d[k * 4 + 3] = 255;
    }
  }
  rg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(raster, 0, 0, MAP_PX, MAP_PX);

  // ---- forest stipple
  const T = world.trees;
  g.fillStyle = 'rgba(58, 74, 52, 0.42)';
  for (let i = 0; i < T.length; i += 6) {
    const r = 1.1 + T[i + 3] * 1.3;
    g.beginPath();
    g.arc(mapX(T[i]), mapY(T[i + 2]), r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(40, 52, 36, 0.35)';
  for (let i = 0; i < T.length; i += 12) {
    g.beginPath();
    g.arc(mapX(T[i]) + 0.8, mapY(T[i + 2]) + 0.8, 0.9, 0, Math.PI * 2);
    g.fill();
  }

  // ---- roads
  const path = (road) => {
    const p = road.pts;
    g.beginPath();
    g.moveTo(mapX(p[0]), mapY(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(mapX(p[i]), mapY(p[i + 1]));
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // The mainland draws its roads by the legend of the layout they were built to (issue #232): main roads a dark
  // double line, secondary roads orange-brown, dirt roads a dashed red-brown, trails a dashed black
  if (world.kind === 2) {
    const styleOf = (road) => (road.kind === 3 ? 'trail' : road.kind === 1 ? 'dirt' : road.width >= 3.6 ? 'main' : road.width >= 3.3 ? 'street' : road.width >= 2.7 && road.width < 3.3 ? 'secondary' : 'lane');
    const STYLE = {
      main: [[10, '#2a2420'], [5.6, '#9b968c'], [1, '#3a332c']],
      street: [[8, '#3a332c'], [4.4, '#a29c90']],
      secondary: [[6.4, '#4e2e18'], [3.6, '#b9733a']],
      lane: [[3.6, 'rgba(90, 56, 30, 0.75)'], [1.8, '#cf9a62']],
    };
    for (const pass of [0, 1, 2]) {
      for (const road of world.roads) {
        const st = styleOf(road);
        if (road.width > 6) {
          // (the runway: a grey band, its centre line dashed)
          if (pass) continue;
          path(road);
          g.strokeStyle = '#2a2420';
          g.lineWidth = road.width * 2 * S + 3;
          g.stroke();
          g.strokeStyle = '#7d7a74';
          g.lineWidth = road.width * 2 * S;
          g.stroke();
          g.setLineDash([10, 8]);
          g.strokeStyle = '#d8d2c4';
          g.lineWidth = 1.4;
          g.stroke();
          g.setLineDash([]);
          continue;
        }
        if (st === 'dirt' || st === 'trail') {
          if (pass !== 1) continue;
          path(road);
          g.setLineDash(st === 'dirt' ? [9, 6] : [5, 5]);
          g.strokeStyle = st === 'dirt' ? 'rgba(116, 38, 22, 0.9)' : 'rgba(24, 18, 14, 0.85)';
          g.lineWidth = st === 'dirt' ? 3 : 1.8;
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
  } else for (const pass of [0, 1]) {
    for (const road of world.roads) {
      path(road);
      if (road.kind === 3) {
        if (pass) continue;
        g.setLineDash([5, 5]);
        g.strokeStyle = 'rgba(92, 62, 34, 0.8)';
        g.lineWidth = 1.6;
        g.stroke();
        g.setLineDash([]);
      } else if (road.kind === 2) {
        g.strokeStyle = pass ? '#c9a066' : '#2e241c';
        g.lineWidth = pass ? 2.4 : 9;
        g.stroke();
      } else {
        g.strokeStyle = pass ? '#b58a58' : '#4a3422';
        g.lineWidth = pass ? 3.2 : 6.2;
        g.stroke();
      }
    }
  }

  // ---- the railway, as a survey map draws one: a line with sleepers hatched across it, from one tunnel mouth to
  // the other (a bar across each), and the siding at the depot
  if (world.rail) {
    g.strokeStyle = '#2a2019';
    world.rail.tracks.forEach((t, ti) => {
      const from = ti ? t.from : world.rail.portals[0].i;
      const to = ti ? t.to : world.rail.portals[1].i;
      g.lineWidth = 1.7;
      g.beginPath();
      g.moveTo(mapX(t.x[from]), mapY(t.z[from]));
      for (let i = from + 1; i <= to; i++) g.lineTo(mapX(t.x[i]), mapY(t.z[i]));
      g.stroke();
      g.lineWidth = 1.3;
      g.beginPath();
      for (let i = from + 3; i < to; i += 5) {
        const l = Math.hypot(t.x[i + 1] - t.x[i - 1], t.z[i + 1] - t.z[i - 1]) || 1;
        const nx = (-(t.z[i + 1] - t.z[i - 1]) / l) * 2.3;
        const nz = ((t.x[i + 1] - t.x[i - 1]) / l) * 2.3;
        g.moveTo(mapX(t.x[i] - nx), mapY(t.z[i] - nz));
        g.lineTo(mapX(t.x[i] + nx), mapY(t.z[i] + nz));
      }
      g.stroke();
    });
    g.lineWidth = 3.4;
    for (const p of world.rail.portals) {
      g.beginPath();
      g.moveTo(mapX(p.x - p.dz * 5.5), mapY(p.z + p.dx * 5.5));
      g.lineTo(mapX(p.x + p.dz * 5.5), mapY(p.z - p.dx * 5.5));
      g.stroke();
    }
  }

  // ---- the workings of the mine, as the surveyor drew them: the drifts dashed under the ground they run
  // beneath, a tick across each mouth
  if (world.mine) {
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

  // ---- St. Agnes Cemetery: its railings as a broken line, a cross for every grave
  const cem = world.cemetery;
  if (cem) {
    g.strokeStyle = 'rgba(38, 28, 22, 0.7)';
    g.lineWidth = 1.2;
    g.save();
    g.translate(mapX(cem.x), mapY(cem.z));
    g.rotate(-cem.ry);
    g.setLineDash([3, 2]);
    g.strokeRect(-cem.hx * S, -cem.hz * S, cem.hx * 2 * S, cem.hz * 2 * S);
    g.setLineDash([]);
    g.restore();
    g.lineWidth = 0.9;
    g.beginPath();
    for (const gr of cem.graves) {
      const x = mapX(gr.x);
      const y = mapY(gr.z);
      g.moveTo(x - 1.5, y - 0.5);
      g.lineTo(x + 1.5, y - 0.5);
      g.moveTo(x, y - 2);
      g.lineTo(x, y + 2);
    }
    g.stroke();
  }
  // ---- the fair's Ferris wheel, the one landmark that is seen from across the valley: a wheel, as a mark
  if (world.fair) {
    const f = world.fair;
    const x = mapX(f.x + f.c * WHEEL.x + f.s * WHEEL.z);
    const y = mapY(f.z - f.s * WHEEL.x + f.c * WHEEL.z);
    const r = WHEEL.r * S * 0.8;
    g.strokeStyle = 'rgba(52, 30, 24, 0.8)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI;
      g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.stroke();
  }

  // ---- buildings (walls + floors + roofs from the static parts)
  g.fillStyle = 'rgba(38, 28, 22, 0.88)';
  for (const p of world.parts) {
    if (p.shape !== 'box' && p.shape !== 'cyl') continue;
    if (p.sy < 0.9 && p.sx * p.sz < 30) continue;
    if (world.mine && p.y + p.sy / 2 < world.heightAt(p.x, p.z)) continue; // (the timbering of the mine: it is under the ground)
    const w = p.sx * S;
    const h = p.sz * S;
    if (w * h < 1.2) continue;
    g.save();
    g.translate(mapX(p.x), mapY(p.z));
    g.rotate(-p.ry);
    if (p.shape === 'cyl') {
      g.beginPath();
      g.arc(0, 0, w / 2, 0, Math.PI * 2);
      g.fill();
    } else if (p.sy < 0.9) {
      g.fillStyle = 'rgba(80, 64, 50, 0.35)';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(38, 28, 22, 0.88)';
    } else g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  // big props (vehicles, tents)
  const BIG = { car: 1, car_wreck: 1, pickup_truck: 1, school_bus: 1, camper: 1, dump_truck: 1, tractor: 1, military_tent: 1, tent: 1, heli_wreck: 1, log_pile: 1, fuel_tank: 1, car_burnt: 1, ambulance: 1, semi_truck: 1, fire_truck: 1, shipping_container: 1, airliner_wreck: 1, plane_wreck: 1, light_plane: 1, rubble_slope: 1, rubble_pile: 1, car_open: 1, city_bus: 1, box_truck: 1, van_wreck: 1, apc_wreck: 1, army_truck: 1, triage_tent: 1 };
  g.fillStyle = 'rgba(60, 44, 34, 0.7)';
  for (const pr of world.props) {
    if (!BIG[pr.type]) continue;
    const sz = PROP_SIZE[pr.type] || [2, 4];
    g.save();
    g.translate(mapX(pr.x), mapY(pr.z));
    g.rotate(-pr.ry);
    g.fillRect((-sz[0] / 2) * S, (-sz[1] / 2) * S, sz[0] * S, sz[1] * S);
    g.restore();
  }

  // ---- grid + border (1 square = 80 m)
  g.strokeStyle = 'rgba(70, 48, 30, 0.16)';
  g.lineWidth = 1;
  for (let v = 0; v <= MAP_SIZE; v += 80) {
    g.beginPath();
    g.moveTo(v * S, 0);
    g.lineTo(v * S, MAP_PX);
    g.moveTo(0, v * S);
    g.lineTo(MAP_PX, v * S);
    g.stroke();
  }
  // vignette / age
  const grad = g.createRadialGradient(MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.3, MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.75);
  grad.addColorStop(0, 'rgba(60,40,20,0)');
  grad.addColorStop(1, 'rgba(60,40,20,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, MAP_PX, MAP_PX);
  return cv;
}

const PROP_SIZE = {
  car: [1.9, 4.6],
  car_wreck: [1.9, 4.5],
  pickup_truck: [2.1, 5.4],
  school_bus: [2.6, 10.5],
  camper: [2.4, 6.6],
  dump_truck: [2.6, 7.2],
  tractor: [2, 3.8],
  military_tent: [4, 6],
  tent: [2.4, 2.8],
  heli_wreck: [3.2, 13],
  log_pile: [4.2, 2.4],
  fuel_tank: [2.2, 5],
  car_burnt: [1.9, 4.5],
  ambulance: [2.2, 5.6],
  semi_truck: [2.8, 16],
  fire_truck: [2.6, 8],
  shipping_container: [2.5, 6.1],
  airliner_wreck: [5, 28],
  plane_wreck: [3, 12],
  light_plane: [9, 7],
  rubble_slope: [6.4, 6.4],
  rubble_pile: [4.4, 4.4],
  car_open: [1.9, 4.5],
  city_bus: [2.6, 12],
  box_truck: [2.5, 7.5],
  van_wreck: [2, 5],
  apc_wreck: [2.9, 7],
  army_truck: [2.5, 7.5],
  triage_tent: [5, 7],
};
