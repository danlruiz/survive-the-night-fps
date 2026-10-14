# Merge conflicts: what they tell us, and what to refactor next

Many branches are built at once here, so most PRs end with "merge main in". Of the last 150 merges (7 to 13 October
2026), 76 conflicted. Almost none of them were two people changing the same logic. They were two branches adding a
row to the same list, taking the same id, or bumping the same number. This guide says which conflicts are like that,
how to resolve each one safely, and which refactors would stop them happening.

The skill that walks through a merge with this guide is
[.claude/skills/resolve-conflicts/SKILL.md](../.claude/skills/resolve-conflicts/SKILL.md).

## Where the conflicts were

Files that conflicted, counted over those 76 merges (`git merge-tree` on each merge's parents):

| File | Merges | What collided |
|---|---|---|
| `package.json` | 62 | the `test` script: one 3,451-character `&&` line every new test edited. **Fixed** by #340 |
| `shared/protocol.js` | 13 | `PROTOCOL_VERSION`: one line holding the number and its whole history as a comment. **Fixed**: one line per version |
| `shared/defs.js` | 10 | `ITEM`, `WEAPONS`, `RECIPES`, `SALVAGE` rows after the pistol; `ZTYPE` and `SOUND` ids. **Mostly fixed** by #354 for weapons; now split into `shared/defs/` (a module per kind of table), and a clashing id throws at load |
| `server/game.js` | 10 | night wave weights and the Ember/Blackout `\|\|` chain (**moved** to `server/spawns.js` by #355); names appended to import lists |
| `client/game/game.js` | 10 | `SHOT_SOUND` (**fixed** by #354); HUD meters (shove, fire) written in the same spot (**moved** to `client/game/hudmeters.js`, and the rest of the class split into `client/game/game/`) |
| `shared/progress.js` | 5 | `XP.kinds`: every zombie kind's XP on one line. **Fixed**: read from each kind's `ZOMBIE_DEFS` row |
| `client/ui/menus.js` | 5 | menu screens edited side by side (**split** into `splash.js`, `pause.js` and `invite.js` by the cleanup) |
| `shared/bestiary.js` | 4 | a new kind's `B(...)` row added after the last special |
| `server/zombies.js` | 4 | `switch` cases and hand-numbered special acts (**moved** to `server/specials/` by #355) |

## What #354 and #355 changed

**#354, weapons in a file each (issue #349).** Every weapon is now `shared/weapons/<name>.js`: its item id, item
definition, stats, recipe, salvage, kill feat, bullet hole, shot sound and kick. `shared/weapons/index.js` imports
them in file-name order and `defs.js`, `achievements.js`, `surfaces.js` and the client's `game.js` build their tables
from that list. A recipe's id is now the item it makes (`RECIPE_BY_ID`), not its place in `RECIPES`, so recipes never
renumber. Clashing item ids throw when `defs.js` loads. `scripts/test-weapons.js` checks every weapon has every field,
a model, a viewmodel and an icon. `PROTOCOL_VERSION` went to 55.

**#355, each special zombie in its own file (issue #346).** `server/zombies.js` went from 3,367 lines to about 1,700.
Each special (spitter, leaper, crawler, roper, smoker, screecher, boomer, tank, dog, bat, shade, flammer, bosses) is
`server/specials/<kind>.js` with its constants, `methods`, `triggers[ztype]`, `acts[stateAct]` and `states[state]`.
`server/specials/index.js` builds the tables and throws on a duplicate key. The night wave weights, the unlock check
and the Ember/Blackout scaling moved from `Game.startNight` into `server/spawns.js`. A seeded fight traced the same
before and after, so nothing changed for players.

**What an older branch has to do after them.** A weapon change made in `shared/defs.js`, `achievements.js` or
`surfaces.js` moves into that weapon's file. A recipe sent as its index (`ACT.CRAFT, 43`) is sent as its item
(`ACT.CRAFT, ITEM.X`). A special's code added to `server/zombies.js` moves into `server/specials/<kind>.js`, and wave
weights added in `server/game.js` go to `server/spawns.js`. A test added to the old `package.json` line is dropped
from it: take main's line, since `npm test` now finds every `scripts/test-*.js` by name.

## The smells

Each smell below has three parts: how to spot it in a conflict, how to resolve it today, and the refactor that would
end it.

### 1. A list on one line

Two branches that add anything to a one-line list conflict, wherever they add it.

- **Still in the code:** `KINDS` in `server/specials/index.js`; the Ember/Blackout `||` chain in `server/spawns.js`.
- **Resolve:** keep both entries. Check nothing was dropped by counting entries on each side.
- **Refactor:** one entry per line with a trailing comma. Better still, generate the list from the definitions (smell
  4), so there is no list.

### 2. Insert next to the similar one

When a list is grouped by kind, every new sidearm goes after the pistol and every new special after the last special.
Git conflicts when two branches change the same or neighbouring lines, so two similar additions always collide. The
same goes for names appended to the end of an import list: `BTN` and `PIN_FACE` both went last in `server/game.js`'s
import from `constants.js`.

- **Still in the code:** wave weights in `server/spawns.js` (new kinds go last), `shared/bestiary.js` rows (in book
  order), `ZTYPE` and `SOUND` (always appended), import lists.
- **Resolve:** keep both, in either order, unless the order means something (bestiary rows are the book's page
  order; `ZTYPE` order means nothing).
- **Refactor:** put new import names in alphabetical place instead of at the end. Order maps by key name, not by
  kind. Where order is meaningful, make it a field (`order` on a bestiary entry) so rows can sit anywhere.

### 3. Hand-picked ids

`ITEM`, `SOUND`, `ZTYPE`, `EVT`, `AREA`, `C2S` and `S2C` message ids, status bits (`PSTAT`, `ZSTATUS`), migration
numbers and `PROTOCOL_VERSION` are numbers someone picks by hand, and parallel branches pick the same one. The Smoker, Screecher, Crawler, Flammer and
Mother all claimed ids someone else had (`ZTYPE` 17 was both the Crawler and the Mother; protocol 52 was claimed
twice). Three weapon PRs all took recipe 43.

- **What can and cannot move:** `ITEM`, `SOUND`, `ZTYPE` and the other wire ids are part of the protocol and of saved
  data. Once main has deployed an id it never changes. The branch merging later takes the next free id. A migration
  number main has already run never changes either.
- **Resolve:** keep main's ids. Renumber the branch's to the next free id that no open PR uses. Check open PRs over
  REST (GraphQL is blocked in cloud sessions):

  ```sh
  gh api 'repos/webdevcody/survive-the-night-fps/pulls?state=open&per_page=100' --jq '.[].number' |
    while read n; do gh api "repos/webdevcody/survive-the-night-fps/pulls/$n/files" --paginate \
      --jq ".[] | select(.filename | test(\"shared/(defs|protocol)|server/db/migrations\")) | \"#$n \(.filename)\n\(.patch // \"\")\"" ; done |
    grep -E '^#|^\+.*: *[0-9]+,|migrations/'
  ```

  Then search the branch for every use of the old number, not just the name: tests, comments and docs often spell
  the number out ("the screecher is act 14").
- **Weapons:** the 50 to 69 block is full. The next weapon takes an id from 100 up (`u8`, so up to 255).
- **Zombie kinds:** a player's bestiary record is a bitmask with a bit per `ZTYPE` (`1 << t` in `shared/bestiary.js`),
  which breaks past 30. The top kind is 20, so about ten more fit before it needs a different record.
- **Refactor:** reserve a range per kind of thing (weapons 100 to 149, sounds per system) and add a test that prints
  the next free id in each range. **Done in part:** a clash throws at load in `ITEM` and in every hand-numbered table
  of `defs.js` and `protocol.js` (`uniqueIds`, `shared/ids.js`), and `node scripts/test-wire-ids.js` prints each
  table's next free id.

### 4. Facts about a kind kept in lists elsewhere

A new zombie kind is registered by hand in about 15 places (issue #347). Miss one and nothing fails: the kind
silently gets red blood, no XP or the wrong difficulty scaling. Each of those lists is also a conflict waiting to
happen.

- **Still in the code:** the green-blood test is written out four times (`server/combat.js`, `client/game/game/shots.js`,
  twice in `client/game/entities.js`); which kinds Ember/Blackout scales (`server/spawns.js`); XP per kind
  (`shared/progress.js`); wave weights (`server/spawns.js`); 20 `ztype ===` checks in `client/game/entities.js`
  (now a table keyed by kind, `client/game/entities/zombiekinds.js`).
- **Resolve:** add the new kind to every copy. Grep for a sibling kind (`ZTYPE.SMOKER`) to find them all, since the
  conflict only shows the copies both branches touched.
- **Refactor:** issue #347, step 1. Put `blood`, `special`, `xp`, `waveWeight(night, wave)`, `sounds` and `lod` on the
  kind's `ZOMBIE_DEFS` row and read them from there. A new kind is then one row and one specials file, and the
  conflicts in `progress.js`, `spawns.js` and `bestiary.js` stop.

### 5. A version number with its history on the same line

`PROTOCOL_VERSION` was one line: the number, then a comment with every version since 26. Any two branches that bump it
conflict, which is right, since two protocol changes do need a new number. But the conflict hides the real question
under a 3,000-character line.

- **Resolve:** take main's number plus one, and keep both history notes: main's for its number, the branch's for the
  new one. If main moved past the number the branch claimed, fix the branch's comments and memory notes that name it.
- **Refactor:** move the history onto its own lines above the constant, one version per line. The number line then
  conflicts only when it should, and the history merges cleanly. **Done:** add the new version's line at the end of
  the history.

### 6. Display text that names every member of a set

"Kill one with the pistol or the revolver" changed with every new sidearm. #354 fixed that one. Watch for new ones:
achievement, tip and bestiary text that lists items or kinds by name.

- **Refactor:** describe the set ("a sidearm"), or build the sentence from the list.

### 7. One random stream for everything

The server draws everything from `game.rng`. A branch that adds one draw (the Mother's 1-in-20 roll) moves every
draw after it, and seeded tests that have nothing to do with the change start failing (`test-trunk`,
`test-screecher`). After a merge, a seeded test failing in an unrelated system is usually this, not a bug.

- **Resolve:** give the new roll its own `mulberry32` stream, the way the Mother's `motherRng` and the world's places
  do. Do not re-pick the test's seed to make it pass.
- **Refactor:** a stream per system (spawns, loot, specials, weather), so a change in one never moves another.

### 8. Very large files

`server/game.js` (5,800 lines), `client/game/game.js` (4,600; since split into `client/game/game/`), `client/render/models/weapons.js` (1,900 since its held items moved out),
`client/render/models/characters.js` (5,500) and `client/ui/menus.js` (now split into `splash.js` and `pause.js`) are where unrelated features meet. A conflict
in one of them is often two features that only share a file.

- **Resolve:** read both sides whole. These are the conflicts where logic really can clash: two HUD meters drawn in the
  same frame, two handlers for the same message.
- **Refactor, in order of payoff:**
  1. Done: the client half of a weapon (builder, `VM` entry, hand poses, pickup lay) is
     `client/render/models/weapons/<name>.js` and its icon `client/ui/icons/<name>.js`, finishing what #354 started.
     A new gun adds those two files and a line in each folder's `index.js`, and edits neither `weapons.js` nor
     `icons.js`.
  2. A zombie kind's model, pose and sounds into `client/render/models/zombies/<kind>.js`, the client twin of
     `server/specials/`. The models and poses are there (`zombies/index.js` builds the tables `characters/` reads),
     and the client's per-kind view facts are one table (`client/game/entities/zombiekinds.js`); the sounds are still
     to move.
  3. HUD meters (shove, fire, pin) out of `client/game/game.js` into one module, one meter each. **Done**:
     `client/game/hudmeters.js`; the rest of `client/game/game.js` is split into `client/game/game/`, one file per
     responsibility.

### 9. Moved code

After a big move (#354, #355), an older branch's change lands in a file that no longer has that code. Git may report
a conflict, or worse, merge cleanly and leave the change in dead code.

- **Resolve:** for each hunk the branch changed in the old place, find the code's new home and make the change there
  by hand. Then grep for the branch's new names to confirm they live in one place only.

### 10. Committed build output

`merge-dist/` (a built client bundle) came in with a merge on 3 October and is still tracked. Nothing reads it.

- **Resolve:** never resolve a conflict inside generated files. Rebuild them, or drop them.
- **Refactor:** `git rm -r merge-dist` and add it to `.gitignore`.

## Each conflict is a design question

A conflict shows where two features meet. Before taking both sides, ask what the meeting means for the game, using the
pillars in [design.md](design.md):

- **Two features adding to the same list** (two specials in one night's weights, two HUD meters, two menu screens):
  does the player now get too much at once? Fast pace means fewer screens and meters, not more. A third meter on the
  HUD may be one meter too many.
- **Two branches changing the same number** (a weapon's damage, a kind's XP, a wave weight): the balance was tuned
  twice, each time against a game without the other change. Take the numbers that make sense together, and say so in
  the PR's Metrics table.
- **A feature that lets one player go it alone, merged with one that needs the group:** Together or not at all
  decides. Flag it to the owner rather than picking.
- **A conflict in a side system** (cards, wagers, cosmetics): ask whether the side system still earns its place. The
  owner cuts side games that pull the group out of the run.

## Order to do the refactors in

| # | Refactor | Ends conflicts in | Size |
|---|---|---|---|
| 1 | Kind facts on `ZOMBIE_DEFS` (#347 step 1) | `progress.js`, `spawns.js`, `combat.js`, `entities.js`, `bestiary.js` | medium |
| 2 | `PROTOCOL_VERSION` history one line per version (**done**) | `protocol.js` | small |
| 3 | One entry per line: `KINDS`, the `\|\|` chain (`XP.kinds` is read from the kinds' rows now) | `specials/index.js`, `spawns.js` | small |
| 4 | Id ranges and a "next free id" test for `ITEM`, `SOUND`, `ZTYPE` (clash guard and next-free test **done**: `test-wire-ids.js`) | `defs.js` | small |
| 5 | Remove `merge-dist/` | nothing today, but it is noise in every search | small |
| 6 | Client weapon files (builder, `VM`, icon): done | `weapons.js`, `icons.js` | large |
| 7 | Client zombie files (model, pose, sounds) | `characters.js`, `entities.js`, `audio.js` | large |
| 8 | A random stream per system | seeded tests breaking after merges | medium |
| 9 | HUD meters module (**done**: `client/game/hudmeters.js`) | `client/game/game.js` | medium |
