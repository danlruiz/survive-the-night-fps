// Held keys and presses during a recovery (issue #278). In-process, no server or browser.
// - The hold ring (client/game/holdring.js): up on the frame the key goes down and filling by our own clock, then on
//   the server's word, which a fake server here gives over a lagged link at its own tick; done when the server goes
//   through with it, red with what happened when it is let go too soon, broken off by the server or never taken up,
//   quiet when the key was a tap (a vehicle: a tap gets in), on to the next job when the server goes on with the key
//   still held; holds of our own (the drop key) fill by what Game says. And holdNeed knows every server hold.
// - Presses during a melee weapon's recovery, through the client's own prediction and input buffer: a switch is
//   taken on the next command, R made in the draw that follows reloads once the gun is up, and a heal takes the hands
//   at once. None of them waits out the swing or is dropped.
import { HoldRing, holdNeed, CANCEL_SHOWN, REFUSED_AFTER } from '../client/game/holdring.js';
import { HOLD } from '../shared/protocol.js';
import { BTN, SERVER_DT, SEARCH_TIME, SLOT_MELEE, SLOT_PISTOL } from '../shared/constants.js';
import { ITEM } from '../shared/defs.js';
import { Prediction } from '../client/game/prediction.js';
import { InputBuffer } from '../client/game/inputbuffer.js';
import { createWorld } from '../shared/world.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : detail}`);
}

const FRAME = 1 / 60;
const hud = (r) => r.hud({});

// ---------------------------------------------------------------- the ring against a fake server
// The client presses at t=0 and asks; the server hears of it `lag` later, runs the hold at its tick, and what it says
// reaches the client `lag` after that. let go: s after the press the key comes up (Infinity: held), breakAt: server
// time the server breaks it off (Infinity: never), refuse: the server never takes it up.
function run({ need = SEARCH_TIME, guess = need, lag = 0.06, letGo = Infinity, breakAt = Infinity, refuse = false, frames = 240 } = {}) {
  const r = new HoldRing((kind) => ({ need: holdNeed(kind), label: `kind ${kind}` }));
  r.start(7, 'Searching…', { need: guess, server: true, kind: HOLD.SEARCH });
  const first = hud(r);
  const said = []; // [client time it arrives, kind, progress]
  let srvT = -1; // the server's hold clock (-1: not running)
  let ended = false;
  const out = { first, events: [], track: [], worst: 0 };
  let kind = 0;
  let p = 0;
  for (let f = 1; f <= frames; f++) {
    const t = f * FRAME;
    // the server's ticks up to now (its clock runs `lag` behind the press)
    const tick = Math.floor((t - lag) / SERVER_DT);
    while (!refuse && !ended && tick >= 0 && (said.length === 0 || said[said.length - 1].tick < tick)) {
      const at = (said.length ? said[said.length - 1].tick + 1 : 0) * SERVER_DT + lag;
      if (srvT < 0) srvT = 0;
      else srvT += SERVER_DT;
      let k = HOLD.SEARCH;
      let sp = Math.min(255, Math.round((srvT / need) * 255)) / 255;
      if (srvT >= need || at - lag >= breakAt || at >= letGo + lag) {
        k = 0;
        sp = 0;
        ended = true;
      }
      said.push({ tick: Math.round((at - lag) / SERVER_DT), arrive: at + lag, kind: k, p: sp, truth: Math.min(1, srvT / need) });
    }
    for (const s of said) if (s.arrive <= t && !s.used) ((s.used = true), (kind = s.kind), (p = s.p));
    if (t >= letGo && r.active) {
      const ev = r.release();
      if (ev) out.events.push([t, ev]);
    }
    const ev = r.update(FRAME, kind, p, lag * 2);
    if (ev) out.events.push([t, ev]);
    const h = hud(r);
    out.track.push([t, h.progress, h.cancelled, h.label]);
    // where the server's hold really is now (its clock is `lag` behind ours)
    if (r.active && !refuse && srvT >= 0 && !ended) out.worst = Math.max(out.worst, Math.abs(h.progress - Math.min(1, (t - lag) / need)));
  }
  out.ring = r;
  return out;
}

