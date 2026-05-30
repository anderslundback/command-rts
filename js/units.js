import { TS, FDATA, FBONUSES, VEHICLE_TYPES, NAVAL_TYPES, TRANSPORT_SLOTS, BDEF } from './constants.js';
import { state } from './state.js';
import { getTile, nearestOre } from './map.js';
import { T } from './constants.js';
import { getEnt } from './entities.js';
import { astar, astarNaval, adjTile, adjToBuilding, distToEnt } from './pathfinding.js';
import { nearestRefinery, hasPwr, calcPower, areAllied, areEnemies } from './resources.js';
import { dealDmg, dealSplash, autoAttack } from './combat.js';
import { spawnShell } from './shells.js';
import { spawnMuzzle } from './particles.js';
import { orderHarvest, orderMove, orderAttack, orderAttackMove, orderPatrol, findHarvesterTarget } from './orders.js';
import { nearestEnemy, entsAtTile, queryRadius } from './spatial.js';
import { playShot, playCash } from './audio.js';

// RA-style ore-truck pacing: harvester parks at the ore tile for this many ticks
// while the scoop arm cycles before the tile is depleted. 50 ticks ≈ 2.5 s at
// 20 Hz, roughly two scoop swings.
const HARVEST_TICKS = 50;
// How often to re-stamp scoopEvent during the dig so the renderer's single
// scoop cycle repeats over the whole HARVEST_TICKS window.
const SCOOP_PERIOD = 25;

// Periodic re-paths during attack/return/etc. recompute the path every N ticks
// to react to new obstacles. Naively resetting u.mprog snaps the unit back to
// its current tile, which is fine when the next step changed direction — but
// catastrophic when the new path's first step matches the old one. A diagonal
// step at harvester speed (1.4) takes ~32 ticks; the 30-tick re-path window
// would otherwise reset mprog before the step completes, leaving the unit
// stuck in place bouncing back to its origin. Preserve mprog when the next
// tile is unchanged so long steps can finish across re-path windows.
function repath(u, newPath) {
  const oldNext = u.path && u.path[0];
  const newNext = newPath && newPath[0];
  if (!oldNext || !newNext || oldNext.x !== newNext.x || oldNext.y !== newNext.y) {
    u.mprog = 0;
  }
  u.path = newPath || [];
}

