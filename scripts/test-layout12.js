// Mainland Layout 12 (issue #232): the rules the second map is built to, on a few seeds.
//   - every named place of the picture is where the picture has it (within TOL of its point at the map's scale), and
//     can be walked to from the bridgehead (the lighthouse is swum to)
//   - the airport is reached only by the North Pass road or the mines: with North Pass shut and no way through the
//     ground, a flood fill from the bridgehead over the dead's nav grid (server/nav.js: what a body can walk on) never
//     reaches the runway - on foot, by car (where a car goes a body goes), or swimming (the sea and Pine Lake are
//     swum; the river is not: below) - and with North Pass open it does; the South Passage Mines join the two sides
//   - the river kills: a survivor in it is carried downstream and drowns in seconds, swimming for the far bank or not
//     (the real server, in-process); a car driven into it is lost
//   - the dead follow the same walls: the nav grid is shut along the foot of every mountain and over the river, and
//     the far side has dead of its own to come from (horde spawns no walk from the bridgehead reaches)
//   - neither route alone gets every part: the flight radio is on the north road (a short way off it), the hydraulic
//     pump down in the passage under the river; going north passes the radio and not the pump, going south the pump
//     and not the radio
//   - a solo can run the whole loop (city - north - airport - mines - quarry - city) in the days the act gives: the
//     times on foot, by car and by moped are printed (scripts/perf and the pull request quote them)
// usage: node scripts/test-layout12.js [--seeds 1-3]
import { createMainland } from '../shared/mainland.js';
import { PLACES } from '../shared/mainland-layout.js';
import { Nav } from '../server/nav.js';
import { Game } from '../server/game.js';
import { ZONE, ZONE_NAMES, KILLER } from '../shared/defs.js';
import { WORLD, ARRIVAL_DAY, MAINLAND_DAY_MORE, MAINLAND_SIZE } from '../shared/acts.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader, qangle16, qpitch, writeInput } from '../shared/protocol.js';
import { BTN, SERVER_TICK_RATE, STAMINA_MAX, NIGHT_LENGTH, WALK_SPEED, dayLength } from '../shared/constants.js';
import { groundAt } from '../shared/collision.js';
import { inRiver, RIVER_DPS } from '../shared/swim.js';
import { VEHICLES, VEH, stepVehicle } from '../shared/vehicles.js';
import { ROAD } from '../shared/layout.js';

const arg = process.argv.indexOf('--seeds');
const spec = arg > 0 ? process.argv[arg + 1] : '1-3';
const SEEDS = spec.includes('-') ? Array.from({ length: +spec.split('-')[1] - +spec.split('-')[0] + 1 }, (_, i) => +spec.split('-')[0] + i) : spec.split(',').map(Number);

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};
const at = (p) => [(p[0] - 0.5) * MAINLAND_SIZE, (p[1] - 0.5) * MAINLAND_SIZE];
const TOL = 64; // m: how far a place may stand from the picture's point (Town Center's grid is a little bigger than its ring)
const FOOT = 5.4; // m/s a survivor keeps up over a long way (walking, with the sprint their stamina allows)
const CAR = { asphalt: 18, dirt: 11 }; // m/s a car keeps up on a road of each kind, bends and all
const MOPED = { asphalt: 13, dirt: 9 };

