// The mainland field map's harbour (mapmainland.js): the boats, the ship at the quay, the containers and the cranes.
import { RUST } from './marks.js';

// the boats: a hull each, on the water
export function drawHarbour(g, world, S, mapX, mapY) {
  const parts = world.parts;
  g.fillStyle = '#e8dcc0';
  g.strokeStyle = '#3a2c1e';
  g.lineWidth = 1;
  for (const pr of world.props) {
    if (pr.type !== 'boat') continue;
    g.save();
    g.translate(mapX(pr.x), mapY(pr.z));
    g.rotate(-pr.ry);
    g.beginPath();
    g.moveTo(0, -4.6 * S);
    g.quadraticCurveTo(1.6 * S, -1 * S, 1.2 * S, 3.6 * S);
    g.lineTo(-1.2 * S, 3.6 * S);
    g.quadraticCurveTo(-1.6 * S, -1 * S, 0, -4.6 * S);
    g.fill();
    g.stroke();
    g.restore();
  }

  // ---- a ship moored at the quay: its hull, pointed at the bow, the deck lighter; and every container as a small
  // coloured block, on the apron, the ship and the wagons, as the picture draws the stacks
  for (const p of parts) {
    if (p.mat !== 'rust' || p.sx < 12 || p.sz < 50 || p.sy < 6) continue;
    g.save();
    g.translate(mapX(p.x), mapY(p.z));
    g.rotate(-p.ry);
    const hw = (p.sx / 2) * S, hl = (p.sz / 2) * S;
    g.beginPath();
    g.moveTo(-hw, hl);
    g.lineTo(hw, hl);
    g.lineTo(hw, -hl);
    g.lineTo(0, -hl - 9 * S);
    g.lineTo(-hw, -hl);
    g.closePath();
    g.fillStyle = '#4a3f38';
    g.fill();
    g.strokeStyle = '#1c1612';
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = '#d8d0c0';
    g.fillRect(-hw * 0.8, hl - 13 * S, hw * 1.6, 8 * S); // (its house at the stern)
    g.restore();
  }
  const CONTAINER = ['#a5462a', '#24548a', '#3f6e3a', '#b08a2e'];
  for (const pr of world.props) {
    if (pr.type !== 'shipping_container') continue;
    g.save();
    g.translate(mapX(pr.x), mapY(pr.z));
    g.rotate(-pr.ry);
    g.fillStyle = CONTAINER[(pr.seed ?? 0) & 3];
    g.fillRect(-1.25 * S, -3.05 * S, 2.5 * S, 6.1 * S);
    g.strokeStyle = 'rgba(20, 16, 12, 0.7)';
    g.lineWidth = 0.6;
    g.strokeRect(-1.25 * S, -3.05 * S, 2.5 * S, 6.1 * S);
    g.restore();
  }

  const seenCrane = new Set();
  // ---- the docks' cranes: the gantry on its four legs (a rust square, crossed) and its jib out over the water
  for (const p of parts) {
    if (p.mat !== 'rust' || p.sx < 55 || p.sx > 70 || p.sy < 2 || p.sy > 2.5 || p.y < 25) continue;
    const ck = Math.round(p.x) + ',' + Math.round(p.z / 8);
    if (seenCrane.has(ck)) continue;
    seenCrane.add(ck);
    const c = Math.cos(p.ry), sn = Math.sin(p.ry);
    // (the jib's quay end, where the gantry stands: its centre is 14 m on from there, toward the land)
    const qx = p.x + c * 23.9, qz = p.z - sn * 23.9;
    g.save();
    g.translate(mapX(qx), mapY(qz));
    g.rotate(-p.ry);
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 2.6;
    g.strokeRect(-8 * S, -8 * S, 16 * S, 16 * S);
    g.strokeStyle = RUST;
    g.lineWidth = 1.6;
    g.strokeRect(-8 * S, -8 * S, 16 * S, 16 * S);
    g.beginPath();
    g.moveTo(-8 * S, -8 * S);
    g.lineTo(8 * S, 8 * S);
    g.moveTo(8 * S, -8 * S);
    g.lineTo(-8 * S, 8 * S);
    g.stroke();
    // the jib: out from the gantry over the water
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(7.6 * S, 0);
    g.lineTo(-55.4 * S, 0);
    g.stroke();
    g.strokeStyle = RUST;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#e0d6c0';
    g.fillRect(-3 * S, -1.6 * S, 3.2 * S, 3.2 * S);
    g.restore();
  }
}
