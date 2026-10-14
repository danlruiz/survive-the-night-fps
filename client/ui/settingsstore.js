// The settings as they are kept: their defaults, the range or the choices each may take, and loading and saving them
// (localStorage 'stn.settings'). The panel that changes them is settings.js.
import { lsGet, lsSet, clamp } from './dom.js';
import { touchDevice } from '../game/touchmode.js';

const KEY = 'stn.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1.0,
  aimSensitivity: 1.0,
  fov: 75,
  masterVolume: 0.4,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  voiceVolume: 1, // 100% = the level the mix is balanced at (voice-chat.js VOICE_BUS); the slider runs to 200%
  voiceDuck: true,
  motifs: true, // a short phrase in the music for each kind of special as it comes and again as it closes in (audio/motifs.js)
  quality: 'medium',
  grassDistance: 1, // x the quality preset's grass radius (0: no grass at all)
  renderScale: 1,
  ps1: false,
  ps1Strength: 0.5,
  highlight: 'subtle', // the outline on what [E] would act on (game/highlight.js): off / subtle / strong
  pushToTalk: true,
  invertY: false,
  rawMouse: true,
  fullscreen: true,
  weaponSway: true,
  keyHints: true,
  tutorial: true, // the onboarding coach on a player's first playthrough, and the first-time tips after it (game/onboarding.js)
  holdToDrop: true, // the drop key has to be held a moment (game/drophold.js), so a stray press keeps the gun
  showFps: true,
  achBanners: true, // a banner when an achievement unlocks (ui/achtoasts.js)...
  achSound: true, // ...and its chime
  heardRings: true, // a ring on the minimap, and the dead it woke lit, every time your noise wakes the dead (ui/heard.js); off: once for each kind of noise
  hudScale: 1, // the HUD's size (ui/hud.js, ux-hud.css): a short window at this size gets the compact layout
  // Accessibility
  cameraShake: 1, // x the view's shake (client/game/game/: explosions, a tank's footfalls, hits, crashes); 0 holds it still
  viewBob: true, // the view rising and falling with each stride (and riding the water, afloat)
  reduceFlashes: false, // muzzle flashes, blasts and lightning drawn far dimmer (render/comfort.js)
  aimMode: 'hold', // 'toggle': a press of the key latches the button on, the next lets go (game/input.js)
  sprintMode: 'hold',
  crouchMode: 'hold',
  touchControls: 'auto', // on-screen controls (game/touchmode.js): auto = on a phone or a tablet
  touchLook: 1, // how far a finger's drag turns the view
  touchSize: 1, // the touch buttons' size
});

const NUM_RANGES = {
  sensitivity: [0.1, 3],
  aimSensitivity: [0.25, 2],
  fov: [60, 100],
  masterVolume: [0, 1],
  musicVolume: [0, 1],
  sfxVolume: [0, 1],
  voiceVolume: [0, 2],
  renderScale: [0.5, 1],
  grassDistance: [0, 3],
  ps1Strength: [0.1, 1],
  cameraShake: [0, 1],
  hudScale: [0.75, 1.5],
  touchLook: [0.2, 3],
  touchSize: [0.75, 1.4],
};
const ENUMS = {
  quality: ['low', 'medium', 'high', 'ultra'],
  highlight: ['off', 'subtle', 'strong'],
  aimMode: ['hold', 'toggle'],
  sprintMode: ['hold', 'toggle'],
  crouchMode: ['hold', 'toggle'],
  touchControls: ['auto', 'on', 'off'],
};

// the settings that are on or off: every one whose default is
const FLAGS = Object.keys(DEFAULT_SETTINGS).filter((k) => typeof DEFAULT_SETTINGS[k] === 'boolean');

export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s && typeof s === 'object') {
    for (const k of Object.keys(NUM_RANGES)) {
      const v = Number(s[k]);
      if (Number.isFinite(v)) out[k] = clamp(v, NUM_RANGES[k][0], NUM_RANGES[k][1]);
    }
    for (const k in ENUMS) if (ENUMS[k].includes(s[k])) out[k] = s[k];
    for (const k of FLAGS) if (typeof s[k] === 'boolean') out[k] = s[k];
  }
  return out;
}

export function loadSettings() {
  let s = null;
  try {
    s = JSON.parse(lsGet(KEY, 'null'));
  } catch {}
  // a phone's first visit: the settings a phone can run (the low preset, at a little under its own pixels)
  if (!s && touchDevice()) return sanitizeSettings({ quality: 'low', renderScale: 0.85, grassDistance: 0.7 });
  return sanitizeSettings(s);
}

export function saveSettings(s) {
  lsSet(KEY, JSON.stringify(s));
}
