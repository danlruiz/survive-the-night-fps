// Field map overlay [M]: the baked survey map of the valley with live markers - you, your team, the
// car, pings, where the car supplies and the schematics are rumoured to be, and the places you have discovered.
// A click sets your own waypoint (the game keeps it, shows it on the compass and in the world, and shares it:
// the team's waypoints are flags here too, with who set them). A pinch or the wheel zooms, a drag pans, and [R] turns
// the map with you, the way you face up (a compass in its corner keeps north): the view, mapview.js.
//
// Issue #225 ("answers first"): the panel beside the map (mappanel.js) answers in order - what the car still needs, where and how far
// (what is in your pack first), the team (a downed mate first), the schematics in one row, a short key - and a click on
// any row centres the map on it. Every marker is one colour and one shape, the same as the key (mapmarks.js). A rumour
// rings the place it names. What is off the view waits on its edge with its distance; the edges carry the survey's grid
// letters, for callouts ("Hank is down in D6"). The island is drawn as one, with the sea and the Route 9 bridge (#173).
// In a small window the panel folds into a column of chips and the key into a popover, so the map is never cut off.
//
// It is one of the kit screens (screentabs.js): the Map tab, in the same frame as the inventory, the perks and the
// achievements, under the same row of tabs (the HUD's clock in it, and the close). The map is square, as big as the
// frame lets it be, and the panel takes the rest of the width (in two columns, when there is room for them).
import './ux-map.css';
import { ZONE, ZONE_NAMES, ITEM, ITEM_DEFS, schematicRumours } from '../../shared/defs.js';
import { SUPPLIES, SUPPLY_NEED, W } from '../game/act.js'; // (this act's)
import { el, svgEl, lsGet, lsSet, button } from './dom.js';
import { itemIcon, glyph } from './icons.js';
import { renderMapCanvas, renderSeaCanvas, MAP_PX } from './mapcanvas.js';
import { bindLabel, liveText } from '../game/binds.js';
import { ScreenTabs, screenCame } from './screentabs.js';
import { badge, setBadge, initial, fmtDist, dirOf, gridRef, placeAt, PING_WORD } from './mapmarks.js';
import { addMethods } from './mixin.js';
import { mapPanelMethods } from './mappanel.js';
import { mapViewMethods, MAX_ZOOM } from './mapview.js';

const VEH_LABEL = { 1: 'moped', 2: 'car', 3: 'bicycle' }; // (shared/vehicles.js VEH)
const TEAM_BESIDE = 14; // m: a teammate's waypoint on your own waypoint's spot is drawn this far east of it
const START_ZOOM = 2.5; // the first opening starts this close in on you (about 256 m across), the wheel zooms out to all of it
const SEA_PAD = 56; // m of sea drawn round the island on every side
const PIN_MAX = 8; // edge pins at most (the most urgent first)
const HEADING_KEY = 'stn.mapHeadingUp';
const ZOOM_KEY = 'stn.mapZoom';

