import { TS, FDATA, BDEF, UDEF } from './constants.js';
import { state } from './state.js';
import { removeDeadEnts } from './entities.js';
import { updateUnit } from './units.js';
import { updateBuilding, updateSidebarQueues } from './buildings.js';
import { updateParticles } from './particles.js';
import { updateShells } from './shells.js';
import { tickOreRegen } from './map.js';
import { areAllied } from './resources.js';
import { updateFog } from './fog.js';
import { render, renderMinimap } from './renderer.js';
import { setMsg } from './hud.js';
import { speak } from './audio.js';
import { syncFromGameState } from './store.js';
import { net } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { storeTickSnapshot, entityHash, mapHash } from './lockstep.js';
import { rebuildGrid } from './spatial.js';

// Indices 0-4 are the standard in-game speeds.
// Indices 5-6 (2× and 4×) are replay-only — setGameSpeed enforces this.
export const TICK_MS_TABLE = [125, 83, 50, 33, 25, 12, 6];
let _accumulator = 0;
let _lastLoopTime = 0;

export function getAccumulator() { return _accumulator; }
export function resetAccumulator() { _accumulator = 0; _lastLoopTime = 0; }

export function loop() {
  const now = performance.now();
  if (state.fpsLastTime > 0) {
    state.fpsSmooth = state.fpsSmooth * 0.9 + (1000 / (now - state.fpsLastTime)) * 0.1;
  }
  state.fpsLastTime = now;

  if (state.paused) {
    render();
    renderMinimap();
    state.frameId = requestAnimationFrame(loop);
    return;
  }

  if (state.gameStarted) {
    _sendNullInput(); // prime the buffer every frame before stall check
    const tickMs = TICK_MS_TABLE[state.gameSpeed ?? 2];
    const dt = _lastLoopTime > 0 ? Math.min(now - _lastLoopTime, 200) : 0;
    _accumulator += dt;
    while (_accumulator >= tickMs) {
      if (_shouldStall()) break;
      gameTick();
      _accumulator -= tickMs;
      _sendNullInput();
    }
  }
  _lastLoopTime = now;

  updateParticles();
  const _dn = state.damageNumbers;
  for (let _di = _dn.length - 1; _di >= 0; _di--) {
    const d = _dn[_di]; d.age++; d.y -= 0.4;
    if (d.age >= 50) { _dn[_di] = _dn[_dn.length - 1]; _dn.pop(); }
  }
  if (state.gameStarted && state._dirty) { syncFromGameState(); state._dirty = false; }

  const tickMsAlpha = TICK_MS_TABLE[state.gameSpeed ?? 2];
  const alpha = state.gameStarted ? Math.min(1, _accumulator / tickMsAlpha) : 0;
  _applyRenderAlpha(alpha);
  render();
  renderMinimap();
  _restoreRenderAlpha();

  if (state.net && document.hidden) {
    state.frameId = setTimeout(loop, 16);
  } else {
    state.frameId = requestAnimationFrame(loop);
  }
}

export function _gameTick() { gameTick(); }

// Hold the simulation if we haven't yet received a human remote player's input for the
// next tick. This avoids the misprediction → rollback cycle for normal-latency connections.
// Give up after 200ms so a lagging/disconnecting player doesn't freeze the game.
function _sendNullInput() {
  if (!state.rollback || state.isRollingBack || !state.net) return;
  const mySlot = state.net.mySlot;
  const ih = state.rollback.inputHistory;
  // Send 6 ticks ahead so the other side always has a buffer
  for (let i = 1; i <= 6; i++) {
    const t = state.tick + i;
    ih[t] ??= {};
    if (!(mySlot in ih[t])) {
      ih[t][mySlot] = null;
      net.send({ type: 'input', tick: t, slot: mySlot, cmd: null });
      if (state.syncDebug) state.syncDebug.nullsSent = (state.syncDebug.nullsSent ?? 0) + 1;
    }
  }
}

