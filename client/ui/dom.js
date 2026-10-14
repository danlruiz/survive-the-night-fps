// Small DOM helpers shared by the UI modules. User-provided text is only ever set via textContent.

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// A <button type="button">: never submits a form it sits in.
export function button(cls, parent, text) {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  return b;
}

// ONLY for trusted, static markup (our own SVG icon strings). Never pass user text here.
export function svgEl(tag, cls, parent, trustedMarkup) {
  const e = el(tag, cls, parent);
  e.innerHTML = trustedMarkup;
  return e;
}

// A <button type="button"> holding trusted, static markup (an icon). Never pass user text here.
export function iconButton(cls, parent, trustedMarkup) {
  const b = svgEl('button', cls, parent, trustedMarkup);
  b.type = 'button';
  return b;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// has the player asked for less motion? (then no slides, shines or confetti; a scroll jumps)
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec || 0));
  const m = (s / 60) | 0;
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

// Replay a CSS animation class on an element (forces restyle).
export function replay(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

// Parse a prompt like "[E] Pick up Cloth ×3" into { key: 'E', text: 'Pick up Cloth ×3' }.
export function parsePrompt(s) {
  const m = /^\s*\[([^\]]{1,12})\]\s*(.*)$/.exec(s);
  return m ? { key: m[1], text: m[2] } : { key: '', text: s };
}
