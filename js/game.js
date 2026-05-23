import { TS, HUD_H, SIDEBAR_W, FDATA, FBONUSES, T, BDEF, UDEF } from './constants.js';
import { makeLCG } from './rng.js';
import { state } from './state.js';
import { genMap, genMapFromSeed, tickOreRegen, startPositions } from './map.js';
import { resetEid, removeDeadEnts, Building, Unit } from './entities.js';
import { calcPower, nearestRefinery } from './resources.js';
import { placeBuilding, spawnUnit, spawnNear, deployMcvInPlace } from './placement.js';
import { orderHarvest, orderMove, orderAttack, orderStop } from './orders.js';
import { updateUnit } from './units.js';
import { updateBuilding, updateSidebarQueues } from './buildings.js';
import { updateParticles } from './particles.js';
import { updateShells } from './shells.js';
import { initFog, updateFog } from './fog.js';
import { makeAI } from './ai.js';
import { render, renderMinimap } from './renderer.js';
import { setMsg } from './hud.js';
import { speak } from './audio.js';
import { clampCam } from './input.js';
import { syncFromGameState } from './store.js';
import { net, registerGameCallbacks } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { storeTickSnapshot, onRemoteInput, entityHash } from './lockstep.js';

// ── Skirmish (single-player vs AI) ───────────────────────────────────────────

export function startGame(pf) {
  state.net = null;
  state.rng = makeLCG((Math.random() * 0xffffffff) >>> 0);
  _resetGameState(pf, [1000, 2000, 2000]);

  genMap();
  _populateOreHistory();
  state.AI = [null, null, null];
  for (let i = 0; i < 3; i++) if (i !== pf) state.AI[i] = makeAI(i);
  _placeStartingEntities([0, 1, 2]);
  calcPower();
  initFog();
  updateFog();
  recordPower();
  _centerCamOn(pf);
  syncFromGameState();
  if (state.frameId) { cancelAnimationFrame(state.frameId); clearTimeout(state.frameId); }
  _accumulator = 0; _lastLoopTime = 0;
  loop();
}

// ── Multiplayer host/client entry ────────────────────────────────────────────

export function startNetGame(mapSeed, mySlot, myFaction, aiSlots, slotFactions) {
  state.rng = makeLCG(mapSeed);
  // Rollback buffer: 8 snapshots at 20Hz = 400ms of history
  state.rollback = { buffer: new Array(8).fill(null), inputHistory: {}, predictions: {} };
  state.net = { myFaction, mySlot, slotFactions };
  _resetGameState(myFaction, [1000, 2000, 2000]);

  genMapFromSeed(mapSeed);
  _populateOreHistory();
  state.AI = [null, null, null];
  // All players run the full simulation — AI is deterministic via state.rng
  for (let i = 0; i < 3; i++) {
    if (aiSlots[i] && slotFactions[i] != null) state.AI[slotFactions[i]] = makeAI(slotFactions[i]);
  }
  _placeStartingEntities(slotFactions);
  for (let f = 0; f < 3; f++) {
    if (!slotFactions.includes(f)) state.factionEliminated[f] = true;
  }
  calcPower();
  initFog();
  updateFog();
  recordPower();

  // Wire up rollback input handler
  net.on('input', msg => {
    if (msg.slot !== state.net.mySlot) {
      onRemoteInput(msg.tick, msg.slot, msg.cmd, applyCommand, _gameTick);
    }
  });

  _centerCamOn(mySlot);
  syncFromGameState();
  if (state.frameId) { cancelAnimationFrame(state.frameId); clearTimeout(state.frameId); }
  _accumulator = 0; _lastLoopTime = 0;
  loop();
}

// ── Shared lifecycle ──────────────────────────────────────────────────────────

export function showMenu() {
  state.net = null;
  state.gameStarted = false;
  state.gameOver = false;
  state.paused = false;
  syncFromGameState();
}

export function togglePause() {
  if (!state.gameStarted || state.gameOver) return;
  state.paused = !state.paused;
  syncFromGameState();
}

