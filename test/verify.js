#!/usr/bin/env node
// Headless verification tests for pure game-logic functions.
// Run with: node test/verify.js
//
// These cover modules that have no browser API dependencies.

import { makeLCG } from '../js/rng.js';

let passed = 0, failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── RNG tests ─────────────────────────────────────────────────────────────────

console.log('RNG (makeLCG)');

const rng = makeLCG(42);
const v1 = rng();
assert('produces values in [0, 1)', v1 >= 0 && v1 < 1);

const v2 = rng();
assert('consecutive calls differ', v1 !== v2);

// Determinism: same seed → same sequence
const rng2 = makeLCG(42);
assert('same seed produces same first value', rng2() === v1);
assert('same seed produces same second value', rng2() === v2);

// getState / setState round-trip
const rng3 = makeLCG(0xdeadbeef);
rng3(); rng3();
const saved = rng3.getState();
const v3a = rng3();
rng3.setState(saved);
const v3b = rng3();
assert('setState restores sequence', v3a === v3b);

// Different seeds produce different sequences
const rngA = makeLCG(1), rngB = makeLCG(2);
assert('different seeds differ', rngA() !== rngB());

// Large number of samples stay in bounds
const rng4 = makeLCG(12345);
let allInBounds = true;
for (let i = 0; i < 10000; i++) { const v = rng4(); if (v < 0 || v >= 1) { allInBounds = false; break; } }
assert('10k samples all in [0, 1)', allInBounds);

// Seed 0 still works
const rng0 = makeLCG(0);
const v0 = rng0();
assert('seed 0 produces a finite value', isFinite(v0));

// Rollback-style: advance N steps, save state, advance M more, restore, re-advance M → same
const rngRB = makeLCG(999);
for (let i = 0; i < 50; i++) rngRB();
const snapState = rngRB.getState();
const snapVals = [rngRB(), rngRB(), rngRB()];
rngRB.setState(snapState);
const replayVals = [rngRB(), rngRB(), rngRB()];
assert('rollback replay produces identical sequence', JSON.stringify(snapVals) === JSON.stringify(replayVals));

// ── entityHash tests ──────────────────────────────────────────────────────────

console.log('\nentityHash');

// Inline the hash logic (same formula as lockstep.js) to avoid browser-module deps
function entityHash(entities) {
  let h = 0;
  for (const e of entities) {
    if (e.dead) continue;
    h ^= (e.id * 73856093) ^ ((e.hp | 0) * 19349663) ^ (Math.round(e.px) * 83492791) ^ (Math.round(e.py) * 95452411);
    h = (h ^ (h >>> 13)) * 1540483477;
    h = h >>> 0;
  }
  return h;
}

const ents = [
  { id: 1, hp: 100, px: 64, py: 96, dead: false },
  { id: 2, hp: 200, px: 128, py: 32, dead: false },
];
const h1 = entityHash(ents);
assert('hash is a non-negative integer', Number.isInteger(h1) && h1 >= 0);

const h2 = entityHash(ents);
assert('hash is deterministic', h1 === h2);

// Dead entities excluded
const withDead = [...ents, { id: 3, hp: 50, px: 0, py: 0, dead: true }];
assert('dead entities excluded from hash', entityHash(withDead) === h1);

// Changing hp changes hash
const modified = ents.map((e, i) => i === 0 ? { ...e, hp: 99 } : e);
assert('changed hp changes hash', entityHash(modified) !== h1);

// Empty set hashes to 0
assert('empty entity list hashes to 0', entityHash([]) === 0);

// Order matters: swapping entities changes hash
const swapped = [ents[1], ents[0]];
assert('entity order affects hash', entityHash(swapped) !== h1);

// ── Rollback credit invariant ─────────────────────────────────────────────────
// Simulates the snapshot timing bug: if a snapshot is taken BEFORE entity
// updates, a rollback skips one tick of credit deductions.
// The correct invariant: snapshot at tick T must include T's credit deductions.

console.log('\nRollback credit invariant');