export function updateUnit(u) {
  if (u.armorType === 'air')   { updateAirUnit(u);   return; }
  if (u.armorType === 'naval') { updateNavalUnit(u); return; }
  if (u.loaded) {
    const t = u.onTransport ? getEnt(u.onTransport) : null;
    if (!t || t.dead) u.dead = true;
    return;
  }

  if (u.hitFlash > 0) u.hitFlash--;

  // Depot repair: vehicle must be idle on the pad (consistent for all factions — deterministic in multiplayer)
  if (VEHICLE_TYPES.has(u.type) && u.hp < u.maxHp) {
    if (state.tick % 20 === 0 && hasPwr(u.faction) && u.state === 'idle') {
      const db = state.factionCache?.[u.faction]?.doneBuildings;
      const depot = (db ?? state.entities).find(e => !e.dead && e.isBuilding && e.faction === u.faction &&
        e.type === 'depot' && e.done &&
        u.x >= e.x && u.x < e.x + e.w && u.y >= e.y && u.y < e.y + e.h);
      if (depot && state.credits[u.faction] >= 1) {
        state.credits[u.faction] -= 1;
        u.hp = Math.min(u.maxHp, u.hp + 10);
        u.hitFlash = 0;
      }
    }
  }

  // Harvester passive regen: slowly self-repairs up to 50% HP; stops while taking damage
  if (u.type === 'harvester' && u.hp < u.maxHp * 0.5 && u.hitFlash === 0) {
    if (state.tick % 15 === 0) {
      u.hp = Math.min(u.maxHp * 0.5, u.hp + 1);
    }
  }

  // Crush any enemy infantry sharing this tile (handles infantry walking into a vehicle)
  if (VEHICLE_TYPES.has(u.type)) {
    entsAtTile(u.x, u.y, (e) => {
      if (e.dead || !e.isUnit || e === u || e.faction === u.faction || e.armorType !== 'infantry') return;
      dealDmg(e, e.maxHp + 1, u);
    });
  }

  switch (u.state) {
    case 'idle':
      autoAttack(u);
      break;

    case 'move':
      stepPath(u);
      if (!u.path.length) {
        if (u.boardingTarget) {
          const transport = getEnt(u.boardingTarget);
          if (transport && !transport.dead) {
            let adjacent;
            if (transport.armorType === 'air') {
              const px = (u.px + TS / 2) - (transport.px + TS / 2);
              const py = (u.py + TS / 2) - (transport.py + TS / 2);
              adjacent = Math.sqrt(px * px + py * py) < TS * 1.8;
            } else {
              adjacent = Math.abs(u.x - transport.x) <= 1 && Math.abs(u.y - transport.y) <= 1;
            }
            if (adjacent) {
              const uSlots = TRANSPORT_SLOTS[u.armorType] ?? 1;
              const used = transport.cargo.reduce((s, uid) => { const cu = getEnt(uid); return s + (cu ? (TRANSPORT_SLOTS[cu.armorType] ?? 1) : 0); }, 0);
              if (used + uSlots <= transport.capacity) {
                u.loaded = true; u.onTransport = transport.id; u.state = 'idle';
                transport.cargo.push(u.id);
                if (transport.type === 'chinook') transport.grounded = 80;
              }
            }
          }
          u.boardingTarget = null;
        }
        if (u.captureTarget) {
          const b = getEnt(u.captureTarget);
          if (b && !b.dead && areEnemies(b.faction, u.faction) && adjToBuilding(u.x, u.y, b)) {
            u.state = 'capture'; break;
          }
          u.captureTarget = null;
        }
        if (u.repairBuildingTarget) {
          const b = getEnt(u.repairBuildingTarget);
          if (b && !b.dead && b.faction === u.faction && adjToBuilding(u.x, u.y, b)) {
            b.hp = b.maxHp; u.dead = true; u.repairBuildingTarget = null; break;
          }
          u.repairBuildingTarget = null;
        }
        dequeueNext(u);
      }
      break;

    case 'capture': {
      const b = getEnt(u.captureTarget);
      if (!b || b.dead || b.faction === u.faction) { u.captureTarget = null; u.captureProgress = 0; dequeueNext(u); break; }
      if (!adjToBuilding(u.x, u.y, b)) { u.captureTarget = null; u.captureProgress = 0; dequeueNext(u); break; }
      u.captureProgress++;
      const captureTime = b.type === 'command'
        ? 360
        : Math.round(Math.max(140, (BDEF[b.type]?.cost ?? 500) * 0.14));
      if (u.captureProgress >= captureTime) {
        b.faction = u.faction; b.trainQ = []; b.repairing = false;
        calcPower(); state.minimapDirty = true;
        u.dead = true;
      }
      break;
    }

    case 'attack_move': {
      const nearest = u.dmg > 0 ? nearestEnemy(u, u.range, 0.5) : null;
      if (nearest) {
        u.state = 'attack'; u.target = nearest.id; u.path = [];
      } else {
        stepPath(u);
        if (!u.path.length) { u.atkMoveDest = null; dequeueNext(u); }
      }
      break;
    }

    case 'patrol': {
      const nearest = u.dmg > 0 ? nearestEnemy(u, u.range, 0.5) : null;
      if (nearest) {
        u.state = 'attack'; u.target = nearest.id; u.path = [];
        break;
      }
      stepPath(u);
      if (!u.path.length) {
        const tmp = u.patrolA; u.patrolA = u.patrolB; u.patrolB = tmp;
        u.path = astar(u.x, u.y, u.patrolB.tx, u.patrolB.ty, false);
        u.mprog = 0;
      }
      break;
    }

    case 'attack': {
      const tgt = getEnt(u.target);
      if (!tgt || tgt.dead || tgt.faction === u.faction) {
        u.target = null;
        if (u.atkMoveDest) {
          u.state = 'attack_move';
          u.path = astar(u.x, u.y, u.atkMoveDest.tx, u.atkMoveDest.ty, false);
          u.mprog = 0;
        } else if (u.patrolA) {
          u.state = 'patrol';
          if (!u.path.length) { u.path = astar(u.x, u.y, u.patrolB.tx, u.patrolB.ty, false); u.mprog = 0; }
        } else {
          dequeueNext(u);
        }
        break;
      }
      const dist = distToEnt(u, tgt);
      if (tgt) {
        const tx = (tgt.isBuilding ? tgt.x + tgt.w / 2 : tgt.x) * TS;
        const ty = (tgt.isBuilding ? tgt.y + tgt.h / 2 : tgt.y) * TS;
        u.facing = Math.atan2(ty - (u.py + TS / 2), tx - (u.px + TS / 2));
      }
      if (dist <= u.range) {
        u.path = [];
        if (++u.atimer >= u.aspd) {
          u.atimer = 0;
          const ttx = (tgt.isBuilding ? tgt.x + tgt.w / 2 : tgt.x) * TS;
          const tty = (tgt.isBuilding ? tgt.y + tgt.h / 2 : tgt.y) * TS;
          if (u.splash) {
            spawnShell(u.px + TS / 2, u.py + TS / 2, ttx, tty, u, u.dmg, u.splash * TS);
          } else {
            dealDmg(tgt, u.dmg, u);
          }
          const { cam, canvas } = state;
          if (!state.isRollingBack &&
              u.px >= cam.x - 200 && u.px <= cam.x + canvas.width + 200 &&
              u.py >= cam.y - 200 && u.py <= cam.y + canvas.height + 200) {
            playShot(u.type);
          }
        }
      } else {
        if (!u.path.length || state.tick % 20 === 0) {
          const dest = tgt.isBuilding ? adjTile(tgt, u.x, u.y) : { x: tgt.x, y: tgt.y };
          if (dest) repath(u, astar(u.x, u.y, dest.x, dest.y, false));
        }
        stepPath(u);
      }
      break;
    }

    case 'harvest': {
      const ht = u.harvestTile;
      if (!ht || getTile(ht.x, ht.y) !== T.ORE) {
        u.harvestTimer = 0;
        const found = findReachableOre(u);
        if (found) { u.harvestTile = found.tile; u.path = found.path; u.mprog = 0; }
        else u.state = 'idle';
        break;
      }
      if (u.x === ht.x && u.y === ht.y) {
        // RA-style: harvester parks at the tile and digs for HARVEST_TICKS ticks
        // (~2.5s at 20 Hz) while the scoop arm cycles. Tile only flips to GRASS
        // when the timer expires.
        if (u.harvestTimer === 0) {
          u.harvestTimer = HARVEST_TICKS;
          u.scoopEvent = state.tick;
        } else {
          u.harvestTimer--;
          // Re-stamp scoopEvent so the renderer's 30-tick scoop loops a couple
          // of times across the full dig duration.
          if (u.harvestTimer > 0 && (HARVEST_TICKS - u.harvestTimer) % SCOOP_PERIOD === 0) {
            u.scoopEvent = state.tick;
          }
          if (u.harvestTimer === 0) {
            u.ore += 30;
            state.map[ht.y][ht.x] = T.GRASS;
            state.mapDirty = true;
            if (u.ore >= u.maxOre) {
              startReturn(u);
            } else {
              const found = findReachableOre(u);
              if (found) { u.harvestTile = found.tile; u.path = found.path; u.mprog = 0; }
              else startReturn(u);
            }
          }
        }
      } else {
        stepPath(u);
        if (!u.path.length && (u.x !== ht.x || u.y !== ht.y)) {
          // Current target unreachable — try to find a different ore patch
          const found = findReachableOre(u);
          if (found) { u.harvestTile = found.tile; u.path = found.path; u.mprog = 0; }
          else u.state = 'idle';
        }
      }
      break;
    }

    case 'return': {
      let ref = getEnt(u.refineryId);
      if (!ref || ref.dead) {
        ref = nearestRefinery(u.faction, u.x, u.y);
        if (ref) u.refineryId = ref.id; else break;
      }
      if (adjToBuilding(u.x, u.y, ref)) {
        state.credits[u.faction] += Math.round(u.ore * FBONUSES[u.faction].creditMult);
        u.ore = 0;
        u.dumpEvent = state.tick;
        if (u.faction === state.playerFaction && !state.isRollingBack) playCash();
        orderHarvest(u, ref);
      } else {
        if (!u.path.length || state.tick % 30 === 0) {
          const dest = adjTile(ref, u.x, u.y);
          if (dest) repath(u, astar(u.x, u.y, dest.x, dest.y, false));
        }
        stepPath(u);
      }
      break;
    }
  }

  // Medic passive heal: heals 3 HP to one nearby friendly infantry every second.
  // Picks the FIRST qualifying unit in state.entities order (smallest _gi) to match the old scan.
  if (u.type === 'medic' && state.tick % 20 === 0) {
    const r = Math.ceil(u.range) + 1;
    let best = null, bgi = Infinity;
    queryRadius(u.x, u.y, r, (e) => {
      if (e.dead || e.loaded || e === u || !areAllied(e.faction, u.faction) || !e.isUnit) return;
      if (e.armorType !== 'infantry' || e.hp >= e.maxHp) return;
      if (distToEnt(u, e) <= u.range && e._gi < bgi) { best = e; bgi = e._gi; }
    });
    if (best) best.hp = Math.min(best.maxHp, best.hp + 3);
  }

  // Mechanic passive repair: repairs 5 HP to one nearby friendly vehicle every second.
  if (u.type === 'mechanic' && state.tick % 20 === 0) {
    const r = Math.ceil(u.range) + 1;
    let best = null, bgi = Infinity;
    queryRadius(u.x, u.y, r, (e) => {
      if (e.dead || e.loaded || e === u || !areAllied(e.faction, u.faction) || !e.isUnit) return;
      if (!VEHICLE_TYPES.has(e.type) || e.hp >= e.maxHp) return;
      if (distToEnt(u, e) <= u.range && e._gi < bgi) { best = e; bgi = e._gi; }
    });
    if (best) best.hp = Math.min(best.maxHp, best.hp + 5);
  }
}

