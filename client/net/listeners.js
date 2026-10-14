// What the account, friends, progress, achievements and the bestiary tell whoever is listening (the menus, the HUD).

// The listeners of one kind of news: on(fn) adds one and returns the way to stop; emit(...args) tells every one (one
// that throws is reported, and the rest are still told)
export function listeners() {
  const subs = new Set();
  return {
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit(...args) {
      for (const fn of subs) {
        try {
          fn(...args);
        } catch (err) {
          console.error(err);
        }
      }
    },
  };
}
