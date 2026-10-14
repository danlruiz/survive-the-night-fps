// What a vehicle runs into, server side (laid onto Vehicles, server/vehicles.js: called on it as this.name(...)). Two
// that come together, the dead in its way (knocked down and aside going fast, pushed at going slowly), survivors on foot
// put aside, a rider on two wheels thrown off, a round that meets one with somebody in it, the dead kept out of one.
import { PLAYER_RADIUS, PLAYER_HEIGHT, BTN } from '../../shared/constants.js';
import { SOUND, NOTIFY, KILLER, VEH_OFFS, IMPACT } from '../../shared/defs.js';
import { CROWD_SLOW, VEH, VEHICLES, COL_VEHICLE } from '../../shared/vehicles.js';
import { resolveBody } from '../../shared/collision.js';

export const THROWN_HURT = 5; // a rider thrown off two wheels is hurt this per m/s over the throw
const STRIKE = CROWD_SLOW; // m/s: one going this fast knocks the dead down instead of pushing at them
const STRIKE_AGAIN = 0.7; // s before the same vehicle strikes the same body again
// what running one of the dead over does, by kind: damage to it per m/s, what is left of the vehicle's speed, the
// damage the vehicle takes (flat + per m/s), and from what speed it throws a rider on two wheels
const RAM = {
  [VEH.CAR]: { dmg: 14, keep: 0.86, hurt: 6, hurtV: 1.5, throwAt: 0 },
  [VEH.MOPED]: { dmg: 7, keep: 0.5, hurt: 10, hurtV: 2, throwAt: 9.5 },
  [VEH.BIKE]: { dmg: 4, keep: 0.4, hurt: 6, hurtV: 1.2, throwAt: 7 },
};
const MASS = { [VEH.CAR]: 1200, [VEH.MOPED]: 170, [VEH.BIKE]: 95 }; // kg, with somebody on it: who gives way to whom
// what of each stops a round, as slabs of its height (m over its wheels' ground): [from, to]
const SHOT_BOX = { [VEH.CAR]: [[0.22, 0.93], [1.36, 1.47]], [VEH.MOPED]: [[0.15, 0.8]], [VEH.BIKE]: [[0.15, 0.75]] };
// a ray against the box |x| <= hx, y0 <= y <= y1, |z| <= hz: where it enters (0: from inside), or -1
function rayBox(ox, oy, oz, dx, dy, dz, hx, y0, y1, hz, maxT) {
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz, d = k === 0 ? dx : k === 1 ? dy : dz;
    const lo = k === 0 ? -hx : k === 1 ? y0 : -hz, hi = k === 0 ? hx : k === 1 ? y1 : hz;
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}
const _pos = { x: 0, y: 0, z: 0 };

