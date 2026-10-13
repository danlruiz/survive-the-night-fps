// Coming back into a full game (server/rooms.js attach, server/game.js handleJoin / takeOver) against a real server
// process. A lost connection is often noticed by the browser long before the server: the old socket stays open on the
// server (until its idle timeout) and still fills a seat. The same browser joining again must get its own body back
// at once - the stale socket is let go - and not be told the game is full; anyone else is still turned away. Then the
// same for a signed-in account, on a server with a database of its own (PGlite), from another browser id.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { C2S, S2C, PROTOCOL_VERSION, LEFT_CODE, REJECT_REASON, Writer, Reader } from '../shared/protocol.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 39800 + Math.floor(Math.random() * 90);
const dir = mkdtempSync(join(tmpdir(), 'stn-rejoin-full-'));
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), STATS_FILE: join(dir, 'stats.json'), MAX_PLAYERS: '2', REJOIN_GRACE_SECONDS: '20', GAME_IDLE_SECONDS: '30' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
proc.stdout.on('data', (d) => (log += d));
proc.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 200 && !log.includes('listening'); i++) await sleep(50);

let base = `localhost:${port}`;
const client = (code, name, pid, cookie = '') =>
  new Promise((resolve) => {
    const headers = cookie ? { cookie: `stn_session=${cookie}`, origin: `http://${base}` } : {};
    const ws = new WebSocket(`ws://${base}/ws${code ? `?game=${code}` : ''}`, { headers });
    ws.binaryType = 'arraybuffer';
    const c = { ws, room: null, id: 0, reject: 0, chat: [], snaps: 0, closed: false };
    c.close = (code = 1000) => new Promise((done) => (c.closed ? done() : ((ws.onclose = () => ((c.closed = true), done())), ws.close(code))));
    ws.onopen = () => {
      const w = new Writer(128);
      w.u8(C2S.JOIN);
      w.u8(PROTOCOL_VERSION);
      w.str(name);
      w.str(pid);
      ws.send(w.bytes());
    };
    ws.onmessage = (m) => {
      const r = new Reader(m.data);
      const t = r.u8();
      if (t === S2C.ROOM) c.room = { code: r.str() };
      else if (t === S2C.WELCOME) {
        c.id = r.u16();
        resolve(c);
      } else if (t === S2C.REJECT) {
        c.reject = r.u8();
        resolve(c);
      } else if (t === S2C.SNAPSHOT) c.snaps++;
      else if (t === S2C.CHAT) {
        r.u16();
        r.u8();
        c.chat.push(r.str());
      }
    };
    ws.addEventListener('close', () => {
      c.closed = true;
      resolve(c);
    });
  });
const players = async (code) => (await (await fetch(`http://${base}/api/games/${code}`)).json())?.players;

