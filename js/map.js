import { MW, MH, T } from './constants.js';
import { state } from './state.js';

export function genMap() {
  state.map = Array.from({ length: MH }, () => new Int8Array(MW));

  for (let i = 0; i < 10; i++) {
    const cx = 5 + (Math.random() * (MW - 10)) | 0;
    const cy = 5 + (Math.random() * (MH - 10)) | 0;
    const r = 2 + (Math.random() * 4) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r + r) setTile(cx + dx, cy + dy, T.WATER);
  }

  for (let i = 0; i < 30; i++) {
    const cx = (Math.random() * MW) | 0;
    const cy = (Math.random() * MH) | 0;
    for (let j = 0; j < 4; j++)
      setTile(cx + ((Math.random() * 6 - 3) | 0), cy + ((Math.random() * 6 - 3) | 0), T.ROCK);
  }

  const oreSeeds = [[20,12],[60,12],[10,30],[40,20],[70,28],[25,48],[55,48],[40,38],[38,8]];
  for (const [ox, oy] of oreSeeds)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx*dx+dy*dy <= 18 && Math.random() < 0.65 && getTile(ox+dx,oy+dy) === T.GRASS)
          setTile(ox + dx, oy + dy, T.ORE);

  for (const [sx, sy] of startPositions())
    for (let dy = -6; dy <= 9; dy++)
      for (let dx = -6; dx <= 9; dx++)
        setTile(sx + dx, sy + dy, T.GRASS);
}

export function setTile(x, y, t) {
  if (x >= 0 && x < MW && y >= 0 && y < MH) state.map[y][x] = t;
}

export function getTile(x, y) {
  if (x < 0 || x >= MW || y < 0 || y >= MH) return T.ROCK;
  return state.map[y][x];
}

export function passable(x, y) {
  const t = getTile(x, y);
  return t !== T.WATER && t !== T.ROCK;
}

export function startPositions() {
  return [[7, 7], [MW - 11, 7], [(MW / 2 | 0) - 1, MH - 12]];
}

export function nearestOre(x, y) {
  let best = null, bd = Infinity;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (state.map[ty][tx] !== T.ORE) continue;
      const d = Math.abs(tx - x) + Math.abs(ty - y);
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
  return best;
}

export function tickOreRegen() {
  if (state.tick % 180 !== 0) return;
  for (const pos of state.oreHistory) {
    const tx = pos % MW, ty = (pos / MW) | 0;
    if (getTile(tx, ty) === T.GRASS && Math.random() < 0.04)
      state.map[ty][tx] = T.ORE;
  }
}
