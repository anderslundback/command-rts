import { state } from './state.js';

export function calcPower() {
  for (let f = 0; f < 3; f++) {
    let gen = 0, use = 0;
    for (const e of state.entities) {
      if (e.dead || !e.isBuilding || e.faction !== f || !e.done) continue;
      e.power > 0 ? (gen += e.power) : (use += -e.power);
    }
    state.powerGen[f] = gen;
    state.powerUsed[f] = use;
  }
}

export function hasPwr(f) { return state.powerGen[f] >= state.powerUsed[f]; }

export function nearestRefinery(f, x, y) {
  let best = null, bd = Infinity;
  for (const e of state.entities) {
    if (e.dead || !e.isBuilding || e.faction !== f || e.type !== 'refinery' || !e.done) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