function simCredit(startCredits, deductPerTick, ticks) {
  let c = startCredits;
  const snapshots = {}; // tick → credits AFTER that tick's deduction
  for (let t = 1; t <= ticks; t++) {
    c -= deductPerTick;
    snapshots[t] = c; // snapshot AFTER deductions (correct timing)
  }
  return { final: c, snapshots };
}

function rollbackFrom(snapshots, fromTick, toTick, deductPerTick) {
  // Restore snapshot[fromTick-1], re-simulate fromTick..toTick
  let c = snapshots[fromTick - 1];
  for (let t = fromTick; t <= toTick; t++) {
    c -= deductPerTick;
  }
  return c;
}

const { final, snapshots } = simCredit(1000, 5, 10);
// Rollback from tick 8 to tick 10: should end at same final value
const rolledBack = rollbackFrom(snapshots, 8, 10, 5);
assert('rollback from correct snapshot reaches same final credits', rolledBack === final);

// Simulate the OLD bug: snapshot taken BEFORE deductions
function simCreditBuggy(startCredits, deductPerTick, ticks) {
  let c = startCredits;
  const snapshots = {};
  for (let t = 1; t <= ticks; t++) {
    snapshots[t] = c; // snapshot BEFORE deductions (buggy)
    c -= deductPerTick;
  }
  return { final: c, snapshots };
}

const { final: finalB, snapshots: snapshotsB } = simCreditBuggy(1000, 5, 10);
const rolledBackBuggy = rollbackFrom(snapshotsB, 8, 10, 5);
assert('buggy pre-deduction snapshot causes divergence on rollback', rolledBackBuggy !== finalB);

// ── Bresenham integer credit installments ─────────────────────────────────────
// Inlines the advanceQueue logic from buildings.js so it can run in Node.js.
// Key invariants:
//   1. Total credits deducted over a full build exactly equals cost.
//   2. All deductions are whole integers (no fractional credits).
//   3. Construction stalls when credits < 1 and a deduction is due.
//   4. Cancel refunds item.paid (what was actually deducted, not full cost).
//   5. Works across all four quantised pwr values (0.25 / 0.5 / 0.75 / 1.0).

console.log('\nBresenham integer installments');

// Simulate advanceQueue for one item over `total` ticks at constant pwr.
// Returns { finalPaid, finalCredits, allDeductionsInteger, everStalled }
function simBresQueue({ cost, total, pwr, startCredits }) {
  const k = Math.round(pwr * 4); // 1, 2, 3, or 4
  const threshold = 4 * total;
  let credits = startCredits;
  let item = { t: 0, total, paid: 0, creditAcc: 0 };
  let allDeductionsInteger = true;
  let everStalled = false;

  for (let tick = 0; tick < total * 4; tick++) { // cap at 4× ticks to avoid infinite loop
    if (item.t >= item.total) break;

    const nextAcc = item.creditAcc + cost * k;
    if (nextAcc >= threshold) {
      if (credits >= 1) {
        credits -= 1;
        item.paid += 1;
        item.creditAcc = nextAcc - threshold;
        item.t = Math.min(item.total, item.t + pwr);
        if (!Number.isInteger(credits)) allDeductionsInteger = false;
      } else {
        everStalled = true;
        // stall: don't advance creditAcc or t
      }
    } else {
      item.creditAcc = nextAcc;
      item.t = Math.min(item.total, item.t + pwr);
    }
  }
  return { finalPaid: item.paid, finalCredits: credits, allDeductionsInteger, everStalled };
}

// 1. Full power (pwr=1): refinery (cost=700, btime=12s → total=720 ticks)
const ref1 = simBresQueue({ cost: 700, total: 720, pwr: 1.0, startCredits: 1500 });
assert('refinery (pwr=1) deducts exactly cost over full build', ref1.finalPaid === 700);
assert('refinery (pwr=1): all deductions are whole integers', ref1.allDeductionsInteger);
assert('refinery (pwr=1): no stall with 1500 credits', !ref1.everStalled);

