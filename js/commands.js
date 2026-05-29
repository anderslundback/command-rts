import { BDEF, UDEF, FBONUSES, TS, MW, MH, T, TRANSPORT_SLOTS } from './constants.js';
import { adjTile } from './pathfinding.js';
import { state } from './state.js';
import { orderMove, orderAttack, orderAttackMove, orderPatrol, orderStop, orderHarvest } from './orders.js';
import { placeBuilding, deployMcvInPlace, spawnNear } from './placement.js';
import { calcPower } from './resources.js';
import { playTrainingStart, playCancel, playBuildStart } from './audio.js';
import { getTile } from './map.js';

export function applyCommand(cmd) {
  switch (cmd.action) {
    case 'move':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && !u.dead) orderMove(u, cmd.tx, cmd.ty, cmd.queued); }
      break;
    case 'attack': {
      const t = state.entById.get(cmd.targetId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && t && !u.dead) orderAttack(u, t, cmd.queued); }
      break;
    }
    case 'attack_move':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && !u.dead) orderAttackMove(u, cmd.tx, cmd.ty, cmd.queued); }
      break;
    case 'patrol':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && !u.dead) orderPatrol(u, cmd.tx, cmd.ty, cmd.queued); }
      break;
    case 'stop':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u) orderStop(u); }
      break;
    case 'harvest': {
      const ref = state.entById.get(cmd.refineryId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && ref) orderHarvest(u, ref); }
      break;
    }
    case 'place': {
      const placed = placeBuilding(cmd.faction, cmd.btype, cmd.tx, cmd.ty, true, true);
      if (placed) {
        for (const q of [state.hudBuildQueue[cmd.faction], state.hudDefQueue[cmd.faction]]) {
          const idx = q.findIndex(it => it.type === cmd.btype && it.ready);
          if (idx >= 0) { q.splice(idx, 1); break; }
        }
        if (cmd.btype === 'refinery') {
          const harv = spawnNear(placed.faction, 'harvester', placed);
          if (harv) orderHarvest(harv, placed);
        }
      }
      break;
    }
    case 'queue_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q) {
        const buildMult = FBONUSES[cmd.faction]?.buildMult ?? 1;
        q.push({ type: cmd.btype, t: 0, total: Math.round((BDEF[cmd.btype]?.btime ?? 20) * 60 * buildMult), paid: 0, creditAcc: 0, ready: false, announced: false });
        if (!state.isRollingBack && cmd.faction === state.playerFaction) playBuildStart();
      }
      break;
    }
    case 'cancel_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q && cmd.index < q.length) {
        state.credits[cmd.faction] += q[cmd.index].paid ?? 0;
        q.splice(cmd.index, 1);
        if (!state.isRollingBack && cmd.faction === state.playerFaction) playCancel();
      }
      break;
    }
    case 'queue_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && b.trainQ.length < 99) {
        const ttime = UDEF[cmd.utype]?.ttime ?? 20;
        const trainMult = FBONUSES[b.faction]?.trainMult ?? 1;
        b.trainQ.push({ type: cmd.utype, t: 0, total: Math.round(ttime * trainMult * 60), paid: 0, creditAcc: 0 });
        if (!state.isRollingBack && b.faction === state.playerFaction) playTrainingStart();
      }
      break;
    }
    case 'cancel_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && cmd.index < b.trainQ.length) {
        state.credits[b.faction] += b.trainQ[cmd.index].paid ?? 0;
        b.trainQ.splice(cmd.index, 1);
        if (!state.isRollingBack && b.faction === state.playerFaction) playCancel();
      }
      break;
    }
    case 'sell': {
      const b = state.entById.get(cmd.entId);
      if (b && !b.dead) {
        state.credits[b.faction] += Math.floor((BDEF[b.type]?.cost ?? 0) / 2);
        b.dead = true;
        calcPower();
      }
      break;
    }
    case 'repair': {
      const b = state.entById.get(cmd.entId);
      if (b) b.repairing = cmd.toggle;
      break;
    }
    case 'deploy_mcv': {
      const u = state.entById.get(cmd.unitId);
      if (u && !u.dead) deployMcvInPlace(u);
      break;
    }
    case 'waypoint': {
      const b = state.entById.get(cmd.entId);
      if (b) b.waypoint = { tx: cmd.tx, ty: cmd.ty };
      break;
    }
    case 'set_primary':
      state.primaryBuilding[cmd.btype] = cmd.entId;
      break;
    case 'force_attack': {
      const t = state.entById.get(cmd.targetId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && t && !u.dead) orderAttack(u, t, cmd.queued); }
      break;
    }
    case 'load_transport': {
      const transport = state.entById.get(cmd.transportId);
      if (!transport || transport.dead || !transport.capacity) break;
      const isInfantryOnly = UDEF[transport.type]?.infantryOnly ?? false;
      const adjLand = transport.armorType === 'air' ? _adjLandTiles(transport, 4) : _adjLandTiles(transport, 1);
      if (transport.armorType !== 'air' && adjLand.length === 0) break;
      let tileIdx = 0;
      for (const id of cmd.ids) {
        const u = state.entById.get(id);
        if (!u || u.dead || u.loaded) continue;
        if (isInfantryOnly && u.armorType !== 'infantry') continue;
        const used = transport.cargo.reduce((s, uid) => { const cu = state.entById.get(uid); return s + (cu ? (TRANSPORT_SLOTS[cu.armorType] ?? 1) : 0); }, 0);
        const need = TRANSPORT_SLOTS[u.armorType] ?? 1;
        if (used + need > transport.capacity) continue;
        if (transport.armorType === 'air') {
          // Infantry walks to chinook tile
          u.boardingTarget = cmd.transportId;
          orderMove(u, transport.x, transport.y, cmd.queued ?? false);
        } else {
          const tile = adjLand[tileIdx % Math.max(1, adjLand.length)];
          if (!tile) continue;
          tileIdx++;
          u.boardingTarget = cmd.transportId;
          orderMove(u, tile.x, tile.y, cmd.queued ?? false);
        }
      }
      break;
    }
    case 'capture_building': {
      const b = state.entById.get(cmd.buildingId);
      if (!b || b.dead) break;
      for (const id of cmd.ids) {
        const u = state.entById.get(id);
        if (!u || u.dead || u.type !== 'engineer') continue;
        u.captureTarget = cmd.buildingId;
        u.captureProgress = 0;
        const dest = adjTile(b, u.x, u.y) ?? { x: b.x - 1, y: b.y };
        orderMove(u, dest.x, dest.y, cmd.queued ?? false);
      }
      break;
    }
    case 'repair_building': {
      const b = state.entById.get(cmd.buildingId);
      if (!b || b.dead) break;
      for (const id of cmd.ids) {
        const u = state.entById.get(id);
        if (!u || u.dead || u.type !== 'engineer') continue;
        u.repairBuildingTarget = cmd.buildingId;
        const dest = adjTile(b, u.x, u.y) ?? { x: b.x - 1, y: b.y };
        orderMove(u, dest.x, dest.y, cmd.queued ?? false);
      }
      break;
    }
    case 'unload_transport': {
      const transport = state.entById.get(cmd.transportId);
      if (!transport || transport.dead) break;
      const adjLand = _adjLandTiles(transport, 1);
      if (adjLand.length === 0) break;
      transport.cargo.forEach((uid, i) => {
        const u = state.entById.get(uid);
        if (!u) return;
        u.loaded = false; u.onTransport = null;
        const tile = adjLand[i % Math.max(1, adjLand.length)];
        if (tile) { u.x = tile.x; u.y = tile.y; u.px = tile.x * TS; u.py = tile.y * TS; }
        u.state = 'idle'; u.path = [];
      });
      transport.cargo = [];
      if (transport.type === 'chinook') transport.grounded = 100;
      break;
    }
    case 'set_speed':
      state.gameSpeed = Math.max(0, Math.min(4, cmd.speed));
      break;
    case 'repair_move': {
      const depot = state.entById.get(cmd.entId);
      if (!depot || depot.dead) break;
      const tiles = [];
      for (let dy = 0; dy < depot.h; dy++)
        for (let dx = 0; dx < depot.w; dx++)
          tiles.push({ x: depot.x + dx, y: depot.y + dy });
      cmd.ids.forEach((id, i) => {
        const u = state.entById.get(id);
        if (u && !u.dead) orderMove(u, tiles[i % tiles.length].x, tiles[i % tiles.length].y, cmd.queued);
      });
      break;
    }
    case 'surrender': {
      for (const e of state.entities)
        if (!e.dead && e.faction === cmd.faction) e.dead = true;
      break;
    }
  }
}

function _adjLandTiles(e, radius = 2) {
  const tiles = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tx = e.x + dx, ty = e.y + dy;
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
      const t = getTile(tx, ty);
      if (t !== T.WATER && t !== T.ROCK) tiles.push({ x: tx, y: ty });
    }
  return tiles;
}
