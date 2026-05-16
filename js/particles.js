import { state } from './state.js';

export function spawnExplosion(wx, wy, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2.5;
    state.particles.push({
      x: wx, y: wy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, maxLife: 0.4 + Math.random() * 0.4,
      r: 2 + Math.random() * 3, color, type: 'spark',
    });
  }
  state.particles.push({ x: wx, y: wy, life: 1, maxLife: 0.15, r: 12 + count, color: '#fff', type: 'flash' });
}

export function spawnMuzzle(wx, wy, color) {
  state.particles.push({ x: wx, y: wy, life: 1, maxLife: 0.08, r: 6, color, type: 'flash' });
}

export function updateParticles() {
  const dt = 1 / 60;
  let i = state.particles.length;
  while (i--) {
    const p = state.particles[i];
    p.life -= dt / p.maxLife;
    if (p.type === 'spark') { p.x += p.vx; p.y += p.vy; p.vy += 0.12; }
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}
