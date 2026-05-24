import { state } from './state.js';
import { astar } from './pathfinding.js';
import { nearestOre } from './map.js';
import { nearestRefinery } from './resources.js';

import { TS } from './constants.js';

export function orderMove(u, tx, ty, queued = false) {
  if (queued) {
    (u.orderQueue ??= []).push({ action: 'move', tx, ty });
    return;
  }
  u.orderQueue = [];
  u.atkMoveDest = null;
  if (u.armorType === 'air') {
    u.destPx = tx * TS + TS / 2;
    u.destPy = ty * TS + TS / 2;
    u.target = null;
    u.state = 'move';
    return;
  }
  u.state = 'move';
  u.target = null;
  u.path = astar(u.x, u.y, tx, ty, false);
  u.mprog = 0;
}

export function orderAttack(u, target, queued = false) {
  if (queued) {
    (u.orderQueue ??= []).push({ action: 'attack', targetId: target.id });
    return;
  }
  u.orderQueue = [];
  u.atkMoveDest = null;
  u.state = 'attack';
  u.target = target.id;
  if (u.armorType !== 'air') u.path = [];
}

export function orderAttackMove(u, tx, ty, queued = false) {
  if (queued) {
    (u.orderQueue ??= []).push({ action: 'attack_move', tx, ty });
    return;
  }
  u.orderQueue = [];
  u.atkMoveDest = { tx, ty };
  if (u.armorType === 'air') {
    u.destPx = tx * TS + TS / 2;
    u.destPy = ty * TS + TS / 2;
    u.target = null;
    u.state = 'attack_move';
  } else {
    u.state = 'attack_move';
    u.target = null;
    u.path = astar(u.x, u.y, tx, ty, false);
    u.mprog = 0;
  }
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
  u.orderQueue = [];
  u.atkMoveDest = null;
  u.state = 'idle';
  u.path = [];
  u.target = null;
}
