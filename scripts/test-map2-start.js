// Map 2 games and the checkpoint at the bridge, on the Game itself and against real server processes:
//   - map 1 beaten is on the record (stats.js / dbstats.js 'crossings'): everybody in the run as the car drives off
//     the island, the dead too; an admin's /cross is not a run
//   - a game made to start on the mainland (acts.js MAINLAND_START): the team at the bridgehead on its day, with a
//     starting kit and the bridgehead's floor, and the gun crates there - each a different gun, loaded, its rounds
//     and the stock
//   - a wipe on the mainland: back at the bridge with what the team had there while the difficulty's retries last
//     (difficulty.js: Ember always, Nightfall once, Blackout never), then the end of the run - the next begins where
//     the game does
//   - a deploy keeps the map the game starts on, and the crates
//   - the server: a map 2 game is made (POST /api/games) and joined (the socket's JOIN) only by whoever has beaten map
//     1; /api/progress says so; quick joins never go to one; the list marks them
//   - the database: the crossings are written and read, move onto an account with a guest's record, and the
//     migration counts the runs that crossed before it from the match records
// usage: node scripts/test-map2-start.js
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const { Game } = await import('../server/game.js');
const { C2S, S2C, PROTOCOL_VERSION, REJECT_REASON, LEFT_CODE, Writer, Reader } = await import('../shared/protocol.js');
const { PHASE, GAME_OVER_DELAY, SLOT_PRIMARY, SLOT_PISTOL } = await import('../shared/constants.js');
const { ITEM, WEAPONS, AMMO_ITEMS, ENT, NOTIFY } = await import('../shared/defs.js');
const { WORLD, MAINLAND_START, ARRIVAL_DAY } = await import('../shared/acts.js');
const { difficultyOf } = await import('../shared/difficulty.js');
const { PlayerStats, idKey } = await import('../server/stats.js');
const { DbStats } = await import('../server/dbstats.js');
const { openDb } = await import('../server/db/index.js');
const { migrate, MIGRATIONS_DIR, migrationFiles } = await import('../server/db/migrate.js');
const { envelope, encode, decode } = await import('../server/handoff.js');
const { countItem } = await import('../server/inventory.js');

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : detail}`);
};
const quiet = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a player on the Game, as a page joins: { id, p(), pid }
function join_(game, name, pid = randomUUID()) {
  const c = { id: 0, pid, welcome: null, resets: [] };
  c.session = game.onOpen({
    ip: name,
    send(bytes) {
      const r = new Reader(bytes.slice ? bytes.slice().buffer : bytes);
      const t = r.u8();
      if (t === S2C.WELCOME) {
        c.id = r.u16();
        c.welcome = { seed: r.u32(), tick: r.u32(), rate: r.u8(), max: r.u8(), flags: r.u8(), act: r.u8() };
      } else if (t === S2C.WORLD_RESET) c.resets.push({ seed: r.u32(), act: r.u8() });
    },
  });
  const w = new Writer(64);
  w.u8(C2S.JOIN);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  w.str(pid);
  game.onMessage(c.session, w.bytes());
  c.p = () => game.players.get(c.id);
  return c;
}
function notices(game) {
  const out = [];
  const notify = game.notify.bind(game);
  game.notify = (msg, arg = 0, to = 0) => {
    out.push([msg, arg, to]);
    return notify(msg, arg, to);
  };
  return out;
}
const ticks = (game, sec) => {
  for (let i = 0, n = Math.round(sec * 20); i < n; i++) game.update();
};
const near = (p, at, r) => Math.hypot(p.state.x - at.x, p.state.z - at.z) <= r;
const kitOf = (p) => JSON.stringify({ w: p.state.weapons, m: p.state.mags, a: p.state.ammo, inv: p.inv, armor: [p.armorItem, p.armor, p.armorMax], pack: p.backpackItem });
const shut = (game) => game.crates.filter((e) => e.gun && e.state === 1);
const wipe = (game) => {
  for (const p of game.players.values()) if (p.alive && !p.zombie) game.killPlayer(p, { kind: 3 }, true);
  game.checkAllDead();
};

// ================================================================ map 1 beaten, on the record
{
  const stats = new PlayerStats();
  const game = new Game({ seed: 4242, log: quiet, stats, themes: false, godMode: true });
  const ann = join_(game, 'Ann');
  const ben = join_(game, 'Ben');
  const cy = join_(game, 'Cy');
  ticks(game, 0.2);
  const keyOf = (c) => idKey(c.pid);
  check('nobody has beaten map 1 at the start', !(await stats.map1Cleared({ guestKey: keyOf(ann) })) && !stats.progressOf({ guestId: ann.pid }).map1);
  // Cy is dead as the car goes; an admin's /cross is not a run
  game.cross(ann.p(), false);
  check('...nor after an admin sends the car across (/cross)', !(await stats.map1Cleared({ guestKey: keyOf(ann) })));
  game.startGame();
  ticks(game, 0.2);
  game.killPlayer(cy.p(), { kind: 3 }, true);
  game.escape.active = game.escape.ready = true;
  game.driveOff(ann.p());
  check('the car drives off the island: map 1 beaten on the record of everybody in the run, the dead too', (await stats.map1Cleared({ guestKey: keyOf(ann) })) && (await stats.map1Cleared({ guestKey: keyOf(ben) })) && (await stats.map1Cleared({ guestKey: keyOf(cy) })) && stats.progressOf({ guestId: ben.pid }).map1);
  check('...counted once a run', stats.recs.get(keyOf(ann)).crossings === 1, String(stats.recs.get(keyOf(ann)).crossings));
  const again = new PlayerStats();
  again.recs = new Map();
  const saved = JSON.parse(stats.serialize());
  check('...and kept in the stats file', saved.players[keyOf(cy)]?.crossings === 1, JSON.stringify(saved.players[keyOf(cy)]));
  const dir = mkdtempSync(join(tmpdir(), 'stn-map2-'));
  writeFileSync(join(dir, 'stats.json'), stats.serialize());
  const read = new PlayerStats({ file: join(dir, 'stats.json') });
  check('...and read back from it', await read.map1Cleared({ guestKey: keyOf(cy) }));
}

// ================================================================ a game that starts on the mainland
{
  const game = new Game({ startAct: WORLD.MAINLAND, log: quiet, themes: false, godMode: true });
  check('a game made for the mainland is built on it', game.act === WORLD.MAINLAND && game.world.kind === WORLD.MAINLAND && game.startAct === WORLD.MAINLAND);
  const notes = notices(game);
  const ann = join_(game, 'Ann');
  const ben = join_(game, 'Ben');
  ticks(game, 0.5);
  const a = ann.p();
  const b = ben.p();
  check('its first join is welcomed onto the mainland', ann.welcome?.act === WORLD.MAINLAND && !ann.resets.length, JSON.stringify(ann.welcome));
  check(`the run begins on day ${MAINLAND_START.DAY}, at the bridgehead, its long first day`, game.phase === PHASE.DAY && game.day === MAINLAND_START.DAY && Math.abs(game.timeLeft - ARRIVAL_DAY) < 2 && notes.some((n) => n[0] === NOTIFY.NEW_GAME && n[1] === MAINLAND_START.DAY), `phase ${game.phase} day ${game.day} left ${game.timeLeft}`);
  check('...everybody alive there with a pistol', [a, b].every((p) => p.alive && !p.zombie && near(p, game.world.start, 16) && p.state.weapons[SLOT_PISTOL] === ITEM.PISTOL));
  check("...with the bridgehead's floor of rounds, and no word of the cache", a.state.ammo[WEAPONS[ITEM.PISTOL].ammo] >= 24 && !notes.some((n) => n[0] === NOTIFY.CACHE), String(a.state.ammo));
  const crates = shut(game);
  check(`${MAINLAND_START.CRATES} gun crates stand shut at the bridgehead, each with a different gun`, crates.length === MAINLAND_START.CRATES && new Set(crates.map((e) => e.gun)).size === crates.length && crates.every((e) => Math.hypot(e.x - game.world.start.x, e.z - game.world.start.z) < 25), crates.map((e) => `${e.gun}@${e.x | 0},${e.z | 0}`).join(' '));
  check('...on the ground, not in it nor over it', crates.every((e) => Math.abs(e.y - game.world.heightAt(e.x, e.z)) < 1.5), crates.map((e) => (e.y - game.world.heightAt(e.x, e.z)).toFixed(2)).join(' '));
  // (Ann's join began the run: Ben came after it, as a late joiner, and has a late joiner's kit at the bridge again)
  check('...and for a checkpoint: the day, and what each had as it began', game.checkpoint?.day === MAINLAND_START.DAY && game.checkpoint.used === 0 && game.checkpoint.kits.length === 1);
  check('the arrival says how many tries the mainland gives, on Nightfall one', game.retriesLeft() === 1 && difficultyOf(game.diff.id).retries === 1);

  // Ann breaks the first open
  const e = crates[0];
  a.state.x = e.x + 1;
  a.state.z = e.z;
  a.state.y = game.world.heightAt(a.state.x, a.state.z) + 0.05;
  const before = game.items.length;
  game.interact(a, e.id);
  const out = game.items.slice(before);
  const def = WEAPONS[e.gun];
  const gun = out.find((it) => it.item === e.gun);
  const rounds = out.find((it) => it.item === AMMO_ITEMS[def.ammo]);
  check('[E] breaks a gun crate open: its gun, loaded', e.state === 2 && gun && gun.mag === def.mag, `state ${e.state} ${JSON.stringify(out.map((it) => [it.item, it.count, it.mag]))}`);
  check(`...${MAINLAND_START.MAGS} magazines of its rounds`, rounds && rounds.count >= def.mag * Math.min(MAINLAND_START.MAGS, 2), JSON.stringify(rounds && [rounds.item, rounds.count]));
  check('...and the stock: 9mm, bandages, a medkit, a molotov', MAINLAND_START.STOCK.every(([it, n]) => out.some((o) => o.item === it && o.count === n)), JSON.stringify(out.map((it) => [it.item, it.count])));
  check('...lying about it, on the ground', out.every((it) => Math.hypot(it.x - e.x, it.z - e.z) < 6));
  game.interact(a, e.id);
  check('...and once only', game.items.length === before + out.length);

  // they pick things up, and are wiped out
  const kits = [kitOf(a), kitOf(b)];
  game.giveItem(a, ITEM.MEDKIT, 2);
  ticks(game, 1);
  wipe(game);
  check('a wipe on the mainland is a game over, with a second try to come', game.phase === PHASE.GAMEOVER && notes.some((n) => n[0] === NOTIFY.WIPE_RETRY && n[1] === MAINLAND_START.DAY));
  const resets = ann.resets.length;
  ticks(game, GAME_OVER_DELAY + 0.5);
  check('...back at the bridgehead on the day the run began, on the same mainland', game.phase === PHASE.DAY && game.act === WORLD.MAINLAND && game.day === MAINLAND_START.DAY && ann.resets.length === resets && notes.some((n) => n[0] === NOTIFY.CHECKPOINT && n[1] === 0), `phase ${game.phase} day ${game.day}`);
  check('...everybody alive there with what they had as it began', [a, b].every((p) => p.alive && !p.zombie && near(p, game.world.start, 16)) && kitOf(a) === kits[0] && kitOf(b) === kits[1], `${kitOf(a)}\n      ${kits[0]}`);
  check('...and the gun crates shut again, all of them', shut(game).length === MAINLAND_START.CRATES);
  check('...with no tries left on Nightfall', game.retriesLeft() === 0 && game.checkpoint.used === 1);
  const seed = game.seed;
  wipe(game);
  check('a second wipe: no second try to come', game.phase === PHASE.GAMEOVER && notes.filter((n) => n[0] === NOTIFY.WIPE_RETRY).length === 1);
  ticks(game, GAME_OVER_DELAY + 0.5);
  check('...a new run, on a new mainland: the game starts there', game.phase === PHASE.DAY && game.act === WORLD.MAINLAND && game.world.kind === WORLD.MAINLAND && game.seed !== seed && ann.resets.at(-1)?.act === WORLD.MAINLAND && game.day === MAINLAND_START.DAY, `phase ${game.phase} act ${game.act} resets ${JSON.stringify(ann.resets)}`);
  check('...its tries afresh, and its crates', game.checkpoint.used === 0 && game.retriesLeft() === 1 && shut(game).length === MAINLAND_START.CRATES);

  // a deploy keeps the map the game starts on, and the crates
  const C = new Game({ log: quiet, themes: false, restore: decode(encode(envelope(game))) });
  check('a deploy: the game still starts on the mainland, its crates and their guns kept', C.startAct === WORLD.MAINLAND && C.act === WORLD.MAINLAND && shut(C).length === MAINLAND_START.CRATES && shut(C).every((e, i) => e.gun === shut(game)[i].gun) && C.checkpoint?.kits.length === game.checkpoint.kits.length);

  // the admin's /map1 is still the island
  game.startGame(WORLD.ISLAND);
  check("an admin's /map1 in it: the island", game.act === WORLD.ISLAND && game.world.kind === WORLD.ISLAND && game.day === 1 && !game.crates.length);
}

// ================================================================ the tries, by difficulty
{
  const tries = (difficulty, n) => {
    const game = new Game({ startAct: WORLD.MAINLAND, difficulty, log: quiet, themes: false, godMode: true });
    join_(game, 'Ann');
    ticks(game, 0.2);
    let back = 0;
    for (let i = 0; i < n; i++) {
      wipe(game);
      ticks(game, GAME_OVER_DELAY + 0.5);
      if (game.checkpoint.used > 0) back = game.checkpoint.used;
      else break;
    }
    return back;
  };
  check('Ember: back to the bridge after every wipe', tries('ember', 4) === 4);
  check('Nightfall: once', tries('nightfall', 4) === 1);
  check('Blackout: never', tries('blackout', 4) === 0);
}

// ================================================================ the checkpoint on a run from the island
{
  const game = new Game({ seed: 4242, log: quiet, themes: false, godMode: true });
  const notes = notices(game);
  const ann = join_(game, 'Ann');
  ticks(game, 0.2);
  const a = ann.p();
  game.giveItem(a, ITEM.SHOTGUN, 1, 6);
  game.cross(a, false);
  game.arrive();
  const kit = kitOf(a);
  check('a run from the island comes off the bridge with a checkpoint', game.act === WORLD.MAINLAND && game.checkpoint?.kits.length === 1 && game.retriesLeft() === 1);
  game.giveItem(a, ITEM.MEDKIT, 3);
  game.day = game.checkpoint.day + 2;
  wipe(game);
  ticks(game, GAME_OVER_DELAY + 0.5);
  check('...a wipe goes back to it: the same mainland, the day they came, with what they crossed with', game.phase === PHASE.DAY && game.act === WORLD.MAINLAND && game.day === game.checkpoint.day && kitOf(a) === kit && notes.some((n) => n[0] === NOTIFY.CHECKPOINT), `${kitOf(a)}\n      ${kit}`);
  check('...and no gun crates: they are for a game that starts there', !game.crates.length);
  wipe(game);
  ticks(game, GAME_OVER_DELAY + 0.5);
  check('...and the second wipe on Nightfall ends the run: the next begins on the island', game.phase === PHASE.DAY && game.act === WORLD.ISLAND && game.day === 1 && !game.checkpoint && countItem(a.inv, ITEM.MEDKIT) === 0, `act ${game.act} day ${game.day}`);
}

// ================================================================ the server
{
  const dir = mkdtempSync(join(tmpdir(), 'stn-map2-srv-'));
  const doneId = randomUUID();
  const newId = randomUUID();
  // a stats file where one browser has beaten map 1
  writeFileSync(join(dir, 'stats.json'), JSON.stringify({ v: 1, players: { [idKey(doneId)]: { name: 'Vet', kills: 3, nights: 1, wins: 0, revives: 0, seen: Date.now(), xp: 40, crossings: 1 } } }));
  const port = 40100 + Math.floor(Math.random() * 90);
  const env = { ...process.env, PORT: String(port), STATS_FILE: join(dir, 'stats.json'), GAME_IDLE_SECONDS: '30', LOBBY_LIMITS: '0' };
  delete env.DEV_ADMIN;
  delete env.NODE_ENV;
  const proc = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 200 && !log.includes('listening'); i++) await sleep(50);
  const base = `localhost:${port}`;
  const post = async (path, body) => {
    const res = await fetch(`http://${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const client = (code, name, pid, late = false) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://${base}/ws${code ? `?game=${code}` : ''}`);
      ws.binaryType = 'arraybuffer';
      const c = { ws, room: null, id: 0, act: 0, reject: 0, snaps: 0, closed: false };
      c.close = (cc = LEFT_CODE) => new Promise((done) => (c.closed ? done() : ((ws.onclose = () => ((c.closed = true), done())), ws.close(cc))));
      const send = () => {
        const w = new Writer(128);
        w.u8(C2S.JOIN);
        w.u8(PROTOCOL_VERSION);
        w.str(name);
        w.str(pid);
        ws.send(w.bytes());
      };
      ws.onopen = () => (late ? setTimeout(send, 300) : send());
      ws.onmessage = (m) => {
        const r = new Reader(m.data);
        const t = r.u8();
        if (t === S2C.ROOM) {
          c.room = { code: r.str(), name: r.str(), flags: r.u8(), difficulty: r.str(), startAct: r.left ? r.u8() : 0 };
        } else if (t === S2C.WELCOME) {
          c.id = r.u16();
          r.u32();
          r.u32();
          r.u8();
          r.u8();
          r.u8();
          c.act = r.u8();
          resolve(c);
        } else if (t === S2C.REJECT) {
          c.reject = r.u8();
          resolve(c);
        } else if (t === S2C.SNAPSHOT) c.snaps++;
      };
      ws.addEventListener('close', () => {
        c.closed = true;
        resolve(c);
      });
    });
  try {
    const p1 = await post('/api/progress', { guestId: newId });
    const p2 = await post('/api/progress', { guestId: doneId });
    check('/api/progress says who has beaten map 1', p1.status === 200 && p1.body.map1 === false && p2.status === 200 && p2.body.map1 === true, JSON.stringify([p1.body?.map1, p2.body?.map1]));
    const no = await post('/api/games', { name: 'Nope', host: 'New', difficulty: 'nightfall', map: 2, guestId: newId });
    check('a map 2 game is not made for a player who has not beaten map 1', no.status === 403 && /map 1/.test(no.body?.error), JSON.stringify(no));
    const bad = await post('/api/games', { name: 'Odd', host: 'Vet', map: 3, guestId: doneId });
    check('...nor a map 3', bad.status === 400, JSON.stringify(bad));
    const made = await post('/api/games', { name: 'Mainland', host: 'Vet', difficulty: 'nightfall', map: 2, guestId: doneId });
    check('...and is for one who has', made.status === 201 && made.body?.map === 2 && !!made.body.code, JSON.stringify(made));
    const code = made.body?.code;
    const vet = await client(code, 'Vet', doneId);
    check('they join it: welcomed onto the mainland, told the game starts there', vet.id > 0 && !vet.reject && vet.act === WORLD.MAINLAND && vet.room?.startAct === 2, `id ${vet.id} reject ${vet.reject} act ${vet.act} ${JSON.stringify(vet.room)}`);
    const fresh = await client(code, 'New', newId);
    check('a player who has not beaten map 1 is turned away from it, and told why', fresh.reject === REJECT_REASON.MAP1_FIRST && !fresh.id, `reject ${fresh.reject} id ${fresh.id}`);
    const slow = await client(code, 'Slow', doneId, true);
    check('...one who has, whose JOIN comes late, gets in', slow.id > 0 && !slow.reject, `reject ${slow.reject}`);
    await sleep(600);
    check('...and the game streams to them', slow.snaps > 3, String(slow.snaps));
    const list = await (await fetch(`http://${base}/api/games`)).json();
    check('the game list marks it as map 2', list.list.some((g) => g.code === code && g.map === 2), JSON.stringify(list.list));
    const quick = await client('', 'Quick', newId);
    check('a quick join does not go to it', quick.id > 0 && quick.room?.code !== code && quick.act === WORLD.ISLAND, `${quick.room?.code} vs ${code}, act ${quick.act}`);
    const island = await post('/api/games', { name: 'Island', host: 'New', guestId: newId });
    check('a game on map 1 is for anybody, as before', island.status === 201 && island.body?.map === 1, JSON.stringify(island));
    for (const c of [vet, slow, quick, fresh]) await c.close();
  } catch (e) {
    check('no error', false, String(e && e.stack));
  }
  proc.kill();
}

