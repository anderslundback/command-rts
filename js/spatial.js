import { MW, MH, ARMOR_MULT } from './constants.js';
import { state } from './state.js';
import { distToEnt } from './pathfinding.js';
import { areAllied } from './resources.js';

// Uniform spatial bucket grid over the 80×60 tile map. Cells are 8×8 tiles → 10×8 = 80 buckets.
// Rebuilt once per tick from state.entities IN ARRAY ORDER (the canonical deterministic order),
// never snapshotted — it is a pure function of state.entities at rebuild time, exactly like
// _bldgCounts/factionCache. After a rollback the first replayed tick rebuilds it before any
// consumer reads it.
//
// Determinism: every "nearest"/"first" decision must reproduce the old full-scan tie-break,
// which kept the FIRST entity in state.entities order at the strictly-minimum distance. Each
// inserted entity is stamped with `_gi` = its rank in entities order, so callers can break ties
// by smaller `_gi` and get bit-identical results without re-scanning the whole array.

const CELL = 8;
const GW = Math.ceil(MW / CELL); // 10
const GH = Math.ceil(MH / CELL); // 8
const NCELLS = GW * GH;          // 80

const _buckets = new Array(NCELLS);
for (let i = 0; i < NCELLS; i++) _buckets[i] = [];

let _stamp = 0; // visit stamp for dedup across multi-cell entities (buildings span cells)

function cellOf(tx, ty) {
  return ((ty / CELL) | 0) * GW + ((tx / CELL) | 0);
}

export function rebuildGrid() {
  for (let i = 0; i < NCELLS; i++) _buckets[i].length = 0;
  let gi = 0;
  for (const e of state.entities) {
    if (e.dead || e.loaded) continue;
    e._gi = gi++;
    if (e.isBuilding) {
      const cx0 = (e.x / CELL) | 0, cx1 = ((e.x + e.w - 1) / CELL) | 0;
      const cy0 = (e.y / CELL) | 0, cy1 = ((e.y + e.h - 1) / CELL) | 0;
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++)
          _buckets[cy * GW + cx].push(e);
    } else {
      _buckets[cellOf(e.x, e.y)].push(e);
    }
  }
  state.grid = _buckets;
}

// Visit every live entity whose footprint overlaps the tile rect [tx0,ty0]..[tx1,ty1] (inclusive).
// Buildings spanning multiple cells are reported once (deduped via stamp).
export function queryRect(tx0, ty0, tx1, ty1, cb) {
  if (tx1 < 0 || ty1 < 0 || tx0 >= MW || ty0 >= MH) return;
  const cx0 = Math.max(0, (tx0 / CELL) | 0), cx1 = Math.min(GW - 1, (tx1 / CELL) | 0);
  const cy0 = Math.max(0, (ty0 / CELL) | 0), cy1 = Math.min(GH - 1, (ty1 / CELL) | 0);
  const s = ++_stamp;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = _buckets[cy * GW + cx];
      for (let i = 0; i < bucket.length; i++) {
        const e = bucket[i];
        if (e._qs === s) continue;
        e._qs = s;
        cb(e);
      }
    }
  }
}

export function queryRadius(tx, ty, r, cb) {
  queryRect(tx - r, ty - r, tx + r, ty + r, cb);
}

// Every live entity occupying tile (tx,ty), in bucket order (= entities order for that cell).
export function entsAtTile(tx, ty, cb) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
  const bucket = _buckets[cellOf(tx, ty)];
  for (let i = 0; i < bucket.length; i++) {
    const e = bucket[i];
    if (e.isBuilding) {
      if (tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) cb(e);
    } else if (e.x === tx && e.y === ty) {
      cb(e);
    }
  }
}

// Reproduces the old "nearest enemy in range" full scans: nearest enemy with
// distToEnt(u,e) < maxRange + pad, ties broken by first-in-entities-order (smaller _gi).
// autoAttack used pad 0.1; attack_move/patrol used pad 0.5.
//
// Now also respects:
//   • alliances (state.alliances via areAllied) — same-faction OR mutually-allied are skipped
//   • damage matrix (ARMOR_MULT[weapon][armor]) — targets we can't damage are skipped so a
//     destroyer (torpedo) doesn't auto-target infantry it does 0 damage to.
// Force-attack bypasses both because it calls orderAttack directly without consulting this.
export function nearestEnemy(u, maxRange, pad = 0.1) {
  const r = Math.ceil(maxRange + pad) + 1;
  const cx0 = Math.max(0, ((u.x - r) / CELL) | 0), cx1 = Math.min(GW - 1, ((u.x + r) / CELL) | 0);
  const cy0 = Math.max(0, ((u.y - r) / CELL) | 0), cy1 = Math.min(GH - 1, ((u.y + r) / CELL) | 0);
  const limit = maxRange + pad;
  let best = null, bd = limit, bgi = 0;
  const s = ++_stamp;
  const wt = u.weaponType;
  const wMat = wt ? ARMOR_MULT[wt] : null;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = _buckets[cy * GW + cx];
      for (let i = 0; i < bucket.length; i++) {
        const e = bucket[i];
        if (e._qs === s) continue;
        e._qs = s;
        if (e.dead || e.loaded) continue;
        if (areAllied(u.faction, e.faction)) continue;
        // Skip targets this weapon can't damage (torpedo vs infantry etc.) so
        // the unit doesn't waste its aspd clock on whiffs. <=0.05 is the
        // sub-trickle safety threshold.
        if (wMat && e.armorType) {
          const mult = wMat[e.armorType] ?? 1.0;
          if (mult <= 0.05) continue;
        }
        const d = distToEnt(u, e);
        if (d < bd || (d === bd && best !== null && e._gi < bgi)) {
          bd = d; best = e; bgi = e._gi;
        }
      }
    }
  }
  return best;
}