const WARN_PREFIXES = ['STALL', 'TIMEOUT', 'DESYNC'];

function _netLog(msg, important = false) {
  if (!state.syncDebug) return;
  const entry = `t${state.tick} ${msg}`;
  state.syncDebug.log.push(entry);
  if (state.syncDebug.log.length > 8) state.syncDebug.log.shift();
  if (important || WARN_PREFIXES.some(p => msg.startsWith(p))) {
    state.syncDebug.hasWarning = true;
  }
}

function _shouldStall() {
  const rb = state.rollback;
  if (!rb || state.replayMode || !state.net) return false;
  const humanSlots = rb.humanSlots;
  if (!humanSlots?.size) return false;
  const nextTick = state.tick + 1;
  const inputs = rb.inputHistory[nextTick];
  for (const slot of humanSlots) {
    if (!inputs || !(slot in inputs)) {
      const now = performance.now();
      if (rb._stallStart == null) {
        rb._stallStart = now;
        if (state.syncDebug) state.syncDebug.stallCount = (state.syncDebug.stallCount ?? 0) + 1;
        _netLog(`STALL#${state.syncDebug?.stallCount} waiting slot${slot} for t${nextTick}`);
      }
      const elapsed = now - rb._stallStart;
      const timeout = Math.max(200, (state.net?.latencyMs ?? 0) * 1.5);
      if (elapsed < timeout) {
        _updateNetDiag({ stalling: true, stallTick: nextTick, stallSlot: slot, stallMs: Math.round(elapsed) });
        return true;
      }
      _netLog(`TIMEOUT after ${Math.round(elapsed)}ms t${nextTick} — misprediction accepted`);
      rb._stallStart = null;
      return false;
    }
  }
  rb._stallStart = null;
  return false;
}

function _updateNetDiag(extra) {
  const rb = state.rollback;
  window.__netDiag = {
    tick: state.tick,
    stallCount: state.syncDebug?.stallCount ?? 0,
    nullsSent: state.syncDebug?.nullsSent ?? 0,
    humanSlots: rb ? [...(rb.humanSlots ?? [])] : [],
    inputHistoryAhead: rb ? (() => {
      let ahead = 0;
      for (let t = state.tick + 1; t <= state.tick + 10; t++) {
        if (rb.inputHistory[t] && [...(rb.humanSlots ?? [])].every(s => s in rb.inputHistory[t])) ahead++;
        else break;
      }
      return ahead;
    })() : 0,
    ...extra,
  };
}

