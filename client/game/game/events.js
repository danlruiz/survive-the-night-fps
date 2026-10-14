// Game: what the server's events in a snapshot do here (decode.js readEvents calls these).
import { WEAPONS, ZOMBIE_DEFS, SOUND, KILLER } from '../../../shared/defs.js';
import { currentWeapon } from '../../../shared/playersim.js';
import { heardShow, loadHeardSeen, saveHeardSeen } from '../../ui/heard.js';
import { achievementEvent } from '../../net/achievements.js';
import { bestiaryEvent } from '../../net/bestiary.js';
import { strippedKey } from '../harvest.js';
import { nkRemoteHit } from '../nunchaku.js';
import { bearing, tonightBrief } from '../../ui/hud2.js';

export const methods = {
  get eventHandler() {
    if (this._eh) return this._eh;
    const g = this;
    this._eh = {
      sound(snd, x, y, z) {
        // a bulk craft is a tick's worth of craft events at one bench: one rummage, not twenty on top of each other
        if (snd === SOUND.CRAFT) {
          if (g.time - g.craftSoundT < 0.1) return;
          g.craftSoundT = g.time;
        }
        // (HORDE_HORN / DAWN / PLANE are always played 2D by the audio engine)
        g.audio.play(snd, { x, y, z });
        if (snd === SOUND.MELEE_HIT) nkRemoteHit(g, x, y, z); // (a survivor's nunchucks come off what they struck)
      },
      shot(ev) {
        g.remoteShot(ev);
      },
      impact(kind, x, y, z, nx, ny, nz, own) {
        // what our own shot struck was shown as it was fired (predictPellet): this is the server saying so again
        if (!own && g.sameAsOwn(x, y, z)) return;
        // hits on ourselves are shown by the damage vignette, not particles in our face
        const dc = Math.hypot(x - g.camera.position.x, y - g.camera.position.y, z - g.camera.position.z);
        if (dc < 1.2) return;
        g.effects.impact(kind, x, y, z, nx, ny, nz);
        if (kind === 1 || kind === 6) g.audio.play(SOUND.FLESH_HIT, { x, y, z, volume: 0.6 });
      },
      hitmark(flags) {
        g.ui.hitmarker(!!(flags & 1), !!(flags & 2));
        // a quiet meaty thwack confirms a gun hit (melee hits already sound MELEE_HIT); kills are heard as the death cry
        const s = g.prediction.state;
        if (!s.zombie && (g.gun.manning || !WEAPONS[currentWeapon(s)]?.melee)) g.audio.playLocal(flags & 1 ? 'headshot' : 'hitmarker', { volume: 0.7 });
      },
      damage(amount, fx, fz) {
        g.damageFx = Math.min(1, g.damageFx + amount / 40);
        const dx = fx - g.renderPos.x;
        const dz = fz - g.renderPos.z;
        const angle = Math.hypot(dx, dz) > 0.3 ? bearing(dx, dz) + g.input.yaw : null;
        g.ui.damage(amount, angle);
        if (g.ui.cardsOpen) g.ui.cards.hurt(amount); // (a red edge round the cards: something is hitting you)
        g.camShake = Math.min(1, (g.camShake || 0) + amount / 60);
        g.audio.playLocal(g.self.zombie ? 'zombie_player_growl' : 'hurt', { volume: Math.min(1, 0.4 + amount / 40) });
      },
      killfeed(kk, killerId, victimId, weapon, flags) {
        // a zombie the world killed is a boss that outlived the night: the dawn sun burnt it, and its loot with it
        const sunKill = kk === KILLER.WORLD && !!(victimId & 0x8000);
        const killer = kk === KILLER.PLAYER ? g.name(killerId) : kk === KILLER.ZOMBIE ? ZOMBIE_DEFS[killerId]?.name || 'Zombie' : sunKill ? 'The sun' : flags & 4 ? 'The water' : flags & 8 ? 'Undead Deer' : 'The world'; // (flags 4: drowned; 8: an undead deer's charge)
        const victim = victimId & 0x8000 ? ZOMBIE_DEFS[victimId & 0xff]?.name || 'Zombie' : g.name(victimId);
        g.ui.killfeed({ killer, victim, weaponItem: weapon, headshot: !!(flags & 1), killerZombie: kk === KILLER.ZOMBIE || !!(flags & 8) || (kk === KILLER.PLAYER && g.players.get(killerId)?.status === 1), victimPlayer: !(victimId & 0x8000) });
        if (sunKill) g.ui.notify(`${victim.startsWith('The ') ? victim : 'The ' + victim} burned in the sun, and what it carried with it. Kill a boss before sunrise to loot it.`, 'toast', 7);
      },
      notify(msg, arg) {
        g.onNotify(msg, arg);
      },
      explosion(x, y, z, radius, kind) {
        g.rockets.burst(x, y, z); // (a grenade of ours that went off: it is not drawn flying on)
        g.effects.explosion(x, y, z, radius, kind);
        if (kind === 0 || kind === 2) g.impacts.blast(x, y, z, radius);
        if (kind === 0 || kind === 2) g.lights.flashFx(x, y, z, kind === 2 ? 40 : 120, 0.5);
        const d = Math.hypot(x - g.renderPos.x, z - g.renderPos.z);
        g.camShake = Math.min(1.5, (g.camShake || 0) + Math.max(0, 1 - d / (radius * 5)) * 1.2);
      },
      pickup(item, count) {
        g.ui.pickup(item, count);
        g.onboarding.pickup(item);
        g.audio.playLocal('pickup');
      },
      zombieDie(id, yaw, flags) {
        g.entities.zombieDie(id, yaw, flags);
        if (id === g.ringFrom) {
          // the screecher that left our ears ringing is dead: they clear
          g.ringFrom = 0;
          g.audio.stopRing?.();
        }
      },
      zombieLeg(id, legs, yaw) {
        g.entities.zombieLeg(id, legs, yaw);
      },
      structBreak(x, y, z) {
        g.effects.structBreak(x, y, z);
      },
      stripped(qx, qy, qz) {
        g.stripped.add(strippedKey(qx, qy, qz));
        g.fellTree(qx, qy, qz); // (a tree in the list was cut down before we came)
      },
      fell(qx, qy, qz, yaw) {
        g.fellTree(qx, qy, qz, yaw);
      },
      treeBreak(qx, qy, qz, yaw, cut, pieces) {
        g.breakTree(qx, qy, qz, yaw, cut, pieces);
      },
      strike(id, blow, heavy, x, y, z, dx, dy, dz) {
        g.impacts.strike(id, blow, heavy, x, y, z, dx, dy, dz);
      },
      wreck(flags, qx, qy, qz, left, hits) {
        g.impacts.wreck(flags, qx, qy, qz, left, hits);
      },
      wreckAlarm(qx, qy, qz, say, secs) {
        g.impacts.wreckAlarm(qx, qy, qz, say, secs);
      },
      regrown() {
        g.stripped.clear();
        g.regrowTrees();
        g.impacts.regrown();
      },
      flyover(x, y, z, heading, eta) {
        g.flyover?.start(x, y, z, heading, eta, g.time, g.audio);
      },
      screech(id, secs) {
        // a screecher screamed close by: our ears ring until it is dead, or for secs (server/specials/screecher.js screech)
        if (g.self?.zombie) return;
        g.ringFrom = id;
        g.audio.ring?.(secs);
      },
      grave(i) {
        g.graves?.stir(i);
      },
      achieve(flags, add, ids) {
        achievementEvent(flags, add, ids);
      },
      bestiary(flags, mask) {
        bestiaryEvent(flags, mask);
      },
      heard(what, woke, loud, ids) {
        g.heardSeen ||= loadHeardSeen();
        const sh = heardShow(what, woke, loud, { always: g.settings.heardRings, seen: g.heardSeen });
        if (sh.label) {
          saveHeardSeen(g.heardSeen);
          g.ui.notify(sh.label, 'toast', 4);
        }
        if (sh.show) g.ui.hud?.minimap?.heard(loud, ids);
      },
      ping(pid, kind, x, y, z) {
        g.pings = g.pings.filter((p) => p.pid !== pid);
        g.pings.push({ pid, kind, x, y, z, t: g.time, name: g.name(pid) });
        g.audio.playLocal('notify', { volume: 0.7 });
      },
      pong(held) {
        g.conn.pong(held);
      },
      summary(s) {
        // under the clock once the "DAWN" title card has faded (on a small screen the two would meet): the night's
        // tally, and the names of what the next one brings
        setTimeout(() => g.state === 'playing' && g.ui.showSummary(s, tonightBrief(g.seed, s.night + 1, g.act)), 4300);
      },
    };
    return this._eh;
  },
};
