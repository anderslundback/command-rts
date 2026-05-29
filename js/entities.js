import { BDEF, UDEF, FBONUSES, TS } from './constants.js';
import { state } from './state.js';

let _eid = 1;
export function resetEid() { _eid = 1; }
export function getEid() { return _eid; }
export function setEid(v) { _eid = v; }

export class Ent {
  constructor(f, x, y) {
    this.id = _eid++;
    this.faction = f;
    this.x = x; this.y = y;
    this.px = x * TS; this.py = y * TS;
    this.hp = 100; this.maxHp = 100;
    this.dead = false; this.hitFlash = 0;
  }
}

export class Building extends Ent {
  constructor(f, type, x, y) {
    super(f, x, y);
    const d = BDEF[type], b = FBONUSES[f];
    this.type = type;
    this.w = d.w; this.h = d.h;
    this.maxHp = (d.hp * b.hpMult) | 0;
    this.hp = this.maxHp;
    this.power = d.power;
    this.bprog = 0;
    this.btotal = d.btime * 60;
    this.trainQ = [];
    this.dmg = d.dmg || 0;
    this.range = d.range || 0;
    this.aspd = d.aspd || 0;
    this.atimer = 0;
    this.target = null;
    this.repairing = false;
    this.waypoint = null;
    this.armorType  = d.armor  ?? 'building';
    this.weaponType = d.weapon ?? null;
    this.isBuilding = true;
    this.doorEvent = 0; // game tick when door last opened (for training exit animation)
  }
  get done() { return this.bprog >= 1; }
}

export class Unit extends Ent {
  constructor(f, type, x, y) {
    super(f, x, y);
    const d = UDEF[type], b = FBONUSES[f];
    this.type = type;
    this.maxHp = (d.hp * b.hpMult) | 0;
    this.hp = this.maxHp;
    this.speed = d.speed * b.speedMult;
    this.dmg = d.dmg;
    this.range = d.range;
    this.aspd = d.aspd;
    this.armorType  = d.armor  ?? 'infantry';
    this.weaponType = d.weapon ?? null;
    this.splash     = d.splash ?? 0;
    this.isUnit = true;
    this.state = 'idle';
    this.path = [];
    this.mprog = 0;
    this.atimer = 0;
    this.target = null;
    this.harvestTile = null;
    this.refineryId = null;
    this.ore = 0;
    this.maxOre = 90;
    this.facing = 0;
    this.orderQueue = [];
    this.atkMoveDest = null;
    this.cargo               = [];
    this.capacity            = d.capacity ?? 0;
    this.loaded              = false;
    this.onTransport         = null;
    this.boardingTarget      = null;
    this.captureTarget       = null;
    this.captureProgress     = 0;
    this.repairBuildingTarget = null;
    this.grounded            = 0;
  }
}

export function getEnt(id) { return state.entById.get(id) ?? null; }

export function addEnt(e) {
  state.entities.push(e);
  state.entById.set(e.id, e);
  return e;
}

export function removeDeadEnts() {
  let i = state.entities.length;
  while (i--) {
    if (state.entities[i].dead) {
      state.entById.delete(state.entities[i].id);
      state.entities.splice(i, 1);
    }
  }
}

export function getEntAt(tx, ty) {
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.isBuilding && tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) return e;
    // Air units are drawn elevated above their tile; also match one tile above the entity
    if (e.isUnit && !e.loaded && e.x === tx && (e.y === ty || (e.armorType === 'air' && e.y === ty + 1))) return e;
  }
  return null;
}
