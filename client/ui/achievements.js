// Achievements on screen (the list: shared/achievements.js; the record: net/achievements.js; the banner when one
// unlocks: achtoasts.js):
//   AchievementsPanel  the profile page (issue #220, direction A): it opens on the three closest to unlocking, each
//                      lifetime count is one track with a step a tier, then every other achievement by group. Filters
//                      (all / next up / unlocked / locked), a jump to each group and a sort. Locked ones can be
//                      tracked (books.js: on the HUD under the objective). A secret one is "???" until it is unlocked.
//                      A guest's from this browser, an account's from the server, or (show({ friend })) a friend's.
import { el, svgEl, button, reducedMotion } from './dom.js';
import { glyph, achIcon } from './icons.js';
import { Panel } from './panel.js';
import { tabbed } from './screentabs.js';
import { ago, num } from './format.js';
import { ACHIEVEMENTS, ACH_GROUPS, ACH_TIERS, ACH_STATS, achProgress } from '../../shared/achievements.js';
import { achievementsView, onAchievements, refreshAchievements, friendAchievements } from '../net/achievements.js';
import { accountState } from '../net/account.js';
import { TIER_NAME, TIER_RANK, amount, toGo, nextSteps, statLabel, COUNTERS, trackButton, trackable, onTracked } from './books.js';

// ---------------------------------------------------------------- the profile page
const FILTERS = [
  ['all', 'All'],
  ['next', 'Next up'],
  ['got', 'Unlocked'],
  ['locked', 'Locked'],
];
const SORTS = [
  ['got', 'Unlocked first'],
  ['tier', 'By tier'],
  ['newest', 'Newest unlocked'],
  ['book', 'Book order'],
];
const SORT_KEY = 'stn.achSort';

export class AchievementsPanel extends Panel {
  constructor(ui, parent) {
    super(ui, parent, 'ach-panel bk-book', 'Achievements');
    this.friend = null; // { id, name } while showing a friend's
    this.friendRec = null;
    this.friendErr = '';
    this.filter = 'all';
    this.sort = 'got';
    try {
      const s = localStorage.getItem(SORT_KEY);
      if (SORTS.some(([k]) => k === s)) this.sort = s;
    } catch {
      /* no storage */
    }

    // the head: the count and its bar, and each tier's
    const head = this.sub.parentElement;
    const count = el('div', 'bk-count', null);
    head.insertBefore(count, head.lastElementChild);
    const cn = el('div', 'bk-count-n', count);
    this.countN = el('b', '', cn, '0');
    el('span', '', cn, `/ ${ACHIEVEMENTS.length}`);
    this.countBar = el('i', '', el('div', 'bk-count-bar', count));
    this.tierEls = {};
    const tiers = el('div', 'bk-tiers', null);
    head.insertBefore(tiers, head.lastElementChild);
    for (const t of ACH_TIERS) {
      const c = el('span', `bk-tier tier-${t}`, tiers);
      el('i', 'bk-dot', c);
      this.tierEls[t] = el('b', '', c, '0');
      el('span', '', c, TIER_NAME[t]);
    }

    // the bar under it: filters, a jump to each group, the sort (it stays put; only the list scrolls)
    const bar = (this.bar = el('div', 'bk-toolbar', null));
    this.card.insertBefore(bar, this.body);
    const filters = el('div', 'bk-seg', bar);
    filters.setAttribute('role', 'tablist');
    this.filterBtns = {};
    for (const [k, label] of FILTERS) {
      const b = button('bk-seg-b', filters);
      b.setAttribute('role', 'tab');
      el('span', '', b, label);
      const n = el('b', '', b, '');
      b.addEventListener('click', () => this.setFilter(k));
      this.filterBtns[k] = { b, n };
    }
    this.jumps = el('div', 'bk-jumps', bar);
    this.jumpBtns = {};
    for (const [g, title] of ACH_GROUPS) {
      const b = button('bk-jump', this.jumps);
      el('span', '', b, title);
      const n = el('b', '', b, '');
      b.addEventListener('click', () => this.jump(g));
      this.jumpBtns[g] = { b, n };
    }
    const sl = el('label', 'bk-sort', bar);
    el('span', '', sl, 'Sort');
    this.sortSel = el('select', 'bk-select', sl);
    for (const [k, label] of SORTS) {
      const o = el('option', '', this.sortSel, label);
      o.value = k;
    }
    this.sortSel.value = this.sort;
    this.sortSel.addEventListener('change', () => {
      this.sort = this.sortSel.value;
      try {
        localStorage.setItem(SORT_KEY, this.sort);
      } catch {
        /* no storage */
      }
      this.render();
    });

    this.note = el('div', 'ach-note bk-note', this.body);
    this.noteTxt = el('span', '', this.note, '');
    this.signIn = button('btn btn-ghost', this.note);
    svgEl('i', 'btn-ico', this.signIn, glyph('person'));
    el('span', '', this.signIn, 'Sign in');
    this.signIn.addEventListener('click', () => {
      this.hide();
      this.ui.accountPanel.show({ after: this });
    });

    this.wait = el('div', 'gb-empty fr-empty ach-wait', this.body, '');
    this.list = el('div', 'bk-list', this.body);
    this.tabs = tabbed(this, 'achievements'); // (the row of the kit screens' tabs over it, the close in it)

    onAchievements(() => {
      if (this.visible && !this.friend) this.render();
    });
    onTracked(() => this.visible && this.render());
  }

