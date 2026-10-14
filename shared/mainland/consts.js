// The mainland's measures (mainland.js and the stages in mainland/ read them): the map, the city's grid, the river,
// the mountains, the tunnels, the airport, and what is drawn for the city's lots.
import { GRID_STEP, WATER_LEVEL } from '../constants.js';
import { MAINLAND_SIZE } from '../acts.js';

export const SIZE = MAINLAND_SIZE;
export const HALF = SIZE / 2;
export const N = SIZE / GRID_STEP + 1;
export const FLOOR = WATER_LEVEL + 1.2; // soft floor of the land (only the sea, the lake and the river hold water)
export const BLUFF = 4.5; // the bridge comes ashore on a bluff this high (m over the water line it is BLUFF - WATER_LEVEL): the docks' quays are a little lower

// The city's grid: streets PITCH apart, each 12 m wide between the kerbs, GRID blocks each way.
export const PITCH = 56;
export const GRID = 6;
export const PAVED = PITCH - 7.4; // a block's paving is this far across: the lots, and a pavement round them out to the kerb of the roadway
export const CITY_R = (GRID * PITCH) / 2 + 18; // the levelled ground reaches this far from the middle of the city
export const BIG_BLOCKS = 6; // blocks that are one lot each, whatever the seed (the two tallest towers stand on them)...
export const QUAD_BLOCKS = 13; // ...and blocks of four small lots (the shops and stations the run needs go on those)
export const LONG_BLOCKS = 2; // ...and blocks of two long lots (the car park and the cinema go on those)
export const PAVE = 0.1; // a block's paving stands this far over the city's level (the roadway lies a little under it)
export const FLOOR_Y = 0.12; // ...and a room's floor this far (Builder.room's slab)
export const QUAY_LX = -150; // the docks' quay edge, m west of the middle of the place (where the picture's piers start)
export const QUAY_HZ = 128; // ...and how far it runs north and south of it
export const LEDGES = 0; // (the mountains' faces stepped in ledges, 0..1: mountainUp - off: they did not read from the ground, and the dead's grid and the hitbox sweep took the steps for standing room)
export const SETBACK = 1.2; // a building's front wall stands this far in from the edge of its lot
export const HALL_UP = 0.34; // the town hall stands on a plinth this high over the square, its portico up its steps (its floor no higher than the dead's grid walks onto - a slab over half a metre is a deck to server/nav.js)
export const CARPARK_DECK = 3.2; // from one deck of the multi-storey car park to the next
export const SITE_FLAT = 5.5; // the ground is levelled this far round a roadside site
export const ROADBLOCKS = 5; // stretches of street the army barricaded, and died at
export const JAMS = 6; // ...and stretches where the traffic stopped for good, bumper to bumper
export const SINKHOLES = 2; // ...and where the street fell in
export const SMOKES = 9; // columns of smoke standing over the city (world.lights 'smoke'), and FIRES still burning under them
export const FIRES = 3;
export const JAM_EVERY = 150; // a pile-up on a main road about this often (m)
// what is drawn for a lot nothing was dealt to, by weight: [kind, weight]
// (what a lot the run does not ask for has on it: as the picture draws the town, a building on nearly every one - a
// few ruins and burnt shells, an open lot or a car park here and there)
export const SMALL_LOTS = [['grocery', 0.9], ['diner', 0.7], ['pharmacy', 0.4], ['hardware', 0.5], ['liquor', 0.4], ['pawn', 0.3], ['laundry', 0.3], ['bakery', 0.3], ['bar', 0.4], ['books', 0.3], ['flats', 3.6], ['office', 0.9], ['ruin', 0.7], ['burnt', 1.0], ['gas', 0.25], ['green', 0.2]];
export const LONG_LOTS = [['terrace', 3], ['block', 3], ['carpark', 0.3], ['parking', 0.15], ['cinema', 0.3], ['warehouse', 1.2]];
export const LONGISH = new Set(['car_wreck', 'car_burnt', 'car_open', 'pickup_truck', 'van_wreck', 'ambulance', 'box_truck', 'city_bus', 'army_truck', 'semi_truck', 'police_car', 'taxi']); // (what the streets' traffic is)
export const BIG_LOTS = [['collapse', 1.4], ['tower', 1], ['depot', 0.5], ['parking', 0.15]];

// The river: fast water in a ravine. RIVER_HW is the half width it is measured against (riverAt below: the picture's
// own width is in the layout, and riverAt is shifted by it so that RIVER_HW is the bank everywhere).
export const RIVER_HW = 9;
export const RIVER_REACH = 48; // how far from its banks the river's distance is kept (m)
export const RIVER_BANK = 14; // its ravine: the ground comes down to the water over this much
export const RIVER_DEPTH = 3.6; // deep enough to be swept off your feet anywhere in it
export const RIVER_FLOW = 3.4; // m/s: the current (a survivor swims 2.4, 3.6 flat out)
export const BRIDGE_UP = 2.4; // a bridge's deck over the water
export const CREEK_HW = 2.2; // the creek north of the airport: shallow, walked through
// The mountains: their outline is a cliff (CLIFF metres within CLIFF_IN of the foot), and along the foot a wall
// nobody sees stands WALL_T thick, so that nothing climbs, drives or is shot over the cliff's lip. (A car at full
// speed moves 1.25 m in a tick: a thin wall would let it through.)
export const CLIFF = 18;
export const CLIFF_IN = 7;
// Over the cliff a mountain goes on up as a range: its mass rises with the distance in from the foot (MASS at the most,
// most of it within MASS_IN: the line furthest from every foot is the range's crest), and the peaks stand on that
// (PEAK at the most: ridged noise, sharp along its crests, with gullies down the faces). A range is 150-250 m high,
// its highest peaks near 300 m.
export const MASS = 150;
export const MASS_IN = 65;
export const PEAK = 110;
export const FOOTHILL = 18; // the ground outside a mountain rises toward its foot by up to this...
export const FOOTHILL_IN = 110; // ...over this far (the forested foothills under the cliffs)
export const WALL_T = 4;
// The road tunnels: a corridor cut through the mountain, CUT_HW either side of the road, a gallery in it TUNNEL_HW
// either side and TUNNEL_H high, and a cutting CUT_LEN long in front of either mouth.
export const CUT_HW = 8;
export const TUNNEL_HW = 5.6;
export const TUNNEL_H = 6.6;
export const CUT_LEN = 34;

// The airport (the local frame of its runway: the plane at its south end facing along -Z, the frame turned by AIR.ry
// as the picture's runway is turned off north)
export const RUNWAY_LEN = 320;
export const RUNWAY_HALF = 12;

// vegetation: the island's variants (TREE_TYPES / ROCK_TYPES in world.js, by index)
export const TREE_R = [0.42, 0.4, 0.38, 0.3, 0.3, 0.24, 0.34];
export const ROCK_R = [0.9, 1.2, 0.7];

// a point of the picture (fractions of the map square) -> world metres
export const FX = (f) => (f - 0.5) * SIZE;
export const P = (p) => [FX(p[0]), FX(p[1])];
