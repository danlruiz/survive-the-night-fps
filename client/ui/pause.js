// The Esc menu: a rail down the left edge with the world left in view, because the game never stops for it (no
// "paused" or "resume" anywhere on it). One big "Back to the game", then the rows in three groups (Squad, Progress,
// Options), and Leave apart at the foot, saying what leaving costs and who is down and needs a hand. Leave asks once
// - "Stay" picked first, where the pointer already is - instead of being held. A red bar across the top says when you
// are being hit behind the menu. The arrow keys move through the rows and stop at the ends, → on Invite picks Copy
// link, and Enter opens one. Esc is not a way back: the browser counts no Esc as a gesture (the mouse can't be taken
// back on one), and in fullscreen holding Esc leaves fullscreen. A short window (a zoomed-in browser) folds the rail
// into two columns (ux-pause.css).
import { el, svgEl, button, replay } from './dom.js';
import { glyph } from './icons.js';
import { difficultyText } from './games.js';
import { accountState, onAccountChange } from '../net/account.js';
import { unreadCount, onSocialChange, socialState } from '../net/friends.js';
import { achievementsView, onAchievements, ACH_TOTAL } from '../net/achievements.js';
import { lastProgress, onProgress } from '../net/progress.js';
import { bestiaryView, onBestiary } from '../net/bestiary.js';
import { BESTIARY, seenCount } from '../../shared/bestiary.js';
import './ux-pause.css'; // the Esc menu (Pause)

// how long the "You're taking hits" bar stays up after the last hit
const HIT_SHOW_MS = 2600;

// the text onto the clipboard: the API, or (none outside https / localhost) the old way, from a field off the screen
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const f = el('textarea', '', document.body);
    f.value = text;
    f.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    f.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    f.remove();
    return ok;
  }
}

// who is down, in a line: "A is down", "A and B are down", "3 teammates are down"
function downLine(names) {
  if (names.length === 1) return `${names[0]} is down and needs a hand.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are down and need a hand.`;
  return `${names.length} teammates are down and need a hand.`;
}

