// The ships moored in a world (world.ships: the docks' freighter on the mainland), drawn: a model each from the props'
// kit (models/props.js freighter_hull), standing still where the world says. Drawn only - the place lays its solids down
// as parts of its own (hidden boxes: shared/mainland.js, the freighter) - so a ship is no prop: nothing is measured,
// searched or struck as one. -> the groups added to the scene ([] on a world with none)
import { createProp } from './models/props.js';

export function buildShips(scene, world) {
  const out = [];
  for (const s of world.ships || []) {
    const g = createProp(s.type, 0);
    g.name = 'ship';
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.ry;
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.updateMatrixWorld(true);
    g.traverse((o) => (o.matrixAutoUpdate = false));
    scene.add(g);
    out.push(g);
  }
  return out;
}
