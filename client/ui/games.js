// The lobby's panels, opened from the splash: the list of public games (Browse games) and making a game of your own
// (Create game). Both are panels (panel.js: the settings panel's card) and close the same ways: the cross, Esc, or a
// click outside the card. The lobby itself is client/net/lobby.js.
import { PHASE, MAX_PLAYERS } from '../../shared/constants.js';
import { DIFFICULTIES, NIGHTFALL, difficultyLabel } from '../../shared/difficulty.js';
import { el, svgEl, button } from './dom.js';
import { Panel } from './panel.js';
import { isFirstRun, suggestedDifficulty, rememberDifficulty, NEW_DIFFICULTY } from './firstrun.js';
import { glyph } from './icons.js';
import { listGames, createGame } from '../net/lobby.js';
import { fetchProgress, lastProgress } from '../net/progress.js';
import { playerId } from '../net/identity.js';
import './ux-splash.css'; // (the splash's layout and these panels as sheets beside it)

export function phaseText(phase, day) {
  if (phase === PHASE.DAY) return `Day ${day}`;
  if (phase === PHASE.NIGHT) return `Night ${day}`;
  if (phase === PHASE.GAMEOVER) return 'Restarting';
  if (phase === PHASE.VICTORY) return 'They escaped';
  if (phase === PHASE.CROSSING) return 'Crossing the bridge';
  return 'Starting';
}
export const seatsText = (g) => `${g.players} / ${g.max}`;
// whether this player has beaten map 1, as far as the last answer about their progress says (progress.js): what opens
// games that start on the mainland to them. The server decides it again whatever this says.
const map1Done = () => !!lastProgress()?.map1;
// (asked again each time a panel opens: a run may have been won since)
const askProgress = () => fetchProgress().catch(() => null);
export const difficultyText = (id) => difficultyLabel(id);

// ---------------------------------------------------------------- Browse games
// splash: the splash, whose name field and join the list's Join buttons use
export class GameBrowser extends Panel {
  constructor(ui, parent, splash) {
    super(ui, parent, 'gb-panel', 'Games');
    this.splash = splash;
    this.list = el('div', 'gb-list', this.body);
    const refresh = button('btn btn-ghost', this.foot);
    el('span', '', refresh, 'Refresh');
    refresh.addEventListener('click', () => this.poll());
    el('span', 'gb-gap', this.foot);
    const make = button('btn btn-ghost', this.foot);
    svgEl('i', 'btn-ico', make, glyph('plus'));
    el('span', '', make, 'Create game');
    make.addEventListener('click', () => {
      this.hide();
      this.splash.creator.show();
    });
    this.games = null;
  }

  show() {
    super.show();
    askProgress().then(() => this.visible && this.games && this.render(this.games));
    if (!this.games) this.render(null, 'Looking for games…');
    this.poll();
    clearInterval(this._iv);
    this._iv = setInterval(() => this.poll(), 3000);
  }

  hide() {
    super.hide();
    clearInterval(this._iv);
    this._iv = 0;
  }

  async poll() {
    try {
      const lobby = await listGames();
      if (this.root.hidden) return;
      this.games = lobby.list;
      this.sub.textContent = `${lobby.games} running · ${lobby.players} survivor${lobby.players === 1 ? '' : 's'} on this server`;
      this.render(lobby.list);
    } catch (err) {
      if (!this.root.hidden) this.render(null, err.message);
    }
  }