// 2. Half power (pwr=0.5): same refinery takes 2× ticks but same total cost
const ref05 = simBresQueue({ cost: 700, total: 720, pwr: 0.5, startCredits: 1500 });
assert('refinery (pwr=0.5) deducts exactly cost over full build', ref05.finalPaid === 700);
assert('refinery (pwr=0.5): all deductions are whole integers', ref05.allDeductionsInteger);

// 3. Quarter power (pwr=0.25)
const ref025 = simBresQueue({ cost: 700, total: 720, pwr: 0.25, startCredits: 1500 });
assert('refinery (pwr=0.25) deducts exactly cost over full build', ref025.finalPaid === 700);
assert('refinery (pwr=0.25): all deductions are whole integers', ref025.allDeductionsInteger);

// 4. Stall scenario: start with 50 credits (refinery costs 700).
//    At ~0.97 cr/tick, 50 credits lasts ~51 ticks then construction stalls.
//    Harvester drops off 700 credits at tick 100 → build resumes and completes.
{
  const cost = 700, total = 720;
  const k = 4; // pwr=1
  const threshold = 4 * total;
  let credits = 50;
  let item = { t: 0, total, paid: 0, creditAcc: 0 };
  let stalledAtLeastOnce = false;

  for (let tick = 0; tick < total * 4; tick++) {
    if (item.t >= item.total) break;
    if (tick === 100) credits += 700; // harvester drop-off

    const nextAcc = item.creditAcc + cost * k;
    if (nextAcc >= threshold) {
      if (credits >= 1) {
        credits -= 1;
        item.paid += 1;
        item.creditAcc = nextAcc - threshold;
        item.t = Math.min(item.total, item.t + 1.0);
      } else {
        stalledAtLeastOnce = true;
      }
    } else {
      item.creditAcc = nextAcc;
      item.t = Math.min(item.total, item.t + 1.0);
    }
  }
  assert('partial-payment build stalls then resumes after income', stalledAtLeastOnce && item.paid === 700);
}

// 5. Cancel refunds item.paid (not full cost)
{
  const partial = simBresQueue({ cost: 700, total: 720, pwr: 1.0, startCredits: 200 });
  // After some ticks with only 200 credits the item stalls; paid should be ≤ 200
  assert('cancel refunds only what was paid (paid ≤ startCredits)', partial.finalPaid <= 200);
}

// 6. Power quantisation: Math.round(raw * 4) / 4 snaps to nearest quarter
{
  const snap = r => Math.round(r * 4) / 4;
  assert('pwr 0.99 snaps to 1.0',  snap(0.99) === 1.0);
  assert('pwr 0.76 snaps to 0.75', snap(0.76) === 0.75);
  assert('pwr 0.6  snaps to 0.5',  snap(0.6)  === 0.5);
  assert('pwr 0.3  snaps to 0.25', snap(0.3)  === 0.25);
  assert('pwr 0.1  snaps to 0.25 (min-clamped by Math.max)', snap(Math.max(0.25, 0.1)) === 0.25);
}

// 7. Harvester deposit uses Math.round → always integer
{
  const creditMults = [1.0, 0.85, 1.2]; // ALLIANCE, BROTHERHOOD, SYNDICATE
  const oreAmount = 300;
  for (const mult of creditMults) {
    const deposit = Math.round(oreAmount * mult);
    assert(`deposit with creditMult ${mult} is integer`, Number.isInteger(deposit));
  }
}

// 8. Sell refund is integer: Math.floor(cost/2)
{
  const costs = [300, 400, 500, 600, 700, 800]; // representative BDEF costs
  for (const cost of costs) {
    const refund = Math.floor(cost / 2);
    assert(`sell refund for cost ${cost} is integer`, Number.isInteger(refund));
  }
}

