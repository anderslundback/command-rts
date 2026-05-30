import { TS, FDATA, ARMOR_MULT } from './constants.js';
import { state } from './state.js';
import { calcPower, areAllied } from './resources.js';
import { spawnExplosion, spawnMuzzle } from './particles.js';
import { speak } from './audio.js';
import { distToEnt } from './pathfinding.js';
import { queryRect, nearestEnemy } from './spatial.js';

export function dealDmg(e, dmg, attacker) {
  let actualDmg = dmg;
  if (attacker?.weaponType && e.armorType) {
    const effectiveArmor = (e.type === 'chinook' && e.grounded > 0) ? 'light' : e.armorType;
    const mult = ARMOR_MULT[attacker.weaponType]?.[effectiveArmor] ?? 1.0;
    actualDmg = Math.max(1, Math.round(dmg * mult));
  }
  e.hp -= actualDmg;
  e.hitFlash = 8;
  if (!state.isRollingBack) {
    const epx = e.isBuilding ? (e.x + e.w / 2) * TS : e.px + TS / 2;
    const epy = e.isBuilding ? (e.y + e.h / 2) * TS : e.py + TS / 2;
    state.damageNumbers.push({ x: epx, y: epy, val: actualDmg, age: 0 });
    if (e.isBuilding && e.faction === state.playerFaction && state.canvas) {
      const bpx = e.x * TS, bpy = e.y * TS, bpw = e.w * TS, bph = e.h * TS;
      const onScreen = bpx + bpw > state.cam.x && bpx < state.cam.x + state.canvas.width
                    && bpy + bph > state.cam.y && bpy < state.cam.y + state.canvas.height;
      if (!onScreen) {
        if (state.underAttackTimer <= 0) {
          state.statusMsg = 'Base under attack!';
          state.statusTimer = 120;
          speak('Base under attack');
        }
        state.underAttackTimer = 100;
      }
    }
  }
  if (attacker && attacker.px !== undefined) {
    const acx = attacker.px + TS / 2;
    const acy = attacker.py + TS / 2;
    const f = attacker.facing ?? 0;
    const mx = acx + Math.cos(f) * TS * 0.6, my = acy + Math.sin(f) * TS * 0.6;
    spawnMuzzle(mx, my, FDATA[attacker.faction].color);
    if (attacker.weaponType === 'rockets') {
      // Rocket back-blast smoke trail
      for (let i = 1; i <= 3; i++) {
        state.particles.push({
          x: acx - Math.cos(f) * i * 4, y: acy - Math.sin(f) * i * 4,
          vx: -Math.cos(f) * 0.4, vy: -Math.sin(f) * 0.4,
          life: 1, maxLife: 0.25 + i * 0.05,
          r: 3 + i * 1.5, color: 'rgb(60,50,40)', type: 'smoke',
        });
      }
    }
  }
  if (e.hp <= 0) {
    e.dead = true;
    calcPower();
    const cx = (e.isBuilding ? (e.x + e.w / 2) * TS : e.px + TS / 2);
    const cy = (e.isBuilding ? (e.y + e.h / 2) * TS : e.py + TS / 2);
    const count = e.isBuilding ? 20 : 10;
    spawnExplosion(cx, cy, FDATA[e.faction].color, count);
    spawnExplosion(cx, cy, '#ffaa22', count / 2);
    state.minimapDirty = true;
    if (e.faction !== state.playerFaction) state.gameStats.enemiesKilled++;
    else if (e.isUnit) state.gameStats.unitsLost++;
  }
}

export function dealSplash(cx, cy, baseDmg, radiusPx, attacker) {
  const rSq = radiusPx * radiusPx;
  const tx = (cx / TS) | 0, ty = (cy / TS) | 0;
  const rt = ((radiusPx / TS) | 0) + 1;
  queryRect(tx - rt, ty - rt, tx + rt, ty + rt, (e) => {
    if (e.dead || e.loaded) return;
    // No friendly fire on allies (covers own faction too — areAllied returns true for self).
    if (attacker && areAllied(attacker.faction, e.faction)) return;
    const ex = e.isBuilding ? (e.x + e.w / 2) * TS : e.px + TS / 2;
    const ey = e.isBuilding ? (e.y + e.h / 2) * TS : e.py + TS / 2;
    const dx = ex - cx, dy = ey - cy;
    if (dx * dx + dy * dy <= rSq) dealDmg(e, baseDmg, attacker);
  });
}

export function autoAttack(u) {
  if (!u.dmg) return;
  const nearest = nearestEnemy(u, u.range);
  if (nearest) { u.target = nearest.id; u.state = 'attack'; }
}
