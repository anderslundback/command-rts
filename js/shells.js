import { TS } from './constants.js';
import { state } from './state.js';
import { dealDmg, dealSplash } from './combat.js';
import { spawnExplosion } from './particles.js';
import { playExplosion } from './audio.js';

const PROPS = {
  artillery: { speed: 2.5, r: 4.5, color: '#e8c060' },
  v2rocket:  { speed: 3.5, r: 3.5, color: '#ff8844' },
  tomahawk:  { speed: 4.5, r: 3.0, color: '#88ddff' },
  gunship:   { speed: 3.0, r: 5.0, color: '#cc8833' },
  cruiser:   { speed: 1.4, r: 4.0, color: '#ffcc44' },
  destroyer: { speed: 2.5, r: 3.5, color: '#44bbff' },
};

export function spawnShell(ox, oy, tx, ty, attacker, dmg, splashRadius) {
  const p = PROPS[attacker.type] ?? { speed: 4, r: 3, color: '#fff' };
  state.shells.push({
    x: ox, y: oy, tx, ty,
    speed: p.speed, r: p.r, color: p.color,
    dmg, splash: splashRadius,
    faction: attacker.faction,
    weaponType: attacker.weaponType,
    type: attacker.type,
    trail: [],
  });
}

export function updateShells() {
  let i = state.shells.length;
  while (i--) {
    const sh = state.shells[i];
    sh.trail.push({ x: sh.x, y: sh.y });
    if (sh.trail.length > 7) sh.trail.shift();
    const dx = sh.tx - sh.x, dy = sh.ty - sh.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= sh.speed * 1.5) {
      const proxy = { faction: sh.faction, weaponType: sh.weaponType };
      if (sh.splash > 0) dealSplash(sh.tx, sh.ty, sh.dmg, sh.splash, proxy);
      const count = sh.type === 'gunship' ? 18 : 12;
      spawnExplosion(sh.tx, sh.ty, '#ffaa22', count);
      spawnExplosion(sh.tx, sh.ty, '#ff5500', count / 2);
      if (!state.isRollingBack) {
        const cx = sh.tx - state.cam.x, cy = sh.ty - state.cam.y;
        const onScreen = cx > -64 && cy > -64 && cx < state.canvas.width + 64 && cy < state.canvas.height + 64;
        if (onScreen) playExplosion();
      }
      state.shells.splice(i, 1);
    } else {
      sh.x += (dx / dist) * sh.speed;
      sh.y += (dy / dist) * sh.speed;
    }
  }
}