export class Pause {
  constructor(ui, parent) {
    this.ui = ui;
    this.room = null;
    this.link = '';
    this.sel = 0;
    this.side = false; // Copy link picked, on the Invite row
    this.asking = false; // Leave pressed: "Stay / Leave" up in its place
    this.pick = 0; // ...and which of the two Enter takes: 0 Stay, 1 Leave
    const root = (this.root = el('div', 'pause', parent));
    root.hidden = true;
    el('div', 'pause-shade', root);

    // hit behind the menu: the bar across the top, for a moment after each hit
    const hit = (this.hitBar = el('div', 'pm-hit', root));
    hit.hidden = true;
    hit.setAttribute('role', 'alert');
    svgEl('i', 'pm-hit-ico', hit, glyph('hazard'));
    el('b', 'pm-hit-t', hit, 'You’re taking hits');
    this.hitHp = el('span', 'pm-hit-hp', hit, '');
    el('span', 'pm-hit-go', hit, 'Click anywhere to fight');

    const rail = el('div', 'pm-rail', root);
    const head = el('div', 'pm-head', rail);
    const live = el('div', 'pm-live', head);
    el('i', 'pm-dot', live);
    el('b', 'pm-live-tag', live, 'Live');
    this.liveTxt = el('span', '', live, '');
    this.title = el('div', 'pm-title', head, 'Menu');
    const meta = el('div', 'pm-meta', head);
    this.code = el('span', 'pm-code', meta, '');
    this.code.title = 'Game code';
    this.sub = el('span', 'pm-sub', meta, '');

    this.rows = [];
    const row = (into, icon, label, run, cls = '') => {
      const b = button('pm-row' + cls, into);
      b.setAttribute('role', 'menuitem');
      svgEl('i', 'pm-ico', b, glyph(icon));
      el('span', 'pm-label', b, label);
      const hint = el('span', 'pm-hint', b);
      const r = { b, hint, run };
      b.addEventListener('pointerenter', () => this.select(this.rows.indexOf(r), false));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ui.sound('ui_click');
        r.run();
      });
      this.rows.push(r);
      return r;
    };
    const back = row(rail, 'arrowRight', 'Back to the game', () => this.ui.cb.onResume(), ' pm-back');
    el('span', 'kbd sm pm-key', back.hint, 'Enter');

    // the world is the way back: a hint over it (beside the rail; in the left column of a short window)
    const play = el('div', 'pm-play', rail);
    svgEl('i', 'pm-play-ico', play, glyph('arrowRight'));
    el('span', 'pm-play-t', play, 'Click anywhere here to play');
    el('span', 'pm-play-t pm-play-esc', play, 'Esc can’t close this: click the world to play');
    play.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.sound('ui_click');
      this.ui.cb.onResume();
    });

    const groups = el('div', 'pm-groups', rail);
    groups.setAttribute('role', 'menu');
    const group = (name) => {
      const g = el('div', 'pm-group', groups);
      el('div', 'pm-gh', g, name);
      return g;
    };
    let g = group('Squad');
    // Copy link beside the Invite row (not in it: a button in a button is no button)
    const wrap = (this.inviteWrap = el('div', 'pm-wrap', g));
    this.invite = row(wrap, 'personPlus', 'Invite friends', () => this.ui.invitePanel.show());
    const copy = (this.copyBtn = button('pm-copy', wrap));
    copy.title = 'Copy the invite link';
    svgEl('i', 'pm-copy-ico', copy, glyph('link'));
    this.copyTxt = el('span', '', copy, 'Copy link');
    copy.addEventListener('pointerenter', () => {
      this.select(this.rows.indexOf(this.invite), false);
      this._side(true, false);
    });
    copy.addEventListener('pointerleave', () => this._side(false, false));
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.sound('ui_click');
      this._copy();
    });
    this.fr = row(g, 'star', 'Friends', () => this.ui.friends.show());
    g = group('Progress');
    this.perks = row(g, 'arrowUp', 'Perks', () => this.ui.progress.show(), ' pm-perks');
    this.ach = row(g, 'trophy', 'Achievements', () => this.ui.achPanel.show());
    this.best = row(g, 'skull', 'Bestiary', () => this.ui.cb.onBestiary());
    this.notes = row(g, 'map', 'Field notes', () => this.ui.fieldNotes.show());
    this.notes.hint.textContent = 'Tonight · tracked';
    row(g, 'cards', 'Dead Hand', () => this.ui.cb.onCards());
    g = group('Options');
    row(g, 'gear', 'Settings', () => this.ui.settingsPanel.show()).hint.textContent = 'Mouse · sound · video';
    row(g, 'keyboard', 'Keys & controls', () => this.ui.settingsPanel.show('keys')).hint.textContent = 'Every control';

    // Leave, apart: asks once, Stay first
    const box = el('div', 'pm-leavebox', rail);
    const leave = (this.leave = row(box, 'exit', 'Leave game', () => this._ask(true), ' pm-leave'));
    el('span', 'kbd sm pm-key', leave.hint, 'Enter');
    const ask = (this.askEl = el('div', 'pm-ask', box));
    ask.hidden = true;
    ask.setAttribute('role', 'group');
    const q = el('div', 'pm-ask-q', ask);
    svgEl('i', 'pm-ico', q, glyph('exit'));
    this.askQ = el('span', '', q, 'Leave this game?');
    const btns = el('div', 'pm-ask-btns', ask);
    const choice = (cls, label, i, run) => {
      const b = button(cls, btns);
      if (i) svgEl('i', 'pm-ico', b, glyph('exit'));
      el('span', '', b, label);
      el('span', 'kbd sm pm-key', b, 'Enter');
      b.addEventListener('pointerenter', () => this._pick(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ui.sound('ui_click');
        run();
      });
      return b;
    };
    this.stayBtn = choice('pm-stay', 'Stay', 0, () => this._ask(false));
    this.goBtn = choice('pm-go', 'Leave', 1, () => this.ui.cb.onLeave());
    this.cost = el('p', 'pm-cost', box, '');
    const warn = (this.warn = el('p', 'pm-warn', box));
    warn.hidden = true;
    svgEl('i', 'pm-ico', warn, glyph('downed'));
    this.warnTxt = el('span', '', warn, '');

    const keys = el('div', 'pm-keys', rail);
    const key = (into, caps, what) => {
      const k = el('span', 'pm-k', into);
      for (const c of caps) el('span', 'kbd sm', k, c);
      el('span', 'pm-k-t', k, what);
    };
    const menuKeys = el('span', 'pm-keyset pm-keys-menu', keys);
    key(menuKeys, ['↑', '↓'], 'Select (stops at the ends)');
    key(menuKeys, ['Enter'], 'Open');
    const askKeys = el('span', 'pm-keyset pm-keys-ask', keys);
    key(askKeys, ['←', '→'], 'Stay or leave');
    key(askKeys, ['Enter'], 'Choose');

    // the hints on the right of the rows, kept as what they stand for changes
    const sync = () => this._syncHints();
    onProgress(sync);
    onAchievements(sync);
    onSocialChange(sync);
    onAccountChange(sync);
    onBestiary(sync);

    // captured before input.js, which would otherwise take Enter for the chat
    window.addEventListener('keydown', (e) => this._key(e), true);
    // with the field notes up, a click off them only closes them (like any other modal's backdrop): taken before the
    // rail's rows or the resume below see it
    root.addEventListener(
      'click',
      (e) => {
        if (!this.ui.fieldNotes?.visible || e.target.closest('.bkn')) return;
        e.stopPropagation();
        e.preventDefault();
        this.ui.fieldNotes.hide();
      },
      true,
    );
    // clicking anywhere off the rail resumes (keeps the user gesture for pointer lock)
    root.addEventListener('click', (e) => {
      if (e.target.closest('.pm-rail')) return;
      this.ui.sound('ui_click');
      this.ui.cb.onResume();
    });
  }

  // the game we are in: { code, name, inviteOnly, difficulty } (null: none), and its invite link
  setRoom(room, link) {
    this.room = room;
    this.link = room ? link || '' : '';
    this.ui.invitePanel.set(room, link);
    this.inviteWrap.hidden = !room;
    this.title.textContent = room ? room.name : 'Menu';
    this._sync();
  }

  // what changes while the menu is up: the clock, who is here and who is down
  _sync() {
    this._syncLive();
    this._syncSub();
    this._syncLeave();
    this._syncHints();
  }

  // "Live · Night 3 · dawn in 2:14 · 30 left": the HUD's clock, as it last drew it (hud/clock.js _clock)
  _syncLive() {
    const c = this.ui.hud.c;
    const parts = [];
    if (c.clkTitle) parts.push(c.clkTitle);
    const when = [c.clkLabel, c.clkTime].filter(Boolean).join(' ');
    if (when) parts.push(when);
    if (c.remain >= 0) parts.push(`${c.remain} left`);
    const t = parts.length ? '· ' + parts.join(' · ') : '';
    if (this.liveTxt.textContent !== t) this.liveTxt.textContent = t;
  }

  // the players as the player list last had them (client/game/game/players.js pushRoster)
  get _players() {
    return this.ui.roster.players || [];
  }

  _syncSub() {
    const room = this.room;
    this.code.hidden = !room;
    if (!room) return void (this.sub.textContent = '');
    this.code.textContent = room.code;
    const list = this._players;
    const parts = [difficultyText(room.difficulty), room.inviteOnly ? 'Invite only' : 'Public'];
    if (list.length) parts.push(`${list.filter((p) => p.status === 'alive' || p.status === 'downed').length} alive of ${list.length}`);
    else {
      const n = this.ui.cb.onPeers?.()?.players?.length || 0;
      if (n) parts.push(`${n} survivor${n === 1 ? '' : 's'}`);
    }
    this.sub.textContent = parts.join(' · ');
  }

  // what leaving costs (server/game/sessions.js removePlayer: the starting kit goes along, what was found on top of it drops
  // for the team; the last one out ends the run) and who is down and needs a hand
  _syncLeave() {
    const room = this.room;
    const list = this._players;
    const me = list.find((p) => p.self);
    const others = list.filter((p) => !p.self);
    this.askQ.textContent = room ? `Leave ${room.name}?` : 'Leave this game?';
    let cost = 'Leaves at once.';
    if (!me || me.status === 'alive' || me.status === 'downed') cost += ' What you found drops where you stand for the team; your starting kit goes with you.';
    if (list.length && !others.length) cost += ' You’re the only one here, so the run ends.';
    else if (room) cost += ` Back in with ${room.code}.`;
    if (this.cost.textContent !== cost) this.cost.textContent = cost;
    const down = others.filter((p) => p.status === 'downed').map((p) => p.name || '???');
    this.warn.hidden = !down.length;
    this.root.classList.toggle('pm-someone-down', down.length > 0);
    if (down.length) this.warnTxt.textContent = downLine(down);
  }

  _syncHints() {
    const count = (hint, n, text) => {
      hint.textContent = '';
      if (n) el('b', 'pm-n', hint, n > 99 ? '99+' : String(n));
      if (text) el('span', '', hint, text);
    };
    const p = lastProgress();
    const pending = p?.pending || 0;
    count(this.perks.hint, pending, [pending ? 'to spend' : '', p?.level ? `Lv ${p.level}` : ''].filter(Boolean).join(' · '));
    const a = achievementsView();
    this.ach.hint.textContent = a.loading || a.error ? '' : `${Object.keys(a.unlocked).length} / ${ACH_TOTAL}`;
    const b = bestiaryView();
    this.best.hint.textContent = b.loading ? '' : `${seenCount(b.mask)} / ${BESTIARY.length} seen`;
    const s = socialState();
    const user = !!accountState().user;
    const unread = user ? unreadCount() : 0;
    const online = user && s.loaded ? `${s.friends.filter((f) => f.status !== 'offline').length} online` : '';
    count(this.fr.hint, unread, [unread ? 'new' : '', online].filter(Boolean).join(' · '));
  }

  // the row that Enter opens: hovered, or moved to with the arrow keys (hidden rows are stepped over)
  select(i, sound = true) {
    if (i < 0) return;
    if (this.asking && this.rows[i] !== this.leave) this._ask(false); // (moved off the question: it is put away)
    if (i === this.sel) return;
    this.rows[this.sel]?.b.classList.remove('on');
    this._side(false, false);
    this.sel = i;
    this.rows[i].b.classList.add('on');
    if (sound) this.ui.sound('ui_hover');
  }

  // up or down a row; the ends stop it (one ↑ from "Back to the game" is not Leave)
  _step(d) {
    for (let i = this.sel + d; i >= 0 && i < this.rows.length; i += d) {
      const b = this.rows[i].b;
      if (!b.hidden && !b.parentElement.hidden) return this.select(i);
    }
  }

  // Copy link picked (→ on the Invite row, or pointed at), or not
  _side(on, sound = true) {
    on = !!on && this.rows[this.sel] === this.invite;
    if (on === this.side) return;
    this.side = on;
    this.copyBtn.classList.toggle('on', on);
    this.invite.b.classList.toggle('side', on);
    if (on && sound) this.ui.sound('ui_hover');
  }

  async _copy() {
    if (!this.link) return;
    const ok = await copyText(this.link);
    this.copyTxt.textContent = ok ? 'Link copied' : 'Copy it here';
    this.copyBtn.classList.toggle('done', ok);
    clearTimeout(this._copyT);
    this._copyT = setTimeout(() => {
      this.copyTxt.textContent = 'Copy link';
      this.copyBtn.classList.remove('done');
    }, 2200);
    if (!ok) this.ui.invitePanel.show(); // (no clipboard: the panel's field, to select and copy by hand)
  }

  // Leave pressed: the question up in its place, Stay picked; or put away again
  _ask(on) {
    on = !!on;
    if (on === this.asking) return;
    this.asking = on;
    this.root.classList.toggle('asking', on);
    this.leave.b.hidden = on;
    this.askEl.hidden = !on;
    if (on) {
      this._syncLeave();
      this._pick(0, false);
    }
  }

  _pick(i, sound = true) {
    const moved = i !== this.pick;
    this.pick = i;
    this.stayBtn.classList.toggle('on', i === 0);
    this.goBtn.classList.toggle('on', i === 1);
    if (sound && moved) this.ui.sound('ui_hover');
  }

  // a panel opened from here, or the chat, has the keys
  get _covered() {
    return this.ui.isTyping() || !!this.ui.root.querySelector('.layer-modal > :not([hidden])');
  }

  _key(e) {
    if (this.root.hidden || this._covered) return;
    const k = e.key;
    if (this.ui.fieldNotes?.visible) {
      if (k === 'Escape' || k === 'Backspace') {
        this.ui.fieldNotes.hide();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (this.asking) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') this._pick(k === 'ArrowRight' ? 1 : 0);
      else if (k === 'ArrowUp') {
        this._ask(false);
        this._step(-1);
      } else if (k === 'Enter') {
        // (a held Enter repeats: never a way out)
        if (!e.repeat) {
          this.ui.sound('ui_click');
          if (this.pick) this.ui.cb.onLeave();
          else this._ask(false);
        }
      } else if (k !== 'ArrowDown') return;
    } else if (k === 'ArrowDown' || k === 'ArrowUp') this._step(k === 'ArrowDown' ? 1 : -1);
    else if ((k === 'ArrowRight' || k === 'ArrowLeft') && this.rows[this.sel] === this.invite) this._side(k === 'ArrowRight');
    else if (k === 'Enter') {
      if (!e.repeat) {
        this.ui.sound('ui_click');
        if (this.side) this._copy();
        else this.rows[this.sel].run();
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // a hit while the menu is up (ui.damage): the bar across the top, and the health it left
  hit() {
    if (this.root.hidden) return;
    this.hitBar.hidden = false;
    this._syncHit();
    replay(this.hitBar, 'flash');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => (this.hitBar.hidden = true), HIT_SHOW_MS);
  }

  _syncHit() {
    const hp = this.ui.hud.c.hp;
    this.hitHp.textContent = hp >= 0 ? `${hp} health` : '';
  }

  show(on) {
    on = !!on;
    if (on === !this.root.hidden) return;
    this.root.hidden = !on;
    this.ui.root.classList.toggle('paused', on);
    clearInterval(this._iv);
    clearTimeout(this._hitT);
    this.hitBar.hidden = true;
    this._ask(false);
    this.ui.fieldNotes?.hide();
    if (on) {
      this.sel = -1;
      this.rows.forEach((r) => r.b.classList.remove('on'));
      this.select(0, false);
      this._sync();
      // (the clock, survivors joining, leaving and going down while it is up)
      this._iv = setInterval(() => {
        this._syncLive();
        this._syncSub();
        this._syncLeave();
        if (!this.hitBar.hidden) this._syncHit();
      }, 250);
      replay(this.root, 'in');
    } else {
      this._side(false, false);
      if (this.ui.splash.root.hidden) {
        if (this.ui.settingsPanel.visible) this.ui.settingsPanel.hide();
        if (this.ui.invitePanel.visible) this.ui.invitePanel.hide();
        if (this.ui.friends.visible) this.ui.friends.hide();
        if (this.ui.accountPanel.visible) this.ui.accountPanel.hide();
        if (this.ui.progress.visible && !this.ui.inventoryOpen) this.ui.progress.hide();
      }
    }
  }
}

// ---------------------------------------------------------------- invite
