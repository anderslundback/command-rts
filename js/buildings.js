import { BDEF, UDEF, FBONUSES } from './constants.js';
import { state } from './state.js';
import { getEnt } from './entities.js';
import { calcPower, hasPwr, nearestRefinery } from './resources.js';
import { dealDmg } from './combat.js';
import { spawnNear, placeBuilding } from './placement.js';
import { orderMove, orderHarvest } from './orders.js';
import { distToEnt } from './pathfinding.js';
import { setMsg } from './hud.js';
import { speak, speakUnit, speakBuilding, playShot } from './audio.js';

export function updateBuilding(b) {
  if (b.hitFlash > 0) b.hitFlash--;

  if (!b.done) {
    // AI on-site construction only (player buildings are placed as done via sidebar)
    if (b.btotal > 0) b.bprog += 1 / b.btotal;
    else b.bprog = 1;
    if (b.bprog >= 1) {
      b.bprog = 1;
      calcPower();
      state.minimapDirty = true;
    }
    return;
  }

  if (b.repairing) {
    if (b.hp >= b.maxHp) {
      b.repairing = false;
    } else if (state.tick % 2 === 0) {
      if (state.credits[b.faction] >= 0.05) {
        state.credits[b.faction] -= 0.05;
        b.hp = Math.min(b.maxHp, b.hp + 1);
      } else {
        b.repairing = false;
        if (b.faction === state.playerFaction) setMsg('Repair stopped: out of credits', 120);
      }
    }
  }

  if (b.trainQ.length) {
    const item = b.trainQ[0];
    let advance = true;

    const speedMult = Math.max(1, state.entities.filter(
      e => !e.dead && e.isBuilding && e.faction === b.faction && e.type === b.type && e.done
    ).length);

    if (b.faction === state.playerFaction) {
      const installment = (UDEF[item.type].cost / item.total) * speedMult;
      if (state.credits[b.faction] >= installment) {
        state.credits[b.faction] -= installment;
      } else {
        advance = false;
      }
    }

    if (advance) {
      item.t = Math.min(item.total, item.t + speedMult);
      if (item.t >= item.total) {
        b.trainQ.shift();
        const u = spawnNear(b.faction, item.type, b);
        if (u) {
          if (b.waypoint && u.type !== 'harvester') {
            orderMove(u, b.waypoint.tx, b.waypoint.ty);
          } else if (u.type === 'harvester') {
            const ref = nearestRefinery(b.faction, u.x, u.y);
            if (ref) orderHarvest(u, ref);
          }
          if (b.faction === state.playerFaction) speakUnit(item.type);
        }
      }
    }
  }

  if (b.type === 'turret' && b.dmg > 0 && hasPwr(b.faction)) {
    b.atimer++;
    const curTgt = b.target ? getEnt(b.target) : null;
    if (!curTgt || curTgt.dead) {
      b.target = null;
      for (const e of state.entities) {
        if (e.dead || e.faction === b.faction) continue;
        if (distToEnt(b, e) <= b.range) { b.target = e.id; break; }
      }
    }
    if (b.target && b.atimer >= b.aspd) {
      b.atimer = 0;
      const t = getEnt(b.target);
      if (t && !t.dead) {
        dealDmg(t, b.dmg, b);
        const bpx = (b.x + b.w / 2) * 32, bpy = (b.y + b.h / 2) * 32;
        const { cam, canvas } = state;
        if (bpx >= cam.x - 200 && bpx <= cam.x + canvas.width + 200 &&
            bpy >= cam.y - 200 && bpy <= cam.y + canvas.height + 200) {
          playShot('turret');
        }
      }
    }
  }
}

// Called once per game tick: advances both sidebar construction queues independently
export function updateSidebarQueues() {
  const f = state.playerFaction;
  advanceQueue(state.hudBuildQueue[f], f);
  advanceQueue(state.hudDefQueue[f], f);
}

function advanceQueue(q, f) {
  if (!q.length) return;
  const item = q[0];
  if (item.ready) return; // waiting for player to click PLACE

  if (item.total > 0) {
    const installment = BDEF[item.type].cost / item.total;
    if (state.credits[f] >= installment) {
      state.credits[f] -= installment;
      item.paid = (item.paid || 0) + installment;
      item.t++;
    }
  } else {
    item.t = 1; item.total = 1;
  }

  if (item.t >= item.total) {
    item.ready = true;
    setMsg(BDEF[item.type].name + ' ready — click PLACE', 300);
    speakBuilding(item.type);
  }
}
