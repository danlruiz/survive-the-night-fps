// Co-op roles (#276: shared/roles.js, server/roles.js): in-process checks against a real Game, with what the server
// sends decoded as a client does.
//   - who holds which: a Tier 2 perk in a branch gives its role, a Tier 1 perk alone none
//   - Guardian: a downed teammate within reach of one stops bleeding out, and starts again when they step off
//   - Medic: a revive begun near one takes a quarter less time; far from one, or with none, the usual time
//   - Spotter: their danger ping marks the one of the dead it lands on (ZSTATUS.MARKED in everyone's snapshot):
//     the rest of the team hits it harder, the Spotter no harder; a new mark moves it; it wears off. Nobody else's
//     ping marks anything
//   - Scout: a car supply's hiding place within reach of one goes on the team's compass (the global state's scouted
//     bits, NOTIFY.SCOUTED); nobody else's walking by does it
//   - Runner: crouched, [E] on a downed teammate drags them along at the Runner's slowed pace, [E] again lets go;
//     standing, or anybody else crouched, [E] is a revive as ever; the grip goes when the Runner goes down
// usage: node scripts/test-roles.js [seed = 3]
import { Game } from '../server/game.js';
import { C2S, S2C, ACT, HOLD, PING_KIND, ZSTATUS, PROTOCOL_VERSION, Writer, Reader, qpos, qangle16, qpitch, writeInput } from '../shared/protocol.js';
import { BTN, SERVER_TICK_RATE, WALK_SPEED } from '../shared/constants.js';
import { NOTIFY, ZTYPE } from '../shared/defs.js';
import { groundAt } from '../shared/collision.js';
import { perkMask } from '../shared/progress.js';
import { ROLE, ROLES, rolesOf, hasRole, MARK, MEDIC, SCOUT, DRAG } from '../shared/roles.js';
import { readSnapshot } from '../client/net/decode.js';