// ================================================================ the database
{
  const dir = mkdtempSync(join(tmpdir(), 'stn-map2-db-'));
  // the migrations up to this one first, with a match in them that crossed, to see the runs from before it counted
  const before = join(dir, 'before');
  mkdirSync(before);
  for (const f of migrationFiles()) if (f.name < '023') copyFileSync(join(MIGRATIONS_DIR, f.name), join(before, f.name));
  const db = await openDb(`pglite:${join(dir, 'db')}`, { log: quiet }).catch(() => null);
  if (!db) check('a PGlite database', false);
  else {
    await migrate(db, { dir: before + '/' });
    const userId = randomUUID();
    await db.query("INSERT INTO users (id, email, username, password_hash) VALUES ($1, 'vet@x', 'vet', 'x')", [userId]);
    const guest = idKey(randomUUID());
    const late = idKey(randomUUID());
    const admin = idKey(randomUUID());
    const m1 = randomUUID();
    const m2 = randomUUID();
    const t0 = Date.now() - 3600_000;
    const at = (s) => new Date(t0 + s * 1000).toISOString();
    for (const m of [m1, m2]) await db.query('INSERT INTO matches (id, started_at) VALUES ($1, $2)', [m, at(0)]);
    // m1: a run that crossed at 600 s, with the account and a guest in it, and a guest who came after
    await db.query("INSERT INTO match_events (match_id, at, t, type) VALUES ($1, $2, 600, 'crossing')", [m1, at(600)]);
    await db.query('INSERT INTO match_players (match_id, user_id, guest_key, name, joined_at, left_at) VALUES ($1, $2, NULL, $3, $4, $5)', [m1, userId, 'vet', at(0), at(900)]);
    await db.query('INSERT INTO match_players (match_id, user_id, guest_key, name, joined_at, left_at) VALUES ($1, NULL, $2, $3, $4, $5)', [m1, guest, 'Gus', at(10), at(900)]);
    await db.query('INSERT INTO match_players (match_id, user_id, guest_key, name, joined_at, left_at) VALUES ($1, NULL, $2, $3, $4, $5)', [m1, late, 'Late', at(700), at(900)]);
    // m2: an admin's /cross
    await db.query("INSERT INTO match_events (match_id, at, t, type, data) VALUES ($1, $2, 100, 'admin', '{\"command\":\"cross\"}')", [m2, at(100)]);
    await db.query("INSERT INTO match_events (match_id, at, t, type) VALUES ($1, $2, 101, 'crossing')", [m2, at(101)]);
    await db.query('INSERT INTO match_players (match_id, user_id, guest_key, name, joined_at, left_at) VALUES ($1, NULL, $2, $3, $4, $5)', [m2, admin, 'Adm', at(0), at(300)]);
    await migrate(db);
    const stats = new DbStats({ db, log: quiet });
    check('the migration counts the runs that crossed before it: everybody in the match as the car left', (await stats.map1Cleared({ userId })) && (await stats.map1Cleared({ guestKey: guest })));
    check('...not one who came after it left', !(await stats.map1Cleared({ guestKey: late })));
    check("...nor an admin's /cross", !(await stats.map1Cleared({ guestKey: admin })));
    const row = (await db.query('SELECT crossings, map1_at FROM player_stats WHERE key = $1', [`u:${userId}`])).rows[0];
    check('...when it was', row?.crossings === 1 && new Date(row.map1_at).getTime() === t0 + 600_000, JSON.stringify(row));

    // a crossing counted in a game: read before it is written, and written
    const pid = randomUUID();
    const rec = stats.enter(pid, 'Newbie');
    check('a new player has not beaten map 1', !(await stats.map1Cleared({ guestKey: idKey(pid) })));
    stats.bump(rec, 'crossings');
    check('...a crossing counted is read before it is written', await stats.map1Cleared({ guestKey: idKey(pid) }));
    await stats.flush();
    const r2 = (await db.query('SELECT crossings, map1_at FROM player_stats WHERE key = $1', [`g:${idKey(pid)}`])).rows[0];
    check('...and written, with when', r2?.crossings === 1 && !!r2.map1_at, JSON.stringify(r2));
    check('...and /api/progress would say so', (await stats.progressOf({ guestId: pid })).map1 === true);
    // a guest who signs up: their crossings go with them
    const uid2 = randomUUID();
    await db.query("INSERT INTO users (id, email, username, password_hash) VALUES ($1, 'newbie@x', 'newbie', 'x')", [uid2]);
    stats.leave(rec);
    await stats.claimGuest(uid2, 'newbie', pid);
    check('...and moves onto the account they make', await stats.map1Cleared({ userId: uid2 }));
    await stats.close();
    await db.close?.();
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
