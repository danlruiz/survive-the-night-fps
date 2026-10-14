// What is built into the mainland's mountains (mainland.js): the road tunnels' galleries and cuttings, and the walls
// nobody sees along the foot of every cliff.
import { GRID_STEP } from '../constants.js';
import { ZONE } from '../defs.js';
import { lerp, clamp } from '../rng.js';
import { makeBox, COL } from '../collision.js';
import { maskEdges } from '../mainland-ground.js';
import { HALF, N, CLIFF, WALL_T, TUNNEL_HW, TUNNEL_H, CUT_LEN } from './consts.js';

// landmarks: what the field map names (mainland.js)
export function buildTunnels({ plan, roads, kit, landmarks }) {
  const { al, FENCE, tunnels, tunnelOf } = plan;
  const { Builder } = kit;
  // (is a road other than a tunnel's own within r of (x, z)? A road through a tunnel has points in its gallery)
  const tunnelRoads = new Set(roads.filter((rd) => tunnels.some((t) => { for (let i = 0; i < rd.pts.length; i += 2) if (tunnelOf(rd.pts[i], rd.pts[i + 1], 0)) return true; return false; })));
  const roadsNear = (x, z, r) => roads.some((rd) => { if (tunnelRoads.has(rd)) return false; for (let i = 0; i + 3 < rd.pts.length; i += 2) { const [ax, az, bx, bz] = [rd.pts[i], rd.pts[i + 1], rd.pts[i + 2], rd.pts[i + 3]]; const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1; const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1); if (Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t) < r + rd.width) return true; } return false; });
  // THE ROAD TUNNELS: a concrete gallery through the mountain from mouth to mouth - walls, a roof, a face over either
  // mouth with its name - and the cuttings in front of them (their walls are the mountain's: below)
  for (const t of tunnels) {
    // (where the gallery is: worked out with its cap, above)
    if (t.s0 === undefined) continue;
    const { s0, s1 } = t;
    const ry = Math.atan2(t.dx, t.dz); // (a Builder turned by this has the road along its +Z)
    const levelAt = (s) => lerp(t.y0, t.y1, clamp((s + CUT_LEN) / (t.len + CUT_LEN * 2), 0, 1));
    const b = new Builder(t.a[0], t.a[1], ry, 0);
    b.zone = ZONE.FOREST;
    const SEG = 6;
    for (let s = s0; s < s1; s += SEG) {
      const e = Math.min(s1, s + SEG);
      const y = levelAt((s + e) / 2) - 0.1;
      for (const sd of [-1, 1]) b.box(sd * (TUNNEL_HW + 0.35), y, (s + e) / 2, 0.7, TUNNEL_H + 0.2, e - s + 0.05, 'concrete_pale');
      b.box(0, y + TUNNEL_H, (s + e) / 2, TUNNEL_HW * 2 + 1.4, 0.9, e - s + 0.05, 'concrete_pale');
      // the lamps down its roof, every other length of it still lit (world.lights 'lamp': the generator in the
      // service room kept them on - their fittings shine, so the gallery reads lit from the road), the cable tray
      const lit = Math.round((s - s0) / SEG) % 2 === 0;
      b.box(0, y + TUNNEL_H - 0.12, (s + e) / 2, 0.5, 0.12, 0.9, lit ? 'lampglow' : 'metal', { collide: false });
      if (lit) b.light(0, y + TUNNEL_H - 0.5, (s + e) / 2, 'lamp');
      b.box(-TUNNEL_HW + 0.12, y + TUNNEL_H - 1.2, (s + e) / 2, 0.24, 0.16, e - s + 0.05, 'metal', { collide: false });
    }
    // the faces over its mouths: a portal of dressed stone set into the rock - its piers, the head over the road with
    // the opening arched in it (a segment: springing 4 m up, the crown at the roof), the voussoirs round the arch and
    // its keystone, a cornice, the plaque with the name - and its wing walls running out along the cutting
    for (const [s, sd] of [[s0, -1], [s1, 1]]) {
      const y = levelAt(s) - 0.1;
      const zf = s + sd * 0.6; // (the face's middle, its thickness standing out of the mountain)
      for (const lat of [-1, 1]) b.box(lat * (TUNNEL_HW + 1.9), y, zf, 3.4, TUNNEL_H + 8.5, 2.2, 'concrete_pale');
      b.box(0, y + TUNNEL_H, zf, TUNNEL_HW * 2 + 0.8, 8.5, 2.2, 'concrete_pale');
      // the arch: the corners of the opening filled up to its curve, a strip at a time
      const RISE = 2.6, R = (TUNNEL_HW ** 2 + RISE ** 2) / (2 * RISE), CY = TUNNEL_H - R;
      for (let x = -TUNNEL_HW + 0.4; x < TUNNEL_HW; x += 0.8) {
        const ya = CY + Math.sqrt(Math.max(0, R * R - x * x));
        if (TUNNEL_H - ya > 0.05) b.box(x, y + ya, zf, 0.82, TUNNEL_H - ya, 2.2, 'concrete_pale');
      }
      // the voussoirs: a band round the arch, standing proud of the face
      for (let k = 0; k <= 10; k++) {
        const a = -Math.asin(TUNNEL_HW / R) + (k / 10) * 2 * Math.asin(TUNNEL_HW / R);
        const vx = Math.sin(a) * (R + 0.5), vy = CY + Math.cos(a) * (R + 0.5);
        b.box(vx, y + vy - 0.55, zf + sd * 1.25, 1.05, k === 5 ? 1.5 : 1.1, 0.4, k === 5 ? 'concrete' : 'stone', { rz: -a, collide: false });
      }
      b.box(0, y + TUNNEL_H + 7.6, zf + sd * 0.2, TUNNEL_HW * 2 + 8.4, 0.5, 2.8, 'concrete_pale'); // (the cornice)
      b.box(0, y + TUNNEL_H + 3.6, zf + sd * 1.15, 6.4, 1.2, 0.12, 'metal', { collide: false }); // (the plaque)
      // the wing walls: along the cutting either side, splaying a little, stepping down as they go
      for (const lat of [-1, 1]) {
        // (inside the cutting: a road that meets this one at its mouth - the airport's perimeter at East Pass - and a
        // fence along it keep their room)
        for (let k = 0; k < 2; k++) {
          const along = 3.2 + k * 4.4;
          const wx = lat * (TUNNEL_HW + 1.7), wz = zf + sd * (1.3 + along);
          const [ww, wv] = [b.wx(wx, wz), b.wz(wx, wz)];
          const [fx, fz] = al(ww, wv);
          const nearFence = Math.min(Math.abs(fx - FENCE.x0), Math.abs(fx - FENCE.x1), Math.abs(fz - FENCE.z0), Math.abs(fz - FENCE.z1)) < 12 && fx > FENCE.x0 - 12 && fx < FENCE.x1 + 12 && fz > FENCE.z0 - 12 && fz < FENCE.z1 + 12;
          if (nearFence || roadsNear(ww, wv, 6)) continue; // (the airport's fence runs past East Pass's mouth)
          b.box(wx, y, wz, 1.2, TUNNEL_H + 3 - k * 2.4, 4.2, 'stone');
        }
      }
      // a lamp over the mouth, lit
      b.light(0, y + TUNNEL_H + 1.2, zf + sd * 1.6, 'lamp');
      // (and one just inside, so the arch reads lit from the road even in the cutting's shade)
      b.light(0, y + TUNNEL_H - 0.6, s - sd * 3, 'lamp');
    }
    if (t.name) landmarks.push({ x: t.a[0] + t.dx * ((s0 + s1) / 2), z: t.a[1] + t.dz * ((s0 + s1) / 2), name: t.name, pass: true });
  }
}