// ── Order queue ───────────────────────────────────────────────────────────────

function dequeueNext(u) {
  const next = u.orderQueue?.shift();
  if (!next) { u.state = 'idle'; return; }
  if (next.action === 'move') orderMove(u, next.tx, next.ty);
  else if (next.action === 'attack_move') orderAttackMove(u, next.tx, next.ty);
  else if (next.action === 'patrol') orderPatrol(u, next.tx, next.ty);
  else if (next.action === 'attack') {
    const t = getEnt(next.targetId);
    if (t && !t.dead) orderAttack(u, t);
    else dequeueNext(u);
  } else {
    u.state = 'idle';
  }
}

// ── Naval unit logic ──────────────────────────────────────────────────────────

function updateNavalUnit(u) {
  if (u.hitFlash > 0) u.hitFlash--;

  switch (u.state) {
    case 'idle':
      autoAttack(u);
      break;

    case 'move':
      stepPath(u);
      if (!u.path.length) dequeueNext(u);
      break;

    case 'attack_move': {
      const nearest = u.dmg > 0 ? nearestEnemy(u, u.range, 0.5) : null;
      if (nearest) {
        u.state = 'attack'; u.target = nearest.id; u.path = [];
      } else {
        stepPath(u);
        if (!u.path.length) { u.atkMoveDest = null; dequeueNext(u); }
      }
      break;
    }

    case 'patrol': {
      const nearest = u.dmg > 0 ? nearestEnemy(u, u.range, 0.5) : null;
      if (nearest) { u.state = 'attack'; u.target = nearest.id; u.path = []; break; }
      stepPath(u);
      if (!u.path.length) {
        const tmp = u.patrolA; u.patrolA = u.patrolB; u.patrolB = tmp;
        u.path = astarNaval(u.x, u.y, u.patrolB.tx, u.patrolB.ty, false);
        u.mprog = 0;
      }
      break;
    }

    case 'attack': {
      const tgt = getEnt(u.target);
      if (!tgt || tgt.dead || tgt.faction === u.faction) {
        u.target = null;
        if (u.atkMoveDest) {
          u.state = 'attack_move';
          u.path = astarNaval(u.x, u.y, u.atkMoveDest.tx, u.atkMoveDest.ty, false);
          u.mprog = 0;
        } else if (u.patrolA) {
          u.state = 'patrol';
          if (!u.path.length) { u.path = astarNaval(u.x, u.y, u.patrolB.tx, u.patrolB.ty, false); u.mprog = 0; }
        } else {
          dequeueNext(u);
        }
        break;
      }
      const dist = distToEnt(u, tgt);
      const facTx = (tgt.isBuilding ? tgt.x + tgt.w / 2 : tgt.x) * TS;
      const facTy = (tgt.isBuilding ? tgt.y + tgt.h / 2 : tgt.y) * TS;
      u.facing = Math.atan2(facTy - (u.py + TS / 2), facTx - (u.px + TS / 2));
      if (dist <= u.range) {
        u.path = [];
        if (++u.atimer >= u.aspd) {
          u.atimer = 0;
          const ttx = facTx, tty = facTy;
          if (u.splash) {
            spawnShell(u.px + TS / 2, u.py + TS / 2, ttx, tty, u, u.dmg, u.splash * TS);
            if (!state.isRollingBack) {
              const f = u.facing;
              spawnMuzzle(u.px + TS / 2 + Math.cos(f) * TS * 0.7, u.py + TS / 2 + Math.sin(f) * TS * 0.7, FDATA[u.faction].color);
            }
          } else {
            dealDmg(tgt, u.dmg, u);
          }
          const { cam, canvas } = state;
          if (!state.isRollingBack &&
              u.px >= cam.x - 200 && u.px <= cam.x + canvas.width + 200 &&
              u.py >= cam.y - 200 && u.py <= cam.y + canvas.height + 200) {
            playShot(u.type);
          }
        }
      } else {
        // Navigate on water toward target; if target is on land, path may be empty — ship holds position and fires if range allows
        if (!u.path.length || state.tick % 20 === 0) {
          const tx = tgt.isBuilding ? tgt.x + (tgt.w >> 1) : tgt.x;
          const ty = tgt.isBuilding ? tgt.y + (tgt.h >> 1) : tgt.y;
          repath(u, astarNaval(u.x, u.y, tx, ty, false));
        }
        if (u.path.length) stepPath(u);
      }
      break;
    }
  }
}

