// The two books (the achievements page and the bestiary) and what they put in play (issue #220):
//   - what the bestiary says of a kind at a glance, worked out from its numbers (shared/defs.js ZOMBIE_DEFS): a danger
//     level, the facts (health, blow, pace against yours, reach, what it does to walls), "beat it" and "watch for" chips
//     and the first night it can come
//   - the counters closest to unlocking, and each lifetime count's next step
//   - up to three achievements tracked (a list kept in this browser), shown on the HUD under the objective (AchTracker)
//     and in the pause menu's field notes (FieldNotes: what is out tonight, tonight's boss, the tracked ones)
// The look of both books and of these lives in ux-books.css, imported here.
import './ux-books.css';
import { ZTYPE, ZOMBIE_DEFS } from '../../shared/defs.js';
import { WALK_SPEED, SPRINT_SPEED, LEG_HP, PHASE } from '../../shared/constants.js';
import { BESTIARY, bit, seenCount } from '../../shared/bestiary.js';
import { ACHIEVEMENTS, ACH_BY_ID, ACH_STATS, achProgress } from '../../shared/achievements.js';
import { BOSS_POOL, FIRST_BOSS, nightBoss, nightTheme } from '../../shared/nights.js';
import { nightRank } from '../../shared/acts.js';
import { el, svgEl } from './dom.js';
import { glyph, achIcon } from './icons.js';
import { achievementsView, onAchievements, refreshAchievements } from '../net/achievements.js';
import { bestiaryView, onBestiary } from '../net/bestiary.js';
import { accountState } from '../net/account.js';
import { bindLabel } from '../game/binds.js';

export const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };
export const TIER_RANK = { bronze: 0, silver: 1, gold: 2, platinum: 3 };
export const GROUP_TAG = { horde: 'Horde', special: 'Special', boss: 'Boss' };
export const num = (n) => (n | 0).toLocaleString('en-US');
export const km = (m) => `${(m >= 10000 ? Math.floor(m / 1000) : Math.floor(m / 100) / 10).toLocaleString('en-US')} km`;
export const amount = (a, n) => (a.unit === 'm' ? km(n) : num(n));

// ---------------------------------------------------------------- the bestiary at a glance
const WALKER = ZOMBIE_DEFS[ZTYPE.WALKER];
const blow = (d) => d.dmg || d.blastDmg || 0; // (a boomer's one blow is its burst)
const threat = (d) => (d.hp * blow(d)) / d.rate;
// Danger 1-5: its health times the damage it deals a second, against a walker's, on a log scale (each step is about
// three times the last). A walker, a runner or a dog is 1; a shade or the Brute 3; the Abomination and the Hive Queen 5
export function dangerOf(t) {
  const d = ZOMBIE_DEFS[t];
  const r = threat(d) / threat(WALKER);
  return Math.max(1, Math.min(5, Math.round(1 + Math.log10(Math.max(r, 1e-3)) * 2)));
}
export const DANGER_HELP = 'Danger: its health times the damage it does a second, against a walker (1). Each step is about three times the last.';

// the first night it can come on the island, and how: [night, words]
export function firstNight(t) {
  const d = ZOMBIE_DEFS[t];
  const pool = t === FIRST_BOSS ? 1 : BOSS_POOL.find((b) => b.type === t)?.from;
  if (d.boss) return [pool, `A night's boss from night ${pool}`];
  if (pool && pool < d.minNight) return [pool, `A boss from night ${pool}, in the horde from night ${d.minNight}`];
  return [d.minNight, `Joins the horde from night ${d.minNight}`];
}

const pace = (s) => (s < WALK_SPEED ? 'Slower than your walk' : s < SPRINT_SPEED ? 'Faster than your walk' : s === SPRINT_SPEED ? 'As fast as your sprint' : 'Faster than your sprint');

