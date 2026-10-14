// Blows on the world: a melee swing on a tree, a rock or a wreck (gathering what it gives), a round or a blast in a
// tree's trunk, and a wreck's record of the blows it took and its alarm (shared/wrecks.js, server/trees.js). What is
// used up, cut down or ringing is told to everybody as it happens, and to whoever joins later (tellStripped,
// tellCut, tellWrecks). Game.gather holds it: collider -> { left, day } and, of a wreck that was hit, { hits, alarm,
// ringT, pulseT }; Game.ringing the wrecks whose alarm is going.
import { NOISE } from '../../shared/constants.js';
import { ITEM, EVT, NOTIFY, HEARD } from '../../shared/defs.js';
import { qpos, qangle8 } from '../../shared/protocol.js';
import { fellTree, cutTree, treeFoot, treeTop } from '../../shared/felling.js';
import { hitTree, treeBroken, treeCutMax, TREE_CUT_MIN, TREE_PIECE_MIN } from '../trees.js';
import { blowOf, BLOW } from '../../shared/surfaces.js';
import { WRECK_SALVAGE, WRECK_HITS_MAX, HITF, WRECKF, WRECK_ALARM, ALARM, ALARM_SAY, alarmStep, wreckOf, wreckLocal, wreckUnit, wreckHalf } from '../../shared/wrecks.js';
import { COL } from '../../shared/collision.js';
import { playerMods } from '../loadouts.js';

const TREE_CHOPS = 6; // blows of an axe (or a knife...) a tree gives wood for: the last brings it down
// (quick on purpose: a boulder is a wall's worth in a few swings, so building never holds the run up)
const ROCK_HITS = 3; // blows a boulder gives stone for (2 a blow) before it is mined out until dawn
const QUARRY_HITS = 5; // ...one of the quarry's (COL.QUARRY), which gives 3 a blow
// what breaks the most stone off: a blunt, heavy head gives one more, every other blow
const ROCK_BLUNT = new Set([ITEM.HAMMER, ITEM.BAT, ITEM.SPIKED_BAT]);

