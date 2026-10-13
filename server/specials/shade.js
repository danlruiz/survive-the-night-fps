// The shade (def.shade): it only moves in darkness. Any light on it and it stands frozen where it was caught; it keeps
// out of the survivors' lit bases, and wanders only where the light does not reach.
import { PHASE, FLASHLIGHT_RANGE, FLASHLIGHT_CONE, FIRE_LIGHT_MARGIN } from '../../shared/constants.js';
import { ZANIM, PROJ, AREA, ITEM, STRUCT_DEFS, THROWABLES } from '../../shared/defs.js';
import { groundAt } from '../../shared/collision.js';
import { eyeHeight } from '../../shared/playersim.js';
import { flareReach } from '../../shared/skyflare.js';
import { inFloodCone } from '../../shared/power.js';
import { GRAV, bodyHeight } from './util.js';

const SHADE_THAW = 0.15; // unbroken darkness (s) before a lit shade moves again, so a beam flickering across it still holds it
// A shade keeps out of the survivors' lit bases: it does not step to within SHADE_EDGE m past the reach of a burning
// torch or campfire they built, or into a powered floodlight's cone, and one that finds itself inside heads back out
// (shadeAvoid). It stops on the edge of the light instead and waits there. Wandering, it picks somewhere dark to go:
// SHADE_WANDER_TRIES spots at most, else it stays where it is
const SHADE_EDGE = 1.5;
const SHADE_WANDER_TRIES = 6;
// (shadeAvoid's answer, and baseLight's: the way it goes instead, or the light's middle)
export const _shDir = { x: 0, z: 0 };
const BEAM_TAN = Math.tan(FLASHLIGHT_CONE);
const BODY_AT = [0.9, 0.55, 0.2]; // head, chest, shins (fractions of the body height) - light on any of them counts
const _lamps = [];
const _floodAim = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };

export const methods = {
  // ---------------------------------------------------------------- light (what pins a shade)
  // every burning point light this tick: torches, campfires, road flares, flare gun flares, burning ground
  lightSources() {
    const g = this.g;
    const out = this.lights;
    if (this.lightTick === g.tick) return out;
    this.lightTick = g.tick;
    out.length = 0;
    for (const s of g.structures) {
      const def = STRUCT_DEFS[s.stype];
      if (def.light && s.burnLeft > 0) out.push(s.x, s.y + def.sy, s.z, def.light);
    }
    for (const e of g.projectiles) {
      if (e.ptype === PROJ.FLARE) out.push(e.x, e.y + 0.35, e.z, THROWABLES[ITEM.FLARE].light);
      else if (e.ptype === PROJ.SKYFLARE) {
        // a flare gun's flare: from high up it lights a wide circle of the ground under it (shared/skyflare.js)
        const r = flareReach(e.flare, e.t, e.y - g.world.floorAt(e.x, e.z, e.y));
        if (r > 0) out.push(e.x, e.y + (e.flare.landed ? 0.35 : 0), e.z, r);
      }
    }
    for (const a of g.areas) if (a.atype === AREA.FIRE) out.push(a.x, a.y + 0.6, a.z, a.radius + FIRE_LIGHT_MARGIN);
    return out;
  },

  // Is there light on this zombie? Daylight, a burning torch / campfire / flare / fire close enough, or a survivor's
  // flashlight beam. Walls, trees and hills cast shadows: the light needs a clear line to some part of the body.
  isLit(z) {
    const g = this.g;
    if (g.phase !== PHASE.NIGHT && !z.under && !this.inDark(z)) return true; // (no daylight gets down the mine, or into a boarded-up ward)
    const h = bodyHeight(z);
    const lights = this.lightSources();
    for (let i = 0; i < lights.length; i += 4) {
      const lx = lights[i];
      const ly = lights[i + 1];
      const lz = lights[i + 2];
      const r = lights[i + 3];
      if ((z.x - lx) ** 2 + (z.y + h * 0.5 - ly) ** 2 + (z.z - lz) ** 2 > r * r) continue;
      for (let k = 0; k < BODY_AT.length; k++) if (this.clearLine(lx, ly, lz, z.x, z.y + h * BODY_AT[k], z.z)) return true;
    }
    if (g.fair.lit(z, h)) return true; // the lights of the fair, while its generator runs
    if (g.power.floodLit(this, z, h)) return true; // the cone of a powered floodlight (power.js)
    // a vehicle's headlamp (vehicles.js): a beam along the ground ahead of it
    if (g.vehicles.list.length) {
      const lamps = g.vehicles.lamps(_lamps);
      for (let i = 0; i < lamps.length; i += 6) {
        const dx = z.x - lamps[i];
        const dz = z.z - lamps[i + 2];
        const along = dx * lamps[i + 3] + dz * lamps[i + 4];
        if (along <= 0 || along > lamps[i + 5] || Math.abs(z.y - lamps[i + 1]) > 4) continue;
        if (Math.abs(dz * lamps[i + 3] - dx * lamps[i + 4]) > along * 0.42 + z.def.radius) continue;
        if (this.clearLine(lamps[i], lamps[i + 1], lamps[i + 2], z.x, z.y + h * 0.5, z.z)) return true;
      }
    }
    for (const p of this.humansCache) {
      if (!p.flashlight) continue;
      const s = p.state;
      const ox = s.x;
      const oy = s.y + eyeHeight(s);
      const oz = s.z;
      const cp = Math.cos(s.pitch);
      const fx = -Math.sin(s.yaw) * cp;
      const fy = Math.sin(s.pitch);
      const fz = -Math.cos(s.yaw) * cp;
      for (let k = 0; k < BODY_AT.length; k++) {
        const ty = z.y + h * BODY_AT[k];
        const dx = z.x - ox;
        const dy = ty - oy;
        const dz = z.z - oz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > FLASHLIGHT_RANGE * FLASHLIGHT_RANGE) continue;
        // inside the beam's cone, allowing for the width of the body
        const along = dx * fx + dy * fy + dz * fz;
        if (along <= 0 || Math.sqrt(Math.max(0, d2 - along * along)) > along * BEAM_TAN + z.def.radius) continue;
        if (this.clearLine(ox, oy, oz, z.x, ty, z.z)) return true;
      }
    }
    return false;
  },

  // Is a lit base at (x, y, z): within pad m past the reach of a burning light the survivors built (a torch, a
  // campfire), or in the cone of a powered floodlight? Returns the light's middle in _shDir (for the way out), or null.
  baseLight(x, y, z, pad = 0) {
    const g = this.g;
    for (const s of g.structures) {
      const def = STRUCT_DEFS[s.stype];
      if (!def.light || !(s.burnLeft > 0)) continue;
      const r = def.light + pad;
      if ((x - s.x) ** 2 + (z - s.z) ** 2 > r * r || Math.abs(y - s.y) > def.light) continue;
      _shDir.x = s.x;
      _shDir.z = s.z;
      return _shDir;
    }
    const cones = g.power.cones;
    for (let i = 0; i < cones.length; i += 6) {
      _floodAim.x = cones[i];
      _floodAim.y = cones[i + 1];
      _floodAim.z = cones[i + 2];
      _floodAim.dx = cones[i + 3];
      _floodAim.dy = cones[i + 4];
      _floodAim.dz = cones[i + 5];
      if (!inFloodCone(_floodAim, x, y + 1, z, pad)) continue;
      _shDir.x = cones[i];
      _shDir.z = cones[i + 2];
      return _shDir;
    }
    return null;
  },

  // Would light fall on a shade at (x, y, z) there: the day outside, a lit base, or any other burning light?
  spotLit(x, y, z) {
    if (this.g.phase !== PHASE.NIGHT && !this.darkSpot(x, y, z)) return true;
    if (this.baseLight(x, y, z, SHADE_EDGE)) return true;
    const lights = this.lightSources();
    for (let i = 0; i < lights.length; i += 4) {
      if ((x - lights[i]) ** 2 + (z - lights[i + 2]) ** 2 <= lights[i + 3] ** 2) return true;
    }
    return false;
  },

  // Shade: keeps out of a lit base (SHADE_EDGE). Given the way it wants to go (dx, dz: a unit vector, or 0 0 to stand),
  // returns true with the way it goes instead in _shDir: straight out, when it is inside one; along the edge, when its
  // step would take it in and one side is clear; or nowhere, when neither is. Returns false when its way is clear.
  shadeAvoid(z, dx, dz) {
    const at = this.baseLight(z.x, z.y, z.z);
    if (at) {
      let ox = z.x - at.x;
      let oz = z.z - at.z;
      const l = Math.hypot(ox, oz);
      if (l < 1e-3) {
        ox = Math.sin(z.yaw);
        oz = Math.cos(z.yaw);
      } else {
        ox /= l;
        oz /= l;
      }
      _shDir.x = ox;
      _shDir.z = oz;
      return true;
    }
    if (!dx && !dz) return false;
    const look = SHADE_EDGE;
    if (!this.baseLight(z.x + dx * look, z.y, z.z + dz * look, SHADE_EDGE)) return false;
    // its step goes in: along the edge of the light instead, whichever side is still dark, else it waits there
    for (const sg of [1, -1]) {
      const sx = -dz * sg;
      const sz = dx * sg;
      if (!this.baseLight(z.x + sx * look, z.y, z.z + sz * look, SHADE_EDGE)) {
        _shDir.x = sx;
        _shDir.z = sz;
        return true;
      }
    }
    _shDir.x = 0;
    _shDir.z = 0;
    return true;
  },

  // Shade: returns true while light pins it (it does nothing else this tick). Bodies part around it like a post,
  // blows don't move it, and a swing it had started is lost.
  holdShade(z, dt) {
    if (this.isLit(z)) z.darkT = 0;
    else z.darkT += dt;
    const was = z.lit;
    z.lit = z.darkT < SHADE_THAW;
    if (!z.lit) {
      if (was) z.targetT = 0; // the light is gone: straight back on the hunt
      return false;
    }
    z.vx = z.vz = 0;
    z.kx = z.kz = 0;
    z.pendingHit = 0;
    z.stuckT = 0;
    z.detourT = 0;
    z.anim = ZANIM.FROZEN;
    z.animT = 0;
    // caught off the ground (a ledge, a broken floor): it still drops
    const gy = groundAt(this.g.world, z.x, z.z, z.y, 0.2, false);
    if (z.y > gy + 0.05) {
      z.vy -= GRAV * dt;
      z.y = Math.max(gy, z.y + z.vy * dt);
    } else {
      z.y = gy;
      z.vy = 0;
    }
    return true;
  },

  // a shade wandering keeps to the dark: somewhere no light reaches, or nowhere
  shadeWander(z) {
    const g = this.g;
    const w = g.world;
    z.wanderX = z.x;
    z.wanderZ = z.z;
    for (let i = 0; i < SHADE_WANDER_TRIES; i++) {
      const wx = z.x + (g.rng() - 0.5) * 30;
      const wz = z.z + (g.rng() - 0.5) * 30;
      if (this.spotLit(wx, groundAt(w, wx, wz, z.y + 4, 0.2, false), wz)) continue;
      z.wanderX = wx;
      z.wanderZ = wz;
      break;
    }
  },
};
