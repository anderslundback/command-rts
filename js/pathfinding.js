import { MW, MH } from './constants.js';
import { state } from './state.js';
import { passable } from './map.js';

class MinHeap {
  constructor() { this.d = []; }
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

const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const SIZE = MW * MH;

export function astar(sx, sy, ex, ey, ignoreUnits) {
  if (sx === ex && sy === ey) return [];

  const occ = new Uint8Array(SIZE);
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.isBuilding) {
      for (let dy = 0; dy < e.h; dy++)
        for (let dx = 0; dx < e.w; dx++)
          occ[(e.y + dy) * MW + (e.x + dx)] = 1;
    } else if (e.isUnit && !ignoreUnits && !(e.x === sx && e.y === sy)) {
      occ[e.y * MW + e.x] = 1;
    }
  }

  const g = new Float32Array(SIZE).fill(Infinity);
  const came = new Int32Array(SIZE).fill(-1);
  const closed = new Uint8Array(SIZE);
  const sk = sy * MW + sx;
  g[sk] = 0;

  const open = new MinHeap();
  open.push({ x: sx, y: sy, f: Math.abs(sx - ex) + Math.abs(sy - ey) });

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
      const nk = ny * MW + nx;
      if (closed[nk]) continue;
      const isGoal = nx === ex && ny === ey;
      if (occ[nk] && !isGoal) continue;
      const ng = g[ck] + 1;
      if (ng < g[nk]) {
        came[nk] = ck;
        g[nk] = ng;
        open.push({ x: nx, y: ny, f: ng + Math.abs(nx - ex) + Math.abs(ny - ey) });
      }
    }
  }
  return [];
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