{
  const a = run();
  check('a hold shows on the frame the key goes down (before the server has heard of it)', a.first.progress === 0 && a.first.label === 'Searching…' && !a.first.cancelled);
  const at = (t) => a.track.find((x) => x[0] >= t - 1e-9);
  check('...and is filling by the next frame, by our own clock', at(FRAME)[1] > 0 && at(0.1)[1] > 0.05, JSON.stringify([at(FRAME), at(0.1)]));
  const mono = a.track.every((x, i) => i === 0 || !(x[1] >= 0 && a.track[i - 1][1] >= 0) || x[1] >= a.track[i - 1][1] - 1e-9);
  check('the fill never goes back', mono);
  check("it runs with the server's own hold, a round trip of 120 ms notwithstanding (within 8%)", a.worst < 0.08, `worst ${a.worst.toFixed(3)}`);
  check('the server going through with it is done: no cancel', a.events.length === 1 && a.events[0][1] === 'done' && !a.track.some((x) => x[2]), JSON.stringify(a.events));
  check('...and the ring was full or all but full when it went', Math.max(...a.track.map((x) => x[1])) > 0.95);

  const slow = run({ lag: 0.15, need: 3.5, frames: 300 });
  check('a 300 ms round trip and a 3.5 s revive: still with the server (within 10%), done', slow.worst < 0.1 && slow.events.at(-1)?.[1] === 'done', `worst ${slow.worst.toFixed(3)} ${JSON.stringify(slow.events)}`);
  const off = run({ guess: 2, need: 1, frames: 120 });
  check('a wrong guess at the time (2 s for a 1 s search, a perk) is put right by the server and still done', off.events.at(-1)?.[1] === 'done' && Math.max(...off.track.map((x) => x[1])) > 0.95, JSON.stringify(off.events));

  const early = run({ letGo: 0.4 });
  const red = early.track.find((x) => x[2]);
  check('let go too soon: cancelled, the ring red with "Let go too soon" and where it had got to', early.events.length === 1 && early.events[0][1] === 'cancel' && red && red[3] === 'Let go too soon' && red[1] > 0.2 && red[1] < 0.5, JSON.stringify([early.events, red]));
  const gone = early.track.filter((x) => x[2]);
  check(`...for ${CANCEL_SHOWN} s, then gone`, Math.abs(gone.length * FRAME - CANCEL_SHOWN) < 2.5 * FRAME && early.track.at(-1)[1] === -1, `${(gone.length * FRAME).toFixed(3)} s`);

  const broke = run({ breakAt: 0.5 });
  const red2 = broke.track.find((x) => x[2]);
  check('broken off by the server (walked away, the target gone): "Interrupted", red', broke.events.at(-1)?.[1] === 'cancel' && red2?.[3] === 'Interrupted', JSON.stringify([broke.events, red2]));

  const refused = run({ refuse: true });
  const r3 = refused.events.at(-1);
  check(`never taken up by the server: cancelled once a round trip and ${REFUSED_AFTER * 1000} ms have gone by with no word`, r3?.[1] === 'cancel' && Math.abs(r3[0] - (0.12 + REFUSED_AFTER)) < 2 * FRAME && refused.track.find((x) => x[2])?.[3] === 'Cancelled', JSON.stringify(r3));
  check('...and it never filled past 92% on our own clock alone', Math.max(...refused.track.map((x) => x[1])) <= 0.92 + 1e-9);
}

{
  // a key that is a tap first (a vehicle: a tap gets in): let go inside the lead, nothing to say
  const r = new HoldRing();
  r.start(3, 'Pouring fuel in…', { need: 1.2, lead: 0.28, server: true, kind: HOLD.VEH_FUEL });
  for (let i = 0; i < 10; i++) r.update(FRAME, 0, 0, 0.1);
  const filled = hud(r).progress;
  const ev = r.release();
  check('a tap inside the lead: the ring was up and filling, and goes quietly', filled > 0 && ev === null && hud(r).progress === -1 && !hud(r).cancelled, `${filled} ${ev}`);
  // ...held past it: the server is asked then, so its silence counts from there
  r.start(3, 'Pouring fuel in…', { need: 1.2, lead: 0.28, server: true, kind: HOLD.VEH_FUEL });
  let ev2 = null;
  for (let i = 0; i < 30 && !ev2; i++) ev2 = r.update(FRAME, 0, 0, 0.1);
  check('...the lead does not count as the server keeping quiet', ev2 === null && r.active);
}

{
  // the server goes on to the next job with [E] still held (a vehicle: holdDone), and another kind than guessed
  const r = new HoldRing((kind) => ({ need: holdNeed(kind), label: `job ${kind}` }));
  r.start(3, 'Working on it…', { need: 2.5, server: true, kind: HOLD.VEH_FIX });
  let ev = null;
  for (let i = 0; i < 30; i++) ev = ev || r.update(FRAME, HOLD.VEH_REPAIR, Math.min(1, i / 30), 0.1);
  check('the server running another kind than guessed: its label and time', ev === null && hud(r).label === `job ${HOLD.VEH_REPAIR}` && r.need === holdNeed(HOLD.VEH_REPAIR));
  const before = hud(r).progress;
  for (let i = 0; i < 3; i++) ev = ev || r.update(FRAME, HOLD.VEH_FUEL, 0.02, 0.1);
  check('...then on to the next job: the ring starts over for it, no cancel', ev === null && before > 0.5 && hud(r).progress < 0.2 && hud(r).label === `job ${HOLD.VEH_FUEL}` && !hud(r).cancelled, `${before} ${JSON.stringify(hud(r))}`);
}

