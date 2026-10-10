// UI sandbox: ?screen=map - the field map [M] over a real world with a made-up moment: you between the car and the
// nearest place, a teammate out and one down, a supply in your pack, one on the ground, rumours, schematics, your
// waypoint and a teammate's, two pings and a supply drop. &act=2: the mainland. &seed=, &zoom= (1-4), &up=1 (facing
// up), &yaw= (rad), &solo=1 (no teammates), &keys=1 (small windows: the key popover open).
import { WORLD } from '../../shared/acts.js';
import { setAct, SUPPLIES } from '../game/act.js';

export async function mapScene(ui, q, buildScene) {
  buildScene(q.get('bg') || 'day');
  const act = +(q.get('act') || 1) === 2 ? WORLD.MAINLAND : WORLD.ISLAND;
  setAct(act);
  const { worldFor } = await import('../../shared/worlds.js');
  const world = worldFor(+(q.get('seed') || 1337), act);
  ui.hideSplash?.();
  try {
    if (q.get('zoom')) localStorage.setItem('stn.mapZoom', q.get('zoom'));
    localStorage.setItem('stn.mapHeadingUp', q.get('up') ? '1' : '0');
  } catch {}
  ui.map.setHeadingUp(!!q.get('up'));
  if (q.get('zoom')) ui.map.zoom = Math.max(1, Math.min(4, +q.get('zoom')));
  ui.map.setWorld(world);
  const car = world.car;
  const byCar = world.zones.map((z) => ({ z, d: Math.hypot(z.x - car.x, z.z - car.z) })).sort((a, b) => a.d - b.d).map((e) => e.z);
  const near = byCar[0];
  const self = { x: (car.x + near.x) / 2 + 30, z: (car.z + near.z) / 2 - 40, yaw: +(q.get('yaw') ?? 2.4) };
  const zid = (i) => byCar[Math.min(i, byCar.length - 1)].id;
  const at = (i) => byCar[Math.min(i, byCar.length - 1)];
  // a rumour for each supply (the fuel's three: one taken), schematics at five places, two of them found
  const hints = [zid(4), zid(2), zid(6), zid(5), zid(3), zid(8), zid(9)];
  const found = 1 << 1; // (the spare tyre's: it is in your pack)
  const schemHints = [zid(7), zid(10), zid(5), zid(11), zid(12)];
  const discovered = new Set(byCar.slice(0, Math.ceil(byCar.length * 0.6)).map((z) => z.id));
  const mates = q.get('solo')
    ? []
    : [
        { x: at(3).x + 6, z: at(3).z + 4, name: 'Marlowe', status: 'alive' },
        { x: at(5).x - 18, z: at(5).z + 20, name: 'Old Hank', status: 'downed' },
      ];
  const d = {
    self,
    mates,
    enemies: [],
    car,
    pings: [
      { x: self.x + 60, z: self.z - 70, kind: 1, name: 'Marlowe' },
      { x: at(3).x + 20, z: at(3).z + 26, kind: 2, name: 'Marlowe' },
    ],
    crates: [{ x: at(1).x + 50, z: at(1).z - 40 }],
    benches: [{ x: car.x + 12, z: car.z + 10 }],
    vehicles: [],
    parts: [{ item: SUPPLIES[4], x: at(8).x + 14, z: at(8).z - 8 }],
    discovered,
    hints,
    found,
    schemHints,
    unlocked: 0b00101,
    supplies: [1, 0, 1, 0, 1],
    carried: { [SUPPLIES[1]]: 1 },
    waypoint: { x: at(5).x, z: at(5).z, zone: at(5).id },
    teamWays: q.get('solo') ? [] : [{ x: at(3).x, z: at(3).z, zone: at(3).id, names: ['Marlowe'], mine: false }],
  };
  ui.screenRun = () => true; // (the map is a run's: all four tabs, the HUD's clock in their row)
  ui.setMapOpen(true);
  const tick = () => {
    ui.map.update(d);
    requestAnimationFrame(tick);
  };
  tick();
  if (q.get('keys')) setTimeout(() => ui.map.root.querySelector('.mx-keysbtn')?.click(), 200);
  return { world, d };
}
