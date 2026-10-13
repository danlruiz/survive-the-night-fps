// The Mother and her babies, in-process against a real Game and decoded as a client does: one walker in twenty spawns
// as her (never an admin's forced one), she is never drawn into a night's waves as a kind of her own, and her babies
// never join the horde on their own; a bullet in her belly - her front, between the
// hips and bellyTop of her height - bursts it (ZSTATUS.BURST, seen by a client) and her twins crawl out after whoever
// shot her; a bullet in her head, her legs or her back does not, nor does a second one in the hole; one shot dead
// through the belly still lets them out; the babies keep low (a shot over one misses) and come on faster than the walking
// dead but slower than a survivor walks; and the client has them built, the belly torn open on cue, and their cry.
// usage: node scripts/test-mother.js [seed]
import './clip/dom-stub.js';
import { Game } from '../server/game.js';
import { C2S, S2C, PROTOCOL_VERSION, ZSTATUS, Writer, Reader, qangle16, qpitch, writeInput } from '../shared/protocol.js';
import { ZTYPE, ZOMBIE_DEFS, ITEM } from '../shared/defs.js';
import { EYE_HEIGHT, LEG_ZONE, WALK_SPEED } from '../shared/constants.js';
import { BESTIARY } from '../shared/bestiary.js';
import { readSnapshot } from '../client/net/decode.js';

const seed = +(process.argv[2] || 4242);
const game = new Game({ seed, godMode: true, dayLength: 3600, log: () => {} });
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const def = ZOMBIE_DEFS[ZTYPE.MOTHER];
const bdef = ZOMBIE_DEFS[ZTYPE.BABY];

// ---------------------------------------------------------------- the kinds
check('the Mother has a belly and a brood of two', !!def && !def.boss && !def.common && def.legs && def.bellyTop > LEG_ZONE && def.bellyTop < def.headY / def.height && def.brood === 2);
check('...her babies crawl, low and frail, and are born, not sent', !!bdef && bdef.crawl && bdef.born && bdef.height < 0.5 && bdef.hp < ZOMBIE_DEFS[ZTYPE.WALKER].hp && bdef.speed > ZOMBIE_DEFS[ZTYPE.WALKER].speed && bdef.speed < WALK_SPEED);
check('...both in the bestiary', BESTIARY.some((e) => e.t === ZTYPE.MOTHER) && BESTIARY.some((e) => e.t === ZTYPE.BABY));
check('...and no night of her own: she comes from the walkers, not on a dawn card', def.rolled === true && def.minNight === 1 && !def.intro);
{
  const kinds = (n) => {
    game.day = n;
    game.startNight();
    return game.waves.flatMap((wv) => wv.queue);
  };
  let drawn = 0;
  for (let n = 1; n <= 14; n++) drawn += kinds(n).filter((t) => t === ZTYPE.MOTHER).length;
  check('never drawn into a night\'s waves as a kind', drawn === 0, `${drawn}`);
  let babies = 0;
  for (let n = 1; n <= 14; n++) babies += kinds(n).filter((t) => t === ZTYPE.BABY).length;
  check('no baby ever comes with the horde on its own', babies === 0, `${babies}`);
  game.waves = [];
  game.startDay?.();
  game.day = 1;
}

// ---------------------------------------------------------------- one walker in twenty
{
  let made = 0, mothers = 0, forced = 0;
  for (let i = 0; i < 2000; i++) {
    const x = (i % 40) * 4 - 80, z = Math.floor(i / 40) * 4 - 40;
    const w = game.zm.spawn(ZTYPE.WALKER, x, z);
    if (w) {
      made++;
      if (w.ztype === ZTYPE.MOTHER) mothers++;
      game.removeEntity(w);
    }
    const f = game.zm.spawn(ZTYPE.WALKER, x + 0.5, z + 0.5, { force: true });
    if (f) {
      if (f.ztype === ZTYPE.WALKER) forced++;
      game.removeEntity(f);
    }
  }
  const share = mothers / Math.max(1, made);
  check('one walker in twenty spawns as a Mother', share > 0.03 && share < 0.07, `${mothers} of ${made} = ${(share * 100).toFixed(1)}%`);
  check('...but an admin\'s forced walker is a walker', forced === made, `${forced} of ${made}`);
}