// ---- grids over the nav grid: distances (in metres, diagonals included) from a point, with cells shut
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
function field(nav, blocked, x, z, cost = null) {
  const S = nav.size;
  const D = new Float32Array(S * S).fill(Infinity);
  const k0 = Math.floor(z + nav.half) * S + Math.floor(x + nav.half);
  // (Dijkstra on a binary heap of typed arrays: a cell may be in it more than once, the stale entries skipped)
  let cap = 1 << 20;
  let hk = new Int32Array(cap);
  let hd = new Float32Array(cap);
  let n = 0;
  const push = (k, d) => {
    if (n === cap) {
      cap *= 2;
      const k2 = new Int32Array(cap);
      const d2 = new Float32Array(cap);
      k2.set(hk);
      d2.set(hd);
      hk = k2;
      hd = d2;
    }
    let i = n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hd[p] <= d) break;
      hk[i] = hk[p];
      hd[i] = hd[p];
      i = p;
    }
    hk[i] = k;
    hd[i] = d;
  };
  const pop = () => {
    const k = hk[0];
    const lk = hk[--n];
    const ld = hd[n];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && hd[c + 1] < hd[c]) c++;
      if (hd[c] >= ld) break;
      hk[i] = hk[c];
      hd[i] = hd[c];
      i = c;
    }
    hk[i] = lk;
    hd[i] = ld;
    return k;
  };
  D[k0] = 0;
  push(k0, 0);
  while (n) {
    const d0 = hd[0];
    const k = pop();
    const d = D[k];
    if (d0 > d) continue;
    const i = k % S;
    const j = (k - i) / S;
    for (let m = 0; m < 8; m++) {
      const ni = i + DI[m];
      const nj = j + DJ[m];
      if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
      const nk = nj * S + ni;
      if (blocked[nk] || nav.edge[k] & (1 << m)) continue;
      if (m >= 4 && (blocked[k + DI[m]] || blocked[k + DJ[m] * S])) continue;
      const nd = Math.fround(d + (m >= 4 ? Math.SQRT2 : 1) * (cost ? cost[nk] : 1)); // (as it is kept: a float32)
      if (nd < D[nk]) {
        D[nk] = nd;
        push(nk, nd);
      }
    }
  }
  // the least of it within r of (px, pz)
  return (px, pz, r = 3) => {
    let best = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = Math.floor(px + nav.half) + di;
      const j = Math.floor(pz + nav.half) + dj;
      if (i >= 0 && j >= 0 && i < S && j < S) best = Math.min(best, D[j * S + i]);
    }
    return best;
  };
}
// the cells of a tunnel's road between its mouths, out to its walls
function tunnelCells(nav, t) {
  const S = nav.size;
  const out = new Uint8Array(S * S);
  const len = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
  const dx = (t.b[0] - t.a[0]) / len;
  const dz = (t.b[1] - t.a[1]) / len;
  for (let s = t.s0; s <= t.s1; s += 0.5) {
    for (let lat = -9; lat <= 9; lat += 0.5) {
      const x = t.a[0] + dx * s - dz * lat;
      const z = t.a[1] + dz * s + dx * lat;
      const i = Math.floor(x + nav.half);
      const j = Math.floor(z + nav.half);
      if (i >= 0 && j >= 0 && i < S && j < S) out[j * S + i] = 1;
    }
  }
  return out;
}
const or = (a, b) => {
  const o = new Uint8Array(a.length);
  for (let k = 0; k < a.length; k++) o[k] = a[k] | b[k];
  return o;
};

