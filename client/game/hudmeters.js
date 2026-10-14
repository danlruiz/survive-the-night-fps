// The HUD's mash meter (ui/hud/center.js draws it: h.shove 0..1, -1 while it is down, with h.shoveText, h.shoveKey and the
// presses so far, each of which jolts it). One meter here for each thing that puts it up; the first one up has it.
// Game.updateHud (game/hud.js) fills them in once a frame.
import { PIN_FACE } from '../../shared/constants.js';
import { PLAYER_FIRE } from '../../shared/defs.js';
import { ENT, PFLAG, PSTAT } from '../../shared/protocol.js';
import { touchMode } from './touchmode.js';
import { bindLabel } from './binds.js';

export function updateMeters(g, s, h) {
  const face = s.pinned === PIN_FACE; // (a crawler on the face: shaken off with the mouse)
  pinMeter(g, s, h, face);
  fireMeter(g, s, h);
  h.shoveKey = h.shove >= 0 ? (face ? (touchMode() ? 'Swipe' : 'Mouse') : bindLabel('jump')) : '';
  h.shoves = (g.shoves | 0) + g.inputBuffer.firePresses;
}

// pinned by a leaper: the shove meter (-1: not pinned). Each press of jump adds to it (shared/playersim.js SHOVE_PRESS);
// a crawler on the face is thrashed off instead
function pinMeter(g, s, h, face) {
  h.shove = g.self.alive && s.pinned && !s.zombie ? s.shove : -1;
  h.shoveText = face ? 'Thrash your head about to tear it off' : 'Mash to shove it off';
}

// ...or the same meter for a fire (a flammer's doing: PLAYER_FIRE): each press of [Space] beats it down - ours, or
// that of the teammate beside us we are beating the flames out on. While it is up a quick tap of jump goes straight
// through the input buffer, and a fire on us roars
function fireMeter(g, s, h) {
  const self = g.self;
  const burning = !!self.burning && !!self.alive && !s.zombie && !s.downed;
  if (g.frame % 6 === 1) g.fireMate = burning || !self.alive || s.zombie || s.downed ? null : burningMate(g, s);
  const mate = !burning && g.fireMate && g.entities.ents.get(g.fireMate.id) === g.fireMate ? g.fireMate : null;
  if (h.shove < 0 && (burning || mate)) {
    h.shove = self.douse || 0;
    h.shoveText = burning ? 'Mash to put the fire out' : `Mash to beat out the fire on ${g.name(mate.id)}`;
  }
  h.onFire = burning;
  g.inputBuffer.passJump = burning || !!mate;
  if (burning !== !!g.burnLoop) {
    if (burning) g.burnLoop = g.audio.createLoop?.('burning', s.x, s.y + 1, s.z) || null;
    else {
      g.burnLoop?.stop();
      g.burnLoop = null;
    }
  }
  g.burnLoop?.setPosition(s.x, s.y + 1, s.z);
}

// the teammate on fire within reach of our [Space] (PLAYER_FIRE: the server puts out the nearest), or null
function burningMate(g, s) {
  let best = null;
  let bd = PLAYER_FIRE.reach;
  for (const e of g.entities.ents.values()) {
    if (e.kind !== ENT.PLAYER || e.id === g.myId || !(e.q[9] & PSTAT.BURNING) || e.q[5] & (PFLAG.DEAD | PFLAG.ZOMBIE)) continue;
    const d = Math.hypot(e.rx - s.x, e.rz - s.z);
    if (d < bd && Math.abs(e.ry - s.y) < 1.5) {
      bd = d;
      best = e;
    }
  }
  return best;
}
