// Small overlays: the connection banner, the reload after a deploy, who is talking. (The splash: splash.js; the Esc
// menu: pause.js; the invite panel: invite.js; death and the end of a run: endscreens.js)
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';

// ---------------------------------------------------------------- connection banner
export class Banner {
  constructor(parent) {
    this.root = el('div', 'conn', parent);
    this.root.hidden = true;
    svgEl('i', 'conn-ico', this.root, glyph('signal'));
    this.txt = el('span', 'conn-t', this.root, '');
    el('span', 'conn-dots', this.root, '');
  }

  set(text) {
    this.root.hidden = !text;
    if (text) this.txt.textContent = String(text);
  }
}

// ---------------------------------------------------------------- a deploy with a new client: reloading, then back in
export class UpdatingModal {
  constructor(parent) {
    this.root = el('div', 'stn-settings stn-updating', parent);
    this.root.setAttribute('role', 'alertdialog');
    this.root.hidden = true;
    const card = el('div', 'set-card paper', this.root);
    el('h2', 'set-title', el('div', 'set-head', card), 'Game updated');
    el('p', 'upd-text', el('div', 'set-body', card), 'Refreshing to the new version. You will be put back in this game automatically.');
  }

  show(on) {
    this.root.hidden = !on;
  }
}

// ---------------------------------------------------------------- voice speakers (top-left)
export class VoiceList {
  constructor(parent) {
    this.root = el('div', 'voice', parent);
    this.key = '';
  }

  // speakers: names, or { name, radio } (radio = coming through the walkie-talkie)
  set(speakers) {
    const list = (Array.isArray(speakers) ? speakers.slice(0, 6) : []).map((s) => (typeof s === 'object' && s ? s : { name: s }));
    const key = list.map((s) => (s.radio ? '\u0002' : '') + s.name).join('\u0001');
    if (key === this.key) return;
    this.key = key;
    this.root.textContent = '';
    for (const s of list) {
      const r = el('div', 'vc-row' + (s.radio ? ' radio' : ''), this.root);
      svgEl('i', 'vc-ico', r, glyph(s.radio ? 'radio' : 'mic'));
      el('span', 'vc-name', r, String(s.name));
    }
  }
}
