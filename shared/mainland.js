// The mainland: the second map of a run (act 2, shared/acts.js), built from the same seed as the island the team
// escaped from and with the same kit (worldkit.js), so it is drawn, walked and fought on by the code that runs the
// island. Its layout is "Mainland Layout 12" (issue #232), one to one: mainland-layout.js holds the picture's coast,
// islands, lake, river, mountains, tunnels, roads and places as fractions of the map square, and this file builds
// them at MAINLAND_SIZE (2048 m across). In short:
//
//   the sea and its islands along the west | the bridge from the island comes ashore at the Industrial Docks |
//   Town Center, the two Suburbs, North Coast Village, Pine Lake and the Gas Station on the city side |
//   The Ridge, a range of mountains north to south, and the river down its far side: nobody crosses either |
//   the airport on the far side, reached only by the north road (North Pass, a tunnel; North Ridge Outpost; East
//   Pass) or under the ground (South Forest, the Quarry, the South Passage Mines, under the river)
//
// What a seed changes is what stands in every place and on every lot, and everything scattered: never where a
// place, a road, the coast, the lake, the river or a mountain is.
//
// A world made here has every field createWorld's has (world.js); what the island has and this map does not (the
// railway, the fair, the clinic, the cemetery) is null. On top of those:
//   bridge   where the bridge is (bridge.js): the cutscene drives the car along it, and the client draws it
//   runway   the runway and what stands on it: { x, z, ry (its heading: the plane takes off along -Z turned by it),
//            z0, z1 (its ends along that line, from its middle), half (its half width), y, truck: { x, y, z, ry } }
//   car      is the plane: the thing this act's supplies go into and its final stand is fought at (plane: true)
//   partSpots[i].supply   which of the plane's parts may lie there: one (an index into PLANE_PARTS) at its own set
//            places, or any (HIDE.ANY) or any but the propeller (HIDE.SMALL) at the hiding places (mainland/hiding.js)
//   props[i].live   set on the car at the bridgehead and on the plane: the client draws those two itself, because its
//            cutscenes move them (the car drives to that very spot; the plane is swapped for the one that flies)
//   city     { x, z, pitch, grid, lots: [{ x, z, w, d, ry, what }] }: what was built on every lot of Town Center; and
//            what its buildings are drawn from (buildings, rooms, shells, heaps, fallen, pancakes, signs: see
//            "What the city is drawn from" in mainland/citykit.js, and client/render/citykit.js)
//   parts[i].hidden   a solid that is not drawn as the box it is (the kit draws that building, wall or heap)
//   river    { pts, hw, bridges, flow(x, z) }: its middle line, half its width, where a road crosses it, and its current
//   walls    the outline of every mountain, as the lines its hidden walls stand along: [[x, z, ...], ...]
//   cliffAt(x, z)   how far (x, z) is inside a mountain (m; negative outside it)
//   tunnels  [{ name, a: [x, z], b: [x, z], y0, y1, len }]: the road tunnels, mouth to mouth
//   mine     the South Passage Mines' workings (mine.js), under the river
import { GRID_STEP, WATER_LEVEL } from './constants.js';
import { ZONE, CONT } from './defs.js';
import { PROPS } from './props.js';
import { mulberry32, createNoise2D, clamp } from './rng.js';
import { createKit } from './worldkit.js';
import { WORLD } from './acts.js';
import { POS_SCALE_WIDE } from './protocol.js';
import { planBridge } from './bridge.js';
import { OUTLYING } from './mainland-places.js';
import { groundQueries } from './worldquery.js';
import { createCityKit } from './mainland/citykit.js';
import { cityBuildings } from './mainland/buildings.js';
import { buildCity } from './mainland/city.js';
import { buildDocks } from './mainland/docks.js';
import { buildHomes } from './mainland/homes.js';
import { buildRiverBridges, buildVillage, buildOutpost, buildLighthouse, buildCamps, buildBrokenBridge, buildTruckStop } from './mainland/places.js';
import { buildTunnels, buildWalls } from './mainland/mountains.js';
import { buildAirfield } from './mainland/airfield.js';
import { landReach, placeSites, buildFarm, postRoadSigns, dressMainRoads } from './mainland/sites.js';
import { sinkPassage, dressQuarryPit, buildPassageYard } from './mainland/passage.js';
import { scatterSpawns } from './mainland/spawns.js';
import { hidingPlaces } from './mainland/hiding.js';
import { mapMainland } from './mainland/fieldmap.js';
import { planMainland } from './mainland/plan.js';
import { layMainRoads } from './mainland/roads.js';
import { shapeMainland } from './mainland/terrain.js';
import { plantVegetation } from './mainland/vegetation.js';
import { SIZE, HALF, N, BLUFF, PITCH, GRID, QUAY_LX, QUAY_HZ, SMOKES, FIRES, RIVER_HW, RIVER_DEPTH, RIVER_FLOW, CREEK_HW, FX } from './mainland/consts.js';

