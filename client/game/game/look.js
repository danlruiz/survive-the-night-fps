// Game: what we look at - the target [E] would act on, and the prompt that says what it would do.
import * as THREE from 'three';
import { SERVER_TICK_RATE, SLOT_BUILD, EYE_HEIGHT, INTERACT_REACH, CAR_REACH } from '../../../shared/constants.js';
import { ITEM, ITEM_DEFS, WEAPONS, STRUCT, STRUCT_DEFS, repairCostOf, CONT, CONT_DEFS } from '../../../shared/defs.js';
import { ENT } from '../../../shared/protocol.js';
import { trackedRecipe, trackedNeed } from '../tracked.js';
import { mayHold } from '../itemguide.js';
import { PLANE_REACH } from '../../../shared/acts.js';
import { SUPPLIES, SUPPLY_NEED, W } from '../act.js';
import { currentWeapon } from '../../../shared/playersim.js';
import { pryWeapon } from '../../../shared/trunk.js';
import { ROLE, hasRole } from '../../../shared/roles.js';
import { harvestPrompt, harvestTarget } from '../harvest.js';
import { bindTag } from '../binds.js';

// m:ss, for the time a torch or a campfire has left to burn (Game.burnLeft)
const mmss = (t) => {
  const n = Math.ceil(t);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
// '1 Planks, 1 Nails': what a repair takes, for its prompt
const costText = (cost) =>
  Object.entries(cost)
    .map(([id, n]) => `${n} ${ITEM_DEFS[id].name}`)
    .join(', ');
const _v = new THREE.Vector3();

export const methods = {
  updateLookTarget() {
    const cam = this.camera;
    const s = this.prediction.state;
    const was = this.lookTarget;
    this.lookTarget = null;
    this.prompt = null;
    if (!this.self.alive || s.zombie || s.downed) return;
    if (s.ride) return this.fair.rideLook(s);
    if (s.cart) return this.handcar.rideLook(s);
    if (s.drive || s.pass) return this.vehicles.rideLook(s);
    if (this.gun.look(true)) return; // hands on the mounted gun (at its grips, or carrying it): [E] is the gun's
    // ...or the cat in our arms: [E] puts it down. Except at the car, which is still started and driven with it in our
    // arms (taking it off the island is what its achievement is for): there [G] puts it down
    if (this.cat.holding) {
      if (this.lookAtCar(this.invCounts())) this.prompt += ` · ${bindTag('drop')} Put the cat down`;
      else this.cat.look();
      return;
    }
    cam.getWorldDirection(_v);
    const ox = cam.position.x;
    const oy = cam.position.y;
    const oz = cam.position.z;
    const e = this.entities.pick(ox, oy, oz, _v.x, _v.y, _v.z, INTERACT_REACH, this.renderPos.y + EYE_HEIGHT, was);
    const counts = this.invCounts();
    if (e) {
      if (e.kind === ENT.ITEM) {
        const d = ITEM_DEFS[e.item];
        this.lookTarget = e;
        const n = e.q[3];
        // a weapon whose slot is taken, with no room in the pack for it: taking it puts the one in that slot down
        const swap = d?.cat === 'weapon' && WEAPONS[e.item] ? this.swapsOut(WEAPONS[e.item].slot) : 0;
        this.prompt = swap ? `${bindTag('interact')} Swap your ${ITEM_DEFS[swap].name} for the ${d.name}` : `${bindTag('interact')} Pick up ${d?.name || 'item'}${n > 1 ? ` ×${n}` : ''}`;
        // (something the recipe tracked on the HUD is still short of)
        if (trackedNeed(e.item, counts)) this.prompt += ` · needed for ${ITEM_DEFS[trackedRecipe().out].name} (tracked)`;
        return;
      }
      if (e.kind === ENT.CACHE) {
        this.lookTarget = e;
        const name = CONT_DEFS[e.ctype]?.name || 'Container';
        this.prompt = e.q[3] === 0 ? `${bindTag('interact')} Hold to search ${name}` : `${name} · searched`;
        // (a car's boot is forced open - with what is in the hand, or slowly without: shared/trunk.js)
        const boot = this.bootOf(e);
        if (boot && e.q[3] === 0) {
          const w = pryWeapon(currentWeapon(s));
          this.prompt = boot.shut ? (w ? `${bindTag('interact')} Hold to pry the trunk open with the ${ITEM_DEFS[w].name}` : `${bindTag('interact')} Hold to force the trunk open by hand (slow: a blade or a bat is quicker)`) : `${bindTag('interact')} Hold to search the open trunk`;
        } else if (boot) this.prompt = 'Car Trunk · forced open, searched';
        const r = e.q[3] === 0 && trackedRecipe();
        const want = r && Object.keys(r.cost).find((k) => trackedNeed(+k, counts) && mayHold(e.ctype, +k));
        if (want) this.prompt += ` · may hold ${ITEM_DEFS[want].name} (tracked)`;
        return;
      }
      if (e.kind === ENT.PLAYER && e.downed) {
        this.lookTarget = e;
        // (a Runner crouched drags them instead, and lets go with the same key: shared/roles.js)
        const ps = this.prediction.state;
        if (ps.drag) this.prompt = `${bindTag('interact')} Let go of ${this.name(e.id)}`;
        else if (hasRole(ps.perks, ROLE.RUNNER)) this.prompt = ps.crouch ? `${bindTag('interact')} Drag ${this.name(e.id)} to safety` : `${bindTag('interact')} Hold to revive ${this.name(e.id)} · crouch to drag`;
        else this.prompt = `${bindTag('interact')} Hold to revive ${this.name(e.id)}`;
        return;
      }
      if (e.kind === ENT.CAT) {
        this.lookTarget = e;
        this.prompt = `${bindTag('interact')} Pick up the cat`;
        return;
      }
      if (e.kind === ENT.CRATE) {
        this.lookTarget = e;
        this.prompt = `${bindTag('interact')} Open supply crate`;
        return;
      }
      if (e.kind === ENT.STRUCTURE) {
        this.lookTarget = e;
        const def = STRUCT_DEFS[e.stype];
        const hp = e.q[3] / 255;
        const power = this.power.prompt(e, counts, s.slot === SLOT_BUILD); // what a generator or a floodlight is doing
        if (power) this.prompt = power;
        else if (e.stype === STRUCT.CAMPFIRE) {
          const lit = e.q[4] === 1;
          const w = counts[ITEM.WOOD] || 0;
          const st = counts[ITEM.STICK] || 0;
          this.prompt = w || st ? `${bindTag('interact')} ${lit ? 'Feed' : 'Relight'} the fire (${w ? `${w} Planks` : `${st} Sticks`})` : lit ? 'Campfire · feed it Planks or Sticks' : 'The fire is out · needs Planks or Sticks';
          // (how long it has left: with the hammer out only, so nothing more is on the screen in a fight)
          if (s.slot === SLOT_BUILD) this.prompt += `${lit ? ` · burns ${mmss(this.burnLeft(e))}` : ''} · ${bindTag('demolish')} Remove`;
        } else if (s.slot === SLOT_BUILD) {
          if (e.stype === STRUCT.TORCH) this.prompt = hp < 1 || e.q[4] === 0 ? `${bindTag('interact')} Relight torch (1 Cloth) · ${bindTag('demolish')} Remove` : `Burns ${mmss(this.burnLeft(e))} · ${bindTag('demolish')} Remove torch`;
          else this.prompt = hp < 0.99 ? `${bindTag('interact')} Repair ${def.name} (${costText(repairCostOf(e.stype))}) · ${bindTag('demolish')} Demolish` : `${bindTag('demolish')} Demolish ${def.name}`;
        } else if (def.station === 'bench') this.prompt = `Workbench · craft here ${bindTag('inventory')}`;
        this.contextStructure = { name: def.name, hp };
        return;
      }
    }
    if (this.gun.look(false)) return; // at the grips of the mounted gun
    // the bell rope, the radio set
    if (this.fixtures.look(ox, oy, oz, _v.x, _v.y, _v.z, this.renderPos.y + EYE_HEIGHT, counts)) return;
    if (this.fair.look(ox, oy, oz, _v.x, _v.y, _v.z, counts)) return;
    if (this.handcar.look(ox, oy, oz, _v.x, _v.y, _v.z)) return;
    if (this.vehicles.look(ox, oy, oz, _v.x, _v.y, _v.z, counts)) return;
    this.lookAtCar(counts);
    // a teammate on their feet, when nothing else is in the crosshair: Dead Hand (a match or a trade)
    if (!this.prompt && this.cards.look(ox, oy, oz, _v.x, _v.y, _v.z, this.renderPos.y + EYE_HEIGHT)) return;
    // nothing to interact with: a tree or a wreck within a swing's reach says what hitting it gives
    if (!this.prompt) {
      this.prompt = harvestPrompt(this.world, s, this.stripped);
      if (this.prompt) this.prompt = this.impacts.alarmPrompt(harvestTarget()) || this.prompt; // (a wreck whose alarm is going: how to stop it)
      this.vehicles.siphonLook(cam); // (a wreck with fuel still in its tank)
    }
  },

  // the car (the plane on the mainland), when we are close enough to it: its prompt. True when it is the look target
  lookAtCar(counts) {
    const g = this.global;
    const car = this.world.car;
    const dcar = Math.hypot(this.renderPos.x - car.x, this.renderPos.z - car.z);
    if (dcar >= CAR_REACH + (car.plane ? PLANE_REACH : 0)) return false;
    this.lookTarget = 'car';
    const missing = SUPPLIES.filter((p, i) => g.supplies[i] < SUPPLY_NEED[i]);
    const carrying = missing.filter((p) => counts[p]);
    if (g.finale && car.plane) this.prompt = g.escapeReady ? (g.runwayBlocked ? 'The dead are on the runway: clear it' : `${bindTag('interact')} Hold to get in and take off`) : g.standWarm ? 'Defend the plane until the engines are warm' : 'Hold the fuel truck until the tanks are full';
    else if (g.finale) this.prompt = g.escapeReady ? `${bindTag('interact')} Hold to get in and drive away` : 'Defend the car until the engine is warm';
    else if (!missing.length) this.prompt = car.plane ? `${bindTag('interact')} Hold to start fuelling (the runway stand)` : `${bindTag('interact')} Hold to start the engine (final stand)`;
    else if (carrying.length) this.prompt = `${bindTag('interact')} Install ${carrying.map((p) => ITEM_DEFS[p].name).join(', ')}`;
    else this.prompt = `${W.The} needs: ${missing.map((p) => ITEM_DEFS[p].name).join(', ')}`;
    return true;
  },

  // The car whose boot a container is, when that car has a lid to force (shared/trunk.js): { car, shut } - shut:
  // the lid is still down on it (not forced, not lifted by a blow, not off). null: any other container.
  bootOf(e) {
    if (!e || e.kind !== ENT.CACHE || e.ctype !== CONT.TRUNK) return null;
    const car = this.impacts.bootOf(e);
    return car ? { car, shut: this.impacts.wrecks.bootShut(car) } : null;
  },

  // seconds a torch or a campfire has left to burn: the server sends the tick it burns out at (SF.BURN, low 16 bits),
  // and it is counted down here from the latest tick, so nothing more is sent while it burns
  burnLeft(e) {
    if (!e.q[5]) return 0;
    const left = (e.q[5] - this.net.tick) & 0xffff;
    return left > 0xf000 ? 0 : left / SERVER_TICK_RATE;
  },
};
