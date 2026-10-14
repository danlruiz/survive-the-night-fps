// Supply drops: a cargo plane crosses the valley (EVT.FLYOVER, which the clients draw) and kicks a crate off its
// ramp; the crate drifts down under its canopy (updateCrates) and lands on a supply spot, to be broken open with [E]
// (Game.interact). One on the first day and two on each one after (scheduleSupplyDrops), and one wherever the Relay
// Station's radio calls it (server/fixtures.js).
import { PLANE_SPEED, PLANE_LEAD, PLANE_ALTITUDE, PLANE_RAMP, CRATE_FREEFALL, CRATE_FALL_SPEED, CRATE_DRAG, NOISE } from '../../shared/constants.js';
import { ITEM, SOUND, EVT, NOTIFY } from '../../shared/defs.js';
import { ENT, qpos, qangle16 } from '../../shared/protocol.js';
import { groundAt } from '../../shared/collision.js';

// what a supply crate holds, 5-7 rolls of it (Game.interact breaks one open): [item, weight, least, most]
export const CRATE_TABLE = [
  [ITEM.AMMO_762, 5, 30, 60],
  [ITEM.AMMO_556, 5, 30, 60],
  [ITEM.AMMO_SHELLS, 5, 8, 16],
  [ITEM.AMMO_9MM, 4, 20, 40],
  [ITEM.MEDKIT, 4, 1, 2],
  [ITEM.PIPEBOMB, 2, 1, 2],
  [ITEM.GRENADE, 2, 1, 2],
  [ITEM.MOLOTOV, 2, 1, 2],
  [ITEM.FLARE, 3, 2, 3],
  [ITEM.AMMO_FLARE, 2, 2, 3],
  [ITEM.FLARE_GUN, 1, 1, 1],
  [ITEM.PLATE, 2, 1, 1],
  [ITEM.GUNPARTS, 3, 1, 2],
  [ITEM.AK47, 1, 1, 1],
  [ITEM.M4A1, 1, 1, 1],
  [ITEM.MP5, 1, 1, 1],
  [ITEM.SHOTGUN, 1, 1, 1],
  [ITEM.DB_SHOTGUN, 1, 1, 1],
  [ITEM.FLAMETHROWER, 1, 1, 1],
  [ITEM.AMMO_FUEL, 2, 40, 80],
  [ITEM.RPG, 1, 1, 1],
  [ITEM.AMMO_ROCKET, 2, 2, 3],
  [ITEM.AT_RIFLE, 1, 1, 1],
  [ITEM.AMMO_145, 3, 3, 6],
  [ITEM.KEVLAR, 1, 1, 1],
  [ITEM.NAILS, 3, 10, 20],
  [ITEM.BATTERY, 2, 1, 2],
  [ITEM.POWDER, 3, 5, 10],
];

export const methods = {
  // A cargo plane crosses the valley in a straight line and kicks the crate off its ramp so that, after
  // shedding the plane's speed under the canopy, it lands on a supply spot. Clients draw the plane and its
  // smoke trail from one FLYOVER event; the crate itself is an ordinary entity once it leaves the ramp.
  spawnSupplyDrop() {
    const humans = this.humans();
    // somewhere 70-200 m from the survivors
    let pts = this.world.resourceSpawns.filter((p) => {
      const md = this.distToHumans(p.x, p.z, humans);
      return md > 70 && md < 200;
    });
    if (!pts.length) pts = this.world.resourceSpawns;
    if (!pts.length) return;
    const sp = pts[Math.floor(this.rng() * pts.length)];
    const heading = this.rng() * Math.PI * 2;
    this.flySupplyDrop(sp.x, sp.z, heading);
  },

  // The plane itself, for a drop at (x, z), coming in on `heading`. y: the height of the ground meant there, for a
  // spot that may have something over or beside it (a drop called to where a survivor stands, server/fixtures.js);
  // without it, the top of whatever is highest there.
  flySupplyDrop(x, z, heading, y = 200) {
    const sp = { x, z };
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const gy = groundAt(this.world, sp.x, sp.z, y, 0.6);
    const drift = PLANE_SPEED / CRATE_DRAG;
    // release point = where the ramp is when the crate leaves; the plane's origin is PLANE_RAMP ahead of it
    const rx = sp.x - fx * drift;
    const rz = sp.z - fz * drift;
    const alt = gy + PLANE_ALTITUDE;
    const eta = PLANE_LEAD / PLANE_SPEED;
    const px = rx + fx * PLANE_RAMP;
    const pz = rz + fz * PLANE_RAMP;
    this.flyovers.push({ at: this.time + eta, x: rx, y: alt - 2.4, z: rz, vx: fx * PLANE_SPEED, vz: fz * PLANE_SPEED, tx: sp.x, tz: sp.z, gy });
    this.emit((w) => {
      w.u8(EVT.FLYOVER);
      w.i16(qpos(px));
      w.i16(qpos(alt));
      w.i16(qpos(pz));
      w.u16(qangle16(heading));
      w.u16(Math.round(eta * 1000));
    });
    this.notify(NOTIFY.SUPPLY_DROP, 0);
    this.track.crateDrop(x, z);
  },

  updateCrates(dt) {
    for (let i = this.flyovers.length - 1; i >= 0; i--) {
      const f = this.flyovers[i];
      if (this.time < f.at) continue;
      this.flyovers.splice(i, 1);
      // state 3: tumbling off the ramp, the canopy still packed
      const e = { kind: ENT.CRATE, x: f.x, y: f.y, z: f.z, vx: f.vx, vy: 0, vz: f.vz, tx: f.tx, tz: f.tz, gy: f.gy, free: CRATE_FREEFALL, state: 3, despawnAt: this.time + 600 };
      if (this.spawnEntity(e)) this.crates.push(e);
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (c.state === 0 || c.state === 3) {
        if (c.vx !== undefined) {
          const k = Math.exp(-CRATE_DRAG * dt);
          c.x += (c.vx * (1 - k)) / CRATE_DRAG;
          c.z += (c.vz * (1 - k)) / CRATE_DRAG;
          c.vx *= k;
          c.vz *= k;
        }
        if (c.free > 0) {
          c.free -= dt;
          c.vy -= 9.8 * dt;
          if (c.free <= 0) c.state = 0; // canopy opens
        } else if (c.vy !== undefined) c.vy += (-CRATE_FALL_SPEED - c.vy) * Math.min(1, dt * 2.5);
        c.y += (c.vy ?? -CRATE_FALL_SPEED) * dt;
        if (c.y <= c.gy) {
          c.y = c.gy;
          if (c.tx !== undefined) {
            c.x = c.tx;
            c.z = c.tz;
          }
          c.state = 1;
          this.sound(SOUND.CRATE_LAND, c.x, c.y, c.z, 80);
          this.zm.noise(c.x, c.z, NOISE.CRATE_LAND);
        }
      }
      if (this.time > c.despawnAt) {
        this.crates.splice(i, 1);
        this.removeEntity(c);
      }
    }
  },
};