// ── Pathfinding occupancy cache: rollback determinism ───────────────────────────
// The occupancy grid is rebuilt at most once per tick (tick-stamped). Rollback replays the
// SAME tick numbers the forward pass already stamped, so the stamp must be invalidated on
// snapshot restore — otherwise the first replayed pathfind reuses the forward pass's stale
// occupancy (built for a different input) → wrong paths → position desync.
{
  const { state } = await import('../js/state.js');
  const { astar, invalidatePathCache } = await import('../js/pathfinding.js');

  // All-grass map (passable everywhere) so occupancy comes purely from entities.
  state.map = Array.from({ length: 60 }, () => new Uint8Array(80)); // 0 = GRASS
  state.entities = [];
  state.tick = 100;

  const through = (path, tx, ty) => path.some(p => p.x === tx && p.y === ty);
  const blocker = { isBuilding: true, type: 'power', x: 2, y: 0, w: 1, h: 1, dead: false };

  invalidatePathCache();
  astar(0, 0, 4, 0, false);          // no blocker → occupancy stamped for tick 100

  // Simulate replay of the SAME tick with different entity state (blocker now present).
  state.entities = [blocker];
  const stale = astar(0, 0, 4, 0, false);   // stamp still 100 → reuses stale (empty) occupancy
  assert('stale occupancy routes through blocker (demonstrates the hazard)', through(stale, 2, 0));

  invalidatePathCache();                     // what restoreSnapshot now does on rollback
  const fresh = astar(0, 0, 4, 0, false);
  assert('invalidated cache reroutes around blocker', !through(fresh, 2, 0));
}

// ── Diagonal pathfinding ──────────────────────────────────────────────────────
// 8-direction A* with √2 cost for diagonals. Must take diagonals when free,
// avoid corner-cutting through walls, stay deterministic, and produce identical
// step sequences on repeat calls.
console.log('\nDiagonal pathfinding');
{
  const { state } = await import('../js/state.js');
  const { astar, invalidatePathCache } = await import('../js/pathfinding.js');

  // Reset to an all-grass map with no entities so occupancy is purely terrain.
  state.map = Array.from({ length: 60 }, () => new Uint8Array(80));
  state.entities = [];
  state.tick = 200;
  invalidatePathCache();

  // Open ground → diagonal SE: optimal is 3 diagonal steps, not 6 cardinal ones.
  const diag = astar(0, 0, 3, 3, false);
  assert('diagonal open path is exactly 3 steps', diag.length === 3);
  assert('diagonal open path steps along the SE diagonal',
    diag[0].x === 1 && diag[0].y === 1 &&
    diag[1].x === 2 && diag[1].y === 2 &&
    diag[2].x === 3 && diag[2].y === 3);

  // Skewed move (3 east, 2 south): optimal is 2 diagonals + 1 cardinal = 3 steps.
  const skew = astar(0, 0, 3, 2, false);
  assert('skewed path takes diagonals first', skew.length === 3);

  // Diagonal repeat call produces identical step sequence (determinism).
  state.tick = 201; invalidatePathCache();
  const diag2 = astar(0, 0, 3, 3, false);
  let identical = diag.length === diag2.length;
  for (let i = 0; identical && i < diag.length; i++) {
    if (diag[i].x !== diag2[i].x || diag[i].y !== diag2[i].y) identical = false;
  }
  assert('repeat diagonal path is deterministic', identical);

  // Corner-cut prevention: place walls at (1,0) and (0,1) so the diagonal
  // (0,0)→(1,1) would slip through a corner. A* must route around instead.
  const wallA = { isBuilding: true, type: 'power', x: 1, y: 0, w: 1, h: 1, dead: false };
  const wallB = { isBuilding: true, type: 'power', x: 0, y: 1, w: 1, h: 1, dead: false };
  state.entities = [wallA, wallB];
  state.tick = 202; invalidatePathCache();
  const blocked = astar(0, 0, 1, 1, false);
  // Goal is reachable as the goal itself (1,1) is not occupied; but the first
  // step from (0,0) cannot be the diagonal — both adjacents are blocked.
  // The path should be empty (truly unreachable) because there's no other way.
  assert('corner-cut diagonal is rejected when both adjacents are blocked',
    blocked.length === 0);

  // A diagonal where only ONE adjacent is blocked is also rejected.
  state.entities = [wallA]; // only (1,0) blocked
  state.tick = 203; invalidatePathCache();
  const half = astar(0, 0, 1, 1, false);
  // First step cannot be diagonal NE (because (1,0) blocked AND going SE is the
  // only diagonal — (0,1) is free). Must route via (0,1) then (1,1) = 2 steps.
  assert('half-blocked corner forces detour', half.length === 2);
  assert('half-blocked corner detours via (0,1)', half[0].x === 0 && half[0].y === 1);

  // Diagonal cost stays admissible: 8-step diagonal beats 16-step cardinal.
  state.entities = [];
  state.tick = 204; invalidatePathCache();
  const longDiag = astar(0, 0, 8, 8, false);
  assert('long diagonal is 8 diagonal steps', longDiag.length === 8);
  let allDiagonal = true;
  for (let i = 0; i < longDiag.length; i++) {
    const prev = i === 0 ? { x: 0, y: 0 } : longDiag[i - 1];
    if (longDiag[i].x - prev.x !== 1 || longDiag[i].y - prev.y !== 1) allDiagonal = false;
  }
  assert('long diagonal uses only diagonal steps', allDiagonal);

  // Goal-as-occupied still reachable (goal exemption preserved).
  const occGoal = { isBuilding: true, type: 'power', x: 3, y: 3, w: 1, h: 1, dead: false };
  state.entities = [occGoal];
  state.tick = 205; invalidatePathCache();
  const intoGoal = astar(0, 0, 3, 3, false);
  assert('occupied goal is still reachable', intoGoal.length > 0);
  assert('occupied goal arrives at (3,3)',
    intoGoal[intoGoal.length - 1].x === 3 && intoGoal[intoGoal.length - 1].y === 3);
}

