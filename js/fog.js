import { MW, MH } from './constants.js';
import { state } from './state.js';

const VISION_R = {
  rifleman: 6, rocketeer: 6, harvester: 7,
  scout: 9, aatrack: 7, tank: 7, mcv: 7,
  artillery: 7, v2rocket: 7, tomahawk: 7,
  fighter: 11, gunship: 9, drone: 11, chinook: 7,
  command: 8, power: 5, refinery: 5, barracks: 5,
  factory: 5, depot: 5, radar: 13, airfield: 6,
  turret: 6, antiair: 7, navalyard: 6,
  cruiser: 11, destroyer: 9, submarine: 7, transport: 7,
};

export function initFog() {
  state.fog = {
    explored: new Uint8Array(MW * MH),
    visible:  new Uint8Array(MW * MH),
  };
}

export function updateFog() {
  const { fog, entities, playerFaction } = state;
  if (!fog?.visible) return;
  if (state.revealAll) { fog.visible.fill(1); fog.explored.fill(1); return; }
  fog.visible.fill(0);
  for (const e of entities) {
    if (e.dead || e.faction !== playerFaction) continue;
    const vr = VISION_R[e.type] ?? 6;
    const cx = e.isBuilding ? e.x + e.w / 2 : e.x + 0.5;
    const cy = e.isBuilding ? e.y + e.h / 2 : e.y + 0.5;
    const vrSq = vr * vr;
    const x0 = Math.max(0, Math.floor(cx - vr));
    const x1 = Math.min(MW - 1, Math.ceil(cx + vr));
    const y0 = Math.max(0, Math.floor(cy - vr));
    const y1 = Math.min(MH - 1, Math.ceil(cy + vr));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx, dy = ty + 0.5 - cy;
        if (dx * dx + dy * dy <= vrSq) {
          const idx = ty * MW + tx;
          fog.visible[idx] = 1;
          fog.explored[idx] = 1;
        }
      }
    }
  }
}
