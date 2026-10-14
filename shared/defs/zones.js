// The places (ZONE) of both maps and their names. Numeric ids are part of the wire protocol and of saved games - do
// not renumber.
import { uniqueIds } from '../ids.js';

export const ZONE = uniqueIds('ZONE', {
  CAMP: 0, // the breakdown: your car on Route 9 (start)
  BARN: 1,
  DOCK: 2,
  GAS: 3,
  RANGER: 4,
  CABINS: 5,
  MILITARY: 6,
  CHURCH: 7,
  FOREST: 8,
  MOTEL: 9,
  SAWMILL: 10,
  TRAILERS: 11,
  VILLAGE: 12,
  CAMPGROUND: 13,
  CHECKPOINT: 14,
  QUARRY: 15,
  RELAY: 16,
  ROADSIDE: 17, // loot flavour for roadside wrecks / sites (not a place)
  SCRAPYARD: 18,
  SUMMERCAMP: 19,
  MINE: 20,
  LODGE: 21,
  DRIVEIN: 22,
  STATION: 23, // the depot on the railway
  CEMETERY: 24, // the graveyard behind St. Agnes
  CLINIC: 25,
  FAIR: 26,
  // the mainland (shared/mainland.js)
  BRIDGEHEAD: 27, // where the bridge comes ashore: act 2 starts here
  CITY: 28, // Port Calder, downtown
  INDUSTRIAL: 29, // Kessler Ironworks
  TERMINAL: 30, // Calder Field: the terminal and its tower
  HANGARS: 31, // ...its hangars, and the plane
  FUEL_DEPOT: 32, // ...its fuel depot
  SUBURB: 33, // Eastgate: the houses on the city's far side
  TRUCKSTOP: 34, // a truck stop on the road out to the airfield
  // ...and what lies about it, out over the plain (shared/mainland-places.js)
  QUARANTINE: 35, // a tent city behind wire, where the mainland's evacuees were held
  ROADBLOCK: 36, // the army's last line on Route 9, between the bridge and the city
  SUBSTATION: 37,
  WATERWORKS: 38, // a pump house under a water tower
  MARINA: 39, // on the lake
  TRAILERPARK: 40,
  SALVAGE: 41, // a breaker's yard
  MALL: 42, // a big-box store and its car park
  SCHOOL: 43,
  MAST: 44, // a radio station under its mast, on high ground
  MOTORINN: 45, // a motel on the highway
  GRAVEYARD: 46,
  LOGGING: 47,
  CRASH: 48, // an airliner that came down short of the runway
  WESTGATE: 49, // houses on the city's seaward side
  CONTAINERS: 50, // a freight yard of shipping containers
  FARM_A: 51,
  FARM_B: 52,
  // ...and more of it (the third pass)
  BOATWORKS: 53, // on the river's far bank, across from the city
  DRIVEIN_M: 54,
  FIREHOUSE: 55,
  GRAIN: 56, // a grain elevator
  DINER_M: 57,
  CARLOT: 58,
  STORAGE: 59, // rows of lock-ups
  EVAC: 60, // where the buses were to take the city's people from
  NURSERY: 61,
  MOTORPOOL: 62, // the Guard's trucks
  HELIPAD: 63,
  AGGREGATES: 64, // a gravel works: on Layout 12 (issue #232), the quarry
  // ...and the places of Layout 12 that none of those is (issue #232)
  NORTH_COAST: 65, // the village on the north coast: a church, houses, a pier
  OUTPOST: 66, // North Ridge Outpost: the radio tower, past North Pass
  SOUTH_FOREST: 67, // the campsites of South Forest
  PASSAGE: 68, // the South Passage Mines: the workings under the river, and their yard
  LIGHTHOUSE: 69, // on its islet off the south-west coast
});
export const MAINLAND_ZONES = [27, 69]; // the first and the last of the mainland's places

export const ZONE_NAMES = [
  'The Breakdown',
  'Miller Farm',
  'Blackwater Dock',
  'Route 9 Gas Station',
  'Ranger Lookout',
  'Hunting Cabins',
  'Crash Site',
  'St. Agnes Chapel',
  'The Woods',
  'Pinewood Motel',
  'Harlan Sawmill',
  'Shady Pines Trailers',
  'Hollow Creek',
  'Lakeside Campground',
  'Army Checkpoint',
  'Granite Quarry',
  'Relay Station',
  'Roadside',
  "Dutch's Salvage",
  'Camp Tamarack',
  'Blackrock Mine',
  'Elk Ridge Lodge',
  'Starlite Drive-In',
  'Whitlock Depot',
  'St. Agnes Cemetery',
  'Mercy Clinic',
  'Tri-County Fair',
  'The Bridgehead',
  'Town Center',
  'Industrial Docks',
  'Airport Terminal',
  'Airport Hangars',
  'Airport Fuel Depot',
  'North Suburbs',
  'Gas Station',
  'Camp Hollis Quarantine',
  'Route 9 Checkpoint',
  'Calder Substation',
  'Calder Waterworks',
  'Pine Lake Marina',
  'Sunset Acres',
  "Benny's Auto Salvage",
  'Gateway Plaza',
  'Calder Elementary',
  'WKCL Radio Mast',
  'Starlight Motor Inn',
  'Hillside Cemetery',
  'Dunmore Logging Camp',
  'Flight 212',
  'East Suburbs',
  'Calder Freight Yard',
  'Hale Farm',
  'Pruitt Farm',
  'Calder Boat Works',
  'Calder Drive-In',
  'Engine Company 9',
  'Halvorsen Grain',
  'Mile 4 Diner',
  "Honest Al's Autos",
  'U-Store Calder',
  'Evacuation Point Bravo',
  'Greenacre Nursery',
  'Guard Motor Pool',
  'Landing Zone Kilo',
  'Quarry',
  'North Coast Village',
  'North Ridge Outpost',
  'South Forest',
  'South Passage Mines',
  'Lighthouse',
];
