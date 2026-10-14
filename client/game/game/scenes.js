// Game: what is on screen out of play - a cutscene (cutscene.js), or the walk behind the splash.
import { PHASE, GAME_OVER_DELAY } from '../../../shared/constants.js';
import { WORLD, CROSSING, TAKEOFF_TIME } from '../../../shared/acts.js';
import { Crossing, Takeoff } from '../cutscene.js';
import { MenuTour } from '../menutour.js';

export const methods = {
  // The cutscene that is on, if one is (cutscene.js): the crossing while the server's phase is PHASE.CROSSING, the
  // take-off for the first TAKEOFF_TIME seconds of a victory on the mainland. Started and ended here, off the global
  // state, so a client that joins or comes back in the middle of one is in it at the right moment.
  updateCine() {
    const g = this.global;
    if (g.phase === PHASE.CROSSING) {
      if (!(this.cine instanceof Crossing)) {
        this.endCine();
        this.startCine(new Crossing(this));
      }
      this.cine.sync(CROSSING.TIME - g.timeLeft);
    } else if (g.phase === PHASE.VICTORY && this.act === WORLD.MAINLAND && this.live?.plane) {
      if (!this.cine && !this.tookOff) {
        this.tookOff = true;
        const left = g.restartT - (GAME_OVER_DELAY + 6);
        if (left > 1) {
          this.startCine(new Takeoff(this, this.live.plane));
          this.cine.t = Math.max(0, TAKEOFF_TIME - left);
        }
      } else if (this.cine && this.cine.t >= TAKEOFF_TIME) this.endCine();
    } else {
      this.tookOff = false;
      this.endCine();
    }
    return this.cine || null;
  },

  startCine(c) {
    this.cine = c;
    this.ui.setMapOpen(false);
    this.ui.setBoardOpen(false);
    this.ui.setBestiaryOpen(false);
    this.ui.setCardsOpen(false);
    this.ui.setSpawnOpen(false);
    this.closeBuildMenu();
    this.ui.setRosterOpen(false);
    if (this.ui.inventoryOpen) this.toggleInventory(false);
    this.endHold();
    this.inputBuffer.clear();
  },

  endCine() {
    if (!this.cine) return;
    this.cine.dispose();
    this.cine = null;
  },

  // Behind the splash: a walk around the valley at eye level (menutour.js), or, in one with no road to walk, a slow
  // turn around the car
  updateMenu(dt) {
    if (!this.world) return;
    const cam = this.camera;
    if (this.tour?.world !== this.world) this.tour = new MenuTour(this.world, !this.tour);
    let cut = 0;
    if (this.tour.ready) cut = this.tour.update(dt, cam);
    else {
      this.menuAngle += dt * 0.04;
      const car = this.world.car;
      const gy = this.world.heightAt(car.x, car.z);
      cam.position.set(car.x + Math.sin(this.menuAngle) * 15, gy + 3.4, car.z + Math.cos(this.menuAngle) * 15);
      cam.lookAt(car.x, gy + 1.2, car.z);
    }
    this.ui.splash.setCut(cut);
    this.highlight.reset(); // (no outline left over from the game just left)
    const weather = this.weather.update(dt, null, this.time, cam.position);
    this.env.update(dt, 0.49, cam.position, this.time, weather);
    this.staticWorld.update(cam.position, this.env.fogVisibility + 40);
    this.terrain?.userData.update?.(cam.position, this.env.fogVisibility + 40);
    this.bridge?.update(cam.position, this.env.fogVisibility + 40);
    this.foliage.update(cam.position, this.env.fogVisibility, this.time, weather, cam);
    this.lights.update(dt, this.time, cam.position, false, this.staticFires, [], this.env.night);
    this.power.update(dt, this.time, cam.position, this.env.night); // (no floodlight is left lit from the game before)
    this.entities.structs.update();
    this.effects.update(dt, cam, this.renderer.renderer.domElement.height);
    this.impacts.update(dt);
    this.atmosphere.update(dt, this.time, cam, this.env, false, this.world.heightAt, weather);
    this.weatherFx.update(dt, this.time, cam, weather, this.env, false, this.renderer.renderer.domElement.height);
    this.vm?.setVisible(false);
    // (the state is set before the engine is ready too, so it fetches intro.mp3 first and opens on the splash's mix)
    this.audio.setAmbience({ night: 0.6, horde: false, boss: false, danger: 0, lowHealth: 0, nearFire: 0, dead: false, menu: true });
    if (this.audio.ready) this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y, 0);
    this.post = { time: this.time, night: this.env.night, damage: 0, lowHealth: 0, infected: 0, dead: 0, exposure: this.env.exposure, rays: this.env.rays };
  },
};
