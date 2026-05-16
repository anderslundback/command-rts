import { TS, FDATA, FBONUSES } from './constants.js';
import { state } from './state.js';
import { getTile, nearestOre } from './map.js';
import { T } from './constants.js';
import { getEnt } from './entities.js';
import { astar, adjTile, adjToBuilding, distToEnt } from './pathfinding.js';
import { nearestRefinery } from './resources.js';
import { dealDmg, autoAttack } from './combat.js';
import { orderHarvest } from './orders.js';
import { playShot, playCash } from './audio.js';

export function updateUnit(u) {
  if (u.hitFlash > 0) u.hitFlash--;

  switch (u.state) {
    case 'idle':
      autoAttack(u);
      break;

    case 'move':
      stepPath(u);
      if (!u.path.length) u.state = 'idle';
      break;

    case 'attack': {
      const tgt = getEnt(u.target);
      if (!tgt || tgt.dead) { u.state = 'idle'; u.target = null; break; }
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
          dealDmg(tgt, u.dmg, u);
          const { cam, canvas } = state;
          if (u.px >= cam.x - 200 && u.px <= cam.x + canvas.width + 200 &&
              u.py >= cam.y - 200 && u.py <= cam.y + canvas.height + 200) {
            playShot(u.type);
          }
        }
      } else {
        if (!u.path.length || state.tick % 20 === 0) {
          const dest = tgt.isBuilding ? adjTile(tgt, u.x, u.y) : { x: tgt.x, y: tgt.y };
          if (dest) u.path = astar(u.x, u.y, dest.x, dest.y, false);
        }
        stepPath(u);
      }
      break;
    }

    case 'harvest': {
      const ht = u.harvestTile;
      if (!ht || getTile(ht.x, ht.y) !== T.ORE) {
        const ore = nearestOre(u.x, u.y);
        if (ore) { u.harvestTile = ore; u.path = astar(u.x, u.y, ore.x, ore.y, true); u.mprog = 0; }
        else u.state = 'idle';
        break;
      }
      if (u.x === ht.x && u.y === ht.y) {
        u.ore += 30;
        state.map[ht.y][ht.x] = T.GRASS;
        if (u.ore >= u.maxOre) {
          startReturn(u);
        } else {
          const ore = nearestOre(u.x, u.y);
          if (ore) { u.harvestTile = ore; u.path = astar(u.x, u.y, ore.x, ore.y, true); u.mprog = 0; }
          else startReturn(u);
        }
      } else {
        stepPath(u);
        if (!u.path.length && (u.x !== ht.x || u.y !== ht.y)) {
          u.path = astar(u.x, u.y, ht.x, ht.y, true);
          u.mprog = 0;
        }
      }
      break;
    }

    case 'return': {
      let ref = getEnt(u.refineryId);
      if (!ref || ref.dead) {
        ref = nearestRefinery(u.faction, u.x, u.y);
        if (ref) u.refineryId = ref.id; else { u.state = 'idle'; break; }
      }
      if (adjToBuilding(u.x, u.y, ref)) {
        state.credits[u.faction] += u.ore * FBONUSES[u.faction].creditMult;
        u.ore = 0;
        if (u.faction === state.playerFaction) playCash();
        orderHarvest(u, ref);
      } else {
        if (!u.path.length || state.tick % 30 === 0) {
          const dest = adjTile(ref, u.x, u.y);
          if (dest) { u.path = astar(u.x, u.y, dest.x, dest.y, false); u.mprog = 0; }
        }
        stepPath(u);
      }
      break;
    }
  }
}

function startReturn(u) {
  let ref = getEnt(u.refineryId);
  if (!ref || ref.dead) ref = nearestRefinery(u.faction, u.x, u.y);
  if (!ref) { u.state = 'idle'; return; }
  u.refineryId = ref.id;
  u.state = 'return';
  const dest = adjTile(ref, u.x, u.y);
  if (dest) { u.path = astar(u.x, u.y, dest.x, dest.y, false); u.mprog = 0; }
}

function stepPath(u) {
  if (!u.path.length) return;
  const next = u.path[0];
  const blocker = state.entities.find(e => !e.dead && e.isUnit && e !== u && e.x === next.x && e.y === next.y);
  if (blocker) {
    if ((u.type === 'tank' || u.type === 'harvester') &&
        blocker.faction !== u.faction && blocker.armorType === 'infantry') {
      dealDmg(blocker, blocker.maxHp + 1, u);
    } else {
      if (state.tick % 15 === 0) {
        const dest = u.path[u.path.length - 1];
        u.path = astar(u.x, u.y, dest.x, dest.y, false);
        u.mprog = 0;
      }
      return;
    }
  }
  u.mprog += u.speed / TS;
  if (u.mprog >= 1) {
    u.x = next.x; u.y = next.y;
    u.px = u.x * TS; u.py = u.y * TS;
    u.path.shift(); u.mprog = 0;
  } else {
    u.px = (u.x + (next.x - u.x) * u.mprog) * TS;
    u.py = (u.y + (next.y - u.y) * u.mprog) * TS;
  }
}