for (const seed of SEEDS) {
  const tag = `seed ${seed}:`;
  const w = createMainland(seed);
  const nav = new Nav(w);
  const S = nav.size;
  const head = [w.start.x, w.start.z];
  const r = w.runway;
  const runway = [r.x, r.z];
  const mine = w.mine;

  // ---- the places, where the picture has them
  const zp = (id) => [w.zoneById[id].x, w.zoneById[id].z];
  const pass = w.tunnels.find((t) => t.name === 'North Pass');
  const east = w.tunnels.find((t) => t.name === 'East Pass');
  const mid = (t) => [t.a[0] + ((t.b[0] - t.a[0]) * (t.s0 + t.s1)) / 2 / t.len, t.a[1] + ((t.b[1] - t.a[1]) * (t.s0 + t.s1)) / 2 / t.len];
  const places = [
    ['The bridgehead, where the bridge lands', [w.bridge.x1, w.bridge.z], [0.2, 0.443]],
    ['Industrial Docks', zp(ZONE.INDUSTRIAL), [0.22, 0.565]],
    ['Town Center', [w.city.x, w.city.z], [0.33, 0.462]],
    ['the North Suburbs', zp(ZONE.SUBURB), PLACES.suburbsNE],
    ['the East Suburbs', zp(ZONE.WESTGATE), PLACES.suburbsE],
    ['North Coast Village', zp(ZONE.NORTH_COAST), [0.215, 0.14]],
    ['Pine Lake (deep there)', [w.lake.x, w.lake.z], PLACES.lake],
    ['the Gas Station', zp(ZONE.TRUCKSTOP), [0.507, 0.6]],
    ['North Pass, the tunnel', mid(pass), [0.745, 0.178]],
    ['North Ridge Outpost', zp(ZONE.OUTPOST), [0.905, 0.16]],
    ['East Pass, the tunnel', mid(east), [0.813, 0.453]],
    ['the airport: the middle of its runway', runway, [0.8725, 0.525]],
    ['South Forest, its first camp', zp(ZONE.SOUTH_FOREST), PLACES.camp1],
    ['the Quarry: its pit', [w.zoneById[ZONE.AGGREGATES].x, w.zoneById[ZONE.AGGREGATES].z], [0.585, 0.834]],
    ['the South Passage Mines: the passage\'s west mouth', [mine.portals[0].x, mine.portals[0].z], PLACES.mineB],
    ['...its east mouth', [mine.portals[1].x, mine.portals[1].z], [0.8, 0.805]],
    ['...and its yard', zp(ZONE.PASSAGE), PLACES.spm],
    ['the lighthouse', zp(ZONE.LIGHTHOUSE), PLACES.lighthouse],
  ];
  const off = places.map(([name, p, f]) => [name, Math.hypot(p[0] - at(f)[0], p[1] - at(f)[1])]).filter(([, d]) => d > TOL);
  check(`${tag} every named place of the picture is where the picture has it (within ${TOL} m)`, !off.length && w.isDeepWater(w.lake.x, w.lake.z), off.map(([n, d]) => `${n} ${d.toFixed(0)} m off`).join('; '));

  // ---- the two ways in
  const shut = tunnelCells(nav, pass);
  const open = nav.blocked;
  const closed = or(open, shut);
  const fromOpen = field(nav, open, ...head);
  const fromShut = field(nav, closed, ...head);
  check(`${tag} with North Pass open the runway is walked to from the bridgehead`, Number.isFinite(fromOpen(...runway, 8)), `${fromOpen(...runway, 8).toFixed(0)} m`);
  check(`${tag} with North Pass shut (and the mines: the nav grid has no way through the ground) the runway is never reached on foot - nor by car`, !Number.isFinite(fromShut(...runway, 10)));
  // swimming: the sea and Pine Lake are water a survivor swims; the river is not (it kills: below). The walls stay.
  const dry = new Nav({ ...w, isDeepWater: () => false }); // (the same grid with nothing shut for being water)
  const swim = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i - nav.half + 0.5;
    const z = j - nav.half + 0.5;
    swim[j * S + i] = dry.blocked[j * S + i] || w.river.at(x, z) < w.river.hw + 1.5 || shut[j * S + i] ? 1 : 0;
  }
  const fromSwim = field(dry, swim, ...head);
  check(`${tag} ...nor swimming the sea and Pine Lake`, !Number.isFinite(fromSwim(...runway, 10)));
  // the passage: its west mouth is on the side the bridgehead is, its east one on the far side, and the drift between
  // them is one way through the rock (the main line, from mouth to mouth, all in the void)
  const mw = [mine.portals[0].x - mine.portals[0].dx * 5, mine.portals[0].z - mine.portals[0].dz * 5];
  const me = [mine.portals[1].x - mine.portals[1].dx * 5, mine.portals[1].z - mine.portals[1].dz * 5];
  let solidRock = 0;
  for (let i = 0; i < mine.main.n; i++) if (mine.sdf(mine.main.x[i], mine.main.z[i]) > -0.5) solidRock++;
  check(`${tag} the South Passage Mines join the two sides: their west mouth is reached from the bridgehead with North Pass shut, their east one is not, and the drift runs through from one to the other`, Number.isFinite(fromShut(...mw)) && !Number.isFinite(fromShut(...me)) && solidRock === 0 && Number.isFinite(field(nav, closed, ...me)(...runway, 10)), `drift ${mine.length.toFixed(0)} m`);
  // under the river: the drift's floor is under the river's bed where it crosses
  let under = Infinity;
  for (let i = 0; i < mine.main.n; i++) if (w.river.at(mine.main.x[i], mine.main.z[i]) < w.river.hw) under = Math.min(under, w.heightAt(mine.main.x[i], mine.main.z[i]) - (mine.main.y[i] + 3));
  check(`${tag} ...passing under the river, rock between its roof and the river's bed`, Number.isFinite(under) && under > 1.5, `${under.toFixed(1)} m of rock`);

  // ---- the dead follow the same walls
  let lineCells = 0;
  let openLine = 0;
  for (const line of w.walls) for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k];
    const [bx, bz] = line[k + 1];
    const ux = bx - ax;
    const uz = bz - az;
    const l = Math.hypot(ux, uz) || 1;
    // (a point a metre in from the foot, on the mountain's side: the right of the line)
    const x = (ax + bx) / 2 - (uz / l) * 1;
    const z = (az + bz) / 2 + (ux / l) * 1;
    if (Math.abs(x) > w.half - 4 || Math.abs(z) > w.half - 4) continue;
    lineCells++;
    if (!nav.blocked[Math.floor(z + nav.half) * S + Math.floor(x + nav.half)]) openLine++;
  }
  let riverCells = 0;
  let riverOpen = 0;
  for (let k = 0; k < w.river.pts.length; k += 6) {
    const x = w.river.pts[k];
    const z = w.river.pts[k + 1];
    if (Math.abs(x) > w.half - 2 || Math.abs(z) > w.half - 2 || w.river.bridges.some((br) => Math.hypot(br.x - x, br.z - z) < br.len / 2 + 2)) continue;
    riverCells++;
    if (!nav.blocked[Math.floor(z + nav.half) * S + Math.floor(x + nav.half)]) riverOpen++;
  }
  check(`${tag} the dead's nav grid is shut along the foot of every mountain and over the river`, !openLine && !riverOpen && lineCells > 500, `${openLine} of ${lineCells} wall points open, ${riverOpen} of ${riverCells} river points`);
  const far = w.hordeSpawns.filter((h) => !Number.isFinite(fromShut(h.x, h.z, 4)) && Number.isFinite(fromOpen(h.x, h.z, 4)));
  check(`${tag} ...and the far side has dead of its own: horde spawns no walk from the bridgehead reaches with North Pass shut, and dens down in the passage`, far.length >= 20 && (mine.dens || []).length >= 4, `${far.length} far-side spawns, ${(mine.dens || []).length} dens`);

  // ---- the parts by route: going north passes the radio, not the pump; going south the pump, not the radio
  const spots = (i) => w.partSpots.filter((sp) => sp.supply === i);
  const radio = spots(3);
  const pump = spots(2);
  const fromRunway = field(nav, open, ...runway);
  const fromRunwayShut = field(nav, closed, ...runway);
  // north: the bridgehead -> North Pass -> the runway; how far out of the way each part is
  const north = fromOpen(...runway, 8);
  const detour = (from, to, sp) => from(sp.x, sp.z) + to(sp.x, sp.z) - north;
  const northRadio = Math.min(...radio.map((sp) => detour(fromOpen, fromRunway, sp)));
  // south: the bridgehead -> the passage's west mouth, through it, its east mouth -> the runway (the far side's own
  // walk, North Pass shut)
  const south = fromShut(...mw) + mine.length + fromRunwayShut(...me);
  const pumpOnSouth = Math.min(...pump.map((sp) => Math.min(...mine.main.x.map((x, i) => Math.hypot(x - sp.x, mine.main.z[i] - sp.z)))));
  const southRadio = Math.min(...radio.map((sp) => fromRunwayShut(sp.x, sp.z) * 2)); // (from the airport up the north road and back)
  const northPump = fromRunway(...me) * 2 + mine.length; // (from the airport down to the passage and back, at the least)
  check(`${tag} the flight radio is on the north road (a short way off it) and every one of its spots is past North Pass`, northRadio < 600 && radio.every((sp) => !Number.isFinite(fromShut(sp.x, sp.z, 4))), `${northRadio.toFixed(0)} m out of the way`);
  check(`${tag} the hydraulic pump is down in the passage, under the ground on its way through`, pump.length >= 2 && pump.every((sp) => mine.under(sp.x, sp.y + 0.5, sp.z)) && pumpOnSouth < 14, `${pump.length} spots`);
  check(`${tag} neither route alone gets every part: the south route goes nowhere near the radio, the north route nowhere near the pump`, southRadio > 800 && northPump > 800, `radio ${southRadio.toFixed(0)} m off the south route, pump ${northPump.toFixed(0)} m off the north route`);

  // ---- the solo loop: the bridgehead - North Pass - the outpost - East Pass - the runway - the passage - the quarry
  // - the bridgehead
  const outpost = zp(ZONE.OUTPOST);
  const quarry = zp(ZONE.AGGREGATES);
  const legs = [
    ['the bridgehead to North Ridge Outpost', fromOpen(...outpost, 6)],
    ['the outpost to the runway', fromRunway(...outpost, 6)],
    ['the runway to the passage', fromRunway(...me)],
    ['through the passage', mine.length],
    ['the passage to the quarry', field(nav, open, ...mw)(...quarry, 6)],
    ['the quarry to the bridgehead', fromOpen(...quarry, 6)],
  ];
  const loop = legs.reduce((s, l) => s + l[1], 0);
  check(`${tag} the whole loop can be walked`, legs.every((l) => Number.isFinite(l[1])), legs.map(([n, d]) => `${n} ${d.toFixed(0)} m`).join(', '));
  // by road: the same legs at the speed a car (or a moped) keeps on the road under it, on foot where there is none and
  // through the mines (no vehicle goes into one: shared/vehicles.js keeps them out of a mouth)
  const roadCost = (sp) => {
    const c = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = i - nav.half + 0.5;
      const z = j - nav.half + 0.5;
      const d = w.roadDistAt(x, z);
      const kind = w.roadKindAt(x, z);
      c[j * S + i] = d < 3 && kind === ROAD.ASPHALT ? FOOT / sp.asphalt : d < 3 && kind === ROAD.DIRT ? FOOT / sp.dirt : 1;
    }
    return c;
  };
  const timeBy = (sp) => {
    const cost = roadCost(sp);
    const fromH = field(nav, open, ...head, cost);
    const fromR = field(nav, open, ...runway, cost);
    const fromW = field(nav, open, ...mw, cost);
    return (fromH(...outpost, 6) + fromR(...outpost, 6) + fromR(...me) + mine.length + fromW(...quarry, 6) + fromH(...quarry, 6)) / FOOT;
  };
  const foot = loop / FOOT;
  const car = timeBy(CAR);
  const moped = timeBy(MOPED);
  // the days the act gives: the arrival day, then a night and a day at a time (on the mainland the nights are as
  // long as the island's; the days are the island's from day 4 on, plus MAINLAND_DAY_MORE)
  const days = [ARRIVAL_DAY, ...[5, 6, 7, 8].map((d) => dayLength(d) + MAINLAND_DAY_MORE)];
  const daylight = (n) => days.slice(0, n).reduce((s, d) => s + d, 0);
  console.log(`        ${tag} the loop: ${(loop / 1000).toFixed(2)} km - on foot ${(foot / 60).toFixed(1)} min, by car ${(car / 60).toFixed(1)} min, by moped ${(moped / 60).toFixed(1)} min (daylight: arrival day ${days[0]} s, then ${days.slice(1).join(', ')} s; nights ${NIGHT_LENGTH} s)`);
  check(`${tag} a solo can run the whole loop in the days the act gives: by car (on foot in the mines) in the arrival day and the next, all on foot in the arrival day and the three after it`, car < daylight(2) && foot < daylight(4), `${foot.toFixed(0)} s on foot against ${daylight(4)} s of daylight, ${car.toFixed(0)} s by car against ${daylight(2)} s`);
  void WALK_SPEED;
}