// What a kind's numbers say: { danger, facts: [[label, value]], beat: [text], watch: [text], first: [night, words] }
export function kindFacts(t) {
  const d = ZOMBIE_DEFS[t];
  const beat = [];
  const watch = [];
  if (d.shade) beat.push('Light freezes it');
  if (d.blastRadius) beat.push(`Kill it ${Math.ceil(d.blastRadius)} m+ away`);
  if (d.ropeRange) beat.push('Break its line of sight');
  if (d.leapRange) beat.push(`Mash ${bindLabel('jump')} to shove off`);
  if (d.stunHurt) beat.push('Hit it while it reels');
  if (d.flying) beat.push('Shotgun or melee');
  if (d.spitRange && !d.boss) beat.push('Shoot it first');
  if (d.enrage) beat.push('Keep your distance');
  if (d.boss && d.spitRange) beat.push('Keep to cover');
  beat.push(d.boss ? 'Head ×1.6' : 'Head'); // (server/combat.js: a boss's head takes ×1.6, not the weapon's own multiplier)
  if (d.legs) beat.push('Legs');
  if (d.hp <= WALKER.hp * 0.8 && !d.boss) beat.push('Frail');

  if (d.flying) watch.push('Flies over walls');
  if (d.leapRange) watch.push(`Pounces from ${d.leapRange} m`);
  if (d.ropeRange) watch.push(`Ropes you from ${d.ropeRange} m`);
  if (d.spitRange) watch.push(`Acid from ${d.spitRange} m`);
  if (d.spewRange) watch.push(`Bile from ${d.spewRange} m`);
  if (d.blastRadius) watch.push(`Bursts: ${d.blastDmg} damage within ${d.blastRadius} m`);
  if (d.summon) watch.push('Calls up dogs');
  if (d.ramDmg) watch.push('Rams barricades');
  if (d.structDmg >= 500) watch.push('No barricade holds it');
  if (d.pack && !d.boss) watch.push('Hunts in packs');
  if (d.shade) watch.push('Fast in the dark');
  if (d.enrage) watch.push(`Runs below ${Math.round(d.enrage * 100)}% health`);

  const reach = [d.spitRange && `${d.spitRange} m acid`, d.ropeRange && `${d.ropeRange} m rope`, d.leapRange && `${d.leapRange} m pounce`, d.lungeRange && `${d.lungeRange} m lunge`, d.spewRange && `${d.spewRange} m bile`].filter(Boolean);
  const facts = [
    ['Health', d.boss ? `${num(d.hp)} for one survivor, more for each extra` : d.legs ? `${num(d.hp)} · a leg goes at ${Math.round(d.hp * LEG_HP)}` : num(d.hp)],
    ['A blow', d.dmg ? `${d.dmg} damage every ${d.rate} s` : `${d.blastDmg} damage when it bursts`],
    ['Pace', `${pace(d.speed)} (${d.speed} m/s)`],
    ['Reach', reach.length ? `${d.range} m blows · ${reach.join(' · ')}` : `${d.range} m: it has to reach you`],
    ['On your walls', d.structDmg ? `${num(d.structDmg)} a blow` : d.breachDmg ? 'Bursts against them' : 'Leaves them be'],
  ];
  return { danger: dangerOf(t), facts, beat, watch, first: firstNight(t) };
}

