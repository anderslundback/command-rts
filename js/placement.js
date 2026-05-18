import { BDEF, UDEF, FBONUSES, TS } from './constants.js';
import { state } from './state.js';
import { getTile, passable } from './map.js';
import { T } from './constants.js';
import { Building, Unit, addEnt } from './entities.js';
import { calcPower } from './resources.js';

export function canPlace(type, tx, ty, faction = -1, skipAdjacency = false) {
  const d = BDEF[type];
  if (tx < 0 || ty < 0 || tx + d.w > 80 || ty + d.h > 60) return false;
  for (let dy = 0; dy < d.h; dy++)
    for (let dx = 0; dx < d.w; dx++)
      if (getTile(tx + dx, ty + dy) !== T.GRASS) return false;
  for (const e of state.entities) {
    if (e.dead || !e.isBuilding) continue;
    if (tx < e.x + e.w && tx + d.w > e.x && ty < e.y + e.h && ty + d.h > e.y) return false;
  }
  if (!skipAdjacency && faction === state.playerFaction) {
    const own = state.entities.filter(e => !e.dead && e.isBuilding && e.faction === faction);
    if (own.length > 0) {
      const MAX = 3;
      const near = own.some(e => {
        const gx = Math.max(0, Math.max(e.x - (tx + d.w), tx - (e.x + e.w)));
        const gy = Math.max(0, Math.max(e.y - (ty + d.h), ty - (e.y + e.h)));
        return Math.max(gx, gy) <= MAX;
      });
      if (!near) return false;
    }
  }
  return true;
}

export function placeBuilding(f, type, tx, ty, instant, skipAdjacency = false) {
  if (!canPlace(type, tx, ty, f, skipAdjacency)) return null;
  const b = new Building(f, type, tx, ty);
  if (instant) b.bprog = 1;
  addEnt(b);
  calcPower();
  state.minimapDirty = true;
  return b;
}

export function spawnUnit(f, type, tx, ty) {
  const u = new Unit(f, type, tx, ty);
  u.px = tx * TS; u.py = ty * TS;
  addEnt(u);
  state.minimapDirty = true;
  return u;
}

export function spawnNear(f, type, building) {
  for (let i = -2; i <= building.w + 1; i++) {
    for (const pos of [
      { x: building.x + i, y: building.y - 1 },
      { x: building.x + i, y: building.y + building.h },
    ]) {
      if (trySpawn(f, type, pos.x, pos.y)) return state.entities[state.entities.length - 1];
    }
  }
  for (let i = 0; i < building.h; i++) {
    for (const pos of [
      { x: building.x - 1, y: building.y + i },
      { x: building.x + building.w, y: building.y + i },
    ]) {
      if (trySpawn(f, type, pos.x, pos.y)) return state.entities[state.entities.length - 1];
    }
  }
  return null;
}

export function deployMcvInPlace(mcv) {
  // Try all positions where the MCV tile falls within a 3×3 command center footprint
  const candidates = [
    [-1, -1], [0, -1], [-1, 0], [-2, -1], [-1, -2],
    [0, 0], [-2, 0], [0, -2], [-2, -2],
  ];
  for (const [dx, dy] of candidates) {
    const tx = mcv.x + dx, ty = mcv.y + dy;
    if (canPlace('command', tx, ty, -1, true)) {
      mcv.dead = true;
      const b = new Building(mcv.faction, 'command', tx, ty);
      b.bprog = 1;
      addEnt(b);
      calcPower();
      state.minimapDirty = true;
      return b;
    }
  }
  return null;
}

function trySpawn(f, type, x, y) {
  if (!passable(x, y)) return false;
  if (state.entities.some(e => !e.dead && e.isUnit && e.x === x && e.y === y)) return false;
  spawnUnit(f, type, x, y);
  return true;
}
