import { state } from './state.js';
import { astar } from './pathfinding.js';
import { nearestOre } from './map.js';
import { nearestRefinery } from './resources.js';

export function orderMove(u, tx, ty) {
  u.state = 'move';
  u.target = null;
  u.path = astar(u.x, u.y, tx, ty, false);
  u.mprog = 0;
}

export function orderAttack(u, target) {
  u.state = 'attack';
  u.target = target.id;
  u.path = [];
}

export function orderHarvest(u, refinery) {
  const best = nearestRefinery(u.faction, u.x, u.y) || refinery;
  u.refineryId = best.id;
  const ore = nearestOre(u.x, u.y);
  if (ore) {
    u.harvestTile = ore;
    u.state = 'harvest';
    u.path = astar(u.x, u.y, ore.x, ore.y, true);
    u.mprog = 0;
  } else {
    u.state = 'idle';
  }
}

export function orderStop(u) {
  u.state = 'idle';
  u.path = [];
  u.target = null;
}
