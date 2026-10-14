// Port Calder, Town Center (mainland.js): GRID x GRID blocks, each paved and split into lots, and what stands on every
// lot dealt and built (mainland/buildings.js); the square with the town hall; the streets - their traffic, the army's
// roadblocks, the jams, the sinkholes, the tower that fell across one; and the two harbour streets down to the docks.
import { GRID_STEP } from '../constants.js';
import { ZONE, CONT } from '../defs.js';
import { PROPS, collidersOf } from '../props.js';
import { mulberry32, smoothstep, hash2 } from '../rng.js';
import { pickWeighted } from '../worldkit.js';
import { HALF, N, PITCH, GRID, PAVED, CITY_R, BIG_BLOCKS, QUAD_BLOCKS, LONG_BLOCKS, PAVE, HALL_UP, ROADBLOCKS, JAMS, SINKHOLES, SMALL_LOTS, LONG_LOTS, LONGISH, BIG_LOTS } from './consts.js';

const PI = Math.PI;

// plan: the city's frame and its grid (mainland.js: city, G2, the square, the ring); ground: the levelled city's
// height, and the heightfield; ck: the city's kit (mainland/citykit.js); lotBuilders: BUILD and SHOP
// (mainland/buildings.js); burning(): how many fires are lit so far.
// Returns the lots: [{ x, z, w, d, ry, bi, bj, what }]
export function buildCity({ seed, rng, plan, ground, kit, weed, landmarks, burning, smoke, fire, ck, lotBuilders }) {
  const { G2, city, SQ0, SQ1, onSquare, onDiagonal, inRing, RING_R, RING_C, goneBlock, trimBlock } = plan;
  const { cityH, heights } = ground;
  const { props, propBlocked, Builder } = kit;
  const { heaps, fallenBits, solid, heap, signAt, fits, extra, skirt, setFallenAt } = ck;
  const { BUILD, SHOP } = lotBuilders;
  // PORT CALDER -----------------------------------------------------------------------------------------------
  // GRID x GRID blocks. Every block is paved and split into lots - four small ones round a cross of alleys, two long
  // ones back to back, or one big one - and what stands on a lot is drawn from the seed, after the places the run
  // needs have been dealt out (the plane's magneto is in a parts shop; two blocks are big, for the towers).
  const lots = [];
  {
    const order = [];
    for (let k = 0; k < GRID * GRID; k++) if (!onSquare((k / GRID) | 0, k % GRID) && !onDiagonal((k / GRID) | 0, k % GRID)) order.push(k);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    // (the diagonal blocks after them, of small lots: the town as dense as the picture draws it)
    for (let k = 0; k < GRID * GRID; k++) if (onDiagonal((k / GRID) | 0, k % GRID) && !goneBlock((k / GRID) | 0, k % GRID)) order.push(k);
    // (the first BIG_BLOCKS of the shuffle are one lot each, the next QUAD_BLOCKS four: the rest as the seed has it.
    // The blocks the ring trims are of small lots whatever their place in it - one dealt a big lot hands it on to the
    // first of the others dealt small ones - and of the rest LONG_BLOCKS are always of two long lots)
    const trim = (k) => trimBlock((k / GRID) | 0, k % GRID);
    const layoutOf = new Map(order.map((k, n) => [k, onDiagonal((k / GRID) | 0, k % GRID) ? 'quad' : n < BIG_BLOCKS ? 'big' : n < BIG_BLOCKS + QUAD_BLOCKS ? 'quad' : null]));
    for (const k of order) {
      if (!trim(k) || layoutOf.get(k) !== 'big') continue;
      const to = order.find((q) => !trim(q) && layoutOf.get(q) === 'quad');
      if (to !== undefined) layoutOf.set(to, 'big');
      layoutOf.set(k, 'quad');
    }
    let longs = [...layoutOf.values()].filter((v) => v === 'long').length;
    for (const k of order) if (longs < LONG_BLOCKS && !trim(k) && layoutOf.get(k) === null) (layoutOf.set(k, 'long'), longs++);
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const bx = city.x - G2 + (bi + 0.5) * PITCH;
        const bz = city.z - G2 + (bj + 0.5) * PITCH;
        if (onSquare(bi, bj)) continue; // (the square: below)
        const b = new Builder(bx, bz, 0, cityH);
        b.zone = ZONE.CITY;
        b.clear(0, 0, PITCH * 0.72);
        if (goneBlock(bi, bj)) continue; // (the ring's: its curve, verges inside it)
        // which way a lot faces: out of the block, onto the street it stands on. face: the world direction [dx, dz]
        const lot = (lx, lz, w, d, face) => lots.push({ x: bx + lx, z: bz + lz, w, d, ry: Math.atan2(-face[0], -face[1]), bi, bj, what: '' });
        if (trimBlock(bi, bj)) {
          // a block the ring's curve cuts the outer corner off: its paving in quarters, the corner's quarter in strips
          // that stop at the ring's kerb, and a small lot on each of the other three
          const [ox, oz] = [bi < GRID / 2 ? -1 : 1, bj < GRID / 2 ? -1 : 1]; // (which corner is the ring's)
          const Q = PAVED / 2;
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              if (sx !== ox || sz !== oz) {
                b.box((sx * Q) / 2, 0, (sz * Q) / 2, Q, PAVE, Q, 'concrete');
                lot(sx * 11.25, sz * 11.25, 19.5, 19.5, rng.chance(0.5) ? [sx, 0] : [0, sz]);
                continue;
              }
              // (strips 2.5 m wide across the quarter, each out to where the kerb of the ring is: 3.7 m in from its
              // middle, as a street's is)
              const SW = 2.5;
              for (let u = 0; u < Q - 0.01; u += SW) {
                const w = Math.min(SW, Q - u);
                const far = bx - city.x + sx * (u + w); // (the strip's outer side across, in the city's frame)
                const lim = Math.sqrt(Math.max(0, (RING_R - 3.7) ** 2 - (Math.abs(far) - RING_C) ** 2)) + RING_C - Math.abs(bz - city.z); // (how far out from the block's middle along)
                const len = Math.min(Q, lim);
                if (len < 1.5) continue;
                b.box(sx * (u + w / 2), 0, (sz * len) / 2, w, PAVE, len, 'concrete');
              }
            }
          }
          continue;
        }
        b.box(0, 0, 0, PAVED, PAVE, PAVED, 'concrete'); // the pavement, out to the kerb
        const r = rng();
        const layout = layoutOf.get(bi * GRID + bj) || (r < 0.45 ? 'quad' : r < 0.9 ? 'long' : 'big');
        if (layout === 'quad') {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) lot(sx * 11.25, sz * 11.25, 19.5, 19.5, rng.chance(0.5) ? [sx, 0] : [0, sz]);
        } else if (layout === 'long') {
          if (rng.chance(0.5)) for (const sx of [-1, 1]) lot(sx * 11.25, 0, 42, 19.5, [sx, 0]);
          else for (const sz of [-1, 1]) lot(0, sz * 11.25, 42, 19.5, [0, sz]);
        } else lot(0, 0, 42, 42, [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.int(0, 3)]);
      }
    }
  }
  // the set places first, on lots drawn at random, then whatever the seed deals for the rest
  let fall = null; // the tower that fell: { dir, xs, zc, lot, inFall(x, z, pad) }
  {
    const order = lots.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const plan = new Map();
    // (the tower whose shaft came down: the first big lot. It fell across the street beside its block - east, or
    // west from the city's last column - onto what stood on the far side: those lots are under it.)
    const fi = order.find((i) => lots[i].w > 40 && lots[i].d > 40 && ((L) => { const nb = L.bi < GRID - 1 ? L.bi + 1 : L.bi - 1; return !onSquare(nb, L.bj) && !trimBlock(nb, L.bj); })(lots[i]));
    if (fi !== undefined) {
      const T = lots[fi];
      const dir = T.bi < GRID - 1 ? 1 : -1;
      const xs = city.x - G2 + (T.bi + (dir > 0 ? 1 : 0)) * PITCH;
      if (Math.abs(Math.sin(T.ry)) > 0.5) T.ry = 0; // (it faces north or south: the shaft fell along its flank, clear of its doors)
      // (the shaft stood in the middle of the tower: SETBACK and the tower's depth put that 4.8 m toward the lot's front)
      const zc = T.z + Math.cos(T.ry) * -4.8;
      T.fell = true;
      plan.set(fi, 'tower');
      fall = { dir, xs, zc, lot: T, bi: T.bi + (dir > 0 ? 1 : 0), bj: T.bj, inFall: (x, z, pad = 0) => (x - xs) * dir > 5 - pad && (x - xs) * dir < 28.5 + pad && Math.abs(z - zc) < 10.5 + pad };
      setFallenAt([xs, city.z - G2 + (T.bj + 0.5) * PITCH]);
      lots.forEach((L, i) => {
        if (L.bi !== T.bi + dir || L.bj !== T.bj) return;
        // (does the lot reach into where the shaft lies?)
        const [hx, hz] = Math.abs(Math.sin(L.ry)) > 0.5 ? [L.d / 2, L.w / 2] : [L.w / 2, L.d / 2];
        const near = dir > 0 ? L.x - hx : L.x + hx;
        if ((near - xs) * dir < 27 && L.z - hz < zc + 10.5 && L.z + hz > zc - 10.5) plan.set(i, 'crushed');
      });
    }
    const left = order.filter((i) => !plan.has(i));
    const big = left.filter((i) => lots[i].w > 40 && lots[i].d > 40);
    const long = left.filter((i) => lots[i].w > 40 && lots[i].d < 40);
    // (the places the run needs only on lots inside the city's circle - its zone: a lot by the ring stands out past
    // it, where a part would be said to lie in the woods)
    const small = left.filter((i) => lots[i].w < 40 && Math.hypot(lots[i].x - city.x, lots[i].z - city.z) < CITY_R - 14);
    const deal = (from, list) => list.forEach((what) => from.length && plan.set(from.shift(), what));
    // (two of each: the towers, and the parts shops the plane's magneto may be in)
    deal(big, ['hospital', 'collapse', 'depot', 'tower', 'tower']);
    deal(small, ['aero', 'aero', 'office', 'office', 'office', 'police', 'pharmacy', 'hardware', 'church', 'gas', 'subway']);
    deal(long, ['carpark', 'cinema', 'terrace', 'block', 'warehouse', 'terrace', 'block']);
    lots.forEach((L, i) => {
      const b = new Builder(L.x, L.z, L.ry, cityH);
      b.zone = ZONE.CITY;
      const what = plan.get(i) || (L.w < 40 ? pickWeighted(rng, SMALL_LOTS) : L.d < 40 ? pickWeighted(rng, LONG_LOTS) : pickWeighted(rng, BIG_LOTS));
      L.what = what;
      if (what === 'aero') landmarks.push({ x: L.x, z: L.z, name: 'Calder Aero Supply' });
      if (what === 'police') landmarks.push({ x: L.x, z: L.z, name: 'Port Calder Police' });
      if (SHOP[what]) BUILD.shop(b, L, what);
      else if (what === 'office') BUILD.tower(b, L, false);
      else if (what === 'tower') BUILD.tower(b, L, true);
      else if (what === 'crushed') BUILD.crushed(b, L, fall.inFall);
      else BUILD[what](b, L);
    });
  }
  // THE SQUARE: the paving between the four streets round it (Main Street through its middle), the town hall on its
  // north side facing it, and on its south side the memorial, benches and lamps round it, a tree or two left
  {
    const b = new Builder(city.x, city.z, 0, cityH);
    b.zone = ZONE.CITY;
    const E = PITCH - 3.7; // (from the middle to the kerb of the streets round it)
    for (const sz of [-1, 1]) b.box(0, 0, (sz * (E + 3.7)) / 2, E * 2, PAVE, E - 3.7, 'concrete');
    b.clear(0, 0, PITCH * 1.3);
    // (set back from Main Street far enough for its portico and the steps up to it, and a strip of paving before them)
    const L = { x: city.x, z: city.z - 33, w: 42, d: 42, ry: Math.atan2(0, -1), bi: SQ0, bj: SQ0, what: 'hall' };
    lots.push(L);
    BUILD.hall(new Builder(L.x, L.z, L.ry, cityH + HALL_UP), L);
    // the fountain in the middle of the south half: its basin of stone, the water standing dark in it, the column in
    // the middle; a ring of trees round it in their kerbed beds, benches between them facing it, lamps on the ring
    const FZ = 32;
    b.cyl(0, PAVE, FZ, 5, 0.7, 'stone', { sides: 20 });
    b.cyl(0, PAVE + 0.7, FZ, 4.5, 0.02, 'charred', { sides: 20, collide: false }); // (the water, black and still)
    b.cyl(0, PAVE, FZ, 0.7, 2.6, 'stone', { sides: 10 });
    b.cyl(0, PAVE + 2.6, FZ, 1.4, 0.3, 'stone', { sides: 12, collide: false });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2 + PI / 8;
      const [tx, tz] = [Math.sin(a) * 11, FZ + Math.cos(a) * 11];
      if (Math.cos(a) < -0.7) continue; // (open toward the hall)
      b.box(tx, PAVE, tz, 2.4, 0.3, 2.4, 'concrete');
      b.tree(tx, tz, k % 3 === 0 ? 5 : 1, 0.75 + (k % 3) * 0.1);
      const ba = a + PI / 8;
      const [bx2, bz2] = [Math.sin(ba) * 8.2, FZ + Math.cos(ba) * 8.2];
      if (fits(b, 'street_bench', bx2, bz2, ba + PI, PAVE)) b.prop('street_bench', bx2, bz2, ba + PI, { ly: PAVE });
      if (k % 2 === 0 && fits(b, 'streetlight', Math.sin(ba) * 12.5, FZ + Math.cos(ba) * 12.5, 0, PAVE)) b.prop('streetlight', Math.sin(ba) * 12.5, FZ + Math.cos(ba) * 12.5, ba, { ly: PAVE });
    }
    for (const [lx, lz] of [[-E + 2, 6], [E - 2, 6], [-E + 2, E - 2], [E - 2, E - 2], [-E + 2, -6], [E - 2, -6]]) if (fits(b, 'streetlight', lx, lz, 0, PAVE)) b.prop('streetlight', lx, lz, lx < 0 ? -PI / 2 : PI / 2, { ly: PAVE });
    // rows of trees down the square's sides, between the paving and the parked cars
    for (const sx of [-1, 1]) for (let lz = 10; lz <= 48; lz += 9.5) { b.box(sx * 42, PAVE, lz, 2.2, 0.3, 2.2, 'concrete'); b.tree(sx * 42, lz, 1, 0.8); }
    for (let n = 0; n < 14; n++) b.prop(['litter', 'paper_scatter', 'debris', 'glass_shards'][n & 3], rng.range(-40, 40), rng.range(10, 48), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: n & 1 });
    // the market that was set up on it the last week: stalls in two rows either side of the memorial, their awnings,
    // counters and what was left on them
    const put = (type, lx, lz, ry, o = {}) => fits(b, type, lx, lz, ry, PAVE) && b.prop(type, lx, lz, ry, { ly: PAVE, ...o });
    const stall = (lx, lz, k) => {
      for (const [px, pz] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) b.cyl(lx + px, PAVE, lz + pz, 0.06, 2.5, 'rust', { sides: 6 });
      b.box(lx, PAVE, lz - 0.6, 3, 0.95, 0.9, 'planks');
      b.box(lx, PAVE + 2.45, lz, 3.4, 0.08, 2.6, k % 2 ? 'tin' : 'tin_rust', { rx: 0.16, collide: false });
      put('crate_small', lx - 0.8, lz + 0.5, 0.3, { seed: k & 1 });
      if (k % 3 === 0) put('crate', lx + 0.9, lz + 0.6, -0.2, { seed: 1 });
    };
    let k = 0;
    for (const lx of [-31, -22, -13, 13, 22, 31]) stall(lx, 47, k++); // (along the south edge, facing the fountain)
    for (const lx of [-31, -22, 22, 31]) stall(lx, 17, k++);
    for (const [lx, lz] of [[-24, 32], [24, 32]]) put('picnic_table', lx, lz, 0.2);
    // the evacuation point the army set up by the town hall: its tents, the triage tent, sandbags, barriers on Main
    // Street's kerb, the board
    put('military_tent', -38, -30, PI / 2);
    put('military_tent', 38, -32, -PI / 2, { seed: 1 });
    put('triage_tent', 38, -16, -PI / 2);
    for (const [lx, lz, ry] of [[-30, -18, 0], [-27, -18, 0], [-24, -18, 0.1], [29, -44, 0], [32, -44, 0]]) put('sandbags', lx, lz, ry);
    for (const lx of [-46, -40, 40, 46]) put('jersey_barrier', lx, -6.2, 0);
    put('checkpoint_sign', -34, -6.5, 0);
    // the street furniture along Main Street's kerbs, and the cars left parked down the square's sides
    put('bus_shelter', -46, 6.4, PI);
    put('phone_booth', 44, 6.2, PI);
    put('newspaper_box', 36, 5.6, PI);
    put('vending_machine', -30, 5.8, PI);
    for (let lz = 12; lz < 50; lz += 6.5) {
      if (rng.chance(0.75)) put(rng.chance(0.6) ? 'car_wreck' : 'car_burnt', -48.5, lz, PI / 2 + rng.range(-0.05, 0.05), { seed: rng.int(0, 2) });
      if (rng.chance(0.75)) put(rng.chance(0.6) ? 'car_wreck' : 'car_open', 48.5, lz, -PI / 2 + rng.range(-0.05, 0.05), { seed: rng.int(0, 2) });
    }
    for (let n = 0; n < 10; n++) b.prop(['suitcases', 'stroller', 'shopping_cart', 'bicycle', 'skeleton'][n % 5], rng.range(-44, 44), rng.range(8, 50), rng.range(0, 6), { nocollide: true, ly: PAVE, seed: n & 1 });
    // The square up close, where it is walked into off Main Street (what follows is dealt from dice of its own: the
    // rest of the city is as it was). Its paving is no one slab: bands of dressed stone every 6.5 m across both halves,
    // a slab of it gone here and there to the earth under with weeds in it; a promenade of brick from Main Street to
    // the fountain between two stone kerbs; raised beds of stone either side of it, each with its tree; benches along
    // it, the market's nearer stalls, bins; and what people dropped on their way to the evacuation point.
    {
      const dk = mulberry32((seed ^ 0x5a1e) >>> 0);
      const dr = (a, c) => a + dk() * (c - a);
      const band = (lx, lz, w, d, mat = 'stone_rough', h = 0.045) => b.box(lx, PAVE - 0.03, lz, w, h, d, mat, { collide: false });
      for (const sz of [-1, 1]) {
        for (let k = 0; k <= 16; k++) band(-E + 0.3 + k * 6.5, (sz * (E + 3.7)) / 2, 0.3, E - 3.7);
        for (let k = 0; k <= 7; k++) band(0, sz * (3.85 + k * 6.5), E * 2, 0.3);
      }
      // the promenade, and its kerbs
      band(0, 12.4, 5.4, 17, 'brick', 0.06);
      for (const sx of [-1, 1]) band(sx * 2.85, 12.4, 0.3, 17, 'stone', 0.1);
      // slabs gone: the earth under them, weeds come up through it (not where anything stands, nor on the promenade)
      for (let n = 0; n < 14; n++) {
        const ci = Math.floor(dr(-8, 8));
        const cj = Math.floor(dr(0, 7.5));
        const sz = dk() < 0.5 ? -1 : 1;
        const [lx, lz] = [-E + 0.3 + (ci + 8.5) * 6.5, sz * (3.85 + (cj + 0.5) * 6.5)];
        if (Math.abs(lx) < 6 || (sz < 0 && Math.abs(lx) < 21 && lz < -6) || propBlocked('crate', b.wx(lx, lz), b.wz(lx, lz), 0) || Math.hypot(lx, lz - FZ) < 13) continue;
        const [w, d] = [dr(1.6, 4.2), dr(1.4, 3.6)];
        b.box(lx + dr(-1, 1), PAVE - 0.05, lz + dr(-1, 1), w, 0.065, d, 'earth', { collide: false });
        for (let q = Math.floor(dr(1, 4)); q > 0; q--) weed(b, lx + dr(-w, w) * 0.4, lz + dr(-d, d) * 0.4, dr(0.5, 1.0));
      }
      // the raised beds: a kerb of stone a step high, earth in it, a tree and what has seeded round it
      const bed = (lx, lz, w, d, v) => {
        b.box(lx, PAVE, lz, w, 0.48, d, 'stone');
        b.box(lx, PAVE + 0.48, lz, w - 0.5, 0.03, d - 0.5, 'earth', { collide: false });
        b.tree(lx + dr(-0.6, 0.6), lz, v, dr(0.7, 0.9));
        for (let q = 0; q < 4; q++) weed(b, lx + dr(-w / 2 + 0.6, w / 2 - 0.6), lz + dr(-d / 2 + 0.5, d / 2 - 0.5), dr(0.5, 0.9), PAVE + 0.5);
      };
      for (const sx of [-1, 1]) {
        bed(sx * 12, 10.5, 7.5, 4, sx < 0 ? 1 : 5);
        bed(sx * 27, 10, 6, 3.6, 1);
      }
      const put2 = (type, lx, lz, ry, o = {}) => fits(b, type, lx, lz, ry, PAVE) && b.prop(type, lx, lz, ry, { ly: PAVE, seed: Math.floor(dk() * 3), ...o });
      for (const sx of [-1, 1]) {
        for (const lz of [8.5, 15.5]) put2('street_bench', sx * 4.4, lz, sx < 0 ? -PI / 2 : PI / 2);
        put2('trash_bin', sx * 4.3, 12, 0);
      }
      for (const sx of [-1, 1]) stall(sx * 13.5, 17.5, k++);
      // what was dropped on the way across: bags, a pram, papers, a bicycle down, a body under a sheet
      for (const [type, lx, lz] of [['suitcases', 2.2, 7.2], ['paper_scatter', -1.4, 11], ['stroller', -6.4, 6.4], ['litter', 6.5, 13.5], ['glass_shards', -7.5, 14], ['duffel_bag', 7.8, 6.8], ['bicycle', -9.5, 18.8], ['paper_scatter', 9, 5.4], ['body_bag', 8.5, 19.6], ['litter', -3.2, 19]]) {
        b.prop(type, lx, lz, dr(0, 6), { nocollide: true, ly: PAVE, seed: Math.floor(dk() * 2) });
      }
      // the evacuation point, nearer the street: a floodlight on its mast and the generator for it, a wall of
      // sandbags along the kerb, pallets of the army's crates, cots by the triage tent, a truck backed up to them
      put2('floodlight_tower', -20, -8.2, PI * 0.15);
      put2('generator', -22.6, -10.8, 0.3);
      for (const lx of [18.5, 21.5, 24.5]) put2('sandbags', lx, -6.6, 0);
      put2('pallet', -26.5, -12, 0.1);
      put2('military_crate', -28.9, -10.2, -0.4);
      put2('military_crate', -24.4, -14.2, 0.2);
      for (const lz of [-11, -13.4]) put2('field_cot', 30.5, lz, PI / 2);
      put2('army_truck', 22, -20.5, PI / 2 + 0.08);
      put2('traffic_cones', 16.5, -6.4, 0);
      put2('traffic_cones', -16.8, -6.6, 0.5);
    }
    landmarks.push({ x: city.x, z: city.z + 30, name: 'Town Square' });
  }
  // The streets. Every few metres of them: the traffic that stopped for good - wrecks nose to tail, doors standing
  // open, burnt-out shells, one run up onto the pavement or into a shop front - lamps, hydrants, meters, bins,
  // benches, letter boxes and booths along the kerbs, rubbish, paper and broken glass, what people carried and
  // dropped, the dead where they fell, slabs of the roadway heaved up, weeds along every kerb and saplings in the
  // cracks. A few stretches are worse: a roadblock the army held to the last (wire, sandbags, a knocked-out
  // carrier, its dead), a jam that never moved, a hole the street fell into, and the shaft of a tower lying across
  // the road and the block beyond - climbed through where it broke, or gone round. Whatever would stand in
  // something already there is left out, after its draws.
  {
    const b = new Builder(city.x, city.z, 0, cityH);
    b.zone = ZONE.CITY;
    b.ground = true; // (the roadway lies a little under the city's level: what is on it stands on the ground)
    const free = (type, lx, lz, ry) => !propBlocked(type, b.wx(lx, lz), b.wz(lx, lz), ry);
    // which stretch is which: i, the street; k, the block along it; ns, which way it runs
    const key = (i, k, ns) => `${i}:${k}:${ns ? 1 : 0}`;
    // (the streets' wrecks clear of each other as their colliders are, by a hand's width: a plan is a shade short of
    // some of them - the pickup's - and nose to tail in a jam that was 20 cm into the next)
    const street0 = props.length;
    const boxesOf = (type, x, z, ry, sd, m) => {
      const c = Math.cos(ry), s2 = Math.sin(ry);
      return (collidersOf(type, sd)?.boxes || []).map(([lx, , lz, sx, , sz]) => ({ x: x + c * lx + s2 * lz, z: z - s2 * lx + c * lz, hx: sx / 2 + m, hz: sz / 2 + m, c, s: s2, r: 0 }));
    };
    const carsClear = (type, x, z, ry) => {
      const mine = [0, 1, 2].flatMap((sd) => boxesOf(type, x, z, ry, sd, 0.05));
      for (let k = street0; k < props.length; k++) {
        const p = props[k];
        if (Math.abs(p.x - x) > 10 || Math.abs(p.z - z) > 10 || !LONGISH.has(p.type)) continue;
        for (const o of boxesOf(p.type, p.x, p.z, p.ry, p.seed, 0)) for (const a of mine) if (kit.solidsMeet(a, o)) return false;
      }
      return true;
    };
    const kinds = new Map();
    // (a stretch the ring's curve took - an edge street's round a corner, an inner street's last before the ring - is
    // no street now: nothing is set along it)
    const gone = (i, k, ns) => {
      const o = -G2 + i * PITCH;
      const [a, b2] = [-G2 + k * PITCH, -G2 + (k + 1) * PITCH];
      return ns ? !inRing(o, a, -0.5) || !inRing(o, b2, -0.5) : !inRing(a, o, -0.5) || !inRing(b2, o, -0.5);
    };
    // (where a hole would be dug in a stretch: nothing that came down off a lot lies on its lip)
    const holeAt = (i, k, ns) => (ns ? [city.x - G2 + i * PITCH, city.z - G2 + (k + 0.5) * PITCH + 6] : [city.x - G2 + (k + 0.5) * PITCH + 6, city.z - G2 + i * PITCH]);
    const heaped = (i, k, ns) => heaps.some((q) => Math.hypot(q.x - holeAt(i, k, ns)[0], q.z - holeAt(i, k, ns)[1]) < 14);
    const mark = (kind, n) => {
      for (let tries = 0; n > 0 && tries < 80; tries++) {
        const ns = rng.chance(0.5);
        const i = rng.int(0, GRID);
        const k = rng.int(0, GRID - 1);
        if (kinds.has(key(i, k, ns)) || gone(i, k, ns) || (kind === 'hole' && ((!ns && i === GRID / 2) || heaped(i, k, ns)))) continue; // (no hole in Main Street: Route 9 is the way through)
        kinds.set(key(i, k, ns), kind);
        n--;
      }
    };
    if (fall) kinds.set(key(fall.bi, fall.bj, true), 'fallen');
    for (let k = SQ0; k <= SQ1; k++) kinds.set(key(GRID / 2, k, true), 'square'); // (the cross street is the square there)
    mark('block', ROADBLOCKS);
    mark('jam', JAMS);
    mark('hole', SINKHOLES);
    // the holes are dug first: what is put down after stands in them
    for (const [id, kind] of kinds) {
      if (kind !== 'hole') continue;
      const [i, k, ns] = id.split(':').map(Number);
      const o = -G2 + i * PITCH;
      const m = -G2 + (k + 0.5) * PITCH + 6;
      const [hx, hz] = ns ? [city.x + o, city.z + m] : [city.x + m, city.z + o];
      for (let j = Math.floor((hz - 7 + HALF) / GRID_STEP); j <= Math.ceil((hz + 7 + HALF) / GRID_STEP); j++) {
        for (let ii = Math.floor((hx - 7 + HALF) / GRID_STEP); ii <= Math.ceil((hx + 7 + HALF) / GRID_STEP); ii++) {
          const d = Math.hypot(-HALF + ii * GRID_STEP - hx, -HALF + j * GRID_STEP - hz);
          heights[j * N + ii] -= 1.7 * (1 - smoothstep(1.5, 5.6, d));
        }
      }
    }
    // (what stands by a kerb: on the paving, unless the block there is the ring's, which has none. lx, lz: in the
    // city's frame; o: what onPave says for an ordinary block. Returns the prop's options)
    const paveAt = (lx, lz, o) => {
      const bi = Math.floor((lx + G2) / PITCH), bj = Math.floor((lz + G2) / PITCH);
      return bi >= 0 && bj >= 0 && bi < GRID && bj < GRID && goneBlock(bi, bj) ? {} : o;
    };
    const TRAFFIC = [['car_wreck', 3], ['car_burnt', 2.4], ['car_open', 2.8], ['pickup_truck', 1.1], ['van_wreck', 1.1], ['ambulance', 0.3], ['box_truck', 0.45]];
    const LITTER = ['litter', 'litter', 'paper_scatter', 'paper_scatter', 'glass_shards', 'glass_shards', 'debris', 'suitcases', 'bicycle', 'stroller', 'skeleton', 'corpse', 'bones', 'traffic_cones', 'shopping_cart', 'blood_pool', 'litter', 'debris'];
    const hasTrunk = (type) => type === 'car_wreck' || type === 'car_open';
    for (let i = 0; i <= GRID; i++) {
      for (let k = 0; k < GRID; k++) {
        for (const ns of [true, false]) {
          // (the stretch of street i between crossings k and k + 1, north-south or east-west)
          const o = -G2 + i * PITCH;
          const m = -G2 + (k + 0.5) * PITCH;
          const at = (along, across) => (ns ? [o + across, m + along] : [m + along, o + across]);
          const yaw = ns ? 0 : PI / 2;
          // which way a thing is turned for its front (-Z) to look down the street (sign of along), or across it
          // toward its middle (from the side `sgn` of it)
          const faceAlong = (sign) => (ns ? (sign > 0 ? PI : 0) : sign > 0 ? -PI / 2 : PI / 2);
          const faceIn = (sgn) => (ns ? (sgn * PI) / 2 : sgn > 0 ? 0 : PI);
          const kind = kinds.get(key(i, k, ns));
          if (kind === 'square' || gone(i, k, ns)) continue;
          // (the paving of a block stands PAVE over the city's level from 3.7 m off a street's middle - where there is
          // a block: the outer side of an edge street is a verge. What is put on it stands on it.)
          const onPave = (across) => (Math.abs(across) > 3.75 && (across > 0 ? i < GRID : i > 0) ? { ly: PAVE } : {});
          // (where a block has paving at that spot: paveAt - the blocks the ring took have none)
          const paveOf = (along, across) => paveAt(...at(along, across), onPave(across));
          const litter = (type, along, across, o2 = {}) => b.prop(type, ...at(along, across), rng.range(0, 6), { nocollide: true, seed: rng.int(0, 2), ...(paveOf(along, across) || {}), ...o2 });
          const put = (type, along, across, ry, o2 = {}) => {
            const pv = paveOf(along, across);
            if (pv) extra(b, type, ...at(along, across), ry, { ...pv, ...o2 });
          };
          const car = (type, along, across, ry, trunk = false) => {
            const [x, z] = at(along, across);
            const pv = paveOf(along, across);
            if (!pv || !PROPS[type] || !fits(b, type, x, z, ry, pv.ly ?? 0) || !carsClear(type, b.wx(x, z), b.wz(x, z), b.ry + ry)) return false;
            b.wreck(type, x, z, ry, { trunk: trunk && hasTrunk(type), zone: ZONE.ROADSIDE, ...pv });
            return true;
          };
          // weeds along both kerbs and up the middle of the road, whatever else is here
          for (let n = rng.int(7, 11); n > 0; n--) weed(b, ...at(rng.range(-21, 21), (rng.chance(0.5) ? 1 : -1) * rng.range(3.5, 3.95)), rng.range(0.5, 1.1));
          for (let n = rng.int(2, 4); n > 0; n--) weed(b, ...at(rng.range(-21, 21), rng.range(-0.5, 0.5)), rng.range(0.25, 0.45));
          if (kind === 'fallen') continue; // (laid after the rest: below)
          // the kerbs: a lamp at either end, meters down one side, and what a city sets along its pavements
          {
            const [lx, lz] = at(-20, 4.5);
            const pl = paveAt(lx, lz, onPave(4.5));
            if (pl && free('streetlight', lx, lz, 0)) b.prop('streetlight', lx, lz, ns ? PI / 2 : 0, pl); // (its arm out over the roadway)
            const [rx, rz] = at(14, -4.5);
            const there = rng.chance(0.7);
            const pr = paveAt(rx, rz, onPave(-4.5));
            if (there && pr && free('streetlight', rx, rz, 0)) b.prop('streetlight', rx, rz, ns ? -PI / 2 : PI, pr);
            const side = rng.chance(0.5) ? 1 : -1;
            for (let a = -15; a <= 15; a += 6) {
              const here = rng.chance(0.6);
              if (here) put('parking_meter', a + rng.range(-0.4, 0.4), side * 4.15, faceIn(side) + rng.range(-0.2, 0.2));
            }
            for (const sgn of [-1, 1]) {
              const row = [['fire_hydrant', 0.55], ['trash_bin', 0.8], ['street_bench', 0.5], ['mail_dropbox', 0.35], ['newspaper_box', 0.45], ['trash_bin', 0.35], ['phone_booth', 0.22], ['pole_leaning', 0.14]];
              for (const [type, p] of row) {
                const here = rng.chance(p);
                const along = rng.range(-18, 18);
                const across = sgn * (type === 'street_bench' || type === 'phone_booth' ? 5.2 : rng.range(4.3, 4.7));
                const turn = rng.range(-0.15, 0.15);
                if (here) put(type, along, across, (type === 'phone_booth' ? faceIn(-sgn) : faceIn(sgn)) + turn);
              }
            }
          }
          if (kind === 'block') {
            // A roadblock, and the last stand made at it. d: which way it faced (what came, came from -d).
            const s0 = rng.range(-5, 5);
            const d = rng.chance(0.5) ? 1 : -1;
            for (const across of [-2.1, 1.5]) put('jersey_barrier', s0, across, yaw);
            for (const across of [-5.3, 5.3]) put('tank_trap', s0 - d * 0.4, across, rng.range(0, 3));
            put('concertina', s0 - d * 3.4, 0.2, yaw + rng.range(-0.06, 0.06));
            put('concertina', s0 - d * 6.6, -0.6, yaw + rng.range(-0.2, 0.2));
            put('sandbag_nest', s0 + d * 3.3, -1.5, faceAlong(-d));
            b.prop('mg_tripod', ...at(s0 + d * 3.6, -1.5), faceAlong(-d), { nocollide: true });
            put('sandbags', s0 + d * 2.4, 2.4, yaw);
            const carrier = rng.chance(0.6);
            if (carrier) put('apc_wreck', s0 + d * 9.4, 0.3, yaw + PI / 2 + rng.range(-0.35, 0.35));
            else put('army_truck', s0 + d * 10, -1.8, faceAlong(-d) + rng.range(-0.2, 0.2));
            const second = rng.chance(0.6);
            if (second) put('army_truck', s0 + d * 17, 1.8, faceAlong(d) + rng.range(-0.15, 0.15), { seed: 1 });
            put('floodlight_tower', s0 + d * 5.4, -5.0, faceAlong(-d));
            put('checkpoint_sign', s0 - d * 9, 2.2, faceAlong(-d) + rng.range(-0.2, 0.2));
            // the order on its posts, facing what came
            {
              const [qx, qz] = at(s0 - d * 1.2, 5.6);
              const posts = [-0.8, 0.8].map((dq) => (ns ? [qx + dq, qz] : [qx, qz + dq]));
              if (posts.every(([px, pz]) => fits(b, 'parking_meter', px, pz, 0, PAVE))) {
                for (const [px, pz] of posts) b.cyl(px, onPave(5.6).ly ?? 0, pz, 0.06, 2.9, 'rust', { sides: 6 });
                signAt(b, qx, 2.3 + (onPave(5.6).ly ?? 0), qz, faceAlong(-d), 2.0, 1.0, 'quarantine', { far: true, back: 0.05 });
              }
            }
            // (its crate is the city's: a container's zone is the place a schematic in it is rumoured to be in)
            const [cx, cz] = at(s0 + d * 4.6, 3.6);
            if (fits(b, 'military_crate', cx, cz, yaw)) b.cont(CONT.AMMO_BOX, cx, cz, { prop: 'military_crate', ry: yaw });
            put('field_cot', s0 + d * 7, 5.4, yaw + PI / 2);
            put('barrel', s0 + d * 6.2, -3.2, 0);
            // those who held it, and those who came at it
            for (let n = 0; n < 9; n++) {
              const behind = n < 4;
              litter(['corpse', 'skeleton', 'body_bag', 'skeleton', 'corpse', 'bones'][rng.int(0, 5)], s0 + d * (behind ? rng.range(1, 8) : -rng.range(1, 14)), rng.range(-6, 6));
            }
            for (let n = 0; n < 4; n++) litter('blood_pool', s0 + rng.range(-9, 9), rng.range(-5, 5));
            for (let n = 0; n < 3; n++) litter(['glass_shards', 'litter', 'suitcases'][n], s0 - d * rng.range(6, 16), rng.range(-5, 5));
            // the last cars that tried it
            for (const [dd, across, turn] of [[11, -1.8, 0.2], [13.4, 1.9, -0.5], [18, -1.6, 0.1]]) {
              const type = pickWeighted(rng, TRAFFIC.slice(0, 4));
              const ry = faceAlong(d) + turn * rng.range(0.4, 1.4);
              car(type, s0 - d * dd, across, ry, rng.chance(0.5));
            }
            continue;
          }
          if (kind === 'jam') {
            // bumper to bumper, both lanes, doors open where their people got out and ran: the last traffic the
            // street ever had. A bus in the middle of it.
            const busAt = rng.int(1, 4);
            const busLane = rng.chance(0.5) ? 1 : -1;
            for (let n = 0; n < 7; n++) {
              for (const sgn of [-1, 1]) {
                const type = pickWeighted(rng, TRAFFIC);
                const ry = yaw + (sgn > 0 ? PI : 0) + rng.range(-0.12, 0.12);
                const gone = rng.chance(0.1);
                const along = -19.5 + n * 6.2 + rng.range(-0.4, 0.4);
                const across = sgn * rng.range(1.75, 2.05);
                const trunk = rng.chance(0.5);
                if (sgn === busLane && n === busAt) car('city_bus', along + 3, sgn * 1.95, yaw + (sgn > 0 ? PI : 0) + rng.range(-0.04, 0.04));
                else if (!gone) car(type, along, across, ry, trunk);
              }
            }
            for (let n = rng.int(10, 14); n > 0; n--) litter(['suitcases', 'litter', 'suitcases', 'paper_scatter', 'corpse', 'skeleton', 'stroller', 'glass_shards', 'bicycle'][rng.int(0, 8)], rng.range(-20, 20), rng.range(-6.4, 6.4));
            continue;
          }
          const hole = kind === 'hole';
          // the roadway: what was driving down it
          const nv = hole ? 2 : rng.int(3, 6);
          for (let n = 0; n < nv; n++) {
            const sgn = n % 2 ? 1 : -1;
            const along = hole ? rng.range(-20, -7) : -19 + (n + rng.range(0.15, 0.85)) * (38 / nv); // (a hole is at +6: clear of it)
            const type = pickWeighted(rng, TRAFFIC);
            const crash = rng.chance(0.2);
            const ry = yaw + (sgn > 0 ? PI : 0) + (crash ? rng.range(-0.9, 0.9) : rng.range(-0.22, 0.22));
            const across = sgn * rng.range(1.5, 2.3);
            const trunk = rng.chance(0.4);
            const here = rng.chance(0.9);
            if (here) car(type, along, across, ry, trunk);
          }
          // (...one more that ran up onto the pavement, or into the front of a shop: its glass all round it)
          {
            const up = rng.chance(0.6);
            const sgn = rng.chance(0.5) ? 1 : -1;
            const into = rng.chance(0.45);
            const along = hole ? rng.range(-20, -7) : rng.range(-17, 17);
            const type = pickWeighted(rng, TRAFFIC.slice(0, 5));
            const ry = into ? faceIn(-sgn) + rng.range(-0.45, 0.45) : yaw + rng.range(-0.5, 0.5);
            const ok = up && car(type, along, sgn * (into ? 5.5 : rng.range(4.75, 4.95)), ry);
            if (ok && into) {
              litter('glass_shards', along + rng.range(-1, 1), sgn * 6.6);
              litter('debris', along + rng.range(-1.5, 1.5), sgn * 6.4);
            }
          }
          // what came down off the buildings either side: slabs and lumps along the kerbs
          for (let n = rng.int(2, 5); n > 0; n--) {
            const across = (rng.chance(0.5) ? 1 : -1) * rng.range(4.2, 6.2);
            const [x, z] = at(rng.range(-20, 20), across);
            skirt(b, x, z, onPave(across).ly ?? 0.02);
          }
          // what lies about: every few metres of it
          for (let n = rng.int(11, 16); n > 0; n--) litter(LITTER[rng.int(0, LITTER.length - 1)], rng.range(-21, 21), rng.range(-6.6, 6.6));
          {
            const r = rng();
            const pa = rng.range(-18, 18);
            const rim = hole && Math.abs(pa - 6) < 9; // (nothing solid on the lip of a hole)
            const across = (rng.chance(0.5) ? 1 : -1) * rng.range(4.6, 5.2);
            const pr = rng.range(0, 6);
            const [px, pz] = at(pa, across);
            if (r < 0.3) litter('pole_down', rng.range(-8, 8), rng.range(-1, 1), { ry: undefined });
            else if (r < 0.5 && !rim && paveAt(px, pz, onPave(across))?.ly && fits(b, 'dumpster_tipped', px, pz, pr, PAVE)) b.cont(CONT.DUMPSTER, px, pz, { prop: 'dumpster_tipped', ry: pr, ...onPave(across) });
            else if (r < 0.62 && !rim) put('barricade', pa, across, yaw + PI / 2);
          }
          // the roadway, heaved: slabs of it tipped up out of the street (round a hole, all of its rim)
          for (let n = hole ? 7 : rng.int(1, 3); n > 0; n--) {
            const [hx, hz] = hole ? at(6 + Math.sin(n * 0.9) * rng.range(4.4, 6.2), Math.cos(n * 0.9) * rng.range(3.6, 5.2)) : at(rng.range(-20, 20), rng.range(-3.4, 3.4));
            // (the low edge well down in the street, the high one a hand or two up out of it: heaved, not lifted off)
            const [sw, sd, sry, srz, srx] = [rng.range(1.4, 2.6), rng.range(1.2, 2.2), rng.range(0, 3), rng.range(-0.34, 0.34), rng.range(-0.2, 0.2)];
            b.box(hx, -0.16, hz, sw, 0.2, sd, 'concrete', { ry: sry, rz: srz * 0.45, rx: srx * 0.45, collide: false });
          }
          for (let n = rng.int(0, 2); n > 0; n--) b.tree(...at(rng.range(-20, 20), (rng.chance(0.5) ? 1 : -1) * rng.range(4.9, 5.6)), 5, rng.range(0.45, 0.75)); // (a birch, out of a crack)
        }
      }
    }
    // The shaft of the tower that fell, where it lies: three lengths of it end to end from the foot of what still
    // stands - the first against the podium, the second across the far pavement and into the block beyond, the
    // third on what it crushed there - broken apart over the roadway, where the rubble between them is the way
    // through. (across: they are the one thing built in a road.)
    if (fall) {
      const { dir, xs, zc, lot } = fall;
      const lx = xs - city.x;
      const lz = zc - city.z;
      const st = lot.shaft || { style: 'office', fh: 3.3 };
      // (each a little askew of the last, and none of them level: tilt - its far end up)
      const length = (x0, x1, w, h, tilt, skew) => {
        const cx = lx + (dir * (x0 + x1)) / 2;
        solid(b, cx, 0.02, lz, Math.abs(x1 - x0), h, w, 'concrete', { ry: skew }).across = true;
        fallenBits.push({ x: b.wx(cx, lz), y: b.y0 + 0.02, z: b.wz(cx, lz), ry: (dir > 0 ? 0 : PI) + skew, len: Math.abs(x1 - x0), w, h, fh: st.fh, style: st.style, mat: 'concrete', seed: rng.int(1, 99999), tilt });
      };
      length((lot.x + dir * 17 - xs) * dir + 0.5, -1.9, 15, 7.6, -0.14, 0.02); // (from the podium's flank, its end there up on what it broke off: it is 34 m across)
      length(1.9, 12.4, 15, 6.4, 0.05, -0.05);
      length(14.4, 22.6, 14, 4.6, -0.08, 0.07);
      // the break over the roadway: rubble to the height of a man, and at either mouth of it
      heap(b, lx, lz, 1.7, 6.6, 1.6, { across: true, ly: 0.02 });
      for (const sz of [-1, 1]) heap(b, lx + rng.range(-0.6, 0.6), lz + sz * 9.6, 3.2, 2.6, 1.3, { across: true, ly: 0.02, ry: rng.range(-0.3, 0.3) });
      // (...between the second length and the third, and the last of it beyond)
      heap(b, lx + dir * 13.4, lz + rng.range(-3, 3), 1.2, 4.6, 2.2, { ly: PAVE });
      heap(b, lx + dir * 25.4, lz + rng.range(-2, 2), 2.6, 5.0, 2.2, { ly: PAVE });
      for (const [dx, dz] of [[7, -9.6], [8, 9.8], [18.6, -9.2], [19.4, 9.4], [11.6, -9.9], [12.4, 10], [22.6, 9.8], [23, -9.7]]) heap(b, lx + dir * dx, lz + dz, rng.range(2.2, 3), rng.range(1.7, 2.3), rng.range(0.9, 1.5), { ly: PAVE, ry: rng.range(-0.4, 0.4) });
      // (slabs of its skin against it, where they slid off)
      for (let n = 0; n < 10; n++) {
        const sd = n % 2 ? 1 : -1;
        b.box(lx + dir * rng.range(2, 22), PAVE + rng.range(0.5, 1.6), lz + sd * rng.range(7.9, 8.6), rng.range(2.4, 4.4), 0.28, rng.range(2, 3.4), 'concrete', { rx: sd * rng.range(0.7, 1.15), ry: rng.range(-0.3, 0.3), collide: false });
      }
      for (const [dx, dz] of [[-5, -9.4], [-5.4, 9.6], [-1, -13], [2, 13.4], [10, -12.4], [11, 12.6]]) skirt(b, lx + dir * dx, lz + dz, Math.abs(dx) < 3.7 ? 0.02 : PAVE);
      // what it landed on, under its second length
      b.prop('car_burnt', lx + dir * 4.6, lz + 10.6, 0.1, { nocollide: true, seed: 1 });
      b.prop('pole_down', lx - dir * 3, lz - 11.6, 1.2, { nocollide: true });
      for (let n = 0; n < 8; n++) b.prop(['debris', 'glass_shards', 'paper_scatter', 'litter'][n & 3], lx + rng.range(-6, 6), lz + (n % 2 ? 1 : -1) * rng.range(8.6, 16), rng.range(0, 6), { nocollide: true, seed: n & 1 });
      smoke(b, lx + dir * 7, 5, lz);
      if (!burning()) fire(b, lx + dir * 9, 0.8, lz + 2.5); // (and if nothing in the city burns yet, the wreck of it does)
    }
    // the crossings: lights dead over them (one in three down), here and there the two that met in the middle
    for (let i = 1; i < GRID; i++) {
      for (let j = 1; j < GRID; j++) {
        const x = -G2 + i * PITCH;
        const z = -G2 + j * PITCH;
        const main = j === GRID / 2;
        const r = rng();
        const crash = rng.chance(0.3);
        const [t1, t2] = [rng.range(0, 6), rng.range(0, 6)];
        if (main || r < 0.5) {
          if ((i + j) % 3 === 1) b.prop('pole_down', x + 4.4, z - 4.6, 0.7, { nocollide: true, seed: 1 });
          else if (paveAt(x + 5.2, z - 5.2, { ly: PAVE })?.ly && fits(b, 'traffic_light', x + 5.2, z - 5.2, PI, PAVE)) b.prop('traffic_light', x + 5.2, z - 5.2, PI, { ly: PAVE }); // (their arms out over the cross street)
          if (paveAt(x - 5.2, z + 5.2, { ly: PAVE })?.ly && fits(b, 'traffic_light', x - 5.2, z + 5.2, 0, PAVE)) b.prop('traffic_light', x - 5.2, z + 5.2, 0, { ly: PAVE });
        }
        if (crash && !(fall && Math.hypot(x - (fall.xs - city.x), z - (fall.zc - city.z)) < 34)) {
          const a = pickWeighted(rng, TRAFFIC.slice(0, 5));
          const c2 = pickWeighted(rng, TRAFFIC.slice(0, 5));
          const put1 = fits(b, a, x - 1.4, z + 0.6, t1);
          if (put1) b.wreck(a, x - 1.4, z + 0.6, t1, { trunk: false, zone: ZONE.ROADSIDE });
          // (the second clear of the first by more than their plans say: a plan is a shade short of some of them - the
          // pickup's - and the two are turned every way)
          const clear = !put1 || !kit.solidsOf(a, b.wx(x - 1.4, z + 0.6), b.wz(x - 1.4, z + 0.6), b.ry + t1).some((p) => kit.solidsOf(c2, b.wx(x + 2.4, z - 1.6), b.wz(x + 2.4, z - 1.6), b.ry + t2).some((q) => kit.solidsMeet({ ...p, hx: p.hx + 0.15, hz: p.hz + 0.3 }, q)));
          if (clear && fits(b, c2, x + 2.4, z - 1.6, t2)) b.wreck(c2, x + 2.4, z - 1.6, t2, { trunk: false, zone: ZONE.ROADSIDE });
          b.prop('glass_shards', x + 0.4, z - 0.4, t1, { nocollide: true });
        }
        for (let n = rng.int(2, 4); n > 0; n--) b.prop(LITTER[rng.int(0, LITTER.length - 1)], x + rng.range(-5, 5), z + rng.range(-5, 5), rng.range(0, 6), { nocollide: true, seed: rng.int(0, 2) });
      }
    }
    // a bus slewed across one of the crossings, an articulated truck jack-knifed across another
    const jx = -G2 + rng.int(1, GRID - 1) * PITCH;
    const jz = -G2 + [1, 2, 4, 5][rng.int(0, 3)] * PITCH;
    if (fits(b, 'city_bus', jx + 1, jz - 0.5, 0.9)) b.wreck('city_bus', jx + 1, jz - 0.5, 0.9, { trunk: false });
    const tx = -G2 + rng.int(1, GRID - 1) * PITCH;
    const tz = -G2 + [1, 2, 4, 5][rng.int(0, 3)] * PITCH;
    if (fits(b, 'semi_truck', tx - 1, tz + 0.5, 2.2)) b.wreck('semi_truck', tx - 1, tz + 0.5, 2.2, { trunk: false, seed: 1 });
  }

  // THE HARBOUR STREETS: the two blocks between the ring's south-west curve and the docks, on the town's pitch, paved,
  // a lamp at each corner, and on each a building to each street: warehouses to the docks' road, terraces or a block
  // of flats to the town (dealt from dice of their own: what the town deals stays put)
  {
    const qd = (n) => hash2(n, 37, (seed ^ 0x0d0c5) | 0);
    for (const bj of [GRID - 2, GRID - 1]) {
      const bx = city.x - G2 - PITCH / 2;
      const bz = city.z - G2 + (bj + 0.5) * PITCH;
      const b = new Builder(bx, bz, 0, cityH);
      b.zone = ZONE.ROADSIDE; // (between two places, in neither: nothing in it is said to be in one)
      b.clear(0, 0, PITCH * 0.72);
      b.box(0, 0, 0, PAVED, PAVE, PAVED, 'concrete');
      for (const sz of [-1, 1]) {
        const n = bj * 2 + (sz > 0 ? 1 : 0);
        const L = { x: bx, z: bz + sz * 11.25, w: 42, d: 19.5, ry: Math.atan2(0, -sz), bi: -1, bj, what: '' };
        L.what = (bj === GRID - 1 && sz > 0) || qd(n) < 0.3 ? 'warehouse' : qd(n + 9) < 0.6 ? 'terrace' : 'block';
        const lb = new Builder(L.x, L.z, L.ry, cityH);
        lb.zone = ZONE.ROADSIDE;
        BUILD[L.what](lb, L);
      }
      const E = PAVED / 2 - 0.9;
      for (const [lx, lz] of [[-E, -E], [E, -E], [-E, E], [E, E]]) if (fits(b, 'streetlight', lx, lz, 0, PAVE)) b.prop('streetlight', lx, lz, lx < 0 ? -PI / 2 : PI / 2, { ly: PAVE });
    }
  }
  return lots;
}
