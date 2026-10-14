// Procedural world props. createProp(type, seed) -> THREE.Group of plain Meshes (shared geometry + shared
// materials from materials.js), origin at ground centre of the footprint, FRONT facing -Z.
// Footprints / sizes follow shared/props.js.
import { MeshBuilder, partsToGroup, makeRng } from '../materials.js';
import { FIXTURE_PROPS } from './fixtures.js';
import { buildNestLitter } from './mountedgun.js';
import { STREET_PROPS, STREET_VARIANTS } from './props-street.js';
import { INTERIOR_PROPS, INTERIOR_VARIANTS } from './props-interior.js';
import { AIRCRAFT_PROPS } from './aircraft.js';
import { VEHICLE_PROPS, VEHICLE_VARIANTS } from './props-vehicles.js';
import { MAINLAND_PROPS, MAINLAND_VARIANTS } from './props-mainland.js';
import { OUTDOOR_PROPS, OUTDOOR_VARIANTS } from './props-outdoor.js';
import { CONTAINER_PROPS, CONTAINER_VARIANTS } from './props-containers.js';
import { ROADSIDE_PROPS, ROADSIDE_VARIANTS } from './props-roadside.js';
import { typeHash } from './propkit.js';

export { createQuestPlane, createFlightPlane } from './aircraft.js';
export { DRIVE_CAR_SEATS, createDriveCar } from './props-vehicles.js';

const cache = new Map();

// number of cached visual variants per prop (seed % n)
const VARIANTS = {
  mg_tripod: 1,
  // the aircraft of Calder Field (aircraft.js, lightplane.js)
  plane_wreck: 1, light_plane: 2,
  // the island's (props-outdoor.js, props-containers.js, props-roadside.js), the vehicles, the mainland, the city's
  // streets and rooms (props-vehicles.js, props-mainland.js, props-street.js, props-interior.js)
  ...OUTDOOR_VARIANTS, ...CONTAINER_VARIANTS, ...ROADSIDE_VARIANTS, ...VEHICLE_VARIANTS, ...MAINLAND_VARIANTS, ...STREET_VARIANTS, ...INTERIOR_VARIANTS,
};

/** @returns {THREE.Group} */
export function createProp(type, seed = 0) {
  const fn = BUILD[type];
  if (!fn) throw new Error(`createProp: unknown prop '${type}'`);
  const v = propVariant(type, seed);
  const key = `${type}:${v}`;
  let parts = cache.get(key);
  if (!parts) {
    const b = new MeshBuilder(typeHash(type) + v * 7919);
    fn(b, makeRng(typeHash(type) * 31 + v * 977 + 5), v);
    parts = b.build();
    cache.set(key, parts);
  }
  const g = partsToGroup(parts, type);
  g.userData.propType = type;
  return g;
}

// which of its type's models a prop of this seed is drawn as (two props of one variant are the same model)
export function propVariant(type, seed = 0) {
  const n = VARIANTS[type] ?? 3;
  return (((seed | 0) % n) + n) % n;
}

// (the builders are in files of their own: the chapel bell and the radio set, the vehicles, the mainland's props, the
// city's street furniture and what is in its rooms, the aircraft of Calder Field, and the island's props)
const BUILD = { ...FIXTURE_PROPS, ...VEHICLE_PROPS, ...MAINLAND_PROPS, ...STREET_PROPS, ...INTERIOR_PROPS, ...AIRCRAFT_PROPS, ...OUTDOOR_PROPS, ...CONTAINER_PROPS, ...ROADSIDE_PROPS };

// the mounted gun's nest: what lies at its feet (the gun and its tripod are an entity: models/mountedgun.js)
BUILD.mg_tripod = buildNestLitter;