  // (onHide: the game, when [U] opened it mid-run, takes the pointer back however it shuts)
  hide() {
    super.hide();
    this.tabs.hidden();
    this.onHide?.();
  }

  // opts: { friend: { id, name } } for a friend's (a title over it then, not the tabs: they are not theirs)
  show(opts = {}) {
    super.show();
    this.friend = opts.friend || null;
    this.tabs.setTitle(this.friend ? 'Achievements' : '');
    this.tabs.shown();
    this.friendRec = null;
    this.friendErr = '';
    this.filter = 'all';
    this.body.scrollTop = 0;
    if (this.friend) this.loadFriend(this.friend);
    else if (accountState().user) refreshAchievements();
    this.render();
  }

  async loadFriend(f) {
    try {
      const rec = await friendAchievements(f.id);
      if (this.friend !== f) return;
      this.friendRec = rec;
    } catch (err) {
      if (this.friend !== f) return;
      this.friendErr = err.message || 'Could not load their achievements';
    }
    if (this.visible) this.render();
  }

  // -> { stats, unlocked, loading, error, account }
  view() {
    if (!this.friend) return achievementsView();
    if (this.friendRec) return { ...this.friendRec, loading: false, error: '', account: true };
    return { stats: {}, unlocked: {}, loading: !this.friendErr, error: this.friendErr, account: true };
  }

  setFilter(k) {
    if (k === this.filter) return;
    this.filter = k;
    this.ui.sound('ui_click');
    this.render();
    this.body.scrollTop = 0;
  }

