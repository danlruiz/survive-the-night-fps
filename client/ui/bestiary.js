// The bestiary [J]: every kind of the dead (shared/bestiary.js), a card each with a portrait, the name, its danger and
// how to beat it at a glance (books.js kindFacts: worked out from its numbers in ZOMBIE_DEFS). A kind never seen is a
// dark smudge of a portrait, "???" and a vague line; once seen (net/bestiary.js) the portrait clears and the card gets
// its chips. Clicking a seen card opens its page: the portrait, the danger, "beat it" and "watch for", five facts and
// the full tip. Above the cards, "Coming for you": the kinds not seen yet, by the night they can first come. Filters
// (all / seen / not yet seen) and a sort. The frame fits the screen and only the list scrolls (issue #220). Opened by
// its key and from the pause menu; the cross, its key, Esc or a click outside the frame closes it (the game sets
// onClose); Esc on a page goes back to the cards.
//
// The portraits are the game's own models (models/characters.js createZombie), drawn by a small WebGL renderer of its
// own the first time the book opens (or the pause menu's field notes ask: warm()), kept as images, and the renderer
// let go of again (ui/portrait.js, which Dead Hand's cards draw their dead with too). A locked card is only given the
// smudge: no clear portrait of a kind not seen is put in the page.
import { ZOMBIE_DEFS } from '../../shared/defs.js';
import { BESTIARY, BESTIARY_GROUPS, SEEN_RANGE, bit, seenCount } from '../../shared/bestiary.js';
import { pics, drawPortraits } from './portrait.js';
import { el, svgEl } from './dom.js';
import { glyph } from './icons.js';
import { bindLabel, liveText } from '../game/binds.js';
import { bestiaryView, onBestiary, onSeen } from '../net/bestiary.js';
import { GROUP_TAG, kindFacts, dangerOf, firstNight, byFirstNight, dangerPips, chips } from './books.js';

// ---------------------------------------------------------------- the book
const FILTERS = [
  ['all', 'All'],
  ['seen', 'Seen'],
  ['unseen', 'Not yet seen'],
];
const SORTS = [
  ['book', 'Book order'],
  ['danger', 'Most dangerous'],
  ['night', 'First night'],
];
const COMING = 3; // "Coming for you": how many

