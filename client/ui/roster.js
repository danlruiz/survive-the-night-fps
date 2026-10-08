// Player list, up for as long as [Tab] is held: a sheet down the right-hand side (sheet.js) that answers the question
// asked mid-fight - who needs me, and where. The downed come first, with how long they have been down (as long as we
// saw them go down), which way they are from where you look, how far and the place they are in when you know it; then
// those on their feet, the most hurt first, with their health as a number; then the dead and the turned, on a line.
// Level, kills and ping stay, faint, at the edge. Who is on the walkie-talkie, who is talking and who is your friend
// (by their account: friends.js) are marked on the name.
// Held up, nothing in it takes a click and the pointer stays locked; a click pins it (Game.pinRoster) with the
// pointer free, and then a click on a player opens their profile (profile.js), docked in the same sheet, and the
// tabs on its edge go to the leaderboard and Friends.
import { el, svgEl, clamp } from './dom.js';
import { glyph } from './icons.js';
import { healthTier } from './hud2.js';
import { bindLabel, liveText } from '../game/binds.js';
import { SheetTabs, dock, undock } from './sheet.js';

const IN_RUN = (st) => st === 'alive' || st === 'downed';
const elapsed = (s) => {
  s = Math.max(0, Math.floor(s));
  return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
};
const far = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);

export class Roster {
  constructor(ui, parent) {
    this.ui = ui;
    this.open = false;
    this.pinned = false;
    this.key = null;
    this.rows = []; // per player shown, in list order: what set() moves without a rebuild
    this.players = []; // the list as last set

    this.onClose = null; // (the game: let go of the pinned list)

    this.root = el('div', 'pls-scr', parent);
    this.root.hidden = true;
    const frame = (this.frame = el('div', 'pls-frame paper', this.root));
    frame.setAttribute('aria-label', 'Survivors');
    this.tabs = new SheetTabs(ui, frame, 'players');
    const head = el('div', 'pls-head', frame);
    el('h2', 'pls-title', head, 'Survivors');
    const close = (this.close = svgEl('button', 'pls-close btn-icon', head, glyph('xmark')));
    close.type = 'button';
    close.title = 'Close (Esc)';
    close.setAttribute('aria-label', 'Close the player list');
    close.addEventListener('click', () => this.onClose?.());
    this.counts = el('div', 'pls-counts', frame);

    this.body = el('div', 'pls-body', frame);
    this.body.addEventListener('click', (e) => {
      const it = e.target.closest?.('[data-i]');
      if (this.pinned && it) this.pick(+it.dataset.i);
    });
    this.body.addEventListener('keydown', (e) => {
      const it = e.target.closest?.('[data-i]');
      if (this.pinned && it && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.pick(+it.dataset.i);
      }
    });
    this.root.addEventListener('pointerdown', (e) => {
      if (this.pinned && e.button === 0 && e.target === this.root) this.onClose?.();
    });

    // what a click does, held up and pinned
    const keys = el('div', 'pls-keys', frame);
    const held = (this.heldKeys = el('div', 'pls-keyset', keys));
    let s = el('span', 'pls-key', held);
    el('span', 'kbd sm', s, 'LMB');
    el('span', '', s, 'pin it, then pick a player');
    s = el('span', 'pls-key', held);
    liveText(el('span', 'kbd sm', s), () => bindLabel('board'));
    el('span', '', s, 'leaderboard');
    const pinned = (this.pinnedKeys = el('div', 'pls-keyset', keys));
    s = el('span', 'pls-key', pinned);
    el('span', 'kbd sm', s, 'LMB');
    el('span', '', s, 'a player’s profile');
    s = el('span', 'pls-key', pinned);
    liveText(el('span', 'kbd sm', s), () => bindLabel('players'));
    el('span', '', s, 'close');
    this.setPinned(false);
  }

  setOpen(open) {
    open = !!open;
    if (!open) this.setPinned(false);
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
  }

  setPinned(pin) {
    pin = !!pin;
    if (pin === this.pinned && this.key !== null) return;
    this.pinned = pin;
    this.root.classList.toggle('pinned', pin);
    this.close.hidden = !pin;
    this.tabs.root.hidden = !pin;
    this.heldKeys.hidden = pin;
    this.pinnedKeys.hidden = !pin;
    this.key = null; // (the rows take the focus and the clicks now, or no longer)
    if (!pin) undock(this.ui);
    this.set(this.players);
  }