export function setGameSpeed(index) {
  if (!state.gameStarted) return;
  const clamped = Math.max(0, Math.min(4, index));
  if (state.net) {
    // In multiplayer, route through the rollback input system so all players sync
    import('./net/netClient.js').then(m => m.scheduleInput({ action: 'set_speed', speed: clamped }));
  } else {
    state.gameSpeed = clamped;
    _accumulator = 0;
    syncFromGameState();
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

// ms per simulation tick per speed level: slowest→fastest
export const TICK_MS_TABLE = [125, 83, 50, 33, 25];
let _accumulator = 0;
let _lastLoopTime = 0;

function loop() {
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

  // Accumulator-based fixed-rate simulation (all players: skirmish + multiplayer).
  // Caps dt at 200ms to prevent spiral-of-death on tab focus restore.
  if (state.gameStarted) {
    const tickMs = TICK_MS_TABLE[state.gameSpeed ?? 2];
    const dt = _lastLoopTime > 0 ? Math.min(now - _lastLoopTime, 200) : 0;
    _accumulator += dt;
    while (_accumulator >= tickMs) {
      gameTick();
      _accumulator -= tickMs;
    }
  }
  _lastLoopTime = now;

  updateParticles();
  if (state.gameStarted) syncFromGameState();

  // Lerp unit positions between ticks for smooth 60fps rendering.
  const tickMsAlpha = TICK_MS_TABLE[state.gameSpeed ?? 2];
  const alpha = state.gameStarted ? _accumulator / tickMsAlpha : 0;
  _applyRenderAlpha(alpha);
  render();
  renderMinimap();
  _restoreRenderAlpha();

  // Use setTimeout when tab is hidden to prevent background-tab RAF throttling
  // from stalling the simulation (all players need consistent tick rate).
  if (state.net && document.hidden) {
    state.frameId = setTimeout(loop, 16);
  } else {
    state.frameId = requestAnimationFrame(loop);
  }
}

// Exposed so lockstep.js rollback can call it as simulateStepFn
export function _gameTick() { gameTick(); }

function gameTick() {
  state.tick++;

  // Snapshot unit positions before simulation for sub-tick render interpolation.
  for (const e of state.entities) {
    if (e.isUnit) { e.prevPx = e.px; e.prevPy = e.py; }
  }

  // Apply all inputs scheduled for this tick (local and remote via rollback system).
  if (state.rollback) {
    const inputs = state.rollback.inputHistory[state.tick];
    if (inputs) {
      for (const cmd of Object.values(inputs)) {
        if (cmd) applyCommand(cmd);
      }
    }
    // Mark untouched remote slots as predicted-null so rollback can detect mispredictions.
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
  }

  // Periodic desync detection in multiplayer
  if (state.rollback && !state.isRollingBack && state.tick % 20 === 0) {
    net.send({ type: 'state_hash', tick: state.tick, hash: entityHash(state.entities) });
  }
}

// Temporarily move unit positions to the sub-tick interpolated position for rendering.
// Restores after render so game logic always sees authoritative positions.
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

// ── Internal helpers ──────────────────────────────────────────────────────────

function _resetGameState(playerFaction, startCredits) {
  state.playerFaction = playerFaction;
  state.entities = [];
  state.entById = new Map();
  state.particles = [];
  state.shells = [];
  state.moveIndicators = [];
  state.tick = 0;
  state.selected = [];
  state.buildMode = null;
  state.repairMode = false;
  state.sellMode = false;
  state.hudBuildQueue = [[], [], []];
  state.hudDefQueue = [[], [], []];
  state.buildReady = false;
  state.primaryBuilding = {};
  state.factionEliminated = [false, false, false];
  state.gameOverDelay = 0;
  state.gameStats = { unitsLost: 0, enemiesKilled: 0, startTick: 0, endTick: 0, powerHistory: [] };
  state.paused = false;
  state.gameSpeed = 2;
  state.credits   = [...startCredits];
  state.powerUsed = [0, 0, 0];
  state.powerGen  = [0, 0, 0];
  state.gameOver = false;
  state.gameStarted = true;
  state.statusMsg = '';
  state.statusTimer = 0;
  state.minimapDirty = true;
  state.oreHistory = new Set();
  state.fpsLastTime = 0;
  state.fpsSmooth = 60;
  resetEid();
}

function _populateOreHistory() {
  for (let ty = 0; ty < 60; ty++)
    for (let tx = 0; tx < 80; tx++)
      if (state.map[ty][tx] === T.ORE) state.oreHistory.add(ty * 80 + tx);
}

// slotFactions[slot] = faction index (or null for empty slots)
function _placeStartingEntities(slotFactions) {
  const starts = startPositions();
  for (let slot = 0; slot < 3; slot++) {
    const f = slotFactions[slot];
    if (f == null) continue;
    const [sx, sy] = starts[slot];
    placeBuilding(f, 'command',  sx,   sy,   true);
    placeBuilding(f, 'power',    sx+4, sy,   true);
    const ref = placeBuilding(f, 'refinery', sx, sy+4, true);
    if (ref) {
      const harv = spawnNear(f, 'harvester', ref);
      if (harv) orderHarvest(harv, ref);
    }
    for (let i = 0; i < 3; i++) spawnUnit(f, 'rifleman', sx + 7 + i, sy + i);
  }
}

function _centerCamOn(slot) {
  const [px, py] = startPositions()[slot];
  state.cam.x = px * TS - state.canvas.width  / 2;
  state.cam.y = py * TS - state.canvas.height / 2;
  clampCam();
}

function recordPower() {
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

// Register callbacks so netClient.js can reach game functions without circular imports
registerGameCallbacks({
  startNetGame,
  showMenu: () => showMenu(),
  scheduleInput: (cmd) => {
    if (!state.rollback) return;
    const nextTick = state.tick + 1;
    state.rollback.inputHistory[nextTick] ??= {};
    state.rollback.inputHistory[nextTick][state.net.mySlot] = cmd;
    net.send({ type: 'input', tick: nextTick, slot: state.net.mySlot, cmd });
  },
  onPlayerLeft: (msg) => {
    setMsg(`${msg.name} has left the game`, 300);
    // Hand the departed faction to AI so their units keep fighting
    const faction = state.net?.slotFactions?.[msg.slot];
    if (faction != null && !state.AI[faction]) state.AI[faction] = makeAI(faction);
  },
});
