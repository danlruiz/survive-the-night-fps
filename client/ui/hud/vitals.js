// The HUD's vitals (hud.js), bottom left: the team over them, the mic, health, stamina, armour, the flashlight, the
// vehicle you are in. Methods laid onto Hud.
import { ITEM } from '../../../shared/defs.js';
import { PHASE } from '../../../shared/constants.js';
import { el, svgEl, clamp } from '../dom.js';
import { itemIcon, glyph } from '../icons.js';
import { healthTier } from '../hud2.js';
import { bindLabel } from '../../game/binds.js';

const STEADY_MS = 4000; // health, armour and stamina unchanged this long by day, full stamina: the vitals fade back
const TEAM_ROWS = 4; // teammates listed over the vitals (compact: 3), the downed first; the rest as "+N more"
const TEAM_ORDER = { downed: 0, alive: 1, zombie: 2, dead: 3 };

export const vitalsMethods = {
  _buildVitals(layer) {
    // ---- bottom-left vitals
    const vit = (this.vitals = el('div', 'vitals', layer));
    // the team: everyone else in the game, how they are and how far off (Game.hudTeam), over your own vitals
    this.team = el('div', 'hud-team', vit);
    this.team.hidden = true;
    const comms = (this.comms = el('div', 'v-comms', vit)); // the voice speaker list is parked in here too (ui.js)
    this.mic = svgEl('div', 'v-mic', comms, glyph('mic'));
    this.mic.hidden = true;
    this.radio = svgEl('div', 'v-radio', comms, glyph('radio')); // the walkie-talkie in hand (tx: keyed, on the air)
    this.radio.title = 'Walkie-talkie: hold fire to talk to everyone';
    this.radio.hidden = true;
    const hp = (this.hpRow = el('div', 'vrow v-hp', vit));
    this.hpIco = svgEl('i', 'v-ico', hp, glyph('cross'));
    this.hpNum = el('span', 'v-num', hp, '100');
    const stack = el('div', 'v-stack', hp);
    const hpb = el('div', 'v-bar', stack);
    this.hpLag = el('i', 'v-lag', hpb);
    this.hpFill = el('i', 'v-fill', hpb);
    // stamina rides directly under the health bar
    const st = (this.stRow = el('div', 'v-st', stack));
    const stb = el('div', 'v-bar', st);
    this.stFill = el('i', 'v-fill', stb);
    svgEl('i', 'v-ico', st, glyph('bolt'));
    // what the quick keys have left, each beside the bar it fills: healing items (what the heal key would use) by the
    // health bar, red once there are none; energy drinks (the drink key's) under it, by the stamina line, dimmed once
    // there are none. (Their tooltips name the keys: _keys)
    const counts = el('div', 'v-counts', hp);
    this.meds = el('div', 'v-meds', counts);
    svgEl('i', 'v-meds-ico', this.meds, itemIcon(ITEM.MEDKIT));
    this.medsNum = el('span', 'v-meds-n', this.meds, '0');
    this.drinks = el('div', 'v-meds v-drinks', counts);
    svgEl('i', 'v-meds-ico', this.drinks, itemIcon(ITEM.ENERGY_DRINK));
    this.drinksNum = el('span', 'v-meds-n', this.drinks, '0');
    this.ecg = svgEl(
      'i',
      'v-ecg',
      hp,
      '<svg viewBox="0 0 60 20" aria-hidden="true"><path pathLength="100" d="M0 11H14L17 6L21 16L25 1.5L29 18L32 9L34 11H60"/></svg>',
    );
    const ar = (this.arRow = el('div', 'vrow v-ar', vit));
    svgEl('i', 'v-ico', ar, glyph('shield'));
    this.arNum = el('span', 'v-num', ar, '0');
    const arb = el('div', 'v-bar', ar);
    this.arFill = el('i', 'v-fill', arb);
    this.arRow.hidden = true;
    const fl = (this.flRow = el('div', 'v-flash', vit));
    this.flBeam = svgEl('i', 'fl-beam', fl, glyph('flashlight'));
    const batt = el('span', 'batt', fl);
    this.flLvl = el('i', 'batt-lvl', batt);
    el('i', 'batt-nub', batt);
    this.flTxt = el('span', 'fl-txt', fl, '100%');
    // in a vehicle (game/vehicles.js): what it is, how fast it goes, its tank and how sound it is
    const vr = (this.vehRow = el('div', 'v-veh', vit));
    vr.hidden = true;
    this.vehName = el('span', 'veh-name', vr, '');
    this.vehKmh = el('span', 'veh-kmh', vr, '0');
    el('span', 'veh-unit', vr, 'km/h');
    const vf = (this.vehFuelG = el('span', 'veh-g', vr));
    el('span', 'veh-l', vf, 'FUEL');
    this.vehFuel = el('i', '', el('span', 'veh-bar', vf));
    const vb = (this.vehHpG = el('span', 'veh-g', vr));
    el('span', 'veh-l', vb, 'BODY');
    this.vehHp = el('i', '', el('span', 'veh-bar', vb));
    this.vehLamp = el('span', 'veh-lamp', vr, 'LAMP');
  },

  // the team over the vitals: t = [{ id, name, status, hp (0..1, -1: not known), d (m, -1: not known), talking }]
  _team(t) {
    const c = this.c;
    if (t === c.teamRef) return; // (the game makes a new list a few times a second, and none in between)
    c.teamRef = t;
    const max = c.compact ? TEAM_ROWS - 1 : TEAM_ROWS;
    const list = t && t.length ? [...t].sort((a, b) => (TEAM_ORDER[a.status] ?? 1) - (TEAM_ORDER[b.status] ?? 1)) : null;
    const key = list ? list.slice(0, max).map((p) => [p.id, p.name, p.status, p.hp < 0 ? -1 : Math.round(p.hp * 20), p.d < 0 ? -1 : Math.round(p.d / 5), p.talking ? 1 : 0].join('|')).join(';') + '#' + list.length : '';
    if (c.teamKey === key) return;
    c.teamKey = key;
    this.team.hidden = !list;
    this.team.textContent = '';
    if (!list) return;
    for (const p of list.slice(0, max)) {
      const row = el('div', 'tm-row st-' + p.status + (p.status === 'alive' ? healthTier(p.hp) : '') + (p.talking ? ' talking' : ''), this.team);
      svgEl('i', 'tm-ico', row, glyph(p.talking ? 'mic' : p.status === 'zombie' ? 'claw' : p.status === 'dead' ? 'skull' : p.status === 'downed' ? 'downed' : 'person'));
      el('span', 'tm-name', row, p.name || '???');
      if (p.status === 'alive') {
        const bar = el('span', 'tm-bar', row);
        const f = el('i', '', bar);
        f.style.transform = `scaleX(${p.hp < 0 ? 1 : clamp(p.hp, 0, 1)})`;
        bar.classList.toggle('unknown', p.hp < 0);
      }
      el('span', 'tm-st', row, p.status === 'downed' ? 'Down' : p.status === 'zombie' ? 'Infected' : p.status === 'dead' ? 'Dead' : p.d >= 0 ? p.d + 'm' : '');
    }
    if (list.length > max) el('div', 'tm-more', this.team, `+${list.length - max} more [${bindLabel('players')}]`);
  },

  _vitals(h, zombie) {
    const c = this.c;
    // the vehicle we are in
    const veh = h.veh && h.veh.on ? h.veh : null;
    if (!!veh !== !!c.veh) {
      c.veh = !!veh;
      this.vehRow.hidden = !veh;
    }
    if (veh) {
      if (c.vehName !== veh.name) this.vehName.textContent = c.vehName = veh.name;
      if (c.vehKmh !== veh.kmh) this.vehKmh.textContent = String((c.vehKmh = veh.kmh));
      const fq = veh.tank ? Math.round(clamp(veh.fuel, 0, 1) * 100) : -1;
      if (c.vehFuel !== fq) {
        c.vehFuel = fq;
        this.vehFuelG.hidden = fq < 0;
        this.vehFuel.style.transform = `scaleX(${Math.max(0, fq) / 100})`;
        this.vehFuelG.classList.toggle('low', fq >= 0 && fq <= 15);
      }
      const hq = veh.state === 2 ? 0 : Math.round(clamp(veh.hp, 0, 1) * 100);
      if (c.vehHp !== hq) {
        c.vehHp = hq;
        this.vehHp.style.transform = `scaleX(${hq / 100})`;
        this.vehHpG.classList.toggle('low', hq <= 25);
      }
      const lamp = veh.tank && veh.lights ? 1 : 0;
      if (c.vehLamp !== lamp) {
        c.vehLamp = lamp;
        this.vehLamp.hidden = !lamp;
      }
    }
    const maxHp = h.maxHp || 100;
    const hp = Math.max(0, Math.ceil(h.hp || 0));
    if (c.hp !== hp) {
      // a hit or a heal kicks the number; the 1 hp ticks of regeneration stay quiet
      const d = c.hp === undefined || c.hpZ !== zombie ? 0 : hp - c.hp;
      c.hp = hp;
      c.hpZ = zombie;
      this.hpNum.textContent = String(hp);
      if (d < 0 || d > 1) {
        const col = d < 0 ? '#ff5446' : '#b6d08a';
        this.hpNum.animate([{ color: col, transform: `scale(${d < 0 ? 1.14 : 1.08})` }, { color: col, offset: 0.35 }, { transform: 'scale(1)' }], { duration: d < 0 ? 380 : 560, easing: 'ease-out' });
      }
    }
    const hr = Math.round(clamp((h.hp || 0) / maxHp, 0, 1) * 400) / 400;
    if (c.hpR !== hr) {
      c.hpR = hr;
      this.hpFill.style.transform = `scaleX(${hr})`;
      this.hpLag.style.transform = `scaleX(${hr})`;
    }
    const low = !zombie && hp > 0 && hp < 30;
    if (c.lowhp !== low) {
      c.lowhp = low;
      this.ui.root.classList.toggle('low-hp', low);
    }

    const meds = h.heals | 0;
    if (c.meds !== meds) {
      const kick = c.meds !== undefined;
      c.meds = meds;
      this.medsNum.textContent = String(meds);
      this.meds.classList.toggle('out', meds === 0);
      if (kick) this.meds.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    }
    const drinks = h.drinks | 0;
    if (c.drinks !== drinks) {
      const kick = c.drinks !== undefined;
      c.drinks = drinks;
      this.drinksNum.textContent = String(drinks);
      this.drinks.classList.toggle('none', drinks === 0);
      if (kick) this.drinks.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    }

    const armorMax = h.armorMax || 0;
    const armor = Math.max(0, Math.ceil(h.armor || 0));
    const showAr = !zombie && armorMax > 0;
    if (c.arShow !== showAr) {
      c.arShow = showAr;
      this.arRow.hidden = !showAr;
    }
    if (showAr) {
      if (c.ar !== armor) this.arNum.textContent = String((c.ar = armor));
      const r = Math.round(clamp(armor / armorMax, 0, 1) * 300) / 300;
      if (c.arR !== r) {
        c.arR = r;
        this.arFill.style.transform = `scaleX(${r})`;
      }
    }

    const sr = Math.round(clamp((h.stamina || 0) / 100, 0, 1) * 300) / 300;
    if (c.st !== sr) {
      c.st = sr;
      this.stFill.style.transform = `scaleX(${sr})`;
    }
    const ex = !!h.exhausted;
    if (c.ex !== ex) {
      c.ex = ex;
      this.stRow.classList.toggle('exhausted', ex);
    }

    // steady (by day, nothing moving, stamina full): the vitals fade back, never out; any change brings them up at once
    const now = performance.now();
    const vk = hp + '|' + armor + '|' + sr + '|' + ex;
    if (c.vKey !== vk) {
      c.vKey = vk;
      c.vT = now;
    }
    const steady = !zombie && !c.atNight && !low && !veh && sr >= 1 && h.phase === PHASE.DAY && now - c.vT > STEADY_MS;
    if (c.steady !== steady) {
      c.steady = steady;
      this.vitals.classList.toggle('steady', steady);
    }

    const fl = Math.round(clamp(h.flashlight || 0, 0, 100));
    if (c.fl !== fl) {
      c.fl = fl;
      this.flLvl.style.transform = `scaleX(${fl / 100})`;
      this.flTxt.textContent = fl + '%';
      this.flRow.classList.toggle('low', fl <= 15);
    }
    const on = !!h.flashlightOn;
    if (c.flOn !== on) {
      c.flOn = on;
      this.flRow.classList.toggle('on', on);
    }
  },
};
