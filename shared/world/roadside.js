// The island's roadside and woodland sites (world.js): dozens of small spots along the roads and out in the woods
// (wrecks, camps, sheds, stashes, hunters' stands, ruins, graves...) so every walk passes something worth searching.
// They are picked before anything is built, so the ground under them can be levelled, and built once every place
// stands; then the roads are dressed with power poles, signs and mailboxes.
import { MAP_HALF, GRID_N, GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { PROPS } from '../props.js';
import { smoothstep, lerp } from '../rng.js';
import { ROAD } from '../layout.js';

const PI = Math.PI;
const SITE_ROOM = 5; // (m) how far a roadside or woodland site keeps from the nearest solid prop a place has built

// Chosen now (before anything is built) so the ground under sheds / camps can be levelled: {x, z, ry, type, road}
export function pickSites({ rng, roads, zoneById, nearZone, lake, rail, heights, heightAt, roadDist, roadDistAt }) {
  const N = GRID_N;
  const inLakeRaw = (x, z) => heightAt(x, z) < WATER_LEVEL + 0.35;
  const sites = [];
  const siteFree = (x, z, minGap) => {
    for (const s of sites) if (Math.hypot(s.x - x, s.z - z) < minGap) return false;
    return true;
  };
  const DRY = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]; // a site wants dry ground under all of it
  // the ground behind the adit of Blackrock Mine (the back of its yard, local (0, 22)) is kept for the mound the
  // adit is set into (mine.js)
  const behindAdit = (x, z) => {
    const zn = zoneById[ZONE.MINE];
    if (!zn) return false;
    const s = (x - zn.x) * Math.sin(zn.ry) + (z - zn.z) * Math.cos(zn.ry);
    return s > 20 && s < 58 && Math.abs((x - zn.x) * Math.cos(zn.ry) - (z - zn.z) * Math.sin(zn.ry)) < 21;
  };
  const siteOk = (x, z) => Math.abs(x) < MAP_HALF - 50 && Math.abs(z) < MAP_HALF - 50 && !DRY.some(([dx, dz]) => inLakeRaw(x + dx, z + dz)) && !nearZone(x, z, 16) && Math.hypot(x - lake.x, z - lake.z) > lake.r + 8 && !behindAdit(x, z) && !rail?.keep(x, z);
  const ROADSIDE_W = [['wreck', 5], ['camp', 2.5], ['logpile', 1.5], ['shed', 1.4], ['stash', 1], ['ruin', 1], ['grave', 0.8], ['roadblock', 1.2], ['bus', 0.5]];
  const TRAIL_W = [['camp', 3], ['hunter', 2.5], ['stash', 1.5], ['logpile', 1], ['grave', 1.2], ['shed', 1]];
  const WOODS_W = [['camp', 2.5], ['hunter', 2.5], ['stash', 2], ['shed', 1.5], ['ruin', 1.5], ['grave', 1.2], ['logpile', 0.8]];
  const pickW = (list) => {
    let tot = 0;
    for (const [, w] of list) tot += w;
    let r = rng() * tot;
    for (const [t, w] of list) {
      r -= w;
      if (r <= 0) return t;
    }
    return list[0][0];
  };
  for (const road of roads) {
    if (road.length < 60) continue;
    const p = road.pts;
    const n = p.length / 2;
    let acc = rng.range(10, 30);
    let side = rng.chance(0.5) ? 1 : -1;
    const spacing = road.kind === ROAD.TRAIL ? 58 : 40;
    for (let i = 2; i < n - 2; i++) {
      acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      if (acc < spacing) continue;
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      const type = pickW(road.kind === ROAD.TRAIL ? TRAIL_W : ROADSIDE_W);
      const onRoad = type === 'roadblock';
      const off = onRoad ? 0 : type === 'wreck' || type === 'bus' ? rng.range(5.5, 7.5) : rng.range(9.5, 13);
      let placed = false;
      for (let attempt = 0; attempt < 2 && !placed; attempt++, side = -side) {
        const sx = x + nx * side * off;
        const sz = z + nz * side * off;
        if (!siteOk(sx, sz) || !siteFree(sx, sz, onRoad ? 70 : 26)) continue;
        if (!onRoad && roadDistAt(sx, sz) < off - 1.5) continue; // too close to another road
        // front (-Z local) faces the road (for road blocks: along the road)
        const ry = onRoad ? Math.atan2(-tx, -tz) : Math.atan2(nx * side, nz * side);
        sites.push({ x: sx, z: sz, ry, type, road: road.kind, tx: tx / tl, tz: tz / tl });
        placed = true;
      }
      if (!placed) continue;
      acc = rng.range(-8, 8);
    }
  }
  for (let a = 0; a < 2000 && sites.length < 130; a++) {
    const x = rng.range(-MAP_HALF + 52, MAP_HALF - 52);
    const z = rng.range(-MAP_HALF + 52, MAP_HALF - 52);
    if (!siteOk(x, z) || roadDistAt(x, z) < 20 || !siteFree(x, z, 40)) continue;
    sites.push({ x, z, ry: rng.range(0, PI * 2), type: pickW(WOODS_W), road: 0 });
  }
  // level the ground under built sites
  const FLAT_SITES = { shed: 5.5, ruin: 6.5, camp: 5, stash: 4, logpile: 4.5, hunter: 3.5, grave: 3.5, wreck: 4.5, bus: 7 };
  for (const s of sites) {
    const r = FLAT_SITES[s.type];
    if (!r) continue;
    const h0 = heightAt(s.x, s.z);
    const R = r + 5;
    const i0 = Math.max(0, Math.floor((s.x - R + MAP_HALF) / GRID_STEP));
    const i1 = Math.min(N - 1, Math.ceil((s.x + R + MAP_HALF) / GRID_STEP));
    const j0 = Math.max(0, Math.floor((s.z - R + MAP_HALF) / GRID_STEP));
    const j1 = Math.min(N - 1, Math.ceil((s.z + R + MAP_HALF) / GRID_STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * N + i;
        if (roadDist[k] < 3.5) continue;
        const d = Math.hypot(-MAP_HALF + i * GRID_STEP - s.x, -MAP_HALF + j * GRID_STEP - s.z);
        const t = 1 - smoothstep(r, R, d);
        heights[k] = lerp(heights[k], h0, t);
      }
    }
    s.h = h0;
  }
  return sites;
}

