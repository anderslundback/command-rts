import { MW, MH } from './constants.js';
import { state } from './state.js';

const VISION_R = {
  rifleman: 4, rocketeer: 4, harvester: 5,
  scout: 6, aatrack: 5, tank: 5, mcv: 5,
  artillery: 5, v2rocket: 5, tomahawk: 5,
  fighter: 8, gunship: 6, drone: 8, chinook: 5,
  command: 5, power: 3, refinery: 3, barracks: 3,
  factory: 3, depot: 3, radar: 9, airfield: 4,
  turret: 4, antiair: 5, navalyard: 4,
  cruiser: 8, destroyer: 6, submarine: 5, transport: 5,
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
  fog.visible.fill(0);
  for (const e of entities) {
    if (e.dead || e.faction !== playerFaction) continue;
    const vr = VISION_R[e.type] ?? 4;
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