export class Bestiary {
  constructor(ui, parent) {
    this.ui = ui;
    this.open = false;
    this.onClose = null; // the game's: the cross, the key, Esc, a click outside
    this.filter = 'all';
    this.sort = 'book';
    this.fresh = new Set(); // kinds first seen since the book was last looked at: "New" on their cards
    this.pageT = -1; // the kind whose page is open (-1: the cards)

    this.root = el('div', 'bstscr', parent);
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Bestiary');
    const bg = el('div', 'map-bg', this.root);
    const frame = (this.frame = el('div', 'bst-frame bk-book paper', this.root));
    const head = el('div', 'bk-head', frame);
    const ht = el('div', 'bk-head-t', head);
    el('h2', 'bk-title', ht, 'Bestiary');
    this.kept = el('span', 'bk-sub', ht, '');
    const count = el('div', 'bk-count', head);
    const cn = el('div', 'bk-count-n', count);
    this.countN = el('b', '', cn, '0');
    el('span', '', cn, `/ ${BESTIARY.length} seen`);
    this.countBar = el('i', '', el('div', 'bk-count-bar', count));
    const groups = el('div', 'bk-tiers', head);
    this.groupNs = new Map(); // group -> its "n / m"
    for (const [g, title] of BESTIARY_GROUPS) {
      const c = el('span', `bk-tier grp-${g}`, groups);
      el('i', 'bk-dot', c);
      this.groupNs.set(g, [el('b', '', c, ''), BESTIARY.filter((e) => e.group === g)]);
      el('span', '', c, title);
    }
    const close = (this.close = svgEl('button', 'set-close btn-icon map-close', head, glyph('xmark')));
    close.type = 'button';
    close.setAttribute('aria-label', 'Close bestiary');
    liveText(close, () => `Close (${bindLabel('bestiary')})`, 'title');
    close.addEventListener('click', () => this.onClose?.());
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (this.pageT >= 0) {
        e.stopPropagation(); // (back to the cards, and no further)
        this.closePage();
      } else this.onClose?.();
    });
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target === bg || e.target === this.root)) this.onClose?.();
    });

    const bar = el('div', 'bk-toolbar', frame);
    const seg = el('div', 'bk-seg', bar);
    seg.setAttribute('role', 'tablist');
    this.filterBtns = {};
    for (const [k, label] of FILTERS) {
      const b = el('button', 'bk-seg-b', seg);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      el('span', '', b, label);
      const n = el('b', '', b, '');
      b.addEventListener('click', () => {
        if (this.filter === k) return;
        this.filter = k;
        this.ui.sound('ui_click');
        this.render();
        this.body.scrollTop = 0;
      });
      this.filterBtns[k] = { b, n };
    }
    el('p', 'bk-rule', bar, `A page fills in once you have seen one: within ${SEEN_RANGE} m, in plain sight.`);
    const sl = el('label', 'bk-sort', bar);
    el('span', '', sl, 'Sort');
    this.sortSel = el('select', 'bk-select', sl);
    for (const [k, label] of SORTS) el('option', '', this.sortSel, label).value = k;
    this.sortSel.addEventListener('change', () => {
      this.sort = this.sortSel.value;
      this.render();
    });

    const wrap = el('div', 'bk-bodywrap', frame);
    this.body = el('div', 'bst-body bk-body', wrap);
    // the coming ones
    this.comingSec = el('section', 'bk-sec', this.body);
    const ch = el('div', 'bk-sec-h', this.comingSec);
    el('span', '', ch, 'Coming for you');
    el('span', 'bk-sec-note', ch, 'Not seen yet, by the night they can first come');
    this.coming = el('div', 'bk-coming', this.comingSec);
    // every kind
    const sec = el('section', 'bk-sec', this.body);
    const eh = el('div', 'bk-sec-h', sec);
    el('span', '', eh, 'Every kind');
    el('span', 'bk-sec-note', eh, 'How to beat each at a glance, once seen. Click one for its page');
    this.grid = el('div', 'bst-grid bk-kinds', sec);
    this.cards = new Map(); // ztype -> { card, img, name, tag, meta, text }
    for (const e of BESTIARY) {
      const card = el('button', `bst-card bk-kind locked grp-${e.group}`, this.grid);
      card.type = 'button';
      card.addEventListener('click', () => this.openPage(e.t));
      const pic = el('div', 'bst-pic', card);
      const img = el('img', '', pic);
      img.alt = '';
      img.hidden = true;
      svgEl('i', 'bst-lock', pic, glyph('question'));
      const isNew = el('span', 'bk-new', pic, 'New');
      const b = el('div', 'bst-card-b', card);
      const top = el('div', 'bst-card-top', b);
      const name = el('b', 'bst-name', top, '???');
      el('span', `bst-tag tag-${e.group}`, top, GROUP_TAG[e.group]);
      const meta = el('div', 'bk-kind-meta', b);
      const text = el('p', 'bst-text', b, '');
      this.cards.set(e.t, { card, img, name, meta, text, isNew });
    }
    // a kind's page, over the cards
    this.page = el('div', 'bk-page', wrap);
    this.page.hidden = true;

    const foot = el('div', 'map-keys bst-keys', frame);
    for (const [k, t] of [
      [() => bindLabel('bestiary'), 'close'],
      ['Esc', 'back / close'],
    ]) {
      const s = el('span', 'gh', foot);
      if (typeof k === 'function') liveText(el('span', 'kbd sm', s), k);
      else el('span', 'kbd sm', s, k);
      el('span', '', s, t);
    }

    onBestiary(() => this.open && this.render());
    onSeen((list) => {
      for (const e of list) this.fresh.add(e.t);
    });
  }

  setOpen(open) {
    open = !!open;
    if (open === this.open) return;
    this.open = open;
    this.root.hidden = !open;
    this.ui.root.classList.toggle('bestiary-open', open);
    if (open) {
      this.closePage(false);
      this.render();
      this.body.scrollTop = 0;
      this.returnFocus = document.activeElement;
      this.close.focus({ preventScroll: true });
      this.warm();
    } else {
      this.fresh.clear(); // (looked at: no longer new)
      if (this.returnFocus?.isConnected && !this.returnFocus.closest?.('[hidden]')) {
        this.returnFocus.focus({ preventScroll: true });
        this.returnFocus = null;
      }
    }
  }

  // draws the portraits if they are not drawn yet (each one shows as it comes)
  warm() {
    return drawPortraits((t) => {
      if (this.open) this.renderPic(t);
      if (this.pageT === t) this.renderPage();
    })
      .then(() => this.open && this.render()) // (the smudges in "Coming for you")
      .catch((err) => console.error('bestiary: portraits failed', err));
  }

  // a kind's portrait as drawn so far ('' if not yet): the clear one only once it has been seen
  portrait(t, seen) {
    return pics.get(t)?.[seen ? 'clear' : 'dark'] || '';
  }

  render() {
    const v = (this.view = bestiaryView());
    const n = seenCount(v.mask);
    this.countN.textContent = v.loading ? '…' : String(n);
    this.countBar.style.width = `${((n / BESTIARY.length) * 100).toFixed(1)}%`;
    this.kept.textContent = `${v.account ? 'kept on your account' : 'kept in this browser'} · opened with ${bindLabel('bestiary')}`;
    for (const [, [nEl, list]] of this.groupNs) nEl.textContent = `${list.filter((e) => v.mask & bit(e.t)).length}/${list.length}`;
    const counts = { all: BESTIARY.length, seen: n, unseen: BESTIARY.length - n };
    for (const [k, { b, n: nEl }] of Object.entries(this.filterBtns)) {
      nEl.textContent = String(counts[k]);
      b.classList.toggle('on', k === this.filter);
      b.setAttribute('aria-selected', String(k === this.filter));
    }
    this.sortSel.value = this.sort;

    // coming for you: the next unseen kinds by first night
    const unseen = BESTIARY.filter((e) => !(v.mask & bit(e.t)));
    this.comingSec.hidden = this.filter === 'seen' || !unseen.length;
    this.coming.textContent = '';
    for (const e of byFirstNight(unseen).slice(0, COMING)) {
      const c = el('div', `bk-come grp-${e.group}`, this.coming);
      const pic = el('div', 'bk-come-pic', c);
      const src = pics.get(e.t)?.dark;
      if (src) el('img', '', pic).src = src;
      svgEl('i', 'bk-come-q', pic, glyph('question'));
      const t = el('div', 'bk-come-t', c);
      el('b', '', t, '???');
      el('p', '', t, e.vague);
      el('span', 'bk-come-when', t, firstNight(e.t)[1]);
    }

    // the cards: filtered, sorted (the grid's order is the elements' order)
    const order = {
      book: BESTIARY,
      danger: BESTIARY.slice().sort((a, b) => dangerOf(b.t) - dangerOf(a.t) || BESTIARY.indexOf(a) - BESTIARY.indexOf(b)),
      night: byFirstNight(BESTIARY),
    }[this.sort];
    for (const e of order) {
      const c = this.cards.get(e.t);
      const seen = !!(v.mask & bit(e.t));
      c.card.hidden = (this.filter === 'seen' && !seen) || (this.filter === 'unseen' && seen);
      this.grid.appendChild(c.card);
      c.card.classList.toggle('locked', !seen);
      c.card.classList.toggle('seen', seen);
      c.card.disabled = !seen;
      c.card.setAttribute('aria-label', seen ? `${e.name}: open its page` : `Not seen yet: ${e.vague}`);
      c.isNew.hidden = !(seen && this.fresh.has(e.t));
      c.name.textContent = seen ? e.name : '???';
      c.meta.textContent = '';
      if (seen) {
        const f = kindFacts(e.t);
        dangerPips(c.meta, f.danger);
        chips(c.meta, f.beat, 'beat', 2);
        c.text.textContent = '';
        c.text.hidden = true;
      } else {
        c.text.hidden = false;
        c.text.textContent = e.vague;
        el('span', 'bk-kind-when', c.meta, firstNight(e.t)[1]);
      }
      this.renderPic(e.t);
    }
    if (this.pageT >= 0) this.renderPage();
  }

  renderPic(t) {
    const c = this.cards.get(t);
    const seen = !!(this.view?.mask & bit(t));
    const src = this.portrait(t, seen);
    if (c.img.getAttribute('src') !== src) {
      if (src) c.img.src = src;
      else c.img.removeAttribute('src');
    }
    c.img.hidden = !src;
  }

  // a seen kind's page (from a card, or from the pause menu's field notes)
  openPage(t) {
    const v = this.view || bestiaryView();
    if (!(v.mask & bit(t))) return;
    this.pageT = t;
    this.page.hidden = false;
    this.body.inert = true;
    this.renderPage();
    this.ui.sound?.('ui_click');
    this.page.querySelector('.bk-page-back')?.focus({ preventScroll: true });
  }

  closePage(focus = true) {
    if (this.pageT < 0) return;
    const t = this.pageT;
    this.pageT = -1;
    this.page.hidden = true;
    this.body.inert = false;
    if (focus) this.cards.get(t)?.card.focus({ preventScroll: true });
  }

  renderPage() {
    const t = this.pageT;
    const e = BESTIARY.find((x) => x.t === t);
    const d = ZOMBIE_DEFS[t];
    const f = kindFacts(t);
    const p = this.page;
    p.textContent = '';
    p.className = `bk-page grp-${e.group}`;
    const back = el('button', 'bk-page-back btn btn-ghost', p);
    back.type = 'button';
    svgEl('i', 'btn-ico', back, glyph('arrowLeft'));
    el('span', '', back, 'Every kind');
    back.addEventListener('click', () => this.closePage());
    const grid = el('div', 'bk-page-grid', p);
    const pic = el('div', 'bk-page-pic', grid);
    const src = this.portrait(t, true);
    if (src) el('img', '', pic).src = src;
    const info = el('div', 'bk-page-info', grid);
    const top = el('div', 'bk-page-top', info);
    el('h3', 'bk-page-name', top, d.name);
    el('span', `bst-tag tag-${e.group}`, top, GROUP_TAG[e.group]);
    const dg = el('div', 'bk-page-danger', info);
    el('span', 'bk-k', dg, 'Danger');
    dangerPips(dg, f.danger, 'lg');
    el('span', 'bk-k', info, 'Beat it');
    chips(info, f.beat, 'beat');
    if (f.watch.length) {
      el('span', 'bk-k', info, 'Watch for');
      chips(info, f.watch, 'watch');
    }
    el('p', 'bk-page-tip', info, e.tip);
    const facts = el('dl', 'bk-facts', info);
    for (const [k, val] of [...f.facts, ['First night', f.first[1]]]) {
      const r = el('div', '', facts);
      el('dt', '', r, k);
      el('dd', '', r, val);
    }
  }
}
