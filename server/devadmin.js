// Who may switch on DEV_ADMIN (every player may run the admin chat commands, signed in or not): only a server whose
// NODE_ENV is development or test. `npm start` (and so every deploy) sets NODE_ENV=production, where it is ignored
// whatever DEV_ADMIN says; nothing a client sends reaches it.
export function devAdminAllowed(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) && env.DEV_ADMIN === '1';
}

// A game that starts on the mainland is for whoever has beaten map 1 - and for an admin: a signed-in one, or everybody
// on a development server (DEV_ADMIN). user: the account a request or socket is signed in to, or null
export const mayPlayMap2 = (user) => !!user?.isAdmin || devAdminAllowed();