  pick(i) {
    const p = this.players[i];
    if (!p) return;
    this.ui.sound('ui_click');
    if (this.ui.friends?.visible) this.ui.friends.hide();
    dock(this.ui.profile);
    this.ui.profile.show(p);
  }

  // list: [{id, name, account ('' for a guest), status: 'alive' | 'downed' | 'dead' | 'zombie', hp (0..1, -1 =
  // unknown), kills, ping, level, perks (a mask), talking, radio, self, and where they are as the game sees it:
  // dist (metres, 0 for yourself, null: not known), dir (radians from where you look, clockwise; null: none), place
  // (the place they are in, '' if none you know), downFor (seconds since we saw them go down; null: not seen)}].
  // Called often while the list is up: the rows are rebuilt only when the order or what is on them changed, and
  // health, distance, direction and time down move in place.
  set(list) {
    list = Array.isArray(list) ? list : [];
    this.players = list;
    if (this.ui.profile?.visible) this.ui.profile.refresh(list);
    const friend = list.map((p) => !p.self && this.ui.isFriendId(p.id));
    const idx = list.map((_, i) => i);
    const st = (i) => list[i].status || 'alive';
    const hp = (i) => Math.round(clamp(list[i].hp ?? -1, -1, 1) * 100);
    // who needs help: the longest down first (those we did not see go down after them), then the nearest
    const down = idx.filter((i) => st(i) === 'downed').sort((a, b) => (list[b].downFor ?? -1) - (list[a].downFor ?? -1) || (list[a].dist ?? 1e9) - (list[b].dist ?? 1e9));
    // on their feet: the most hurt first (health not known: last), then by name
    const hpKey = (i) => (hp(i) < 0 ? 101 : hp(i));
    const up = idx.filter((i) => st(i) === 'alive').sort((a, b) => hpKey(a) - hpKey(b) || String(list[a].name).localeCompare(String(list[b].name)));
    const out = idx.filter((i) => !IN_RUN(st(i)));

    // (the health of a row moves its place in the list: a rebuild then, but not for every point lost)
    const rowKey = (i) => {
      const p = list[i];
      return [i, p.id, p.name, st(i), p.kills | 0, Math.round((p.ping || 0) / 5), p.talking ? 1 : 0, p.radio ? 1 : 0, p.self ? 1 : 0, friend[i] ? 1 : 0, p.level | 0].join('|');
    };
    const key = [down, up, out].map((g) => g.map(rowKey).join(';')).join('/') + (this.pinned ? '!' : '');
    if (key !== this.key) {
      this.key = key;
      const focused = this.body.contains(document.activeElement) ? list[+document.activeElement.dataset?.i]?.id : null;
      this.body.textContent = '';
      this.rows = [];
      this._section('Needs help', 'help', down, list, friend);
      this._section('On their feet · most hurt first', 'up', up, list, friend);
      if (out.length) {
        el('div', 'pls-sec', this.body, 'Out of the run');
        const line = el('div', 'pls-out', this.body);
        for (const i of out) this._chip(line, i, list[i]);
      }
      if (!list.length) el('div', 'pls-none', this.body, 'Nobody here yet.');
      this.counts.textContent = '';
      const n = (cls, text) => el('span', 'pls-count ' + cls, this.counts, text);
      n('up', `${up.length + down.length} standing`);
      if (down.length) n('down', `${down.length} down`);
      if (out.length) n('out', `${out.length} out`);
      if (focused != null) this.body.querySelector(`[data-i="${list.findIndex((p) => p.id === focused)}"]`)?.focus({ preventScroll: true });
    }
    for (const r of this.rows) this._move(r, list[r.i]);
  }

  _pickable(e, i, p) {
    e.dataset.i = String(i);
    if (!this.pinned) return;
    e.tabIndex = 0;
    e.setAttribute('role', 'button');
    e.title = `${p.name}'s profile`;
  }

  _section(title, cls, group, list, friend) {
    if (!group.length) return;
    el('div', 'pls-sec ' + cls, this.body, title);
    const ul = el('ul', 'pls-list', this.body);
    for (const i of group) this._row(ul, i, list[i], friend[i]);
  }

