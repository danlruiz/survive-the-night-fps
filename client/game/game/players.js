// Game: the other players - the player list, their looks, chat, our XP, and what the HUD says about the team.
import { ZONE_NAMES, PLAYER_FIRE } from '../../../shared/defs.js';
import { ENT, PFLAG, PSTAT, CHATF, PLF, PROGF, dqpos } from '../../../shared/protocol.js';
import { characterFor, defaultCharacter } from '../../../shared/characters.js';
import { decode, lookKey } from '../../../shared/appearance.js';
import { levelOf, picksEarned, XP_SRC } from '../../../shared/progress.js';
import { ROLE, GUARD, DRAG, hasRole } from '../../../shared/roles.js';
import { bindTag, bindLabel } from '../binds.js';
import { lookWarm } from '../../render/models/characters.js';
import { bearing } from '../../ui/hud2.js';

export const methods = {
  onChat(id, flags, text) {
    if (flags & CHATF.SYSTEM) {
      this.ui.addChat('', text, { system: true });
      this.ui.spawn.serverSays(text);
    } else {
      const p = this.players.get(id);
      const zombie = !!(flags & CHATF.ZOMBIE);
      this.ui.addChat(p ? p.name : '???', text, { zombie, color: zombie ? '#7fae5a' : undefined });
    }
    this.audio.playLocal?.('chat', { volume: 0.5 });
  },

  // custom survivors' looks (S2C.LOOKS): each one's model key, its models queued to be built
  onLooks(ids) {
    for (const id of ids) {
      const v = decode(this.conn.looks.get(id));
      if (!v) {
        this.looks.delete(id);
        continue;
      }
      const key = lookKey(v);
      this.looks.set(id, key);
      this.lookWarmer.want(key);
    }
  },

  /**
   * Who a player is drawn as: their custom survivor's model key once its models are built, else the player list's
   * character (the roster survivor most like them, for a custom one); undefined until the list has said.
   */
  lookOf(id) {
    const key = this.looks.get(id);
    if (key && lookWarm(key)) return key;
    if (key) this.lookWarmer.want(key); // (built again if it was let go: evictLooks)
    return this.players.get(id)?.character;
  },

  onPlayers(r) {
    const n = r.u8();
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const id = r.u16();
      const name = r.str();
      const status = r.u8();
      const flags = r.u8();
      const onAir = !!(flags & PLF.ON_AIR);
      const kills = r.u16();
      const ping = r.u16();
      const level = r.u8();
      let way = null;
      if (flags & PLF.WAYPOINT) {
        const x = dqpos(r.i16());
        const z = dqpos(r.i16());
        const zone = r.u8();
        way = { x, z, zone: zone === 255 ? -1 : zone };
      }
      seen.add(id);
      const prev = this.players.get(id);
      // when we saw them go down (the player list [Tab] says for how long; 0: down before we heard of them)
      const downAt = status !== 3 ? 0 : prev?.status === 3 ? prev.downAt : prev ? performance.now() : 0;
      this.players.set(id, { name, status, onAir, kills, ping, level, way, downAt });
      // a teammate's new waypoint (not one they already had when we first heard of them, nor one being cleared)
      if (way && prev && id !== this.myId && !(prev.way && prev.way.x === way.x && prev.way.z === way.z)) this.waypointSet(id, way);
    }
    // each player's character, after them all (a server from before the roster sends none: the look picked from the id)
    const order = [...seen];
    for (const id of order) this.players.get(id).character = r.left > 0 ? characterFor(r.u8(), id) : defaultCharacter(id);
    // ...then everyone's perks in force (a server from before them sends none)
    for (const id of order) this.players.get(id).perks = r.left >= 4 ? r.u32() : 0;
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
    // (a count that went down was reset by the server for the new run: the run's kills then count from there)
    if (this.run) this.run.kills0 = Math.min(this.run.kills0, this.players.get(this.myId)?.kills ?? Infinity);
    this.pushRoster();
    this.voice.syncPlayers([...this.players.keys()]);
    this.radio.players(this.players, this.myId); // who is on the air: their voices come over the walkie-talkie
  },

  // What the player list [Tab] shows: the players as the server lists them, plus everyone's health. Health is not
  // in the list message: a teammate's rides in their entity record (field 7, 0..255), our own in the self state.
  pushRoster() {
    const ST = ['alive', 'zombie', 'dead', 'downed'];
    const list = [];
    const turned = !this.self.alive || !!this.prediction.state.zombie; // the dead get no report on the living
    for (const [id, p] of this.players) {
      const self = id === this.myId;
      const e = self || turned ? null : this.entities.ents.get(id);
      const hp = self ? (this.self.maxHp ? this.self.hp / this.self.maxHp : 1) : e ? e.q[7] / 255 : -1; // -1: nothing to show
      const where = this.rosterWhere(self ? this.renderPos : e && { x: e.rx, z: e.rz }, self);
      const downFor = p.downAt ? (performance.now() - p.downAt) / 1000 : null;
      list.push({ id, name: p.name, account: this.conn.accounts.get(id) || '', status: ST[p.status] || 'alive', hp, kills: p.kills, ping: self ? Math.round(this.conn.rtt) : p.ping, level: p.level, perks: p.perks || 0, talking: this.talkPeers.includes(id), radio: p.onAir, self, ...where, downFor });
    }
    this.ui.setPlayers(list);
  },

  // where someone is, for the player list: how far, which way from where you look (radians, clockwise from straight
  // ahead) and the place they are in - by the car, or a place you know (discovered or rumoured, as the map names it)
  rosterWhere(at, self) {
    if (!at || !this.world) return { dist: null, dir: null, place: '' };
    const rp = this.renderPos;
    const dx = at.x - rp.x;
    const dz = at.z - rp.z;
    const dist = self ? 0 : Math.hypot(dx, dz);
    const dir = dist > 2 ? bearing(dx, dz) + this.input.yaw : null;
    const car = this.world.car;
    let place = car && Math.hypot(at.x - car.x, at.z - car.z) < 14 ? 'by the car' : '';
    if (!place) for (const z of this.world.zones) if (this.knowsPlace(z.id) && Math.hypot(at.x - z.x, at.z - z.z) < z.flat + 6) place = ZONE_NAMES[z.id];
    return { dist, dir, place };
  },

  // S2C.PROGRESS: our XP as the server counts it (shared/progress.js), this run's by source. A level gained during
  // the run is announced, with the perk it brings
  onProgress(r) {
    const xp = r.varu();
    const f = r.u8();
    const run = XP_SRC.map(() => r.varu());
    const was = this.progress;
    const p = (this.progress = { xp, run, loaded: !!(f & PROGF.LOADED), kept: !!(f & PROGF.KEPT) });
    if (was?.loaded && p.loaded && p.kept) {
      const before = levelOf(was.xp);
      const now = levelOf(xp);
      if (now > before) {
        this.ui.notify(`LEVEL ${now}`, 'big', 3.5);
        this.ui.notify(picksEarned(now) > picksEarned(before) ? `A perk point to spend: Perks (${bindLabel('perks')})` : 'Keep going: more XP, more perk points.', 'sub', 3.5);
        if (picksEarned(now) > picksEarned(before)) this.onboarding.levelUp(); // (the first time: a card with the perks key)
        this.audio.stinger?.('car_part');
      }
    }
    this.ui.setProgress(p);
  },

  // The team over the HUD's vitals (ui/hud.js): everyone else in the game, how they are and how far off. Health as the
  // player list has it (pushRoster): it rides in a teammate's entity record, and the dead get no report on the living
  hudTeam(rp) {
    const ST = ['alive', 'zombie', 'dead', 'downed'];
    const turned = !this.self.alive || !!this.prediction.state.zombie;
    const out = [];
    for (const [id, p] of this.players) {
      if (id === this.myId) continue;
      const status = ST[p.status] || 'alive';
      const e = turned ? null : this.entities.ents.get(id);
      const hp = e && status === 'alive' ? e.q[7] / 255 : -1;
      const d = e && status !== 'dead' ? Math.hypot(e.rx - rp.x, e.rz - rp.z) : -1;
      out.push({ id, name: p.name, status, hp, d: d < 0 ? -1 : Math.round(d), talking: this.talkPeers.includes(id) });
    }
    return out;
  },

  // the peers you can hear talking right now (for the HUD)
  speakers() {
    return this.talkPeers.map((id) => ({ name: this.players.get(id)?.name || '?', radio: this.voice.overRadio(id) }));
  },

  name(id) {
    return this.players.get(id)?.name || 'Someone';
  },

  // the teammate on fire within reach of our [Space] (PLAYER_FIRE: the server puts out the nearest), or null
  burningMate(s) {
    let best = null;
    let bd = PLAYER_FIRE.reach;
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.PLAYER || e.id === this.myId || !(e.q[9] & PSTAT.BURNING) || e.q[5] & (PFLAG.DEAD | PFLAG.ZOMBIE)) continue;
      const d = Math.hypot(e.rx - s.x, e.rz - s.z);
      if (d < bd && Math.abs(e.ry - s.y) < 1.5) {
        bd = d;
        best = e;
      }
    }
    return best;
  },

  // the closest teammate on their feet that we can see (in the entity list): { name, d (m) }, or null. The downed card
  // names them: only a teammate can get us up. role: only those who hold it (shared/roles.js)
  closestMate(rp, role = -1) {
    let best = null;
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.PLAYER || e.id === this.myId || e.downed || e.q[5] & (PFLAG.ZOMBIE | PFLAG.DEAD)) continue;
      if (role >= 0 && !hasRole(this.players.get(e.id)?.perks || 0, role)) continue;
      const d = Math.hypot(e.rx - rp.x, e.rz - rp.z);
      if (!best || d < best.d) best = { name: this.name(e.id), d };
    }
    return best;
  },

  // the name of a teammate on their feet within r m of (x, z) who holds this role (ourselves too), or '' (shared/roles.js)
  roleNear(at, role, r) {
    const s = this.prediction.state;
    if (this.self.alive && !s.downed && hasRole(s.perks, role) && Math.hypot(s.x - at.x, s.z - at.z) <= r) return this.name(this.myId);
    const m = this.closestMate(at, role);
    return m && m.d <= r ? m.name : '';
  },

  // what a downed teammate's nameplate says after DOWN: who has them, or what we can do about it (d: m off; near: within reach)
  downedLine(e, d, near) {
    if (e.beingRevived) return 'being revived';
    const at = { x: e.rx, z: e.rz };
    if (e.q[5] & PFLAG.ROPED) return this.roleNear(at, ROLE.RUNNER, DRAG.slip) ? 'being dragged' : 'roped';
    const guard = this.roleNear(at, ROLE.GUARDIAN, GUARD.range) ? ' · guarded' : '';
    if (!near) return `${Math.round(d)}m${guard}`;
    const runner = hasRole(this.prediction.state.perks, ROLE.RUNNER) ? ` · crouch ${bindTag('interact')} to drag` : '';
    return `hold ${bindTag('interact')} to revive${runner}${guard}`;
  },
};
