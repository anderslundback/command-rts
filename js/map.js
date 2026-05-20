import { MW, MH, T } from './constants.js';
import { state } from './state.js';

function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

export function genMapFromSeed(seed) {
  const rng = seededRng(seed);
  state.map = Array.from({ length: MH }, () => new Int8Array(MW));

  for (let i = 0; i < 8; i++) {
    const cx = 5 + (rng() * (MW - 10)) | 0;
    const cy = 5 + (rng() * (MH - 10)) | 0;
    const r = 1 + (rng() * 3) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r + r) setTile(cx + dx, cy + dy, T.WATER);
  }

  for (let i = 0; i < 30; i++) {
    const cx = (rng() * MW) | 0;
    const cy = (rng() * MH) | 0;
    for (let j = 0; j < 4; j++)
      setTile(cx + ((rng() * 6 - 3) | 0), cy + ((rng() * 6 - 3) | 0), T.ROCK);
  }

  const oreSeeds = [
    [18,13],[10,23],[21,24],
    [60,13],[68,23],[57,24],
    [28,40],[50,40],[39,35],
    [25,28],[53,28],[39,16],
  ];
  for (const [ox, oy] of oreSeeds)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx*dx+dy*dy <= 18 && rng() < 0.65 && getTile(ox+dx,oy+dy) === T.GRASS)
          setTile(ox + dx, oy + dy, T.ORE);

  for (const [sx, sy] of startPositions())
    for (let dy = -6; dy <= 9; dy++)
      for (let dx = -6; dx <= 9; dx++)
        setTile(sx + dx, sy + dy, T.GRASS);
}

export function genMap() {
  genMapFromSeed((Math.random() * 0xffffffff) >>> 0);
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

export function nearestOre(x, y, exclude) {
  let best = null, bd = Infinity;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (state.map[ty][tx] !== T.ORE) continue;
      if (exclude?.has(ty * MW + tx)) continue;
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
