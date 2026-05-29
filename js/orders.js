import { state } from './state.js';
import { astar, astarNaval, adjTile } from './pathfinding.js';
import { nearestOre } from './map.js';
import { nearestRefinery } from './resources.js';

import { TS } from './constants.js';

function _pf(u) { return u.armorType === 'naval' ? astarNaval : astar; }

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
  u.path = _pf(u)(u.x, u.y, tx, ty, false);
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
    u.path = _pf(u)(u.x, u.y, tx, ty, false);
    u.mprog = 0;
  }
}

export function orderHarvest(u, refinery) {
  // Keep a player-assigned refinery; otherwise pick the nearest one each cycle.
  const assigned = u.manualRefinery ? state.entById.get(u.refineryId) : null;
  if (assigned && !assigned.dead) {
    u.refineryId = assigned.id;
  } else {
    u.manualRefinery = false;
    u.refineryId = (nearestRefinery(u.faction, u.x, u.y) || refinery).id;
  }
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

// Player explicitly directs a harvester to drop off at a specific refinery.
// Sticks (manualRefinery) so it keeps returning there until the refinery dies.
export function orderReturnTo(u, refinery) {
  u.refineryId = refinery.id;
  u.manualRefinery = true;
  if (u.ore > 0) {
    u.state = 'return';
    const dest = adjTile(refinery, u.x, u.y);
    if (dest) { u.path = astar(u.x, u.y, dest.x, dest.y, false); u.mprog = 0; }
  } else {
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
}

export function orderPatrol(u, tx, ty, queued = false) {
  if (queued) {
    (u.orderQueue ??= []).push({ action: 'patrol', tx, ty });
    return;
  }
  u.orderQueue = [];
  u.atkMoveDest = null;
  u.patrolA = { tx: u.x, ty: u.y };
  u.patrolB = { tx, ty };
  u.state = 'patrol';
  u.path = _pf(u)(u.x, u.y, tx, ty, false);
  u.mprog = 0;
}

export function orderStop(u) {
  u.orderQueue = [];
  u.atkMoveDest = null;
  u.patrolA = null;
  u.patrolB = null;
  u.state = 'idle';
  u.path = [];
  u.target = null;
}