{
  // our own holds: the drop key (Game feeds DropHold's progress) and a cancel that says how to do it
  const r = new HoldRing();
  r.start('drop', 'Dropping Shotgun…', { need: 0.4 });
  r.local(0.3);
  r.update(FRAME);
  r.local(0.2);
  check('a hold of our own fills by what it is told, never back', hud(r).progress === 0.3 && hud(r).label === 'Dropping Shotgun…' && r.update(FRAME) === null);
  r.cancel('Hold G to drop', 1.6);
  const h = hud(r);
  check('...a tap of the drop key: the ring says to hold it, for as long as asked', h.cancelled && h.label === 'Hold G to drop' && h.cancelFor === 1.6);
  check('every server hold has a time', Object.values(HOLD).filter((k) => k).every((k) => holdNeed(k) > 0) && holdNeed(HOLD.SEARCH, { search: 0.75 }) === 0.75);
}

// ---------------------------------------------------------------- presses during a melee recovery
{
  const world = createWorld(4242);
  const pred = new Prediction(world);
  const s = pred.state;
  pred.hasServerState = true;
  s.x = world.spawn?.x ?? 0;
  s.z = world.spawn?.z ?? 0;
  s.weapons[SLOT_MELEE] = ITEM.BAT;
  s.slot = SLOT_MELEE;
  s.mags[1] = 3; // the pistol a few rounds down, with rounds to put in
  const buffer = new InputBuffer();
  let frame = 0;
  const did = [];
  const step = (n, held = 0, slot = 255) => {
    for (; n > 0; n--) {
      if (slot !== 255) pred.requestSlot(slot);
      slot = 255;
      const at = frame++;
      pred.step(FRAME, held, 0, 0, (evs) => evs.forEach((e) => did.push([at, e.type, e.heavy])), buffer);
    }
  };
  const since = (mark, type) => did.filter((d) => d[0] >= mark && d[1] === type);
  step(10);

  // a heavy swing of the bat (1.3 s to recover), then 1 for the pistol 10 commands in, then R
  let mark = frame;
  step(3, BTN.ALT);
  step(7);
  const swapAt = frame;
  step(1, 0, SLOT_PISTOL);
  step(4);
  step(3, BTN.RELOAD);
  step(60);
  const swing = since(mark, 'melee');
  const sw = since(mark, 'switch');
  const rl = since(mark, 'reload');
  check('a heavy bat swing, then the pistol asked for 10 commands into its 1.3 s recovery: switched on that command', swing.length === 1 && swing[0][2] && sw.length === 1 && sw[0][0] === swapAt, JSON.stringify([swing, sw]));
  check('...R pressed in the draw that follows: the reload starts the command the pistol is up, not dropped', rl.length === 1 && rl[0][0] - swapAt === 25, JSON.stringify(rl.map((x) => x[0] - swapAt)));

  // a swing, and a heal pressed 5 commands into its recovery: the hands go onto it at once, the recovery no matter
  step(120, 0, SLOT_MELEE);
  mark = frame;
  step(3, BTN.ATTACK);
  step(2);
  const cdLeft = s.cooldown;
  pred.startUse(); // (Game.useConsumable: what [H] does)
  step(1);
  const using = s.using;
  step(40); // (the server would take the hands off it when it is used up; the recovery runs out under it meanwhile)
  check("a heal pressed during a swing's recovery takes the hands on the next command, and keeps them", cdLeft > 0.3 && using === 1 && s.using === 1 && s.cooldown <= 0 && since(mark, 'melee').length === 1, `cooldown ${cdLeft.toFixed(2)} using ${using}/${s.using} swings ${since(mark, 'melee').length}`);
  s.using = 0;
  step(120);

  // the nunchaku mid-combo: the pistol asked for between blows is taken at once too
  s.weapons[SLOT_MELEE] = ITEM.NUNCHAKU;
  step(30, 0, SLOT_PISTOL);
  step(30, 0, SLOT_MELEE);
  mark = frame;
  step(3, BTN.ATTACK);
  step(6);
  step(3, BTN.ATTACK);
  const swapAt2 = frame;
  step(1, 0, SLOT_PISTOL);
  step(30);
  const sw2 = since(mark, 'switch');
  check('the nunchaku between blows of a combo: the pistol is taken on the command it is asked for', since(mark, 'melee').length >= 1 && sw2.length === 1 && sw2[0][0] === swapAt2, JSON.stringify([since(mark, 'melee').length, sw2]));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