// what stands at each site: the places' props were all built before it (a site crowding one of them is left out)
export function buildSites({ rng, sites, heightAt, kit }) {
  const { props, Builder, door } = kit;
  const TRUNK_ZONE = ZONE.ROADSIDE;
  const placeProps = props.length; // (what the places built, before any site)
  for (const st of sites) {
    // a site is kept clear of the places' own solid props: a traffic queue or a farm's fence can reach past the 16 m
    // the site was kept from the place's middle, and its wreck or log pile then stood in theirs
    let crowded = false;
    for (let i = 0; i < placeProps && !crowded; i++) {
      const p = props[i];
      const def = PROPS[p.type];
      if (def && (def.boxes || def.cyls) && Math.hypot(p.x - st.x, p.z - st.z) < SITE_ROOM) crowded = true;
    }
    if (crowded) continue;
    const b = new Builder(st.x, st.z, st.ry, st.h ?? heightAt(st.x, st.z));
    b.zone = ZONE.FOREST;
    b.ground = true;
    const t = st.type;
    if (t === 'wreck') {
      const type = rng.chance(0.72) ? 'car_wreck' : 'pickup_truck';
      const ry = PI / 2 + rng.range(-0.5, 0.5) + (rng.chance(0.5) ? PI : 0);
      b.wreck(type, 0, 0, ry, { zone: TRUNK_ZONE });
      if (rng.chance(0.4)) b.prop('corpse', rng.range(-2.5, 2.5), -2.4, rng.range(0, 6), { nocollide: true });
      if (rng.chance(0.3)) b.loot(rng.range(-2, 2), 2.6);
      if (rng.chance(0.25)) b.prop('road_sign', 3.5, -3, 0);
    } else if (t === 'bus') {
      b.wreck('school_bus', 0, 0, PI / 2 + rng.range(-0.3, 0.3), { trunk: false });
      b.cont(CONT.DUFFEL, 0.5, -2.2, { prop: 'duffel_bag', ry: 0.3, nocollide: true, zone: TRUNK_ZONE });
      b.loot(-3, -2.4);
    } else if (t === 'roadblock') {
      // across the road: staggered barriers, a wreck, sandbags and a crate
      const b2 = new Builder(st.x, st.z, st.ry, heightAt(st.x, st.z));
      b2.ground = true;
      b2.zone = ZONE.FOREST;
      b2.prop('jersey_barrier', -1.8, -2, PI / 2 + PI / 2);
      b2.prop('jersey_barrier', 1.8, 2.5, PI / 2 + PI / 2, { seed: 1 });
      b2.prop('sandbags', -5.5, 3, 0.3);
      b2.wreck('car_wreck', 4.8, -5, 0.35, { zone: TRUNK_ZONE });
      b2.cont(CONT.CRATE, -5.8, -3.5, { prop: 'crate', ry: 0.4, zone: ZONE.CHECKPOINT });
      if (rng.chance(0.5)) b2.prop('body_bag', -4, 5.5, 1, { nocollide: true });
    } else if (t === 'camp') {
      b.prop('tent', 0, 1.5, rng.range(-0.3, 0.3));
      b.prop('campfire', 0.3, -2.2, 0, { nocollide: true, seed: 1 });
      b.prop('log_bench', 2.65, -2.2, PI / 2 + 0.2); // (its end clear of the fire's ring of stones)
      b.cont(CONT.DUFFEL, -1.9, -1.4, { prop: 'duffel_bag', ry: rng.range(0, 6), nocollide: true });
      if (rng.chance(0.5)) b.prop('lantern_post', -2.6, 1.8, 0);
      if (rng.chance(0.35)) b.prop('corpse', 2.5, 0.5, rng.range(0, 6), { nocollide: true });
      b.loot(1.2, -3.8);
      b.clear(0, 0, 5);
    } else if (t === 'stash') {
      b.cont(CONT.AMMO_BOX, 0, 0, { prop: 'military_crate', ry: 0.2 });
      b.prop('sandbags', 0.2, 1.4, 0.1);
      b.prop('sandbags', -2, 0, PI / 2 - 0.2, { seed: 1 });
      b.prop('barrel', 1.8, -0.4, 0);
      if (rng.chance(0.5)) b.prop('body_bag', -0.8, -2.2, 0.4, { nocollide: true });
      b.clear(0, 0, 4);
    } else if (t === 'shed') {
      b.ground = false;
      b.room(0, 0, 3.6, 3.2, 2.5, rng.chance(0.5) ? 'planks' : 'tin', { n: [door(1.8, 1.2)] }, { roof: 'flat', roofMat: 'tin' });
      b.cont(CONT.TOOLBOX, 0.9, 0.9, { prop: 'toolbox', ry: 0.3, nocollide: true });
      b.cont(CONT.SHELF, -1.15, 0.4, { prop: 'crate', ry: 0, h: 0.6 }); // (in off the wall: a crate is a metre square)
      b.prop('woodpile', 2.8, 0, PI / 2);
    } else if (t === 'hunter') {
      b.prop('hunting_stand', 0, 0, rng.range(0, 6));
      b.cont(CONT.DUFFEL, 1.3, -1.4, { prop: 'duffel_bag', ry: 0.5, nocollide: true });
      b.prop('bones', -1.8, 1.6, 0, { nocollide: true });
      if (rng.chance(0.5)) b.cont(CONT.CRATE, -1.6, -1.2, { prop: 'crate_small', ry: 0.3, h: 0.35, zone: ZONE.RANGER });
      b.clear(0, 0, 3.5);
    } else if (t === 'logpile') {
      b.cont(CONT.LOGPILE, 0, 0, { prop: 'log_pile', ry: rng.range(-0.3, 0.3) });
      b.prop('woodpile', 3.8, 2.2, 0.4);
      if (rng.chance(0.4)) b.wreck('tractor', -4.5, 3, 1.2, { trunk: false });
      b.clear(0, 0, 5);
    } else if (t === 'ruin') {
      b.ground = false;
      // burnt-out homestead: broken stone walls, chimney, charred beams
      const hw = 3.6;
      const hd = 3;
      b.box(0, 0, -hd, 2 * hw, 1.1, 0.35, 'stone', {});
      b.box(-hw, 0, 0, 0.35, 0.8, 2 * hd, 'stone', {});
      b.box(hw, 0, 1.2, 0.35, 1.3, 3.6, 'stone', {});
      b.box(-1.5, 0, hd, 4.2, 0.6, 0.35, 'stone', {});
      b.box(-hw + 0.6, 0, hd - 0.6, 1.1, 5.2, 1.1, 'stone', {});
      b.box(0.5, 1.3, 0.2, 6, 0.22, 0.22, 'charred', { rz: 0.25, collide: false });
      b.box(-0.8, 0.4, -1, 4.5, 0.2, 0.2, 'charred', { ry: 0.6, rz: -0.12, collide: false });
      b.box(0, 0, 0, 6.8, 0.06, 5.4, 'ash', { collide: false });
      b.cont(CONT.CABINET, 1.6, 2.3, { prop: 'cabinet', ry: PI });
      b.loot(-1.2, -1);
      b.clear(0, 0, 6);
    } else if (t === 'grave') {
      b.prop('grave_cross', 0, 1.4, rng.range(-0.2, 0.2));
      b.prop('grave_cross', 1.3, 1.5, rng.range(-0.2, 0.2));
      if (rng.chance(0.5)) b.prop('grave_cross', -1.3, 1.3, rng.range(-0.2, 0.2));
      b.prop('corpse', 0.6, -1.2, rng.range(0, 6), { nocollide: true });
      b.cont(CONT.DUFFEL, -1.2, -1.6, { prop: 'duffel_bag', ry: 0.9, nocollide: true });
      b.clear(0, 0, 3.5);
    }
  }
}

