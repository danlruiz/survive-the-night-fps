// The pledge window's panel (server/pledge.js, shared/pledge.js): as a run begins, chip Zombie Skulls into the group
// offers, buy personal ones, then confirm or skip. It opens by itself when a run's window opens and shuts when the
// window does; Esc puts it away and the Pledge key [O] brings it back while the window is still open.
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';
import { SKULLS } from '../../shared/economy.js';
import { PLEDGE, GROUP_OFFERS, OWN_OFFERS, pledgeOffer } from '../../shared/pledge.js';

export class PledgePanel {
  // onSend(data): a pick, as C2S.PLEDGE takes it; onClose(): put away (the game hands the pointer back)
  constructor(ui, parent, { onSend = null, onClose = null } = {}) {
    this.ui = ui;
    this.onSend = onSend;
    this.onClose = onClose;
    this.view = { open: false };
    this.names = () => new Map();
    this.at = 0;
    this.timer = 0;

    const root = (this.root = el('div', 'pdg', parent));
    root.hidden = true;
    const card = el('div', 'pdg-card', root);
    const head = el('div', 'pdg-head', card);
    const title = el('div', 'pdg-title', head);
    el('b', '', title, 'Pledge before the night');
    this.sub = el('span', 'pdg-sub', title, '');
    this.clock = el('div', 'pdg-clock', head, '');
    const x = el('button', 'btn-icon set-close', head);
    x.type = 'button';
    x.title = 'Put away (Esc)';
    svgEl('i', '', x, glyph('xmark'));
    x.addEventListener('click', () => this.onClose?.());

    this.wallet = el('div', 'pdg-wallet', card);

    el('div', 'pdg-h', card, 'For the whole group');
    el('p', 'pdg-note', card, 'Chip in together. When a pool is full at the close everybody gets it and each pays only their share. A pool that is not full costs nobody anything.');
    this.groupList = el('div', 'pdg-list', card);
    this.groupRows = new Map();
    for (const o of GROUP_OFFERS) this.groupRows.set(o.id, this.groupRow(o));

    el('div', 'pdg-h', card, 'Just for you');
    this.ownList = el('div', 'pdg-list', card);
    this.ownRows = new Map();
    for (const o of OWN_OFFERS) this.ownRows.set(o.id, this.ownRow(o));

    this.who = el('div', 'pdg-who', card);
    const foot = el('div', 'pdg-foot', card);
    this.note = el('small', 'pdg-foot-note', foot, '');
    const skip = (this.skipBtn = el('button', 'btn', foot, 'Skip'));
    skip.type = 'button';
    skip.title = 'Start without pledging anything';
    skip.addEventListener('click', () => this.onSend?.({ op: 'skip' }));
    const go = (this.goBtn = el('button', 'btn btn-blood', foot, 'Confirm'));
    go.type = 'button';
    go.addEventListener('click', () => this.onSend?.({ op: 'confirm' }));
  }

  groupRow(o) {
    const row = el('div', 'pdg-row', this.groupList);
    svgEl('i', 'pdg-ic', row, glyph(o.icon));
    const txt = el('div', 'pdg-txt', row);
    el('b', '', txt, o.name);
    el('span', '', txt, o.desc);
    const bar = el('div', 'pdg-bar', txt);
    const fill = el('i', '', bar);
    const pooled = el('small', 'pdg-pooled', txt, '');
    const ctl = el('div', 'pdg-ctl', row);
    const less = el('button', 'btn pdg-step', ctl, `-${PLEDGE.STEP}`);
    const mine = el('span', 'pdg-mine', ctl, '0');
    const more = el('button', 'btn pdg-step', ctl, `+${PLEDGE.STEP}`);
    less.type = more.type = 'button';
    const set = (d) => {
      const g = this.view.group?.find(([id]) => id === o.id);
      this.onSend?.({ op: 'pledge', offer: o.id, amount: Math.max(0, (g?.[2] || 0) + d) });
    };
    less.addEventListener('click', () => set(-PLEDGE.STEP));
    more.addEventListener('click', () => set(PLEDGE.STEP));
    const rest = el('button', 'btn pdg-rest', ctl, 'Fill');
    rest.type = 'button';
    rest.title = 'Pledge whatever the pool still needs';
    rest.addEventListener('click', () => {
      const g = this.view.group?.find(([id]) => id === o.id);
      this.onSend?.({ op: 'pledge', offer: o.id, amount: (g?.[2] || 0) + (o.price - (g?.[1] || 0)) });
    });
    return { row, fill, pooled, mine, less, more, rest };
  }

