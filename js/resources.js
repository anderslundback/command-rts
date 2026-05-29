import { state } from './state.js';

export function calcPower() {
  for (let f = 0; f < 3; f++) {
    let gen = 0, use = 0;
    for (const e of state.entities) {
      if (e.dead || !e.isBuilding || e.faction !== f || !e.done) continue;
      if (e.power > 0) {
        const hpRatio = e.hp / e.maxHp;
        gen += Math.max(1, Math.ceil(e.power * hpRatio));
      } else {
        use += -e.power;
      }
    }
    state.powerGen[f] = gen;
    state.powerUsed[f] = use;
  }
}

export function hasPwr(f) { return state.powerGen[f] >= state.powerUsed[f]; }

export function getPowerRatio(f) {
  if (state.powerUsed[f] === 0) return 1;
  return Math.min(1, state.powerGen[f] / state.powerUsed[f]);
}

export function nearestRefinery(f, x, y) {
  let best = null, bd = Infinity;
  const cache = state.factionCache?.[f]?.doneBuildings;
  if (cache) {
    for (const e of cache) {
      if (e.type !== 'refinery') continue;
      const d = Math.abs(e.x - x) + Math.abs(e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  for (const e of state.entities) {
    if (e.dead || !e.isBuilding || e.faction !== f || e.type !== 'refinery' || !e.done) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