export const methods = {
  gatherHit(p, col, x, y, z, weapon) {
    const tree = !!(col.flags & COL.TREE);
    const rock = !tree && !!(col.flags & COL.ROCK);
    const quarry = rock && !!(col.flags & COL.QUARRY);
    let g = this.gather.get(col);
    if (!g) {
      g = { left: tree ? TREE_CHOPS : rock ? (quarry ? QUARRY_HITS : ROCK_HITS) : WRECK_SALVAGE };
      this.gather.set(col, g);
    }
    // (a tree shot to pieces gives none: what is left of it is splinters)
    if (g.left <= 0 || g.top !== undefined) {
      if (this.rng() < 0.35) this.notify(NOTIFY.SEARCH_EMPTY, tree ? 1 : rock ? 3 : 2, p.id);
      return;
    }
    g.left--;
    const r = this.rng;
    const more = playerMods(p).gather;
    if (more && r() < more) this.giveOrDrop(p, tree ? ITEM.STICK : rock ? ITEM.STONE : ITEM.SCRAP, 1);
    if (rock) {
      this.giveOrDrop(p, ITEM.STONE, (quarry ? 3 : 2) + (ROCK_BLUNT.has(weapon) && r() < 0.5 ? 1 : 0));
      this.zm.noise(x, z, NOISE.MINE);
    } else if (tree) {
      const dead = col.tv === 3 || col.tv === 4 || col.tv === 6;
      let sticks = weapon === ITEM.KNIFE || weapon === ITEM.NUNCHAKU ? 1 : 2;
      if (dead) sticks++;
      this.giveOrDrop(p, ITEM.STICK, sticks);
      const plankChance = (weapon === ITEM.MACHETE ? 0.35 : weapon === ITEM.HAMMER ? 0.15 : 0.22) + (col.tv === 5 ? 0.15 : 0);
      if (r() < plankChance) this.giveOrDrop(p, ITEM.WOOD, 1);
      if (!dead && r() < 0.07) this.giveOrDrop(p, ITEM.HERB, 1);
      this.zm.noise(x, z, NOISE.CHOP, undefined, p, HEARD.CHOP); // (what it sounds like is the blow's: EVT.STRIKE)
    } else {
      this.giveOrDrop(p, ITEM.SCRAP, weapon === ITEM.HAMMER ? 1 + (r() < 0.5 ? 1 : 0) : 1);
      if (r() < 0.3) this.giveOrDrop(p, ITEM.NAILS, 2 + Math.floor(r() * 3));
      if (r() < 0.08) this.giveOrDrop(p, ITEM.TAPE, 1);
      if (r() < 0.05) this.giveOrDrop(p, ITEM.WIRE, 1);
      if (r() < 0.04) this.giveOrDrop(p, ITEM.BATTERY, 1);
      this.zm.noise(x, z, NOISE.SALVAGE, undefined, p, HEARD.SALVAGE);
    }
    if (g.left > 0) return;
    // that was the last of it. A tree comes down, away from whoever cut it, and is out of the world until dawn;
    // a wreck stays where it is, and nobody's prompt offers the hit any more (the one who took it is told)
    if (tree) {
      this.ach.felled(p);
      return this.fellTree(col, Math.atan2(p.state.x - col.x, p.state.z - col.z));
    }
    this.tellStripped([col]);
    this.notify(NOTIFY.SEARCH_EMPTY, rock ? 3 : 2, p.id);
  },
  // A melee swing that struck the world at x,y,z going dx,dy,dz: the clients draw what it did (shared/surfaces.js).
  strike(p, weapon, heavy, x, y, z, dx, dy, dz) {
    this.emit(
      (w) => {
        w.u8(EVT.STRIKE);
        w.u16(p.id);
        w.u8(blowOf(weapon) | (heavy ? HITF.HEAVY : 0));
        w.i16(qpos(x));
        w.i16(qpos(y));
        w.i16(qpos(z));
        w.i8(Math.round(dx * 127));
        w.i8(Math.round(dy * 127));
        w.i8(Math.round(dz * 127));
      },
      { x, z, r: 90 },
    );
  },

  // A blow on a wreck (its collider `col`) at x,y,z going dx,dy,dz: kept on its record while there is room, and
  // told to everybody (EVT.WRECK) - and its alarm, if it has one, hears it. took: it took one of the wreck's salvage.
  wreckHit(col, x, y, z, dx, dy, dz, blow, heavy = false, took = false) {
    const prop = wreckOf(col);
    if (!prop) return;
    let g = this.gather.get(col);
    if (!g) this.gather.set(col, (g = { left: WRECK_SALVAGE }));
    const hits = (g.hits ||= []);
    let hit = null;
    if (hits.length < WRECK_HITS_MAX) {
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
      hit = [qpos(x), qpos(y), qpos(z), qangle8(yaw), Math.round((pitch / (Math.PI / 2)) * 127), blow | (heavy ? HITF.HEAVY : 0) | (took ? HITF.TOOK : 0)];
      hits.push(hit);
    }
    if (hit || took) this.tellWreck(col, g, hit ? [hit] : [], 0);
    this.alarmHit(col, g, prop, blow, x, z);
  },

  // What a blast does to the wrecks round it: each one in reach takes it as a blow on the side it faces. It gives
  // no scrap.
  blastWrecks(x, y, z, radius) {
    const near = this.world.staticGrid.query(x, z, radius + 6, []);
    // (a wreck is several boxes: the blow lands once, on the nearest point of the nearest of them)
    const blows = new Map(); // the wreck's unit -> [d, px, py, pz]
    for (const col of near) {
      const unit = wreckUnit(col);
      if (!wreckOf(col) || this.gather.get(unit)?.hits?.length >= WRECK_HITS_MAX) continue;
      // the nearest point of its box
      const lx = col.c * (x - col.x) - col.s * (z - col.z);
      const lz = col.s * (x - col.x) + col.c * (z - col.z);
      const cx = Math.max(-col.hx, Math.min(col.hx, lx));
      const cz = Math.max(-col.hz, Math.min(col.hz, lz));
      const px = col.x + col.c * cx + col.s * cz;
      const pz = col.z - col.s * cx + col.c * cz;
      const py = Math.max(Math.min(col.y0 + 0.3, col.y1), Math.min(col.y1 - 0.2, y));
      const d = Math.hypot(px - x, py - y, pz - z);
      if (d > radius || blows.get(unit)?.[0] <= d) continue;
      blows.set(unit, [d, px, py, pz]);
    }
    for (const [unit, [d, px, py, pz]] of blows) {
      // (a blast right on top of it: from above its middle)
      if (d > 0.05) this.wreckHit(unit, px, py, pz, (px - x) / d, (py - y) / d, (pz - z) / d, BLOW.BLAST);
      else this.wreckHit(unit, px, py, pz, 0, -1, 0, BLOW.BLAST);
    }
  },

  alarmHit(col, g, prop, blow, x, z) {
    const front = wreckLocal(prop, x, 0, z)[2] / wreckHalf(prop, col);
    const [state, say] = alarmStep(g.alarm || ALARM.UNKNOWN, prop.type, blow, front, this.rng);
    g.alarm = state;
    if (say < 0) return;
    if (say === ALARM_SAY.RING) {
      g.ringT = WRECK_ALARM.ring;
      g.pulseT = 0; // (the first of its noises now)
      this.ringing.add(col);
    } else if (say === ALARM_SAY.QUIET) this.ringing.delete(col);
    this.tellAlarm(col, say, g);
  },

  // the alarms that are going: each calls the dead every WRECK_ALARM.pulse seconds until it runs down
  updateAlarms(dt) {
    for (const col of this.ringing) {
      const g = this.gather.get(col);
      if (!g || g.alarm !== ALARM.RINGING) {
        this.ringing.delete(col);
        continue;
      }
      if ((g.pulseT -= dt) <= 0) {
        g.pulseT = WRECK_ALARM.pulse;
        this.zm.noise(col.x, col.z, WRECK_ALARM.noise);
      }
      if ((g.ringT -= dt) > 0) continue;
      g.alarm = ALARM.SPENT;
      this.ringing.delete(col);
      this.tellAlarm(col, ALARM_SAY.QUIET, g);
    }
  },

  tellAlarm(col, say, g, to = 0) {
    this.emit(
      (w) => {
        w.u8(EVT.WRECK_ALARM);
        w.i16(qpos(col.x));
        w.i16(qpos(col.y0));
        w.i16(qpos(col.z));
        w.u8(say);
        w.u8(say === ALARM_SAY.RING ? Math.max(1, Math.ceil(g.ringT)) : 0);
      },
      to ? { to } : { x: col.x, z: col.z, r: 220 },
    );
  },

  // One wreck's record to everybody: the new hits (or none: only what is left in it changed).
  tellWreck(col, g, hits, flags, to = 0) {
    this.emit(
      (w) => {
        w.u8(EVT.WRECK);
        w.u8(flags);
        w.u8(1);
        this.writeWreck(w, col, g, hits);
      },
      { to },
    );
  },
  writeWreck(w, col, g, hits) {
    w.i16(qpos(col.x));
    w.i16(qpos(col.y0));
    w.i16(qpos(col.z));
    w.u8(Math.max(0, g.left));
    w.u8(hits.length);
    for (const h of hits) {
      w.i16(h[0]);
      w.i16(h[1]);
      w.i16(h[2]);
      w.u8(h[3]);
      w.i8(h[4]);
      w.u8(h[5]);
    }
  },
  // Every wreck that has been hit, as it is, to player id `to` (who joins, or comes back): the whole of each record,
  // and the alarms that are ringing.
  tellWrecks(to) {
    const list = [];
    for (const [col, g] of this.gather) if (g.hits?.length && wreckOf(col)) list.push([col, g]);
    for (let i = 0; i < list.length; i += 16) {
      const part = list.slice(i, i + 16);
      this.emit(
        (w) => {
          w.u8(EVT.WRECK);
          w.u8(WRECKF.REPLAY);
          w.u8(part.length);
          for (const [col, g] of part) this.writeWreck(w, col, g, g.hits);
        },
        { to },
      );
    }
    for (const col of this.ringing) {
      const g = this.gather.get(col);
      if (g) this.tellAlarm(col, ALARM_SAY.RING, g, to);
    }
  },

  // yaw: the way it falls (the game's yaw: toward -sin, -cos)
  fellTree(col, yaw) {
    if (!fellTree(this.world, col)) return;
    this.emit((w) => {
      w.u8(EVT.FELL);
      w.i16(qpos(col.x));
      w.i16(qpos(col.y0));
      w.i16(qpos(col.z));
      w.u8(qangle8(yaw));
    });
  },

  // A round of `dmg` in a tree's trunk at height y, going dx,dz (server/trees.js): the damage stays in the trunk
  // where it struck, and once a band of it has taken enough the tree bursts there and what stood above comes down
  // the way the round was going. What stands below stays, and can be shot again.
  shootTree(col, y, dx, dz, dmg) {
    let g = this.gather.get(col);
    if (!g) this.gather.set(col, (g = { left: TREE_CHOPS }));
    const cut = hitTree(g, col, y - treeFoot(col), dmg);
    if (cut >= 0) this.breakTree(col, Math.atan2(-dx, -dz), cut, 1);
  },

  // What a blast does to the trees round it: each trunk in reach is blown apart, low down and in pieces (more of
  // them the nearer it was), away from the blast.
  blastTrees(x, y, z, radius) {
    for (const col of this.world.staticGrid.query(x, z, radius + 2, [])) {
      if (!(col.flags & COL.TREE) || y < col.y0 - 1 || y > col.y1 + 1) continue;
      const dx = col.x - x;
      const dz = col.z - z;
      const d = Math.max(0, Math.hypot(dx, dz) - col.r);
      if (d > radius) continue;
      this.breakTree(col, Math.atan2(-dx, -dz), y - treeFoot(col), d < radius * 0.5 ? 3 : 2);
    }
  },

  // Tree col breaks `cut` m up its foot, what stood above coming down toward yaw; pieces: 1 for a shot, 2-3 for a
  // blast (EVT.TREE_BREAK). The trunk below stands until dawn - its collider no taller than it - and gives no wood.
  breakTree(col, yaw, cut, pieces) {
    cut = Math.max(TREE_CUT_MIN, Math.min(cut, treeCutMax(col)));
    if (cut > treeTop(col) - TREE_PIECE_MIN || !cutTree(this.world, col, cut)) return;
    let g = this.gather.get(col);
    if (!g) this.gather.set(col, (g = { left: TREE_CHOPS }));
    treeBroken(g, cut); // (whoever joins is told how much of it stands - tellCut - and dawn's gather.clear() and
    // regrowTrees stand it up whole again)
    this.emit((w) => this.writeTreeBreak(w, col, yaw, cut, pieces));
  },

  writeTreeBreak(w, col, yaw, cut, pieces) {
    w.u8(EVT.TREE_BREAK);
    w.i16(qpos(col.x));
    w.i16(qpos(col.y0));
    w.i16(qpos(col.z));
    w.u8(qangle8(yaw));
    w.u8(Math.round(cut * 10));
    w.u8(pieces);
  },

  // The trees shot or blown down to what stands of them, to player id `to`: EVT.TREE_BREAK with no pieces (it is
  // only how it stands, nothing comes down)
  tellCut(to) {
    for (const [col, g] of this.gather) if (g.top !== undefined && col.flags & COL.TREE) this.emit((w) => this.writeTreeBreak(w, col, 0, g.top, 0), { to });
  },

  // Which trees and wrecks are used up, to player id `to` (0: everybody). They are colliders of the static world,
  // which every client has built for itself: named by where they stand (client/game/harvest.js keys them the same).
  tellStripped(cols, to = 0) {
    for (let i = 0; i < cols.length; i += 255) {
      const part = cols.slice(i, i + 255);
      this.emit(
        (w) => {
          w.u8(EVT.STRIPPED);
          w.u8(part.length);
          for (const c of part) {
            w.i16(qpos(c.x));
            w.i16(qpos(c.y0));
            w.i16(qpos(c.z));
          }
        },
        { to },
      );
    }
  },
};