  // to a group's section (the progression group is the tracks on "All")
  jump(g) {
    const sec = this.list.querySelector(`[data-group="${g}"]`);
    if (!sec) return;
    const top = this.body.scrollTop + sec.getBoundingClientRect().top - this.body.getBoundingClientRect().top - 4;
    this.body.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  render() {
    const v = this.view();
    const a = accountState();
    this.sub.textContent = this.friend ? this.friend.name : v.account ? 'kept on your account' : 'kept in this browser';
    const waiting = v.loading || !!v.error;
    this.wait.hidden = !waiting;
    this.wait.textContent = v.error || 'Looking up the achievements…';
    this.list.hidden = this.bar.hidden = waiting;
    // a guest, where there are accounts to keep them on
    this.note.hidden = !!this.friend || v.account || !a.accounts || a.offline;
    this.noteTxt.textContent = 'Kept in this browser only. Sign in and they move onto your account, with everything earned here.';
    if (waiting) return;
    this.renderHead(v);
    this.list.textContent = '';
    if (this.filter === 'all') {
      this.renderClosest(v);
      this.renderTracks(v);
      this.renderGroups(v, (x) => x.group !== 'progress');
    } else if (this.filter === 'next') this.renderNext(v);
    else this.renderGroups(v, this.filter === 'got' ? (x) => !!v.unlocked[x.id] : (x) => !v.unlocked[x.id]);
    // the jumps: to the groups this view has
    for (const [g, { b }] of Object.entries(this.jumpBtns)) b.disabled = !this.list.querySelector(`[data-group="${g}"]`);
    this.jumps.hidden = this.filter === 'next';
  }

  renderHead(v) {
    const got = ACHIEVEMENTS.filter((x) => v.unlocked[x.id]);
    this.countN.textContent = num(got.length);
    this.countBar.style.width = `${((got.length / ACHIEVEMENTS.length) * 100).toFixed(1)}%`;
    for (const t of ACH_TIERS) this.tierEls[t].textContent = `${got.filter((x) => x.tier === t).length}/${ACHIEVEMENTS.filter((x) => x.tier === t).length}`;
    const n = { all: ACHIEVEMENTS.length, next: nextSteps(v).length, got: got.length, locked: ACHIEVEMENTS.length - got.length };
    for (const [k, { b, n: nEl }] of Object.entries(this.filterBtns)) {
      nEl.textContent = String(n[k]);
      b.classList.toggle('on', k === this.filter);
      b.setAttribute('aria-selected', String(k === this.filter));
    }
    for (const [g, { n: nEl }] of Object.entries(this.jumpBtns)) {
      const list = ACHIEVEMENTS.filter((x) => x.group === g);
      nEl.textContent = `${list.filter((x) => v.unlocked[x.id]).length}/${list.length}`;
    }
  }

  section(title, note, group) {
    const sec = el('section', 'bk-sec', this.list);
    if (group) sec.dataset.group = group;
    const h = el('div', 'bk-sec-h', sec);
    el('span', '', h, title);
    if (note) el('span', 'bk-sec-note', h, note);
    return sec;
  }

  // "Almost there": the three counters closest to unlocking
  renderClosest(v) {
    const list = nextSteps(v).filter((s) => s.have > 0).slice(0, 3);
    if (!list.length) return;
    const sec = this.section('Almost there', 'Closest to unlocking, from your lifetime counts');
    const row = el('div', 'bk-near', sec);
    for (const s of list) this.nearCard(row, s.a, v);
  }

  nearCard(parent, a, v) {
    const p = achProgress(a, v.stats);
    const c = el('div', `bk-near-c tier-${a.tier}`, parent);
    const top = el('div', 'bk-near-top', c);
    svgEl('i', 'bk-near-ico', top, achIcon(a.icon));
    const t = el('div', 'bk-near-t', top);
    el('b', 'bk-near-name', t, a.name);
    el('span', 'bk-near-desc', t, a.desc);
    const pr = el('div', 'bk-near-prog', c);
    el('i', '', el('div', 'bk-bar', pr)).style.width = `${((p.have / p.goal) * 100).toFixed(1)}%`;
    el('b', 'bk-near-v', pr, `${amount(a, p.have)} / ${amount(a, p.goal)}`);
    const foot = el('div', 'bk-near-foot', c);
    el('span', 'bk-near-go', foot, toGo(a, v.stats));
    el('span', `bk-tierlabel tier-${a.tier}`, foot, TIER_NAME[a.tier]);
    if (!this.friend) trackButton(foot, a, v, this.ui);
  }

  // "Lifetime tracks": one line a count, a step a tier
  renderTracks(v) {
    const g = ACH_GROUPS.find(([k]) => k === 'progress');
    const all = ACHIEVEMENTS.filter((x) => x.group === 'progress');
    const sec = this.section('Lifetime tracks', `${all.filter((x) => v.unlocked[x.id]).length} / ${all.length} steps · one line per count, a step for each tier`, g[0]);
    const grid = el('div', 'bk-tracks', sec);
    for (const k of ACH_STATS) this.track(grid, k, v);
  }

  track(parent, k, v) {
    const steps = COUNTERS[k];
    if (!steps.length) return;
    const have = v.stats[k] || 0;
    const next = steps.find((x) => !v.unlocked[x.id]);
    const r = el('div', 'bk-track', parent);
    const lab = el('div', 'bk-track-l', r);
    svgEl('i', 'bk-track-ico', lab, achIcon(steps[0].icon));
    const lt = el('div', 'bk-track-t', lab);
    el('b', '', lt, statLabel(k));
    el('span', '', lt, `${amount(steps[0], have)}${next ? ` · next ${next.name}` : ' · every step done'}`);
    const line = el('div', 'bk-track-line', r);
    // evenly spaced steps from 0; the fill runs through each segment by how far the count is between its two goals
    const n = steps.length;
    let fill = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const goal = steps[i].goal;
      if (have < goal) {
        fill = (i + Math.max(0, (have - prev) / (goal - prev))) / n;
        break;
      }
      fill = (i + 1) / n;
      prev = goal;
    }
    el('i', 'bk-track-fill', line).style.width = `${(fill * 100).toFixed(1)}%`;
    steps.forEach((s, i) => {
      const got = !!v.unlocked[s.id];
      const st = el('span', `bk-step tier-${s.tier}${got ? ' got' : ''}${s === next ? ' next' : ''}`, line);
      st.style.left = `${(((i + 1) / n) * 100).toFixed(2)}%`;
      st.title = `${s.name} (${TIER_NAME[s.tier]}): ${s.desc}${got ? ' Unlocked.' : ''}`;
      el('i', 'bk-step-d', st);
      el('span', 'bk-step-n', st, s.unit === 'm' ? `${s.goal / 1000} km` : s.goal >= 10000 ? `${s.goal / 1000}k` : num(s.goal));
    });
    if (next && !this.friend) trackButton(r, next, v, this.ui).b.classList.add('bk-pin-sm');
  }