// ---------------------------------------------------------------- a client
function client(name) {
  const c = { name, id: 0, net: { tick: 0, ack: 0 }, global: null, self: {}, store: { ents: new Map(), onCreate() {}, onRemove() {}, onUpdate() {} }, seq: 0 };
  const nop = () => {};
  c.handler = new Proxy({}, { get: (t, k) => t[k] || nop });
  c.conn = {
    send(bytes) {
      const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      const t = r.u8();
      if (t === S2C.WELCOME) c.id = r.u16();
      else if (t === S2C.SNAPSHOT) readSnapshot(r, c);
    },
  };
  c.session = game.onOpen(c.conn);
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  game.onMessage(c.session, w.bytes().slice());
  c.p = () => game.players.get(c.id);
  if (c.p()) c.p().admin = true;
  c.input = (yaw = 0) => {
    const w2 = new Writer(64);
    w2.u8(C2S.INPUT);
    w2.u16(game.tick & 0xffff);
    w2.u8(0);
    const cmds = [];
    for (let i = 0; i < 3; i++) {
      c.seq = (c.seq + 1) & 0xffff;
      cmds.push({ seq: c.seq, buttons: 0, qyaw: qangle16(yaw), qpitch: qpitch(0), slot: 255 });
    }
    writeInput(w2, cmds);
    game.onMessage(c.session, w2.bytes().slice());
  };
  c.tp = (x, z) => game.handleChat(c.p(), `/tp ${x} ${z}`);
  return c;
}

// ---------------------------------------------------------------- open, level ground
const w = game.world;
const open = (x, z) => Math.abs(x) < 250 && Math.abs(z) < 250 && !w.isDeepWater(x, z) && !game.nav.isBlocked(x, z);
let spot = null;
for (let x = -200; x <= 200 && !spot; x += 16) {
  for (let z = -200; z <= 200 && !spot; z += 16) {
    const h0 = w.heightAt(x, z);
    let ok = open(x, z) && game.nav.segClear(x, z, x, z - 20);
    for (let d = 0; d <= 20 && ok; d += 2) ok = open(x, z - d) && Math.abs(w.heightAt(x, z - d) - h0) < 1;
    if (ok) ok = game.zm.clearLine(x, h0 + 1.6, z, x, h0 + 0.3, z - 12);
    if (ok) spot = { x, z };
  }
}
check('found open level ground', !!spot, spot ? `(${spot.x}, ${spot.z})` : '');
if (!spot) {
  console.log('\nFAILED: no ground to test on');
  process.exit(1);
}

const A = client('Alice');
const a = A.p();
const s = a.state;
const run = (ticks) => {
  for (let i = 0; i < ticks; i++) {
    A.input();
    game.update();
  }
};
const clear = () => {
  for (const z of game.zombies) game.combat.killZombie(z, null);
  run(40);
};
A.tp(spot.x, spot.z);
run(4);
clear();

const babiesOf = (before) => game.zombies.filter((z) => !before.has(z) && z.ztype === ZTYPE.BABY && !z.dead);
// one 8 m off, facing the survivor (or turned away from them)
const put = (d = 8, away = false) => {
  const m = game.zm.spawn(ZTYPE.MOTHER, s.x, s.z - d, { horde: true });
  m.yaw = away ? 0 : Math.PI; // (yaw pi faces +z: towards the survivor, who stands at +z of her)
  m.specialCd = 99;
  return m;
};
// a pistol round from the survivor's eye at height h over the feet of z (straight, no spread)
const shoot = (z, h, weapon = ITEM.PISTOL) => {
  const ey = s.y + EYE_HEIGHT;
  const dx = z.x - s.x, dz = z.z - s.z, dist = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  game.combat.fire(a, { weapon, x: s.x, y: ey, z: s.z, yaw, pitch: Math.atan2(z.y + h - ey, dist), recoilPitch: 0, spread: 0, seed: 7 });
};
const status = (z) => A.store.ents.get(z.id)?.q?.[8] ?? -1;

// ---------------------------------------------------------------- the head, the legs, the back: nothing comes out
{
  let m = put();
  let before = new Set(game.zombies);
  shoot(m, def.headY);
  check('a shot in her head hurts her, and bursts nothing', m.hp < m.maxHp && !m.burst && !babiesOf(before).length, `${m.hp.toFixed(0)}/${m.maxHp.toFixed(0)}`);
  const hp = m.hp;
  shoot(m, def.height * 0.25);
  check('...nor one in her legs', m.hp < hp && !m.burst && !babiesOf(before).length);
  game.combat.killZombie(m, null);
  m = put(8, true);
  before = new Set(game.zombies);
  shoot(m, def.height * 0.58);
  check('...nor one in her back at belly height', m.hp < m.maxHp && !m.burst && !babiesOf(before).length);
  game.combat.killZombie(m, null);
  run(10);
}

