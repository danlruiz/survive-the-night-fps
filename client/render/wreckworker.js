// Module worker: a wreck's model cut finer and sorted into its solid pieces (wreckgeo.js refine, islands) off the main
// thread, for Wrecks.prefetch. Typed arrays in, typed arrays out: the same code the main thread runs when a blow
// comes first (Wrecks.fineModel), so the model is the same whichever made it.
import { refine, islands } from './wreckgeo.js';

const CHANS = ['pos', 'nrm', 'uv', 'col', 'ground', 'tint'];

self.onmessage = (e) => {
  const { key, gen, edge, pieces } = e.data;
  try {
    for (const p of pieces) refine(p, edge);
    const isles = islands(pieces, (x, y, z, o) => ((o[0] = x), (o[1] = y), (o[2] = z), o));
    const bufs = [];
    for (const p of pieces) for (const c of CHANS) if (p[c]) bufs.push(p[c].buffer);
    for (const s of isles) bufs.push(s.verts.buffer);
    self.postMessage({ key, gen, pieces, isles }, bufs);
  } catch (err) {
    self.postMessage({ key, gen, error: String((err && err.stack) || err) });
  }
};
