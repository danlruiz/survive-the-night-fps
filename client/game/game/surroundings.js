// Game: the world round the eye as it is drawn, lit and heard each frame - the day's clock and the weather, the dark down
// the mine, a smoker's haze, the lights and fires, the sun on the hands, the reverb's openness and the ambience, the
// ground under our feet, the water, lightning.
import * as THREE from 'three';
import { WATER_LEVEL, PHASE } from '../../../shared/constants.js';
import { ENT, PFLAG } from '../../../shared/protocol.js';
import { nightTheme } from '../../../shared/nights.js';
import { HOME_WALLS, HOMELESS_THEMES } from '../../audio/home.js';
import { raycastWorld, COL } from '../../../shared/collision.js';
import { Environment } from '../../render/environment.js';
import { smokeCover } from '../../../shared/smoke.js';
import { MOTIFS } from '../../audio/motifs.js';

const _qv = new THREE.Quaternion();
const _jetCol = new THREE.Color(0xff9440); // a flamethrower stream's light
const _sunRay = { t: -1, col: null, terrain: false };
const _near = [];
// what is said when the weather turns (not more than once in 45 s)
const WEATHER_TOAST = {
  fog: 'Fog is rolling in',
  gale: 'The wind is picking up',
  rain: 'It starts to rain',
  storm: 'A storm is breaking',
};
const DOWN_WEATHER = { rain: 0, wind: 0.2 }; // the weather as it is well down a drift of the mine

