// The crawler (ZTYPE.CRAWLER: server/zombies.js LATCH_*, PERCH_*, perch, fireSpecial case 2, special states 2 and 3),
// against the real server in-process with a survivor driven by real input. A flying squirrel, it waits up trees:
//   - after a survivor, it makes for a tree near them (not over them), runs up it and clings there, chittering now and
//     then, and leaves alone a survivor who keeps away from that tree; one who comes close under it it glides down on,
//     more slowly than a leaper's pounce, and has by the face. A tree cut down under it drops it
// With no tree to go to it hunts on the ground: crawlers are put down 4-7 m from the survivor on open ground, already
// wound up to go, with no tree to make for, and each is watched until it is on them or 6 s are up:
//   - a survivor who stands still has one on their face from every one of them: it comes down at head height, not on
//     their chest as a leaper does, and stays there, just in front of their eyes, while it has them
//   - it does not bite or claw anyone, on their face or off it: all it does is blind them, and it lets go when it
//     has had latchMax s
//   - with one on their face they are blind but still on their feet: they can walk on, slowed, and it stays on
//   - thrashing the view about tears it off in a couple of seconds; looking round as anyone does in a fight does not,
//     and Space (the leaper's shove) does nothing to it. Once it is off it reels and does not take them again at once
//   - a teammate's blow knocks it off, and it does not go for a face that already has something on it
//   - it joins the horde on its own night (drawn from the seed: joinNight) and not before
// usage: node scripts/test-crawler.js [seed ...]   (VERBOSE=1 prints each scenario's numbers)
import { Game } from '../server/game.js';
import { joinNight } from '../shared/nights.js';
import { leapAim } from '../server/zombies.js';
import { C2S, S2C, PROTOCOL_VERSION, Writer, Reader, qangle16, qpitch, writeInput } from '../shared/protocol.js';
import { BTN, SERVER_TICK_RATE, CMD_DT, PIN_FACE, WALK_SPEED } from '../shared/constants.js';
import { ZTYPE, ZOMBIE_DEFS, SOUND } from '../shared/defs.js';
import { COL } from '../shared/collision.js';
import { fellTree } from '../shared/felling.js';
import { groundAt, raycastWorld } from '../shared/collision.js';

const seeds = process.argv.slice(2).map(Number).filter((n) => n > 0);
if (!seeds.length) seeds.push(1, 2, 3);
const TRIALS = 8;
const DT = 1 / SERVER_TICK_RATE;
const DEF = ZOMBIE_DEFS[ZTYPE.CRAWLER];
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function setup(seed) {
  const game = new Game({ seed, godMode: true, dayLength: 3600, themes: false, log: () => {} });
  const c = { id: 0, seq: 0, yaw: 0 };
  c.conn = {
    send(bytes) {
      const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      if (r.u8() === S2C.WELCOME) c.id = r.u16();
    },
  };
  c.session = game.onOpen(c.conn);
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str('Prey');
  game.onMessage(c.session, w.bytes().slice());
  // yawAt(k): the view's yaw for the k-th command from now (a command is CMD_DT s), for a survivor throwing their head
  // about; without it the view holds still at c.yaw
  c.k = 0;
  c.input = (buttons, yawAt = null) => {
    const w2 = new Writer(64);
    w2.u8(C2S.INPUT);
    w2.u16(game.tick & 0xffff);
    w2.u8(0);
    const cmds = [];
    for (let i = 0; i < 3; i++) {
      c.seq = (c.seq + 1) & 0xffff;
      if (yawAt) c.yaw = yawAt(c.k);
      c.k++;
      cmds.push({ seq: c.seq, buttons, qyaw: qangle16(c.yaw), qpitch: qpitch(0), slot: 255 });
    }
    writeInput(w2, cmds);
    game.onMessage(c.session, w2.bytes().slice());
  };
  for (let i = 0; i < 5; i++) {
    c.input(0);
    game.update();
  }
  // its chitters (game.sound)
  const calls = [];
  const snd = game.sound.bind(game);
  game.sound = (id, x, y, z, ...rest) => {
    if (id === SOUND.CRAWLER_CHITTER) calls.push({ t: game.tick * DT, y });
    return snd(id, x, y, z, ...rest);
  };
  // anything it does to anyone's health (only a nibble now and then, and only to the face it has hold of)
  const bites = [];
  const dp = game.damagePlayer.bind(game);
  game.damagePlayer = (p, amount, src, ...rest) => {
    if (src?.ztype === ZTYPE.CRAWLER) bites.push({ t: game.tick * DT, amount, day: game.day, face: p.state.pinned === PIN_FACE });
    return dp(p, amount, src, ...rest);
  };
  return { game, c, p: game.players.get(c.id), bites, calls };
}

