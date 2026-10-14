// Game: building with the hammer - the ring of structures, the ghost of the piece being placed, and where it may go.
import * as THREE from 'three';
import { BUILD_REACH, SLOT_BUILD } from '../../../shared/constants.js';
import { ITEM_DEFS, STRUCT_DEFS, STRUCT_ORDER, SCHEM_BIT } from '../../../shared/defs.js';
import { ACT } from '../../../shared/protocol.js';
import { raycastWorld, makeBox, overlapBoxes, COL } from '../../../shared/collision.js';
import { planCost } from '../../../shared/autocraft.js';
import { createGhost } from '../../render/models/structures.js';
import { radialIndex } from '../../ui/build.js';

// the build ring's pointer (mouse px): how far out it goes, and how far it must be pushed to point at a structure
const BUILD_MENU_REACH = 120;
const BUILD_MENU_DEAD = 26;
// how far the piece being placed turns, in 256ths of a turn (ACT.BUILD sends the angle as one byte): a right click
// 45°, and with the fine-rotate key held (binds.js buildFine) a right click 11/256 (15.5°) and a notch of the wheel
// 2/256 (2.8°), either way
export const BUILD_ROT_STEP = 32;
export const BUILD_ROT_FINE = 11;
export const BUILD_ROT_WHEEL = 2;
const _ray = { t: -1, col: null, terrain: false };
const _v = new THREE.Vector3();
const _spot = { x: 0, y: 0, z: 0 };