const PI = Math.PI;

export function createMainland(seed) {
  const rng = mulberry32((seed ^ 0x3a17d) >>> 0); // (streams of its own: the island of the same seed draws from others)
  const nA = createNoise2D(seed + 11);
  const nB = createNoise2D(seed + 12);
  const nD = createNoise2D(seed + 14);
  const nE = createNoise2D(seed + 15);
  const nP = createNoise2D(seed + 16);
  // ---------------------------------------------------------------- the plan (mainland/plan.js)
  const plan = planMainland({ nP });
  const { city, zb, SHORE, head, seaAt, lakeAt, riverPts, riverAt, flow, creekP, tunnels, cliffAt, forestAt, docks, zones, zoneById, lake, ponds } = plan;
  let { seaMask, lakeMask, islets, mtnMask, cut, wallMask } = plan;

  // ---------------------------------------------------------------- terrain (mainland/terrain.js)
  const terrain = shapeMainland({ seed, nA, nB, nD, nE, nP, plan });
  const { peakCells, PIT, pitRamp, cityH, fieldH, zoneCells, flatCells, heights, roadDist, roadKind } = terrain;
  let { reliefGrid, roadH, roadDir } = terrain;

  // ---------------------------------------------------------------- roads (mainland/roads.js)
  const { roads, highway, heightAt } = layMainRoads({ rng, plan, terrain });
  // (is the ground under a prop's footprint level enough to set it down on: within 0.8 m corner to corner?)
  const levelUnder = (type, x, z, ry) => {
    const [sx, , sz] = PROPS[type]?.size || [2, 1, 4];
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [lx, lz] of [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]]) {
      const h = heightAt(x + c * lx + sn * lz, z - sn * lx + c * lz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    // (...and no hollow under its middle: it is seated on its lowest corner, and over a ditch it would hang in the air)
    return hi - lo < 0.8 && heightAt(x, z) > lo - 0.06;
  };
  const sampleGrid = (arr, x, z) => arr[clamp(Math.round((z + HALF) / GRID_STEP), 0, N - 1) * N + clamp(Math.round((x + HALF) / GRID_STEP), 0, N - 1)];
  const roadDistAt = (x, z) => sampleGrid(roadDist, x, z);
  const roadKindAt = (x, z) => sampleGrid(roadKind, x, z);
  const inWater = (x, z) => heightAt(x, z) < WATER_LEVEL + 0.35;
  const nearZone = (x, z, pad) => zones.find((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.flat + pad) || null;

  // ---------------------------------------------------------------- what it is built with
  const kit = createKit({ rng, heightAt, half: HALF });
  const { staticGrid, structGrid, parts, props, lootSpawns, containers, partSpots, openings, extraTrees, lights, roofs, clears, addPropColliders, seatY, propBlocked, Builder, door, win, gap } = kit;
  const place = (id, build) => {
    const zn = zoneById[id];
    const b = new Builder(zn.x, zn.z, zn.ry, zn.h);
    b.zone = id;
    b.yard = { x: zn.x, z: zn.z, flat: zn.flat - 2.5 }; // (what stands nearer the edge of the levelled ground than a cell of the heightfield stands on the ground as it is)
    build(b, zn);
  };
  // a hiding place of the plane's part `supply` (PLANE_PARTS[supply]) in the builder's frame
  const part = (b, supply, lx, lz, ly = 0.02) => {
    b.partSpot(lx, lz, ly);
    partSpots[partSpots.length - 1].supply = supply;
  };
  const spawnPoints = [];
  // where the gun crates stand for a game that starts on the mainland (acts.js MAINLAND_START): { x, z, ry }. Not
  // props: the game puts them down as crates (ENT.CRATE), and only for such a game
  const startCrates = [];
  // a window with the glass gone (a way in, over the sill), and a city window: as often broken as not
  const hole = (at, w = 1.2, y0 = 1.05, y1 = 2.0) => ({ at, w, y0, y1 });
  const cw = (...a) => (rng.chance(0.55) ? hole(...a) : win(...a));
  // what has grown since: a clump of weeds or brush at a spot of a builder's frame (they go in with the bushes)
  const weeds = [];
  const weed = (b, lx, lz, scale = 1, ly = null, variant = null) => weeds.push([b.wx(lx, lz), b.wz(lx, lz), scale, ly === null ? null : b.y0 + ly, variant]);
  // what the field map names inside a place (the city's hospital, its station...): { x, z, name }
  const landmarks = [];
  // columns of smoke and fires still burning (world.lights: the client's effects draw them, and they are what the
  // skyline is known by from the bridge): so many to a map, the first that ask
  let towers = 0; // (how many big towers have a name so far)
  let smokes = 0;
  let fires = 0;
  const smoke = (b, lx, ly, lz) => smokes++ < SMOKES && b.light(lx, ly, lz, 'smoke');
  const fire = (b, lx, ly, lz) => fires++ < FIRES && b.light(lx, ly, lz, 'fire');
  const afloat = (p) => {
    props[props.length - 1].afloat = true; // (a boat on the water: nothing is under it, and nothing should be)
    return p;
  };
  const K = { rng, door, win, gap, hole, afloat }; // (what a place of mainland-places.js is built with)

  // THE BRIDGEHEAD: the bluff the bridge comes ashore on. The car is where it stopped, the span behind it in the
  // water; a checkpoint somebody held here once, and gave up.
  const bridge = planBridge({ seed, z: zb, shore: SHORE, deckY: BLUFF });
  place(ZONE.BRIDGEHEAD, (b) => {
    // (local frame: -Z is east, inland; +Z is back out along the bridge; +X is north)
    // (live: the client draws these two itself - the crossing's cutscene drives the car to this very spot)
    b.prop('car', 0, 16, 0.08, { seed: 7 });
    props[props.length - 1].live = true;
    for (let i = 0; i < 8; i++) spawnPoints.push({ x: b.wx(-5 + (i % 4) * 3.2, -2 - Math.floor(i / 4) * 3), z: b.wz(-5 + (i % 4) * 3.2, -2 - Math.floor(i / 4) * 3) });
    // the gun crates: a row on the road behind where the team stands, a shorter one behind it (clear of the
    // sandbags at -7, -9 and the car wreck at 5.4, -14)
    for (const [lx, lz, ry] of [[-3.4, -8.4, 0.1], [-0.8, -8.6, -0.15], [1.8, -8.4, 0.2], [4.4, -8.6, -0.05], [-2.1, -11, 0.25], [0.5, -11.2, -0.2]]) startCrates.push({ x: b.wx(lx, lz), z: b.wz(lx, lz), ry: b.ry + ry });
    // what is left of the last span's end: the edge of the abutment, shut off
    for (const lx of [-3.6, 3.6]) b.prop('jersey_barrier', lx, 37.4, 0, { seed: 1 }); // (the car came through between them)
    b.prop('road_sign', -6.4, 30, PI, { seed: 3 });
    // the checkpoint
    b.prop('military_tent', 13, -6, PI / 2, { seed: 1 });
    b.prop('sandbags', -7, -9, 0.1, { seed: 0 });
    b.prop('sandbags', -9.4, -7, PI / 2 - 0.2, { seed: 1 });
    b.prop('sandbags', 7.4, 4, PI / 2, { seed: 0 });
    b.cont(CONT.AMMO_BOX, 9.4, -9.6, { prop: 'military_crate', ry: 0.3 });
    b.cont(CONT.DUFFEL, 8.6, -1.2, { prop: 'duffel_bag', ry: 0.7, nocollide: true });
    b.cont(CONT.CRATE, -11, 3, { prop: 'crate', ry: 0.2 });
    b.prop('barrel', -8.6, -11.4, 0, { seed: 2 });
    b.light(-8.6, 1.0, -11.4, 'embers');
    b.wreck('pickup_truck', -5.5, -19, 0.2, { seed: 1 });
    b.wreck('car_wreck', 5.4, -14, PI - 0.3, { seed: 2 });
    b.prop('jersey_barrier', 3.4, -20.5, 0.5, { seed: 2 });
    b.prop('streetlight', -6.5, -4, PI / 2, { seed: 0 });
    b.prop('body_bag', 15.5, 1.5, 0.3, { nocollide: true, seed: 0 });
    b.prop('body_bag', 16.6, 2.2, 0.2, { nocollide: true, seed: 1 });
    b.loot(-10, -4);
    b.loot(11, -3);
    b.loot(2, -8);
    b.clear(0, 6, 14);
  });

  // (what the stages in mainland/ read of the ground with its roads)
  const ground = { heights, roadDist, roads, cityH, fieldH, PIT, pitRamp, heightAt, levelUnder, roadDistAt, inWater, nearZone };

  // PORT CALDER: what its buildings are made with (mainland/citykit.js), what stands on a lot by what was dealt to it
  // (mainland/buildings.js), and the lots, the square, the streets and the harbour streets (mainland/city.js)
  const cityKit = createCityKit({ rng, heightAt, kit, smoke });
  const { buildings, rooms, shells, heaps, ships, fallenBits, pancakes, signs, solid, block, groundRoom, partition, jagged, heap, signAt, longClear, fits, extra } = cityKit;
  const lotBuilders = cityBuildings({ rng, kit, part, hole, cw, weed, landmarks, nextTower: () => towers++, smoke, fire, ck: cityKit });
  const { BUILD } = lotBuilders;
  const lots = buildCity({ seed, rng, plan, ground, kit, weed, landmarks, burning: () => fires, smoke, fire, ck: cityKit, lotBuilders });

  // THE BRIDGES: wherever a road crosses the river (mainland/places.js)
  const bridges = buildRiverBridges({ rng, roads, heightAt, kit });

  // INDUSTRIAL DOCKS (mainland/docks.js)
  buildDocks({ seed, zoneById, kit, place, hole, smoke, afloat, ck: cityKit });

  Object.assign(K, { block, groundRoom, partition, signAt, heap, extra, jagged, weed, fits, roadDistAt, heightAt, solid }); // (what the third pass's places are built with)

  // THE SUBURBS, THE STREETS ROUND TOWN CENTER AND NORTH COAST VILLAGE: their houses (mainland/homes.js)
  const homes = buildHomes({ seed, rng, plan, ground, kit, weed, K, fits });

  // NORTH COAST VILLAGE's church and harbour, NORTH RIDGE OUTPOST, THE LIGHTHOUSE, SOUTH FOREST's camps
  // (mainland/places.js)
  buildVillage({ seed, plan, ground, kit, afloat, BUILD });
  buildOutpost({ seed, rng, kit, place, part, extra });
  buildLighthouse({ heightAt, kit, place });
  buildCamps({ rng, plan, ground, kit, place });

  // THE ROAD TUNNELS' galleries and cuttings (mainland/mountains.js)
  buildTunnels({ plan, roads, kit, landmarks });

  // what the field map names that is no place: the range, the lake
  landmarks.push({ x: FX(0.668), z: FX(0.395), name: 'The Ridge', big: true }, { x: lake.x, z: lake.z + 30, name: 'Pine Lake', big: true });

  // THE MOUNTAINS' WALLS, nobody sees, along the foot of every cliff (mainland/mountains.js)
  const walls = buildWalls({ wallMask, heightAt, staticGrid });

  // East Pass's road ran on over the river to the Ridge: the bridge is gone (mainland/places.js)
  buildBrokenBridge({ roads, kit });

  // ...and the lesser places of the picture (mainland-places.js): the marina, the logging camp, the firehouse, the quarry's yard
  for (const zn of zones) if (OUTLYING[zn.id] && zn.id !== ZONE.WESTGATE) place(zn.id, (b) => OUTLYING[zn.id].build(b, K, zn));

  // MILE 9 TRUCK STOP (mainland/places.js)
  buildTruckStop({ kit, place });

  // CALDER FIELD (mainland/airfield.js)
  const { car, runway } = buildAirfield({ rng, plan, ground, kit, place, part, ck: cityKit });

  // ---------------------------------------------------------------- the land a body walks to (mainland/sites.js)
  const reachAt = landReach({ head, heightAt, cliffAt });

  // ---------------------------------------------------------------- roadside & countryside sites, a farm, road signs
  // (mainland/sites.js)
  const { sites, builtNear } = placeSites({ seed, rng, plan, ground, roadH, kit, longClear, fits, extra, homes, reachAt });
  buildFarm({ plan, ground, kit, landmarks, K, fits, homes, reachAt, sites, builtNear });
  postRoadSigns({ seed, plan, ground, kit, builtNear });

  // THE SOUTH PASSAGE MINES, the quarry's pit and the mine's yard (mainland/passage.js)
  const { mine, sealed } = sinkPassage({ seed, plan, ground, kit });
  dressQuarryPit({ seed, nE, zoneById, ground, kit, fits });
  buildPassageYard({ zoneById, kit, place, groundRoom, sealed });

  // hoardings and power poles along the main roads (mainland/sites.js)
  dressMainRoads({ plan, ground, kit, signs, homes, sites });

  // ---------------------------------------------------------------- vegetation (mainland/vegetation.js)
  const vegetation = plantVegetation({ seed, rng, plan, ground, roadKindAt, kit, weeds, walls, reachAt });
  const { occupied, zoneClear, crags, LIM } = vegetation;
  let { occ, partCells, clearCells, trees, rocks, bushes } = vegetation;

  // ---------------------------------------------------------------- spawns (mainland/spawns.js)
  const { resourceSpawns, hordeSpawns } = scatterSpawns({ rng, plan, ground, staticGrid, reachAt, occupied, zoneClear, LIM });

  // ---------------------------------------------------------------- the field map (mainland/fieldmap.js)
  const marks = mapMainland({ plan, PIT, landmarks, mine });

  // ---------------------------------------------------------------- queries
  // (worldquery.js, as on the island; heightAt is the terrain alone)
  const { floorAt, rayTerrain } = groundQueries({ heightAt, mine, rail: null, ceiling: 420 });
  const zoneAt = (x, z) => {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat + 8) return zn.id;
    return ZONE.FOREST;
  };
  const openingNear = (x, z, maxD = 1.2) => {
    let best = null;
    let bd = maxD;
    for (const o of openings) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const start = { x: head.x, z: head.z };
  hidingPlaces({ lootSpawns, partSpots, staticGrid, heightAt, zoneById });
  // (what only the building of the world needed goes now: every closure made here keeps all that any of them can see,
  // so a grid left in reach of one would be held as long as the world is)
  seaMask = lakeMask = islets = mtnMask = cut = wallMask = reliefGrid = roadH = occ = roadDir = null;
  const treesOut = new Float32Array(trees);
  const rocksOut = new Float32Array(rocks);
  const bushesOut = new Float32Array(bushes);
  trees = rocks = bushes = null;
  zoneCells.length = flatCells.length = 0;
  peakCells.clear();
  partCells = clearCells = null;

  return {
    seed,
    kind: WORLD.MAINLAND,
    size: SIZE,
    half: HALF,
    gridN: N,
    posScale: POS_SCALE_WIDE,
    heights,
    roadDist,
    roadKind,
    heightAt,
    floorAt,
    mine,
    clinic: null,
    darks: [],
    darkAt: () => 0,
    fair: null,
    rail: null,
    roadDistAt,
    roadKindAt,
    rayTerrain,
    isDeepWater: (x, z) => heightAt(x, z) < WATER_LEVEL - 0.95,
    zoneAt,
    zones,
    zoneById,
    roads,
    highway,
    lake,
    ponds,
    river: { pts: new Float32Array(riverPts), hw: RIVER_HW, bridges, at: riverAt, flow, speed: RIVER_FLOW, depth: RIVER_DEPTH },
    creek: { pts: creekP, hw: CREEK_HW },
    landmarks, // what the field map names inside a place: { x, z, name, label (where the name is written, if not there), city (inside the city: written zoomed in), big }
    marks, // the field map's marks: { kind, x, z } (client/ui/mapmainland.js)
    sea: { x: FX(0.03), south: FX(0.46), at: seaAt }, // the sea runs on past the map's west edge, and past its north and south edges west of x / south (the client lays water there); at: how far out on the water (m)
    lakeAt, // how far out on Pine Lake (m; negative on land)
    reachAt, // can (x, z) be walked to from the bridgehead over the ground (tunnels open, no swimming)? 4 m cells
    cliffAt, // how far inside a mountain (m; negative outside)
    forestAt, // how thick the forest is, 0 .. 1
    walls, // the lines the mountains' walls stand along
    paved: [{ x: docks.x + QUAY_LX + 44, z: docks.z, hx: 44, hz: QUAY_HZ, ry: 0 }], // the docks' apron, from the quay's edge to the warehouses: asphalt (client/render/terrain.js)
    tunnels: tunnels.map((t) => ({ name: t.name, a: t.a, b: t.b, y0: t.y0, y1: t.y1, len: t.len, s0: t.s0, s1: t.s1, cap: t.cap })), // cap: the mountain over the gallery, for the client to draw (s0, step, lat, n, m, h)
    trees: treesOut,
    rocks: rocksOut,
    ships, // the ships moored at the quays, drawn only: { type, x, y, z, ry } (client/render/ships.js)
    crags: new Float32Array(crags), // the cliffs' crags, drawn only: [x, y, z, scale, ry, variant] (client/render/foliage.js)
    bushes: bushesOut,
    parts,
    props,
    lights,
    roofs,
    staticGrid,
    structGrid,
    colliderGrids: [staticGrid, structGrid],
    lootSpawns,
    containers,
    partSpots,
    openings,
    openingNear,
    sites,
    resourceSpawns,
    hordeSpawns,
    spawnPoints,
    startCrates,
    start,
    car,
    cemetery: null,
    bridge,
    runway,
    city: { x: city.x, z: city.z, pitch: PITCH, grid: GRID, lots, buildings, rooms, shells, heaps, fallen: fallenBits, pancakes, signs },
    farms: [],
    homes: homes.map((o) => ({ x: o.x, z: o.z, ry: o.ry })),
  };
}
