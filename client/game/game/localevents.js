// Game: what the events of our own predicted simulation (playersim.js) look and sound like here.
import { WATER_LEVEL } from '../../../shared/constants.js';
import { ITEM } from '../../../shared/defs.js';
import { currentWeapon } from '../../../shared/playersim.js';
import { nkStrike } from '../nunchaku.js';
import { perkMods } from '../../../shared/progress.js';

// the anti-tank rifle's long reload: how far into it the round goes home (its bolt opens at the start, closes at the end)
const AT_ROUND_IN = 0.62;

export const methods = {
  onLocalEvents(events, s) {
    const a = this.audio;
    for (const ev of events) {
      switch (ev.type) {
        case 'fire':
          this.ownShot(ev);
          break;
        case 'dry':
          a.playLocal('dry');
          break;
        case 'reload': {
          this.vm.reload(ev.time, !!ev.each);
          if (ev.each) a.playLocal('shell_insert');
          else a.playLocal(currentWeapon(s) === ITEM.CROSSBOW ? 'xbow_cock' : currentWeapon(s) === ITEM.AT_RIFLE ? 'at_bolt' : currentWeapon(s) === ITEM.RPG ? 'rpg_draw' : currentWeapon(s) === ITEM.FLARE_GUN ? 'flare_open' : 'reload_start');
          break;
        }
        case 'reload_done': {
          const w = currentWeapon(s);
          a.playLocal(w === ITEM.SHOTGUN ? 'pump' : w === ITEM.HUNTING_RIFLE ? 'bolt' : w === ITEM.AT_RIFLE ? 'at_bolt' : w === ITEM.CROSSBOW ? 'xbow_load' : w === ITEM.RPG ? 'rpg_load' : w === ITEM.FLARE_GUN ? 'flare_close' : 'reload_end');
          break;
        }
        case 'melee':
          if (ev.move !== undefined) {
            // a blow of the nunchucks lands (the move began at 'nk_swing'): what it met here, for the free handle to
            // come off and the hands to feel - the server says what it hurt
            const hit = nkStrike(this, s, ev);
            if (hit) {
              this.vm.nkHit(hit.kind, hit.nx, hit.ny, hit.nz, hit.power);
              this.selfBody?.nkHit(hit.kind, hit.power);
              this.shakeView(0.1 * hit.power);
            }
            break;
          }
          this.vm.melee(!!ev.heavy);
          this.selfBody?.melee();
          a.playLocal(s.zombie ? 'claw' : ev.heavy ? 'swing_heavy' : 'swing');
          break;
        case 'nk_swing':
          // a move of the nunchucks begins: the hands play it; its sounds are its own motion's (nkSounds)
          this.vm.nkSwing(ev.move);
          this.selfBody?.nkSwing(ev.move);
          break;
        case 'throw':
          this.vm.throwItem();
          a.playLocal('throw');
          break;
        case 'switch':
          a.playLocal('switch', { volume: 0.6 });
          break;
        case 'use_cancel':
          // a click (or a weapon asked for) put the item away: the weapon comes straight back out
          this.vm.cancelUse?.();
          if (!events.some((e) => e.type === 'switch')) a.playLocal('switch', { volume: 0.6 });
          break;
        case 'jump':
          a.playLocal('jump', { volume: 0.5 });
          break;
        case 'shove':
          // a shove at the leaper on us: the hands thrust (the viewmodel), the palms thump into it, the HUD's key jolts
          this.vm.shove(ev.v);
          this.faceLatch?.jolt(); // (a crawler on our face jolts off it)
          this.shoves = (this.shoves | 0) + 1;
          a.playLocal('hit', { volume: 0.3 + 0.25 * ev.v, rate: 0.75 });
          this.shakeView(0.05);
          break;
        case 'land':
          a.playLocal('land'); // the view's dip comes with every landing, see updateCamera (game/view.js)
          break;
        case 'splash': {
          // into the water (shared/swim.js), from a jump or off the end of the pier: the view dips as on a landing
          const k = Math.min(1, ev.v / 12);
          a.footstep('water', undefined, undefined, undefined, 0.7 + 0.3 * k, { run: true });
          this.effects.splash(s.x - Math.sin(s.yaw) * 0.9, WATER_LEVEL, s.z - Math.cos(s.yaw) * 0.9, 0.3 + 0.5 * k);
          break;
        }
        case 'cart_bump':
          this.handcar.bump(); // our handcar run into the end of the line
          break;
        case 'veh_crash':
          this.vehicles.crash(ev.v); // what we drive struck something
          break;
        case 'veh_skid':
          this.vehicles.skid();
          break;
        case 'leap':
          a.playLocal('zombie_player_growl');
          break;
        case 'exhausted':
          a.playLocal('breath');
          break;
      }
    }
  },

  // the anti-tank rifle's round going home, partway through its long reload (no event says when: the state does)
  updateReloadSound(s, wdef) {
    if (currentWeapon(s) === ITEM.AT_RIFLE && s.reloadT > 0) {
      const reload = wdef.reload * perkMods(s.perks).reload;
      if (!this.atRoundIn && reload - s.reloadT >= reload * AT_ROUND_IN) {
        this.atRoundIn = true;
        this.audio.playLocal('at_round');
      }
    } else this.atRoundIn = false;
  },
};