// open, flat-ish ground around the car's valley: nothing standing within R m at knee or head height, no water
const _ray = { t: -1, col: null, terrain: false };
function findSpot(game, R = 12) {
  const w = game.world;
  const car = w.car;
  for (let r = 60; r < 280; r += 7) {
    for (let a = 0; a < 6.28; a += 0.21) {
      const x = car.x + Math.sin(a) * r;
      const z = car.z + Math.cos(a) * r;
      if (Math.abs(x) > 290 || Math.abs(z) > 290 || w.isDeepWater(x, z) || game.nav.isBlocked(x, z)) continue;
      let mn = Infinity;
      let mx = -Infinity;
      let ok = true;
      for (let k = 0; k < 16 && ok; k++) {
        const b = (k / 16) * 6.28;
        for (const rr of [3, 6, 9, R]) {
          const h = w.heightAt(x + Math.sin(b) * rr, z + Math.cos(b) * rr);
          mn = Math.min(mn, h);
          mx = Math.max(mx, h);
          if (w.isDeepWater(x + Math.sin(b) * rr, z + Math.cos(b) * rr)) ok = false;
        }
        const y0 = w.heightAt(x, z);
        for (const hh of [0.3, 1.4]) {
          raycastWorld(w, x, y0 + hh, z, Math.sin(b), 0, Math.cos(b), R, _ray);
          if (_ray.t >= 0 && !_ray.terrain) ok = false;
        }
      }
      if (ok && mx - mn <= 0.6) return { x, z };
    }
  }
  return null;
}

function clear(game) {
  for (const z of [...game.zombies]) {
    game._listRemove(game.zombies, z);
    game.removeEntity(z);
  }
  game.zm.herds.reset();
  game.zm.maintainT = game.zm.herds.spawnT = 1e9;
}

// a crawler put down d m from the survivor standing at spot, ready to spring; watched until it is on them or 6 s are
// up. Returns the crawler, and what it was doing the tick it took them
function trial(env, spot, d, rng) {
  const { game, c, p } = env;
  clear(game);
  const s = p.state;
  s.x = spot.x;
  s.z = spot.z;
  s.y = groundAt(game.world, s.x, s.z, 200, 0.3);
  s.vx = s.vy = s.vz = 0;
  s.pinned = s.pulled = 0;
  s.shove = 0;
  s.stunT = 0;
  p.pinnedBy = 0;
  const a = rng() * Math.PI * 2;
  const z = game.zm.spawn(ZTYPE.CRAWLER, spot.x + Math.sin(a) * d, spot.z + Math.cos(a) * d, { horde: true });
  z.specialCd = 0.3;
  z.treeT = Infinity; // (no tree to make for: on the ground it springs as a leaper does)
  const r = { z, latched: false, leaps: 0, peak: -Infinity };
  let air = false;
  for (let i = 0; i < 6 / DT; i++) {
    c.input(0);
    game.update();
    if (z.state === 2 && !air) r.leaps++;
    air = z.state === 2;
    if (air) r.peak = Math.max(r.peak, z.y - s.y);
    if (z.state === 3 && s.pinned && p.pinnedBy === z.id) {
      r.latched = true;
      break;
    }
  }
  return r;
}

