// The weapon registry (shared/weapons/): every weapon is one file there with all a weapon needs, and the tables built
// from it (ITEM, ITEM_DEFS, WEAPONS, RECIPES, SALVAGE, KILL_FEATS, the bullet holes and the shots heard) hold every one.
// A new gun that leaves a field out, misses its model, viewmodel or icon, or is not in the registry's list fails here.
// Also that a recipe is found by its id, the item it makes, and never by its place in the list.
// usage: node scripts/test-weapons.js
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WEAPON_LIST } from '../shared/weapons/index.js';
import { BASE_ITEM } from '../shared/items.js';
import { ITEM, ITEM_DEFS, WEAPONS, RECIPES, RECIPE_BY_ID, SALVAGE, SOUND } from '../shared/defs.js';
import { KILL_FEATS, ACH_BY_ID } from '../shared/achievements.js';
import { BLOW, blowOf, shotScale } from '../shared/surfaces.js';
import { worldWeaponTris, viewModelTris, VM_DEBUG } from '../client/render/models/weapons.js';
import { hasItemIcon } from '../client/ui/icons.js';

const fails = [];
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`);
  if (!ok) fails.push(name);
};
const dir = join(dirname(fileURLToPath(import.meta.url)), '../shared/weapons');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const list = (bad) => bad.map((w) => w.key).join(', ');

// ---------------------------------------------------------------- the registry
const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js');
const mods = await Promise.all(files.map(async (f) => [f, (await import(pathToFileURL(join(dir, f)).href)).default]));
const missing = mods.filter(([, w]) => !WEAPON_LIST.includes(w)).map(([f]) => f);
check('every file in shared/weapons/ is in the registry', missing.length === 0 && WEAPON_LIST.length === files.length, missing.join(', ') || `${files.length} weapons`);
const src = readFileSync(join(dir, 'index.js'), 'utf8');
const imports = [...src.matchAll(/^import \w+ from '\.\/([\w-]+\.js)';$/gm)].map((m) => m[1]);
const listed = [...src.matchAll(/^ {2}(\w+),$/gm)].map((m) => m[1]);
const sorted = (a) => a.every((x, i) => i === 0 || a[i - 1] < x);
check("...its imports and its list in file-name order (two new weapons only touch a line when their names sort together)", sorted(imports) && imports.length === files.length && listed.length === files.length && listed.every((x, i) => imports[i].startsWith(x.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))), imports.join(' '));

const ids = new Set(WEAPON_LIST.map((w) => w.id));
const keys = new Set(WEAPON_LIST.map((w) => w.key));
check('each weapon its own item id and name', ids.size === WEAPON_LIST.length && keys.size === WEAPON_LIST.length);
const taken = WEAPON_LIST.filter((w) => has(BASE_ITEM, w.key) || Object.values(BASE_ITEM).includes(w.id));
check('...that no other item has', taken.length === 0, list(taken));
check('...and ITEM names each one by it', WEAPON_LIST.every((w) => ITEM[w.key] === w.id));
const orphans = Object.keys(ITEM_DEFS).map(Number).filter((id) => ITEM_DEFS[id].cat === 'weapon' && !ids.has(id));
check('every weapon item there is comes from the registry', orphans.length === 0 && Object.keys(WEAPONS).length === WEAPON_LIST.length, orphans.join(', '));

// ---------------------------------------------------------------- what each one has
const FIELDS = ['key', 'id', 'def', 'stats', 'recipe', 'salvage', 'feat'];
const GUN_FIELDS = ['hole', 'shotSound'];
const lacking = WEAPON_LIST.filter((w) => FIELDS.some((f) => !has(w, f)) || (!w.stats?.melee && GUN_FIELDS.some((f) => !has(w, f))));
check(`each one says what it has, null for none (${FIELDS.join(', ')}; for a gun ${GUN_FIELDS.join(', ')})`, lacking.length === 0, list(lacking));
check('...an item definition: a weapon, one to a slot', WEAPON_LIST.every((w) => ITEM_DEFS[w.id] === w.def && w.def.cat === 'weapon' && w.def.stack === 1 && w.def.name && w.def.desc));
check('...its numbers in WEAPONS', WEAPON_LIST.every((w) => WEAPONS[w.id] === w.stats && Number.isInteger(w.stats.slot)));

const real = (cost) => Object.keys(cost || {}).length > 0 && Object.entries(cost).every(([it, n]) => ITEM_DEFS[+it] && ITEM_DEFS[+it].cat !== 'weapon' && Number.isInteger(n) && n > 0);
const badRecipe = WEAPON_LIST.filter((w) => w.recipe !== null && (!real(w.recipe.cost) || !(w.recipe.n >= 1) || has(w.recipe, 'id') || has(w.recipe, 'out')));
check('...a recipe of real materials (or null)', badRecipe.length === 0, list(badRecipe));
check('...in RECIPES, found by its id: the weapon itself', WEAPON_LIST.every((w) => w.recipe === null || RECIPE_BY_ID.get(w.id)?.out === w.id));
const badSalvage = WEAPON_LIST.filter((w) => w.salvage !== null && (SALVAGE[w.id] !== w.salvage || !real(w.salvage)));
check('...what it salvages into (or null), in SALVAGE', badSalvage.length === 0, list(badSalvage));
const badFeat = WEAPON_LIST.filter((w) => (w.feat === null ? has(KILL_FEATS, w.id) : !ACH_BY_ID.has(w.feat) || KILL_FEATS[w.id] !== w.feat));
check('...the feat a kill with it counts for (or null), in KILL_FEATS', badFeat.length === 0, list(badFeat));

const guns = WEAPON_LIST.filter((w) => !w.stats.melee);
const melee = WEAPON_LIST.filter((w) => w.stats.melee);
const badHole = guns.filter((w) => (w.hole === null ? shotScale(w.id) !== 1 : !(w.hole > 0) || shotScale(w.id) !== w.hole));
check('a gun: the size of its bullet holes (or null)', badHole.length === 0, list(badHole));
const badSound = guns.filter((w) => w.shotSound !== null && !Number.isInteger(SOUND[w.shotSound]));
check('...the shot the others hear: a sound there is (or null)', badSound.length === 0, list(badSound));
const badKick = guns.filter((w) => has(w, 'kick') && !(Array.isArray(w.kick) && w.kick.length === 2 && w.kick.every((x) => x >= 0)));
check('...its kick, when it has one: [flash, shake]', badKick.length === 0, list(badKick));
const badBlow = melee.filter((w) => !has(BLOW, w.blow) || blowOf(w.id) !== BLOW[w.blow]);
check('a melee weapon: how it strikes', badBlow.length === 0, list(badBlow));

// ---------------------------------------------------------------- the client
const noModel = WEAPON_LIST.filter((w) => !(worldWeaponTris(w.id) > 0));
check('each one has a model (its build in client/render/models/weapons/<name>.js)', noModel.length === 0, list(noModel));
const noVM = WEAPON_LIST.filter((w) => !VM_DEBUG.VM[w.id] || !(viewModelTris(w.id) > 0));
check('...a viewmodel (its vm there)', noVM.length === 0, list(noVM));
const noIcon = WEAPON_LIST.filter((w) => !hasItemIcon(w.id));
check('...and an icon (client/ui/icons/<name>.js)', noIcon.length === 0, list(noIcon));

// ---------------------------------------------------------------- recipe ids
check("a recipe's id is the item it makes, and RECIPE_BY_ID finds every one by it", RECIPES.every((r) => r.id === r.out && RECIPE_BY_ID.get(r.id) === r) && RECIPE_BY_ID.size === RECIPES.length);
check('...which fits the u8 the craft is sent in', RECIPES.every((r) => r.id >= 0 && r.id < 256));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