// ---- the river kills: the real server, a survivor dropped into it mid-channel swimming hard for the far bank
{
  const seed = SEEDS[0];
  const game = new Game({ seed, dayLength: 3600, themes: false, log: () => {} });
  const c = { id: 0, seq: 0 };
  c.session = game.onOpen({
    send(bytes) {
      const rd = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      if (rd.u8() === S2C.WELCOME) c.id = rd.u16();
    },
  });
  const jw = new Writer(64);
  jw.u8(C2S.JOIN);
  jw.u8(PROTOCOL_VERSION);
  jw.str('Swimmer');
  game.onMessage(c.session, jw.bytes().slice());
  const input = (buttons, yaw) => {
    const w2 = new Writer(64);
    w2.u8(C2S.INPUT);
    w2.u16(game.tick & 0xffff);
    w2.u8(0);
    const cmds = [];
    for (let i = 0; i < 3; i++) {
      c.seq = (c.seq + 1) & 0xffff;
      cmds.push({ seq: c.seq, buttons, qyaw: qangle16(yaw), qpitch: qpitch(0), slot: 255 });
    }
    writeInput(w2, cmds);
    game.onMessage(c.session, w2.bytes().slice());
  };
  for (let i = 0; i < 5; i++) {
    input(0, 0);
    game.update();
  }
  const p = game.players.get(c.id);
  p.admin = true;
  game.handleChat(p, '/map2');
  for (const z of [...game.zombies]) {
    game._listRemove(game.zombies, z);
    game.removeEntity(z);
  }
  game.zm.herds.reset();
  game.zm.maintainT = game.zm.herds.spawnT = 1e9;
  const w = game.world;
  const kills = [];
  const kf = game.killfeed.bind(game);
  game.killfeed = (...a) => {
    kills.push(a);
    kf(...a);
  };
  // mid-channel, away from the bridge: a third of the way down the river
  const k = Math.floor(w.river.pts.length / 6) * 2;
  const [x, z] = [w.river.pts[k], w.river.pts[k + 1]];
  const f = w.river.flow(x, z);
  const s = p.state;
  s.x = x;
  s.z = z;
  s.y = groundAt(w, x, z, 200, 0.3);
  s.vx = s.vy = s.vz = 0;
  s.stamina = STAMINA_MAX;
  const across = Math.atan2(f.dz, -f.dx); // (facing across the current: forward is (-sin, -cos))
  let t = 0;
  let wasIn = false;
  for (; t < 12 * SERVER_TICK_RATE && p.alive; t++) {
    input(BTN.FWD | BTN.SPRINT, across);
    game.update();
    wasIn ||= inRiver(w, s);
  }
  const down = (s.x - x) * f.dx + (s.z - z) * f.dz;
  const secs = t / SERVER_TICK_RATE;
  check('the river kills: a survivor in it, swimming hard for the far bank, is carried downstream and drowns in seconds', wasIn && !p.alive && secs < 4.5 && down > 4 && kills.some((a) => a[0] === KILLER.WORLD && a[4] & 4), `dead after ${secs.toFixed(1)} s, ${down.toFixed(1)} m downstream (${RIVER_DPS} hp/s)`);

  // ...and a car driven into it is lost
  const cv = { id: 1, vk: VEH.CAR, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vf: 0, steer: 0, fuel: 10, hp: VEHICLES[VEH.CAR].hp, state: 1, run: true };
  // (on the bank with no cliff over it, facing the water)
  const side = w.cliffAt(f.cx - f.dz * (w.river.hw + 12), f.cz + f.dx * (w.river.hw + 12)) < -6 ? 1 : -1;
  for (let d = w.river.hw + 14; d > w.river.hw; d -= 0.5) {
    cv.x = f.cx - f.dz * d * side;
    cv.z = f.cz + f.dx * d * side;
    if (!w.isDeepWater(cv.x, cv.z)) break;
  }
  cv.y = w.heightAt(cv.x, cv.z);
  cv.yaw = Math.atan2(-f.dz * side, f.dx * side); // (its nose, -Z, to the river: forward (-sin, -cos) is (dz, -dx) * side)
  const ev = [];
  let lost = false;
  for (let i = 0; i < 6 * 60 && !lost; i++) {
    stepVehicle(cv, 1, 0, false, false, w, 1 / 60, ev);
    lost = ev.some((e) => e.type === 'veh_river');
  }
  check('...and a car driven into it is lost (the server takes it out of the world)', lost);
}

console.log(failed ? `layout 12 FAILED (${failed})` : 'layout 12 OK');
process.exit(failed ? 1 : 0);
