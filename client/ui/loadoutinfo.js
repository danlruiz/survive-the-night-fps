// How the loadout and auction panels (loadout.js, auction.js) describe a loadout item: what it grants and does,
// where it comes from, its icon, a price in Skulls and a listing's time left.
import { AMMO_NAMES, ITEM_DEFS, ZOMBIE_DEFS } from '../../shared/defs.js';
import { LOADOUT_SLOTS, LOADOUT_TYPES } from '../../shared/loadout.js';
import { SKULLS } from '../../shared/economy.js';

export const fmtGrant = (def) => {
  const g = def.grant || {};
  const out = [];
  if (g.item) out.push(`${g.count || 1}x ${ITEM_DEFS[g.item]?.name || 'item'}`);
  for (const [item, n] of g.items || []) out.push(`${n}x ${ITEM_DEFS[item]?.name || 'item'}`);
  for (const [cal, n] of g.ammo || []) out.push(`${n} ${AMMO_NAMES[cal] || 'rounds'}`);
  return out.join(' + ') || 'Passive bonus';
};
const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;
export const fmtMods = (mods = {}) =>
  Object.entries(mods)
    .map(([k, v]) => {
      if (k === 'hp') return `+${v} max health`;
      if (k === 'extraFind') return `+${Math.round(v * 100)}% extra find`;
      if (k === 'gather') return `+${Math.round(v * 100)}% bonus gather`;
      if (k === 'reviveHp') return `+${v} revive health`;
      if (k === 'killStamina') return `+${v} stamina on kill`;
      if (k === 'killHeal') return `+${v} health on kill`;
      if (k === 'reviveSelf') return `+${v} health after revive`;
      if (k === 'xp') return `+${Math.round((v - 1) * 100)}% XP`;
      if (v < 1) return `${pct(v)} better ${k}`;
      return `+${pct(v)} ${k}`;
    })
    .join(' · ');
const fmtCombat = (label, e = {}) => {
  const out = [];
  if (e.damage && e.damage !== 1) out.push(`+${pct(e.damage)} damage`);
  if (e.headshot && e.headshot !== 1) out.push(`+${pct(e.headshot)} headshots`);
  if (e.boss && e.boss !== 1) out.push(`+${pct(e.boss)} vs bosses/Tanks`);
  if (e.knock && e.knock !== 1) out.push(`+${pct(e.knock)} knockback`);
  if (e.pierce) out.push(`+${e.pierce} pierce`);
  if (e.ignite) out.push(`${Math.round(e.ignite * 100)}% ignite`);
  return out.length ? `${label}: ${out.join(', ')}` : '';
};
const fmtRewards = (label, e = {}) => {
  const out = [];
  if (e.heal) out.push(`+${e.heal} health`);
  if (e.stamina) out.push(`+${e.stamina} stamina`);
  for (const [cal, n] of e.ammo || []) out.push(`${n} ${AMMO_NAMES[cal] || 'rounds'}`);
  return out.length ? `${label}: ${out.join(', ')}` : '';
};
export const fmtEffects = (def) =>
  [
    fmtCombat('Signature weapon', def.effects?.weapon),
    fmtCombat('Special ammo', def.effects?.ammo),
    fmtRewards('On kill', def.effects?.kill),
    fmtRewards('First kill each night', def.effects?.firstKill),
  ]
    .filter(Boolean)
    .join(' · ');
export const fmtSource = (def) => {
  const s = def.source || {};
  if (s.kind === 'boss') return `${ZOMBIE_DEFS[s.boss]?.name || 'Boss'} drop`;
  return s.text || 'The valley';
};
export const typeIcon = (def) =>
  def?.icon ||
  ({
    [LOADOUT_TYPES.WEAPON]: 'headshot',
    [LOADOUT_TYPES.ARMOR]: 'shield',
    [LOADOUT_TYPES.CLOTHING]: 'person',
    [LOADOUT_TYPES.TRINKET]: 'star',
    [LOADOUT_TYPES.AMMO]: 'bolt',
    [LOADOUT_TYPES.GEAR]: 'grid',
    [LOADOUT_TYPES.KIT]: 'container',
  }[def?.type] || 'star');
export const cleanData = (v) => ({
  catalog: Array.isArray(v?.catalog) ? v.catalog : [],
  slotCount: v?.slotCount || LOADOUT_SLOTS,
  balance: Math.max(0, v?.balance | 0),
  items: Array.isArray(v?.items) ? v.items : [],
  slots: Array.isArray(v?.slots) ? v.slots.slice(0, LOADOUT_SLOTS) : Array(LOADOUT_SLOTS).fill(null),
});
export const priceText = (n) => `${Math.max(0, n | 0).toLocaleString()} ${SKULLS.SHORT}`;
export const listingTime = (ms) => {
  const left = Math.max(0, Math.ceil((ms - Date.now()) / 3600000));
  if (!left) return 'expires soon';
  if (left < 24) return `${left}h left`;
  return `${Math.ceil(left / 24)}d left`;
};