function gameTick() {
  state.tick++;

  if (state.replayMode && state.tick >= state._replayEndTick) {
    state.paused = true;
    syncFromGameState();
    return;
  }

  for (const e of state.entities) {
    if (e.isUnit) { e.prevPx = e.px; e.prevPy = e.py; }
  }

  if (state.rollback) {
    const inputs = state.rollback.inputHistory[state.tick];
    if (inputs) {
      for (const k in inputs) {
        const cmd = inputs[k];
        if (cmd) applyCommand(cmd);
      }
    }
    const mySlot = state.net?.mySlot;
    if (mySlot != null) {
      state.rollback.inputHistory[state.tick] ??= {};
      for (const [slot] of (state.net?.slotFactions?.entries?.() ?? [])) {
        if (slot !== mySlot && !(slot in state.rollback.inputHistory[state.tick])) {
          state.rollback.inputHistory[state.tick][slot] = null;
        }
      }
    }
  }

  if (!state.gameOver) {
    for (let fi = 0; fi < 3; fi++) {
      if (!state.factionEliminated[fi]) {
        const hasBuildings = state.entities.some(e => !e.dead && e.isBuilding && e.faction === fi);
        if (!hasBuildings) {
          state.factionEliminated[fi] = true;
          if (!state.isRollingBack && fi !== state.playerFaction) {
            setMsg(FDATA[fi].name + ' eliminated!', 300);
            speak(FDATA[fi].name + ' eliminated');
          }
        }
      }
    }
    checkVictory();
  } else if (state.gameOverDelay > 0) {
    state.gameOverDelay--;
  }

  if (!state.gameOver) {
    // Rebuild per-tick derived caches in a single entity pass (NOT snapshotted — rebuilt each tick):
    //   _bldgCounts  — building-type counts for buildings.js trainQ speedMult
    //   factionCache — per-faction unit/building sublists, replacing repeated filter() scans in ai.js etc.
    // Lists are built in state.entities order so any order-dependent consumer stays deterministic.
    const bc = state._bldgCounts ?? (state._bldgCounts = new Map());
    bc.clear();
    const fcache = state.factionCache ?? (state.factionCache = [
      { units: [], buildings: [], doneBuildings: [] },
      { units: [], buildings: [], doneBuildings: [] },
      { units: [], buildings: [], doneBuildings: [] },
    ]);
    for (const fc of fcache) { fc.units.length = 0; fc.buildings.length = 0; fc.doneBuildings.length = 0; }
    for (const e of state.entities) {
      if (e.dead) continue;
      const fc = fcache[e.faction];
      if (e.isUnit) {
        if (fc) fc.units.push(e);
      } else if (e.isBuilding) {
        if (fc) fc.buildings.push(e);
        if (e.done) {
          if (fc) fc.doneBuildings.push(e);
          const k = `${e.faction}:${e.type}`;
          bc.set(k, (bc.get(k) ?? 0) + 1);
        }
      }
    }
    rebuildGrid();

    for (const e of state.entities) {
      if (e.dead) continue;
      if (e.isUnit)     updateUnit(e);
      if (e.isBuilding) updateBuilding(e);
    }
    removeDeadEnts();
    updateSidebarQueues();
    for (let i = 0; i < 3; i++) state.AI[i]?.update();
    updateShells();
    updateFog();
    if (state.tick % 300 === 1) recordPower();
    tickOreRegen();
    if (state.statusTimer > 0) state.statusTimer--;
    let i = state.moveIndicators.length;
    while (i--) { state.moveIndicators[i].t--; if (state.moveIndicators[i].t <= 0) state.moveIndicators.splice(i, 1); }
    if (state.underAttackTimer > 0) state.underAttackTimer--;
  }

  // The update block (incl. removeDeadEnts) is skipped once gameOver is set, but a
  // surrender marks entities dead on the very tick victory triggers — purge them here
  // so the spectated/final map is clean. Deterministic: every client runs this identically.
  if (state.gameOver) removeDeadEnts();

  if (state.rollback) storeTickSnapshot();

  if (state.rollback && !state.isRollingBack && state.tick % 20 === 0) {
    const entityH = entityHash(state.entities);
    const creditsH = (((state.credits[0] | 0) * 31337) ^ ((state.credits[1] | 0) * 62674) ^ ((state.credits[2] | 0) * 94011)) >>> 0;
    const rngH = state.rng.getState() >>> 0;
    const shellH = state.shells.length;
    const mapH = mapHash();
    const fullHash = entityHash(state.entities, state);
    // Per-faction entity counts (sent to server for granular desync detection)
    const entN = [0, 0, 0];
    // Per-faction entity hash (client debug panel only)
    const entH = [0, 0, 0];
    // Per-field sub-hashes — tell us WHICH field is diverging without needing the full log
    let hpH = 0, posH = 0, oreH = 0, bprogH = 0, facH = 0;
    for (const e of state.entities) {
      if (e.dead) continue;
      const f = e.faction;
      entN[f]++;
      entH[f] ^= (e.id * 73856093) ^ ((e.hp | 0) * 19349663) ^ (Math.round(e.px) * 83492791) ^ (Math.round(e.py) * 95452411) ^ (e.faction * 2654435761);
      if (e.ore) entH[f] ^= (e.ore * 4256233) >>> 0;
      entH[f] = ((entH[f] ^ (entH[f] >>> 13)) * 1540483477) >>> 0;
      // Sub-hashes (mixed separately so a single diverging field lights up exactly one)
      hpH  ^= ((e.id * 73856093) ^ ((e.hp | 0) * 19349663)) >>> 0;
      posH ^= ((e.id * 83492791) ^ (Math.round(e.px) * 95452411) ^ (Math.round(e.py) * 31337007)) >>> 0;
      if (e.ore) oreH ^= ((e.id * 4256233) ^ (e.ore * 6542927)) >>> 0;
      if (e.isBuilding) bprogH ^= ((e.id * 31337) ^ ((e.bprog * 10000 | 0) * 99991)) >>> 0;
      facH ^= ((e.id * 374761393) ^ (e.faction * 2654435761)) >>> 0;
    }
    hpH >>>= 0; posH >>>= 0; oreH >>>= 0; bprogH >>>= 0; facH >>>= 0;
    if (state.syncDebug) Object.assign(state.syncDebug, { entityH, creditsH, rngH, shellH, mapH, tick: state.tick, cred: [state.credits[0], state.credits[1], state.credits[2]], entN: [...entN], entH: [...entH], hpH, posH, oreH, bprogH, facH });
    window.__syncDebug = state.syncDebug ? { ...state.syncDebug } : null;
    net.send({ type: 'state_hash', tick: state.tick, hash: fullHash, debug: { entityH, creditsH, rngH, shellH, mapH, entN0: entN[0], entN1: entN[1], entN2: entN[2], hpH, posH, oreH, bprogH, facH } });
  }

  state._dirty = true;
}