// the book's entries, in the order of the night each can first come (then the book's order)
export const byFirstNight = (list) => list.map((e, i) => [e, firstNight(e.t)[0], i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);

// five pips, `n` lit
export function dangerPips(parent, n, cls = '') {
  const p = el('span', `bk-danger ${cls}`, parent);
  p.title = DANGER_HELP;
  p.setAttribute('aria-label', `Danger ${n} of 5`);
  for (let i = 1; i <= 5; i++) el('i', i <= n ? 'on' : '', p);
  return p;
}

// chips: [text], beat or watch
export function chips(parent, list, kind, max = 99) {
  const box = el('div', `bk-chips ${kind}`, parent);
  for (const t of list.slice(0, max)) el('span', `bk-chip ${kind}`, box, t);
  return box;
}

// ---------------------------------------------------------------- achievements: what is close
const STAT_LABEL = { kills: 'Kills', nights: 'Nights survived', escapes: 'Escapes', headshots: 'Headshots', revives: 'Revives', crafted: 'Things crafted', salvaged: 'Things salvaged', trees: 'Trees felled', distance: 'Distance', days: 'Days played' };
const STAT_WORD = { kills: ['kill', 'kills'], nights: ['night', 'nights'], escapes: ['escape', 'escapes'], headshots: ['headshot', 'headshots'], revives: ['revive', 'revives'], trees: ['tree', 'trees'], days: ['day', 'days'] };
export const statLabel = (k) => STAT_LABEL[k] || k;
export const COUNTERS = Object.fromEntries(ACH_STATS.map((k) => [k, ACHIEVEMENTS.filter((a) => a.stat === k).sort((x, y) => x.goal - y.goal)]));

// how far is left to a counter, in words: "3 nights to go", "3.7 km to go"
export function toGo(a, stats) {
  const p = achProgress(a, stats);
  const left = p.goal - p.have;
  if (a.unit === 'm') return `${km(left)} to go`;
  if (a.stat === 'crafted') return `${num(left)} more to craft`;
  if (a.stat === 'salvaged') return `${num(left)} more to tear down`;
  const [one, many] = STAT_WORD[a.stat] || ['', ''];
  return `${num(left)} ${left === 1 ? one : many} to go`;
}

// each count's next step not yet unlocked: [{ a, have, goal, ratio }], closest first
export function nextSteps(v) {
  const out = [];
  for (const k of ACH_STATS) {
    const a = COUNTERS[k].find((x) => !v.unlocked[x.id]);
    if (!a) continue;
    const p = achProgress(a, v.stats);
    out.push({ a, have: p.have, goal: p.goal, ratio: p.have / p.goal });
  }
  return out.sort((x, y) => y.ratio - x.ratio || TIER_RANK[x.a.tier] - TIER_RANK[y.a.tier]);
}

// the counter after this one on its count (null for the last, or a feat)
export const nextOnCount = (a) => (a.stat ? COUNTERS[a.stat].find((x) => x.goal > a.goal) || null : null);

// ---------------------------------------------------------------- tracked achievements (this browser's)
// Stored as JSON under 'stn.achTracked': { v: 1, ids: [achievement id] }, three at the most. One that unlocks drops
// off the HUD by itself (it stays in the list until untracked or another takes its place).
const TRACK_KEY = 'stn.achTracked';
export const TRACK_MAX = 3;
let tracked = null;
const trackSubs = new Set();

function loadTracked() {
  if (tracked) return tracked;
  tracked = [];
  try {
    const o = JSON.parse(localStorage.getItem(TRACK_KEY));
    if (o && o.v === 1 && Array.isArray(o.ids)) tracked = [...new Set(o.ids.filter((id) => typeof id === 'string' && ACH_BY_ID.has(id)))].slice(0, TRACK_MAX);
  } catch {
    /* no storage, or not JSON */
  }
  return tracked;
}

function saveTracked(ids) {
  tracked = ids;
  try {
    localStorage.setItem(TRACK_KEY, JSON.stringify({ v: 1, ids }));
  } catch {
    /* private mode, full: it lasts as long as the page does */
  }
  for (const fn of trackSubs) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

// read the list again (another tab, or the UI sandbox, wrote it)
export function reloadTracked() {
  tracked = null;
  saveTracked(loadTracked());
}
export const onTracked = (fn) => (trackSubs.add(fn), () => trackSubs.delete(fn));
export const isTracked = (id) => loadTracked().includes(id);
// the tracked ones still locked in this record, in the order they were tracked
export const trackedLocked = (v) => loadTracked().map((id) => ACH_BY_ID.get(id)).filter((a) => a && !v.unlocked[a.id]);
// -> 'on', 'off', or 'full' (three tracked and still locked: one has to go first)
export function toggleTrack(id, v) {
  const ids = loadTracked().slice();
  const at = ids.indexOf(id);
  if (at >= 0) {
    ids.splice(at, 1);
    saveTracked(ids);
    return 'off';
  }
  // (an unlocked one makes room for a new one)
  const live = ids.filter((x) => !v.unlocked[x]);
  if (live.length >= TRACK_MAX) return 'full';
  saveTracked([...live, id]);
  return 'on';
}
// can it be tracked here: locked, and not a secret still hidden
export const trackable = (a, v) => !v.unlocked[a.id] && !a.secret;

// the pin on a card: toggles tracking, says when three are already tracked
export function trackButton(parent, a, v, ui) {
  const b = el('button', 'bk-pin', parent);
  b.type = 'button';
  const sync = () => {
    const on = isTracked(a.id);
    b.classList.toggle('on', on);
    b.textContent = on ? 'Tracked' : 'Track';
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Shown on the HUD under the objective. Click to stop tracking it' : `Show it on the HUD under the objective (up to ${TRACK_MAX})`;
  };
  sync();
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = toggleTrack(a.id, v);
    if (r === 'full') ui?.notify?.(`You track ${TRACK_MAX} already: untrack one first`, 'warning', 3);
    else ui?.sound?.('ui_click');
  });
  return { b, sync };
}