// ── Air unit logic ────────────────────────────────────────────────────────────

function updateAirUnit(u) {
  if (u.hitFlash > 0) u.hitFlash--;
  if (u.grounded > 0) u.grounded--;
  switch (u.state) {
    case 'idle':
      autoAttack(u);
      break;
    case 'move':
      if (u.destPx !== undefined) moveAirToward(u, u.destPx, u.destPy);
      else u.state = 'idle';
      break;
    case 'attack_move': {
      const nearest = u.dmg > 0 ? nearestEnemy(u, u.range, 0.5) : null;
      if (nearest) {
        u.state = 'attack'; u.target = nearest.id;
      } else if (u.destPx !== undefined) {
        const cx = u.px + TS / 2, cy = u.py + TS / 2;
        const dx = u.destPx - cx, dy = u.destPy - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < u.speed * 1.5) {
          u.state = 'idle'; u.atkMoveDest = null; u.destPx = undefined;
          dequeueNext(u);
        } else {
          u.facing = Math.atan2(dy, dx);
          u.chassisFacing = u.facing;
          u.px += (dx / dist) * u.speed;
          u.py += (dy / dist) * u.speed;
          u.x = (u.px / TS) | 0;
          u.y = (u.py / TS) | 0;
        }
      } else {
        u.state = 'idle'; u.atkMoveDest = null;
        dequeueNext(u);
      }
      break;
    }
    case 'attack': {
      const tgt = getEnt(u.target);
      if (!tgt || tgt.dead || tgt.faction === u.faction) {
        u.target = null;
        if (u.atkMoveDest) { u.state = 'attack_move'; }
        else if (u.patrolA) { u.state = 'patrol'; }
        else { dequeueNext(u); }
        break;
      }
      const dist = distToEnt(u, tgt);
      const tx = (tgt.isBuilding ? tgt.x + tgt.w / 2 : tgt.x) * TS;
      const ty = (tgt.isBuilding ? tgt.y + tgt.h / 2 : tgt.y) * TS;
      u.facing = Math.atan2(ty - (u.py + TS / 2), tx - (u.px + TS / 2));
      if (dist <= u.range) {
        if (++u.atimer >= u.aspd) {
          u.atimer = 0;
          if (u.splash) {
            spawnShell(u.px + TS / 2, u.py + TS / 2 - 12, tx, ty, u, u.dmg, u.splash * TS);
          } else {
            dealDmg(tgt, u.dmg, u);
          }
          const { cam, canvas } = state;
          if (!state.isRollingBack &&
              u.px >= cam.x - 300 && u.px <= cam.x + canvas.width + 300 &&
              u.py >= cam.y - 300 && u.py <= cam.y + canvas.height + 300) {
            playShot(u.type);
          }
        }
      } else {
        moveAirToward(u, tx, ty);
        if (state.tick % 30 === 0) autoAttack(u); // retarget if closer option
      }
      break;
    }
  }
}

