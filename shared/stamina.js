// Stamina: the same rules wherever it is spent - a sprint (playersim.js), a bicycle's pedals (vehicles.js), a
// handcar's lever (handcar.js), a nunchucks move (nunchaku.js) - and however it comes back.
import { STAMINA_MAX, STAMINA_REGEN, STAMINA_REGEN_DELAY, STAMINA_UNLOCK } from './constants.js';

// Spends `amount`: none comes back until STAMINA_REGEN_DELAY has passed, and run dry the survivor is exhausted (the
// 'exhausted' event) until it is back up to STAMINA_UNLOCK
export function spendStamina(s, amount, events) {
  s.stamina -= amount;
  s.staminaDelay = STAMINA_REGEN_DELAY;
  if (s.stamina <= 0) {
    s.stamina = 0;
    s.exhausted = 1;
    if (events) events.push({ type: 'exhausted' });
  }
}

// A command spent easy: the delay runs down, then the stamina comes back at STAMINA_REGEN a second
export function recoverStamina(s, dt) {
  if (s.staminaDelay > 0) s.staminaDelay -= dt;
  else s.stamina = Math.min(STAMINA_MAX, s.stamina + STAMINA_REGEN * dt);
  if (s.exhausted && s.stamina >= STAMINA_UNLOCK) s.exhausted = 0;
}
