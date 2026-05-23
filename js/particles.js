import { state } from './state.js';

export function spawnExplosion(wx, wy, color, count = 8) {
  // Sparks
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
  // Flash
  state.particles.push({ x: wx, y: wy, life: 1, maxLife: 0.15, r: 12 + count, color: '#fff', type: 'flash' });
  // Smoke puffs
  for (let i = 0; i < 3; i++) {
    const ox = (Math.random() - 0.5) * 8, oy = (Math.random() - 0.5) * 8;
    state.particles.push({
      x: wx + ox, y: wy + oy,
      vx: (Math.random() - 0.5) * 0.4, vy: -0.25 - Math.random() * 0.3,
      life: 1, maxLife: 1.0 + Math.random() * 0.6,
      r: 8 + Math.random() * 6,
      color: count >= 12 ? 'rgb(55,45,40)' : 'rgb(70,60,55)',
      type: 'smoke',
    });
  }
  // Debris chunks (for larger explosions like buildings)
  if (count >= 12) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.8;
      state.particles.push({
        x: wx, y: wy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, maxLife: 0.5 + Math.random() * 0.3,
        r: 3, color: '#3a3020', type: 'debris',
        angle: Math.random() * Math.PI * 2,
      });
    }
  }
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
    if (p.type === 'spark')  { p.x += p.vx; p.y += p.vy; p.vy += 0.12; }
    if (p.type === 'smoke')  { p.x += p.vx; p.y += p.vy; }
    if (p.type === 'debris') { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.angle = (p.angle ?? 0) + 0.15; }
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}