// one tracked achievement as a row: name, how far, a bar (HUD and field notes)
function trackRow(parent, a, v, cls) {
  const p = achProgress(a, v.stats);
  const r = el('div', `${cls}-row tier-${a.tier}${p ? '' : ' feat'}`, parent);
  const top = el('div', `${cls}-top`, r);
  svgEl('i', `${cls}-ico`, top, achIcon(a.icon));
  el('b', `${cls}-name`, top, a.name);
  if (p) {
    el('span', `${cls}-v`, top, `${amount(a, p.have)} / ${amount(a, p.goal)}`);
    el('i', '', el('div', `${cls}-bar`, r)).style.width = `${((p.have / p.goal) * 100).toFixed(1)}%`;
    el('div', `${cls}-sub`, r, toGo(a, v.stats));
  } else el('div', `${cls}-sub`, r, a.desc);
  return r;
}

// a record to show: loaded, or being asked for again with the last answer still in hand
const ready = (v) => !v.loading || Object.keys(v.stats || {}).length > 0;

// ---------------------------------------------------------------- the HUD tracker
// Under the objective (and under the recipe tracked from the crafting panel, when there is one). Only while the
// objective is up (in a game, not as one of the dead). Signed in, the account's counts live on the server and are not
// sent as they grow, so while something is tracked they are asked for again now and then (REFRESH_S).
const REFRESH_S = 90;
export class AchTracker {
  // above: the HUD boxes it sits under, the first being the objective (it is up only while that is)
  constructor(ui, parent, above) {
    this.ui = ui;
    this.above = above;
    this.root = el('div', 'bkt scrap', parent);
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Tracked achievements');
    const head = el('div', 'bkt-head', this.root);
    svgEl('i', 'bkt-flag', head, glyph('trophy'));
    el('span', 'bkt-title', head, 'Achievements');
    el('span', 'bkt-tag', head, 'Tracked');
    this.list = el('div', 'bkt-list', this.root);
    this.key = '';
    const sync = () => this.render();
    onAchievements(sync);
    onTracked(sync);
    // (placed a frame later: the recipe tracker above moves itself from the same changes)
    const place = () => requestAnimationFrame(() => this.place());
    if (typeof ResizeObserver !== 'undefined') for (const a of above) new ResizeObserver(place).observe(a);
    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => this.render());
      for (const a of above) mo.observe(a, { attributes: true, attributeFilter: ['hidden'] });
      const moved = new MutationObserver(place);
      for (const a of above.slice(1)) moved.observe(a, { attributes: true, attributeFilter: ['style'] });
    }
    this.render();
  }

  place() {
    if (this.root.hidden) return;
    let y = 0;
    for (const a of this.above) if (!a.hidden && a.offsetHeight) y = Math.max(y, a.offsetTop + a.offsetHeight + 8);
    const top = `${y}px`;
    if (this.root.style.top !== top) this.root.style.top = top;
  }

  // asks the server for the account's counts now and then, while one is tracked and up (a guest's grow as they come)
  poll(on) {
    if (on === !!this.iv) return;
    clearInterval(this.iv);
    this.iv = on ? setInterval(() => refreshAchievements(), REFRESH_S * 1000) : 0;
  }

  render() {
    const v = achievementsView();
    if (v.error) return;
    const list = trackedLocked(v);
    const up = !this.above[0].hidden && list.length > 0 && ready(v);
    this.poll(up && !!accountState().user);
    if (!up) {
      this.root.hidden = true;
      this.key = '';
      return;
    }
    const key = JSON.stringify(list.map((a) => [a.id, a.stat ? v.stats[a.stat] : 0]));
    if (key !== this.key) {
      this.key = key;
      this.list.textContent = '';
      for (const a of list) trackRow(this.list, a, v, 'bkt');
    }
    this.root.hidden = false;
    this.place();
  }
}

const firstSentence = (t) => (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0];

