import { T } from './constants.js';
import { makeLCG } from './rng.js';
import { state } from './state.js';
import { genMap, genMapFromSeed, startPositions } from './map.js';
import { resetEid, Building, Unit } from './entities.js';
import { calcPower } from './resources.js';
import { placeBuilding, spawnUnit, spawnNear } from './placement.js';
import { orderHarvest } from './orders.js';
import { makeAI } from './ai.js';
import { setMsg } from './hud.js';
import { speak } from './audio.js';
import { clampCam } from './input.js';
import { syncFromGameState } from './store.js';
import { net, registerGameCallbacks } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { onRemoteInput, saveSnapshot, applyStateDump } from './lockstep.js';
import { initFog, updateFog } from './fog.js';
import { loop, _gameTick, recordPower, resetAccumulator } from './gameLoop.js';

export { TICK_MS_TABLE } from './gameLoop.js';

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
  resetAccumulator();
  loop();
}

// ── Multiplayer host/client entry ────────────────────────────────────────────

export function startNetGame(mapSeed, mySlot, myFaction, aiSlots, slotFactions) {
  state.rng = makeLCG(mapSeed);
  // 64-tick buffer covers ~3.2s at NORMAL speed (50ms/tick), enough for >200ms RTT at all speeds
  const humanSlots = new Set();
  for (let slot = 0; slot < slotFactions.length; slot++) {
    if (slot !== mySlot && slotFactions[slot] != null && !aiSlots[slot]) humanSlots.add(slot);
  }
  state.rollback = { buffer: new Array(256).fill(null), inputHistory: {}, predictions: {}, humanSlots, _stallStart: null };
  state.net = { myFaction, mySlot, slotFactions, mapSeed, aiSlots };
  state.syncDebug = { entityH: 0, creditsH: 0, rngH: 0, shellH: 0, tick: 0, resyncs: 0, lastDesyncTick: 0, diverged: [] };
  _resetGameState(myFaction, [1000, 2000, 2000]);

  genMapFromSeed(mapSeed);
  _populateOreHistory();
  state.AI = [null, null, null];
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

  net.on('input', msg => {
    if (msg.slot !== state.net.mySlot) {
      if (msg.cmd?.action === 'set_speed') {
        state.gameSpeed = Math.max(0, Math.min(4, msg.cmd.speed));
        resetAccumulator();
        syncFromGameState();
      }
      onRemoteInput(msg.tick, msg.slot, msg.cmd, applyCommand, _gameTick);
    }
  });

  _centerCamOn(mySlot);
  syncFromGameState();
  if (state.frameId) { cancelAnimationFrame(state.frameId); clearTimeout(state.frameId); }
  resetAccumulator();
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
  state.gameSpeed = clamped;
  resetAccumulator();
  syncFromGameState();
  if (state.net) {
    import('./net/netClient.js').then(m => m.scheduleInput({ action: 'set_speed', speed: clamped }));
  }
}

// ── Replay save/load ──────────────────────────────────────────────────────────

export function saveReplay() {
  if (!state.rollback || !state.net) return;
  const { mapSeed, slotFactions, aiSlots } = state.net;
  const compactInputs = {};
  for (const [tick, slots] of Object.entries(state.rollback.inputHistory)) {
    const nonNull = {};
    for (const [slot, cmd] of Object.entries(slots)) { if (cmd != null) nonNull[slot] = cmd; }
    if (Object.keys(nonNull).length) compactInputs[tick] = nonNull;
  }
  const data = { version: 1, endTick: state.tick, mapSeed, slotFactions, aiSlots, inputs: compactInputs };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `replay_${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
}

export function startReplay(data) {
  const { mapSeed, slotFactions, aiSlots, inputs, endTick } = data;
  const myFaction = slotFactions[0] ?? 0;
  const mySlot = 0;
  state.rng = makeLCG(mapSeed);
  state.rollback = { buffer: new Array(8).fill(null), inputHistory: {}, predictions: {} };
  for (const [tick, slots] of Object.entries(inputs)) {
    state.rollback.inputHistory[tick] = {};
    for (const [slot, cmd] of Object.entries(slots)) {
      state.rollback.inputHistory[tick][slot] = cmd;
    }
  }
  state.net = { myFaction, mySlot, slotFactions, mapSeed, aiSlots };
  state.replayMode = true;
  state._replayEndTick = endTick;
  _resetGameState(myFaction, [1000, 2000, 2000]);
  state.replayMode = true;
  state._replayEndTick = endTick;
  state.net = { myFaction, mySlot, slotFactions, mapSeed, aiSlots };
  genMapFromSeed(mapSeed);
  _populateOreHistory();
  state.AI = [null, null, null];
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
  _centerCamOn(mySlot);
  syncFromGameState();
  if (state.frameId) { cancelAnimationFrame(state.frameId); clearTimeout(state.frameId); }
  resetAccumulator();
  loop();
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
  state.controlGroups = [[], [], [], [], [], [], [], [], []];
  state.atkMoveMode = false;
  state.patrolMode = false;
  state.forceAtkMode = false;
  state.replayMode = false;
  state.damageNumbers = [];
  state.underAttackTimer = 0;
  state._replayEndTick = 0;
  state._lastGroupKey = -1;
  state._lastGroupTime = 0;
  resetEid();
}

function _populateOreHistory() {
  for (let ty = 0; ty < 60; ty++)
    for (let tx = 0; tx < 80; tx++)
      if (state.map[ty][tx] === T.ORE) state.oreHistory.add(ty * 80 + tx);
}

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
  state.cam.x = px * 32 - state.canvas.width  / 2;
  state.cam.y = py * 32 - state.canvas.height / 2;
  clampCam();
}

// Register callbacks so netClient.js can reach game functions without circular imports
registerGameCallbacks({
  startNetGame,
  showMenu: () => showMenu(),
  scheduleInput: (cmd) => {
    if (!state.rollback) return;
    if (state.replayMode) return;
    const nextTick = state.tick + 1;
    state.rollback.inputHistory[nextTick] ??= {};
    state.rollback.inputHistory[nextTick][state.net.mySlot] = cmd;
    net.send({ type: 'input', tick: nextTick, slot: state.net.mySlot, cmd });
  },
  onPlayerLeft: (msg) => {
    // Stop waiting for this slot's inputs — it now runs as local AI
    state.rollback?.humanSlots?.delete(msg.slot);
    setMsg(`${msg.name} has left the game`, 300);
    const faction = state.net?.slotFactions?.[msg.slot];
    if (faction != null && !state.AI[faction]) state.AI[faction] = makeAI(faction);
  },
  handleResyncRequest: (sourceSlot) => {
    if (state.net?.mySlot !== sourceSlot) return;
    const snap = saveSnapshot();
    net.send({ type: 'state_dump', tick: snap.tick, snap });
  },
  handleStateDump: (snap) => {
    if (state.net?.mySlot === 0) return; // host is the source, doesn't apply its own dump
    applyStateDump(snap);
  },
});
