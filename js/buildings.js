import { BDEF, UDEF, FBONUSES, FDATA } from './constants.js';
import { state } from './state.js';
import { getEnt } from './entities.js';
import { calcPower, hasPwr, nearestRefinery, getPowerRatio } from './resources.js';
import { dealDmg } from './combat.js';
import { spawnMuzzle } from './particles.js';
import { spawnNear, placeBuilding } from './placement.js';
import { orderMove, orderHarvest } from './orders.js';
import { distToEnt } from './pathfinding.js';
import { setMsg } from './hud.js';
import { speak, speakUnit, speakBuilding, playShot } from './audio.js';

export function updateBuilding(b) {
  if (b.hitFlash > 0) b.hitFlash--;

  if (!b.done) {
    // AI on-site construction only (player buildings are placed as done via sidebar)
    const pwr = Math.max(0.25, getPowerRatio(b.faction));
    if (b.btotal > 0) b.bprog += pwr / b.btotal;
    else b.bprog = 1;
    if (b.bprog >= 1) {
      b.bprog = 1;
      calcPower();
      state.minimapDirty = true;
      if (b.type === 'refinery') {
        const harv = spawnNear(b.faction, 'harvester', b);
        if (harv) orderHarvest(harv, b);
      }
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
    const pwr = Math.max(0.25, getPowerRatio(b.faction));

    const installment = (UDEF[item.type].cost / item.total) * speedMult * pwr;
    if (state.credits[b.faction] >= installment) {
      state.credits[b.faction] -= installment;
    } else {
      advance = false;
    }

    if (advance) {
      item.t = Math.min(item.total, item.t + speedMult * pwr);
      if (item.t >= item.total) {
        b.doorEvent = state.tick; // open door for unit exit animation
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

  if ((b.type === 'turret' || b.type === 'antiair') && b.dmg > 0 && hasPwr(b.faction)) {
    b.atimer++;
    const curTgt = b.target ? getEnt(b.target) : null;
    if (!curTgt || curTgt.dead) {
      b.target = null;
      if (b.type === 'antiair') {
        for (const e of state.entities) {
          if (e.dead || e.faction === b.faction) continue;
          if (e.armorType === 'air' && distToEnt(b, e) <= b.range) { b.target = e.id; break; }
        }
      }
      if (!b.target) {
        // Pass 1: nearest enemy unit
        let nearest = null, nearestDist = b.range + 1;
        for (const e of state.entities) {
          if (e.dead || e.faction === b.faction || e.isBuilding) continue;
          const d = distToEnt(b, e);
          if (d < nearestDist) { nearest = e; nearestDist = d; }
        }
        // Pass 2: nearest enemy completed building (only when no units in range)
        if (!nearest) {
          for (const e of state.entities) {
            if (e.dead || e.faction === b.faction || !e.isBuilding || !e.done) continue;
            const d = distToEnt(b, e);
            if (d <= b.range && d < nearestDist) { nearest = e; nearestDist = d; }
          }
        }
        if (nearest) b.target = nearest.id;
      }
    }
    if (b.target && b.atimer >= b.aspd) {
      b.atimer = 0;
      const t = getEnt(b.target);
      if (t && !t.dead) {
        dealDmg(t, b.dmg, b);
        const bpx = (b.x + b.w / 2) * 32, bpy = (b.y + b.h / 2) * 32;
        const { cam, canvas } = state;
        const onScreen = bpx >= cam.x - 200 && bpx <= cam.x + canvas.width + 200 &&
                         bpy >= cam.y - 200 && bpy <= cam.y + canvas.height + 200;
        if (onScreen) {
          playShot(b.type);
          const tpx = t.isBuilding ? (t.x + t.w / 2) * 32 : t.px + 16;
          const tpy = t.isBuilding ? (t.y + t.h / 2) * 32 : t.py + 16;
          const facing = Math.atan2(tpy - bpy, tpx - bpx);
          spawnMuzzle(bpx + Math.cos(facing) * 13, bpy + Math.sin(facing) * 13, FDATA[b.faction].color);
        }
      }
    }
  }
}

export function updateSidebarQueues() {
  for (let f = 0; f < 3; f++) {
    advanceQueue(state.hudBuildQueue[f], f);
    advanceQueue(state.hudDefQueue[f], f);
  }
}

function advanceQueue(q, f) {
  if (!q.length) return;
  const item = q[0];
  if (item.ready) {
    // Deferred announce: sound was suppressed during a rollback replay.
    // The item stays in the queue until the player clicks PLACE, giving
    // us a second chance to fire the sound on the next non-rollback tick.
    if (!item.announced && !state.isRollingBack) {
      item.announced = true;
      speakBuilding(item.type);
    }
    return;
  }

  const pwr = Math.max(0.25, getPowerRatio(f));

  if (item.total > 0) {
    const installment = (BDEF[item.type].cost / item.total) * pwr;
    if (state.credits[f] >= installment) {
      state.credits[f] -= installment;
      item.paid = (item.paid || 0) + installment;
      item.t += pwr;
    }
  } else {
    item.t = 1; item.total = 1;
  }

  if (item.t >= item.total) {
    item.ready = true;
    setMsg(BDEF[item.type].name + ' ready — click PLACE', 300);
    if (!state.isRollingBack) {
      item.announced = true;
      speakBuilding(item.type);
    }
    // else: announced stays false; deferred to the early-return path above
  }
}
