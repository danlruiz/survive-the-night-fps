// A key named on screen: its cap, and a key with what it does beside it, as the screens' footers list them. A key
// given as a function of the binds (() => bindLabel('map')) is kept up to date when they change (liveText).
import { el } from './dom.js';
import { liveText } from '../game/binds.js';

export function keyCap(parent, key) {
  if (typeof key === 'function') return liveText(el('span', 'kbd sm', parent), key);
  return el('span', 'kbd sm', parent, key);
}

// <span class=cls>: the key's cap, then what it does
export function keyHint(parent, cls, key, text) {
  const s = el('span', cls, parent);
  keyCap(s, key);
  el('span', '', s, text);
  return s;
}