export const methods = {
  // the build keys and the wheel: the next structure round the ring (opening it while none is picked yet), or with one
  // picked and the ring shut, the next one to place
  cycleBuild(dir) {
    const step = (t) => STRUCT_ORDER[(STRUCT_ORDER.indexOf(t) + dir + STRUCT_ORDER.length) % STRUCT_ORDER.length];
    if (!this.buildMenu && !this.buildPicked) this.openBuildMenu(false);
    const menu = this.buildMenu;
    if (menu) {
      menu.hover = step(menu.hover);
      const c = this.input.cursor;
      c.x = c.y = 0; // (or the pointer, still out over the old one, takes it straight back)
      this.audio.playLocal('ui_hover', { volume: 0.6 });
      return;
    }
    this.buildType = step(this.buildType);
    this.audio.playLocal('ui_click', { volume: 0.4 });
  },

  openBuildMenu(sound = true) {
    this.buildMenu = { hover: this.buildType };
    this.input.cursor = { x: 0, y: 0, r: BUILD_MENU_REACH };
    if (sound) this.audio.playLocal('ui_click', { volume: 0.4 });
  },

  closeBuildMenu(sound = false) {
    if (!this.buildMenu) return;
    this.buildMenu = null;
    this.input.cursor = null;
    if (sound) this.audio.playLocal('ui_click', { volume: 0.3 });
  },

  // the piece picked put down, the hammer still out (a click opens the ring again): false with none up
  dropBuildPick(sound = false) {
    if (!this.buildPicked) return false;
    this.buildPicked = false;
    if (sound) this.audio.playLocal('ui_click', { volume: 0.3 });
    return true;
  },

  pointBuildMenu(type) {
    const menu = this.buildMenu;
    if (!menu || menu.hover === type) return;
    menu.hover = type;
    this.audio.playLocal('ui_hover', { volume: 0.6 });
  },

  // a structure picked in the ring: its ghost goes up, to be placed. One whose schematic nobody has found stays shut.
  pickStructure(type) {
    const schem = STRUCT_DEFS[type]?.schem;
    if (schem && !((this.global.unlocked | 0) & (1 << SCHEM_BIT[schem]))) {
      this.ui.notify(`Locked · find the ${ITEM_DEFS[schem].name}`, 'warning', 1.5);
      this.audio.playLocal('build_fail', { volume: 0.5 });
      return;
    }
    this.buildType = type;
    this.buildPicked = true;
    this.closeBuildMenu();
    this.audio.playLocal('ui_click', { volume: 0.5 });
  },

  tryBuild() {
    const gh = this.ghostPlace;
    if (!gh) return;
    this.askedCost = STRUCT_DEFS[this.buildType].cost; // for NOTIFY.NOT_ENOUGH, should the server refuse
    this.conn.action(ACT.BUILD, this.buildType, gh.x, gh.z, this.buildRot);
  },

  updateBuildGhost(s) {
    const active = s.slot === SLOT_BUILD && !s.zombie && this.self.alive && !s.downed;
    for (const k in this.ghosts) this.ghosts[k].visible = false;
    this.ghostPlace = null;
    if (!active) {
      this.buildPicked = false; // (the hammer drawn again starts at the ring)
      this.closeBuildMenu();
      this.ui.setBuildMenu(null);
      return;
    }
    // (the pointer let go of - the pause menu, the inventory: the ring goes with it)
    if (this.buildMenu && (!this.input.enabled || !this.input.locked)) this.closeBuildMenu();
    const counts = this.invCounts();
    const ctx = this.craftContext();
    const unlocked = this.global.unlocked | 0;
    let menu = null;
    if (this.buildMenu) {
      const c = this.input.cursor;
      if (Math.hypot(c.x, c.y) > BUILD_MENU_DEAD) this.pointBuildMenu(STRUCT_ORDER[radialIndex(c.x, c.y)]);
      menu = { hover: this.buildMenu.hover, x: c.x / c.r, y: c.y / c.r };
    }
    if (!this.buildPicked) {
      this.ui.setBuildMenu({ picked: false, counts, ctx, unlocked, menu });
      return;
    }
    let gh = this.ghosts[this.buildType];
    if (!gh) {
      gh = createGhost(this.buildType);
      this.scene.add(gh);
      this.ghosts[this.buildType] = gh;
    }
    const cam = this.camera;
    cam.getWorldDirection(_v);
    const ox = cam.position.x;
    const oy = cam.position.y;
    const oz = cam.position.z;
    let t = this.world.rayTerrain(ox, oy, oz, _v.x, _v.y, _v.z, 7);
    if (t < 0) t = 5; // aim at the ground 5m ahead
    let x = ox + _v.x * t;
    let z = oz + _v.z * t;
    let rotY = (this.buildRot / 256) * Math.PI * 2;
    const def = STRUCT_DEFS[this.buildType];
    let reason = '';
    // on the ground of the level the builder is on: down in the mine the floor of the drift (aimed at its wall, the
    // piece stands in front of it), and nothing goes up on one level from the other (Game.build on the server)
    const mine = this.world.mine;
    const here = !!mine && mine.under(s.x, s.y + 0.3, s.z);
    if (here) {
      _spot.x = x;
      _spot.y = s.y;
      _spot.z = z;
      mine.confine(_spot, 0.5);
      x = _spot.x;
      z = _spot.z;
    }
    let y = this.world.floorAt(x, z, s.y + 0.5);
    if (mine && here !== mine.under(x, y + 0.3, z)) reason = 'Obstructed';
    if (def.snap === 'door') {
      // door boards: aim near a doorway (look along the ray a bit further for walls)
      let o = this.world.openingNear(x, z, 1.4);
      if (!o) {
        raycastWorld(this.world, ox, oy, oz, _v.x, _v.y, _v.z, BUILD_REACH, _ray);
        if (_ray.t >= 0) o = this.world.openingNear(ox + _v.x * _ray.t, oz + _v.z * _ray.t, 1.6);
      }
      if (o) {
        x = o.x;
        z = o.z;
        y = o.y;
        rotY = o.ry;
      } else reason = 'Aim at a doorway';
    }
    gh.position.set(x, y, z);
    gh.rotation.y = rotY;
    gh.visible = true;
    const afford = !!planCost(counts, def.cost, ctx);
    const car = this.world.car;
    if (!reason && def.schem && !(unlocked & (1 << SCHEM_BIT[def.schem]))) reason = `Locked · find the ${ITEM_DEFS[def.schem].name}`;
    if (!reason && Math.hypot(x - this.renderPos.x, z - this.renderPos.z) > BUILD_REACH + (def.snap ? 1 : 0)) reason = 'Too far';
    if (!reason && Math.hypot(x - car.x, z - car.z) < 3.2) reason = 'Too close to the car';
    if (!reason && this.world.isDeepWater(x, z)) reason = 'In the water';
    if (!reason && this.buildBlocked(def, x, y, z, rotY)) reason = 'Obstructed';
    if (!reason && !afford) reason = 'Not enough materials';
    const valid = !reason;
    gh.userData.setValid?.(valid);
    this.ghostPlace = { x, z };
    this.ui.setBuildMenu({ picked: true, selected: this.buildType, rotate: Math.round((((256 - this.buildRot) & 255) / 256) * 360), fine: this.input.held('buildFine'), counts, ctx, valid, reason, unlocked, menu });
  },

  // same overlap rules the server applies when placing a structure
  buildBlocked(def, x, y, z, yaw) {
    const col = makeBox(x, z, y - 0.3, y + def.sy, def.sx, def.sz, yaw, def.block ? COL.STRUCT : COL.STRUCT | COL.NOBLOCK);
    const tmp = this._bq || (this._bq = []);
    const down = !!this.world.mine?.under(x, y + 0.3, z); // (what stands on the ground over a drift is not in the way)
    if (!def.snap) {
      this.world.staticGrid.query(x, z, col.r + 0.2, tmp);
      for (const o of tmp) {
        if (o.y1 < y + 0.2 || (down && o.y0 > y + def.sy + 0.5)) continue;
        if (overlapBoxes(col, o)) return true;
      }
    }
    this.world.structGrid.query(x, z, col.r + 0.2, tmp);
    for (const o of tmp) {
      const bothBlock = !(o.flags & COL.NOBLOCK) && def.block;
      const bothTrap = o.flags & COL.NOBLOCK && !def.block;
      if ((bothBlock || bothTrap) && overlapBoxes(col, o, -0.05)) return true;
    }
    return false;
  },
};
