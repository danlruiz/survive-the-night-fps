---
name: resolve-conflicts
description: Merge main into a Survive The Night branch and resolve its conflicts safely (wire ids, protocol version, moved code, kind lists), then report what each conflict says about the code's structure and the game's design. Use whenever asked to resolve merge conflicts, merge or rebase main into a branch, fix a PR that "can't be merged", or renumber ids after another PR landed.
---

# Resolve merge conflicts

Most conflicts here are two branches adding to the same list or taking the same id, not two changes to the same
logic. Resolving them is mechanical once you know which kind each one is. Each conflict also shows where two features
meet, so it is a cheap moment to ask whether the code or the game should be shaped differently.

## 1. Read the guide

**Read [docs/merge-conflicts.md](../../../docs/merge-conflicts.md) now.** It lists the smells (numbered 1 to 10),
how to resolve each, and what #354 (weapons in a file each), #355 (specials in a file each) and the October cleanup
(the big files split by responsibility) moved. Every rule below points into it.

## 2. Merge main in

```sh
git fetch origin main            # a shallow clone may need --depth=500 to find the merge base
git status --short               # commit or stash anything left first
git merge origin/main            # merge, don't rebase: branches here are shared and already pushed
git diff --name-only --diff-filter=U
```

## 3. Sort each conflict

For every conflicted hunk, name its smell from the guide before touching it:

| Looks like | Smell | Resolve |
|---|---|---|
| Both sides added an entry to the same list or line | 1, 2 | keep both; count entries on each side so none is lost |
| Both sides took the same `ITEM`, `SOUND`, `ZTYPE`, `EVT`, `C2S`/`S2C`, status bit, act or migration number | 3 | main keeps its id; the branch takes the next free id no open PR uses (the guide's REST check), then greps for the old number everywhere, tests and comments included |
| `PROTOCOL_VERSION` | 5 | main's number plus one; keep main's history note and add the branch's under the new number |
| The old one-line `test` script in `package.json` | fixed | take main's line; `npm test` finds `scripts/test-*.js` by name |
| A recipe id that is an array index (`ACT.CRAFT, 43`) | fixed by #354 | the recipe's id is its item (`ACT.CRAFT, ITEM.X`) |
| The branch changed code that main moved (weapon rows out of `defs.js`, specials out of `zombies.js`, wave weights out of `game.js`; the October cleanup's splits, listed in the guide) | 9 | make the branch's change by hand in the code's new home; drop the old copy |
| Two features changed the same logic in a big file | 8 | read both sides whole; this is the one kind that can really clash |
| Generated files (`merge-dist/`, a built bundle) | 10 | never hand-merge; rebuild or drop |
| Both sides tuned the same number | design | take the numbers that make sense together and say so in the PR's Metrics table |

If two features clash in what the player gets (not just in the text), do not pick one: ask the owner.

## 4. Look past the markers

A clean merge can still be wrong. Before committing:

- **Kind lists (smell 4).** If the branch adds a zombie kind or main added one, grep for a sibling kind
  (`rg 'ZTYPE\.SMOKER'`) and make sure the new kind is everywhere it should be: its `ZOMBIE_DEFS` row's fields (green
  blood, Ember/Blackout scaling, XP, wave weight, sounds, lod), the bestiary, its specials file and the client's
  tables (its model in `client/render/models/zombies/`, `client/game/entities/zombiekinds.js`, motifs and sound
  banks). Git only shows the lists both sides touched.
- **Moved code (smell 9).** `rg` the branch's new names. Each should live in one place, and that place should exist
  on main.
- **Renumbered ids.** `rg` for the old number as well as the name.

## 5. Check it

Run what covers the merge, not the whole suite (it takes about an hour; run it only when asked):

```sh
node scripts/check.js
node -e "import('./shared/defs.js')"          # clashing item ids and recipes throw here
node scripts/test-protocol.js
node scripts/test-<each system either side touched>.js
```

Add `test-weapons.js` for a weapon, `test-bestiary.js`, `test-characters.js` and `sim-smoke.js` for a zombie kind,
`test-recipes.js` and `test-salvage.js` for crafting. A seeded test failing in a system neither side touched is usually
smell 7 (one random stream): give the new roll its own stream, never change the test's seed.

## 6. Commit

Name what was renumbered in the merge commit, so the next person can find it:

```
Merge main (the crawler) into flammer-zombie: the flammer is ZTYPE 18, protocol 53
```

Push the branch (`git push -u origin HEAD`). Never push to `main`: that redeploys the live game.

## 7. Report what the conflicts say

End with a short report to the user, one line per conflict:

- **What collided and how it was resolved**, naming any id or version that changed.
- **The smell** (its number in the guide) and **the refactor that would have prevented it**. If the guide already
  ranks that refactor, say how many times it has now come up. If it is a smell the guide does not have, say so and
  offer to add it.
- **A design question, when there is one**, from the guide's "Each conflict is a design question": two features
  crowding the same moment, a number tuned twice, something that lets one player go it alone. Name the pillar from
  [docs/design.md](../../../docs/design.md) it touches.

Keep it to what the user can act on: a refactor worth opening an issue for, or a design call only they can make.
