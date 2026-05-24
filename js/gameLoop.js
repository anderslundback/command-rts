import { TS, FDATA, BDEF, UDEF } from './constants.js';
import { state } from './state.js';
import { removeDeadEnts } from './entities.js';
import { updateUnit } from './units.js';
import { updateBuilding, updateSidebarQueues } from './buildings.js';
import { updateParticles } from './particles.js';
import { updateShells } from './shells.js';
import { tickOreRegen } from './map.js';
import { updateFog } from './fog.js';
import { render, renderMinimap } from './renderer.js';
import { setMsg } from './hud.js';
import { speak } from './audio.js';
import { syncFromGameState } from './store.js';
import { net } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { storeTickSnapshot, entityHash } from './lockstep.js';

export const TICK_MS_TABLE = [125, 83, 50, 33, 25];
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
    const tickMs = TICK_MS_TABLE[state.gameSpeed ?? 2];
    const dt = _lastLoopTime > 0 ? Math.min(now - _lastLoopTime, 200) : 0;
    _accumulator += dt;
    while (_accumulator >= tickMs) {
      if (_shouldStall()) break;
      gameTick();
      _accumulator -= tickMs;
    }
  }
  _lastLoopTime = now;

  updateParticles();
  let _di = state.damageNumbers.length;
  while (_di--) { const d = state.damageNumbers[_di]; d.age++; d.y -= 0.4; if (d.age >= 50) state.damageNumbers.splice(_di, 1); }
  if (state.gameStarted) syncFromGameState();

  const tickMsAlpha = TICK_MS_TABLE[state.gameSpeed ?? 2];
  const alpha = state.gameStarted ? _accumulator / tickMsAlpha : 0;
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
      if (rb._stallStart == null) rb._stallStart = now;
      if (now - rb._stallStart < 200) return true; // stall up to 200ms wall-clock
      rb._stallStart = null; // timeout — accept misprediction, let rollback handle it
      return false;
    }
  }
  rb._stallStart = null;
  return false;
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
      for (const cmd of Object.values(inputs)) {
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
    storeTickSnapshot();
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
    if (state.underAttackTimer > 0) {
      state.underAttackTimer--;
      if (state.underAttackTimer === 299 && !state.isRollingBack) setMsg('Base under attack!', 180);
    }
  }

  if (state.rollback && !state.isRollingBack && state.tick % 20 === 0) {
    net.send({ type: 'state_hash', tick: state.tick, hash: entityHash(state.entities) });
  }
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

  const aliveCount = alive.filter(Boolean).length;
  if (aliveCount > 1) return;

  state.gameOver = true;
  state.gameOverDelay = 210;
  state.gameStats.endTick = state.tick;
  recordPower();
  state.gameStats.powerHistory = [...state.gameStats.powerHistory];
  speak(alive[state.playerFaction] ? 'Mission accomplished. Victory!' : 'Mission failed.');
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