  // "Next up": each count's next step, closest first
  renderNext(v) {
    const list = nextSteps(v);
    const sec = this.section('Next up', 'Each lifetime count’s next step, closest first');
    if (!list.length) return void el('div', 'gb-empty fr-empty', sec, 'Every step of every count is done.');
    const grid = el('div', 'bk-grid', sec);
    for (const s of list) this.achCard(grid, s.a, v);
  }

  renderGroups(v, keep) {
    for (const [g, title] of ACH_GROUPS) {
      const all = ACHIEVEMENTS.filter((x) => x.group === g);
      const list = this.sorted(all.filter(keep), v);
      if (!list.length) continue;
      const got = all.filter((x) => v.unlocked[x.id]).length;
      const sec = this.section(title, `${got} / ${all.length} · ${SORTS.find(([k]) => k === this.sort)[1].toLowerCase()}`, g);
      const grid = el('div', 'bk-grid', sec);
      for (const x of list) this.achCard(grid, x, v);
    }
  }

  sorted(list, v) {
    const book = (x, y) => ACHIEVEMENTS.indexOf(x) - ACHIEVEMENTS.indexOf(y);
    const tier = (x, y) => TIER_RANK[x.tier] - TIER_RANK[y.tier];
    const got = (x) => (v.unlocked[x.id] ? 0 : 1);
    const cmp = {
      got: (x, y) => got(x) - got(y) || tier(x, y) || book(x, y),
      tier: (x, y) => tier(x, y) || book(x, y),
      newest: (x, y) => (v.unlocked[y.id] || 0) - (v.unlocked[x.id] || 0) || book(x, y),
      book,
    }[this.sort];
    return list.slice().sort(cmp);
  }

  achCard(parent, a, v) {
    const at = v.unlocked[a.id];
    const hidden = a.secret && !at;
    const c = el('div', `bk-card tier-${a.tier}${at ? ' got' : ' locked'}${hidden ? ' secret' : ''}`, parent);
    const ico = el('div', 'bk-card-ico', c);
    svgEl('i', '', ico, hidden ? glyph('question') : achIcon(a.icon));
    if (!at) svgEl('i', 'bk-lock', ico, glyph('lock'));
    const body = el('div', 'bk-card-b', c);
    el('b', 'bk-card-name', body, hidden ? '???' : a.name);
    el('p', 'bk-card-desc', body, hidden ? 'A secret. It shows itself when you unlock it.' : a.desc);
    const p = !at && achProgress(a, v.stats);
    if (p) {
      const row = el('div', 'bk-card-prog', body);
      el('i', '', el('div', 'bk-bar', row)).style.width = `${((p.have / p.goal) * 100).toFixed(1)}%`;
      el('span', '', row, `${amount(a, p.have)} / ${amount(a, p.goal)}`);
    }
    const foot = el('div', 'bk-card-foot', body);
    el('span', `bk-tierlabel tier-${a.tier}`, foot, TIER_NAME[a.tier]);
    if (at) {
      const w = when(at);
      el('span', 'bk-when', foot, w ? `Unlocked ${w}` : 'Unlocked');
    } else if (!this.friend && trackable(a, v)) trackButton(foot, a, v, this.ui);
  }
}

// when it was unlocked, in a few words ('' for a time we do not know: one carried over from before times were kept)
function when(t) {
  if (!(t > 1)) return '';
  const s = (Date.now() - t) / 1000;
  return s < 86400 * 2 ? ago(t) : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