function moveAirToward(u, destPx, destPy) {
  const cx = u.px + TS / 2, cy = u.py + TS / 2;
  const dx = destPx - cx, dy = destPy - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < u.speed * 1.5) {
    if (u.state === 'move') { u.state = 'idle'; u.destPx = undefined; }
    return;
  }
  u.facing = Math.atan2(dy, dx);
  u.px += (dx / dist) * u.speed;
  u.py += (dy / dist) * u.speed;
  u.x = (u.px / TS) | 0;
  u.y = (u.py / TS) | 0;
}

// Re-exported from orders.js so the existing call sites in the harvest state
// keep working without an extra import below. The shared helper picks an
// unclaimed reachable ore tile, falling back to contention only when every
// reachable tile is already targeted by another harvester.
const findReachableOre = findHarvesterTarget;

function startReturn(u) {
  // Manual assignment sticks; otherwise return to the nearest refinery from the
  // current (ore-field) position so a newly built closer refinery is used.
  let ref = u.manualRefinery ? getEnt(u.refineryId) : null;
  if (!ref || ref.dead) { u.manualRefinery = false; ref = nearestRefinery(u.faction, u.x, u.y); }
  if (!ref) { u.state = 'idle'; return; }
  u.refineryId = ref.id;
  u.state = 'return';
  const dest = adjTile(ref, u.x, u.y);
  if (dest) { u.path = astar(u.x, u.y, dest.x, dest.y, false); u.mprog = 0; }
}

