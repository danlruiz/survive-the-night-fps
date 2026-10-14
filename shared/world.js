// Deterministic world generation. The server and every client call createWorld(seed) and get
// bit-identical terrain, places, roads, vegetation, buildings, containers and colliders, so the map
// never has to be sent over the network - only its seed, and a new playthrough means a new seed.
//
// layout.js plans the valley for the seed (the course of Route 9, where your car broke down; the lake;
// which named places there are and where; which of them the roads join) and the modules in world/ build it, in
// this order (the random stream is drawn from in it): the terrain (world/terrain.js), a road network routed over it
// with A* (world/roads.js, world/router.js), the roadside / woodland sites (world/roadside.js: wrecks, camps, sheds,
// stashes... so every walk passes something worth searching), the places (world/places.js), the trees, rocks and
// bushes (world/vegetation.js) and the spawns (world/spawns.js).
import { MAP_HALF, MAP_SIZE, GRID_N } from './constants.js';
import { ZONE } from './defs.js';
import { mulberry32, createNoise2D } from './rng.js';
import { ROAD } from './layout.js';
import { darkAt } from './clinic.js';
import { planRail } from './rail.js';
import { createKit } from './worldkit.js';
import { WORLD } from './acts.js';
import { POS_SCALE } from './protocol.js';
import { shapeValley } from './world/terrain.js';
import { layRoads } from './world/roads.js';
import { pickSites, buildSites, dressRoads } from './world/roadside.js';
import { buildPlaces, sinkMine } from './world/places.js';
import { plantVegetation } from './world/vegetation.js';
import { scatterSpawns } from './world/spawns.js';
import { groundQueries, zoneAtIn, openingNearIn, deepWaterOf } from './worldquery.js';

export { ROAD };
export { TREE_TYPES, ROCK_TYPES } from './world/vegetation.js';

export function createWorld(seed) {
  const rng = mulberry32(seed ^ 0x5eed);
  const noise = { nA: createNoise2D(seed + 1), nB: createNoise2D(seed + 2), nC: createNoise2D(seed + 3), nD: createNoise2D(seed + 4), nE: createNoise2D(seed + 5) };

  // ---------------------------------------------------------------- layout + terrain
  const { zones, lake, ponds, hwyAnchors, links, railPlan, zoneById, nearZone, edgeRise, heights, rawH } = shapeValley(seed, noise);

  // the railway (rail.js; null on a map without one): the line gets its heights before any road does, since every
  // road that crosses it meets it on the level
  const rail = planRail(railPlan, { seed, depot: zoneById[ZONE.STATION], rawH, edgeRise });

  // ---------------------------------------------------------------- roads (flattened into the heightfield)
  const { roads, highway, roadDist, roadKind, roadDir, heightAt, roadDistAt, roadKindAt } = layRoads({ rng, ...noise, zones, zoneById, nearZone, hwyAnchors, links, heights, rawH, rail });

  // ---------------------------------------------------------------- roadside & woodland sites
  const sites = pickSites({ rng, roads, zoneById, nearZone, lake, rail, heights, heightAt, roadDist, roadDistAt });

  // ---------------------------------------------------------------- colliders + building parts
  // (worldkit.js: the grids, the lists the world hands on and the Builder that fills them)
  const kit = createKit({ rng, heightAt, half: MAP_HALF });
  const { staticGrid, structGrid, parts, props, lootSpawns, containers, partSpots, openings, lights, roofs } = kit;

  // ---------------------------------------------------------------- places
  const { car, spawnPoints, cemetery, darks, clinic, fair } = buildPlaces({ seed, rng, zoneById, heightAt, rail, roads, kit });

  // ---------------------------------------------------------------- the mine: its portals, and what is down there
  const mine = sinkMine({ seed, zones, zoneById, heights, heightAt, roadDistAt, rail, sites, kit });

  // ---------------------------------------------------------------- roadside & woodland sites
  buildSites({ rng, sites, heightAt, kit });
  dressRoads({ rng, roads, nearZone, rail, sites, kit });

  // ---------------------------------------------------------------- vegetation
  const { trees, rocks, bushes, zoneClear, inLake, occupied } = plantVegetation({ rng, nE: noise.nE, zones, zoneById, heightAt, roads, roadDistAt, roadKindAt, kit });

  // ---------------------------------------------------------------- spawns
  const { resourceSpawns, hordeSpawns } = scatterSpawns({ rng, seed, car, lootSpawns, heightAt, zoneClear, inLake, occupied });

  // ---------------------------------------------------------------- queries
  const { floorAt, rayTerrain } = groundQueries({ heightAt, mine, rail, ceiling: 70 });

  return {
    seed,
    kind: WORLD.ISLAND, // which of the run's two maps this is (acts.js): the island, where the car broke down
    size: MAP_SIZE, // metres a side: everything that walks, draws or maps the world reads these, not the constants
    half: MAP_HALF,
    gridN: GRID_N, // heightfield vertices a side (GRID_STEP m apart)
    posScale: POS_SCALE, // what a metre is in a position on the wire (protocol.js usePos)
    heights,
    roadDist,
    roadKind,
    roadDir,
    heightAt,
    floorAt,
    mine,
    clinic, // Mercy Clinic (clinic.js), or null on a map without it
    darks,
    darkAt: (x, y, z) => darkAt(darks, x, y, z), // how dark it is there at noon: 0 in daylight .. 1 (clinic.js)
    fair,
    rail,
    roadDistAt,
    roadKindAt,
    rayTerrain,
    isDeepWater: deepWaterOf(heightAt),
    zoneAt: zoneAtIn(zones),
    zones,
    zoneById,
    roads,
    highway,
    lake,
    ponds,
    trees: new Float32Array(trees),
    rocks: new Float32Array(rocks),
    bushes: new Float32Array(bushes),
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
    openingNear: openingNearIn(openings),
    sites,
    resourceSpawns,
    hordeSpawns,
    spawnPoints,
    start: car, // where a run on this map begins, and where someone who joins it with no team to join is put
    car,
    cemetery,
  };
}