  render(list, note = '') {
    this.list.textContent = '';
    if (!list) {
      el('div', 'gb-empty', this.list, note);
      return;
    }
    if (!list.length) {
      const e = el('div', 'gb-empty', this.list);
      el('p', '', e, 'No public games right now.');
      el('p', 'gb-empty-sub', e, 'Make one and send the link around, or quick join to start one anybody can drop into.');
      return;
    }
    for (const g of list) {
      const row = el('div', 'gb-row' + (g.full ? ' full' : ''), this.list);
      const who = el('div', 'gb-who', row);
      el('div', 'gb-name', who, g.name);
      el('div', 'gb-meta', who, `${g.map === 2 ? 'Map 2 · ' : ''}${difficultyText(g.difficulty)} · ${phaseText(g.phase, g.day)}${g.phase === PHASE.NIGHT ? ' · the horde is out' : ''}`);
      const seats = el('div', 'gb-seats', row);
      svgEl('i', 'gb-ico', seats, glyph('people'));
      el('span', '', seats, seatsText(g));
      const join = button('btn btn-ghost gb-join', row);
      // (a game on the mainland: only for whoever has beaten map 1)
      const locked = g.map === 2 && !map1Done();
      join.disabled = g.full || locked || this.splash.joining;
      if (locked) join.title = 'Beat map 1 to play map 2';
      el('span', '', join, g.full ? 'Full' : locked ? 'Locked' : 'Join');
      join.addEventListener('click', () => {
        this.hide();
        this.splash.join(g.code);
      });
    }
  }
}

// ---------------------------------------------------------------- Create game
const SEAT_CHOICES = [2, 4, 6, 8, 12, 16, 24, 32];

