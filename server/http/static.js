// The built client (dist/): the page, its scripts, styles and sounds, served by the network thread (index.js). A file
// the build also wrote compressed is sent that way to a browser that takes it; the page carries what it was built as
// (stamp); and a game an older build carries on here (builds.js) is played with that build's page and files.
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { abortWatch } from '../http.js';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
};
const typeOf = (name) => MIME[extname(name)] || 'application/octet-stream';

// A file the build also wrote compressed (vite.config.js precompress: name.gz, name.br beside it) is sent that way to a
// browser that takes it: those are not read now, only noted (gzFile, brFile), and read the first time one is asked for
// (sendStatic). Nothing is compressed here.
// files: url path -> { body, type, gzFile?, brFile? }, filled from dir
export function loadDir(files, dir, prefix = '') {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  const names = new Set(entries.map((e) => e.name));
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) loadDir(files, full, `${prefix}/${e.name}`);
    else if (/\.(gz|br)$/.test(e.name) && names.has(e.name.slice(0, -3))) continue; // (noted with the file it is of)
    else {
      const f = { body: readFileSync(full), type: typeOf(e.name) };
      if (names.has(`${e.name}.gz`)) f.gzFile = `${full}.gz`;
      if (names.has(`${e.name}.br`)) f.brFile = `${full}.br`;
      files.set(`${prefix}/${e.name}`, f);
    }
  }
}

// The page carries what it was built as (client/net/moveback.js pageBuild): read from the page, not asked of the server
// later, when a deploy may already have put another build behind the same address.
export const stamp = (html, { build, compat, protocol }) => {
  const meta = `<meta name="stn-build" content="${build} ${compat} ${protocol}">`;
  const s = html.toString('utf8');
  const at = s.search(/<head[^>]*>/i);
  return Buffer.from(at < 0 ? meta + s : s.replace(/<head[^>]*>/i, (h) => h + meta));
};

// The page as this server serves it: stamped with what runs here (client: { build, compat, protocol })
export function stampPage(files, client) {
  const f = files.get('/index.html');
  if (!f) return;
  f.raw = f.body; // (as built: what is kept for a server after this one to serve, builds.js)
  f.body = stamp(f.body, client);
  // (the page built compressed is the page before its stamp: this one is compressed here, the first time it is asked
  // for - 3 KB, a few ms)
  f.gzFile = f.brFile = '';
  f.stamped = f.body.length >= 1024;
}

const ADMIN_PAGE_HEADERS = [
  ['X-Frame-Options', 'DENY'],
  ['Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"],
  ['Referrer-Policy', 'same-origin'],
  ['X-Content-Type-Options', 'nosniff'],
];
// copy: which of the file goes ('br', 'gz' - in memory by now - or '' for the file as it is)
function sendFile(res, url, f, copy = '') {
  res.cork(() => {
    res.writeHeader('Content-Type', f.type);
    // (the admin panel is never shown inside another site's page, where a click could be steered onto its buttons, and
    // runs no script and sends nothing anywhere but here)
    if (url === '/admin.html') for (const [k, v] of ADMIN_PAGE_HEADERS) res.writeHeader(k, v);
    // (the page itself is asked for again every time: after a deploy a reload has to get the new build's)
    res.writeHeader('Cache-Control', url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    const body = (copy && f[copy]) || f.body;
    if (f.gzFile || f.brFile || f.gz || f.br || f.stamped) res.writeHeader('Vary', 'Accept-Encoding');
    if (body !== f.body) res.writeHeader('Content-Encoding', copy === 'br' ? 'br' : 'gzip');
    res.end(body);
  });
}
// The copy of a file for a browser that takes `accepts` (its Accept-Encoding): 'br' or 'gz' when there is one (written
// by the build; the stamped page's made here, once), else ''
function encodingFor(f, accepts) {
  const br = /\bbr\b/.test(accepts);
  const gz = /\bgzip\b/.test(accepts);
  if (f.stamped && (br || gz) && !f.gz) {
    f.gz = gzipSync(f.body, { level: 9 });
    f.br = brotliCompressSync(f.body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: f.body.length } });
  }
  return br && (f.br || f.brFile) ? 'br' : gz && (f.gz || f.gzFile) ? 'gz' : '';
}
// (a copy the build wrote is read from disk the first time it is wanted, and kept: only the encodings browsers ask for
// are held. One that cannot be read is not tried again - the file goes as it is)
const readCopy = (f, k, log) =>
  (f[`${k}Read`] ||= readFile(f[`${k}File`]).then(
    (body) => (f[k] = body),
    (err) => {
      log(`${f[`${k}File`]} could not be read (${err.message}): sent as it is`);
      f[`${k}File`] = '';
    }
  ));