// up a tree: a survivor stands TREE_OFF m from a tree with open ground round it and a crawler is put down 20 m off them.
// It should be up a tree within 15 s, chittering; a survivor who keeps where they are (well away from its tree) for 12 s
// is left alone; one who then walks in under it is glided down on and had within 5 s
function treeTrial(env, rng) {
  const { game, c, p, calls } = env;
  const w = game.world;
  const s = p.state;
  const out = { up: false, tree: null, high: 0, calls: 0, left: true, latched: false, air: 0, felledDrops: false, why: '' };
  // a tree that stands on open, level ground, with nothing else solid within 9 m of it
  let tree = null;
  for (let k = 0; k < 400 && !tree; k++) {
    const x = (rng() - 0.5) * 2 * (w.half - 40);
    const z = (rng() - 0.5) * 2 * (w.half - 40);
    for (const col of w.staticGrid.query(x, z, 30, [])) {
      if (!(col.flags & COL.TREE) || col.y1 - col.y0 < 10 || w.isDeepWater(col.x, col.z)) continue;
      const near = w.staticGrid.query(col.x, col.z, 9, []).filter((o) => o !== col && Math.hypot(o.x - col.x, o.z - col.z) < 9 + (o.r || 1));
      const g0 = w.heightAt(col.x, col.z);
      let flat = true;
      for (let a = 0; a < 6.28; a += 0.5) if (Math.abs(w.heightAt(col.x + Math.sin(a) * 8, col.z + Math.cos(a) * 8) - g0) > 1) flat = false;
      if (!near.length && flat && !game.nav.isBlocked(col.x + 8, col.z)) {
        tree = col;
        break;
      }
    }
  }
  if (!tree) return ((out.why = 'no lone tree'), out);
  clear(game);
  s.pinned = s.pulled = 0;
  s.shove = 0;
  p.pinnedBy = 0;
  const put = (d) => {
    s.x = tree.x + d;
    s.z = tree.z;
    s.y = groundAt(w, s.x, s.z, 200, 0.3);
    s.vx = s.vy = s.vz = 0;
  };
  put(40); // (past PERCH_DROP, 21 m: a survivor inside that drops it)
  const z = game.zm.spawn(ZTYPE.CRAWLER, s.x + 20, s.z, { horde: true });
  calls.length = 0;
  for (let i = 0; i < 15 / DT && !z.perched; i++) {
    c.input(0);
    game.update();
  }
  out.up = z.perched;
  if (!z.perched) return ((out.why = `not up a tree (state ${z.state}, at ${(z.y - w.heightAt(z.x, z.z)).toFixed(1)} m)`), out);
  out.tree = z.tree;
  out.high = z.y - (z.tree.y0 + 1);
  const keep = Math.hypot(s.x - z.tree.x, s.z - z.tree.z);
  out.keep = keep;
  for (let i = 0; i < 12 / DT; i++) {
    c.input(0);
    game.update();
    if (s.pinned || !z.perched) out.left = false;
  }
  if (!z.tree) { out.why = `fell off the tree while the survivor kept away (perched ${z.perched}, dazed ${z.dazedT}, state ${z.state})`; return out; }
  out.calls = calls.filter((k) => k.y > z.tree.y0 + 2).length;
  // in under it: put 7 m off its trunk on a side of the bark it can see round (a side blocked by something else is not
  // one it drops from), and held there
  const t = z.tree;
  for (let k = 0; k < 8; k++) {
    const side = z.perchA + (k * Math.PI) / 4;
    const xx = t.x + Math.sin(side) * 7;
    const zz = t.z + Math.cos(side) * 7;
    if (game.zm.clearLine(z.x, z.y + 0.2, z.z, xx, groundAt(w, xx, zz, 200, 0.3) + 1.4, zz)) {
      z.perchA = side;
      break;
    }
  }
  s.x = t.x + Math.sin(z.perchA) * 7;
  s.z = t.z + Math.cos(z.perchA) * 7;
  s.y = groundAt(w, s.x, s.z, 200, 0.3);
  let airT = 0;
  for (let i = 0; i < 5 / DT; i++) {
    c.input(0);
    game.update();
    if (z.state === 2) airT += DT;
    if (z.state === 3 && s.pinned === PIN_FACE && p.pinnedBy === z.id) {
      out.latched = true;
      break;
    }
  }
  out.air = airT;
  game.zm.releaseLink(z);
  // another up the same kind of tree, and the tree cut down under it
  {
    clear(game);
    put(12);
    const z2 = game.zm.spawn(ZTYPE.CRAWLER, s.x + 20, s.z, { horde: true });
    for (let i = 0; i < 15 / DT && !z2.perched; i++) {
      c.input(0);
      game.update();
    }
    if (z2.perched) {
      fellTree(w, z2.tree);
      for (let i = 0; i < 2 / DT; i++) {
        c.input(0);
        game.update();
      }
      out.felledDrops = !z2.perched && z2.y - w.heightAt(z2.x, z2.z) < 0.5;
    }
  }
  return out;
}

const trees = [];