try {
  const annId = randomUUID();
  const ann = await client('', 'Ann', annId);
  const code = ann.room.code;
  const ben = await client(code, 'Ben', randomUUID());
  await sleep(1200);
  check('the game is full: two of two', (await players(code)) === 2, String(await players(code)));

  // somebody else is turned away from a full game
  const stranger = await client(code, 'Cy', randomUUID());
  check('a newcomer is turned away from a full game', stranger.reject === REJECT_REASON.FULL && !stranger.id, `reject ${stranger.reject}, id ${stranger.id}`);
  await stranger.close();

  // Ann's link goes, but the server has not noticed: her old socket is still open there. Her page joins again.
  const back = await client(code, 'Ann', annId);
  check('the same browser gets back into its full game while its old socket is still open', back.id === ann.id && !back.reject, `id ${back.id} vs ${ann.id}, reject ${back.reject}`);
  await sleep(1200);
  check('...still two players, not three', (await players(code)) === 2, String(await players(code)));
  check('...the stale socket is let go', ann.closed);
  check('...and the game streams to the new one', back.snaps > 10, String(back.snaps));
  check('...told it is back', back.chat.some((t) => /Reconnected/.test(t)), JSON.stringify(back.chat));

  // the game is still full to anyone else
  const stranger2 = await client(code, 'Cy', randomUUID());
  check('a newcomer is still turned away after that', stranger2.reject === REJECT_REASON.FULL && !stranger2.id, `reject ${stranger2.reject}, id ${stranger2.id}`);
  await stranger2.close();

  // a drop the server did notice: the place is held, and the same browser comes back into the full game
  await back.close(1000);
  await sleep(1200);
  const stranger3 = await client(code, 'Cy', randomUUID());
  check('a newcomer cannot take a dropped player\'s held seat', stranger3.reject === REJECT_REASON.FULL && !stranger3.id, `reject ${stranger3.reject}, id ${stranger3.id}`);
  await stranger3.close();
  const again = await client(code, 'Ann', annId);
  check('the same browser takes its held seat back', again.id === ann.id && !again.reject, `id ${again.id} vs ${ann.id}, reject ${again.reject}`);
  await sleep(800);
  check('...still two players', (await players(code)) === 2, String(await players(code)));

  // another browser under the same name is not her
  const imp = await client(code, 'Ann', randomUUID());
  check('another browser under the same name is turned away, not given her body', imp.reject === REJECT_REASON.FULL && !imp.id, `reject ${imp.reject}, id ${imp.id}`);
  check('...and she stays in', !again.closed);
  await imp.close();

  await again.close(LEFT_CODE);
  await ben.close(LEFT_CODE);
} catch (e) {
  check('no error', false, String(e && e.stack));
}
proc.kill();

// ---------------------------------------------------------------- a signed-in account
const port2 = port + 100;
const proc2 = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port2), STATS_FILE: '', NODE_ENV: 'test', DATABASE_URL: `pglite:${join(dir, 'db')}`, LOBBY_LIMITS: '0', HANDOFF: '0', REJOIN_GRACE_SECONDS: '20' }, stdio: ['ignore', 'pipe', 'pipe'] });
proc2.stdout.on('data', (d) => (log += d));
proc2.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 400 && (log.match(/listening/g) || []).length < 2; i++) await sleep(50);
base = `127.0.0.1:${port2}`;
try {
  const post = (path, body) => fetch(`http://${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const reg = await post('/api/auth/register', { email: 'ann@example.com', username: 'Ann', password: 'ann-password' });
  const cookie = /^stn_session=([^;]+)/.exec((reg.headers.getSetCookie?.() || []).join('\n'))?.[1] || '';
  check('signed up', !!cookie, String(reg.status));
  const { code } = await post('/api/games', { name: 'Full', maxPlayers: 2 }).then((r) => r.json());
  for (let i = 0; i < 400; i++) {
    if ((await (await fetch(`http://${base}/api/games/${code}`)).json())?.ready) break;
    await sleep(50);
  }
  const ann = await client(code, 'Ann', randomUUID(), cookie);
  const ben = await client(code, 'Ben', randomUUID());
  await sleep(1000);
  check('signed in: the game is full', ann.id && ben.id && (await players(code)) === 2, `${ann.id} ${ben.id} ${await players(code)}`);
  // her link goes unnoticed; she signs in again from another browser (another browser id), same account
  const back = await client(code, 'Ann', randomUUID(), cookie);
  check('the same account gets back into its full game while its old socket is still open', back.id === ann.id && !back.reject, `id ${back.id} vs ${ann.id}, reject ${back.reject}`);
  await sleep(1000);
  check('...still two players', (await players(code)) === 2, String(await players(code)));
  check('...the stale socket is let go', ann.closed);
  const stranger = await client(code, 'Cy', randomUUID());
  check('...and a guest is still turned away', stranger.reject === REJECT_REASON.FULL && !stranger.id, `reject ${stranger.reject}, id ${stranger.id}`);
  await stranger.close();
  await back.close(LEFT_CODE);
  await ben.close(LEFT_CODE);
} catch (e) {
  check('no error (signed in)', false, String(e && e.stack));
}
proc2.kill();
if (failed) console.log(log.split('\n').slice(-30).join('\n'));
console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
