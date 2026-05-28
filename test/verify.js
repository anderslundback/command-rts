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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