const runs = { tried: 0, latched: 0, onFace: 0, bites: [], held: [], time: [], walk: { n: 0, ok: 0, d: [] }, shake: { n: 0, ok: 0, t: [] }, look: { n: 0, ok: 0 }, mash: { n: 0, ok: 0 }, struck: { n: 0, ok: 0 }, taken: { n: 0, ok: 0 }, flee: { n: 0, ok: 0, d: [] } };

for (const seed of seeds) {
  const env = setup(seed);
  const spot = findSpot(env.game);
  if (!spot) {
    check(`seed ${seed}: open ground to try it on`, false);
    continue;
  }
  const rng = mulberry(seed * 977);
  const { game, c, p, bites } = env;
  const s = p.state;

  // a survivor standing still: it springs, comes down on their face and holds on there
  for (let k = 0; k < TRIALS; k++) {
    const r = trial(env, spot, 4 + (k % 4), rng);
    runs.tried++;
    if (!r.latched) {
      if (process.env.VERBOSE) console.log(`      seed ${seed} trial ${k}: not latched (${r.leaps} leaps)`);
      continue;
    }
    runs.latched++;
    // a few ticks on: where it is held (just in front of their eyes, at their head) and what it does there
    let ok = true;
    for (let i = 0; i < 10; i++) {
      c.input(0);
      game.update();
      const fwd = -(Math.sin(s.yaw) * (r.z.x - s.x) + Math.cos(s.yaw) * (r.z.z - s.z)); // (in front of them: + along their view)
      if (!(r.z.y - s.y > 1.3 && r.z.y - s.y < 1.65 && fwd > 0 && fwd < 0.5 && s.pinned)) ok = false;
    }
    if (ok) runs.onFace++;
  }

  // it holds on, nibbling at them, and lets go once it has had latchMax s
  {
    const r = trial(env, spot, 5, rng);
    if (r.latched) {
      const t0 = game.tick * DT;
      const b0 = bites.length;
      let released = -1;
      for (let i = 0; i < (DEF.latchMax + 2) / DT; i++) {
        c.input(0);
        game.update();
        if (!s.pinned) {
          released = game.tick * DT - t0;
          break;
        }
      }
      runs.time.push(released);
      runs.held.push(bites.length - b0);
      if (process.env.VERBOSE) console.log(`      seed ${seed}: let go after ${released.toFixed(2)} s`);
    }
  }

  // on their face it leaves them their feet: held forward for 2 s they walk on, slower than they would, and it stays on
  {
    const r = trial(env, spot, 5, rng);
    if (r.latched) {
      runs.walk.n++;
      const x0 = s.x, z0 = s.z;
      let on = true;
      for (let i = 0; i < 2 / DT; i++) {
        c.input(BTN.FWD | BTN.SPRINT);
        game.update();
        if (s.pinned !== PIN_FACE || r.z.state !== 3) on = false;
      }
      const d = Math.hypot(s.x - x0, s.z - z0);
      runs.walk.d.push(d);
      if (on && d > 2 && d < WALK_SPEED * 2) runs.walk.ok++;
    }
  }

  // thrashing the view about (a third of a turn either way, three times a second) tears it off in a couple of seconds;
  // off, it reels, and does not take them again while they run. Looking round as anyone does (a sweep of 1.5 rad/s,
  // turning back now and then) never does, and nor does mashing Space
  for (const how of ['shake', 'look', 'mash']) {
    const r = trial(env, spot, 5, rng);
    if (!r.latched) continue;
    const z = r.z;
    const yaw0 = c.yaw;
    c.k = 0;
    const yawAt = how === 'shake' ? (k) => yaw0 + 1.05 * Math.sin(2 * Math.PI * 3 * k * CMD_DT) : how === 'look' ? (k) => yaw0 + 1.5 * Math.sin(k * CMD_DT) * 1.6 : null;
    let released = -1;
    let again = false;
    let dazed = false;
    for (let i = 0; i < 4 / DT; i++) {
      const btn = released >= 0 ? BTN.FWD | BTN.SPRINT : how === 'mash' && i % 3 === 0 ? BTN.JUMP : 0;
      c.input(btn, released >= 0 ? null : yawAt);
      game.update();
      if (released < 0 && !s.pinned) released = i;
      if (released >= 0 && z.dazedT > 0) dazed = true;
      if (released >= 0 && i > released + 2 && (z.state === 3 || s.pinned)) again = true;
    }
    runs[how].n++;
    if (how === 'shake') {
      const took = released * DT;
      runs.shake.t.push(took);
      if (released >= 0 && took < 2.5 && dazed && !again) runs.shake.ok++;
    } else if (released < 0) runs[how].ok++;
  }

  // shaken off, it runs: with the survivor standing still for 9 s it makes off for a tree well away from them (or up
  // one already), and does not come back down on them
  {
    const r = trial(env, spot, 5, rng);
    if (r.latched) {
      const z = r.z;
      const yaw0 = c.yaw;
      c.k = 0;
      let released = -1;
      for (let i = 0; i < 3 / DT && released < 0; i++) {
        c.input(0, (k) => yaw0 + 1.05 * Math.sin(2 * Math.PI * 3 * k * CMD_DT));
        game.update();
        if (!s.pinned) released = i;
      }
      if (released >= 0) {
        runs.flee.n++;
        let again = false;
        for (let i = 0; i < 9 / DT; i++) {
          c.input(0);
          game.update();
          if (i > 2 && (z.state === 3 || s.pinned)) again = true;
        }
        const d = Math.hypot(z.x - s.x, z.z - s.z);
        runs.flee.d.push(`${d.toFixed(1)} m${z.perched ? ' up a tree' : ''}`);
        if (!again && !z.dead && d > 10) runs.flee.ok++;
      }
    }
  }

  // a teammate's blow knocks it off
  {
    const r = trial(env, spot, 5, rng);
    if (r.latched) {
      runs.struck.n++;
      game.combat.damageZombie(r.z, 8, null, { melee: true });
      if (!s.pinned && r.z.state !== 3 && !r.z.dead) runs.struck.ok++;
    }
  }

  // it leaves a face that already has something on it alone
  {
    clear(game);
    s.x = spot.x;
    s.z = spot.z;
    s.y = groundAt(game.world, s.x, s.z, 200, 0.3);
    s.vx = s.vy = s.vz = 0;
    const leaper = game.zm.spawn(ZTYPE.LEAPER, s.x - Math.sin(s.yaw) * 0.55, s.z - Math.cos(s.yaw) * 0.55, { horde: true });
    leaper.state = 3;
    leaper.link = p.id;
    leaper.linkT = -100; // (it holds on for the length of this)
    p.pinnedBy = leaper.id;
    s.pinned = 1;
    const z = game.zm.spawn(ZTYPE.CRAWLER, s.x + 5, s.z, { horde: true });
    z.specialCd = 0.3;
    let leapt = false;
    for (let i = 0; i < 3 / DT; i++) {
      c.input(0);
      game.update();
      if (z.state === 1 || z.state === 2 || z.state === 3) leapt = true;
    }
    runs.taken.n++;
    if (!leapt) runs.taken.ok++;
    game.zm.releaseLink(leaper);
  }
  runs.bites.push(...bites);
  {
    const r = treeTrial(env, mulberry(seed * 31));
    trees.push(r);
    if (process.env.VERBOSE) console.log(`      seed ${seed}: up ${r.up} ${r.why} ${r.high?.toFixed?.(1)} m, ${r.keep?.toFixed?.(1)} m off, ${r.calls} chitters, left alone ${r.left}, latched ${r.latched} after ${r.air.toFixed(2)} s in the air, felled drops ${r.felledDrops}`);
  }
}

