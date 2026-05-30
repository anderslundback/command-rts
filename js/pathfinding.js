import { MW, MH } from './constants.js';
import { state } from './state.js';
import { passable, passableNaval } from './map.js';

class MinHeap {
  constructor() { this.d = []; }
  clear() { this.d.length = 0; }
  push(item) { this.d.push(item); this._up(this.d.length - 1); }
  pop() {
    const top = this.d[0];
    const last = this.d.pop();
    if (this.d.length) { this.d[0] = last; this._dn(0); }
    return top;
  }
  get size() { return this.d.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p].f <= this.d[i].f) break;
      const t = this.d[p]; this.d[p] = this.d[i]; this.d[i] = t;
      i = p;
    }
  }
  _dn(i) {
    const n = this.d.length;
    for (;;) {
      let m = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.d[l].f < this.d[m].f) m = l;
      if (r < n && this.d[r].f < this.d[m].f) m = r;
      if (m === i) break;
      const t = this.d[m]; this.d[m] = this.d[i]; this.d[i] = t;
      i = m;
    }
  }
}

// 8-direction movement with √2 cost for diagonals. Orthogonal neighbours come
// first so when two paths have equal f, the heap pop order favours the cardinal
// step (visually nicer when the diagonal is also valid).
const SQRT2 = Math.SQRT2;
const DIRS = [
  { x: 1, y: 0, c: 1 }, { x: -1, y: 0, c: 1 },
  { x: 0, y: 1, c: 1 }, { x: 0, y: -1, c: 1 },
  { x: 1, y: 1, c: SQRT2 }, { x: -1, y: 1, c: SQRT2 },
  { x: 1, y: -1, c: SQRT2 }, { x: -1, y: -1, c: SQRT2 },
];
// Octile distance — admissible heuristic for 8-direction movement.
function _octile(dx, dy) {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  return (adx > ady ? adx : ady) + (SQRT2 - 1) * (adx < ady ? adx : ady);
}
const SIZE = MW * MH;

// Preallocated buffers — reused every A* call to avoid GC pressure in the combat hot path.
// Occupancy grids are rebuilt at most ONCE per tick (tick-stamped), not per call:
//   _occ    — land: non-depot buildings + all units      (ignoreUnits=false)
//   _occNoU — land: non-depot buildings only             (ignoreUnits=true)
// The per-call start-tile exclusion is dropped: the start node is closed before any neighbour
// can re-enter it, so its occupancy bit is never read. The grid is therefore a pure function of
// state.entities at the tick's first pathfind call — identical across clients (deterministic).
// Rollback replays the SAME tick numbers the forward pass already stamped, so the stamps must
// be cleared explicitly via invalidatePathCache() (called from restoreSnapshot) — otherwise the
// first replayed pathfind reuses the forward pass's stale occupancy.
const _occ     = new Uint8Array(SIZE);
const _occNoU  = new Uint8Array(SIZE);
let   _occTick = -1, _occNoUTick = -1;
const _g      = new Float32Array(SIZE);
const _came   = new Int32Array(SIZE);
const _closed = new Uint8Array(SIZE);
const _heap   = new MinHeap();

// Invalidate the per-tick occupancy stamps. MUST be called on every snapshot restore
// (rollback / state-dump): replay re-runs the SAME tick numbers the forward pass already
// stamped, so without this the first replayed pathfind would reuse the forward pass's stale
// occupancy (built for a different input) → wrong paths → position desync. The naval/land
// stamps live in this module, so the reset must happen here.
export function invalidatePathCache() {
  _occTick = -1; _occNoUTick = -1; _noccTick = -1; _noccNoUTick = -1;
}

function _buildLandOcc(grid, includeUnits) {
  grid.fill(0);
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.isBuilding) {
      if (e.type === 'depot') continue; // depot pad is walkable
      for (let dy = 0; dy < e.h; dy++)
        for (let dx = 0; dx < e.w; dx++)
          grid[(e.y + dy) * MW + (e.x + dx)] = 1;
    } else if (includeUnits && e.isUnit) {
      grid[e.y * MW + e.x] = 1;
    }
  }
}

export function astar(sx, sy, ex, ey, ignoreUnits) {
  if (sx === ex && sy === ey) return [];

  let occ;
  if (ignoreUnits) {
    if (_occNoUTick !== state.tick) { _buildLandOcc(_occNoU, false); _occNoUTick = state.tick; }
    occ = _occNoU;
  } else {
    if (_occTick !== state.tick) { _buildLandOcc(_occ, true); _occTick = state.tick; }
    occ = _occ;
  }

  _g.fill(Infinity);
  _came.fill(-1);
  _closed.fill(0);
  const g = _g, came = _came, closed = _closed;
  const sk = sy * MW + sx;
  g[sk] = 0;

  const open = _heap;
  open.clear();
  open.push({ x: sx, y: sy, f: _octile(sx - ex, sy - ey) });

  let iters = 0;
  while (open.size > 0 && ++iters < 3000) {
    const cur = open.pop();
    const ck = cur.y * MW + cur.x;
    if (closed[ck]) continue;
    closed[ck] = 1;

    if (cur.x === ex && cur.y === ey) {
      const path = [];
      let k = ck;
      while (came[k] >= 0) {
        path.unshift({ x: k % MW, y: (k / MW) | 0 });
        k = came[k];
      }
      return path;
    }

    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      if (!passable(nx, ny)) continue;
      // Diagonal corner-cutting prevention: both orthogonal neighbours must be
      // passable and unblocked, otherwise the unit would squeeze through a wall.
      if (d.x !== 0 && d.y !== 0) {
        if (!passable(cur.x + d.x, cur.y) || !passable(cur.x, cur.y + d.y)) continue;
        if (occ[cur.y * MW + (cur.x + d.x)] || occ[(cur.y + d.y) * MW + cur.x]) continue;
      }
      const nk = ny * MW + nx;
      if (closed[nk]) continue;
      const isGoal = nx === ex && ny === ey;
      if (occ[nk] && !isGoal) continue;
      const ng = g[ck] + d.c;
      if (ng < g[nk]) {
        came[nk] = ck;
        g[nk] = ng;
        open.push({ x: nx, y: ny, f: ng + _octile(nx - ex, ny - ey) });
      }
    }
  }
  return [];
}

