// Game: the markers - on the compass, standing in the world, on the field map and the minimap - and the pings.
import * as THREE from 'three';
import { ZOMBIE_DEFS, ZTYPE, ZONE, ZONE_NAMES } from '../../../shared/defs.js';
import { ACT, ENT, PING_KIND, PFLAG, ZSTATUS } from '../../../shared/protocol.js';
import { SUPPLIES, SUPPLY_NEED, W, supplyOfHint } from '../act.js';
import { SUPPLY_HELP, narrowedAt } from '../../../shared/supplyhelp.js';
import { roleList } from '../../../shared/roles.js';
import { raycastWorld } from '../../../shared/collision.js';
import { DEER_UNDEAD } from '../../../shared/deer.js';
import { itemIcon, glyph } from '../../ui/icons.js';
import { bearing, PING_LABEL } from '../../ui/hud2.js';

export const PING_LIFE = 12;
const _ray = { t: -1, col: null, terrain: false };
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _sc = { x: 0, y: 0 };

export const methods = {
  // [Z] / middle mouse: mark where you look for the team (enemy -> danger, loot -> loot)
  ping() {
    if (!this.world || !this.self.alive) return;
    const cam = this.camera;
    cam.getWorldDirection(_v);
    const ox = cam.position.x;
    const oy = cam.position.y;
    const oz = cam.position.z;
    raycastWorld(this.world, ox, oy, oz, _v.x, _v.y, _v.z, 220, _ray);
    let t = _ray.t >= 0 ? _ray.t : 60;
    let kind = PING_KIND.GO;
    // zombies along the ray
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.ZOMBIE || e.dead) continue;
      const rx = e.rx - ox;
      const ry = e.ry + 1 - oy;
      const rz = e.rz - oz;
      const along = rx * _v.x + ry * _v.y + rz * _v.z;
      if (along < 0 || along > t + 1) continue;
      const px = rx - _v.x * along;
      const py = ry - _v.y * along;
      const pz = rz - _v.z * along;
      if (px * px + py * py + pz * pz < 1.4 * 1.4) {
        t = along;
        kind = PING_KIND.DANGER;
      }
    }
    if (kind === PING_KIND.GO) {
      const e = this.entities.pick(ox, oy, oz, _v.x, _v.y, _v.z, Math.min(t + 1, 60));
      if (e && (e.kind === ENT.ITEM || e.kind === ENT.CACHE || e.kind === ENT.CRATE)) {
        kind = PING_KIND.LOOT;
        t = Math.hypot(e.rx - ox, e.ry - oy, e.rz - oz);
      }
    }
    this.conn.action(ACT.PING, kind, ox + _v.x * t, oy + _v.y * t, oz + _v.z * t);
  },

  // the partSpots indices the crows circle over: every hint whose supply is still in its hiding place and still needed
  crowSpots() {
    const g = this.global;
    const out = (this._crowSpots ||= []);
    out.length = 0;
    g.spots.forEach((si, k) => {
      const i = supplyOfHint(k);
      if (si !== 0xffff && !(g.found & (1 << k)) && g.supplies[i] < SUPPLY_NEED[i] && !out.includes(si)) out.push(si);
    });
    return out;
  },

  // Where the help points for hint k (global.help: shared/supplyhelp.js): near the spot once the rumour is narrowed,
  // on it from the compass ping on. null: no help yet, or nothing hidden there any more (the rumour's place will do)
  supplyHintAt(k) {
    const g = this.global;
    const sp = this.world.partSpots[g.spots[k]];
    if (!sp || g.found & (1 << k)) return null;
    if (this.supplyPinned(k)) return sp;
    return g.help >= SUPPLY_HELP.NARROW ? narrowedAt(sp, k) : null;
  },

  // is hint k's hiding place on the compass itself: the help has got that far, or a Scout has been near it (shared/roles.js)
  supplyPinned(k) {
    const g = this.global;
    return g.help >= SUPPLY_HELP.PING || !!(g.scouted & (1 << k));
  },

  buildMarkers(h, rp) {
    const g = this.global;
    const cm = h.compassMarks || (h.compassMarks = []);
    const wm = h.worldMarks || (h.worldMarks = []);
    cm.length = 0;
    wm.length = 0;
    const dist = (x, z) => Math.hypot(x - rp.x, z - rp.z);
    const car = this.world.car;
    const dCar = dist(car.x, car.z);
    const carIcon = glyph(W.glyph);
    cm.push({ kind: 'car', bearing: bearing(car.x - rp.x, car.z - rp.z), icon: carIcon, label: dCar > 6 ? `${Math.round(dCar)}m` : '', pinEdge: g.finale, cls: g.finale ? 'urgent' : '' });
    // rumoured supply places still missing something (one already taken from its hiding place is no reason to go there)
    const done = (i) => g.supplies[i] >= SUPPLY_NEED[i];
    const hintSeen = new Set();
    g.hints.forEach((zid, i) => {
      const si = supplyOfHint(i);
      if (zid === 255 || done(si) || g.found & (1 << i)) return;
      const z = this.world.zoneById[zid];
      if (!z) return;
      // a team that has found nothing yet is helped (shared/supplyhelp.js): the marker closes in on the spot, then sits
      // on it, pinned to the tape's edge
      const at = this.supplyHintAt(i) || z;
      if (at === z && hintSeen.has(zid + ':' + si)) return;
      hintSeen.add(zid + ':' + si);
      const d = dist(at.x, at.z);
      if (d < 25) return;
      hintSeen.add(zid);
      const ping = this.supplyPinned(i);
      // (the compass spells a marker's name out while you face it; a rumour keeps its question mark, as on the map)
      cm.push({ kind: 'hint', bearing: bearing(at.x - rp.x, at.z - rp.z), icon: itemIcon(SUPPLIES[si]), label: `${Math.round(d)}m`, name: ZONE_NAMES[zid] + (ping ? '' : '?'), d, pinEdge: ping, cls: ping ? 'urgent' : '' });
    });
    // discovered places nearby (a place that already has a supply icon or a waypoint on it needs no flag too)
    const wp = this.waypoint;
    const team = this.teamWaypoints();
    for (const z of this.world.zones) {
      if (!this.discovered.has(z.id) || z.id === ZONE.CAMP || hintSeen.has(z.id) || wp?.zone === z.id || team.some((t) => t.zone === z.id)) continue;
      const d = dist(z.x, z.z);
      if (d < 30 || d > 260) continue;
      cm.push({ kind: 'poi', bearing: bearing(z.x - rp.x, z.z - rp.z), icon: glyph('flag'), label: '', name: `${ZONE_NAMES[z.id]} · ${Math.round(d)}m`, d });
    }
    // the team's waypoints: on the tape while in view, and a marker on the spot like yours (raised the same way). One
    // on the spot of your own adds no flag: yours says who else is headed there
    let along = '';
    for (const t of team) {
      const who = t.names.join(', ');
      if (t.mine) {
        along = who;
        continue;
      }
      const d = dist(t.x, t.z);
      const name = `${who}: ${this.waypointName(t.zone)}`;
      const label = `${Math.round(d)}m`;
      cm.push({ kind: 'teamway', bearing: bearing(t.x - rp.x, t.z - rp.z), icon: glyph('flag'), label, name, d });
      if (d > 8 && this.project(t.x, t.y + 2.4 + d * 0.07, t.z, _sc)) wm.push({ kind: 'teamway', x: _sc.x, y: _sc.y, icon: glyph('flag'), name, sub: label, scale: 0.85 });
    }
    // your waypoint: always on the tape (pinned to its end when behind you), and a marker standing on the spot
    if (wp) {
      const d = dist(wp.x, wp.z);
      const name = this.waypointName();
      const label = `${Math.round(d)}m`;
      cm.push({ kind: 'way', bearing: bearing(wp.x - rp.x, wp.z - rp.z), icon: glyph('flag'), label, name, d, pinEdge: true });
      // (raised with the distance, so that walking at it the marker floats over the crosshair and not on it)
      if (d > 8 && this.project(wp.x, wp.y + 2.4 + d * 0.07, wp.z, _sc)) wm.push({ kind: 'way', x: _sc.x, y: _sc.y, icon: glyph('flag'), name, sub: along ? `${label} · ${along} too` : label, scale: 0.95 });
    }
    // teammates
    const sc = { x: 0, y: 0 };
    for (const e of this.entities.ents.values()) {
      if (e.kind === ENT.PLAYER) {
        const zombie = !!(e.q[5] & PFLAG.ZOMBIE);
        const dead = !!(e.q[5] & PFLAG.DEAD);
        if (zombie || dead) continue;
        const d = dist(e.rx, e.rz);
        const name = this.name(e.id);
        // health rides in every player's entity record (field 7, 0..255); a downed survivor has none left to show,
        // and one who has turned is not told which of the living is the weakest
        const hp = e.downed || h.zombie || !this.self.alive ? -1 : e.q[7] / 255;
        cm.push({ kind: 'mate', bearing: bearing(e.rx - rp.x, e.rz - rp.z), icon: glyph(e.downed ? 'downed' : 'person'), label: name.slice(0, 10), cls: e.downed ? 'downed' : '', hp, pinEdge: e.downed });
        if (d < 250 && this.project(e.rx, e.ry + (e.downed ? 0.9 : 2.15), e.rz, sc)) {
          const near = d < 12;
          // the bar is there when it says something: they are hurt, they are within reach, or we look their way
          // (the nameplate within an eighth of the screen height of the crosshair). Unhurt and far off: just the name
          const looked = Math.hypot(sc.x - window.innerWidth / 2, sc.y - window.innerHeight / 2) < window.innerHeight * 0.125;
          // their roles (shared/roles.js): a glyph each over the name, and named while we look at them
          const roles = e.downed ? [] : roleList(this.players.get(e.id)?.perks || 0);
          wm.push({
            kind: 'mate',
            x: sc.x,
            y: sc.y,
            icon: e.downed ? glyph('downed') : roles.map((r) => glyph(r.icon, 'role')).join(''),
            name,
            sub: e.downed ? `DOWN · ${this.downedLine(e, d, near)}` : d > 15 ? `${Math.round(d)}m` : looked && roles.length ? roles.map((r) => r.name).join(' · ') : '',
            bar: hp >= 0 && (hp < 1 || near || looked) ? hp : -1,
            cls: e.downed ? 'downed' : near ? 'near' : '',
            scale: Math.max(0.75, 1.1 - d / 300),
          });
        }
      } else if (e.kind === ENT.CRATE && e.q[3] !== 2) {
        const d = dist(e.rx, e.rz);
        cm.push({ kind: 'crate', bearing: bearing(e.rx - rp.x, e.rz - rp.z), icon: glyph('hazard'), label: `${Math.round(d)}m` });
        if (d > 25 && d < 300 && this.project(e.rx, e.ry + 2, e.rz, sc)) wm.push({ kind: 'crate', x: sc.x, y: sc.y, icon: glyph('hazard'), name: 'Supply drop', sub: `${Math.round(d)}m`, scale: 0.85 });
      }
    }
    // the dead a Spotter has marked (shared/roles.js): the whole team hits them harder, so the team is shown them
    for (const e of this.entities.ents.values()) {
      if (e.kind !== ENT.ZOMBIE || e.dead || !(e.q[8] & ZSTATUS.MARKED)) continue;
      const d = dist(e.rx, e.rz);
      if (d < 200 && this.project(e.rx, e.ry + 2.3, e.rz, sc)) wm.push({ kind: 'mark', x: sc.x, y: sc.y, icon: glyph('ping'), name: 'Marked', sub: `${Math.round(d)}m`, scale: Math.max(0.75, 1 - d / 300) });
    }
    // pings
    for (const p of this.pings) {
      const d = Math.hypot(p.x - rp.x, p.y - rp.y, p.z - rp.z);
      const fade = Math.min(1, (PING_LIFE - (this.time - p.t)) / 2);
      cm.push({ kind: 'ping', bearing: bearing(p.x - rp.x, p.z - rp.z), icon: glyph('ping'), label: `${Math.round(d)}m`, cls: 'p' + p.kind, pinEdge: true });
      if (this.project(p.x, p.y + 0.4, p.z, sc)) wm.push({ kind: 'ping', x: sc.x, y: sc.y, icon: glyph('ping'), name: `${p.name}: ${PING_LABEL[p.kind]}`, sub: `${Math.round(d)}m`, cls: 'p' + p.kind + (fade < 1 ? ' fading' : ''), scale: 1 });
    }
    // a new player's walkthrough: the zombie coming for them, the tree or rock to hit (onboarding.js, last frame's)
    for (const m of this.onboarding.marks) wm.push(m);
    // the car when it matters (finale, or carrying supplies back)
    if ((g.finale || h.objective?.anyCarried || g.suppliesDone) && dCar > 10 && this.project(car.x, car.y + 2.2, car.z, sc)) {
      wm.push({ kind: 'car', x: sc.x, y: sc.y, icon: carIcon, name: g.finale ? (g.escapeReady ? 'GET IN' : g.escapeStalled ? 'Engine stalled' : `Defend the ${W.thing}`) : W.your, sub: `${Math.round(dCar)}m`, cls: g.finale ? 'urgent' : '', scale: 0.95 });
    }
  },

  // world -> screen (px). returns false when behind the camera
  project(x, y, z, out) {
    _p.set(x, y, z).project(this.camera);
    if (_p.z > 1) return false;
    out.x = (_p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-_p.y * 0.5 + 0.5) * window.innerHeight;
    return true;
  },

  updateMap(s) {
    this.ui.map.update(this.mapData());
    void s;
  },

  // this act's car supplies lying loose on the ground, of the kinds the car still needs
  looseParts() {
    const g = this.global;
    return (g.parts || []).filter((p) => {
      const i = SUPPLIES.indexOf(p.item);
      return i >= 0 && g.supplies[i] < SUPPLY_NEED[i];
    });
  },

  // what the field map [M] and the minimap show
  mapData(counts = this.invCounts()) {
    const g = this.global;
    const mates = [];
    const crates = [];
    const enemies = []; // the living zombies, and players turned (big: a Tank or a boss)
    // only the dead on your own level: up top, not those down the mine under your feet; down there, not those on the
    // ground over you. (Within a couple of metres of your height they count wherever they are: in the mouth of a
    // portal, on their way in or out - a drift's floor is always 4.5 m or more under the ground over it)
    const mine = this.world.mine;
    const rp = this.renderPos;
    const down = !!mine?.under(rp.x, rp.y + 0.3, rp.z);
    const near = (e) => !mine || Math.abs(e.ry - rp.y) < 2.5 || mine.under(e.rx, e.ry + 0.3, e.rz) === down;
    for (const e of this.entities.ents.values()) {
      if (e.kind === ENT.PLAYER) {
        if (e.q[5] & PFLAG.DEAD) continue;
        if (e.q[5] & PFLAG.ZOMBIE) near(e) && enemies.push({ id: e.id, x: e.rx, z: e.rz, big: false });
        else mates.push({ x: e.rx, z: e.rz, name: this.name(e.id), status: e.downed ? 'downed' : 'alive' });
      } else if (e.kind === ENT.ZOMBIE) {
        if (!e.dead && near(e)) enemies.push({ id: e.id, x: e.rx, z: e.rz, big: e.ztype === ZTYPE.TANK || !!ZOMBIE_DEFS[e.ztype]?.boss });
      } else if (e.kind === ENT.DEER) {
        if (!e.dead && e.variant & DEER_UNDEAD && near(e)) enemies.push({ id: e.id, x: e.rx, z: e.rz, big: false }); // (the mainland's: they hunt you)
      } else if (e.kind === ENT.CRATE && e.q[3] !== 2) crates.push({ x: e.rx, z: e.rz });
    }
    const carried = {};
    SUPPLIES.forEach((it) => counts[it] && (carried[it] = counts[it]));
    return {
      parts: this.looseParts(),
      self: { x: this.renderPos.x, z: this.renderPos.z, yaw: this.input.yaw },
      mates,
      enemies,
      car: this.world.car,
      pings: this.pings,
      crates,
      benches: g.benches,
      vehicles: this.vehicles.marks(), // (the team's: what runs or ran, and the bridgehead's)
      discovered: this.discovered,
      hints: g.hints,
      found: g.found,
      // the help a team that has found nothing gets (shared/supplyhelp.js): where each still hidden one is, near enough
      helped: g.hints.map((zid, k) => ({ k, at: this.supplyHintAt(k) })).filter((h) => h.at && g.supplies[supplyOfHint(h.k)] < SUPPLY_NEED[supplyOfHint(h.k)]).map(({ k, at }) => ({ item: SUPPLIES[supplyOfHint(k)], x: at.x, z: at.z, exact: this.supplyPinned(k) })),
      schemHints: g.schemHints,
      unlocked: g.unlocked | 0,
      supplies: g.supplies,
      carried,
      waypoint: this.waypoint,
      teamWays: this.teamWaypoints(),
    };
  },
};
