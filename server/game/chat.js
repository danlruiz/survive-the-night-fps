// Chat: what a player types goes to everyone in the game (a '/' line from an admin is a command instead:
// server/game/commands.js), a line from the game itself to one player (sendChat) or to all (systemChat), and the
// walkie-talkie every survivor carries, which the voice and an achievement go by (onAir, radioInHand).
import { SLOT_RADIO } from '../../shared/constants.js';
import { S2C, CHATF, Writer } from '../../shared/protocol.js';
import { radioKeyed } from '../../shared/playersim.js';

export const methods = {
  handleChat(p, text) {
    text = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (!text) return;
    // Old clients may still send `/admin <password>`; consume it so a former secret is never broadcast as chat.
    if (/^\/admin(?:\s|$)/i.test(text)) return this.sendChat(p, 0, CHATF.SYSTEM, 'Admin access comes from your signed-in account.');
    if (p.admin && text.startsWith('/')) {
      const args = text.slice(1).split(/\s+/);
      this.track.event('admin', p, { command: args.join(' ').slice(0, 60) }); // (a match with these in it is no ordinary one)
      return this.debugCommand(p, args);
    }
    if (this.time - p.chatT > 5) {
      p.chatT = this.time;
      p.chatCount = 0;
    }
    if (++p.chatCount > 6) return;
    // text chat reaches everyone in the game, wherever they are (the voice still carries only so far: TALK_RANGE)
    if (this.radioInHand(p)) this.ach.onAir(p);
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(p.id);
    w.u8(p.zombie ? CHATF.ZOMBIE : 0);
    w.str(text);
    this.broadcast(w.bytes());
  },
  sendChat(to, id, flags, text) {
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(id);
    w.u8(flags);
    w.str(text);
    to.session.conn.send(w.bytes());
  },
  // every survivor carries a walkie-talkie (SLOT_RADIO; the dead and the turned have none)...
  hasWalkie(p) {
    return p.alive && !p.zombie;
  },
  // ...chat said with it in hand counts towards its achievement...
  radioInHand(p) {
    return this.hasWalkie(p) && p.state.slot === SLOT_RADIO;
  },
  // ...and while it is keyed, so does the voice (the clients route it, told by the player list: PLF.ON_AIR)
  onAir(p) {
    return this.hasWalkie(p) && radioKeyed(p.state);
  },

  systemChat(text) {
    const w = new Writer(text.length * 3 + 8);
    w.u8(S2C.CHAT);
    w.u16(0);
    w.u8(CHATF.SYSTEM);
    w.str(text);
    this.broadcast(w.bytes());
  },
};
