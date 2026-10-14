// The title screen and the way into a game: a name, then Quick join (the busiest public game with a seat, or a new
// one), Browse games or Create game (games.js). A page opened from a game's invite link (?game=CODE, lobby.js) is
// that game's invitation instead, and Join goes straight into it - unless it is full or over.
import { PHASE, MAX_PLAYERS } from '../../shared/constants.js';
import { el, svgEl, lsGet, lsSet, button, replay } from './dom.js';
import { glyph } from './icons.js';
import { loadRecord } from './records.js';
import { GameBrowser, GameCreator, phaseText, seatsText, difficultyText } from './games.js';
import { linkedCode, gameInfo, listGames, getLeaderboard } from '../net/lobby.js';
import { accountState, onAccountChange, refreshAccount } from '../net/account.js';
import { playingFriends, unreadCount, onSocialChange } from '../net/friends.js';
import { achievementsView, onAchievements, ACH_TOTAL } from '../net/achievements.js';
import { fetchProgress, lastProgress, onProgress } from '../net/progress.js';
import { CharacterCard, releaseStage, storedChoice, RANDOM } from './picker.js';

// the count on a button (unread messages): '' hides it
function setBadge(b, n) {
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n ? String(n) : '';
}

// what the game asks of the player: on every splash, whichever tagline is drawn under it
const GOAL = 'Scavenge by day. Board up by night. Fix the car. Get out.';
const TAGLINES = [
  'Your car died on Route 9. The dark is coming.',
  'Nobody is coming to save you.',
  'Wherever you are at sundown is where you make your stand.',
  'Every night there are more of them.',
];