check('after a survivor, it runs up a tree near them (18-96 m off them) and clings there 3.5-6.5 m up', trees.length === seeds.length && trees.every((r) => r.up && r.high >= 3.4 && r.high <= 6.6 && r.keep >= 18 && r.keep <= 99), trees.map((r) => (r.up ? `${r.high.toFixed(1)} m up, ${r.keep.toFixed(1)} m off` : r.why)).join(' / '));
check('...and chitters up there now and then, so it can be heard', trees.every((r) => r.calls >= 2), trees.map((r) => r.calls).join('/'));
check('...and leaves alone a survivor who keeps away from its tree', trees.every((r) => r.up && r.left));
check('...and glides down on one who comes in under it, and has them by the face (a glide of 0.37 s or more: CRAWLER_FLIGHT)', trees.every((r) => r.latched && r.air > 0.3), trees.map((r) => `${r.latched ? 'had them' : 'missed'} after ${r.air.toFixed(2)} s in the air`).join(' / '));
check('a tree cut down under it drops it', trees.every((r) => r.felledDrops));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
check('a survivor standing still has one on their face from every crawler that springs at them', runs.tried >= seeds.length * TRIALS && runs.latched === runs.tried, `${runs.latched} of ${runs.tried} (${pct(runs.latched, runs.tried)})`);
check('...held at their head, just in front of their eyes (not on their chest, as a leaper)', runs.latched > 0 && runs.onFace === runs.latched, `${runs.onFace} of ${runs.latched}`);
check(`it holds on and lets go after ${DEF.latchMax} s`, runs.time.length === seeds.length && runs.time.every((t) => t >= DEF.latchMax - 0.2 && t <= DEF.latchMax + 0.5), `let go after ${runs.time.map((t) => t.toFixed(2)).join('/')} s`);
const nibble = (b) => DEF.latchDmg * (1 + 0.05 * b.day);
const perHold = Math.floor(DEF.latchMax / DEF.latchRate);
check(`on their face it nibbles: ${DEF.latchDmg} hp (+5% a night) every ${DEF.latchRate} s, about ${perHold} bites over a full hold`, runs.held.length === seeds.length && runs.held.every((n) => n >= perHold - 2 && n <= perHold + 1) && runs.bites.every((b) => Math.abs(b.amount - nibble(b)) < 1e-9), `${runs.held.join('/')} bites a hold, ${[...new Set(runs.bites.map((b) => b.amount.toFixed(2)))].join('/')} hp each`);
check('...and that is all the harm it does: nothing to anyone it has not got by the face', runs.latched > 0 && runs.bites.length > 0 && runs.bites.every((b) => b.face), `${runs.bites.filter((b) => !b.face).length} of ${runs.bites.length} off the face`);
check('with one on their face they still walk on, slowed (no sprint), and it stays on', runs.walk.n >= seeds.length && runs.walk.ok === runs.walk.n, `${runs.walk.ok} of ${runs.walk.n} (${runs.walk.d.map((d) => d.toFixed(1)).join('/')} m in 2 s)`);
check('thrashing their head about tears it off in under a second; off, it reels and does not take them again as they run', runs.shake.n >= seeds.length && runs.shake.ok === runs.shake.n, `${runs.shake.ok} of ${runs.shake.n} (${runs.shake.t.map((t) => t.toFixed(2)).join('/')} s)`);
check('...looking round as anyone does in a fight does not', runs.look.n >= seeds.length && runs.look.ok === runs.look.n, `${runs.look.ok} of ${runs.look.n}`);
check("...and mashing Space (the leaper's shove) does not", runs.mash.n >= seeds.length && runs.mash.ok === runs.mash.n, `${runs.mash.ok} of ${runs.mash.n}`);
check('shaken off, it runs off for a tree away from them, and does not come straight back', runs.flee.n >= seeds.length && runs.flee.ok === runs.flee.n, `${runs.flee.ok} of ${runs.flee.n} (${runs.flee.d.join(' / ')} off after 9 s)`);
check("a teammate's blow knocks it off", runs.struck.n >= seeds.length && runs.struck.ok === runs.struck.n, `${runs.struck.ok} of ${runs.struck.n}`);
check('it does not spring at a face that already has something on it', runs.taken.n === seeds.length && runs.taken.ok === runs.taken.n, `${runs.taken.ok} of ${runs.taken.n}`);
check('a crawler goes for the face, a leaper still for the chest', leapAim({ ztype: ZTYPE.CRAWLER }) > 1.2 && leapAim({ ztype: ZTYPE.LEAPER }) < 1);

// the horde: none before its night, and on its night at least one (the dawn card says so)
{
  const game = new Game({ seed: 5, dayLength: 3600, themes: false, log: () => {} });
  const count = (night) => {
    game.day = night;
    game.startNight();
    return game.waves.reduce((n, wv) => n + wv.queue.filter((t) => t === ZTYPE.CRAWLER).length, 0);
  };
  const N = joinNight(game.seed, ZTYPE.CRAWLER);
  const before = [];
  for (let n = 1; n < N; n++) before.push(count(n));
  const on = count(N);
  const after = count(N + 2);
  check(`crawlers join the horde on night ${N} (this seed's) and not before`, before.every((k) => k === 0) && on >= 1 && after >= 1, `nights 1-${N - 1}: ${before.join('/')}, night ${N}: ${on}, night ${N + 2}: ${after}`);
}

if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
process.exit(0);
