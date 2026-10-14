// What is scattered over the mainland between its places (mainland.js), as on the island (world/roadside.js): the land
// a body walks to from the bridgehead, the roadside and countryside sites - wrecks, pile-ups, camps, stashes, sheds -,
// a farm, the road signs, and the hoardings and power poles along the main roads.
import { GRID_STEP, WATER_LEVEL } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { PROPS, collidersOf } from '../props.js';
import { smoothstep, lerp, clamp, hash2 } from '../rng.js';
import { COL } from '../collision.js';
import { ROAD } from '../layout.js';
import { house } from '../mainland-places.js';
import { PLACES } from '../mainland-layout.js';
import { SIZE, HALF, N, SITE_FLAT, JAM_EVERY, RIVER_HW, P } from './consts.js';

const PI = Math.PI;

// Every 4 m cell of dry ground outside the mountains that can be walked to from the bridgehead, the tunnels open (the
// workings under the river are not on it: the far side is reached through North Pass). What is scattered goes only
// there: nothing on an island of the sea or the lake, nothing in a pocket the cliffs close off.
// reachAt(x, z): is (x, z) on that land? (head: the bridgehead)
export function landReach({ head, heightAt, cliffAt }) {
  const RC4 = 4;
  const RN = Math.ceil(SIZE / RC4);
  const landReach = new Uint8Array(RN * RN);
  {
    const ok = (i, j) => {
      const x = -HALF + (i + 0.5) * RC4;
      const z = -HALF + (j + 0.5) * RC4;
      return heightAt(x, z) > WATER_LEVEL + 0.2 && cliffAt(x, z) < -0.5;
    };
    const q = new Int32Array(RN * RN);
    let tail = 0;
    const i0 = Math.floor((head.x + HALF) / RC4);
    const j0 = Math.floor((head.z + HALF) / RC4);
    landReach[j0 * RN + i0] = 1;
    q[tail++] = j0 * RN + i0;
    for (let h = 0; h < tail; h++) {
      const k = q[h];
      const i = k % RN;
      const j = (k - i) / RN;
      for (let m = 0; m < 4; m++) {
        const ni = i + (m === 0 ? 1 : m === 1 ? -1 : 0);
        const nj = j + (m === 2 ? 1 : m === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= RN || nj >= RN || landReach[nj * RN + ni] || !ok(ni, nj)) continue;
        landReach[nj * RN + ni] = 1;
        q[tail++] = nj * RN + ni;
      }
    }
  }
  const reachAt = (x, z) => landReach[clamp(Math.floor((z + HALF) / RC4), 0, RN - 1) * RN + clamp(Math.floor((x + HALF) / RC4), 0, RN - 1)] === 1;
  return reachAt;
}

