// The game's code and invite link, opened from "Invite friends" on the pause menu: a panel (panel.js), closed the same
// ways as the others.
import { el, svgEl, button } from './dom.js';
import { glyph } from './icons.js';
import { difficultyText } from './games.js';
import { Panel } from './panel.js';

export class InvitePanel extends Panel {
  constructor(ui, parent) {
    super(ui, parent, 'stn-invite', 'Invite friends');
    const body = this.body;
    el('div', 'pi-title', body, 'Game code');
    this.code = el('div', 'iv-code', body, '');
    el('div', 'pi-title', body, 'Invite link');
    const row = el('div', 'pi-row', body);
    this.link = el('input', 'pi-link', row);
    this.link.type = 'text';
    this.link.readOnly = true;
    this.link.spellcheck = false;
    this.link.addEventListener('focus', () => this.link.select());
    const copy = button('btn btn-ghost pi-copy', row);
    svgEl('i', 'btn-ico', copy, glyph('link'));
    this.copyTxt = el('span', '', copy, 'Copy invite link');
    copy.addEventListener('click', () => this.copy());
    this.note = el('div', 'pi-note', body, '');
    const done = el('button', 'btn btn-blood', this.foot, 'Done');
    done.addEventListener('click', () => this.hide());
  }

  set(room, link) {
    if (!room) return this.hide();
    this.sub.textContent = `${room.name} · ${difficultyText(room.difficulty)} · ${room.inviteOnly ? 'invite only' : 'public'}`;
    this.code.textContent = room.code;
    this.link.value = link;
    this.note.textContent = room.inviteOnly ? 'Only people with this link can join.' : 'Anyone can join from Browse games, or straight in with this link.';
    this.copyTxt.textContent = 'Copy invite link';
  }

  async copy() {
    const link = this.link.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      // (no clipboard API outside https / localhost: the old way, from the selected field)
      this.link.focus();
      this.link.select();
      try {
        ok = document.execCommand('copy');
      } catch {}
    }
    this.copyTxt.textContent = ok ? 'Link copied' : 'Select it and copy';
    clearTimeout(this._copyT);
    this._copyT = setTimeout(() => (this.copyTxt.textContent = 'Copy invite link'), 2200);
  }

  show() {
    this.copyTxt.textContent = 'Copy invite link';
    super.show();
  }
}
