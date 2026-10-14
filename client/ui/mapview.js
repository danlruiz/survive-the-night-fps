// The field map's view (mapscreen.js): how the map is zoomed, panned and turned in it, the grid's letters along its
// edges, and where in the world a click on it lands. Methods laid onto MapScreen.
import { el, replay } from './dom.js';
import { GRID, gridLetter } from './mapmarks.js';

export const MAX_ZOOM = 4; // the baked map is 2 px a metre: past this it is a blur
const DRAG_PX = 5; // a press that moves this far is a pan, not a click for the waypoint
const FIND_ZOOM = 2; // a click on a row centres the map on what it names, at least this close in
const CITY_NAMES_ZOOM = 2.2; // what is named inside a city is written from this zoom in (the mainland's Town Center)

export const mapViewMethods = {
  // the pointers on the view: a press that does not move is a click (the waypoint), a drag pans, two fingers pinch;
  // the wheel and a trackpad pinch zoom
  _bindPanZoom() {
    this.ptrs = new Map(); // pointer id -> where it was last seen (two of them are a pinch)
    this.press = null; // { id, x, y, target }: a press that has not moved far enough to be a pan; let go, it is a click
    this.gesture = null; // Safari's trackpad pinch: the zoom when it began
    this.view.addEventListener('pointerdown', (e) => {
      if (!this.world || e.target.closest('.map-north, .mx-pin')) return;
      // the right button anywhere takes the waypoint back
      if (e.button === 2) return this.onWaypoint?.(null);
      if (e.button !== 0) return;
      this.view.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.press = this.ptrs.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target } : null;
    });
    this.view.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) return this._hoverCard(e);
      if (this.press) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
        this.press = null;
        this.view.classList.add('panning');
        this.card.hidden = true;
      }
      if (this.ptrs.size === 1) {
        this._panBy(e.clientX - p.x, e.clientY - p.y);
        p.x = e.clientX;
        p.y = e.clientY;
        return;
      }
      // two fingers: the map zooms with their spread (about the focus, like the wheel)
      const a = this._spread();
      p.x = e.clientX;
      p.y = e.clientY;
      this._zoomTo((this.zoom * this._spread().d) / a.d);
    });
    this.view.addEventListener('pointerleave', () => (this.card.hidden = true));
    const release = (e) => {
      if (!this.ptrs.delete(e.pointerId)) return;
      if (!this.ptrs.size) this.view.classList.remove('panning');
      const pr = this.press;
      this.press = null;
      // a click: on the waypoint itself it takes it back, anywhere else it sets it
      if (e.type === 'pointerup' && pr?.id === e.pointerId) this.onWaypoint?.(pr.target.closest('.mx-m.way') ? null : this._pick(pr.x, pr.y, pr.target));
    };
    this.view.addEventListener('pointerup', release);
    this.view.addEventListener('pointercancel', release);
    this.view.addEventListener('contextmenu', (e) => e.preventDefault());
    // the wheel, and a trackpad pinch (Chrome and Firefox send that as the wheel with Ctrl held, in small steps)
    this.view.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault(); // (Ctrl + wheel would zoom the whole page)
        if (this.gesture !== null) return;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.view.clientHeight : 1;
        this._zoomTo(this.zoom * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.002)));
      },
      { passive: false },
    );
    // Safari sends a trackpad pinch as gesture events instead (on a touch screen the pointers above have it)
    this.view.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      this.gesture = this.zoom;
    });
    this.view.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (this.gesture !== null && this.ptrs.size < 2) this._zoomTo(this.gesture * e.scale);
    });
    this.view.addEventListener('gestureend', (e) => {
      e.preventDefault();
      this.gesture = null;
    });
  },

  // the middle of the first two pointers down and how far apart they are
  _spread() {
    const [a, b] = this.ptrs.values();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  },

  _zoomTo(z) {
    this.zoom = Math.max(1, Math.min(MAX_ZOOM, z));
    this._layout();
  },

  // a spot of the world as a fraction across / down the pane (the chart: on the island the map has sea round it)
  _u(v) {
    return (v + this.world.half + this.pad) / this.span;
  },

  // a spot of the world -> px from the middle of the view, as shown (zoomed, panned, turned)
  _screen(x, z) {
    const w = this.vw * this.zoom;
    const mx = (this._u(x) - this.cx) * w;
    const my = (this._u(z) - this.cy) * w;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [mx * c - my * s, mx * s + my * c];
  },

  // a drag: the focus becomes the middle shown, moved with the pointer (all the map is in view at 1x north up:
  // nothing to move). The move on screen is turned back onto the map when the map is turned
  _panBy(dx, dy) {
    if (this.zoom <= 1 && !this.headingUp) return;
    this.follow = false;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const w = this.view.clientWidth * this.zoom; // (the view is square)
    this.fx = this.cx - (dx * c + dy * s) / w;
    this.fy = this.cy - (dy * c - dx * s) / w;
    this._layout();
    this.fx = this.cx;
    this.fy = this.cy;
  },

  // a click on a row: the map centred on what it names (closer in, if it was all in view), and a ring flashed round it
  centreOn(x, z) {
    if (!this.world) return;
    this.follow = false;
    this.fx = this._u(x);
    this.fy = this._u(z);
    if (this.zoom < FIND_ZOOM) this.zoom = FIND_ZOOM;
    this._layout();
    const f = this.flash;
    f.style.left = this._u(x) * 100 + '%';
    f.style.top = this._u(z) * 100 + '%';
    f.hidden = false;
    replay(f, 'go');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => (f.hidden = true), 1600);
  },

  // the focus in the middle, but north up the map never pulls away from the view's edges. Turned, it turns about the
  // middle and its corners come into view anyway: then only the focus stays on the map
  _layout() {
    const rot = this.headingUp ? this.yaw : 0;
    const m = this.headingUp ? 0 : 0.5 / this.zoom;
    this.cx = Math.max(m, Math.min(1 - m, this.fx));
    this.cy = Math.max(m, Math.min(1 - m, this.fy));
    const st = this.pane.style;
    st.width = st.height = this.zoom * 100 + '%';
    this.pane.classList.toggle('far', this.zoom < CITY_NAMES_ZOOM);
    st.left = (0.5 - this.cx * this.zoom) * 100 + '%';
    st.top = (0.5 - this.cy * this.zoom) * 100 + '%';
    st.transformOrigin = `${this.cx * 100}% ${this.cy * 100}%`;
    if (rot !== this.rot) {
      this.rot = rot;
      st.transform = rot ? `rotate(${rot}rad)` : '';
      // the names and markers turn back the other way, so they stay upright; the compass turns with the map
      st.setProperty('--unrot', -rot + 'rad');
      this.north.style.setProperty('--rot', rot + 'rad');
    }
    this._rules();
  },

  // the grid's letters across the top and numbers down the side, where each column / row of squares is in view (north
  // up only: turned, the squares are askew to the edges, and the panel's rows carry each one's square instead)
  _rules() {
    if (!this.world || !this.vw) return;
    const key = this.headingUp ? 'up' : `${this.zoom.toFixed(4)},${this.cx.toFixed(5)},${this.cy.toFixed(5)},${this.vw}`;
    if (key === this._ruleKey) return;
    this._ruleKey = key;
    const n = Math.round(this.world.size / GRID);
    const w = this.vw * this.zoom;
    const put = (box, centre) => {
      const pool = box._pool || (box._pool = []);
      let k = 0;
      if (!this.headingUp) {
        for (let i = 0; i < n; i++) {
          const at = (this._u(-this.world.half + (i + 0.5) * GRID) - centre) * w + this.vw / 2;
          if (at < 8 || at > this.vw - 8) continue;
          let s = pool[k];
          if (!s) s = pool[k] = el('span', '', box);
          k++;
          const t = box === this.ruleTop ? gridLetter(i) : String(i + 1);
          if (s.textContent !== t) s.textContent = t;
          s.style.setProperty('--at', at.toFixed(1) + 'px');
          s.hidden = false;
        }
      }
      for (; k < pool.length; k++) pool[k].hidden = true;
    };
    put(this.ruleTop, this.cx);
    put(this.ruleLeft, this.cy);
  },

  // where a click on the map is in the world; on a place's name or inside its yard it is that place
  _pick(px, py, target) {
    const lab = target.closest('.map-lab');
    let zone = lab && lab.dataset.zone ? this.world.zoneById[lab.dataset.zone] : null;
    // from the middle of the view, turned back onto the map
    const r = this.view.getBoundingClientRect();
    const dx = px - (r.left + r.width / 2);
    const dy = py - (r.top + r.height / 2);
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    const w = this.view.clientWidth * this.zoom;
    const u = this.cx + (dx * c + dy * s) / w;
    const v = this.cy + (dy * c - dx * s) / w;
    const lim = this.world.half - 3; // the playable ground stops short of the map's edge
    const x = Math.max(-lim, Math.min(lim, u * this.span - this.world.half - this.pad));
    const z = Math.max(-lim, Math.min(lim, v * this.span - this.world.half - this.pad));
    if (!zone) {
      let best = Infinity;
      for (const zn of this.world.zones) {
        const d = Math.hypot(x - zn.x, z - zn.z);
        // (the same reach as discovering the place on foot)
        if (d < zn.flat + 6 && d < best) {
          best = d;
          zone = zn;
        }
      }
    }
    return zone ? { x: zone.x, z: zone.z, zone: zone.id } : { x, z, zone: -1 };
  },
};