// Route 9 dressing: power poles along the highway, the odd sign / mailbox along county roads
export function dressRoads({ rng, roads, nearZone, rail, sites, kit }) {
  const { props, propBlocked, seatY, addPropColliders } = kit;
  for (const road of roads) {
    if (road.kind === ROAD.TRAIL) continue;
    const p = road.pts;
    const n = p.length / 2;
    for (let i = 10; i < n - 10; i++) {
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      if (Math.abs(x) > MAP_HALF - 8 || Math.abs(z) > MAP_HALF - 8) continue;
      if (nearZone(x, z, 10)) continue;
      if (rail && rail.dist(x, z) < 14) continue; // (nothing stands in a level crossing)
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl;
      const nz = tx / tl;
      const dir = Math.atan2(-tx, -tz);
      let tooClose = false;
      for (const s of sites) if (Math.hypot(s.x - x, s.z - z) < 12) tooClose = true;
      if (tooClose) continue;
      if (road.kind === ROAD.ASPHALT && i % 18 === 0) {
        const side = road.width + 3;
        const px = x + nx * side;
        const pz = z + nz * side;
        if (!propBlocked('power_pole', px, pz, dir)) {
          const py = seatY('power_pole', px, pz, dir);
          props.push({ type: 'power_pole', x: px, y: py, z: pz, ry: dir, seed: i });
          addPropColliders('power_pole', px, py, pz, dir, props[props.length - 1]);
        }
      } else if (i % 53 === 26) {
        const r = rng();
        const px = x + nx * (road.width + 2.2);
        const pz = z + nz * (road.width + 2.2);
        const type = r < 0.45 ? 'road_sign' : r < 0.7 ? 'mailbox' : null;
        const seed = type ? rng.int(0, 99) : 0; // (drawn for a sign whether or not it is placed: the stream stays as it was)
        if (type && !propBlocked(type, px, pz, dir)) {
          const py = seatY(type, px, pz, dir);
          props.push({ type, x: px, y: py, z: pz, ry: dir, seed });
          addPropColliders(type, px, py, pz, dir, props[props.length - 1]);
        }
      }
    }
  }
}
