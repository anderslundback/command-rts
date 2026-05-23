import { BDEF, UDEF } from './constants.js';
import { state } from './state.js';
import { orderMove, orderAttack, orderStop, orderHarvest } from './orders.js';
import { placeBuilding, deployMcvInPlace } from './placement.js';

export function applyCommand(cmd) {
  switch (cmd.action) {
    case 'move':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && !u.dead) orderMove(u, cmd.tx, cmd.ty); }
      break;
    case 'attack': {
      const t = state.entById.get(cmd.targetId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && t && !u.dead) orderAttack(u, t); }
      break;
    }
    case 'stop':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u) orderStop(u); }
      break;
    case 'harvest': {
      const ref = state.entById.get(cmd.refineryId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && ref) orderHarvest(u, ref); }
      break;
    }
    case 'place': {
      const placed = placeBuilding(cmd.faction, cmd.btype, cmd.tx, cmd.ty, true);
      if (placed) {
        for (const q of [state.hudBuildQueue[cmd.faction], state.hudDefQueue[cmd.faction]]) {
          const idx = q.findIndex(it => it.type === cmd.btype && it.ready);
          if (idx >= 0) { q.splice(idx, 1); break; }
        }
      }
      break;
    }
    case 'queue_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q) q.push({ type: cmd.btype, t: 0, total: (BDEF[cmd.btype]?.btime ?? 20) * 60, paid: 0, ready: false });
      break;
    }
    case 'cancel_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q && cmd.index < q.length) {
        state.credits[cmd.faction] += BDEF[q[cmd.index].type]?.cost ?? 0;
        q.splice(cmd.index, 1);
      }
      break;
    }
    case 'queue_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && b.trainQ.length < 5)
        b.trainQ.push({ type: cmd.utype, t: 0, total: (UDEF[cmd.utype]?.ttime ?? 20) * 60 });
      break;
    }
    case 'cancel_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && cmd.index < b.trainQ.length) {
        state.credits[b.faction] += UDEF[b.trainQ[cmd.index].type]?.cost ?? 0;
        b.trainQ.splice(cmd.index, 1);
      }
      break;
    }
    case 'sell': {
      const b = state.entById.get(cmd.entId);
      if (b && !b.dead) { state.credits[b.faction] += (BDEF[b.type]?.cost ?? 0) * 0.5; b.dead = true; }
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
  }
}
