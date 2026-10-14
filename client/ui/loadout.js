// The loadout panel: the permanent items an account (or a guest's browser) owns, and the three slots that take them
// into a run. The items' words are in loadoutinfo.js; the service is client/net/loadout.js.
import { LOADOUT_CATALOG, LOADOUT_RARITY, LOADOUT_RARITY_NAMES, LOADOUT_SLOTS, LOADOUT_TYPES, loadoutDef, loadoutTypeName } from '../../shared/loadout.js';
import { SKULLS } from '../../shared/economy.js';
import { el, svgEl, button, iconButton } from './dom.js';
import { glyph } from './icons.js';
import { Panel } from './panel.js';
import { fetchLoadout, saveLoadout } from '../net/loadout.js';
import { accountState } from '../net/account.js';
import { bestiaryView } from '../net/bestiary.js';
import { loadoutCounts, loadoutTally, silhouette, tallyText } from '../../shared/collections.js';
import { fmtGrant, fmtMods, fmtEffects, fmtSource, typeIcon, cleanData, priceText } from './loadoutinfo.js';

export class LoadoutPanel extends Panel {
  constructor(ui, parent) {
    super(ui, parent, 'lo-panel', 'Loadout');
    this.data = null;
    this.selected = '';
    this.typeFilter = 'all';
    this.rarityFilter = 0;
    this.sort = 'rarity';
    this.showMissing = true; // the items not found yet, as silhouettes after the owned ones (issue #286)
    this.busy = false;
    this.err = '';
    this.root.classList.add('loadout-panel');
    this.sub.textContent = 'Three slots · any item in any slot';

    this.slotBox = el('div', 'lo-slots', this.body);
    this.balance = el('div', 'lo-balance', this.body);
    // a guest with something to lose (where there are accounts to keep it on): their browser's id is the only key to
    // it, and goes with the browser's data (client/net/identity.js)
    this.guest = el('div', 'ach-note lo-guest', this.body);
    this.guest.hidden = true;
    el('span', '', this.guest, 'Kept in this browser only: clearing its data, a private window or another device and they are out of reach. Sign in and your items and Zombie Skulls move onto your account.');
    const signIn = button('btn btn-ghost', this.guest);
    svgEl('i', 'btn-ico', signIn, glyph('person'));
    el('span', '', signIn, 'Sign in');
    signIn.addEventListener('click', () => {
      this.hide();
      this.ui.accountPanel.show({ after: this });
    });
    this.note = el('p', 'ac-note lo-note', this.body, 'Loadout items are permanent profile items. Equipped copies join you at the start of a run and never drop for other players.');
    this.controls = el('div', 'lo-controls', this.body);
    this.makeControls();
    this.grid = el('div', 'lo-grid', this.body);
    this.detail = el('div', 'lo-detail', this.body);

    this.refreshB = button('btn btn-ghost', this.foot, 'Refresh');
    this.refreshB.addEventListener('click', () => this.refresh());
    el('span', 'gb-gap', this.foot);
    this.closeB = button('btn btn-ghost', this.foot, 'Close');
    this.closeB.addEventListener('click', () => this.hide());
  }
  show() {
    super.show();
    this.render();
    this.refresh();
  }
  async refresh() {
    if (this.busy) return;
    this.busy = true;
    this.err = '';
    this.render();
    try {
      this.data = cleanData(await fetchLoadout());
      if (!this.selected || !this.data.items.some((it) => it.id === this.selected)) this.selected = this.data.items[0]?.id || '';
    } catch (err) {
      this.err = err.message || 'Could not load your collection';
    }
    this.busy = false;
    this.render();
  }
  async save(slots) {
    if (this.busy) return;
    this.busy = true;
    this.err = '';
    this.render();
    try {
      this.data = cleanData(await saveLoadout(slots));
    } catch (err) {
      this.err = err.message || 'That did not save';
      await this.refresh();
    }
    this.busy = false;
    this.render();
  }
  byId() {
    return new Map((this.data?.items || []).map((it) => [it.id, it]));
  }
  makeControls() {
    const field = (label, select) => {
      const wrap = el('label', 'lo-filter', this.controls);
      el('span', '', wrap, label);
      wrap.appendChild(select);
    };
    this.typeSel = el('select', '', null);
    for (const [value, label] of [['all', 'All types'], ...Object.values(LOADOUT_TYPES).map((t) => [t, loadoutTypeName(t)])]) {
      const o = el('option', '', this.typeSel, label);
      o.value = value;
    }
    this.typeSel.addEventListener('change', () => {
      this.typeFilter = this.typeSel.value;
      this.render();
    });
    field('Type', this.typeSel);
    this.raritySel = el('select', '', null);
    for (const [value, label] of [[0, 'All rarities'], [LOADOUT_RARITY.COMMON, 'Common+'], [LOADOUT_RARITY.RARE, 'Rare+'], [LOADOUT_RARITY.EPIC, 'Epic+'], [LOADOUT_RARITY.LEGENDARY, 'Legendary']]) {
      const o = el('option', '', this.raritySel, label);
      o.value = value;
    }
    this.raritySel.addEventListener('change', () => {
      this.rarityFilter = +this.raritySel.value || 0;
      this.render();
    });
    field('Rarity', this.raritySel);
    this.sortSel = el('select', '', null);
    for (const [value, label] of [['rarity', 'Rarity'], ['type', 'Type'], ['newest', 'Newest']]) {
      const o = el('option', '', this.sortSel, label);
      o.value = value;
    }
    this.sortSel.addEventListener('change', () => {
      this.sort = this.sortSel.value;
      this.render();
    });
    field('Sort', this.sortSel);
    this.showSel = el('select', '', null);
    for (const [value, label] of [['all', 'Owned and missing'], ['owned', 'Owned only']]) {
      const o = el('option', '', this.showSel, label);
      o.value = value;
    }
    this.showSel.addEventListener('change', () => {
      this.showMissing = this.showSel.value === 'all';
      this.render();
    });
    field('Show', this.showSel);
    this.count = el('span', 'lo-count', this.controls);
  }
  visibleItems() {
    const items = (this.data?.items || []).filter((owned) => {
      const def = loadoutDef(owned.catalog);
      return def && (this.typeFilter === 'all' || def.type === this.typeFilter) && (!this.rarityFilter || def.rarity >= this.rarityFilter);
    });
    const cmp = {
      rarity: (a, b) => loadoutDef(b.catalog).rarity - loadoutDef(a.catalog).rarity || loadoutDef(a.catalog).type.localeCompare(loadoutDef(b.catalog).type) || loadoutDef(a.catalog).name.localeCompare(loadoutDef(b.catalog).name) || a.id.localeCompare(b.id),
      type: (a, b) => loadoutDef(a.catalog).type.localeCompare(loadoutDef(b.catalog).type) || loadoutDef(b.catalog).rarity - loadoutDef(a.catalog).rarity || loadoutDef(a.catalog).name.localeCompare(loadoutDef(b.catalog).name) || a.id.localeCompare(b.id),
      newest: (a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0) || b.id.localeCompare(a.id),
    }[this.sort];
    return items.sort(cmp);
  }
  // the catalog's items not owned yet that the filters let through, rarest first: [def]
  missingDefs() {
    if (!this.showMissing || !this.data) return [];
    const have = loadoutCounts(this.data.items);
    return LOADOUT_CATALOG.filter((def) => !have.has(def.id) && (this.typeFilter === 'all' || def.type === this.typeFilter) && (!this.rarityFilter || def.rarity >= this.rarityFilter)).sort(
      (a, b) => b.rarity - a.rarity || a.type.localeCompare(b.type) || a.id - b.id
    );
  }
  renderSlots(byId = this.byId()) {
    this.slotBox.textContent = '';
    const slots = this.data?.slots || Array(LOADOUT_SLOTS).fill(null);
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const owned = byId.get(slots[i]);
      const def = owned && loadoutDef(owned.catalog);
      const b = button(`lo-slot${this.selected && slots[i] === this.selected ? ' on' : ''}`, this.slotBox);
      svgEl('i', `lo-slot-ico${def ? ` r${def.rarity}` : ''}`, b, glyph(def ? typeIcon(def) : 'plus'));
      const t = el('span', 'lo-slot-t', b);
      el('b', '', t, def ? def.name : `Slot ${i + 1}`);
      el('small', '', t, def ? `${def.type} · ${LOADOUT_RARITY_NAMES[def.rarity]}` : 'Empty');
      b.addEventListener('click', () => {
        if (slots[i]) this.selected = slots[i];
        this.render();
      });
      if (def) {
        const x = iconButton('btn-icon lo-slot-x', b, glyph('xmark'));
        x.title = 'Unequip';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = slots.slice();
          next[i] = null;
          this.save(next);
        });
      }
    }
  }
  renderGrid(byId = this.byId()) {
    this.grid.textContent = '';
    const all = this.data?.items || [];
    const items = this.visibleItems();
    const missing = this.missingDefs();
    if (this.count) this.count.textContent = this.data ? `${tallyText(loadoutTally(all))} found${all.length ? ` · ${all.length} owned` : ''}` : '';
    if (!all.length) el('p', 'gb-empty lo-empty', this.grid, this.busy ? 'Loading your collection...' : this.err || 'No loadout items yet. Bosses and strongboxes can unlock them.');
    if (!all.length && !missing.length) return;
    if (all.length && !items.length && !missing.length) {
      el('p', 'gb-empty lo-empty', this.grid, 'No items match these filters.');
      return;
    }
    for (const owned of items) {
      const def = loadoutDef(owned.catalog);
      if (!def) continue;
      const b = button(`lo-card r${def.rarity}${owned.id === this.selected ? ' on' : ''}`, this.grid);
      const top = el('span', 'lo-card-top', b);
      svgEl('i', 'lo-card-ico', top, glyph(typeIcon(def)));
      el('span', 'lo-card-r', top, LOADOUT_RARITY_NAMES[def.rarity]);
      el('b', '', b, def.name);
      el('small', '', b, `${loadoutTypeName(def.type)} · ${fmtGrant(def)}`);
      b.addEventListener('click', () => {
        this.selected = owned.id;
        this.render();
      });
    }
    const seen = bestiaryView().mask;
    for (const def of missing) {
      const g = silhouette(def, seen);
      const key = `cat:${def.id}`;
      const b = button(`lo-card lo-ghost r${g.rarity}${key === this.selected ? ' on' : ''}`, this.grid);
      b.title = `Not found yet · ${g.source}`;
      const top = el('span', 'lo-card-top', b);
      svgEl('i', 'lo-card-ico', top, glyph(typeIcon(def)));
      el('span', 'lo-card-r', top, LOADOUT_RARITY_NAMES[g.rarity]);
      el('b', '', b, '???');
      el('small', '', b, g.source);
      b.addEventListener('click', () => {
        this.selected = key;
        this.render();
      });
    }
  }
  renderDetail(byId = this.byId()) {
    this.detail.textContent = '';
    this.balance.textContent = `${SKULLS.NAME}: ${priceText(this.data?.balance || 0)}`;
    if (this.err) el('p', 'ac-note bad', this.detail, this.err);
    if (this.selected.startsWith('cat:')) {
      const def = loadoutDef(+this.selected.slice(4));
      if (!def) return;
      const g = silhouette(def, bestiaryView().mask);
      el('h3', '', this.detail, g.name);
      el('p', `lo-meta r${g.rarity}`, this.detail, `${LOADOUT_RARITY_NAMES[g.rarity]} ${loadoutTypeName(g.type)} · not found yet`);
      el('p', 'lo-line', this.detail, `Where to look: ${g.source}`);
      return;
    }
    const owned = byId.get(this.selected);
    const def = owned && loadoutDef(owned.catalog);
    if (!def) return;
    el('h3', '', this.detail, def.name);
    el('p', `lo-meta r${def.rarity}`, this.detail, `${LOADOUT_RARITY_NAMES[def.rarity]} ${loadoutTypeName(def.type)} · ${fmtSource(def)}`);
    el('p', 'lo-flavor', this.detail, def.flavor);
    el('p', 'lo-line', this.detail, `Run start: ${fmtGrant(def)}`);
    const mods = fmtMods(def.mods);
    if (mods) el('p', 'lo-line good', this.detail, mods);
    const effects = fmtEffects(def);
    if (effects) el('p', 'lo-line good', this.detail, effects);
    const slots = this.data?.slots || Array(LOADOUT_SLOTS).fill(null);
    const equipped = slots.indexOf(owned.id);
    const row = el('div', 'lo-actions', this.detail);
    if (equipped >= 0) {
      const b = button('btn btn-ghost', row, `Unequip from slot ${equipped + 1}`);
      b.disabled = this.busy;
      b.addEventListener('click', () => {
        const next = slots.slice();
        next[equipped] = null;
        this.save(next);
      });
    } else {
      for (let i = 0; i < LOADOUT_SLOTS; i++) {
        const b = button(i === 0 ? 'btn btn-blood' : 'btn btn-ghost', row, `Equip ${i + 1}`);
        b.disabled = this.busy;
        b.addEventListener('click', () => {
          const next = slots.map((id) => (id === owned.id ? null : id));
          next[i] = owned.id;
          this.save(next);
        });
      }
    }
  }
  render() {
    const byId = this.byId();
    const visible = this.visibleItems();
    const ghost = this.selected.startsWith('cat:') && this.missingDefs().some((def) => `cat:${def.id}` === this.selected);
    if (this.selected && !ghost && visible.length && !visible.some((it) => it.id === this.selected)) this.selected = visible[0].id;
    if (this.selected && !ghost && !visible.length) this.selected = '';
    this.root.classList.toggle('busy', this.busy);
    const a = accountState();
    this.guest.hidden = !a.ready || !a.accounts || a.offline || !!a.user || !(this.data?.items?.length || this.data?.balance);
    this.renderSlots(byId);
    this.renderGrid(byId);
    this.renderDetail(byId);
  }
}