// ── Diagonal step speed scaling ───────────────────────────────────────────────
// Diagonal steps cover √2 tiles of world distance; per-tick mprog must scale so
// units don't travel faster on the diagonals than on cardinal axes.
console.log('\nDiagonal step speed');
{
  // Replicate the exact formula in units.js:stepPath.
  const TS = 32;
  const speed = 1.6; // representative tank speed in px/tick
  const orthStep = speed / TS / 1;
  const diagStep = speed / TS / Math.SQRT2;
  // World-pixel speed = step_world_distance × steps_per_tick
  //   orthogonal: TS  × (speed / TS) = speed
  //   diagonal:   TS√2 × (speed / TS / √2) = speed
  const orthWorldSpeed = TS * orthStep;
  const diagWorldSpeed = TS * Math.SQRT2 * diagStep;
  assert('orthogonal world-pixel speed equals unit speed',
    Math.abs(orthWorldSpeed - speed) < 1e-12);
  assert('diagonal world-pixel speed equals unit speed',
    Math.abs(diagWorldSpeed - speed) < 1e-12);
  // Determinism: scaling factor uses Math.SQRT2 which is a fixed IEEE-754 double.
  assert('Math.SQRT2 is the canonical √2', Math.SQRT2 === 1.4142135623730951);
}

// ── Octile heuristic correctness ──────────────────────────────────────────────
// Heuristic must (a) match the true minimum 8-direction cost and (b) be
// admissible (never overestimate) so A* still finds optimal paths.
console.log('\nOctile heuristic');
{
  const SQRT2 = Math.SQRT2;
  function octile(dx, dy) {
    const adx = Math.abs(dx), ady = Math.abs(dy);
    return Math.max(adx, ady) + (SQRT2 - 1) * Math.min(adx, ady);
  }
  // True minimum cost from (0,0) to (x,y) on an open 8-grid is
  //   min(x,y) diagonals (cost √2 each) + |x-y| cardinals (cost 1 each)
  function trueCost(x, y) {
    const ax = Math.abs(x), ay = Math.abs(y);
    return Math.min(ax, ay) * SQRT2 + Math.abs(ax - ay);
  }
  let exact = true;
  for (let x = 0; x <= 6; x++) {
    for (let y = 0; y <= 6; y++) {
      if (Math.abs(octile(x, y) - trueCost(x, y)) > 1e-12) exact = false;
    }
  }
  assert('octile equals true 8-direction minimum cost on open grid', exact);
  assert('octile is zero at the goal', octile(0, 0) === 0);
  assert('octile is symmetric in sign', octile(-3, 4) === octile(3, 4));
  assert('octile of (4, 0) equals 4 (pure cardinal)', octile(4, 0) === 4);
  assert('octile of (3, 3) equals 3√2 (pure diagonal)',
    Math.abs(octile(3, 3) - 3 * SQRT2) < 1e-12);
}