function stepPath(u) {
  if (!u.path.length) return;
  const next = u.path[0];
  let blocker = null;
  entsAtTile(next.x, next.y, (e) => {
    if (blocker || e.dead || !e.isUnit || e === u || e.armorType === 'air') return;
    blocker = e;
  });
  if (blocker) {
    if (VEHICLE_TYPES.has(u.type) &&
        areEnemies(blocker.faction, u.faction) && blocker.armorType === 'infantry') {
      dealDmg(blocker, blocker.maxHp + 1, u);
    } else {
      const waitLimit = (blocker.path && blocker.path.length > 0) ? 16 : 8;
      u.blockWait = (u.blockWait || 0) + 1;
      if (u.blockWait < waitLimit) return;
      u.blockWait = 0;
      // Stagger re-path by unit id so adjacent units don't oscillate in sync
      if ((state.tick + (u.id % 13)) % 15 === 0) {
        const dest = u.path[u.path.length - 1];
        const pfn = u.armorType === 'naval' ? astarNaval : astar;
        const np = pfn(u.x, u.y, dest.x, dest.y, false);
        repath(u, np.length ? np : pfn(u.x, u.y, dest.x, dest.y, true));
      }
      return;
    }
  } else {
    u.blockWait = 0;
  }
  // Chassis direction tracks the path step so the hull/body visually leads the
  // movement; the gun (u.facing) is still steered by combat.js to track targets.
  u.chassisFacing = Math.atan2(next.y - u.y, next.x - u.x);
  // Diagonal steps span √2 tiles of world distance — slow the per-tick progress
  // accordingly so units don't travel faster on the diagonals.
  const stepLen = (next.x !== u.x && next.y !== u.y) ? Math.SQRT2 : 1;
  u.mprog += u.speed / TS / stepLen;
  if (u.mprog >= 1) {
    u.x = next.x; u.y = next.y;
    u.px = u.x * TS; u.py = u.y * TS;
    u.path.shift(); u.mprog = 0;
  } else {
    u.px = (u.x + (next.x - u.x) * u.mprog) * TS;
    u.py = (u.y + (next.y - u.y) * u.mprog) * TS;
  }
}
