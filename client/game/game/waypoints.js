// Game: waypoints - our own, set on the field map, and the team's, from the player list.
import { ZONE_NAMES } from '../../../shared/defs.js';
import { ACT } from '../../../shared/protocol.js';
import { PSTATUS } from './players.js';

const WAYPOINT_REACH = 10; // metres: this close to a waypoint that is not on a named place and it is reached
// two waypoints on one spot: on the same place, or bare spots a few steps apart
const sameSpot = (a, b) => (a.zone >= 0 || b.zone >= 0 ? a.zone === b.zone : Math.hypot(a.x - b.x, a.z - b.z) < WAYPOINT_REACH);

export const methods = {
  // at: { x, z, zone } from a click on the field map (zone: the place it snapped to, or -1), null to clear
  setWaypoint(at) {
    const cur = this.waypoint;
    // a second click on the place that holds it takes it back
    if (!at || (cur && at.zone >= 0 && at.zone === cur.zone)) {
      if (!cur) return;
      this.waypoint = null;
      this.shareWaypoint();
      this.audio.playLocal('ui_click', { volume: 0.35 });
      return;
    }
    const zone = at.zone >= 0 ? this.world.zoneById[at.zone] : null;
    // you have arrived inside a place's yard, or a few steps from a bare spot
    this.waypoint = { x: at.x, y: this.world.heightAt(at.x, at.z), z: at.z, zone: at.zone, r: zone ? zone.flat : WAYPOINT_REACH, visited: !zone || this.discovered.has(at.zone), away: false };
    this.shareWaypoint();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  // Tells the server where your waypoint is now (or that it is gone): it goes to everyone in the player list.
  // (A new game and a new valley clear everyone's on the server as well, so those need not be sent.)
  shareWaypoint() {
    const wp = this.waypoint;
    this.conn.action(ACT.WAYPOINT, wp && { x: wp.x, z: wp.z, zone: wp.zone });
  },

  // a place lends a waypoint its name once you know it: discovered, or rumoured to hold a supply or a schematic
  knowsPlace(z) {
    return z >= 0 && (this.discovered.has(z) || this.global.hints.includes(z) || this.global.schemHints.includes(z));
  },

  waypointName(z = this.waypoint.zone) {
    return this.knowsPlace(z) ? ZONE_NAMES[z] : 'Waypoint';
  },

  // a teammate has just set a waypoint: a word on screen, if it is one teamWaypoints shows us
  waypointSet(id, way) {
    const p = this.players.get(id);
    if (!this.world || p.status === PSTATUS.DEAD || (p.status === PSTATUS.ZOMBIE) !== !!this.prediction.state.zombie) return;
    this.ui.notify(`${p.name} marked ${this.knowsPlace(way.zone) ? ZONE_NAMES[way.zone] : 'a waypoint'}`, 'toast', 3);
    this.audio.playLocal('ui_click', { volume: 0.4 });
  },

  // The team's waypoints, from the player list: a survivor sees the other survivors' (downed ones too), a turned
  // player the other turned players'. One entry per spot (sameSpot), naming everyone headed there; `mine`: it is
  // where your own waypoint is too. -> [{ x, y, z, zone, names: [...], mine }] (reused)
  teamWaypoints() {
    const out = this._teamWays || (this._teamWays = []);
    out.length = 0;
    if (!this.world) return out;
    const turned = !!this.prediction.state.zombie;
    for (const [id, p] of this.players) {
      const w = p.way;
      // (status: 0 alive, 1 zombie, 2 dead, 3 downed)
      if (!w || id === this.myId || p.status === PSTATUS.DEAD || (p.status === PSTATUS.ZOMBIE) !== turned) continue;
      const same = out.find((o) => sameSpot(o, w));
      if (same) same.names.push(p.name);
      else out.push({ x: w.x, y: this.world.heightAt(w.x, w.z), z: w.z, zone: w.zone, names: [p.name], mine: !!this.waypoint && sameSpot(this.waypoint, w) });
    }
    return out;
  },

  // the places come up as we reach them, and the waypoint has done its job once we are there
  updatePlaces(dt, s, rp, cine) {
    const self = this.self;
    // discovery of places
    this.discoverT -= dt;
    // (a drift of the mine runs under places it does not come up in)
    if (this.discoverT <= 0 && self.alive && !cine && !s.zombie && !this.world.mine?.under(rp.x, rp.y + 0.3, rp.z)) {
      this.discoverT = 0.5;
      for (const z of this.world.zones) {
        if (this.discovered.has(z.id)) continue;
        if (Math.hypot(rp.x - z.x, rp.z - z.z) < z.flat + 6) {
          this.discovered.add(z.id);
          this.ui.notify(`Discovered · ${ZONE_NAMES[z.id]}`, 'toast', 3.5);
        }
      }
    }
    // the waypoint has done its job once you are there
    const wp = this.waypoint;
    if (wp && self.alive && !s.zombie) {
      const d = Math.hypot(rp.x - wp.x, rp.z - wp.z);
      if (d > wp.r + 2) wp.away = true; // (set where you already stand, it waits until you have left and come back)
      else if (wp.away && d < wp.r) {
        this.waypoint = null;
        this.shareWaypoint();
        // a place seen for the first time has just said so itself ("Discovered")
        if (wp.visited) this.ui.notify(wp.zone >= 0 ? `Arrived · ${ZONE_NAMES[wp.zone]}` : 'Waypoint reached', 'toast', 2.5);
      }
    }
  },
};