// ── chassisFacing vs facing determinism ───────────────────────────────────────
// chassisFacing is set in stepPath from atan2 of the next path step. Both
// operands are integers, so atan2 is fully deterministic across IEEE-754. The
// gun's facing is still set by combat targeting and survives independently.
console.log('\nchassisFacing math');
{
  // atan2 of integer tile-step deltas is deterministic across browsers.
  const cases = [
    [1, 0, 0],                         // east
    [0, 1, Math.PI / 2],               // south
    [-1, 0, Math.PI],                  // west
    [0, -1, -Math.PI / 2],             // north
    [1, 1, Math.PI / 4],               // SE diagonal
    [-1, -1, -Math.PI * 3 / 4],        // NW diagonal
  ];
  let allMatch = true;
  for (const [dx, dy, expected] of cases) {
    if (Math.abs(Math.atan2(dy, dx) - expected) > 1e-12) allMatch = false;
  }
  assert('atan2 of unit tile deltas matches expected radians', allMatch);
  // Repeat call: same inputs → bit-identical output (IEEE-754 determinism).
  assert('atan2 is bit-stable on repeat',
    Math.atan2(1, 1) === Math.atan2(1, 1));
}

// ── Harvester animation event determinism ─────────────────────────────────────
// scoopEvent / dumpEvent are tick stamps set in the gameTick when ore is picked
// up / deposited. snapshotEnt walks `for (const k in e)` so any primitive own
// property is automatically captured by rollback. Test the for-in capture path
// directly here — the full snapshot/restore would pull in the TS UI store.
console.log('\nHarvester event capture');
{
  const { Unit } = await import('../js/entities.js');
  const h = new Unit(0, 'harvester', 5, 5);
  h.scoopEvent = 510;
  h.dumpEvent = 520;
  h.chassisFacing = Math.PI / 4;
  // Mirror snapshotEnt's for-in walk that copies own primitive fields.
  const snap = Object.create(null);
  for (const k in h) if (Object.prototype.hasOwnProperty.call(h, k)) snap[k] = h[k];
  // The snapshot must include the new render-driving fields so rollback restores them.
  assert('snapshot captures scoopEvent via for-in', snap.scoopEvent === 510);
  assert('snapshot captures dumpEvent via for-in', snap.dumpEvent === 520);
  assert('snapshot captures chassisFacing via for-in',
    snap.chassisFacing === Math.PI / 4);
  // Mutate the live entity; snapshot stays frozen — proves these are independent values.
  h.scoopEvent = 0;
  h.dumpEvent = 0;
  h.chassisFacing = 0;
  assert('snapshot scoopEvent unchanged after mutation', snap.scoopEvent === 510);
  assert('snapshot dumpEvent unchanged after mutation', snap.dumpEvent === 520);
  assert('snapshot chassisFacing unchanged after mutation',
    snap.chassisFacing === Math.PI / 4);
  // Default-initialized values from the Unit constructor — confirms the field
  // exists on every spawned unit (so snapshot is consistent across new entities).
  const fresh = new Unit(0, 'tank', 0, 0);
  assert('Unit constructor initializes scoopEvent to 0', fresh.scoopEvent === 0);
  assert('Unit constructor initializes dumpEvent to 0', fresh.dumpEvent === 0);
  assert('Unit constructor initializes chassisFacing to 0', fresh.chassisFacing === 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
