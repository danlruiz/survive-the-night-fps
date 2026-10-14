// Reading a map's heightfield, the same on both maps (world/, mainland.js): a grid of n x n vertices GRID_STEP m
// apart, the first at (-half, -half). Each sampler is made by a small factory, so a world's heightAt keeps hold of its
// grid and nothing else that was built along with it.
import { GRID_STEP } from './constants.js';
import { clamp } from './rng.js';

// the ground at (x,z), interpolated on the triangle it falls in (matches the rendered mesh split along the i+j
// diagonal)
export function heightSampler(heights, n, half) {
  return (x, z) => {
    const fx = clamp((x + half) / GRID_STEP, 0, n - 1.001);
    const fz = clamp((z + half) / GRID_STEP, 0, n - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * n + i;
    const h00 = heights[k];
    const h10 = heights[k + 1];
    const h01 = heights[k + n];
    const h11 = heights[k + n + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
}

// the ground at (x,z), interpolated bilinearly (what the generators read while they still shape the grid)
export function bilinearSampler(heights, n, half) {
  return (x, z) => {
    const fx = clamp((x + half) / GRID_STEP, 0, n - 1.001);
    const fz = clamp((z + half) / GRID_STEP, 0, n - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * n + i;
    const a = heights[k] + (heights[k + 1] - heights[k]) * tx;
    const b = heights[k + n] + (heights[k + n + 1] - heights[k + n]) * tx;
    return a + (b - a) * tz;
  };
}

// the value of a per-vertex grid at the vertex nearest (x,z)
export function nearestSampler(grid, n, half) {
  return (x, z) => grid[clamp(Math.round((z + half) / GRID_STEP), 0, n - 1) * n + clamp(Math.round((x + half) / GRID_STEP), 0, n - 1)];
}