  ownRow(o) {
    const row = el('label', 'pdg-row pdg-own', this.ownList);
    const box = el('input', '', row);
    box.type = 'checkbox';
    svgEl('i', 'pdg-ic', row, glyph(o.icon));
    const txt = el('div', 'pdg-txt', row);
    el('b', '', txt, o.name);
    el('span', '', txt, o.desc);
    el('span', 'pdg-price', row, `${o.price}`);
    box.addEventListener('change', () => this.onSend?.({ op: 'buy', offer: o.id, on: box.checked }));
    return { row, box };
  }

  get open() {
    return !this.root.hidden;
  }

  setOpen(open) {
    this.root.hidden = !open;
    clearInterval(this.timer);
    if (open) this.timer = setInterval(() => this.tickClock(), 250);
    this.render();
  }

  set(view) {
    this.view = view && typeof view === 'object' ? view : { open: false };
    this.at = performance.now();
    if (this.open) this.render();
  }

  tickClock() {
    const left = Math.max(0, (this.view.left || 0) - (performance.now() - this.at) / 1000);
    this.clock.textContent = `${Math.ceil(left)}s`;
    this.clock.classList.toggle('pdg-late', left <= 10);
  }

  render() {
    const v = this.view;
    if (!v.open) return;
    this.tickClock();
    const balance = v.balance | 0;
    const free = Math.max(0, balance - (v.spend | 0));
    this.wallet.textContent = '';
    svgEl('i', '', this.wallet, glyph(SKULLS.ICON));
    el('b', '', this.wallet, `${free}`);
    el('span', '', this.wallet, ` of ${balance} ${SKULLS.NAME} free`);
    this.sub.textContent = v.kept ? 'Spend Skulls on what the run starts with' : 'Play with a browser id or an account to earn and spend Skulls';
    for (const [id, pooled, mine] of v.group || []) {
      const o = pledgeOffer(id);
      const r = this.groupRows.get(id);
      if (!o || !r) continue;
      r.fill.style.width = `${Math.min(100, (pooled / o.price) * 100)}%`;
      r.pooled.textContent = pooled >= o.price ? `Full: ${o.price} of ${o.price}` : `${pooled} of ${o.price} pledged`;
      r.row.classList.toggle('pdg-full', pooled >= o.price);
      r.mine.textContent = `${mine}`;
      r.less.disabled = mine <= 0;
      r.more.disabled = r.rest.disabled = pooled >= o.price || free <= 0;
    }
    const own = new Set(v.own || []);
    for (const [id, r] of this.ownRows) {
      const o = pledgeOffer(id);
      r.box.checked = own.has(id);
      r.box.disabled = !own.has(id) && o.price > free;
      r.row.classList.toggle('pdg-off', r.box.disabled);
    }
    const names = this.names();
    this.who.textContent = '';
    for (const [pid, done, spends] of v.players || []) {
      const chip = el('span', `pdg-chip${done ? ' pdg-chip-done' : ''}`, this.who, names.get(pid) || `#${pid}`);
      chip.title = done === 'confirm' ? 'Confirmed' : done === 'skip' ? 'Skipped' : spends ? 'Still picking' : 'No Skulls to spend';
      if (done) svgEl('i', '', chip, glyph(done === 'confirm' ? 'check' : 'arrowRight'));
    }
    this.goBtn.textContent = v.done === 'confirm' ? 'Confirmed' : 'Confirm';
    this.goBtn.disabled = v.done === 'confirm';
    this.note.textContent = v.done ? 'Waiting for the others. Change a pick to un-confirm.' : 'Nothing is paid until the window closes.';
  }
}
