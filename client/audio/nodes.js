// Small WebAudio helpers shared by the engine, the ambience and the score.

// place a PannerNode (AudioParams where the browser has them, the old setter where it does not)
export function setPannerPos(p, x, y, z) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}

// a GainNode at a starting gain
export function gainNode(c, v) {
  const n = c.createGain();
  n.gain.value = v;
  return n;
}

// a BiquadFilterNode of the given type, cutoff (Hz) and Q (left at the browser's default when not given)
export function biquad(c, type, hz, q) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  if (q !== undefined) f.Q.value = q;
  return f;
}