export class GameCreator extends Panel {
  constructor(ui, parent, splash) {
    super(ui, parent, 'gc-panel', 'New game');
    this.splash = splash;
    this.sub.textContent = 'you get a link to send your friends';
    this.inviteOnly = false;
    this.difficulty = NIGHTFALL.id; // (each show() starts on the suggested one)
    this.first = false; // no run in this browser's record yet
    this.seats = MAX_PLAYERS;
    this.cap = MAX_PLAYERS;
    this.map = 1; // the map every run of it begins on (2: the mainland, once map 1 is beaten)

    const nameRow = el('label', 'set-row', this.body);
    const nl = el('span', 'set-label', nameRow, 'Name');
    el('span', 'set-hint', nl, 'what the game list calls it');
    this.name = el('input', 'gc-name', nameRow);
    this.name.type = 'text';
    this.name.maxLength = 28;
    this.name.autocomplete = 'off';
    this.name.spellcheck = false;

    const diffRow = el('div', 'set-row', this.body);
    const dl = el('span', 'set-label', diffRow, 'Difficulty');
    this.diffHint = el('span', 'set-hint', dl, '');
    const diffSeg = el('div', 'set-seg gc-diff-seg', diffRow);
    this.diffBtns = DIFFICULTIES.map((d) => {
      const b = button('seg-btn', diffSeg, d.rank);
      b.addEventListener('click', () => {
        this.difficulty = d.id;
        this.sync();
      });
      return [d, b];
    });

    const mapRow = el('div', 'set-row', this.body);
    const ml = el('span', 'set-label', mapRow, 'Start on');
    this.mapHint = el('span', 'set-hint', ml, '');
    const mapSeg = el('div', 'set-seg', mapRow);
    this.mapBtns = [
      [1, 'Map 1'],
      [2, 'Map 2'],
    ].map(([map, label]) => {
      const b = button('seg-btn', mapSeg, label);
      b.addEventListener('click', () => {
        if (map === 2 && !map1Done()) return;
        this.map = map;
        this.sync();
      });
      return [map, b];
    });

    const seatRow = el('div', 'set-row', this.body);
    const sl = el('span', 'set-label', seatRow, 'Players');
    el('span', 'set-hint', sl, 'the most that can be in it at once');
    this.seatSeg = el('div', 'set-seg', seatRow);

    const whoRow = el('div', 'set-row', this.body);
    const wl = el('span', 'set-label', whoRow, 'Who can join');
    this.whoHint = el('span', 'set-hint', wl, '');
    const seg = el('div', 'set-seg', whoRow);
    this.whoBtns = [
      [false, 'Anyone'],
      [true, 'Invite only'],
    ].map(([only, label]) => {
      const b = button('seg-btn', seg);
      svgEl('i', 'gc-seg-ico', b, glyph(only ? 'lock' : 'unlock'));
      el('span', '', b, label);
      b.addEventListener('click', () => {
        this.inviteOnly = only;
        this.sync();
      });
      return [only, b];
    });

    this.err = el('div', 'gc-err', this.body, '');
    this.err.hidden = true;

    const cancel = button('btn btn-ghost', this.foot);
    el('span', '', cancel, 'Cancel');
    cancel.addEventListener('click', () => this.hide());
    this.go = button('btn btn-blood', this.foot);
    this.goTxt = el('span', '', this.go, 'Create');
    this.go.addEventListener('click', () => this.create());
    this.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.create();
      }
    });
    this.busy = false;
    this.renderSeats();
    this.sync();
  }

  // cap: the most seats the server lets a game have; seats: what it gives one by default (/api/games)
  setLimits(cap, seats) {
    if (!(cap > 0) || (cap === this.cap && seats === this.defaultSeats)) return;
    this.cap = cap;
    if (this.defaultSeats !== seats) this.seats = Math.min(cap, seats || MAX_PLAYERS);
    this.defaultSeats = seats;
    this.renderSeats();
  }

  renderSeats() {
    this.seatSeg.textContent = '';
    const choices = SEAT_CHOICES.filter((n) => n <= this.cap);
    if (!choices.includes(this.seats)) choices.push(this.seats);
    choices.sort((a, b) => a - b);
    for (const n of choices) {
      const b = button('seg-btn' + (n === this.seats ? ' on' : ''), this.seatSeg, String(n));
      b.addEventListener('click', () => {
        this.seats = n;
        this.renderSeats();
      });
    }
  }

  sync() {
    for (const [d, b] of this.diffBtns) b.classList.toggle('on', d.id === this.difficulty);
    const picked = DIFFICULTIES.find((d) => d.id === this.difficulty) || NIGHTFALL;
    this.diffHint.textContent = `${picked.name}${this.first && picked.id === NEW_DIFFICULTY ? ', suggested for your first game' : ''}. ${picked.blurb}`;
    const open2 = map1Done();
    if (!open2) this.map = 1;
    for (const [map, b] of this.mapBtns) {
      b.classList.toggle('on', map === this.map);
      b.disabled = map === 2 && !open2;
    }
    this.mapHint.textContent = this.map === 2 ? 'the mainland, with gun crates at the bridgehead' : open2 ? 'the island: the whole run' : 'the island. Beat it to open map 2';
    for (const [only, b] of this.whoBtns) b.classList.toggle('on', only === this.inviteOnly);
    this.whoHint.textContent = this.inviteOnly ? 'only people you send the link to' : 'listed under Browse games for anybody';
    this.go.disabled = this.busy;
    this.goTxt.textContent = this.busy ? 'Making it…' : 'Create & join';
  }

  show() {
    super.show();
    // Ember for a brand-new player, else the last one picked here (firstrun.js)
    this.first = isFirstRun();
    this.difficulty = suggestedDifficulty();
    this.map = 1;
    this.sync();
    askProgress().then(() => this.visible && this.sync());
    this.err.hidden = true;
    this.name.placeholder = `${this.splash.playerName()}'s game`;
    setTimeout(() => this.visible && this.name.focus({ preventScroll: true }), 30);
  }

  async create() {
    if (this.busy || this.splash.joining) return;
    this.busy = true;
    this.err.hidden = true;
    this.sync();
    try {
      const host = this.splash.playerName();
      const g = await createGame({ name: this.name.value.trim() || `${host}'s game`, host, inviteOnly: this.inviteOnly, maxPlayers: this.seats, difficulty: this.difficulty, map: this.map, guestId: playerId() });
      rememberDifficulty(this.difficulty);
      this.hide();
      this.splash.join(g.code);
    } catch (err) {
      this.err.textContent = err.message || 'Could not make the game';
      this.err.hidden = false;
    } finally {
      this.busy = false;
      this.sync();
    }
  }
}