// roadH: the height of the nearest road at every vertex (mainland.js); longClear, fits, extra: the city's kit's
// (mainland/citykit.js). Returns the sites, and builtNear(x, z, r): does anything built stand within r of (x, z)?
export function placeSites({ seed, rng, plan, ground, roadH, kit, longClear, fits, extra, homes, reachAt }) {
  const { inCity, onField, seaAt, lakeAt, riverAt, tunnelOf, cliffAt, passageW, passageE, zoneById } = plan;
  const { PIT, heights, roadDist, roads, heightAt, levelUnder, roadDistAt, inWater, nearZone } = ground;
  const { staticGrid, props, containers, seatY, propBlocked, Builder, door } = kit;
  // ---------------------------------------------------------------- roadside & countryside sites
  // What stands along the roads and out on the plain between the places, as on the island: a wreck, a camp, a
  // stash, a shed.
  const sites = [];
  // (not in a place, the city, the airfield, the water or a mountain, and well clear of the river and the map's edge)
  const adits = [passageW, passageE, P(PLACES.mineA), [zoneById[ZONE.PASSAGE].x + 6, zoneById[ZONE.PASSAGE].z - 22]]; // (the portals, and the sealed adits' mounds)
  const _sq = [];
  const builtNear = (x, z, r) => staticGrid.query(x, z, r, _sq).some((c) => !(c.flags & COL.TREE));
  const siteOk = (x, z) => reachAt(x, z) && Math.hypot(x - PIT.x, z - PIT.z) > PIT.r + 12 && adits.every(([ax, az]) => Math.hypot(x - ax, z - az) > 38) && !builtNear(x, z, 10) && !onField(x, z, 14) && lakeAt(x, z) < -16 && riverAt(x, z) > RIVER_HW + 14 && seaAt(x, z) < -12 && cliffAt(x, z) < -10 && !tunnelOf(x, z, 10) && !inCity(x, z, 26) && Math.abs(x) < HALF - 60 && Math.abs(z) < HALF - 60 && !inWater(x, z) && !nearZone(x, z, 26) && homes.every((o) => Math.hypot(o.x - x, o.z - z) > 18);
  // is a road other than `road` within d of (x, z)? (At a junction the ground is two roads': nothing is seated there.)
  // (the roads' points by 16 m cells: which roads have a point in each)
  const roadCells = new Map();
  roads.forEach((r, ri) => {
    for (let k = 0; k < r.pts.length; k += 2) {
      const key = Math.floor(r.pts[k] / 16) * 4096 + Math.floor(r.pts[k + 1] / 16);
      let set = roadCells.get(key);
      if (!set) roadCells.set(key, (set = []));
      if (set[set.length - 1] !== ri) set.push(ri);
    }
  });
  const otherRoad = (road, x, z, d) => {
    for (let i = Math.floor((x - d) / 16); i <= Math.floor((x + d) / 16); i++) {
      for (let j = Math.floor((z - d) / 16); j <= Math.floor((z + d) / 16); j++) {
        for (const ri of roadCells.get(i * 4096 + j) || []) {
          const r = roads[ri];
          if (r === road) continue;
          const p = r.pts;
          for (let k = 0; k < p.length; k += 2) if (Math.abs(p[k] - x) < d && Math.abs(p[k + 1] - z) < d) return true;
        }
      }
    }
    return false;
  };
  // (the boots of a pile-up: a wreck's colliders kept a stride from every boot there, and a boot only where a stride
  // behind it is clear of every wreck's)
  const STRIDE = 0.9;
  let jamProps = 0, jamConts = 0; // (where this pile-up's props and containers begin: only its own can box a boot in)
  const bootsClear = (type, x, z, ry) => {
    const mine = [0, 1, 2].flatMap((sd) => (collidersOf(type, sd)?.boxes || []).map(([lx, , lz, sx, , sz]) => ({ x: x + Math.cos(ry) * lx + Math.sin(ry) * lz, z: z - Math.sin(ry) * lx + Math.cos(ry) * lz, hx: sx / 2, hz: sz / 2, c: Math.cos(ry), s: Math.sin(ry), r: 0 })));
    for (let k = jamConts; k < containers.length; k++) {
      const o = containers[k];
      if (o.ctype !== CONT.TRUNK || Math.abs(o.x - x) > 8 || Math.abs(o.z - z) > 8) continue;
      const q = { x: o.x, z: o.z, hx: 0, hz: 0, c: 1, s: 0, r: STRIDE };
      if (mine.some((a) => kit.solidsMeet(a, q))) return false;
    }
    return true;
  };
  const bootRoom = (x, z) => {
    const q = { x, z, hx: 0, hz: 0, c: 1, s: 0, r: STRIDE };
    for (let k = jamProps; k < props.length; k++) {
      const p = props[k];
      if (Math.abs(p.x - x) > 8 || Math.abs(p.z - z) > 8 || p.nocollide) continue;
      for (const [lx, , lz, sx, , sz] of collidersOf(p.type, p.seed)?.boxes || []) {
        const c = Math.cos(p.ry), s2 = Math.sin(p.ry);
        if (kit.solidsMeet({ x: p.x + c * lx + s2 * lz, z: p.z - s2 * lx + c * lz, hx: sx / 2, hz: sz / 2, c, s: s2, r: 0 }, q)) return false;
      }
    }
    return true;
  };
  const siteFree = (x, z, gapTo) => sites.every((s) => Math.hypot(s.x - x, s.z - z) >= (s.type === 'jam' ? Math.max(gapTo, 48) : gapTo)); // (a jam is 60 m of road)
  // (a wreck of a pile-up is put down only clear of the colliders of every wreck already there, as they are, by a
  // hand's width: on a bend the cars of one lane come round into each other)
  const wreckClear = (type, x, z, ry) => {
    const box = (t, px, pz, pry, seed) => {
      const def = collidersOf(t, seed);
      const c = Math.cos(pry);
      const s2 = Math.sin(pry);
      const out = [];
      for (const [lx, , lz, sx, , sz] of def?.boxes || []) out.push({ x: px + c * lx + s2 * lz, z: pz - s2 * lx + c * lz, hx: sx / 2 + 0.1, hz: sz / 2 + 0.1, c, s: s2, r: 0 });
      for (const [lx, lz, r] of def?.cyls || []) out.push({ x: px + c * lx + s2 * lz, z: pz - s2 * lx + c * lz, hx: 0, hz: 0, c: 1, s: 0, r: r + 0.1 });
      return out;
    };
    const mine = [0, 1, 2].flatMap((seed) => box(type, x, z, ry, seed));
    for (const p of props) {
      if (Math.abs(p.x - x) > 14 || Math.abs(p.z - z) > 14) continue;
      for (const o of box(p.type, p.x, p.z, p.ry, p.seed)) for (const a of mine) if (kit.solidsMeet(a, o)) return false;
    }
    return true;
  };
  // The main roads first: every so often the traffic out of the city stopped for good - a dozen wrecks across both
  // lanes, a truck jack-knifed among them, what their people dropped as they ran
  for (const main of roads.filter((r) => r.kind === ROAD.ASPHALT && r.width === 3.6)) {
    const p = main.pts;
    let acc = JAM_EVERY; // (the first where there is first room for one)
    for (let i = 6; i < p.length / 2 - 6; i++) {
      acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      if (acc < JAM_EVERY || nearZone(x, z, 46) || inCity(x, z, 30) || onField(x, z, 30) || tunnelOf(x, z, 24) || riverAt(x, z) < RIVER_HW + 20 || homes.some((o) => Math.hypot(o.x - x, o.z - z) < 30)) continue;
      acc = rng.range(-30, 30);
      const tx = p[i * 2 + 4] - p[i * 2 - 4];
      const tz = p[i * 2 + 5] - p[i * 2 - 3];
      const b = new Builder(x, z, Math.atan2(-tx, -tz), heightAt(x, z));
      b.zone = ZONE.FOREST;
      b.ground = true;
      sites.push({ x, z, ry: b.ry, type: 'jam', road: ROAD.ASPHALT });
      [jamProps, jamConts] = [props.length, containers.length];
      const truck = rng.chance(0.5);
      const tx0 = rng.range(-0.6, 0.6);
      const tr = rng.chance(0.5) ? 0.5 : PI - 0.4;
      const ts = rng.int(0, 1);
      if (truck && !propBlocked('semi_truck', b.wx(tx0, 0), b.wz(tx0, 0), b.ry + tr) && longClear('semi_truck', b.wx(tx0, 0), b.wz(tx0, 0)) && !otherRoad(main, x, z, 18)) b.wreck('semi_truck', tx0, 0, tr, { trunk: false, seed: ts, zone: ZONE.ROADSIDE });
      // (both lanes, nose to tail: n lengths of it, a gap here and there where one got out)
      for (let n = rng.int(6, 9) * 2, k = 0; k < n; k++) {
        const along = ((k >> 1) - n / 4) * 6.3 + rng.range(-0.7, 0.7);
        const lane = (k % 2 ? 1 : -1) * rng.range(1.7, 2.3) + (rng.chance(0.14) ? (k % 2 ? 3 : -3) : 0); // (a few took to the verge)
        const t = rng();
        const ry = (k % 2 ? PI : 0) + rng.range(-0.35, 0.35);
        const trunk = rng.chance(0.5);
        const type = t < 0.4 ? 'car_wreck' : t < 0.68 ? 'car_burnt' : t < 0.86 ? 'pickup_truck' : t < 0.95 ? 'ambulance' : 'school_bus';
        if (!levelUnder(type, b.wx(lane, along), b.wz(lane, along), b.ry + ry) || propBlocked(type, b.wx(lane, along), b.wz(lane, along), b.ry + ry) || !wreckClear(type, b.wx(lane, along), b.wz(lane, along), b.ry + ry) || !longClear(type, b.wx(lane, along), b.wz(lane, along)) || otherRoad(main, b.wx(lane, along), b.wz(lane, along), 13)) continue;
        // (a boot is opened from behind: no wreck pulled up within a stride of one, nor one opened where a wreck stands
        // that close behind it - boxed in among them it could not be reached)
        const wx = b.wx(lane, along), wz = b.wz(lane, along);
        if (!bootsClear(type, wx, wz, b.ry + ry)) continue;
        const back = type === 'pickup_truck' ? 2.9 : 2.45;
        const boot = trunk && type !== 'car_burnt' && type !== 'ambulance' && type !== 'school_bus' && bootRoom(wx + Math.sin(b.ry + ry) * back, wz + Math.cos(b.ry + ry) * back);
        b.wreck(type, lane, along, ry, { trunk: boot, zone: ZONE.ROADSIDE });
      }
      b.prop('suitcases', rng.range(-5, 5), rng.range(-12, 12), rng.range(0, 6), { nocollide: true });
      b.prop('litter', rng.range(-4, 4), rng.range(-12, 12), rng.range(0, 6), { nocollide: true, seed: 1 });
      b.prop('corpse', rng.range(-6, 6), rng.range(-14, 14), rng.range(0, 6), { nocollide: true });
      b.cont(CONT.DUFFEL, 6.4, rng.range(-8, 8), { prop: 'duffel_bag', ry: rng.range(0, 6), nocollide: true, zone: ZONE.ROADSIDE });
    }
  }
  for (const road of roads) {
    if (road.length < 90 || road.name === 'track from the mines') continue; // (no roadside sites down the mines' track: before any draw, so what else the seed deals stays put)
    const p = road.pts;
    let acc = rng.range(20, 50);
    let sideOf = rng.chance(0.5) ? 1 : -1;
    for (let i = 2; i < p.length / 2 - 2; i++) {
      acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      if (acc < (road.kind === ROAD.TRAIL ? 60 : 36)) continue;
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const type = ['wreck', 'wreck', 'camp', 'stash', 'shed', 'wreck', 'crash', 'post', 'stop', 'graves'][rng.int(0, 9)];
      const off = road.width + (type === 'wreck' ? rng.range(2.5, 4) : rng.range(7, 10));
      const sx = p[i * 2] + (-tz / tl) * sideOf * off;
      const sz = p[i * 2 + 1] + (tx / tl) * sideOf * off;
      sideOf = -sideOf;
      // (not where a second road comes by: by a junction the ground is the roads', not the site's)
      if (!siteOk(sx, sz) || !siteFree(sx, sz, 30) || roadDistAt(sx, sz) < off - road.width - 1 || (type !== 'wreck' && roadDistAt(sx, sz) < 8.5) || otherRoad(road, sx, sz, 16)) continue;
      // (rh: the road's height by a wreck. It stands on a shoulder of the road, level with it - not on a shelf up the
      // bank of a cutting.)
      sites.push({ x: sx, z: sz, ry: Math.atan2((-tz / tl) * -sideOf, (tx / tl) * -sideOf), type, road: road.kind, rh: type === 'wreck' ? road.hs[i] : undefined });
      acc = rng.range(-10, 10);
    }
  }
  for (let a = 0; a < 6000 && sites.length < 300; a++) {
    const x = rng.range(-HALF + 70, HALF - 70);
    const z = rng.range(-HALF + 70, HALF - 70);
    if (!siteOk(x, z) || roadDistAt(x, z) < 22 || !siteFree(x, z, 38)) continue;
    sites.push({ x, z, ry: rng.range(0, PI * 2), type: ['camp', 'stash', 'shed', 'camp'][rng.int(0, 3)], road: 0 });
  }
  // level the ground under each (not the roads beside them), so a shed's walls and what stands by them sit true
  for (const st of sites) {
    if (st.type === 'jam') continue; // (it stands on the road)
    const h0 = st.rh ?? heightAt(st.x, st.z);
    const R = SITE_FLAT + 5;
    for (let j = Math.max(0, Math.floor((st.z - R + HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((st.z + R + HALF) / GRID_STEP)); j++) {
      for (let i = Math.max(0, Math.floor((st.x - R + HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((st.x + R + HALF) / GRID_STEP)); i++) {
        const k = j * N + i;
        if (roadDist[k] < 5 && st.rh === undefined) continue; // (clear of it: what stands on the road was seated on it as it is)
        // (a site by a road is a shoulder of it: by the road it follows the road's own fall, a cell at a time)
        heights[k] = lerp(heights[k], st.rh !== undefined && roadDist[k] < 9.5 ? roadH[k] - 0.05 : h0, 1 - smoothstep(SITE_FLAT, R, Math.hypot(-HALF + i * GRID_STEP - st.x, -HALF + j * GRID_STEP - st.z)));
      }
    }
    st.h = h0;
  }
  // (what a site has more of than it always had is dealt from dice of its own - sd - so nothing after it moves)
  const sd = (st, n) => hash2(Math.round(st.x * 8), Math.round(st.z * 8) + n * 7919, (seed ^ 0x51e5) | 0);
  // (...seated on its lowest corner: not where the ground under its middle stands well above that, on the slope out past
  // the site's levelled ground)
  const seatedTrue = (type, x, z, ry) => heightAt(x, z) - seatY(type, x, z, ry) <= 0.12 + (Math.hypot(PROPS[type].size[0], PROPS[type].size[2]) / 2) * 0.3;
  const put3 = (b, type, lx, lz, ry, seedv = 0) => fits(b, type, lx, lz, ry) && levelUnder(type, b.wx(lx, lz), b.wz(lx, lz), b.ry + ry) && seatedTrue(type, b.wx(lx, lz), b.wz(lx, lz), b.ry + ry) && b.prop(type, lx, lz, ry, { seed: seedv });
  for (const st of sites) {
    if (st.type === 'jam') continue;
    const b = new Builder(st.x, st.z, st.ry, st.h);
    b.zone = ZONE.FOREST;
    b.ground = true;
    if (st.type === 'wreck') {
      const t = rng();
      // (now and then a bus, burnt out where it went off the road)
      const bus = st.road === ROAD.ASPHALT && sd(st, 1) < 0.2;
      const wt = bus ? (sd(st, 2) < 0.5 ? 'school_bus' : 'city_bus') : t < 0.45 ? 'car_wreck' : t < 0.75 ? 'car_burnt' : 'pickup_truck';
      const wry = PI / 2 + rng.range(-0.5, 0.5);
      if (bus) {
        if (levelUnder(wt, st.x, st.z, st.ry + wry) && !propBlocked(wt, st.x, st.z, st.ry + wry) && longClear(wt, st.x, st.z)) b.wreck(wt, 0, 0, wry, { zone: ZONE.ROADSIDE, trunk: false, seed: 1 });
      } else if (levelUnder(wt, st.x, st.z, st.ry + wry)) b.wreck(wt, 0, 0, wry, { zone: ZONE.ROADSIDE, trunk: t < 0.45 || t >= 0.75 });
      if (rng.chance(0.4)) b.prop('corpse', rng.range(-2.5, 2.5), -2.4, rng.range(0, 6), { nocollide: true });
      if (rng.chance(0.3)) b.loot(rng.range(-2, 2), 2.6);
    } else if (st.type === 'camp') {
      b.prop('tent', 0, 1.5, rng.range(-0.3, 0.3));
      b.prop('campfire', 0.3, -2.2, 0, { nocollide: true, seed: 1 });
      b.prop('log_bench', 2.65, -2.2, PI / 2 + 0.2);
      b.cont(CONT.DUFFEL, -1.9, -1.4, { prop: 'duffel_bag', ry: rng.range(0, 6), nocollide: true });
      b.loot(1.2, -3.8);
      b.clear(0, 0, 5);
    } else if (st.type === 'crash') {
      // two that met, off the road: one burnt, their people still by them
      b.wreck(rng.chance(0.5) ? 'car_open' : 'van_wreck', -1.2, 0.4, PI / 2 + rng.range(-0.4, 0.4), { zone: ZONE.ROADSIDE, trunk: false, seed: rng.int(0, 3) });
      extra(b, 'car_burnt', 2.4, -1.6, rng.range(0, 6));
      b.prop('glass_shards', 0.6, -0.6, rng.range(0, 6), { nocollide: true });
      b.prop(rng.chance(0.5) ? 'skeleton' : 'corpse', rng.range(-3, 3), 2.6, rng.range(0, 6), { nocollide: true, seed: rng.int(0, 2) });
      b.prop('suitcases', rng.range(-3, 3), -3.2, rng.range(0, 6), { nocollide: true });
      if (rng.chance(0.5)) b.cont(CONT.DUFFEL, 3.6, 2.4, { prop: 'duffel_bag', ry: rng.range(0, 6), nocollide: true, zone: ZONE.ROADSIDE });
    } else if (st.type === 'post') {
      // a post the army held on the road: a nest, wire, their order on a trestle, what is left of them
      extra(b, 'sandbag_nest', 0, 0.6, PI);
      b.prop('mg_tripod', 0, 0.8, PI, { nocollide: true });
      extra(b, 'concertina', 0.4, -3.6, rng.range(-0.1, 0.1));
      extra(b, 'checkpoint_sign', -3.6, -2, PI + rng.range(-0.3, 0.3));
      b.cont(CONT.AMMO_BOX, 3.4, 1.2, { prop: 'military_crate', ry: 0.3, zone: ZONE.ROADSIDE }); // (no place's: see placeSchematics)
      for (let k = 0; k < 3; k++) b.prop(['skeleton', 'corpse', 'blood_pool'][k], rng.range(-3.6, 3.6), rng.range(-2.6, 3.4), rng.range(0, 6), { nocollide: true, seed: k });
      b.clear(0, 0, 5);
      // (on a made road, the checkpoint it was: barriers angled off the shoulder toward the road, their truck pulled
      // over, a floodlight, tank traps, the tent they slept in)
      if (st.road === ROAD.ASPHALT || sd(st, 3) < 0.5) {
        for (const [jx, jz, jr] of [[-6.5, -4.6, 0.5], [6.4, -4.4, -0.45]]) if (Math.abs(heightAt(b.wx(jx, jz), b.wz(jx, jz)) - st.h) < 0.1) put3(b, 'jersey_barrier', jx, jz, jr);
        // (their truck at one in two, the floodlight at one in three: models heavy for the GPU's memory)
        if (sd(st, 7) < 0.5) put3(b, 'army_truck', 8.5, 3.5, PI / 2 + (sd(st, 4) - 0.5) * 0.4, Math.floor(sd(st, 5) * 2));
        if (sd(st, 8) < 0.34) put3(b, 'floodlight_tower', -6.2, 1.8, 0.4);
        put3(b, 'tank_trap', -9.5, -2.4, sd(st, 6) * 3);
        put3(b, 'military_tent', -8.6, 6.6, 0.2);
        put3(b, 'sandbags', 3.6, -2.6, 0.1, 1);
      }
    } else if (st.type === 'stop') {
      // a bus stop out in the country: its shelter, a bench, what was left waiting
      b.prop('bus_shelter', 0, 0.8, PI);
      extra(b, 'trash_bin', 2.8, 0.4, 0);
      extra(b, 'street_bench', -3.4, 0.6, PI);
      for (let k = 0; k < 3; k++) b.prop(['suitcases', 'litter', 'skeleton'][k], rng.range(-3, 3), -1.6 - k * 0.6, rng.range(0, 6), { nocollide: true, seed: k });
      if (rng.chance(0.4)) b.loot(1.2, -1.4);
    } else if (st.type === 'graves') {
      // somebody buried theirs by the road
      for (let k = 0; k < 4; k++) {
        const gx = -2.7 + k * 1.8;
        b.prop('grave_cross', gx, 1.4 + rng.range(-0.2, 0.2), rng.range(-0.3, 0.3), { seed: k });
        b.box(gx, 0, 0.2, 0.8, 0.06, 1.9, 'earth', { collide: false });
      }
      b.prop('bones', 3.6, -1.2, 0, { nocollide: true });
      if (rng.chance(0.5)) b.cont(CONT.DUFFEL, -3.6, -1, { prop: 'duffel_bag', ry: 1, nocollide: true, zone: ZONE.ROADSIDE });
    } else if (st.type === 'stash') {
      b.cont(CONT.AMMO_BOX, 0, 0, { prop: 'military_crate', ry: 0.2 });
      b.prop('sandbags', 0.2, 1.4, 0.1);
      b.prop('sandbags', -2, 0, PI / 2 - 0.2, { seed: 1 });
      b.prop('barrel', 1.8, -0.4, 0);
      b.clear(0, 0, 4);
    } else {
      b.ground = false;
      b.room(0, 0, 3.6, 3.2, 2.5, rng.chance(0.5) ? 'planks' : 'tin', { n: [door(1.8, 1.2)] }, { roof: 'flat', roofMat: 'tin' });
      b.cont(CONT.TOOLBOX, 0.9, 0.9, { prop: 'toolbox', ry: 0.3, nocollide: true });
      b.cont(CONT.SHELF, -1.15, 0.4, { prop: 'crate', ry: 0, h: 0.6 });
      b.prop('woodpile', 2.8, 0, PI / 2);
    }
  }
  return { sites, builtNear };
}

// landmarks, K: mainland.js's; fits: the city's kit's (mainland/citykit.js)
export function buildFarm({ plan, ground, kit, landmarks, K, fits, homes, reachAt, sites, builtNear }) {
  const { inCity, onField, seaAt, lakeAt, riverAt, cliffAt, forestAt } = plan;
  const { heights, roadDist, roads, heightAt, levelUnder, roadDistAt, inWater, nearZone } = ground;
  const { Builder, door, gap } = kit;
  // A FARM on the city side, off a road where the woods leave open ground: the farmhouse, the barn with its doors
  // open, the silo, the round bales, the tractor left in the yard, a paddock's fence, the field in rows with its
  // scarecrow, the well. (The first open spot by a road the dice turn up; its ground levelled.)
  {
    let at = null;
    roads.forEach((road, ri) => {
      if (at || (road.kind !== ROAD.ASPHALT && road.kind !== ROAD.DIRT) || road.length < 300) return;
      const p = road.pts;
      for (let i = 4; i < p.length / 2 - 4 && !at; i += 6) {
        const tx = p[i * 2 + 2] - p[i * 2 - 2];
        const tz = p[i * 2 + 3] - p[i * 2 - 1];
        const tl = Math.hypot(tx, tz) || 1;
        for (const sd of [1, -1]) {
          const off = road.width + 36;
          const x = p[i * 2] + (tz / tl) * sd * off;
          const z = p[i * 2 + 1] - (tx / tl) * sd * off;
          if (!reachAt(x, z) || forestAt(x, z) > 0.5 || builtNear(x, z, 30) || nearZone(x, z, 30) || inCity(x, z, 50) || cliffAt(x, z) > -30 || seaAt(x, z) > -30 || lakeAt(x, z) > -25 || riverAt(x, z) < 45 || onField(x, z, 30) || Math.abs(x) > HALF - 80 || Math.abs(z) > HALF - 80) continue;
          // (its ground is levelled out to 40 m: clear of every site and of what a site puts down round it, a dozen metres)
          if (homes.some((o) => Math.hypot(o.x - x, o.z - z) < 45) || sites.some((st) => Math.hypot(st.x - x, st.z - z) < 54)) continue;
          let lo = Infinity, hi = -Infinity, wet = false;
          for (let dx = -26; dx <= 26; dx += 6.5) for (let dz = -26; dz <= 26; dz += 6.5) {
            const hh = heightAt(x + dx, z + dz);
            lo = Math.min(lo, hh);
            hi = Math.max(hi, hh);
            if (roadDistAt(x + dx, z + dz) < 6 || inWater(x + dx, z + dz)) wet = true;
          }
          if (wet || hi - lo > 4.5) continue;
          at = { x, z, h: (lo + hi) / 2, ry: Math.atan2((-tz / tl) * -sd, (tx / tl) * -sd) };
          break;
        }
      }
    });
    if (at) {
      const R = 32;
      for (let j = Math.max(0, Math.floor((at.z - R - 8 + HALF) / GRID_STEP)); j <= Math.min(N - 1, Math.ceil((at.z + R + 8 + HALF) / GRID_STEP)); j++) {
        for (let i = Math.max(0, Math.floor((at.x - R - 8 + HALF) / GRID_STEP)); i <= Math.min(N - 1, Math.ceil((at.x + R + 8 + HALF) / GRID_STEP)); i++) {
          const k = j * N + i;
          if (roadDist[k] < 5) continue;
          heights[k] = lerp(heights[k], at.h, 1 - smoothstep(R, R + 8, Math.hypot(-HALF + i * GRID_STEP - at.x, -HALF + j * GRID_STEP - at.z)));
        }
      }
      const b = new Builder(at.x, at.z, at.ry, at.h);
      b.zone = ZONE.ROADSIDE;
      b.yard = { x: at.x, z: at.z, flat: R };
      house(b, -12, -2, 0, 7, K, true);
      b.room(11, 2, 12, 16, 5.6, 'barn', { n: [gap(6, 4.2, 4.4)], s: [door(6, 1.3)] }, { roof: 'gable', roofH: 3.6, roofMat: 'tin_rust', floorMat: 'planks' });
      b.cont(CONT.CRATE, 14.5, 6, { prop: 'crate', ry: 0.2, ly: 0.12, seed: 1 });
      b.prop('hay_square', 7.4, 7.5, 0.1, { ly: 0.12, seed: 0 });
      b.loot(9, 4, 0.14);
      b.cyl(21, 0, 9, 2.4, 11, 'tin', { sides: 14 });
      b.cone(21, 11, 9, 2.6, 2.2, 'tin_rust', 14);
      b.clear(0, 0, R - 2);
      const put4 = (type, lx, lz, ry, seedv = 0) => fits(b, type, lx, lz, ry) && levelUnder(type, b.wx(lx, lz), b.wz(lx, lz), b.ry + ry) && b.prop(type, lx, lz, ry, { seed: seedv });
      for (const [lx, lz] of [[2, 12], [5, 13.5], [3.4, 16], [6.6, 16.6]]) put4('hay_round', lx, lz, lx * 0.7, Math.round(lx) & 1);
      put4('tractor', 1.5, 2, 0.9);
      put4('well', -20, 8, 0);
      put4('woodpile', -20, -4, PI / 2, 1);
      // the paddock's fence along the side of the yard, and the field behind it in rows, its scarecrow
      for (let lz = -12; lz <= 12; lz += 3) put4('fence', 27.5, lz, PI / 2, lz & 1);
      for (let r = 0; r < 5; r++) b.box(-6 + r * 0, -0.02, 20.5 + r * 2.2, 34, 0.08, 1.1, 'earth', { collide: false });
      put4('scarecrow', 4, 24.8, 0.4);
      landmarks.push({ x: at.x, z: at.z, name: 'Farm' });
    }
  }
}

export function postRoadSigns({ seed, plan, ground, kit, builtNear }) {
  const { inCity, onField, tunnelOf, cliffAt } = plan;
  const { roads, heightAt, roadDistAt, inWater } = ground;
  const { props, addPropColliders, propBlocked } = kit;
  // ROAD SIGNS down the made and the dirt roads, every quarter of a kilometre or so, on the verge where the traffic
  // on that side reads them (dice of their own: nothing else moves; none where something stands or a road crosses)
  roads.forEach((road, ri) => {
    if ((road.kind !== ROAD.ASPHALT && road.kind !== ROAD.DIRT) || road.length < 200) return;
    const p = road.pts;
    let acc = 60 + hash2(ri, 1, (seed ^ 0x5197) | 0) * 120;
    let side = hash2(ri, 2, (seed ^ 0x5197) | 0) < 0.5 ? 1 : -1;
    for (let i = 1; i < p.length / 2 - 1; i++) {
      acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      if (acc < 250) continue;
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const off = road.width + 2.2;
      const x = p[i * 2] + (tz / tl) * side * off;
      const z = p[i * 2 + 1] - (tx / tl) * side * off;
      const ry = Math.atan2(tx, tz) + (side > 0 ? PI : 0);
      if (inCity(x, z, 12) || onField(x, z, 4) || cliffAt(x, z) > -8 || inWater(x, z) || roadDistAt(x, z) < road.width + 1.2 || tunnelOf(x, z, 8) || propBlocked('road_sign', x, z, ry) || builtNear(x, z, 0.8) || Math.abs(heightAt(x, z) - heightAt(p[i * 2], p[i * 2 + 1])) > 1.2) continue;
      const y = heightAt(x, z);
      props.push({ type: 'road_sign', x, y, z, ry, seed: Math.floor(hash2(ri, i, (seed ^ 0x51a9) | 0) * 2) });
      addPropColliders('road_sign', x, y, z, ry, props[props.length - 1]);
      acc = hash2(ri, i + 3, (seed ^ 0x5197) | 0) * 60 - 30;
      side = -side;
    }
  });
}

// signs: the city's (mainland/citykit.js: a hoarding's face is one)
export function dressMainRoads({ plan, ground, kit, signs, homes, sites }) {
  const { inCity, onField, riverAt, tunnelOf, cliffAt } = plan;
  const { roads, heightAt, nearZone } = ground;
  const { props, addPropColliders, seatY, propBlocked } = kit;
  // hoardings along the main roads out of the city, on the side their power line is not: the army's, and what was
  // being sold
  for (const main of roads.filter((r) => r.kind === ROAD.ASPHALT && r.width === 3.6)) {
    const p = main.pts;
    const CELLS = ['evac', 'billboard_a', 'quarantine', 'billboard_b', 'evac'];
    let acc = 60;
    let n = 0;
    for (let i = 12; i < p.length / 2 - 12; i++) {
      acc += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      if (acc < 140 || nearZone(x, z, 16) || inCity(x, z, 30) || onField(x, z, 10) || riverAt(x, z) < 30 || tunnelOf(x, z, 16) || cliffAt(x, z) > -14) continue;
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const px = x - (-tz / tl) * (main.width + 5.4);
      const pz = z - (tx / tl) * (main.width + 5.4);
      const dir = Math.atan2(tx, tz) + 0.25; // (its face to what comes out of the city)
      if (propBlocked('billboard', px, pz, dir) || sites.some((s) => Math.hypot(s.x - px, s.z - pz) < 9) || homes.some((o) => Math.hypot(o.x - px, o.z - pz) < 16)) continue;
      acc = 0;
      const py = seatY('billboard', px, pz, dir);
      if (heightAt(px, pz) - py > 0.5 || py - heightAt(px, pz) > 0.05) continue; // (not on a slope its legs would stand down, nor over a dip)
      props.push({ type: 'billboard', x: px, y: py, z: pz, ry: dir, seed: i });
      addPropColliders('billboard', px, py, pz, dir, props[props.length - 1]);
      const cell = CELLS[n++ % CELLS.length];
      signs.push({ x: px - Math.sin(dir) * 0.3, y: py + 4.9, z: pz - Math.cos(dir) * 0.3, ry: dir, w: 5.4, h: 2.6, cell, far: true });
    }
  }
  // power poles along the main roads, where nothing stands in their way
  for (const main of roads.filter((r) => r.kind === ROAD.ASPHALT && r.width === 3.6)) {
    const p = main.pts;
    for (let i = 12; i < p.length / 2 - 12; i += 18) {
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      if (nearZone(x, z, 10) || onField(x, z, 0) || tunnelOf(x, z, 12) || cliffAt(x, z) > -12) continue;
      const tx = p[i * 2 + 2] - p[i * 2 - 2];
      const tz = p[i * 2 + 3] - p[i * 2 - 1];
      const tl = Math.hypot(tx, tz) || 1;
      const px = x + (-tz / tl) * (main.width + 3);
      const pz = z + (tx / tl) * (main.width + 3);
      const dir = Math.atan2(-tx, -tz);
      if (propBlocked('power_pole', px, pz, dir) || sites.some((s) => Math.hypot(s.x - px, s.z - pz) < 8) || homes.some((o) => Math.hypot(o.x - px, o.z - pz) < 14) || nearZone(px, pz, 22)) continue;
      const py = seatY('power_pole', px, pz, dir);
      if (heightAt(px, pz) - py > 0.4) continue; // (on the slope of a cutting or a rim it stood sunk to its knees)
      props.push({ type: 'power_pole', x: px, y: py, z: pz, ry: dir, seed: i });
      addPropColliders('power_pole', px, py, pz, dir, props[props.length - 1]);
    }
  }
}
