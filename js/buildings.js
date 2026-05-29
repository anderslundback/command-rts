import { BDEF, UDEF, FBONUSES, FDATA } from './constants.js';
import { state } from './state.js';
import { getEnt } from './entities.js';
import { calcPower, hasPwr, nearestRefinery, getPowerRatio } from './resources.js';
import { dealDmg } from './combat.js';
import { spawnMuzzle } from './particles.js';
import { spawnNear, spawnNearNaval, placeBuilding } from './placement.js';
import { orderMove, orderHarvest } from './orders.js';
import { distToEnt } from './pathfinding.js';
import { queryRect } from './spatial.js';
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
    } else if (state.tick % 40 === 0) {
      if (state.credits[b.faction] >= 1) {
        state.credits[b.faction] -= 1;
        b.hp = Math.min(b.maxHp, b.hp + 20);
      } else {
        b.repairing = false;
        if (b.faction === state.playerFaction) setMsg('Repair stopped: out of credits', 120);
      }
    }
  }

  if (b.trainQ.length) {
    const item = b.trainQ[0];

    const speedMult = Math.max(1, state._bldgCounts?.get(`${b.faction}:${b.type}`) ?? 1);
    const pwr = Math.round(Math.max(0.25, getPowerRatio(b.faction)) * 4) / 4;
    const k = Math.round(pwr * 4); // 1, 2, 3, or 4 — always integer
    const cost = UDEF[item.type]?.cost ?? 0;
    const threshold = 4 * item.total;

    // Bresenham integer-credit installment: advance accumulator by cost*k*speedMult
    // per tick; deduct 1 credit per threshold units of accumulation.
    item.creditAcc = (item.creditAcc ?? 0) + cost * k * speedMult;
    let canAdvance = true;
    while (item.creditAcc >= threshold) {
      if (state.credits[b.faction] >= 1) {
        state.credits[b.faction] -= 1;
        item.paid = (item.paid ?? 0) + 1;
        item.creditAcc -= threshold;
      } else {
        canAdvance = false;
        item.creditAcc -= cost * k * speedMult; // undo — retry next tick
        break;
      }
    }

    if (canAdvance) {
      item.t = Math.min(item.total, item.t + speedMult * pwr);
      if (item.t >= item.total) {
        b.doorEvent = state.tick;
        b.trainQ.shift();
        const u = b.type === 'navalyard' ? spawnNearNaval(b.faction, item.type, b) : spawnNear(b.faction, item.type, b);
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
      const qr = Math.ceil(b.range) + 1;
      const qx0 = b.x - qr, qy0 = b.y - qr, qx1 = b.x + b.w - 1 + qr, qy1 = b.y + b.h - 1 + qr;
      if (b.type === 'antiair') {
        // First air enemy in range, picking first-in-entities-order (smallest _gi).
        let airE = null, airGi = Infinity;
        queryRect(qx0, qy0, qx1, qy1, (e) => {
          if (e.dead || e.faction === b.faction || e.armorType !== 'air') return;
          if (distToEnt(b, e) <= b.range && e._gi < airGi) { airE = e; airGi = e._gi; }
        });
        if (airE) b.target = airE.id;
      }
      if (!b.target) {
        // Pass 1: nearest enemy unit (ties → first in entities order)
        let nearest = null, nd = b.range + 1, ngi = Infinity;
        queryRect(qx0, qy0, qx1, qy1, (e) => {
          if (e.dead || e.faction === b.faction || e.isBuilding) return;
          const d = distToEnt(b, e);
          if (d < nd || (d === nd && nearest && e._gi < ngi)) { nd = d; nearest = e; ngi = e._gi; }
        });
        // Pass 2: nearest enemy completed building (only when no units in range)
        if (!nearest) {
          queryRect(qx0, qy0, qx1, qy1, (e) => {
            if (e.dead || e.faction === b.faction || !e.isBuilding || !e.done) return;
            const d = distToEnt(b, e);
            if (d <= b.range && (d < nd || (d === nd && nearest && e._gi < ngi))) { nd = d; nearest = e; ngi = e._gi; }
          });
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
          const muzzleDist = b.type === 'turret' ? 20 : 16;
          spawnMuzzle(bpx + Math.cos(facing) * muzzleDist, bpy + Math.sin(facing) * muzzleDist, FDATA[b.faction].color);
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

  const pwr = Math.round(Math.max(0.25, getPowerRatio(f)) * 4) / 4;
  const k = Math.round(pwr * 4); // 1, 2, 3, or 4 — always integer
  const cost = BDEF[item.type]?.cost ?? 0;

  if (item.total > 0) {
    const threshold = 4 * item.total;
    item.creditAcc = (item.creditAcc ?? 0) + cost * k;
    let canAdvance = true;
    while (item.creditAcc >= threshold) {
      if (state.credits[f] >= 1) {
        state.credits[f] -= 1;
        item.paid = (item.paid ?? 0) + 1;
        item.creditAcc -= threshold;
      } else {
        canAdvance = false;
        item.creditAcc -= cost * k; // undo — retry next tick
        break;
      }
    }
    if (canAdvance) item.t = Math.min(item.total, item.t + pwr);
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
