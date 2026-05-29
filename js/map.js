import { MW, MH, T } from './constants.js';
import { state } from './state.js';

function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

export function genMapFromSeed(seed) {
  const rng = seededRng(seed);
  state.map = Array.from({ length: MH }, () => new Int8Array(MW));

  // Large central sea — bigger than before to encourage naval combat
  const midX = (MW / 2) | 0, midY = (MH / 2) | 0;
  const centralR = 11 + (rng() * 5) | 0;
  for (let dy = -centralR; dy <= centralR; dy++)
    for (let dx = -centralR; dx <= centralR; dx++)
      if (dx * dx + dy * dy <= centralR * centralR) setTile(midX + dx, midY + dy, T.WATER);

  // 2–3 additional random seas
  const extraSeas = 2 + (rng() * 2 | 0);
  for (let i = 0; i < extraSeas; i++) {
    const cx = 8 + (rng() * (MW - 16)) | 0;
    const cy = 8 + (rng() * (MH - 16)) | 0;
    const r = 3 + (rng() * 5) | 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r) setTile(cx + dx, cy + dy, T.WATER);
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

  // Clear start zones before carving rivers so rivers are never inside a base
  for (const [sx, sy] of startPositions())
    for (let dy = -6; dy <= 9; dy++)
      for (let dx = -6; dx <= 9; dx++)
        setTile(sx + dx, sy + dy, T.GRASS);

  // Carve 3-tile-wide rivers from central sea toward each start, stopping just
  // outside the start clear zone so every player has a natural harbour nearby.
  // Endpoints are chosen to land ~4 tiles clear of each base perimeter.
  _carveRiver(midX, midY, 21, 17);  // top-left harbour
  _carveRiver(midX, midY, 59, 17);  // top-right harbour
  _carveRiver(midX, midY, 40, 41);  // bottom harbour
}

// Carve a 3-wide canal of water tiles from (x0,y0) to (x1,y1).
// Widens perpendicular to the dominant movement axis each step.
function _carveRiver(x0, y0, x1, y1) {
  let x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    const adx = Math.abs(x1 - x), ady = Math.abs(y1 - y);
    if (adx >= ady) x += Math.sign(x1 - x);
    else             y += Math.sign(y1 - y);
    setTile(x, y, T.WATER);
    if (adx >= ady) { setTile(x, y - 1, T.WATER); setTile(x, y + 1, T.WATER); }
    else             { setTile(x - 1, y, T.WATER); setTile(x + 1, y, T.WATER); }
  }
}

export function genMap() {
  genMapFromSeed((Math.random() * 0xffffffff) >>> 0);
}

export function setTile(x, y, t) {
  if (x >= 0 && x < MW && y >= 0 && y < MH) { state.map[y][x] = t; state.mapDirty = true; }
}

export function getTile(x, y) {
  if (x < 0 || x >= MW || y < 0 || y >= MH) return T.ROCK;
  return state.map[y][x];
}

export function passable(x, y) {
  const t = getTile(x, y);
  return t !== T.WATER && t !== T.ROCK;
}

export function passableNaval(x, y) {
  return getTile(x, y) === T.WATER;
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
    if (getTile(tx, ty) !== T.GRASS) continue;
    const occupied = state.entities.some(e => !e.dead && e.isBuilding &&
      tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h);
    if (!occupied && state.rng() < 0.04) {
      state.map[ty][tx] = T.ORE;
      state.mapDirty = true;
    }
  }
}
