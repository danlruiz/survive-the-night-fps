// Renders the baked field map for a seed (?seed=123&debug=1 shows sites, containers, part spots, doorways; ?act=2:
// the mainland; ?export=1: the map with its names drawn in, as window.__mapPNG, for scripts/clip/map-layout.js).
import { worldFor } from '../../shared/worlds.js';
import { ZONE_NAMES } from '../../shared/defs.js';
import { renderMapCanvas, mapX, mapY } from '../ui/mapcanvas.js';

const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || 12345);
const act = +(q.get('act') || 1);
const t0 = performance.now();
const world = worldFor(seed, act);
const t1 = performance.now();
const cv = renderMapCanvas(world);
const t2 = performance.now();
console.log(`world ${(t1 - t0).toFixed(0)}ms map ${(t2 - t1).toFixed(0)}ms`);
const wrap = document.getElementById('wrap');
wrap.appendChild(cv);
if (q.get('debug')) {
  const ov = document.createElement('canvas');
  ov.width = ov.height = cv.width;
  wrap.appendChild(ov);
  const g = ov.getContext('2d');
  const dot = (x, z, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(mapX(x), mapY(z), r, 0, Math.PI * 2);
    g.fill();
  };
  for (const c of world.containers) dot(c.x, c.z, 2.2, '#d9a400');
  for (const p of world.partSpots) dot(p.x, p.z, 3.5, '#e0301e');
  for (const o of world.openings) dot(o.x, o.z, 2, '#1e7be0');
  for (const s of world.sites) {
    g.strokeStyle = '#8a1fd6';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(mapX(s.x), mapY(s.z), 7, 0, Math.PI * 2);
    g.stroke();
  }
  dot(world.car.x, world.car.z, 5, '#00ff66');
}
for (const z of world.zones) {
  const l = document.createElement('div');
  l.className = 'lab';
  l.textContent = ZONE_NAMES[z.id];
  l.style.left = mapX(z.x) + 'px';
  l.style.top = mapY(z.z) + 'px';
  wrap.appendChild(l);
}

// the names as the map screen puts them (client/ui/mapscreen.js: the places, then what a place's map names in it),
// drawn into a copy of the canvas for a script to take
window.__mapTimes = { world: t1 - t0, map: t2 - t1 };
if (q.get('export')) {
  const out = document.createElement('canvas');
  out.width = out.height = cv.width;
  const g = out.getContext('2d');
  g.drawImage(cv, 0, 0);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const k = cv.width / 2560;
  // (as the map screen writes them at its least zoom: where a place asks for its name to be (label), the lesser places
  // smaller, nothing of what is inside the city, and nothing over the map's edge)
  const name = (text, x, z, size, italic = false) => {
    g.font = `${italic ? 'italic ' : 'bold '}${Math.round(size * k)}px Georgia, serif`;
    const w = g.measureText(text).width;
    const px = Math.max(w / 2 + 8 * k, Math.min(cv.width - w / 2 - 8 * k, mapX(x)));
    g.lineWidth = 8 * k;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(236, 222, 190, 0.95)';
    g.strokeText(text, px, mapY(z));
    g.fillStyle = '#1e140b';
    g.fillText(text, px, mapY(z));
  };
  for (const z of world.zones) {
    const [x, zz] = z.label || [z.x, z.z + (world.kind === 2 ? 0 : 0)];
    if (z.minor) name(ZONE_NAMES[z.id], x, zz, 22, true);
    else name(ZONE_NAMES[z.id].toUpperCase(), x, zz, 34);
  }
  for (const m of world.landmarks || []) {
    if (m.city) continue;
    const [x, z] = m.label || [m.x, m.z];
    if (m.big || m.pass) name(m.name.toUpperCase(), x, z, m.big ? 34 : 28);
    else name(m.name, x, z, 22, true);
  }
  window.__mapPNG = out.toDataURL('image/png');
}
