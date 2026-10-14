// The test everything in the crosshair is picked by (Entities.pick and pickMate, the handcars, the fair, the bell and
// the radio): does the view ray pass close enough to a point?

// How far along the ray from (ox, oy, oz) along (dx, dy, dz) (of unit length) it passes within r of (x, y, z): t, or -1
// when it passes wider, or the point is behind the eye. How far is too far is the caller's
export function rayNear(ox, oy, oz, dx, dy, dz, x, y, z, r) {
  const rx = x - ox;
  const ry = y - oy;
  const rz = z - oz;
  const t = rx * dx + ry * dy + rz * dz;
  if (t < 0) return -1;
  const px = rx - dx * t;
  const py = ry - dy * t;
  const pz = rz - dz * t;
  return px * px + py * py + pz * pz > r * r ? -1 : t;
}
