// The lobby: the games running on the server (server/rooms.js), making one, and invite links.
//
// A game is known by its code. An invite link is the page's address with ?game=CODE: opening one puts that game on
// the splash, and Join goes straight into it. While in a game the address bar carries its link, so a reload goes
// back into the same game and the address itself can be shared.

import { call, post } from './api.js';

const CODE = /^[A-Z2-9]{6,10}$/;

// the code of the game this page was opened for, or ''
export function linkedCode() {
  try {
    const c = new URLSearchParams(location.search).get('game');
    const code = String(c || '').trim().toUpperCase();
    return CODE.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function inviteLink(code) {
  return `${location.origin}${location.pathname}?game=${encodeURIComponent(code)}`;
}

// puts the game's link in the address bar ('' takes it out), without a reload or a history entry
export function showCodeInAddress(code) {
  try {
    const url = new URL(location.href);
    if (code) url.searchParams.set('game', code);
    else url.searchParams.delete('game');
    history.replaceState(history.state, '', url);
  } catch {}
}

// { list: [game], games, maxGames, canCreate, players, defaultPlayers, maxPlayers }
// game: { code, name, players, seats, max, full, phase, day, seed, inviteOnly, difficulty, ready, ageS }
export const listGames = () => call('/api/games');

// The all-time board can be read before joining a game (the in-game board still comes over its game socket, where
// it can also mark the player and everyone in that game).
export const getLeaderboard = () => call('/api/leaderboard');

// one game by its code (invite-only ones too); rejects with err.status 404 when there is none
export const gameInfo = (code) => call(`/api/games/${encodeURIComponent(code)}`);

// makes a game: { name, host, inviteOnly, maxPlayers, difficulty } -> its info, code included
export const createGame = (opts) => post('/api/games', opts, 8000);
