// Mulberry32 — fast, deterministic PRNG with restorable state.
// All game-logic randomness must use state.rng() so rollback can replay correctly.
export function makeLCG(seed) {
  let s = seed >>> 0;
  const fn = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  fn.getState = () => s;
  fn.setState = v => { s = v >>> 0; };
  return fn;
}