export class Splash {
  constructor(ui, parent) {
    this.ui = ui;
    const root = (this.root = el('div', 'splash', parent));
    root.hidden = true;
    // the walk around the valley behind it (game/menutour.js) fades to black through this at every cut
    this.cut = el('div', 'sp-cut', root);
    this.cutK = 0;
    el('div', 'sp-shade', root); // (the menu's side of the screen, darkened)
    el('div', 'ov-vignette', root);
    el('div', 'sp-fog', root);
    el('div', 'grain', root);
    el('div', 'scratches', root);

    // Issue #337, "One door": everything that can be clicked sits in one page laid out in the flow (ux-splash.css).
    // A bar across the top (what the game is; Friends and Settings), the menu down the left (the scene is drawn
    // off-centre into the open part beside it: sceneX) - one big Quick join, Browse and Create under it, then who you
    // are - and a quiet "More" row for the rest. Nothing is pinned to a corner, so nothing can land on anything else
    // at any zoom; when it all cannot fit, the page scrolls down.
    const page = (this.page = el('div', 'sp-page', root));
    const top = el('div', 'sp-top', page);
    this.credit = el('div', 'sp-kicker', top, `Co-op survival horror · 1–${MAX_PLAYERS} players`);
    const tools = el('div', 'sp-tools', top);
    const tile = (parent, icon, text, fn, cls = '') => {
      const b = button('btn btn-ghost sp-tile' + (cls ? ' ' + cls : ''), parent);
      svgEl('i', 'btn-ico', b, glyph(icon));
      const t = el('span', 'sp-tile-t', b, text);
      b.addEventListener('click', fn);
      b.txt = t;
      return b;
    };
    // Friends (signed in only): how many of them are playing, and the messages nobody has read
    this.friendsBtn = tile(tools, 'people', '', () => this.ui.friends.show(), 'sp-icon sp-friends');
    this.friendsTxt = this.friendsBtn.txt;
    this.friendsBadge = el('b', 'sp-badge', this.friendsBtn, '');
    this.friendsBadge.hidden = true;
    onSocialChange(() => this._syncFriends());
    // Settings (Keys & controls is a tab in it)
    const gear = tile(tools, 'gear', '', () => this.ui.settingsPanel.show(), 'sp-icon sp-settings');
    gear.title = 'Settings, and Keys & controls';
    gear.setAttribute('aria-label', 'Settings');
    const main = (this.main = el('div', 'sp-main', page));
    this.sceneX = 0.5;
    window.addEventListener('resize', () => this._measure());
    const logo = el('h1', 'logo', main);
    logo.setAttribute('aria-label', 'Survive the Night');
    const l1 = el('div', 'logo-1', logo);
    [...'SURVIVE'].forEach((ch, i) => {
      const s = el('span', 'lg-ch' + (i === 3 ? ' flick-a' : i === 5 ? ' flick-b' : ''), l1, ch);
      s.setAttribute('aria-hidden', 'true');
    });
    const l2 = el('div', 'logo-2', logo);
    el('i', 'logo-rule', l2);
    const l2t = el('span', 'logo-2t', l2, 'THE NIGHT');
    el('i', 'logo-rule', l2);
    // blood drips hanging off "THE NIGHT"
    const drips = [
      [9, 0.9, 1.6, 0],
      [23, 0.6, 3.1, 1.4],
      [41, 1.2, 2.2, 0.4],
      [58, 0.7, 4.2, 2.4],
      [67, 1.0, 1.4, 0.9],
      [86, 0.8, 2.8, 1.8],
    ];
    for (const [x, w, len, delay] of drips) {
      const d = el('i', 'drip', l2t);
      d.style.cssText = `left:${x}%;--w:${w};--len:${len};--d:${delay}s`;
    }

    el('p', 'sp-goal', main, GOAL);
    el('p', 'sp-tag', main, TAGLINES[(Math.random() * TAGLINES.length) | 0]);

    // the invitation, on a page opened from a game's link
    const inv = (this.invite = el('div', 'sp-invite', main));
    inv.hidden = true;
    this.invKicker = el('div', 'sp-inv-k', inv, 'You are invited to');
    this.invName = el('div', 'sp-inv-name', inv, '');
    this.invMeta = el('div', 'sp-inv-meta', inv, '');

    // the way in: the big button, and under it who that will be as
    const form = (this.form = el('form', 'sp-join', main));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._join();
    });
    this.joinBtn = el('button', 'btn btn-blood sp-joinbtn', form);
    this.joinBtn.type = 'submit';
    const jt = el('span', 'sp-jb-text', this.joinBtn);
    this.joinTxt = el('span', 'sp-jb-t', jt, 'Quick join');
    this.joinSub = el('span', 'sp-jb-sub', jt, '');
    svgEl('i', 'btn-ico sp-go', this.joinBtn, glyph('arrowRight'));
    // "as <name> playing <survivor>": the name is typed right there (signed in, it is the account's, and opens it);
    // the survivor opens the picker
    const as = el('p', 'sp-as', form);
    el('span', '', as, 'as ');
    this.name = el('input', 'sp-as-v sp-as-name', as);
    this.name.type = 'text';
    this.name.maxLength = 16;
    this.name.autocomplete = 'off';
    this.name.spellcheck = false;
    this.name.setAttribute('aria-label', 'Your name');
    let saved = lsGet('stn.name', '');
    if (!saved) saved = 'Survivor' + String(100 + ((Math.random() * 900) | 0));
    this.name.value = saved.slice(0, 16);
    // kept as it is typed, not only on Join: a name outlives a tab closed, or a full server, before the first run
    this.name.addEventListener('input', () => {
      lsSet('stn.name', this._typedName());
      this._syncAs();
    });
    this.name.addEventListener('click', () => {
      if (this.name.readOnly) this.ui.accountPanel.show();
    });
    this.name.addEventListener('blur', () => this._syncAs());
    el('span', '', as, ' playing ');
    this.asWho = button('sp-link sp-as-v', as, '');
    this.asWho.title = 'Choose who to play as';
    this.asWho.addEventListener('click', () => this.character.panel.show());
    // the survivor picker (picker.js): its card stays out of sight, the line above opens the panel; its note (a
    // saved survivor with parts no longer in the game) is said under the line
    const holder = el('div', 'sp-cp-holder', root);
    holder.hidden = true;
    this.character = new CharacterCard(ui, holder, root);
    this.character.onChange = () => this._syncAs();
    form.appendChild(this.character.note);

    // the other ways in
    const alt = el('div', 'sp-alt', main);
    this.quickAlt = tile(alt, 'bolt', 'Quick join', () => this.join(''));
    this.browseBtn = tile(alt, 'search', 'Browse games', () => this.browser.show());
    this.browseN = el('b', 'sp-count', this.browseBtn, '');
    tile(alt, 'plus', 'Create game', () => this.creator.show());

    // Who you are, in one card (account.js, progress.js): a guest is asked to sign in, once; signed in, the name
    // (the way to the account), the level and the XP to the next, and the runs on the record
    const who = (this.who = el('div', 'sp-who', main));
    this.avatar = el('span', 'sp-av', who, '?');
    this.avatar.setAttribute('aria-hidden', 'true');
    const wt = el('div', 'sp-who-txt', who);
    this.whoName = button('sp-who-nm', wt, '');
    this.whoName.addEventListener('click', () => this.ui.accountPanel.show());
    this.whoSub = el('div', 'sp-who-sub', wt, '');
    this.xp = el('div', 'sp-xp', wt);
    this.xpFill = el('i', '', this.xp);
    this.xp.hidden = true;
    this.signBtn = button('btn btn-ghost sp-sign', who, 'Sign in');
    this.signBtn.title = 'Sign in or make an account: stats kept on the server, friends';
    this.signBtn.addEventListener('click', () => this.ui.accountPanel.show());
    // ...and their things under it: the level and the perks to pick (lit while one is waiting), the loadout, the
    // achievements. A guest who has played sees them too, as quiet links: what this browser has kept for them.
    const mine = (this.mine = el('div', 'sp-mine', main));
    this.mineL = el('span', 'sp-mine-l', mine, 'Saved in this browser');
    this.perksBtn = tile(mine, 'arrowUp', 'Perks', () => this.ui.progress.show(), 'sp-perks');
    this.perksTxt = this.perksBtn.txt;
    this.perksBadge = el('b', 'sp-badge', this.perksBtn, '');
    this.perksBadge.hidden = true;
    onProgress((v) => this._syncPerks(v));
    tile(mine, 'star', 'Loadout', () => this.ui.loadout.show());
    this.achBtn = tile(mine, 'trophy', 'Achievements', () => this.ui.achPanel.show());
    this.achN = el('b', 'sp-count', this.achBtn, '');
    onAchievements(() => this._syncAch());

    this.err = el('div', 'sp-err', main, '');
    this.err.hidden = true;
    const st = (this.status = el('div', 'sp-status', main));
    this.dot = el('i', 'dot', st);
    this.statusTxt = el('span', '', st, 'Contacting server…');

    // More: the rest, as words (Dead Hand and the auction are side games: docs/design.md)
    const more = el('nav', 'sp-more', page);
    more.setAttribute('aria-label', 'More');
    el('span', 'sp-more-l', more, 'More');
    const link = (text, fn) => {
      const b = button('sp-link sp-more-a', more, text);
      b.addEventListener('click', fn);
      return b;
    };
    link('Dead Hand', () => this.ui.cb.onLobbyCards());
    this.auctionBtn = link('Auction', () => this.ui.auction.show());
    link('Leaderboard', () => this._showLeaderboard());
    // (/stats, client/stats/), in a tab of its own
    const gs = link('Server stats ↗', () => window.open('/stats', '_blank', 'noopener'));
    gs.title = 'Every game on this server, in a new tab';

    onAccountChange(() => {
      this._syncAccount();
      this._syncFriends();
      this._syncAch();
    });

    this.browser = new GameBrowser(ui, root, this);
    this.creator = new GameCreator(ui, root, this);
    this.code = ''; // the game this page was opened for (its invite link)
    this.game = null; // ...as the server last described it
    this.gone = false; // ...and it is not there (any more)
    this.offline = false;
    this.joining = false;
    this.next = ''; // a game to go on into once this is up (a friend's, picked in another game: FriendsPanel.join)
    this.boardRequest = 0;
    this.boardClose = null;
  }

  async _showLeaderboard() {
    if (this.ui.boardOpen) return;
    const request = ++this.boardRequest;
    this.boardClose = this.ui.board.onClose;
    this.ui.board.onClose = () => this._hideLeaderboard();
    this.ui.board.setLobbyMode(true);
    this.ui.setBoard(null);
    this.ui.setBoardOpen(true);
    try {
      const data = await getLeaderboard();
      if (request === this.boardRequest && this.ui.boardOpen && !this.root.hidden) this.ui.setBoard(data);
    } catch (err) {
      if (request === this.boardRequest && this.ui.boardOpen && !this.root.hidden) this.ui.board.setError(err.message || 'Could not load the leaderboard.');
    }
  }

  _hideLeaderboard() {
    this.boardRequest++;
    this.ui.setBoardOpen(false);
    this.ui.setBoard(null);
    this.ui.board.setLobbyMode(false);
    this.ui.board.onClose = this.boardClose;
    this.boardClose = null;
  }

  _typedName() {
    return this.name.value.replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  // Signed in, the name is the account's (the server plays them under it whatever is typed): the field shows it and
  // takes no typing. Signed out again, the name typed before comes back (it stayed in storage all along).
  _syncAccount() {
    const user = accountState().user;
    if (user) {
      if (!this.name.readOnly) this.guestName = this._typedName(); // (a made-up one is not in storage until a join)
      this.name.value = user.username;
      this.name.readOnly = true;
      this.name.classList.add('locked');
      this.name.title = "Your account's name. Sign out (Your account) to play under another.";
    } else if (this.name.readOnly) {
      this.name.readOnly = false;
      this.name.classList.remove('locked');
      this.name.title = '';
      this.name.value = (lsGet('stn.name', '') || this.guestName || '').slice(0, 16);
    }
    this._syncWho();
    this._syncAs();
  }

  // the card: a guest's one Sign in, or the account's name, level, XP and record; and the things under it
  _syncWho() {
    const user = accountState().user;
    const v = lastProgress();
    const { total: t } = loadRecord();
    this.who.classList.toggle('on', !!user);
    this.signBtn.hidden = !!user;
    this.whoName.disabled = !user;
    this.whoName.title = user ? 'Your account: stats, last games, signing out' : '';
    const runs = t.runs ? `${t.runs} run${t.runs === 1 ? '' : 's'} · ${t.escapes} escaped` : '';
    if (user) {
      this.avatar.textContent = (user.username || '?').slice(0, 1).toUpperCase();
      this.whoName.textContent = user.username;
      this.whoSub.textContent = [v ? `Level ${v.level}` : '', runs].filter(Boolean).join(' · ') || 'Your account';
      this.xp.hidden = !v;
      if (v) this.xpFill.style.width = `${Math.round(Math.max(0, Math.min(1, v.frac || 0)) * 100)}%`;
    } else {
      this.avatar.textContent = '?';
      this.whoName.textContent = 'Playing as a guest';
      this.whoSub.textContent = 'Sign in to keep your level, perks, loadout, achievements and friends.';
      this.xp.hidden = true;
    }
    // (a new guest sees only the Sign in; one who has played can still get to what this browser kept)
    const played = !!t.runs || (v?.xp | 0) > 0 || !!v?.pending;
    this.mine.hidden = !user && !played;
    this.mine.classList.toggle('quiet', !user);
    this.auctionBtn.hidden = !user;
  }

  // the line under the big button: "as <name> playing <survivor>"
  _syncAs() {
    if (!this.name.value && document.activeElement !== this.name) this.name.placeholder = 'a made-up name';
    // (the field as wide as the name in it: measured, for a narrow face; the made-up name's words when it is empty)
    this.name.style.width = '0';
    const w = this.name.value ? this.name.scrollWidth : 0;
    this.name.style.width = w ? `${w + 2}px` : `${Math.max(4, (this.name.placeholder || '').length)}ch`;
    this.name.title = this.name.readOnly ? 'Your account' : 'Change your name';
    const c = storedChoice();
    this.asWho.textContent = c === RANDOM ? 'a random survivor' : this.character?.name.textContent || 'a survivor';
  }

  // Achievements: how many of them are unlocked (this browser's, or the account's while signed in)
  _syncAch() {
    const a = achievementsView();
    this.achN.textContent = a.loading || a.error ? '' : `${Object.keys(a.unlocked).length}/${ACH_TOTAL}`;
  }

  // the name to play under (one is made up if the field is empty)
  playerName() {
    let name = this._typedName();
    if (!name) {
      name = 'Survivor' + String(100 + ((Math.random() * 900) | 0));
      this.name.value = name;
      this._syncAs();
    }
    return name;
  }

  // the invited game, while there is one to go into
  get invited() {
    return !!this.code && !this.gone;
  }

  _join() {
    this.join(this.invited ? this.code : '');
  }

  // code: the game to go into; '' for a quick join
  join(code) {
    if (this.joining) return;
    if (code && code === this.code && this.game?.full) return;
    const name = this.playerName();
    if (!accountState().user) lsSet('stn.name', name); // (the guest name: an account's own is not one to keep)
    this.joining = true;
    this.err.hidden = true;
    this.root.classList.add('joining');
    this._syncBtn();
    this.ui.cb.onJoin(name, code);
  }

  _syncBtn() {
    const full = this.invited && !!this.game?.full;
    this.joinBtn.disabled = this.joining || full;
    this.joinTxt.textContent = this.joining ? 'Joining…' : !this.invited ? 'Quick join' : full ? 'Game full' : 'Join game';
    // (what the big button does: Lobby.quick takes the busiest public game with a seat, or makes one)
    this.joinSub.textContent = this.invited ? (full ? 'Every seat is taken' : this.game ? `Into ${this.game.name}` : 'Into the game you were sent') : 'Busiest game with a free seat, or a new one';
    this.quickAlt.hidden = !this.invited; // (without an invitation, the big button is the quick join)
  }

  // the Friends button (signed in only) says how many of them are in a game, and counts the messages nobody has read
  _syncFriends() {
    const on = !!accountState().user;
    const n = on ? playingFriends().length : 0;
    const unread = on ? unreadCount() : 0;
    this.friendsBtn.hidden = !on;
    this.friendsTxt.textContent = n ? String(n) : '';
    this.friendsBtn.classList.toggle('lit', n > 0);
    setBadge(this.friendsBadge, unread);
    const parts = [n ? `${n} playing` : '', unread ? `${unread} new message${unread === 1 ? '' : 's'}` : ''].filter(Boolean);
    this.friendsBtn.title = parts.length ? `Friends · ${parts.join(' · ')}` : 'Friends';
    this.friendsBtn.setAttribute('aria-label', this.friendsBtn.title);
  }

  _syncPerks(v) {
    this.perksTxt.textContent = 'Perks';
    this.perksBtn.classList.toggle('lit', !!v?.pending);
    setBadge(this.perksBadge, v?.pending || 0);
    this.perksBtn.title = v?.pending ? 'A perk point is waiting to be spent' : v ? `Level ${v.level} · the perk tree` : 'Your level and the perk tree';
    this._syncWho();
  }

  _syncInvite() {
    this.invite.hidden = !this.code;
    if (!this.code) return;
    const g = this.game;
    this.invite.className = 'sp-invite' + (this.gone ? ' gone' : g?.full ? ' full' : '');
    if (this.gone) {
      this.invKicker.textContent = 'Your invitation';
      this.invName.textContent = 'That game has ended';
      this.invMeta.textContent = 'Quick join, or find another under Browse games.';
    } else if (!g) {
      this.invKicker.textContent = 'You are invited to';
      this.invName.textContent = this.offline ? 'A game on this server' : 'Finding the game…';
      this.invMeta.textContent = `Code ${this.code}`;
    } else {
      this.invKicker.textContent = 'You are invited to';
      this.invName.textContent = g.name;
      const parts = [`${seatsText(g)} survivors`, difficultyText(g.difficulty), phaseText(g.phase, g.day)];
      if (g.inviteOnly) parts.push('Invite only');
      this.invMeta.textContent = g.full ? `Full · ${seatsText(g)} · a seat may free up, or pick another game` : parts.join(' · ');
    }
  }

  setError(text) {
    this.joining = false;
    this.root.classList.remove('joining');
    this.err.textContent = text || 'Connection failed';
    this.err.hidden = !text;
    this._syncBtn();
    replay(this.err, 'shake');
    if (text) this._poll(); // (a full or ended game: show it as it is now)
  }

  async _poll() {
    try {
      if (this.code && !this.gone) {
        // (a game that has ended does not come back: no asking again, which an address can only do so often)
        try {
          this.game = await gameInfo(this.code);
          this.gone = false;
        } catch (err) {
          if (err.status !== 404) throw err;
          this.game = null;
          this.gone = true;
        }
      }
      const lobby = await listGames();
      // (the server was not there when the page asked who it is signed in as: asked again now it is)
      const acct = accountState();
      if (!acct.ready || acct.offline) refreshAccount();
      if (this.root.hidden) return;
      this.offline = false;
      this.creator.setLimits(lobby.maxPlayers, lobby.defaultPlayers);
      this.credit.textContent = `Co-op survival horror · 1–${lobby.maxPlayers} players`;
      const n = lobby.games;
      this.statusTxt.textContent = n ? `${n} game${n === 1 ? '' : 's'} running · ${lobby.players} survivor${lobby.players === 1 ? '' : 's'} online` : 'No games running · start one';
      this.status.className = 'sp-status online' + (this.invited && this.game?.phase === PHASE.NIGHT ? ' night' : '');
      // (the public games, the ones Browse lists)
      const open = Array.isArray(lobby.list) ? lobby.list.length : 0;
      this.browseN.textContent = open ? String(open) : '';
      this.browseBtn.title = open ? `${open} public game${open === 1 ? '' : 's'} to pick from` : 'No public games right now';
    } catch {
      if (this.root.hidden) return;
      this.browseN.textContent = '';
      this.offline = true;
      this.statusTxt.textContent = 'Server offline';
      this.status.className = 'sp-status offline';
    }
    this._syncInvite();
    this._syncBtn();
  }

  // the runs on the record (records.js) are in the card
  syncRecord() {
    this._syncWho();
  }

  // How far across the screen the middle of the open part beside the menu is (where Renderer.setCenter puts the
  // scene's): half way when the menu takes the whole width (a narrow screen: the scene is behind it)
  _measure() {
    if (this.root.hidden) return;
    const w = window.innerWidth;
    const right = this.main.getBoundingClientRect().right;
    this.sceneX = right > 0 && right < w * 0.65 ? (right + w) / 2 / w : 0.5;
    // (where the menu ends: the lobby's panels open as a sheet beside it, ux-splash.css, the account's included)
    this.ui.root.style.setProperty('--sp-edge', `${Math.round(Math.max(0, right))}px`);
  }

  // the cut between two shots of the walk behind: 0 shows the scene, 1 is black
  setCut(k) {
    k = Math.round(k * 100) / 100;
    if (k === this.cutK) return;
    this.cutK = k;
    this.cut.style.opacity = String(k);
  }

  show() {
    this.root.hidden = false;
    this.joining = false;
    this.root.classList.remove('joining');
    const code = linkedCode();
    if (code !== this.code) {
      this.code = code;
      this.game = null;
      this.gone = false;
    }
    this._syncInvite();
    this._syncBtn();
    this._syncAccount();
    this._syncFriends();
    this._syncPerks(lastProgress());
    this._syncAch();
    fetchProgress().catch(() => {}); // (what the run just played earned: the button says if a pick is waiting)
    this.syncRecord();
    this.character.show();
    this._measure();
    replay(this.root, 'in');
    clearInterval(this._iv);
    this._poll();
    this._iv = setInterval(() => this._poll(), 3000);
    if (this.next) {
      const code = this.next;
      this.next = '';
      setTimeout(() => !this.root.hidden && this.join(code), 0);
    }
  }

  hide() {
    if (this.ui.boardOpen && this.ui.board.lobbyMode) this._hideLeaderboard();
    this.root.hidden = true;
    clearInterval(this._iv);
    this._iv = 0;
    this.joining = false;
    this.browser.hide();
    this.creator.hide();
    this.character.panel.hide();
    this.character.panel.creator.close(); // (an edit not saved is kept for the next time it opens)
    releaseStage(); // (the picker's renderer: not needed in play)
  }
}