// wallMask: the cells the walls stand round (mainland.js). Returns the lines they stand along: [[x, z, ...], ...]
export function buildWalls({ wallMask, heightAt, staticGrid }) {
  // THE MOUNTAINS' WALLS: along the foot of every cliff a wall nobody sees, WALL_T thick on the mountain's side of the
  // line, from under the ground to well over the cliff's lip. Nothing walks, drives, climbs or is shot through it, and
  // the dead's nav grid takes it for the wall it is. (A tunnel's corridor is out of the mountain: its cuttings are
  // walled the same way, and the gallery has walls of its own.)
  const walls = maskEdges(wallMask, N, GRID_STEP, HALF, 0.5);
  for (const line of walls) {
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, az] = line[k];
      const [bx, bz] = line[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      // (the mountain is on the right of the line: (-uz, ux))
      const cx = (ax + bx) / 2 - uz * (WALL_T / 2 - 0.25);
      const cz = (az + bz) / 2 + ux * (WALL_T / 2 - 0.25);
      const foot = Math.min(heightAt(ax, az), heightAt(bx, bz), heightAt(cx, cz)) - 3;
      // (as high as a cliff, and at the least as high as the ground just in from its line stands: the cuttings in front
      // of a tunnel's mouths rise from the road to the whole mountain within a few metres)
      let rise = 0;
      for (const k of [1, 2.5, 4]) for (const t of [0, 0.5, 1]) rise = Math.max(rise, heightAt(ax + (bx - ax) * t - uz * k, az + (bz - az) * t + ux * k));
      const col = makeBox(cx, cz, foot, Math.max(foot + CLIFF * 1.25 + 14, rise + 6), len + WALL_T * 0.6, WALL_T, Math.atan2(-uz, ux), COL.STATIC);
      col.tag = 'cliff'; // (a bullet strikes stone: shared/surfaces.js)
      staticGrid.add(col);
    }
  }
  return walls;
}