export const methods = {
  // How much sun/moon reaches the camera: blocked by buildings/terrain (ray cast towards the light)
  // and partly by tree crowns along that ray. Keeps the hands dark in the shade and under the canopy.
  lightVisibility(pos) {
    const L = this.env.lightDir;
    const w = this.world;
    raycastWorld(w, pos.x, pos.y, pos.z, L.x, L.y, L.z, 45, _sunRay, COL.NOBULLET | COL.NOBLOCK | COL.TREE);
    if (_sunRay.t >= 0) return 0;
    let occ = 0;
    for (let s = 1.5; s < 26 && occ < 1; s += 3) {
      const px = pos.x + L.x * s;
      const py = pos.y + L.y * s;
      const pz = pos.z + L.z * s;
      for (const c of w.staticGrid.query(px, pz, 3.5, _near)) {
        if (!(c.flags & COL.TREE) || py < c.y0 + 2 || py > c.y1) continue;
        // crowns taper towards the top; dead trees and birches let most light through
        const h = (py - c.y0) / (c.y1 - c.y0);
        const conifer = c.tv <= 2;
        const cr = (conifer ? 3.2 : 2.2) * (c.r / 0.4) * (1 - h * 0.85);
        const d2 = (px - c.x) ** 2 + (pz - c.z) ** 2;
        if (d2 < cr * cr) occ += conifer ? 0.3 : 0.12;
      }
    }
    return Math.max(0, 1 - occ);
  },

  // tonight's theme leaves the home bed out (audio/home.js), worked out from the seed once a night
  homeless(night) {
    const key = `${this.seed}:${this.act}:${night}`;
    if (this._homelessKey !== key) {
      this._homelessKey = key;
      this._homeless = HOMELESS_THEMES.has(nightTheme(this.seed, night, this.act)?.id);
    }
    return this._homeless;
  },

  // surroundings for the audio reverb: openness (few trees within 14 m) and a roof overhead
  probeSurroundings(pos) {
    const w = this.world;
    let trees = 0;
    for (const c of w.staticGrid.query(pos.x, pos.z, 14, _near)) if (c.flags & COL.TREE && (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2 < 196) trees++;
    this.openness = Math.max(0, 1 - trees / 7);
    raycastWorld(w, pos.x, pos.y, pos.z, 0, 1, 0, 10, _sunRay, COL.NOBULLET | COL.NOBLOCK | COL.TREE);
    this.indoor = _sunRay.t >= 0 && !_sunRay.terrain ? 1 : 0;
    const hs = this._homeStructs;
    hs.length = 0;
    for (const e of this.entities.ents.values()) if (e.kind === ENT.STRUCTURE && HOME_WALLS.has(e.stype)) hs.push({ x: e.rx, z: e.rz, yaw: (e.rot8 / 256) * Math.PI * 2, stype: e.stype });
    this.homeSense.update(pos.x, pos.z, hs);
  },

  // jet: how bright our own flamethrower's stream is burning (its fire light's intensity, 0 when it is out)
  updateViewmodelLight(dt, cam, nearFire, jet = 0) {
    this.vmLightT = (this.vmLightT || 0) - dt;
    if (this.vmLightT <= 0) {
      this.vmLightT = 0.2;
      this.vmSunTarget = this.lightVisibility(cam.position);
      this.probeSurroundings(cam.position);
    }
    this.vmSun = (this.vmSun ?? 1) + ((this.vmSunTarget ?? 1) - (this.vmSun ?? 1)) * Math.min(1, dt * 5);
    const c = this.env.cur;
    const vmh = this.renderer.vmHemi;
    vmh.color.copy(c.hemiSky);
    vmh.groundColor.copy(c.hemiGround);
    vmh.intensity = (c.hemi * (0.75 + 0.15 * this.vmSun) + nearFire * 0.8) * 1.2;
    // the world's fire lights never reach the view model's own scene: our stream washes the hands and the gun orange
    if (jet > 0) {
      const w = Math.min(1, jet * 0.6);
      vmh.color.lerp(_jetCol, w);
      vmh.groundColor.lerp(_jetCol, w * 0.7);
      vmh.intensity += jet * 0.8;
    }
    // the viewmodel camera never moves: bring the world light direction into camera space
    const d = this.renderer.vmDir;
    d.position.copy(this.env.lightDir).applyQuaternion(_qv.copy(cam.quaternion).invert());
    d.color.copy(c.dir);
    d.intensity = c.dirI * 0.75 * this.vmSun * (this.env.sun.intensity / Math.max(1e-3, c.dirI * Math.PI));
  },

  // local flashlight scattering in the haze (post pass); denser at night and in the valley mist
  beamState() {
    const b = (this._beam ||= { light: this.lights.flashlight, density: 0 });
    // (env.cur.mist already carries fog banks; rain catches the light too)
    b.density = 0.00012 + this.env.night * 0.00022 + this.env.cur.mist * 0.008 + this.weather.state.rain * 0.0003;
    return b;
  },

  surfaceAt(x, y, z) {
    const w = this.world;
    if (w.mine && w.mine.under(x, y + 0.3, z)) return 'dirt'; // (the floor of a drift)
    const th = w.heightAt(x, z);
    if (y > th + 0.08) return 'wood';
    if (th < WATER_LEVEL + 0.3) return 'water';
    if (th < WATER_LEVEL + 1.1) return 'mud';
    if (w.roadDistAt(x, z) < 2.8) {
      const kind = w.roadKindAt(x, z);
      return kind === 2 ? 'road' : kind === 4 ? 'gravel' : 'dirt'; // (4: the bed of the railway, its ballast)
    }
    // needle / leaf litter under a crown
    for (const c of w.staticGrid.query(x, z, 3, _near)) {
      if (c.flags & COL.TREE && (c.x - x) ** 2 + (c.z - z) ** 2 < 9) return c.tv === 5 ? 'leaves' : 'forest';
    }
    return 'grass';
  },

  // into the water or out of it (shared/swim.js). The hands go to swimming and the weapon out of sight; it is drawn
  // again on the way out
  onSwim(swim) {
    this.swimming = swim;
    if (!swim) {
      this.vmItem = null;
      return;
    }
    this.swimTired = false;
    if (!this.swimTold) {
      this.swimTold = true;
      this.ui.notify('Swimming: your hands are busy, and stamina drains the whole time. Run out of it and you drown.', 'toast', 7);
    }
  },

  // a lightning strike's light reached us: the bolt now, its thunder when the sound gets here
  onLightning(s) {
    this.weatherFx?.strike(s, this.camera.position);
    this.audio.thunder(s.x, s.z, s.dist, s.delay);
  },

  // our own footsteps (afloat: strokes, and a slow paddle treading water), and a word when the water starts to tire us
  updateFootsteps(dt, s, rp, hspeed, swim) {
    const self = this.self;
    if (self.alive && s.onGround && hspeed > 1 && !s.drive) {
      this.stepAcc += hspeed * dt;
      const stride = swim ? (s.sprinting ? 2.4 : 1.9) : s.sprinting ? 2.6 : s.crouch ? 1.4 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.audio.footstep(swim ? 'water' : this.surfaceAt(rp.x, rp.y, rp.z), undefined, undefined, undefined, swim ? (s.sprinting ? 0.7 : 0.45) : s.crouch ? 0.25 : s.sprinting ? 0.8 : 0.5, { crouch: !!s.crouch, run: !!s.sprinting });
        if (swim) this.effects.splash(rp.x - Math.sin(this.input.yaw) * 0.7, WATER_LEVEL, rp.z - Math.cos(this.input.yaw) * 0.7, s.sprinting ? 0.18 : 0.1);
      }
    } else if (swim && (this.treadT -= dt) <= 0) {
      this.treadT = 1.6 + Math.random() * 0.8;
      this.audio.footstep('water', undefined, undefined, undefined, 0.2, { crouch: true });
    }
    if (swim && s.stamina < 30 && !this.swimTired) {
      this.swimTired = true;
      this.ui.notify(s.stamina > 0 ? 'Tiring in the water: get your feet on the bottom before you run out of stamina.' : 'Drowning! Get to shallow water.', 'toast', 5);
    }
  },

  // The world round the eye, a frame on: the day's clock, the weather, the dark down the mine or in a ward, a smoker's
  // haze, the sky, what is drawn how far, the water, the lights and fires, the effects - then what it all sounds like
  updateSurroundings(dt, time, s, rp, cine) {
    const self = this.self;
    const cam = this.camera;
    const g = this.global;
    const cycle = this.debugCycle ?? cine?.cycle ?? Environment.cycleFor(g.phase, g.timeLeft, g.day, g.phaseLen);
    if (!g.finale) this.global.timeLeft = Math.max(0, g.timeLeft - dt);
    else if (!g.escapeStalled) this.global.escapeT = Math.max(0, g.escapeT - dt); // a stalled warm-up stands still
    const weather = this.weather.update(dt, g, time, cam.position);
    if (weather.kind !== this.weatherKind) {
      this.weatherKind = weather.kind;
      const say = WEATHER_TOAST[weather.kind];
      if (say && time - (this.weatherToastT ?? -1e9) > 45 && self.alive) {
        this.weatherToastT = time;
        this.ui.notify(say, 'toast', 3.5);
      }
    }
    // how far down the mine the eye is, 0 in daylight .. 1 a dozen metres down a drift: the sky's light goes out
    // with it (Environment), and so do the rain and the wind (below)
    const mine = this.world.mine;
    const deep = mine && mine.under(rp.x, rp.y + 0.3, rp.z) ? Math.min(1, Math.max(0, (mine.depth(rp.x, rp.z) - 2) / 11)) : 0;
    // (the same in a boarded-up ward of the clinic, as far as it is dark where the eye is: world.darkAt)
    const dark = Math.max(deep, this.world.darkAt(rp.x, rp.y + 1, rp.z));
    this.under += (dark - this.under) * Math.min(1, dt * 4);
    if (this.under < 0.002) this.under = 0;
    // (the mainland's passage was kept lit to the end - its lamps every few metres: down it a little of the light stays,
    // so its timbers, rails and tubs read; the island's mine is as dark as it was)
    this._envOver.under = this.world.size > 1000 && deep > 0 ? this.under * 0.8 : this.under;
    // in a smoker's cloud the haze closes in round the eye (shared/smoke.js): it thickens over a second, and clears a
    // little slower once the cloud is gone or the eye is out of it
    const smoke = cine ? 0 : smokeCover(cam.position.x, cam.position.y, cam.position.z, this.entities.smokes);
    this.smoke += (smoke - this.smoke) * Math.min(1, dt * (smoke > this.smoke ? 2.5 : 1.2));
    if (this.smoke < 0.002) this.smoke = 0;
    this._envOver.smoke = this.smoke;
    this._envOver.moon = this.debugMoon ?? (cine ? 0 : g.moon || 0); // tonight's moon (MOON), from the dusk horn to dawn
    this._envOver.fogMul = this.debugFog ?? (cine ? cine.fogMul : 0); // (a cutscene's long shots see further than the day's haze lets a survivor; debugFog: a look-dev camera's)
    this.env.update(dt, cycle, cam.position, time, weather, this._envOver);
    this.viewDist = Math.max(cine ? cine.far : 0, this.env.fogVisibility + 40); // how far anything is drawn: past it the haze has it
    this.staticWorld.update(cam.position, this.viewDist);
    this.terrain?.userData.update?.(cam.position, this.viewDist);
    this.bridge?.update(cam.position, this.viewDist);
    this.foliage.update(cam.position, this.env.fogVisibility, time, weather, cam);
    if (this.water) {
      const u = this.water.material.uniforms;
      u.uTime.value = time;
      u.uSky.value.copy(this.env.cur.horizon);
      u.uSunDir.value.copy(this.env.sunHeight > -0.05 ? this.env.uniforms.uSunDir.value : this.env.uniforms.uMoonDir.value);
      u.uSunCol.value.copy(this.env.cur.dir);
      u.uCam.value.copy(cam.position);
    }
    const fires = this.entities.fireSources.concat(this.staticFires, this.fair.lights, this.flameLights);
    this.lights.update(dt, time, cam.position, this.localFlash && self.alive && !s.zombie, fires, this.entities.remoteFlash, Math.max(this.env.night, this.under));
    this.power.update(dt, time, cam.position, Math.max(this.env.night, this.under));
    this.entities.structs.update(); // (after everything that moves a structure this frame: a blow's shake, a generator's)
    // nearest big fire warms the viewmodel & the ambience
    let nearFire = 0;
    for (const f of fires) {
      if (!f.big || !(f.intensity > 0)) continue;
      nearFire = Math.max(nearFire, Math.max(0, 1 - Math.hypot(rp.x - f.x, rp.z - f.z) / 14) * f.intensity);
    }
    // viewmodel lighting follows the world
    this.updateViewmodelLight(dt, cam, Math.max(nearFire, this.power.eyeLit), this.flames.get(-1)?.light.intensity || 0); // (in a floodlight's cone the hands are lit too)
    // The flashlight's spill on the hands and the gun. At the hip it comes from beside the head; behind the sights that
    // would shine square on whatever faces the eye (a rear sight lit up like a wall, the front one lost beyond it),
    // so as the gun comes up the spill moves out to the torch's side and ahead of the rear sight: the notch stays a
    // dark edge and the front sight is lit
    const vf = this.renderer.vmFlash;
    vf.intensity = this.localFlash && self.alive ? 0.35 + 0.25 * this.aimT : 0;
    vf.position.set(-0.05 + 0.25 * this.aimT, 0.12 - 0.09 * this.aimT, 0.15 - 0.45 * this.aimT);

    this.effects.setAmbient(Math.max(this.env.night, this.under)); // (down the mine it is night at noon)
    this.effects.update(dt, cam, this.renderer.renderer.domElement.height);
    this.impacts.update(dt);
    this.flyover.update(dt, time, cam, this.env, weather);
    this.crows.update(time, this.crowSpots());
    this.graves.update(dt);
    const flashOn = this.localFlash && self.alive && !s.zombie;
    // (no rain or blown leaves once the eye is well down a drift: what falls in the mouth is kept out by its roof)
    const sky = this.under > 0.5 ? Object.assign(this._wxDown, weather, DOWN_WEATHER) : weather;
    this.atmosphere.update(dt, time, cam, this.env, flashOn, this.world.heightAt, sky);
    this.weatherFx.update(dt, time, cam, sky, this.env, flashOn, this.renderer.renderer.domElement.height);
    this.updateAmbience(dt, time, s, rp, cine, weather, nearFire);
  },

  // the listener, how close the dead are, the specials' motifs, and the ambience's state (audio/audio.js)
  updateAmbience(dt, time, s, rp, cine, weather, nearFire) {
    const self = this.self;
    const cam = this.camera;
    const g = this.global;
    const a = this.audio;
    if (cine) a.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y, cam.rotation.x);
    else a.setListener(cam.position.x, cam.position.y, cam.position.z, this.input.yaw, this.input.pitch);
    let danger = 0;
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.ZOMBIE || e.dead) continue;
      const d = Math.hypot(e.rx - rp.x, e.rz - rp.z);
      if (d < 25) danger = Math.max(danger, 1 - d / 25);
    }
    this.danger = (this.danger || 0) + (danger - (this.danger || 0)) * Math.min(1, dt * 2);
    // each special's motif as it comes into view and again as it closes on any survivor (audio/motifs.js). Not for a
    // survivor who has risen as one of the dead, nor under a cutscene
    if (this.settings?.motifs !== false && !cine && !s.zombie && this.motifs.due(time)) {
      const zs = [];
      const surv = self.alive ? [{ x: rp.x, z: rp.z }] : [];
      for (const e of this.entities.ents.values()) {
        if (e.kind === ENT.ZOMBIE) {
          if (!e.dead && MOTIFS[e.ztype]) zs.push(e);
        } else if (e.kind === ENT.PLAYER && e.id !== this.myId && !(e.q[5] & (PFLAG.DEAD | PFLAG.ZOMBIE))) surv.push({ x: e.rx, z: e.rz });
      }
      const yaw = this.input.yaw;
      this.motifs.update(time, zs, surv, (ztype, near, x, z) => {
        // panned toward it: the listener's right is (cos yaw, -sin yaw)
        const dx = x - cam.position.x;
        const dz = z - cam.position.z;
        const d = Math.hypot(dx, dz) || 1;
        a.motif?.(ztype, near, (0.6 * (dx * Math.cos(yaw) - dz * Math.sin(yaw))) / d);
      });
    }
    const hpFrac = self.maxHp ? self.hp / self.maxHp : 1;
    a.setAmbience({
      night: this.env.night,
      horde: (g.phase === PHASE.NIGHT && g.hordeLeft > 0) || g.finale,
      boss: !!g.bossId,
      danger: this.danger,
      lowHealth: self.alive && !self.zombie ? (s.downed ? 1 : Math.max(0, 1 - hpFrac / 0.35)) : 0,
      nearFire,
      rain: weather.rain,
      wind: weather.wind,
      underCover: weather.cover,
      dead: !self.alive,
      menu: false,
      nightPhase: g.phase === PHASE.NIGHT,
      cycle: this.env.cycle,
      open: this.openness,
      indoor: Math.max(this.indoor, this.under),
      home: this.homeSense.home,
      homeless: g.phase === PHASE.NIGHT && this.homeless(g.day),
    });
  },
};
