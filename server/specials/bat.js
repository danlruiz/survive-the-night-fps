// The bat (def.flying): swarms that dive at a survivor in the open and wheel round the roofs of wherever they hide
import { ZANIM, SOUND, KILLER } from '../../shared/defs.js';
import { raycastWorld, ColliderGrid, makeBox, rayCollider, CYL, COL } from '../../shared/collision.js';
import { turn, MAP_EDGE } from './util.js';

const BAT_SHUT_OUT = 8; // a bat's state, next to 0 (hunting) and 7 (peeling off after a bite): walls are in its way
const BAT_LOW_PASS = 8; // s a shut-out bat spends low round the building between passes over the top
const BAT_TURN = 0.25; // s each wall it meets adds to its peeling off after a bite
const BAT_BELLY = 0.1; // how far a bat's body hangs below its position
const BAT_SKIN = 0.001; // it is put back this far clear of a wall, so rounding never leaves it counted as inside
const _fq = [];
const _roofs = new WeakMap();
const _ray = { t: -1, col: null, terrain: false };

export const methods = {
  // ---------------------------------------------------------------- bats
  updateBat(z, dt, target, tx, ty, tz, dist) {
    const g = this.g;
    const def = z.def;
    const time = g.time + z.variant;
    let gx;
    let gy;
    let gz;
    const ground = g.world.heightAt(z.x, z.z);
    if (z.state === 7) {
      z.stateT -= dt;
      if (z.stateT <= 0) z.state = 0;
    }
    if (z.state === BAT_SHUT_OUT && !target) z.state = 0;
    // s a shut-out bat spends on a pass over the roofs (each bat its own: a flock does not come down as one)
    const pass = 1.5 + (z.variant % 16) * 0.1;
    if (target && z.state !== 7) {
      const d3 = Math.hypot(tx - z.x, ty + 1.3 - z.y, tz - z.z);
      gx = tx + Math.sin(time * 2.1) * 1.5;
      gz = tz + Math.cos(time * 1.7) * 1.5;
      gy = d3 < 8 ? ty + 1.3 : Math.max(ty + 3, ground + 3.5);
      if (z.state === BAT_SHUT_OUT) {
        // Something solid stopped it on the way in, and it has no path-finding. It wheels round the survivor instead:
        // a tight pass high over the roofs (detourT), then a wider one low, between window height and the eaves, and
        // round again. The moment it has a clear line - through a doorway or a window, down past the top of a wall
        // with no roof over it, or because they stepped outside - it comes down it. A bite puts it back on the hunt.
        z.detourT -= dt;
        z.wanderT -= dt;
        z.stateT -= dt;
        if (z.detourT < -BAT_LOW_PASS && z.stateT <= 0 && z.wanderT <= 0) z.detourT = pass;
        // Its own look, every third tick and not the whole flock at once (the one in updateOne, every 0.3 s, is too
        // stale for a bat crossing the view through a window at full speed). None on the way up: a bat that was just
        // stopped does not turn straight back into the same wall.
        if (z.detourT < 0.8 && z.stateT <= 0 && dist < 30 && (g.tick + z.id) % 3 === 0 && this.batSees(z, tx, ty + 1.4, tz)) {
          // it turns on the spot (round a slow curve it would be out of the view again) and commits for a while
          z.stateT = 2.5;
          z.detourT = Math.min(z.detourT, 0);
          z.wanderT = 0;
          const l = d3 || 1;
          const dive = def.speed * g.diff.speed;
          z.vx = ((tx - z.x) / l) * dive;
          z.vy = ((ty + 1.3 - z.y) / l) * dive;
          z.vz = ((tz - z.z) / l) * dive;
        }
        if (z.detourT > 0) {
          gx = tx + Math.sin(time * 1.25) * 6;
          gz = tz + Math.cos(time * 1.25) * 6;
          gy = Math.max(ground, ty) + 7 + Math.sin(time) * 2;
        } else if (z.stateT > 0) {
          gx = tx;
          gz = tz;
          gy = ty + 1.3;
        } else if (z.wanderT > 0) {
          // (it could not climb: it is under a roof or an eave itself) off along the walls at door height
          gx = z.x + z.detourX * 10;
          gz = z.z + z.detourZ * 10;
          gy = ground + 1.3;
        } else {
          gx = tx + Math.sin(time * 0.8) * 10;
          gz = tz + Math.cos(time * 0.8) * 10;
          gy = Math.max(ty + 2.8 + Math.sin(time * 0.7) * 1.8, ground + 1.5);
        }
      }
      if (d3 < 1.6 && z.attackCd <= 0 && this.canReach(z, target) && !roofBetween(g.world, z.x, z.y + def.headY, z.z, tx, ty + 0.9, tz)) {
        z.attackCd = def.rate + g.rng() * 0.5;
        z.anim = ZANIM.ATTACK;
        z.animT = 0.4;
        g.damagePlayer(target, def.dmg * (1 + 0.05 * g.day), { kind: KILLER.ZOMBIE, ztype: z.ztype, x: z.x, z: z.z });
        g.sound(SOUND.BAT_SCREECH, z.x, z.y, z.z, 30);
        z.state = 7;
        z.stateT = 0.8 + g.rng() * 0.8;
        const a = g.rng() * Math.PI * 2;
        z.detourX = Math.sin(a);
        z.detourZ = Math.cos(a);
      }
    } else if (z.state === 7) {
      gx = z.x + z.detourX * 10;
      gz = z.z + z.detourZ * 10;
      gy = ground + 6;
    } else {
      // circle
      const c = { x: z.wanderX, z: z.wanderZ };
      gx = c.x + Math.sin(time * 0.4) * 20;
      gz = c.z + Math.cos(time * 0.4) * 20;
      gy = ground + 7 + Math.sin(time) * 2;
    }
    let dx = gx - z.x;
    let dy = gy - z.y;
    let dz = gz - z.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const sp = def.speed * g.diff.speed * (z.state === 7 ? 1.2 : 1);
    const k = Math.min(1, dt * 3);
    z.vx += ((dx / l) * sp - z.vx) * k;
    z.vy += ((dy / l) * sp - z.vy) * k;
    z.vz += ((dz / l) * sp - z.vz) * k;
    const px = z.x;
    const py = z.y;
    const pz = z.z;
    z.x += z.vx * dt;
    z.y += z.vy * dt + Math.sin(time * 9) * 0.03;
    z.z += z.vz * dt;
    const lim = this.g.world.half - MAP_EDGE;
    z.x = Math.max(-lim, Math.min(lim, z.x));
    z.z = Math.max(-lim, Math.min(lim, z.z));
    const gr = g.world.heightAt(z.x, z.z);
    if (z.y < gr + 0.6) z.y = gr + 0.6;
    const hit = this.flyCollide(z, px, py, pz);
    // held up: pressed against something it cannot get round (sliding along a wall is not being held up)
    if (hit && Math.hypot(z.x - px, z.y - py, z.z - pz) < sp * dt * 0.3) z.stuckT += dt;
    else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
    const shut = z.state === BAT_SHUT_OUT;
    if (z.state === 7 || (shut && z.detourT <= 0 && z.wanderT > 0)) {
      // peeling off indoors, or off along the walls: turn the corner instead of hanging in it
      if (z.stuckT > 0.15) {
        z.stuckT = 0;
        const t = z.detourX;
        z.detourX = -z.detourZ;
        z.detourZ = t;
        // In a room it cannot get the distance that spaces its bites out in the open: it takes the time instead
        // (not for ever: attackCd has been running down since the bite)
        if (z.state === 7 && z.attackCd > -1.5) z.stateT += BAT_TURN;
      }
    } else if (!target) z.stuckT = 0;
    else if (z.stuckT > 0.4) {
      // on the hunt, low round the survivor or coming down a line: break off, up and over. Held up on the way up:
      // off along the walls instead.
      z.stuckT = 0;
      z.state = BAT_SHUT_OUT;
      z.stateT = 0;
      if (shut && z.detourT > 0) {
        z.detourT = 0;
        z.wanderT = 2;
        z.detourX = Math.sin(time * 2.4);
        z.detourZ = Math.cos(time * 2.4);
      } else z.detourT = pass;
    }
    if (Math.hypot(z.vx, z.vz) > 0.3) z.yaw = turn(z.yaw, Math.atan2(-z.vx, -z.vz), dt * 6);
    if (z.animT <= 0) z.anim = ZANIM.WALK;
  },

  // A clear line from a bat to a point on a survivor, roofs counted, and clear all the way there: hasLOS stops half
  // a metre short, which is enough to see a survivor through the wall they are leaning on.
  batSees(z, tx, ty, tz) {
    const w = this.g.world;
    const oy = z.y + z.def.headY;
    if (roofBetween(w, z.x, oy, z.z, tx, ty, tz)) return false;
    const dx = tx - z.x;
    const dy = ty - oy;
    const dz = tz - z.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    raycastWorld(w, z.x, oy, z.z, dx / l, dy / l, dz / l, l, _ray, COL.NOBLOCK | COL.NOBULLET);
    return _ray.t < 0;
  },

  // Flight is stopped by everything solid: walls, floors and ceilings, props, tree trunks, player-built structures and
  // roofs (roofBoxes). The bat flew from (px,py,pz) this tick: whatever it now overlaps puts it back on the side it
  // came in from and takes the speed that carried it in, so it slides along a wall, over a roof or under a lintel
  // instead of stopping dead. One small grid query per grid, nothing swept: a tick's flight (under half a metre) is
  // shorter than the thinnest wall plus the bat's own width. Returns true if anything stopped it.
  flyCollide(z, px, py, pz) {
    const w = this.g.world;
    const r = z.def.radius;
    let any = false;
    for (let pass = 0; pass < 3; pass++) {
      let hit = false;
      for (let gi = 0; gi < 3; gi++) {
        // (a box is grown squarely: its corners reach r * sqrt 2 past the circle the grid tests)
        const list = (gi === 0 ? w.staticGrid : gi === 1 ? w.structGrid : roofBoxes(w)).query(z.x, z.z, r * 1.42, _fq);
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.flags & COL.NOBLOCK) continue;
          // the body spans y - BAT_BELLY .. y + height, and is r wide: the collider grown by that much, against a point
          const y0 = c.y0 - z.def.height;
          const y1 = c.y1 + BAT_BELLY;
          if (z.y <= y0 || z.y >= y1) continue;
          const dx = z.x - c.x;
          const dz = z.z - c.z;
          let nx = 0;
          let nz = 0;
          if (c.type === CYL) {
            const rr = c.r + r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr) continue;
            if (py < y1 && py > y0) {
              const pd = Math.hypot(px - c.x, pz - c.z);
              if (pd < rr) continue; // it was already inside (spawned there): let it fly out
              // out along the radius it is on (dead centre: the way it came)
              const d = Math.sqrt(d2);
              nx = d > 1e-4 ? dx / d : (px - c.x) / pd;
              nz = d > 1e-4 ? dz / d : (pz - c.z) / pd;
              z.x = c.x + nx * (rr + BAT_SKIN);
              z.z = c.z + nz * (rr + BAT_SKIN);
            }
          } else {
            const lx = c.c * dx - c.s * dz;
            const lz = c.s * dx + c.c * dz;
            const ex = c.hx + r;
            const ez = c.hz + r;
            if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
            if (py < y1 && py > y0) {
              // which face it came in through: where it was, in the box's frame
              const plx = c.c * (px - c.x) - c.s * (pz - c.z);
              const plz = c.s * (px - c.x) + c.c * (pz - c.z);
              const outX = Math.abs(plx) >= ex;
              const outZ = Math.abs(plz) >= ez;
              if (!outX && !outZ) continue; // it was already inside (spawned there): let it fly out
              // (round a corner, both: the face it has gone the least way past)
              let ox = lx;
              let oz = lz;
              if (outX && (!outZ || ex - Math.abs(lx) < ez - Math.abs(lz))) {
                nx = plx > 0 ? 1 : -1;
                ox = nx * (ex + BAT_SKIN);
              } else {
                nz = plz > 0 ? 1 : -1;
                oz = nz * (ez + BAT_SKIN);
              }
              // back to world, as pushCircle does
              z.x = c.x + c.c * ox + c.s * oz;
              z.z = c.z - c.s * ox + c.c * oz;
              const wx = c.c * nx + c.s * nz;
              nz = -c.s * nx + c.c * nz;
              nx = wx;
            }
          }
          hit = true;
          if (nx || nz) {
            const vn = z.vx * nx + z.vz * nz;
            if (vn < 0) {
              z.vx -= vn * nx;
              z.vz -= vn * nz;
            }
          } else if (py >= y1) {
            // it came down onto it
            z.y = y1;
            if (z.vy < 0) z.vy = 0;
          } else {
            // it came up under it
            z.y = y0;
            if (z.vy > 0) z.vy = 0;
          }
        }
      }
      if (!hit) return any;
      any = true;
    }
    // wedged between things that push it into each other: stay where it was
    z.x = px;
    z.y = py;
    z.z = pz;
    return true;
  },
};

// Gable roofs and shelter tops are drawn but have no collider (a collision box cannot slope), so a ray goes straight
// through them. For bats each roof is a solid block from the eaves to the ridge over its footprint, the same box the
// client keeps the rain out of (world.roofs). Built once per world.
function roofBoxes(w) {
  let grid = _roofs.get(w);
  if (!grid) {
    grid = new ColliderGrid(w.half + 20, 8);
    for (const r of w.roofs) grid.add(makeBox(r.x, r.z, r.y, r.y + Math.abs(r.rise), r.hx * 2, r.hz * 2, Math.atan2(r.s, r.c)));
    _roofs.set(w, grid);
  }
  return grid;
}

// is one of those roofs on the straight line between two points
function roofBetween(w, ox, oy, oz, tx, ty, tz) {
  let dx = tx - ox;
  let dy = ty - oy;
  let dz = tz - oz;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  const list = roofBoxes(w).query((ox + tx) / 2, (oz + tz) / 2, Math.hypot(tx - ox, tz - oz) / 2, _fq);
  for (let i = 0; i < list.length; i++) if (rayCollider(list[i], ox, oy, oz, dx, dy, dz, l) >= 0) return true;
  return false;
}