// ---------------------------------------------------------------- field notes (the pause menu)
// Beside the pause menu's rail: what is out tonight (the kinds in tonight's horde, each "???" until seen), tonight's
// boss, the night's theme, and the tracked achievements. ctx() is the game's: { seed, act, day, phase } or null
export class FieldNotes {
  constructor(ui, pauseRoot) {
    this.ui = ui;
    this.ctx = () => null;
    this.open = false;
    this.root = el('aside', 'bkn paper', pauseRoot);
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Field notes');
    // (a click in here is not a click away from the menu)
    this.root.addEventListener('click', (e) => e.stopPropagation());
    const h = el('div', 'bkn-h', this.root);
    this.title = el('span', 'bkn-title', h, 'Out tonight');
    this.night = el('span', 'bkn-night', h, '');
    const back = el('button', 'bkn-back', h, 'Back');
    back.type = 'button';
    back.addEventListener('click', () => this.hide());
    this.root.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' && e.key !== 'Backspace') return;
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      },
      true,
    );
    this.theme = el('div', 'bkn-theme', this.root);
    this.kinds = el('div', 'bkn-kinds', this.root);
    const th = el('div', 'bkn-h bkn-h2', this.root);
    el('span', 'bkn-title', th, 'Tracked achievements');
    el('span', 'bkn-night', th, `Up to ${TRACK_MAX}`);
    this.tracked = el('div', 'bkn-tracked', this.root);
    const foot = el('div', 'bkn-foot', this.root);
    this.bstBtn = el('button', 'bkn-link', foot, 'Bestiary ›');
    this.bstBtn.type = 'button';
    this.bstBtn.addEventListener('click', () => this.ui.cb.onBestiary());
    const achBtn = el('button', 'bkn-link', foot, 'All achievements ›');
    achBtn.type = 'button';
    achBtn.addEventListener('click', () => this.ui.achPanel.show());

    const sync = () => !this.root.hidden && this.render();
    onAchievements(sync);
    onTracked(sync);
    onBestiary(sync);
  }

  show() {
    this.open = true;
    this.render();
    if (!this.root.hidden) this.root.focus({ preventScroll: true });
  }

  hide() {
    this.open = false;
    this.root.hidden = true;
  }

  get visible() {
    return !this.root.hidden;
  }

  render() {
    const c = this.ctx();
    const up = this.open && !this.root.parentElement.hidden && !!c && c.day > 0;
    this.root.hidden = !up;
    if (!up) return;
    // the portraits, if the book has not drawn them yet (the menu is up, so a hitch is fine), then drawn in here
    if (!this.warming && this.ui.bestiary?.warm) {
      this.warming = true;
      this.ui.bestiary.warm().then(() => this.render());
    }
    const bv = bestiaryView();
    const night = c.day;
    const rank = nightRank(c.act, night);
    this.title.textContent = c.phase === PHASE.NIGHT ? 'Out tonight' : 'Coming tonight';
    this.night.textContent = `Night ${night} · ${seenCount(bv.mask)} / ${BESTIARY.length} in the book`;
    const th = nightTheme(c.seed, night, c.act);
    this.theme.textContent = '';
    this.theme.hidden = !th;
    if (th) {
      el('b', '', this.theme, th.name);
      el('span', '', this.theme, th.brief || th.warn);
    }
    this.kinds.textContent = '';
    const kinds = BESTIARY.filter((e) => e.group !== 'boss' && ZOMBIE_DEFS[e.t].minNight <= rank);
    for (const e of kinds) this.kindRow(e, bv, rank > 1 && ZOMBIE_DEFS[e.t].minNight === rank ? 'New tonight' : '');
    const boss = BESTIARY.find((e) => e.t === nightBoss(c.seed, night, c.act));
    if (boss) this.kindRow(boss, bv, "Tonight's boss", true);

    const v = achievementsView();
    this.tracked.textContent = '';
    const list = ready(v) && !v.error ? trackedLocked(v) : [];
    for (const a of list) trackRow(this.tracked, a, v, 'bkn-a');
    if (!list.length) el('p', 'bkn-empty', this.tracked, `Track up to ${TRACK_MAX} on the achievements page: they show on the HUD under the objective.`);
  }

  kindRow(e, bv, tag, boss = false) {
    const seen = !!(bv.mask & bit(e.t));
    const d = ZOMBIE_DEFS[e.t];
    const r = el(seen ? 'button' : 'div', `bkn-kind${boss ? ' bkn-boss' : ''}${seen ? ' seen' : ''}`, this.kinds);
    if (seen) {
      r.type = 'button';
      r.title = 'Read its page in the bestiary';
      r.addEventListener('click', () => {
        this.ui.cb.onBestiary();
        this.ui.bestiary?.openPage?.(e.t);
      });
    }
    const pic = el('span', 'bkn-pic', r);
    const src = this.ui.bestiary?.portrait?.(e.t, seen);
    if (src) el('img', '', pic).src = src;
    else svgEl('i', '', pic, glyph(seen ? 'claw' : 'question'));
    const txt = el('span', 'bkn-txt', r);
    const top = el('span', 'bkn-top', txt);
    el('b', 'bkn-name', top, seen ? d.name : '???');
    if (tag) el('span', `bkn-tag${boss ? ' bkn-boss' : ''}`, top, tag);
    else if (seen) el('span', 'bkn-tag beat', top, kindFacts(e.t).beat[0]);
    el('span', 'bkn-line', txt, seen ? d.tipBrief || d.introBrief || firstSentence(e.tip) : e.vague);
  }
}