// A client file, as the browser takes it. aborted: () => whether the request is gone, for one already waited on (else
// it is watched here, if the copy has to be read first)
function sendStatic(res, url, f, accepts, log, aborted = null) {
  const k = encodingFor(f, accepts);
  if (!k || f[k]) return sendFile(res, url, f, k);
  aborted ||= abortWatch(res);
  readCopy(f, k, log).then(() => aborted() || sendFile(res, url, f, f[k] ? k : ''));
}

const NOT_FOUND = (res) => res.cork(() => res.writeStatus('404 Not Found').end('Not found'));
// A page that cannot be served just now - this server is going down (the next one has it), or the page of the older
// build that runs this game could not be had from the store: 503, and a page that asks again by itself a few times
// (client/main.js forgets the count once a page is up), then says so. Never the page of another build in its place: a
// page of this build for a game an older build runs would be sent to that game's page again, and again.
const retryPage = (why) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Survive the Night</title></head><body style="background:#0b0d12;color:#ddd;font:16px system-ui,sans-serif;padding:2em"><p id="why">${why}</p><script>(function(){var k='stn.retry.'+location.pathname+location.search,n=0;try{n=+sessionStorage.getItem(k)||0;sessionStorage.setItem(k,n+1)}catch(e){}if(n<5)setTimeout(function(){location.reload()},1000*(n+1));else{try{sessionStorage.removeItem(k)}catch(e){}document.getElementById('why').innerHTML='${why} It still is: try again in a minute, or <a href="/" style="color:#9cf">start or join another game</a>.'}})()</script></body></html>`;
const UNAVAILABLE = (res, why) =>
  res.cork(() => res.writeStatus('503 Service Unavailable').writeHeader('Retry-After', '2').writeHeader('Cache-Control', 'no-store').writeHeader('Content-Type', MIME['.html']).end(retryPage(why)));

// The page, and the client's files (every GET no other route answers). A game an older build carries on here
// (builds.js) is played with that build's client: the page asked for with its code (/?game=CODE: where its players'
// pages are, and its invite link) is that build's, once it is known what became of the game's restore; and that build's
// files are served under their own names, which no file of this build has (they are named by their content) - for those
// players, and for any page of an older client still playing after a deploy that only changed the client.
// files: loadDir's. builds: null without them. stopping(): the server is going down
export function clientRoutes(app, { files, builds, lobby, stopping, log }) {
  app.get('/*', (res, req) => {
    let url = req.getUrl();
    if (url === '/stats' || url === '/stats/') url = '/stats.html';
    if (url === '/admin' || url === '/admin/') url = '/admin.html';
    const accepts = req.getHeader('accept-encoding');
    if (!files.has(url) && url.startsWith('/assets/')) {
      if (!builds?.has(url)) return NOT_FOUND(res);
      const aborted = abortWatch(res);
      builds.asset(url).then((body) => aborted() || (body ? sendFile(res, url, { body, type: typeOf(url) }) : NOT_FOUND(res)));
      return;
    }
    if (url === '/' || !files.has(url)) url = files.has(url) ? url : '/index.html';
    const f = files.get(url);
    if (!f) {
      res.writeStatus('404 Not Found').end('Not found - build the client with `npm run build`');
      return;
    }
    // (a server going down: its pages are the next server's to give - as /api/version, it answers 503 for them)
    if (stopping() && f.type === MIME['.html']) return UNAVAILABLE(res, 'The game is being updated. One moment...');
    const code = url === '/index.html' && builds ? String(req.getQuery('game') || '').trim().toUpperCase() : '';
    if (!code) return sendStatic(res, url, f, accepts, log);
    const aborted = abortWatch(res);
    lobby
      .settle(code)
      .catch(() => null)
      .then(async (room) => {
        if (!room?.pin) return aborted() || sendStatic(res, url, f, accepts, log, aborted);
        const page = await builds.asset('/index.html', room.pin.id);
        if (aborted()) return;
        if (page) sendFile(res, url, { body: stamp(page, room.pin.client), type: MIME['.html'] });
        else UNAVAILABLE(res, "This game is played on an older version of the game, whose page could not be loaded just now. Trying again...");
      });
  });
}