export function recordPower() {
  const scores = [0, 0, 0];
  for (const e of state.entities) {
    if (e.dead) continue;
    const hpRatio = e.hp / e.maxHp;
    scores[e.faction] += hpRatio * ((e.isBuilding ? BDEF[e.type]?.cost : UDEF[e.type]?.cost) ?? 100);
  }
  for (let f = 0; f < 3; f++) scores[f] += state.credits[f] * 0.25;
  state.gameStats.powerHistory.push({ tick: state.tick, scores: [...scores] });
}

function checkVictory() {
  const alive = [false, false, false];
  for (const e of state.entities)
    if (!e.dead && e.isBuilding) alive[e.faction] = true;

  const aliveIds = [];
  for (let f = 0; f < 3; f++) if (alive[f]) aliveIds.push(f);
  if (aliveIds.length === 0) return; // shouldn't happen, but guard
  if (aliveIds.length > 1) {
    // Shared-victory path (StarCraft model): all surviving factions are
    // mutually allied AND each one has alliedVictory opted-in. AI factions
    // never opt in, so this only triggers when humans deliberately co-win.
    const allMutual = aliveIds.every(f => aliveIds.every(g => areAllied(f, g)));
    const allOptedIn = aliveIds.every(f => state.alliedVictory[f]);
    if (!(allMutual && allOptedIn)) return;
  }

  state.gameOver = true;
  state.gameOverDelay = 210;
  state.gameWinners = aliveIds;
  state.gameStats.endTick = state.tick;
  recordPower();
  state.gameStats.powerHistory = [...state.gameStats.powerHistory];
  const meWon = aliveIds.includes(state.playerFaction);
  if (meWon && aliveIds.length > 1) speak('Mission accomplished. Allied victory.');
  else if (meWon) speak('Mission accomplished. Victory!');
  else speak('Mission failed.');
}

function _applyRenderAlpha(alpha) {
  if (alpha <= 0) return;
  for (const e of state.entities) {
    if (!e.isUnit || e.prevPx === undefined) continue;
    e._renderPx = e.px; e._renderPy = e.py;
    e.px = e.prevPx + (e.px - e.prevPx) * alpha;
    e.py = e.prevPy + (e.py - e.prevPy) * alpha;
  }
}

function _restoreRenderAlpha() {
  for (const e of state.entities) {
    if (!e.isUnit || e._renderPx === undefined) continue;
    e.px = e._renderPx; e.py = e._renderPy;
    delete e._renderPx; delete e._renderPy;
  }
}
