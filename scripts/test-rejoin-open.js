// Coming back into a game with seats free while the old socket is still open on the server (server/game.js handleJoin,
// client/main.js rejoin), against a real server process. The browser notices a lost connection long before the server
// does (its idle timeout), and goes straight back in; that join says it is coming back (?back=1, Connection.url). It
// must be given its own body - where it was, with what it had - and the stale socket let go, not be made a second, new
// player with a starting kit beside the old one (what a drop did before). The same browser in another tab, without
// it, is still a player of its own.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { C2S, S2C, PROTOCOL_VERSION, LEFT_CODE, Writer, Reader } from '../shared/protocol.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 39700 + Math.floor(Math.random() * 90);
const dir = mkdtempSync(join(tmpdir(), 'stn-rejoin-open-'));
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), STATS_FILE: join(dir, 'stats.json'), MAX_PLAYERS: '4', REJOIN_GRACE_SECONDS: '20', GAME_IDLE_SECONDS: '30' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
proc.stdout.on('data', (d) => (log += d));
proc.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 200 && !log.includes('listening'); i++) await sleep(50);

const base = `localhost:${port}`;
const client = (code, name, pid, back = false) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://${base}/ws${code ? `?game=${code}${back ? '&back=1' : ''}` : ''}`);
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
  check('two players, seats free', (await players(code)) === 2, String(await players(code)));

  // Ann's link goes, but the server has not noticed: her old socket is still open there. Her page goes back in.
  const back = await client(code, 'Ann', annId, true);
  check('the page coming back gets its own body while its old socket is still open', back.id === ann.id && !back.reject, `id ${back.id} vs ${ann.id}, reject ${back.reject}`);
  await sleep(1200);
  check('...still two players, not a new one beside the old body', (await players(code)) === 2, String(await players(code)));
  check('...the stale socket is let go', ann.closed);
  check('...the game streams to the new one', back.snaps > 10, String(back.snaps));
  check('...and it is told it is back', back.chat.some((t) => /Reconnected/.test(t)), JSON.stringify(back.chat));

  // the same browser in another tab (a join that is not coming back) is a player of its own, as ever
  const tab = await client(code, 'Ann', annId);
  check('another tab of the same browser is a player of its own', tab.id && tab.id !== back.id && !tab.reject, `id ${tab.id} vs ${back.id}, reject ${tab.reject}`);
  await sleep(600);
  check('...and the first tab stays in', !back.closed && (await players(code)) === 3, `${back.closed} ${await players(code)}`);

  // a stranger saying it is coming back gets no one's body
  const imp = await client(code, 'Ann', randomUUID(), true);
  check('another browser coming "back" under her name is a new player, not her', imp.id && imp.id !== back.id && imp.id !== tab.id, `id ${imp.id}`);
  check('...and she stays in', !back.closed && !tab.closed);

  await imp.close(LEFT_CODE);
  await tab.close(LEFT_CODE);
  await back.close(LEFT_CODE);
  await ben.close(LEFT_CODE);
} catch (e) {
  check('no error', false, String(e && e.stack));
}
proc.kill();
if (failed) console.log(log.split('\n').slice(-30).join('\n'));
console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