// Separate preallocated buffers for naval pathfinding (runs concurrently with land A*).
// Same tick-stamped occupancy strategy: all buildings + (optionally) naval units.
const _nocc     = new Uint8Array(SIZE);
const _noccNoU  = new Uint8Array(SIZE);
let   _noccTick = -1, _noccNoUTick = -1;
const _ng      = new Float32Array(SIZE);
const _ncame   = new Int32Array(SIZE);
const _nclosed = new Uint8Array(SIZE);
const _nheap   = new MinHeap();

function _buildNavalOcc(grid, includeUnits) {
  grid.fill(0);
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.isBuilding) {
      for (let dy = 0; dy < e.h; dy++)
        for (let dx = 0; dx < e.w; dx++)
          grid[(e.y + dy) * MW + (e.x + dx)] = 1;
    } else if (includeUnits && e.isUnit && e.armorType === 'naval') {
      grid[e.y * MW + e.x] = 1;
    }
  }
}

export function astarNaval(sx, sy, ex, ey, ignoreUnits) {
  if (sx === ex && sy === ey) return [];

  let occ;
  if (ignoreUnits) {
    if (_noccNoUTick !== state.tick) { _buildNavalOcc(_noccNoU, false); _noccNoUTick = state.tick; }
    occ = _noccNoU;
  } else {
    if (_noccTick !== state.tick) { _buildNavalOcc(_nocc, true); _noccTick = state.tick; }
    occ = _nocc;
  }

  _ng.fill(Infinity);
  _ncame.fill(-1);
  _nclosed.fill(0);
  const g = _ng, came = _ncame, closed = _nclosed;
  const sk = sy * MW + sx;
  g[sk] = 0;

  const open = _nheap;
  open.clear();
  open.push({ x: sx, y: sy, f: _octile(sx - ex, sy - ey) });

  let iters = 0;
  while (open.size > 0 && ++iters < 3000) {
    const cur = open.pop();
    const ck = cur.y * MW + cur.x;
    if (closed[ck]) continue;
    closed[ck] = 1;

    if (cur.x === ex && cur.y === ey) {
      const path = [];
      let k = ck;
      while (came[k] >= 0) {
        path.unshift({ x: k % MW, y: (k / MW) | 0 });
        k = came[k];
      }
      return path;
    }

    for (const d of DIRS) {
      const nx = cur.x + d.x, ny = cur.y + d.y;
      if (!passableNaval(nx, ny)) continue;
      if (d.x !== 0 && d.y !== 0) {
        if (!passableNaval(cur.x + d.x, cur.y) || !passableNaval(cur.x, cur.y + d.y)) continue;
        if (occ[cur.y * MW + (cur.x + d.x)] || occ[(cur.y + d.y) * MW + cur.x]) continue;
      }
      const nk = ny * MW + nx;
      if (closed[nk]) continue;
      const isGoal = nx === ex && ny === ey;
      if (occ[nk] && !isGoal) continue;
      const ng = g[ck] + d.c;
      if (ng < g[nk]) {
        came[nk] = ck;
        g[nk] = ng;
        open.push({ x: nx, y: ny, f: ng + _octile(nx - ex, ny - ey) });
      }
    }
  }
  return [];
}

export function adjTileNaval(b, fx, fy) {
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      if (dx > -1 && dx < b.w && dy > -1 && dy < b.h) continue;
      const nx = b.x + dx, ny = b.y + dy;
      if (!passableNaval(nx, ny)) continue;
      const d = Math.abs(nx - fx) + Math.abs(ny - fy);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
  return best;
}

export function adjTile(b, fx, fy) {
  let best = null, bd = Infinity;
  for (let dy = -1; dy <= b.h; dy++)
    for (let dx = -1; dx <= b.w; dx++) {
      if (dx > -1 && dx < b.w && dy > -1 && dy < b.h) continue;
      const nx = b.x + dx, ny = b.y + dy;
      if (!passable(nx, ny)) continue;
      const d = Math.abs(nx - fx) + Math.abs(ny - fy);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
  return best;
}

export function adjToBuilding(x, y, b) {
  return x >= b.x - 1 && x <= b.x + b.w &&
         y >= b.y - 1 && y <= b.y + b.h &&
         !(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
}

export function distToEnt(a, b) {
  if (b.isBuilding) {
    const cx = Math.max(b.x, Math.min(b.x + b.w - 1, a.x));
    const cy = Math.max(b.y, Math.min(b.y + b.h - 1, a.y));
    return Math.abs(a.x - cx) + Math.abs(a.y - cy);
  }
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
