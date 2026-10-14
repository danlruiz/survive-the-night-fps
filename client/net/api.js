// Talking to the server outside a game's socket: its JSON API (the lobby, the account, friends, progress, the
// loadout, achievements, feedback) and the address of its other sockets.

// The server's JSON API: the answer's body, or an Error with the server's own words, its status and (for a form) the
// field it is about; 'Could not reach the server' when there was no answer
export async function call(path, init = {}, ms = 4000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(path, { cache: 'no-store', ...init, signal: ctl.signal });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    if (!res.ok) {
      const err = new Error(body?.error || (res.status === 404 ? 'Not found' : 'The server said no'));
      err.status = res.status;
      err.field = typeof body?.field === 'string' ? body.field : '';
      throw err;
    }
    return body;
  } catch (err) {
    if (err.status) throw err;
    throw new Error('Could not reach the server');
  } finally {
    clearTimeout(to);
  }
}

const sendJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// a JSON POST through call
export const post = (path, body = {}, ms = 4000) => call(path, sendJson('POST', body), ms);
// ...and a PUT
export const put = (path, body, ms = 4000) => call(path, sendJson('PUT', body), ms);

// A PUT sent as the page goes (pagehide): keepalive outlives the page, and nothing is said of how it went
export function putAsPageGoes(path, body) {
  try {
    fetch(path, { ...sendJson('PUT', body), keepalive: true }).catch(() => {});
  } catch {
    /* (too late to say anything) */
  }
}

// the address of one of the server's sockets: path '/ws', '/social', '/cards'...
export function socketUrl(path) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
}
