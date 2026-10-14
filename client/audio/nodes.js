// Small WebAudio helpers shared by the engine, the ambience and the score.

// place a PannerNode (AudioParams where the browser has them, the old setter where it does not)
export function setPannerPos(p, x, y, z) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}