  _row(ul, i, p, friend) {
    const st = p.status || 'alive';
    const li = el('li', 'pls-row st-' + st + (p.self ? ' self' : '') + (p.talking ? ' talking' : '') + (this.pinned ? ' pick' : ''), ul);
    this._pickable(li, i, p);
    svgEl('i', 'pls-st', li, glyph(st === 'downed' ? 'downed' : 'person'));
    const main = el('div', 'pls-main', li);
    const top = el('div', 'pls-top', main);
    el('span', 'pls-name', top, p.name || '???');
    if (p.self) el('small', 'pls-you', top, 'you');
    if (friend) svgEl('i', 'pls-ico pls-friend', top, glyph('star')).title = 'Your friend';
    if (p.radio) svgEl('i', 'pls-ico pls-radio', top, glyph('radio')).title = 'On the walkie-talkie';
    if (p.talking) svgEl('i', 'pls-ico pls-mic', top, glyph('mic')).title = 'Talking';
    const where = el('div', 'pls-where', main);
    const dir = svgEl('i', 'pls-dir', where, glyph('arrowUp'));
    const dist = el('b', 'pls-dist', where, '');
    const place = el('span', 'pls-place', where, '');
    const side = el('div', 'pls-side', li);
    const row = { i, li, where, dir, dist, place, hpN: null, bar: null, fill: null, hp: null, downT: null, down: null, wh: null };
    if (st === 'downed') {
      el('span', 'pls-tag', side, 'Down');
      row.downT = el('span', 'pls-downt', side, '');
    } else row.hpN = el('span', 'pls-hpn', side, '');
    const meta = el('span', 'pls-meta', top); // (on the name's line, pushed to its end)
    const k = el('span', 'pls-kills', meta);
    k.title = 'Kills this game';
    svgEl('i', '', k, glyph('skull'));
    el('b', '', k, String(p.kills | 0));
    el('span', 'pls-lv', meta, `LV ${p.level || 1}`).title = `Level ${p.level || 1}`;
    if (p.ping != null) el('span', 'pls-ping', meta, Math.round(p.ping) + ' ms').title = 'Ping';
    if (st === 'alive') {
      row.bar = el('i', 'pls-hp', li);
      row.fill = el('i', '', row.bar);
    }
    this.rows.push(row);
  }

  _chip(line, i, p) {
    const st = p.status;
    const c = el('span', 'pls-chip st-' + st + (p.self ? ' self' : '') + (this.pinned ? ' pick' : ''), line);
    this._pickable(c, i, p);
    svgEl('i', 'pls-ico', c, glyph(st === 'zombie' ? 'claw' : 'skull'));
    el('span', 'pls-name', c, p.name || '???');
    if (p.self) el('small', 'pls-you', c, 'you');
    el('small', 'pls-chip-st', c, st === 'zombie' ? 'turned' : 'dead');
    el('small', 'pls-chip-k', c, String(p.kills | 0)).title = 'Kills this game';
  }

  // what moves between rebuilds: health, and where they are from you
  _move(r, p) {
    if (!p) return;
    const dist = p.self ? 0 : p.dist;
    const known = dist != null && isFinite(dist);
    const wh = [known ? (p.self ? 'here' : far(dist)) : '', p.place || '', p.self || p.dir == null ? '' : Math.round((p.dir * 180) / Math.PI / 5)].join('|');
    if (wh !== r.wh) {
      r.wh = wh;
      r.where.hidden = !known && !p.place;
      r.dist.textContent = known ? (p.self ? 'here' : far(dist)) : '';
      r.place.textContent = p.place || '';
      r.dir.hidden = p.self || p.dir == null || !known;
      if (!r.dir.hidden) r.dir.style.transform = `rotate(${p.dir.toFixed(3)}rad)`;
    }
    if (r.downT) {
      const t = p.downFor != null ? elapsed(p.downFor) : '';
      if (t !== r.down) {
        r.down = t;
        r.downT.textContent = t;
        r.downT.title = t ? `Down for ${t}, since you saw them fall` : '';
      }
    }
    if (!r.hpN) return;
    const hp = Math.round(clamp(p.hp ?? -1, -1, 1) * 100);
    if (r.hp === hp) return;
    r.hp = hp;
    r.hpN.textContent = hp < 0 ? '' : String(hp);
    r.hpN.className = 'pls-hpn' + healthTier(hp / 100);
    r.li.title = this.pinned ? `${p.name}'s profile` : hp < 0 ? '' : `${hp}% health`;
    r.bar.hidden = hp < 0;
    if (hp < 0) return;
    r.bar.className = 'pls-hp' + healthTier(hp / 100);
    r.fill.style.transform = `scaleX(${hp / 100})`;
  }
}