export const contactMethods = {
  // Two of them that are not standing empty (those are boxes: stepVehicle), come together: put apart by their weights,
  // what they were closing at shared out the same way, and each damaged as by a crash at its share of it. A rider on
  // two wheels is thrown by a share over their vehicle's throwAt. Nothing of this is in a driver's prediction (the
  // other is somebody else's): their state is rewritten, as when they strike the dead.
  collide() {
    const g = this.g;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.removed || a.col) continue;
      const PA = VEHICLES[a.vk];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.removed || b.col) continue;
        const PB = VEHICLES[b.vk];
        const far = PA.half + PB.half + 0.4;
        if (Math.abs(a.x - b.x) > far || Math.abs(a.z - b.z) > far || Math.abs(a.y - b.y) > 1.6) continue;
        // the deepest of their circles into each other
        let deep = 0, nx = 0, nz = 0;
        const fax = -Math.sin(a.yaw), faz = -Math.cos(a.yaw), fbx = -Math.sin(b.yaw), fbz = -Math.cos(b.yaw);
        for (const ca of PA.circles) {
          const ax = a.x - fax * ca[0], az = a.z - faz * ca[0];
          for (const cb of PB.circles) {
            const dx = ax - (b.x - fbx * cb[0]), dz = az - (b.z - fbz * cb[0]);
            const d = Math.hypot(dx, dz);
            const o = ca[1] + cb[1] - d;
            if (o > deep) {
              deep = o;
              nx = d > 1e-4 ? dx / d : 1;
              nz = d > 1e-4 ? dz / d : 0;
            }
          }
        }
        if (deep <= 0) continue;
        const ma = MASS[a.vk], mb = MASS[b.vk];
        const sa = mb / (ma + mb), sb = ma / (ma + mb); // (the lighter one gives way)
        const pa = this.driver(a), pb = this.driver(b);
        const A = pa ? pa.state : a, B = pb ? pb.state : b;
        A.x += nx * deep * sa;
        A.z += nz * deep * sa;
        B.x -= nx * deep * sb;
        B.z -= nz * deep * sb;
        const closing = -((A.vx - B.vx) * nx + (A.vz - B.vz) * nz);
        if (closing > 0) {
          const jn = closing * 1.15; // (a little bounce)
          A.vx += nx * jn * sa;
          A.vz += nz * jn * sa;
          B.vx -= nx * jn * sb;
          B.vz -= nz * jn * sb;
          if (closing > 1.5 && g.time - (a.hitT || 0) > 0.4) {
            a.hitT = b.hitT = g.time;
            for (const [e, p, share, dir] of [[a, pa, sa, 1], [b, pb, sb, -1]]) {
              const v = closing * (0.25 + 0.75 * share); // (the heavier one feels it too)
              this.crash(e, v, null);
              const P = VEHICLES[e.vk];
              // off it, the way it was knocked (never the whole of a life: it may be a teammate's doing)
              if (!e.removed && p && P.throwAt && v > P.throwAt) this.throwOff(p, e, nx * dir * Math.min(6, v * 0.5), nz * dir * Math.min(6, v * 0.5), 3.2, Math.min(45, 6 + (v - P.throwAt) * THROWN_HURT));
            }
          }
        }
        for (const [e, p] of [[a, pa], [b, pb]]) {
          if (e.removed) continue;
          const st = p && p.state.drive === e.id ? p.state : null;
          if (st) {
            e.x = st.x;
            e.z = st.z;
            e.vx = st.vx;
            e.vz = st.vz;
          } else if (e.vx !== 0 || e.vz !== 0) e.run = false;
        }
      }
    }
  },

  // A shot along (dx, dy, dz) from (ox, oy, oz), no further than max: the nearest vehicle with somebody in it that it
  // meets ({ t, col }: col stands for it as a parked one's box does), or null. (One standing empty is a box in the
  // world already.) What stops a round: a car's body up to its window sills and its roof - between them it is open,
  // and who sits there shoots out and can be hit; of a moped or a bicycle the frame, low - its rider is in the open.
  // skip: the vehicle of whoever fired is not in their own way.
  rayHit(ox, oy, oz, dx, dy, dz, max, skip) {
    let best = null;
    for (const e of this.list) {
      if (e.removed || e.col || e === skip) continue;
      const P = VEHICLES[e.vk];
      const rx = e.x - ox, rz = e.z - oz;
      const along = rx * dx + rz * dz;
      if (along < -P.half - 1 || along > max + P.half + 1) continue;
      const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
      // into its own frame: x across, z along it
      const lox = -rx * c + rz * sn, loz = -rx * sn - rz * c, loy = oy - e.y;
      const ldx = dx * c - dz * sn, ldz = dx * sn + dz * c;
      for (const [y0, y1] of SHOT_BOX[e.vk]) {
        const t = rayBox(lox, loy, loz, ldx, dy, ldz, P.halfW, y0, y1, P.half, max);
        if (t >= 0 && (!best || t < best.t)) best = { t, col: e.shotCol || (e.shotCol = { flags: COL_VEHICLE, id: e.id, x: 0, z: 0 }) };
      }
    }
    return best;
  },

  // How far the dead are from survivor p for a blow (Zombies: what their reach is measured against): p's own
  // distance d, or - in a vehicle - the distance to its body, as if p stood at its nearest side. The dead cannot get
  // into it (keepOff), so from its nose or its tail whoever sits in the middle of it would be out of every reach.
  reachTo(p, x, z, d) {
    const s = p.state;
    if (!s.drive && !s.pass) return d;
    const e = this.of(p);
    if (!e) return d;
    return Math.min(d, this.gap(e, x, z) + PLAYER_RADIUS);
  },

  // One of the dead moving to pos (radius r, feet at y) is kept out of every vehicle that is not a box of the world
  // already: one that is moving, or has somebody in it (Zombies.integrate, after it has kept it off the survivors).
  keepOff(pos, r, y) {
    for (const e of this.list) {
      if (e.col) continue;
      const P = VEHICLES[e.vk];
      const dx = pos.x - e.x;
      const dz = pos.z - e.z;
      const reach = P.half + r + 0.2;
      if (dx * dx + dz * dz > reach * reach || Math.abs(y - e.y) > 2) continue;
      const c = Math.cos(e.yaw);
      const sn = Math.sin(e.yaw);
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      const px = P.halfW + r * 0.8 - Math.abs(lx);
      const pz = P.half + r * 0.8 - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      // out by the nearer face
      let ox = 0;
      let oz = 0;
      if (px < pz) ox = lx >= 0 ? px : -px;
      else oz = lz >= 0 ? pz : -pz;
      pos.x += ox * c + oz * sn;
      pos.z += -ox * sn + oz * c;
    }
  },

  // The dead in the way of e. Going fast it knocks them down and aside, at a cost: speed, and damage to itself; a
  // rider on two wheels is thrown by it. Something as big as a Tank stops it dead. Going slowly it pushes at them,
  // and a crowd holds it.
  strike(e, p) {
    const g = this.g;
    const P = VEHICLES[e.vk];
    const ram = RAM[e.vk];
    const s = p ? p.state : e;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < 0.3 && !(p && p.state.lastBtn & (BTN.FWD | BTN.BACK))) {
      if (p) p.state.dhold = 0;
      return;
    }
    const c = Math.cos(e.yaw);
    const sn = Math.sin(e.yaw);
    // (which end leads)
    const fwd = -s.vx * sn - s.vz * c >= 0 ? 1 : -1;
    const want = p ? (p.state.lastBtn & BTN.FWD ? 1 : p.state.lastBtn & BTN.BACK ? -1 : 0) : 0;
    const lead = sp > 0.5 ? fwd : want || fwd;
    let keep = 1;
    let hurt = 0;
    let crowd = 0;
    let stop = false;
    let thrown = false;
    g.zm.forNear(e.x, e.z, P.half + 2.5, (z) => {
      if (z.dead || z.def.flying || stop) return;
      if (Math.abs(z.y - e.y) > 2.2) return;
      const dx = z.x - e.x;
      const dz = z.z - e.z;
      const lx = dx * c - dz * sn;
      const lf = -(dx * sn + dz * c) * lead; // how far ahead of its middle, the way it is going
      const r = Math.min(z.def.radius, 0.9);
      if (Math.abs(lx) > P.halfW + r || lf < 0 || lf > P.half + r + 0.25) return;
      if (sp < STRIKE) {
        crowd++;
        return;
      }
      if ((z.vehT || 0) > g.time) return;
      z.vehT = g.time + STRIKE_AGAIN;
      const big = z.boss || z.def.radius > 0.8;
      const side = lx >= 0 ? 1 : -1;
      const fx = -sn * lead;
      const fz = -c * lead;
      g.combat.damageZombie(z, sp * ram.dmg * (big ? 0.5 : 1), p, { melee: true, knock: big ? 0 : 4 + sp * 0.35, dirX: c * side * 0.7 + fx * 0.7, dirZ: -sn * side * 0.7 + fz * 0.7 });
      g.sound(SOUND.VEH_THUMP, z.x, z.y + 1, z.z, 45);
      g.impact(z.def.acid ? IMPACT.GREEN_BLOOD : IMPACT.BLOOD, z.x, z.y + 1, z.z);
      hurt += big ? 110 + sp * 6 : ram.hurt + sp * ram.hurtV;
      if (big) stop = true;
      else keep *= ram.keep;
      if (ram.throwAt && sp > ram.throwAt) thrown = true;
    });
    // a crowd on its nose holds it: for a driver, by the count in their own state (their prediction slows with it:
    // driveStep); one that rolls with nobody at the wheel is slowed here
    if (p) p.state.dhold = Math.min(3, crowd);
    else if (crowd) keep *= Math.max(0.3, 1 - 0.25 * crowd);
    if (stop) keep = 0;
    if (keep < 1) {
      s.vx *= keep;
      s.vz *= keep;
    }
    if (hurt) this.damage(e, hurt);
    // over the bars: as a crash throws them (the simulation's own way off, done here)
    if (thrown && p && p.state.drive === e.id) this.throwOff(p, e, -sn * lead * Math.min(7, sp * 0.55), -c * lead * Math.min(7, sp * 0.55), 3.4, 6 + (sp - ram.throwAt) * THROWN_HURT, 0.3);
  },

  // The rider on two wheels, p, thrown off e: through the air at (vx, vy, vz), stunned, and hurt by `hurt`. keep: what
  // is left of e's speed once it is out from under them.
  throwOff(p, e, vx, vz, vy, hurt, keep = 1) {
    const g = this.g;
    const st = p.state;
    e.seats[0] = 0;
    this.leaveWheel(p, e);
    if (keep !== 1) {
      e.vx *= keep;
      e.vz *= keep;
    }
    st.vx = vx;
    st.vz = vz;
    st.vy = vy;
    st.y += 0.5;
    st.onGround = 0;
    st.stunT = 0.7;
    g.damagePlayer(p, hurt, { kind: KILLER.WORLD, x: e.x, z: e.z });
    g.notify(NOTIFY.VEH_OFF, VEH_OFFS.THROWN, p.id);
  },

  // Survivors on foot in the way of one that is moving are put aside, unhurt, and it loses speed to them: nobody is
  // run down by a teammate.
  shove(e, p) {
    const g = this.g;
    const P = VEHICLES[e.vk];
    const s = p ? p.state : e;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < 1) return;
    const c = Math.cos(e.yaw);
    const sn = Math.sin(e.yaw);
    for (const q of g.players.values()) {
      const t = q.state;
      if (!q.alive || t.drive || t.pass || q.away) continue;
      const dx = t.x - e.x;
      const dz = t.z - e.z;
      if (Math.abs(dx) > P.half + 1 || Math.abs(dz) > P.half + 1 || Math.abs(t.y - e.y) > 1.6) continue;
      const lx = dx * c - dz * sn;
      const lz = dx * sn + dz * c;
      const px = P.halfW + PLAYER_RADIUS - Math.abs(lx);
      const pz = P.half + PLAYER_RADIUS - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      // aside, whichever side of its middle they are on
      const ox = (lx >= 0 ? 1 : -1) * (px + 0.05);
      _pos.x = t.x + ox * c;
      _pos.y = t.y;
      _pos.z = t.z - ox * sn;
      resolveBody(g.world, _pos, PLAYER_RADIUS, PLAYER_HEIGHT, true);
      t.x = _pos.x;
      t.z = _pos.z;
      s.vx *= 0.7;
      s.vz *= 0.7;
    }
  },
};
