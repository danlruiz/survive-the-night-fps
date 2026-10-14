// The auction house panel: loadout items listed by players for Zombie Skulls, buying one, and your own listings.
// The items' words are in loadoutinfo.js; the service is client/net/loadout.js.
import { LOADOUT_RARITY_NAMES, LOADOUT_TYPES, loadoutDef } from '../../shared/loadout.js';
import { AUCTION, SKULLS, sellerProceeds } from '../../shared/economy.js';
import { el, button } from './dom.js';
import { Panel } from './panel.js';
import { buyAuctionListing, cancelAuctionListing, fetchAuction, fetchLoadout, listAuctionItem } from '../net/loadout.js';
import { fmtGrant, fmtMods, cleanData, priceText, listingTime } from './loadoutinfo.js';

export class AuctionPanel extends Panel {
  constructor(ui, parent) {
    super(ui, parent, 'ah-panel', 'Auction House');
    this.data = null;
    this.loadout = null;
    this.selected = '';
    this.busy = false;
    this.err = '';
    this.filter = { q: '', type: '', rarity: 0, max: 0 };
    this.root.classList.add('auction-panel');
    this.sub.textContent = 'Buy-now listings · account trading only';

    this.balance = el('div', 'ah-balance', this.body);
    this.note = el('p', 'ac-note ah-note', this.body, 'Earn Zombie Skulls by surviving nights, killing bosses, and escaping. Guests keep earnings, but buying and selling requires signing in.');
    const controls = el('div', 'ah-controls', this.body);
    this.search = el('input', 'ah-search', controls);
    this.search.type = 'search';
    this.search.placeholder = 'Search listings';
    this.search.addEventListener('input', () => {
      this.filter.q = this.search.value.trim().toLowerCase();
      this.renderListings();
    });
    this.type = el('select', 'ah-select', controls);
    this.type.append(new Option('All types', ''));
    for (const v of Object.values(LOADOUT_TYPES)) this.type.append(new Option(v[0].toUpperCase() + v.slice(1), v));
    this.type.addEventListener('change', () => {
      this.filter.type = this.type.value;
      this.renderListings();
    });
    this.rarity = el('select', 'ah-select', controls);
    this.rarity.append(new Option('All rarities', '0'));
    for (const [k, v] of Object.entries(LOADOUT_RARITY_NAMES)) this.rarity.append(new Option(v, k));
    this.rarity.addEventListener('change', () => {
      this.filter.rarity = this.rarity.value | 0;
      this.renderListings();
    });
    this.max = el('input', 'ah-price', controls);
    this.max.type = 'number';
    this.max.min = '0';
    this.max.placeholder = 'Max price';
    this.max.addEventListener('input', () => {
      this.filter.max = Math.max(0, this.max.value | 0);
      this.renderListings();
    });

    this.main = el('div', 'ah-main', this.body);
    this.listings = el('div', 'ah-listings', this.main);
    this.detail = el('div', 'ah-detail', this.main);
    this.sell = el('div', 'ah-sell', this.body);
    this.mine = el('div', 'ah-mine', this.body);

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
      const [auction, loadout] = await Promise.all([fetchAuction(), fetchLoadout()]);
      this.data = {
        balance: Math.max(0, auction?.balance | 0),
        canTrade: auction?.canTrade === true,
        listings: Array.isArray(auction?.listings) ? auction.listings : [],
        mine: Array.isArray(auction?.mine) ? auction.mine : [],
      };
      this.loadout = cleanData(loadout);
      if (!this.selected || !this.data.listings.some((l) => l.id === this.selected)) this.selected = this.data.listings[0]?.id || '';
    } catch (err) {
      this.err = err.message || 'Could not load the auction house';
    }
    this.busy = false;
    this.render();
  }
  visibleListings() {
    const q = this.filter.q;
    return (this.data?.listings || []).filter((l) => {
      const def = loadoutDef(l.catalog);
      if (!def) return false;
      if (q && !`${def.name} ${def.type} ${LOADOUT_RARITY_NAMES[def.rarity]}`.toLowerCase().includes(q)) return false;
      if (this.filter.type && def.type !== this.filter.type) return false;
      if (this.filter.rarity && def.rarity !== this.filter.rarity) return false;
      if (this.filter.max && l.price > this.filter.max) return false;
      return true;
    });
  }
  async buy(id) {
    if (this.busy) return;
    this.busy = true;
    this.err = '';
    this.render();
    try {
      await buyAuctionListing(id);
      await this.refresh();
    } catch (err) {
      this.err = err.message || 'That purchase failed';
      this.busy = false;
      this.render();
    }
  }
  async cancel(id) {
    if (this.busy) return;
    this.busy = true;
    this.err = '';
    this.render();
    try {
      await cancelAuctionListing(id);
      await this.refresh();
    } catch (err) {
      this.err = err.message || 'That cancellation failed';
      this.busy = false;
      this.render();
    }
  }
  async list(itemId, price) {
    if (this.busy) return;
    this.busy = true;
    this.err = '';
    this.render();
    try {
      await listAuctionItem(itemId, price);
      await this.refresh();
    } catch (err) {
      this.err = err.message || 'That listing failed';
      this.busy = false;
      this.render();
    }
  }
  renderListings() {
    this.listings.textContent = '';
    const rows = this.visibleListings();
    if (!rows.length) {
      el('p', 'gb-empty', this.listings, this.busy ? 'Loading listings...' : 'No listings match.');
      this.renderDetail();
      return;
    }
    const mineIds = new Set((this.data?.mine || []).filter((l) => l.status === 'active').map((l) => l.id));
    for (const l of rows) {
      const def = loadoutDef(l.catalog);
      const b = button(`ah-card r${def.rarity}${l.id === this.selected ? ' on' : ''}`, this.listings);
      el('span', 'ah-card-r', b, LOADOUT_RARITY_NAMES[def.rarity]);
      el('b', '', b, def.name);
      el('small', '', b, `${def.type} · ${priceText(l.price)} · ${listingTime(l.expiresAt)}${mineIds.has(l.id) ? ' · yours' : ''}`);
      b.addEventListener('click', () => {
        this.selected = l.id;
        this.renderDetail();
        this.renderListings();
      });
    }
    this.renderDetail();
  }
  renderDetail() {
    this.detail.textContent = '';
    if (this.err) el('p', 'ac-note bad', this.detail, this.err);
    const l = (this.data?.listings || []).find((x) => x.id === this.selected);
    const def = l && loadoutDef(l.catalog);
    if (!def) return;
    const mineIds = new Set((this.data?.mine || []).filter((x) => x.status === 'active').map((x) => x.id));
    el('h3', '', this.detail, def.name);
    el('p', 'lo-meta', this.detail, `${LOADOUT_RARITY_NAMES[def.rarity]} ${def.type}`);
    el('p', 'lo-flavor', this.detail, def.flavor);
    el('p', 'lo-line', this.detail, `Run start: ${fmtGrant(def)}`);
    const mods = fmtMods(def.mods);
    if (mods) el('p', 'lo-line good', this.detail, mods);
    el('p', 'ah-price-line', this.detail, `${priceText(l.price)} · seller receives ${priceText(sellerProceeds(l.price))}`);
    el('p', 'ac-note', this.detail, `Expires: ${listingTime(l.expiresAt)}`);
    const row = el('div', 'lo-actions', this.detail);
    if (mineIds.has(l.id)) {
      const c = button('btn btn-ghost', row, 'Cancel listing');
      c.disabled = this.busy;
      c.addEventListener('click', () => this.cancel(l.id));
    } else {
      const b = button('btn btn-blood', row, 'Buy now');
      b.disabled = this.busy || !this.data?.canTrade || (this.data?.balance || 0) < l.price;
      b.title = !this.data?.canTrade ? 'Sign in to buy' : (this.data?.balance || 0) < l.price ? 'Not enough Zombie Skulls' : '';
      b.addEventListener('click', () => this.buy(l.id));
    }
  }
  renderSell() {
    this.sell.textContent = '';
    el('h3', '', this.sell, 'Sell an item');
    if (!this.data?.canTrade) {
      el('p', 'ac-note', this.sell, 'Guests can earn Zombie Skulls and browse listings. Sign in to list or buy items.');
      return;
    }
    const items = this.loadout?.items || [];
    if (!items.length) {
      el('p', 'ac-note', this.sell, 'No unlisted loadout items available to sell.');
      return;
    }
    const form = el('form', 'ah-sell-form', this.sell);
    const pick = el('select', 'ah-select', form);
    for (const it of items) {
      const def = loadoutDef(it.catalog);
      if (def) pick.append(new Option(`${def.name} (${LOADOUT_RARITY_NAMES[def.rarity]})`, it.id));
    }
    const price = el('input', 'ah-price', form);
    price.type = 'number';
    price.min = String(AUCTION.PRICE_MIN);
    price.max = String(AUCTION.PRICE_MAX);
    price.value = '50';
    const b = el('button', 'btn btn-blood', form, 'List');
    b.type = 'submit';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.list(pick.value, price.value | 0);
    });
  }
  renderMine() {
    this.mine.textContent = '';
    el('h3', '', this.mine, 'Your listings');
    const mine = this.data?.mine || [];
    if (!mine.length) return void el('p', 'ac-note', this.mine, 'Nothing listed yet.');
    for (const l of mine.slice(0, 8)) {
      const def = loadoutDef(l.catalog);
      const r = el('div', 'ah-mine-row', this.mine);
      el('b', '', r, def?.name || 'Loadout item');
      el('span', '', r, `${priceText(l.price)} · ${l.status}${l.status === 'active' ? ` · ${listingTime(l.expiresAt)}` : ''}`);
      if (l.status === 'active') {
        const c = button('btn btn-ghost', r, 'Cancel');
        c.disabled = this.busy;
        c.addEventListener('click', () => this.cancel(l.id));
      }
    }
  }
  render() {
    this.root.classList.toggle('busy', this.busy);
    this.balance.textContent = `${SKULLS.NAME}: ${priceText(this.data?.balance || this.loadout?.balance || 0)}`;
    this.renderListings();
    this.renderSell();
    this.renderMine();
  }
}