const seed = +(process.argv[2] || 3);
const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok && !process.env.VERBOSE ? '' : info}`);
  if (!ok) fails.push(name);
};
const secs = (t) => Math.round(t * SERVER_TICK_RATE);

// ---------------------------------------------------------------- who holds which
// (perk ids: shared/progress.js)
const PERK = { THICK_SKIN: 0, FIELD_MEDIC: 3, QUICK_HANDS: 4, DEADEYE: 6, EXECUTIONER: 21, KEEN_EYE: 8, GUARDIAN_ANGEL: 11, RALLY: 12, FLEET_FOOT: 14, SURE_FOOTING: 16, GHOST: 26 };
check('no perks, no role', rolesOf(0) === 0);
check('a Tier 1 perk alone gives no role', rolesOf(perkMask([PERK.THICK_SKIN, PERK.QUICK_HANDS, PERK.FLEET_FOOT])) === 0);
check('a Tier 2 perk gives its branch\'s role', hasRole(perkMask([PERK.THICK_SKIN, PERK.FIELD_MEDIC]), ROLE.GUARDIAN) && rolesOf(perkMask([PERK.THICK_SKIN, PERK.FIELD_MEDIC])) === 1 << ROLE.GUARDIAN);
check('...either Tier 2 perk of the branch', hasRole(perkMask([PERK.DEADEYE]), ROLE.SPOTTER) && hasRole(perkMask([PERK.GHOST]), ROLE.RUNNER));
check('...and a Tier 3 perk too', hasRole(perkMask([PERK.EXECUTIONER]), ROLE.SPOTTER));
check('two branches, two roles', rolesOf(perkMask([PERK.KEEN_EYE, PERK.RALLY])) === ((1 << ROLE.SCOUT) | (1 << ROLE.MEDIC)));
check('five roles, one a branch, each with a name, an icon and what it does', ROLES.length === 5 && ROLES.every((r, i) => r.id === i && r.name && r.icon && r.text));

// ---------------------------------------------------------------- the game
const game = new Game({ seed, dayLength: 3600, themes: false, log: () => {} });

function client(name) {
  const c = { name, id: 0, net: { tick: 0, ack: 0 }, global: null, self: {}, store: { ents: new Map(), onCreate() {}, onRemove() {}, onUpdate() {} }, notes: [], seq: 0, yaw: 0, buttons: 0 };
  const nop = () => {};
  c.handler = new Proxy({ notify: (msg, arg) => c.notes.push([msg, arg]) }, { get: (t, k) => t[k] || nop });
  c.conn = {
    send(bytes) {
      const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      const t = r.u8();
      if (t === S2C.WELCOME) c.id = r.u16();
      else if (t === S2C.SNAPSHOT) readSnapshot(r, c);
    },
    congested: () => false,
    cork: (fn) => fn(),
  };
  c.session = game.onOpen(c.conn);
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  game.onMessage(c.session, w.bytes().slice());
  c.p = () => game.players.get(c.id);
  c.act = (act, ...a) => {
    const w2 = new Writer(16);
    w2.u8(C2S.ACTION);
    w2.u8(act);
    if (act === ACT.INTERACT || act === ACT.HOLD_BEGIN) w2.u16(a[0]);
    else if (act === ACT.PING) {
      w2.u8(a[0]);
      w2.i16(qpos(a[1]));
      w2.i16(qpos(a[2]));
      w2.i16(qpos(a[3]));
    } else if (a.length) w2.u8(a[0]);
    game.onMessage(c.session, w2.bytes().slice());
  };
  // a tick's worth of commands (3), with c.buttons held
  c.input = () => {
    const w2 = new Writer(64);
    w2.u8(C2S.INPUT);
    w2.u16(game.tick & 0xffff);
    w2.u8(0);
    const cmds = [];
    for (let i = 0; i < 3; i++) {
      c.seq = (c.seq + 1) & 0xffff;
      cmds.push({ seq: c.seq, buttons: c.buttons, qyaw: qangle16(c.yaw), qpitch: qpitch(0), slot: 255 });
    }
    writeInput(w2, cmds);
    game.onMessage(c.session, w2.bytes().slice());
  };
  return c;
}

const A = client('Ann'); // the one who goes down
const B = client('Ben'); // the one with the role being checked
const C = client('Cat'); // a teammate with no role
const all = [A, B, C];
const run = (ticks) => {
  for (let i = 0; i < ticks; i++) {
    for (const c of all) c.input();
    game.update();
  }
};
const clearDead = () => {
  for (const z of game.zombies) {
    z.dead = true;
    game.removeEntity(z);
  }
  game.zombies.length = 0;
};
const a = A.p();
const b = B.p();
const cp = C.p();
const home = { x: a.state.x, z: a.state.z };
// stands a player dx, dz from where the run began, still
const put = (p, dx, dz) => {
  const s = p.state;
  s.x = home.x + dx;
  s.z = home.z + dz;
  s.y = groundAt(game.world, s.x, s.z, s.y + 3, 0.3);
  s.vx = s.vy = s.vz = 0;
  game.fillHistory(p);
};
const perks = (p, ids) => game.applyPerks(p, perkMask(ids));
const down = (p) => {
  game.goDown(p);
  return p.bleed;
};
const up = (p) => {
  if (p.downed) game.revive(p, null);
  p.hp = p.maxHp;
};
const reset = () => {
  for (const c of all) {
    const p = c.p();
    game.roles.letGo(p);
    p.hold = null;
    up(p);
    perks(p, []);
    c.buttons = 0;
  }
  clearDead();
  put(a, 0, 0);
  put(b, 0, 1.5);
  put(cp, 1.5, 0);
  run(2);
};
run(5);
clearDead();

// ---------------------------------------------------------------- Guardian
{
  reset();
  perks(b, [PERK.THICK_SKIN, PERK.FIELD_MEDIC]); // Ben: Guardian
  put(cp, 20, 0);
  const t0 = down(a);
  run(secs(2));
  check('Guardian: a downed teammate beside one does not bleed out', a.downed && a.bleed === t0, `bleed ${a.bleed.toFixed(2)} of ${t0}`);
  check('...and the server says who guards her', game.roles.guarded(a) === b);
  put(b, 0, 8);
  run(secs(2));
  check('...with the Guardian stepped off, the clock runs again', a.bleed < t0 - 1.5, `bleed ${a.bleed.toFixed(2)} of ${t0}`);
  up(a);
  perks(b, []);
  put(b, 0, 1.5);
  const t1 = down(a);
  run(secs(2));
  check('...and a teammate with no role beside her does not stop it', a.bleed < t1 - 1.5, `bleed ${a.bleed.toFixed(2)} of ${t1}`);
}

// ---------------------------------------------------------------- Medic
{
  reset();
  put(b, 30, 0);
  down(a);
  C.act(ACT.HOLD_BEGIN, a.id);
  const base = cp.hold?.need;
  check('Medic: a revive with no Medic about takes the usual time', cp.hold?.kind === HOLD.REVIVE && base > 0, `hold ${JSON.stringify(cp.hold)}`);
  cp.hold = null;
  perks(b, [PERK.GUARDIAN_ANGEL, PERK.RALLY]); // Ben: Medic, across the road
  C.act(ACT.HOLD_BEGIN, a.id);
  check('...a Medic out of reach changes nothing', Math.abs(cp.hold?.need - base) < 1e-9, `${cp.hold?.need} vs ${base}`);
  cp.hold = null;
  put(b, 0, MEDIC.range - 2);
  C.act(ACT.HOLD_BEGIN, a.id);
  check('...one within reach takes a quarter off it', Math.abs(cp.hold?.need - base * MEDIC.revive) < 1e-9, `${cp.hold?.need} vs ${base * MEDIC.revive}`);
  run(Math.ceil((cp.hold.need / (1 / SERVER_TICK_RATE)) + 3));
  check('...and she is up when it is done', !a.downed && a.alive);
}

// ---------------------------------------------------------------- Spotter
{
  reset();
  const z = game.zm.spawn(ZTYPE.WALKER, home.x + 6, home.z + 6, {});
  z.target = 0;
  const zid = z.id;
  const chest = () => [z.x, z.y + 1.1, z.z];
  B.act(ACT.PING, PING_KIND.DANGER, ...chest());
  check('Spotter: nobody\'s danger ping marks anything without the role', !(z.markT > 0));
  perks(b, [PERK.QUICK_HANDS, PERK.DEADEYE]); // Ben: Spotter
  run(secs(0.7)); // (one ping in 0.6 s)
  B.act(ACT.PING, PING_KIND.LOOT, ...chest());
  check('...a loot ping marks nothing either', !(z.markT > 0));
  run(secs(0.7));
  B.act(ACT.PING, PING_KIND.DANGER, z.x + 0.5, z.y + 1.1, z.z + 0.5);
  check('...a Spotter\'s danger ping on one of the dead marks it', z.markT > 0 && z.markBy === b.id, `markT ${z.markT}`);
  run(1);
  const seen = (c) => c.store.ents.get(zid);
  check('...every client sees the mark (ZSTATUS.MARKED)', all.every((c) => seen(c) && seen(c).q[8] & ZSTATUS.MARKED), all.map((c) => seen(c)?.q[8]).join(','));
  z.hp = z.maxHp = 1000;
  game.combat.damageZombie(z, 20, cp);
  check('...the rest of the team hits it harder', Math.abs(1000 - z.hp - 20 * MARK.hurt) < 1e-6, `took ${1000 - z.hp}`);
  z.hp = 1000;
  game.combat.damageZombie(z, 20, b);
  check('...the Spotter themselves no harder', Math.abs(1000 - z.hp - 20) < 1e-6, `took ${1000 - z.hp}`);
  const z2 = game.zm.spawn(ZTYPE.WALKER, home.x - 6, home.z + 6, {});
  run(secs(0.7));
  B.act(ACT.PING, PING_KIND.DANGER, z2.x, z2.y + 1.1, z2.z);
  check('...a new mark moves it: one at a time', z2.markT > 0 && !(z.markT > 0));
  run(secs(0.7));
  B.act(ACT.PING, PING_KIND.DANGER, z2.x, z2.y + 1.1, z2.z + 40);
  check('...a ping on nothing marks nothing (and leaves the mark where it is)', z2.markT > 0);
  run(secs(MARK.time + 0.5));
  z2.hp = z2.maxHp = 1000;
  game.combat.damageZombie(z2, 20, cp);
  check('...and it wears off', !(z2.markT > 0) && Math.abs(1000 - z2.hp - 20) < 1e-6 && !(seen(A)?.q[8] & ZSTATUS.MARKED), `markT ${z2.markT} took ${1000 - z2.hp}`);
}

// ---------------------------------------------------------------- Scout
{
  reset();
  const k = game.supplyHintSpots.findIndex((si, i) => si >= 0 && !(game.supplyFound & (1 << i)));
  const sp = game.world.partSpots[game.supplyHintSpots[k]];
  check('Scout: the run has a supply hidden somewhere', k >= 0 && !!sp);
  const near = (p, d) => {
    p.state.x = sp.x + d;
    p.state.z = sp.z;
    p.state.y = groundAt(game.world, p.state.x, p.state.z, sp.y + 3, 0.3);
    p.state.vx = p.state.vy = p.state.vz = 0;
  };
  near(cp, 5);
  run(secs(1));
  check('...nobody without the role puts it on the compass', !(game.scouted & (1 << k)) && !(C.global.scouted & (1 << k)));
  put(cp, 1.5, 0);
  perks(b, [PERK.KEEN_EYE]); // Ben: Scout
  near(b, SCOUT.range + 15);
  run(secs(1));
  check('...a Scout out of range does not either', !(game.scouted & (1 << k)));
  near(b, SCOUT.range - 3);
  run(secs(1));
  check('...a Scout within range does', !!(game.scouted & (1 << k)));
  check('...and every client has it in the global state', all.every((c) => c.global.scouted & (1 << k)), all.map((c) => c.global.scouted).join(','));
  check('...with word of it (NOTIFY.SCOUTED, the hint)', all.every((c) => c.notes.some(([m, arg]) => m === NOTIFY.SCOUTED && arg === k)));
  const n = A.notes.length;
  run(secs(2));
  check('...once', A.notes.length === n || !A.notes.slice(n).some(([m]) => m === NOTIFY.SCOUTED));
}

// ---------------------------------------------------------------- Runner
{
  reset();
  perks(b, [PERK.FLEET_FOOT, PERK.SURE_FOOTING]); // Ben: Runner
  down(a);
  run(2);
  B.act(ACT.HOLD_BEGIN, a.id);
  check('Runner: standing, [E] on a downed teammate is a revive as ever', b.hold?.kind === HOLD.REVIVE && !b.dragging);
  b.hold = null;
  a.revivedBy = 0;
  B.buttons = BTN.CROUCH;
  C.buttons = BTN.CROUCH;
  run(3);
  C.act(ACT.HOLD_BEGIN, a.id);
  check('...crouched, [E] by somebody without the role is a revive too', cp.hold?.kind === HOLD.REVIVE && !cp.dragging);
  cp.hold = null;
  a.revivedBy = 0;
  C.buttons = 0;
  B.act(ACT.HOLD_BEGIN, a.id);
  check('...crouched, a Runner\'s [E] takes her by the collar instead', b.dragging === a.id && a.draggedBy === b.id && b.state.drag === 1 && !b.hold);
  run(2);
  check('...his own client is told he drags (s.drag)', B.self.drag === 1);
  // walk off with her: she comes along
  const a0 = { x: a.state.x, z: a.state.z };
  const b0 = { x: b.state.x, z: b.state.z };
  B.buttons = BTN.FWD;
  B.yaw = Math.atan2(b0.x - a0.x, b0.z - a0.z) + Math.PI; // (facing away from her... whichever way forward is, she follows)
  run(secs(3));
  const bMoved = Math.hypot(b.state.x - b0.x, b.state.z - b0.z);
  const aMoved = Math.hypot(a.state.x - a0.x, a.state.z - a0.z);
  const gap = Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z);
  check('...he walks at the slowed pace', bMoved > 1 && bMoved < 3 * WALK_SPEED * DRAG.pace + 0.5, `moved ${bMoved.toFixed(2)} m in 3 s`);
  check('...and she is dragged after him, close behind', aMoved > bMoved - 2 && gap < DRAG.slip && a.downed, `she moved ${aMoved.toFixed(2)}, he ${bMoved.toFixed(2)}, gap ${gap.toFixed(2)}`);
  B.buttons = BTN.CROUCH;
  run(2);
  B.act(ACT.HOLD_BEGIN, a.id);
  run(2);
  check('...[E] again lets go', !b.dragging && !a.draggedBy && !b.state.drag && !a.state.pulled && B.self.drag === 0);
  B.act(ACT.HOLD_BEGIN, a.id);
  check('...and takes hold again', b.dragging === a.id);
  game.goDown(b);
  run(2);
  check('...going down himself, he lets go', !b.dragging && !a.draggedBy && !a.state.pulled);
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
