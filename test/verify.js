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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