// ---------------------------------------------------------------- the belly
{
  clear();
  const m = put();
  const before = new Set(game.zombies);
  shoot(m, def.height * 0.58);
  const born = babiesOf(before);
  check('a shot in her belly bursts it', m.burst && m.hp < m.maxHp);
  check(`...and her twins crawl out of it (${def.brood})`, born.length === def.brood, `${born.length}`);
  check('...right in front of her', born.every((b) => Math.hypot(b.x - m.x, b.z - m.z) < 1.5 && b.z > m.z - 0.2), born.map((b) => `${(b.z - m.z).toFixed(2)}`).join(' '));
  check('...of the horde, set on whoever shot her', born.every((b) => b.horde && b.target === a.id && b.aggroId === a.id && b.aggroT > 20));
  const apart0 = born.length === 2 ? Math.hypot(born[0].x - born[1].x, born[0].z - born[1].z) : 0;
  run(2);
  const apart = born.length === 2 ? Math.hypot(born[0].x - born[1].x, born[0].z - born[1].z) : 0;
  check('...each thrown off to its own side, and tumbling further apart', apart0 > 1 && apart > apart0 + 0.3, `${apart0.toFixed(2)} m -> ${apart.toFixed(2)} m in 0.1 s`);
  check('the client sees her belly torn open (ZSTATUS.BURST)', (status(m) & ZSTATUS.BURST) !== 0, `${status(m)}`);
  const again = new Set(game.zombies);
  shoot(m, def.height * 0.58);
  check('a second shot in the hole brings no more', babiesOf(again).length === 0);
  // they come for her killer, crawling
  const near = (z) => Math.hypot(z.x - s.x, z.z - s.z);
  game.combat.killZombie(m, null);
  const d0 = born.reduce((n, b) => n + near(b), 0) / born.length;
  run(40);
  const d1 = born.reduce((n, b) => n + near(b), 0) / born.length;
  const pace = (d0 - d1) / 2;
  check('...and the babies crawl at the survivor', d1 < d0 - 2, `${d0.toFixed(1)} m -> ${d1.toFixed(1)} m in 2 s`);
  check('...faster than the walking dead, slower than a survivor walks', pace > ZOMBIE_DEFS[ZTYPE.WALKER].speed * 0.9 && pace < WALK_SPEED, `${pace.toFixed(2)} m/s`);
  // low: a round at a walker's chest height goes over one; one at its body does not
  const b = born[0];
  b.x = s.x;
  b.z = s.z - 6;
  b.y = w.heightAt(b.x, b.z);
  game.fillHistory(b);
  const hp = b.hp;
  shoot(b, 1.2);
  check('a round at chest height goes over a baby', b.hp === hp && !b.dead);
  shoot(b, bdef.height * 0.5);
  check('...one at it does not', b.hp < hp || b.dead, `${b.hp.toFixed(0)}/${hp.toFixed(0)}`);
  run(10);
}

// ---------------------------------------------------------------- shot dead through the belly
{
  clear();
  const m = put();
  m.hp = 1;
  const before = new Set(game.zombies);
  shoot(m, def.height * 0.58);
  check('shot dead through the belly, she still lets them out', m.dead && m.burst && babiesOf(before).length === def.brood, `${babiesOf(before).length}`);
  clear();
}

// ---------------------------------------------------------------- the client
{
  const { createZombie } = await import('../client/render/models/characters.js');
  const mv = createZombie(ZTYPE.MOTHER, 3);
  const bv = createZombie(ZTYPE.BABY, 3);
  const inst = mv._inst;
  const womb = inst.X.womb, wound = inst.X.wound;
  check('the client builds her with the bump whole and the hole hidden', womb !== undefined && wound !== undefined && inst.gone[womb] === 0 && inst.gone[wound] === 1);
  mv.setBurst(true);
  check('...and torn open on cue', inst.gone[womb] === 1 && inst.gone[wound] === 0);
  check('...and a baby, on its front from the start', bv._inst.crawler === true && !mv._inst.crawler);
  mv.dispose();
  bv.dispose();
  const { SFX_DEFS } = await import('../client/audio/synth.js');
  const cry = SFX_DEFS.find((d) => d.bank === 'z_baby_cry');
  let len = 0, peak = 0;
  if (cry) {
    const out = cry.gen(24000, mulberry(5), 0);
    len = out.length / 24000;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
  }
  check('the babies cry: a wail of a second or two, loud', !!cry && len > 1 && len < 3.5 && peak > 0.5, `${len.toFixed(2)} s, peak ${peak.toFixed(2)}`);
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(fails.length ? `\nFAILED: ${fails.length}\n  ${fails.join('\n  ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