export class MapScreen {
  constructor(ui, parent) {
    this.ui = ui;
    this.open = false;
    this.root = el('div', 'mapscr', parent);
    this.root.hidden = true;
    const bg = el('div', 'map-bg', this.root);
    // the kit screens' frame: the row of tabs (the close at its end), the map's sheet under it
    const box = el('div', 'scr-frame', this.root);
    const frame = (this.frame = el('div', 'map-frame paper mx', box));
    this.tabs = new ScreenTabs(ui, box, 'map', () => this.onClose?.(), frame);
    const head = el('div', 'map-head mx-head', frame);
    // (which map: the tab says it is the map)
    this.titleName = el('span', 'map-title', head, 'Harlan Valley');
    el('span', 'mx-grow', head);
    // where you are; a click brings the map back to you
    this.youBtn = button('mx-you', head);
    this.youBtn.title = 'Back to me (Space)';
    this.coords = el('span', 'map-coords', this.youBtn);
    this.youGrid = el('span', '', this.coords);
    this.youXY = el('span', 'mx-xy', this.coords); // (a small window drops it)
    this.youBtn.addEventListener('click', () => this.backToMe());
    // north up, or turned with you so the way you face is up: kept between openings, and games
    this.headingUp = lsGet(HEADING_KEY, '0') === '1';
    this.rotBtn = button('map-rot', head);
    this.rotBtn.title = 'Turn the map with you (R)';
    svgEl('i', 'map-rot-ico', this.rotBtn, glyph('compass'));
    this.rotTxt = el('span', '', this.rotBtn);
    this.rotBtn.addEventListener('click', () => this.setHeadingUp(!this.headingUp));
    const body = el('div', 'map-body mx-body', frame);
    this.view = el('div', 'map-view', body);
    // the map itself, zoomed and panned inside the view: the names and markers are placed in % of it, so a zoom
    // spreads them apart without making them any bigger. On the island it is a chart: the map with the sea round it
    this.pane = el('div', 'map-pane', this.view);
    this.seaWrap = el('div', 'mx-sea', this.pane);
    this.canvasWrap = el('div', 'map-canvas', this.pane);
    this.rings = el('div', 'mx-rings', this.pane);
    this.labels = el('div', 'map-labels', this.pane);
    this.markers = el('div', 'mx-marks', this.pane);
    this.flash = el('i', 'mx-flash', this.markers);
    this.flash.hidden = true;
    // the grid's letters and numbers along the view's edges (north up), and what is off the view, waiting on its edge
    this.ruleTop = el('div', 'mx-rule top', this.view);
    this.ruleLeft = el('div', 'mx-rule left', this.view);
    this.pins = el('div', 'mx-pins', this.view);
    // where north is, turned with the map; a click on it turns the map too
    this.north = button('map-north', this.view);
    this.north.title = 'North up / facing up (R)';
    const dial = svgEl('i', 'map-north-dial', this.north, glyph('compass'));
    el('b', '', dial, 'N');
    this.north.addEventListener('click', () => this.setHeadingUp(!this.headingUp));
    // a place's card, while the pointer is over its name
    this.card = el('div', 'mx-card', this.view);
    this.card.hidden = true;

    // ---- the panel: the car, the team, the schematics, the key (the car and the team in one column, the rest in a
    // second, when the panel is wide enough to have two: ux-map.css)
    const side = (this.side = el('div', 'mx-side', body));
    const cols = el('div', 'mx-cols', side);
    let col = null;
    const sec = (title) => {
      const h = el('div', 'mx-h', col);
      const t = el('span', 'mx-h-t', h, title);
      const n = el('span', 'mx-h-n', h, '');
      return { t, n };
    };
    col = el('div', 'mx-col', cols);
    this.carH = sec('The car');
    this.carBar = el('div', 'mx-bar', col);
    this.carRows = el('div', 'mx-rows', col);
    this.carDone = el('div', 'mx-done', col);
    this.teamH = sec('Team');
    this.teamRows = el('div', 'mx-rows', col);
    col = el('div', 'mx-col', cols);
    this.schemH = sec('Schematics');
    this.schemRow = el('div', 'mx-schems', col);
    this.keyH = sec('Key');
    this.keyGrid = el('div', 'mx-key', col);
    this._buildKey(this.keyGrid);

    // ---- small windows: the panel as chips, the key behind a button
    const chips = (this.chipsBox = el('div', 'mx-chips', body));
    this.chipList = el('div', 'mx-chiplist', chips);
    this.keysBtn = button('mx-chip mx-keysbtn', chips);
    el('span', '', this.keysBtn, 'Key');
    el('span', 'kbd sm', this.keysBtn, '?');
    this.pop = el('div', 'mx-pop', chips);
    this.pop.hidden = true;
    this.popKey = el('div', 'mx-key', this.pop);
    this._buildKey(this.popKey);
    this.popKeys = el('div', 'map-keys mx-keys', this.pop);
    this.keysBtn.addEventListener('click', () => (this.pop.hidden = !this.pop.hidden));

    // ---- the keys, under the map
    const foot = el('div', 'mx-foot', frame);
    this.footKeys = el('div', 'map-keys mx-keys', foot);
    el('span', 'mx-foot-hint', foot, 'Click a row to find it on the map');
    for (const box of [this.footKeys, this.popKeys]) {
      for (const [k, t] of [
        ['LMB', 'waypoint'],
        ['X', 'clear'],
        ['Wheel', 'zoom'],
        ['Drag', 'pan'],
        ['R', 'north up'],
        ['Space', 'back to me'],
        [() => bindLabel('map'), 'close'], // (keybinds, game/binds.js; X, R and Space are the map's own)
        [() => bindLabel('ping'), 'ping (in game)'],
      ]) {
        const s = el('span', 'gh', box);
        if (typeof k === 'function') liveText(el('span', 'kbd sm', s), k);
        else el('span', 'kbd sm', s, k);
        el('span', '', s, t);
      }
    }

    this.world = null;
    this.labelEls = [];
    this.markLabs = [];
    this.pool = [];
    this.ringPool = [];
    this.pinPool = [];
    this.rowPools = new Map(); // container -> [row]
    this.last = null; // the data of the last update (the place cards read it)
    this.pad = 0; // m of sea round the map (the island), so the pane is span m across
    this.span = 1;
    this.vw = 0; // the view's width in px (kept by an observer: reading it every frame would force a layout)
    new ResizeObserver(() => {
      this.vw = this.view.clientWidth;
      this._ruleKey = '';
    }).observe(this.view);
    // waypoint: the game sets onWaypoint and gets { x, z, zone } (zone: id of the place it snapped to, or -1),
    // or null to clear it
    this.onWaypoint = null;
    // the row's close, or a left press outside the map's sheet and the row, closes it: the game sets onClose
    this.onClose = null;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target === bg || e.target === this.root || e.target === box)) this.onClose?.();
      // (a press anywhere but the key's button puts the key popover away)
      if (!this.pop.hidden && !e.target.closest('.mx-pop, .mx-keysbtn')) this.pop.hidden = true;
    });
    // zoom: how many times the view's width the map is, kept between openings, and games. It zooms about the focus, a
    // spot of the map (a fraction across / down) held in the middle of the view as far as the map's edges allow: you,
    // as you move, until a drag moves it somewhere else (an opening puts it back on you). cx / cy is the middle shown
    const z = parseFloat(lsGet(ZOOM_KEY, ''));
    this.zoom = z >= 1 && z <= MAX_ZOOM ? z : START_ZOOM;
    this.fx = this.fy = 0.5;
    this.follow = true;
    this.cx = this.cy = 0.5;
    // how far the map is turned clockwise on screen (rad): your yaw when it faces up, else 0
    this.yaw = 0;
    this.rot = 0;
    this._bindPanZoom();
    // (the game's own key handling is off while the map is open, like the inventory's Q / E)
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.repeat || this.ui.isTyping()) return;
      if (e.code === 'KeyX') this.onWaypoint?.(null);
      else if (e.code === 'KeyR') this.setHeadingUp(!this.headingUp);
      else if (e.code === 'Space') {
        e.preventDefault(); // (not a click on the focused button)
        this.backToMe();
      }
    });
    this._showHeading();
  }

  // the key: every kind of marker as the map draws it (the vehicle's line only on the mainland: setWorld)
  _buildKey(box) {
    const rows = [
      ['you', glyph('arrowUp'), 'You'],
      ['mate', 'M', 'Teammate'],
      ['down', glyph('downed'), 'Teammate down'],
      ['car', glyph('car'), 'Your car', 'car'],
      ['part', itemIcon(ITEM.FUEL_CAN), 'Supply on the ground'],
      ['crate', glyph('hazard'), 'Supply drop'],
      ['sup', '', 'Supply rumoured'],
      ['schem', '', 'Schematic rumoured'],
      ['way', glyph('flag'), 'Your waypoint'],
      ['teamway', glyph('flag'), "A teammate's waypoint"],
      ['ping', glyph('ping'), 'Ping: go · danger · loot', 'ping'],
      ['bench', glyph('wrench'), 'Workbench'],
      ['veh', glyph('car'), 'A vehicle of the team’s', 'veh'],
    ];
    for (const [kind, ico, t, tag] of rows) {
      const r = el('div', 'mx-k', box);
      if (kind === 'ping') for (const k of [0, 1, 2]) badge('ping p' + k, ico, r);
      else badge(kind, ico, r);
      const name = el('span', '', r, t);
      if (tag === 'car') (this.carKeys ||= []).push({ r, b: r.firstChild, name });
      if (tag === 'veh') (this.vehKeys ||= []).push(r);
    }
  }

  setHeadingUp(on) {
    this.headingUp = !!on;
    lsSet(HEADING_KEY, this.headingUp ? '1' : '0');
    this._showHeading();
    this._layout();
  }

  _showHeading() {
    this.rotTxt.textContent = this.headingUp ? 'Facing up' : 'North up';
    this.rotBtn.classList.toggle('on', this.headingUp);
    this.view.classList.toggle('turned', this.headingUp);
  }

  backToMe() {
    this.follow = true;
    if (this.last) this.update(this.last);
  }

  setWorld(world) {
    if (this.world === world) return;
    this.world = world;
    // the mainland has a plane where the island has a car (game/act.js: Game sets the act before the world)
    const plane = !!world.car?.plane;
    this.titleName.textContent = plane ? 'The Calder Coast' : 'Harlan Valley';
    this.carH.t.textContent = W.The;
    for (const k of this.carKeys || []) {
      setBadge(k.b, 'car', glyph(W.glyph));
      k.name.textContent = W.your;
    }
    for (const r of this.vehKeys || []) r.hidden = !plane;
    // the island is drawn as one: sea round it (the mainland's own sea is in its map, on its west side)
    this.pad = plane ? 0 : SEA_PAD;
    this.span = world.size + this.pad * 2;
    const inset = (this.pad / this.span) * 100 + '%';
    this.canvasWrap.style.inset = inset;
    this.seaWrap.textContent = '';
    this.seaWrap.hidden = !this.pad;
    this.sea = null;
    this.canvasWrap.textContent = '';
    this.canvas = null;
    this.labels.textContent = '';
    this._ruleKey = '';
    const pct = (v) => this._u(v) * 100 + '%';
    // (a place's name is written where the world asks for it - z.label, its middle: the mainland's, clear of each other
    // and of the roads, as the picture writes them - or under the place's spot; the lesser places smaller; a name near
    // an edge of the map kept on it)
    const at = (l, x, z, centred) => {
      const u = (x + world.half) / world.size;
      l.style.left = pct(x);
      l.style.top = pct(z);
      if (centred) l.classList.add('at');
      if (u > 0.86) l.classList.add('edge-r');
      else if (u < 0.1) l.classList.add('edge-l');
    };
    this.labelEls = world.zones.map((z) => {
      const l = el('div', 'map-lab' + (z.minor ? ' sub' : world.kind === 2 ? ' big' : ''), this.labels);
      at(l, ...(z.label || [z.x, z.z]), !!z.label);
      l.dataset.zone = z.id;
      return l;
    });
    // St. Agnes Cemetery is part of the chapel's place: a name of its own on the map, in smaller letters (a click
    // on it is a click in the chapel's yard)
    // ...and so are a city's landmarks (the mainland: world.landmarks), each where it stands
    // (what is named inside the city is written only zoomed in: at the whole map it was a pile of names on its blocks)
    this.markLabs = (world.landmarks || []).map((m) => {
      const l = el('div', 'map-lab ' + (m.big || m.pass ? 'big' : 'sub') + (m.city ? ' city' : ''), this.labels);
      at(l, ...(m.label || [m.x, m.z]), !!(m.label || m.big || m.pass));
      return l;
    });
    this.cemLab = null;
    if (world.cemetery) {
      this.cemLab = el('div', 'map-lab sub', this.labels);
      this.cemLab.style.left = pct(world.cemetery.x);
      this.cemLab.style.top = pct(world.cemetery.z);
    }
    // the bridge's name: the island's is placed once the sea is baked (where Route 9 leaves it); the mainland's is
    // where its spans go out over the sea
    this.bridgeLab = el('div', 'mx-bridge', this.labels);
    el('b', '', this.bridgeLab, 'Route 9 bridge');
    el('span', '', this.bridgeLab, plane ? 'back to Harlan Valley · its last span is down' : `to the Calder Coast · fix the ${W.thing} to cross`);
    // (on the island's map: somebody's pencil beside it, the run's far goal - issue #269)
    if (!plane) el('i', 'mx-note', this.bridgeLab, 'to airfield');
    this.bridgeLab.hidden = true;
    if (world.bridge) {
      const b = world.bridge;
      // (under the spans, and in from the map's edge by half the card)
      this.bridgeLab.style.left = Math.max(21, this._u((Math.max(b.x0, -world.half) + b.x1) / 2) * 100) + '%';
      this.bridgeLab.style.top = this._u(b.z + 60) * 100 + '%';
      this.bridgeLab.hidden = false;
    }
  }

  _ensureCanvas() {
    if (this.canvas || !this.world) return;
    const t0 = performance.now();
    this.canvas = renderMapCanvas(this.world);
    this.canvas.className = 'map-cv';
    this.canvasWrap.appendChild(this.canvas);
    if (this.pad) {
      this.sea = renderSeaCanvas(this.world, this.pad);
      this.sea.canvas.className = 'map-cv';
      this.seaWrap.appendChild(this.sea.canvas);
      const b = this.sea.bridge;
      if (b) {
        // (in the middle of the band of sea it crosses, beside the bridge rather than over it, and along that side no
        // nearer a corner than the card is long)
        const h = this.world.half;
        const mid = (this.pad / 2 / this.span) * 100;
        const along = (u) => Math.max(22, Math.min(78, (u + (u < 0.5 ? 0.17 : -0.17)) * 100));
        const ns = Math.abs(b.z) - h > Math.abs(b.x) - h;
        this.bridgeLab.style.left = (ns ? along(this._u(b.x)) : b.x > 0 ? 100 - mid : mid) + '%';
        this.bridgeLab.style.top = (ns ? (b.z > 0 ? 100 - mid : mid) : along(this._u(b.z))) + '%';
        this.bridgeLab.hidden = false;
      }
    }
    console.log(`[map] baked in ${(performance.now() - t0).toFixed(0)}ms (${MAP_PX}px)`);
  }

  // the baked map, for the minimap to draw from (baked now if the map has not been opened yet), or null before a world
  baked() {
    this._ensureCanvas();
    return this.canvas;
  }

  // ...and the sea round it (the island), { canvas, pad }, or null
  bakedSea() {
    this._ensureCanvas();
    return this.sea;
  }

  setOpen(open) {
    open = !!open;
    if (open === this.open) return;
    this.open = open;
    if (open) {
      this._ensureCanvas();
      this.follow = true;
    } else {
      lsSet(ZOOM_KEY, String(this.zoom));
      this.ptrs.clear();
      this.press = null;
      this.gesture = null;
      this.view.classList.remove('panning');
      this.card.hidden = true;
      this.pop.hidden = true;
    }
    if (open) {
      screenCame(this.root); // (from another tab: nothing fades in)
      this.tabs.sync();
      if (this.ui.screenRun?.()) this.tabs.holdClock(true);
    } else this.tabs.holdClock(false);
    this.root.hidden = !open;
    this.ui.root.classList.toggle('map-open', open);
  }

  _mk(i) {
    let m = this.pool[i];
    if (!m) {
      const e = el('div', 'mx-m', this.markers);
      const b = badge('you', '', e);
      const lab = el('span', 'mx-ml', e);
      m = { e, b, lab, l: '', c: '', rot: '' };
      this.pool[i] = m;
    }
    return m;
  }

  _ring(i) {
    let r = this.ringPool[i];
    if (!r) {
      const e = el('div', 'mx-ring', this.rings);
      const tab = el('div', 'mx-tab', e);
      r = { e, tab, c: '', k: '', w: '' };
      this.ringPool[i] = r;
    }
    return r;
  }

  // d: { self:{x,z,yaw}, mates:[{x,z,name,status}], car:{x,z}, pings:[{x,z,kind,name}], crates:[{x,z}],
  //      benches:[{x,z}], discovered:Set, hints:[zone...], found:bits (a hint whose supply has been taken),
  //      schemHints:[zone per schematic], unlocked:bits (the schematics the team has),
  //      supplies:[n...], carried:{item:n}, parts:[{item,x,z}] (car supplies lying loose), waypoint:{x,z,zone} | null,
  //      teamWays:[{x,z,zone,names:[...],mine (on the spot of your own)}] }
  update(d) {
    if (!this.open || !this.world) return;
    this.last = d;
    const world = this.world;
    const pct = (v) => this._u(v) * 100 + '%';
    this.yaw = d.self.yaw;
    if (this.follow) {
      this.fx = this._u(d.self.x);
      this.fy = this._u(d.self.z);
    }
    this._layout();
    const way = d.waypoint;
    const taken = (i) => !!(d.found & (1 << i));
    const schems = schematicRumours(d.schemHints, d.unlocked);
    // place names: known once discovered. A rumour names its place too, and rings it while what it hides is still there
    this.labelEls.forEach((l, i) => {
      const z = world.zones[i];
      const known = d.discovered.has(z.id);
      const txt = known ? ZONE_NAMES[z.id] : d.hints.includes(z.id) || d.schemHints.includes(z.id) ? ZONE_NAMES[z.id] + '?' : '?';
      if (l.textContent !== txt) l.textContent = txt;
      l.classList.toggle('unknown', !known);
      l.classList.toggle('hinted', d.hints.some((zid, k) => zid === z.id && !taken(k)) || schems.some((rm) => rm.zone === z.id));
      l.classList.toggle('way', !!way && way.zone === z.id);
    });
    // (a city's landmarks: known once the city is)
    const marks = world.landmarks || [];
    for (let i = 0; i < this.markLabs.length; i++) {
      const txt = d.discovered.has(ZONE.CITY) ? marks[i].name : '';
      if (this.markLabs[i].textContent !== txt) this.markLabs[i].textContent = txt;
    }
    if (this.cemLab) {
      // (known once you have been to it, or to the chapel it lies behind)
      const txt = d.discovered.has(ZONE.CEMETERY) || d.discovered.has(ZONE.CHURCH) ? ZONE_NAMES[ZONE.CEMETERY] : '';
      if (this.cemLab.textContent !== txt) this.cemLab.textContent = txt;
    }

    // ---- rumours: a ring round the whole place, a tab on it with what is rumoured there (orange: a supply the car
    // still needs, blue: a schematic the team lacks). Which container holds it is not known: they all have to be searched
    const rumoured = this._rumours(d, schems);
    let ri = 0;
    for (const [zid, r] of rumoured) {
      const z = world.zoneById[zid];
      if (!z) continue;
      const kind = r.sup.length ? (r.schem.length ? 'both' : 'sup') : 'schem';
      const ring = this._ring(ri++);
      const cls = 'mx-ring ' + kind;
      if (ring.c !== cls) ring.e.className = ring.c = cls;
      const w = (((z.flat || 20) + 14) * 2 * 100) / this.span + '%';
      if (ring.w !== w) {
        ring.w = w;
        ring.e.style.width = ring.e.style.height = w;
      }
      ring.e.style.left = pct(z.x);
      ring.e.style.top = pct(z.z);
      const k = r.sup.join(',') + '|' + r.schem.join(',');
      if (ring.k !== k) {
        ring.k = k;
        ring.tab.textContent = '';
        for (const it of r.sup) svgEl('i', 'mx-tab-i sup', ring.tab, itemIcon(it));
        for (const it of r.schem) svgEl('i', 'mx-tab-i schem', ring.tab, itemIcon(it));
      }
      if (ring.e.hidden) ring.e.hidden = false;
    }
    for (let i = ri; i < this.ringPool.length; i++) if (!this.ringPool[i].e.hidden) this.ringPool[i].e.hidden = true;

    // ---- markers
    let n = 0;
    const put = (x, z, kind, icon, label = '', rot = null) => {
      const m = this._mk(n++);
      const cls = 'mx-m ' + kind;
      if (m.c !== cls) m.e.className = m.c = cls;
      setBadge(m.b, kind, icon);
      if (m.l !== label) m.lab.textContent = m.l = label;
      m.e.style.left = pct(x);
      m.e.style.top = pct(z);
      const tr = rot === null ? '' : `rotate(${rot}rad)`;
      if (m.rot !== tr) m.b.style.transform = m.rot = tr;
      if (m.e.hidden) m.e.hidden = false;
    };
    // your waypoint goes under everything else (on a place its own name is the label, in the waypoint's colour)
    if (way) put(way.x, way.z, 'way', glyph('flag'), way.zone >= 0 ? '' : 'Waypoint');
    // the team's, named for who set them (one on your own spot stands just east of your ring)
    for (const t of d.teamWays) put(t.x + (t.mine ? TEAM_BESIDE : 0), t.z, 'teamway', glyph('flag'), t.names.join(', '));
    for (const b of d.benches) put(b.x, b.z, 'bench', glyph('wrench'), 'Bench');
    // the team's vehicles: where each was left (a parked car is easy to lose)
    for (const v of d.vehicles || []) if (!v.mine) put(v.x, v.z, 'veh' + (v.down ? ' down' : ''), v.kind === 2 ? glyph('car') : itemIcon(v.kind === 1 ? ITEM.MOPED_KIT : ITEM.BIKE_KIT), VEH_LABEL[v.kind] + (v.down ? ' (not running)' : ''));
    // car supplies on the ground where someone dropped them or fell, named for what they are
    for (const p of d.parts) put(p.x, p.z, 'part', itemIcon(p.item), ITEM_DEFS[p.item].name);
    // (a team that has found nothing yet: the rumour narrowed to round here, then the spot itself)
    for (const h of d.helped || []) put(h.x, h.z, 'part', itemIcon(h.item), ITEM_DEFS[h.item].name + (h.exact ? '' : ' · round here?'));
    for (const c of d.crates) put(c.x, c.z, 'crate', glyph('hazard'), 'Supply drop');
    for (const p of d.pings) put(p.x, p.z, 'ping p' + p.kind, glyph('ping'), `${PING_WORD[p.kind] || 'Ping'} · ${p.name}`);
    put(d.car.x, d.car.z, 'car', glyph(W.glyph), W.thing === 'car' ? 'Car' : 'Plane');
    for (const m of d.mates) {
      const down = m.status === 'downed';
      put(m.x, m.z, down ? 'down' : 'mate', down ? glyph('downed') : initial(m.name), down ? `${m.name} · DOWN` : m.name);
    }
    // (the marker stands upright on screen, so its arrow turns with the map as well as with you)
    put(d.self.x, d.self.z, 'you', glyph('arrowUp'), '', this.rot - d.self.yaw);
    for (let i = n; i < this.pool.length; i++) if (!this.pool[i].e.hidden) this.pool[i].e.hidden = true;

    const grid = gridRef(world, d.self.x, d.self.z);
    const yg = `You · ${grid}`;
    if (this.youGrid.textContent !== yg) this.youGrid.textContent = yg;
    const xy = ` · ${Math.round(d.self.x)} E ${Math.round(-d.self.z)} N`;
    if (this.youXY.textContent !== xy) this.youXY.textContent = xy;
    this.youBtn.classList.toggle('away', !this.follow);

    // ---- the panel (and its chips)
    const leads = this._leads(d, rumoured);
    const team = this._team(d);
    this._panel(d, leads, team);
    this._pins(d, leads, team);
  }

  // the places something is rumoured to be in: zone -> { sup: [item...], schem: [item...] }
  _rumours(d, schems) {
    const out = new Map();
    const at = (zid) => out.get(zid) || (out.set(zid, { sup: [], schem: [] }), out.get(zid));
    d.hints.forEach((zid, i) => {
      if (zid === 255 || d.found & (1 << i)) return;
      const si = Math.min(i, SUPPLIES.length - 1);
      if (d.supplies[si] >= SUPPLY_NEED[si] || !this.world.zoneById[zid]) return;
      const r = at(zid);
      if (!r.sup.includes(SUPPLIES[si])) r.sup.push(SUPPLIES[si]);
    });
    for (const rm of schems) if (this.world.zoneById[rm.zone]) at(rm.zone).schem.push(rm.item);
    return out;
  }

  // what is off the view waits on its edge, in its direction, with how far it is from you: a downed mate, the car, you
  // (once the map has been moved off you), your waypoint, the team, a supply on the ground, the nearest rumour of each
  // supply still needed. A pin a click centres the map on. Pins on one edge are spread apart, not piled up
  _pins(d, leads, team) {
    const vw = this.vw;
    if (!vw) return;
    const { x: sx, z: sz } = d.self;
    const want = [];
    for (const m of team.mates) if (m.kind === 'down') want.push(m);
    want.push({ kind: 'car', icon: glyph(W.glyph), x: d.car.x, z: d.car.z, title: W.thing === 'car' ? 'Car' : 'Plane' });
    if (!this.follow) want.push({ kind: 'you', icon: glyph('arrowUp'), x: sx, z: sz, title: 'You', me: true });
    if (d.waypoint) want.push({ kind: 'way', icon: glyph('flag'), x: d.waypoint.x, z: d.waypoint.z, title: 'Waypoint' });
    for (const m of team.mates) if (m.kind !== 'down') want.push({ ...m, title: m.name });
    for (const L of leads) {
      const l = L.leads.find((o) => o.kind !== 'car');
      if (l) want.push({ kind: l.kind === 'sup' ? 'sup' : 'part', icon: itemIcon(L.item), x: l.x, z: l.z, title: ITEM_DEFS[L.item].name });
    }
    const half = vw / 2;
    const M = 6; // px in from the edge
    const placed = [];
    for (const w of want) {
      if (placed.length >= PIN_MAX) break;
      const [px, py] = this._screen(w.x, w.z);
      if (Math.abs(px) < half - 10 && Math.abs(py) < half - 10) continue; // (in view: the marker itself shows)
      const t = Math.min((half - M) / Math.max(1e-6, Math.abs(px)), (half - M) / Math.max(1e-6, Math.abs(py)));
      const ex = px * t;
      const ey = py * t;
      const side = Math.abs(ex) >= half - M - 0.5 ? (ex > 0 ? 'r' : 'l') : ey > 0 ? 'b' : 't';
      const text = w.title + ' · ' + fmtDist(w.me ? 0 : Math.hypot(w.x - sx, w.z - sz));
      placed.push({ w, side, ex, ey, ang: Math.atan2(py, px), text, wid: 46 + text.length * 7.2 });
    }
    // spread along each edge: in order along it, each at least a pin's length (or height) from the one before
    for (const sd of ['l', 'r', 't', 'b']) {
      const on = placed.filter((p) => p.side === sd);
      const vert = sd === 'l' || sd === 'r';
      on.sort((a, b) => (vert ? a.ey - b.ey : a.ex - b.ex));
      let prev = -Infinity;
      let prevW = 0;
      for (const p of on) {
        const gap = vert ? 30 : (prevW + p.wid) / 2 + 6;
        let at = vert ? p.ey : p.ex;
        if (at < prev + gap) at = prev + gap;
        const lim = half - (vert ? 18 : p.wid / 2 + 4);
        // (the north dial has the top right corner)
        at = Math.max(-lim, Math.min(lim - (sd === 't' ? 50 : 0), at));
        if (vert) p.ey = at;
        else p.ex = at;
        prev = at;
        prevW = p.wid;
      }
    }
    placed.forEach((p, i) => {
      let e = this.pinPool[i];
      if (!e) {
        const b = button('mx-pin', this.pins);
        const arrow = svgEl('i', 'mx-pin-arr', b, glyph('arrowUp'));
        const bd = badge('you', '', b);
        const t = el('span', 'mx-pin-t', b);
        e = this.pinPool[i] = { b, arrow, bd, t, c: '', at: null, me: false };
        b.addEventListener('click', () => (e.me ? this.backToMe() : e.at && this.centreOn(e.at.x, e.at.z)));
      }
      const cls = 'mx-pin ' + p.side + ' ' + p.w.kind;
      if (e.c !== cls) e.b.className = e.c = cls;
      setBadge(e.bd, p.w.kind, p.w.icon);
      if (e.t.textContent !== p.text) e.t.textContent = p.text;
      e.b.style.transform = `translate(${(half + p.ex).toFixed(1)}px, ${(half + p.ey).toFixed(1)}px)`;
      e.arrow.style.transform = `rotate(${(p.ang + Math.PI / 2).toFixed(3)}rad)`;
      e.at = { x: p.w.x, z: p.w.z };
      e.me = !!p.w.me;
      if (e.b.hidden) e.b.hidden = false;
    });
    for (let i = placed.length; i < this.pinPool.length; i++) if (!this.pinPool[i].b.hidden) this.pinPool[i].b.hidden = true;
  }

  // a place's card, while the pointer is over its name: what it is, what is rumoured there, who is there, how far and
  // which way it is from you, its grid square
  _hoverCard(e) {
    const lab = e.target.closest?.('.map-lab');
    const zone = lab && lab.dataset.zone ? this.world?.zoneById[lab.dataset.zone] : null;
    const d = this.last;
    if (!zone || !d) {
      if (!this.card.hidden) this.card.hidden = true;
      return;
    }
    if (this._cardZone !== zone.id || this.card.hidden) {
      this._cardZone = zone.id;
      const c = this.card;
      c.textContent = '';
      const known = d.discovered.has(zone.id);
      el('b', 'mx-card-h', c, known ? ZONE_NAMES[zone.id] : 'Unknown place');
      const r = this._rumours(d, schematicRumours(d.schemHints, d.unlocked)).get(zone.id);
      for (const it of r?.sup || []) el('span', 'mx-card-sup', c, `${ITEM_DEFS[it].name} rumoured here`);
      for (const it of r?.schem || []) el('span', 'mx-card-schem', c, `${ITEM_DEFS[it].name} rumoured here`);
      const here = d.mates.filter((m) => placeAt(this.world, m.x, m.z)?.id === zone.id).map((m) => m.name + (m.status === 'downed' ? ' (down)' : ''));
      if (here.length) el('span', 'mx-card-team', c, here.join(', ') + (here.length > 1 ? ' are here' : ' is here'));
      const dd = Math.hypot(zone.x - d.self.x, zone.z - d.self.z);
      el('span', '', c, `${fmtDist(dd)} ${dirOf(zone.x - d.self.x, zone.z - d.self.z)} of you · ${gridRef(this.world, zone.x, zone.z)}`);
      el('span', 'mx-card-k', c, 'Click: set your waypoint');
    }
    const vr = this.view.getBoundingClientRect();
    const cw = this.card.offsetWidth || 220;
    const ch = this.card.offsetHeight || 90;
    let x = e.clientX - vr.left + 16;
    let y = e.clientY - vr.top + 16;
    if (x + cw > vr.width - 6) x = e.clientX - vr.left - cw - 12;
    if (y + ch > vr.height - 6) y = e.clientY - vr.top - ch - 12;
    this.card.style.transform = `translate(${Math.max(4, x).toFixed(0)}px, ${Math.max(4, y).toFixed(0)}px)`;
    this.card.hidden = false;
  }
}

addMethods(MapScreen, mapPanelMethods);
addMethods(MapScreen, mapViewMethods);
