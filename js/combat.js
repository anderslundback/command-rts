import { TS, FDATA, ARMOR_MULT } from './constants.js';
import { state } from './state.js';
import { calcPower } from './resources.js';
import { spawnExplosion, spawnMuzzle } from './particles.js';
import { distToEnt } from './pathfinding.js';

export function dealDmg(e, dmg, attacker) {
  let actualDmg = dmg;
  if (attacker?.weaponType && e.armorType) {
    const mult = ARMOR_MULT[attacker.weaponType]?.[e.armorType] ?? 1.0;
    actualDmg = Math.max(1, Math.round(dmg * mult));
  }
  e.hp -= actualDmg;
  e.hitFlash = 8;
  if (attacker && attacker.px !== undefined)
    spawnMuzzle(attacker.px, attacker.py, FDATA[attacker.faction].color);
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
  for (const e of state.entities) {
    if (e.dead || e.faction === attacker.faction) continue;
    const ex = e.isBuilding ? (e.x + e.w / 2) * TS : e.px + TS / 2;
    const ey = e.isBuilding ? (e.y + e.h / 2) * TS : e.py + TS / 2;
    const dx = ex - cx, dy = ey - cy;
    if (dx * dx + dy * dy <= rSq) dealDmg(e, baseDmg, attacker);
  }
}

export function autoAttack(u) {
  if (!u.dmg) return;
  let nearest = null, nd = u.range + 0.1;
  for (const e of state.entities) {
    if (e.dead || e.faction === u.faction) continue;
    const d = distToEnt(u, e);
    if (d < nd) { nd = d; nearest = e; }
  }
  if (nearest) { u.target = nearest.id; u.state = 'attack'; }
}
