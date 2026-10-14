// Polylines laid out by the world's generators (mine.js, rail.js): [[x, z], ...] as points a metre apart.
import { clamp } from './rng.js';

// a polyline as points a metre apart (the last gap as near that as the length allows): { x, z, n, len }
// (the last point is where the walk along the line ended, which can miss the line's end by a rounding error)
export function resample(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const n = Math.max(2, Math.round(len) + 1);
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const step = len / (n - 1);
  let seg = 1;
  let done = 0; // length of the segments before `seg`
  for (let i = 0; i < n; i++) {
    const at = i * step;
    while (seg < pts.length - 1 && done + Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]) < at) {
      done += Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]);
      seg++;
    }
    const sl = Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]) || 1;
    const t = clamp((at - done) / sl, 0, 1);
    x[i] = pts[seg - 1][0] + (pts[seg][0] - pts[seg - 1][0]) * t;
    z[i] = pts[seg - 1][1] + (pts[seg][1] - pts[seg - 1][1]) * t;
  }
  return { x, z, n, len };
}
