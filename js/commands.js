import { BDEF, UDEF, FBONUSES } from './constants.js';
import { state } from './state.js';
import { orderMove, orderAttack, orderAttackMove, orderPatrol, orderStop, orderHarvest } from './orders.js';
import { placeBuilding, deployMcvInPlace, spawnNear } from './placement.js';
import { calcPower } from './resources.js';
import { playTrainingStart, playCancel, playBuildStart } from './audio.js';

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
  }
}
