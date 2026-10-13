// The flammer (ZTYPE.FLAMMER): what the survivors built catches from it as it comes past
import { structBurns } from '../../shared/defs.js';
import { ENT } from '../../shared/protocol.js';
import { footprintContains } from '../../shared/collision.js';

const _lq = [];

export const methods = {
  // The flammer sets alight the nearest piece of what the survivors built that will burn (structBurns) and is not
  // burning already, within igniteRange m of its body; then not again for igniteRate s (sooner when nothing caught)
  igniteNear(z) {
    const g = this.g;
    const def = z.def;
    z.igniteT = 0.25;
    let best = null;
    let bd = Infinity;
    for (const c of g.world.structGrid.query(z.x, z.z, def.radius + def.igniteRange + 3.5, _lq)) {
      const s = g.ents[c.id];
      if (!s || s.kind !== ENT.STRUCTURE || s.removed || s.fire > 0 || !structBurns(s.stype)) continue;
      if (z.y > c.y1 || z.y + def.height < c.y0 || !footprintContains(c, z.x, z.z, def.radius + def.igniteRange)) continue;
      const d = Math.hypot(c.x - z.x, c.z - z.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    g.igniteStructure(best);
    z.igniteT = def.igniteRate * (0.8 + g.rng() * 0.4);
  },
};
