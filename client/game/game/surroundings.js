// Game: the world round the eye as it is lit and heard - the sun on the hands, the reverb's openness, the ground under
// our feet, the water, lightning.
import * as THREE from 'three';
import { WATER_LEVEL } from '../../../shared/constants.js';
import { ENT } from '../../../shared/protocol.js';
import { nightTheme } from '../../../shared/nights.js';
import { HOME_WALLS, HOMELESS_THEMES } from '../../audio/home.js';
import { raycastWorld, COL } from '../../../shared/collision.js';

const _qv = new THREE.Quaternion();
const _jetCol = new THREE.Color(0xff9440); // a flamethrower stream's light
const _sunRay = { t: -1, col: null, terrain: false };
const _near = [];

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
};
