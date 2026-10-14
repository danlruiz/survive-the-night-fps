// Hand-numbered wire ids (SOUND, ZTYPE, EVT, NOTIFY...). Each number is a thing both ends must tell apart, and
// parallel branches pick the same next free number (docs/merge-conflicts.md, "Hand-picked ids"). Every such table is
// made through uniqueIds, so two names on one number stop the game from loading, as two items on one id do (ITEM in
// defs.js). (shared/protocol.js keeps a copy of its own: it must load without importing anything.)
export function uniqueIds(name, table) {
  const names = new Map();
  for (const [key, id] of Object.entries(table)) {
    if (names.has(id)) throw new Error(`${name}.${key} and ${name}.${names.get(id)} are both ${id}`);
    names.set(id, key);
  }
  return table;
}
