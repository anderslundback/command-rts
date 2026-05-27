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
import { syncFromGameState, uiStore } from './store.js';
import { net, registerGameCallbacks } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { onRemoteInput, saveSnapshot, applyStateDump } from './lockstep.js';
import { initFog, updateFog } from './fog.js';
import { loop, _gameTick, recordPower, resetAccumulator } from './gameLoop.js';

export { TICK_MS_TABLE } from './gameLoop.js';

// Stored so we can remove and re-register it across multiple game sessions
let _netInputHandler = null;

// ── Skirmish (single-player vs AI) ───────────────────────────────────────────

export function startGame(pf, aiFactions = null, mapSeed = null) {
  const seed = mapSeed ?? ((Math.random() * 0xffffffff) >>> 0);
  state.net = null;
  state.syncDebug = null;
  state.mapSeed = seed;
  state.rng = makeLCG(seed);
  _resetGameState(pf, [1500, 1500, 1500]);

  genMapFromSeed(seed);
  _populateOreHistory();

  const opponents = aiFactions ?? [0, 1, 2].filter(f => f !== pf);
  const slotFactions = [null, null, null];
  slotFactions[pf] = pf;
  for (const f of opponents) slotFactions[f] = f;
  for (let f = 0; f < 3; f++) if (slotFactions[f] == null) state.factionEliminated[f] = true;

  state.AI = [null, null, null];
  for (const f of opponents) state.AI[f] = makeAI(f);
  _placeStartingEntities(slotFactions);
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

export function startNetGame(mapSeed, mySlot, myFaction, aiSlots, slotFactions, gameSpeed = 4) {
  state.rng = makeLCG(mapSeed);
  // 64-tick buffer covers ~3.2s at NORMAL speed (50ms/tick), enough for >200ms RTT at all speeds
  const humanSlots = new Set();
  for (let slot = 0; slot < slotFactions.length; slot++) {
    if (slot !== mySlot && slotFactions[slot] != null && !aiSlots[slot]) humanSlots.add(slot);
  }
  state.rollback = { buffer: new Array(64).fill(null), inputHistory: {}, predictions: {}, replayLog: {}, humanSlots, _stallStart: null };
  state.net = { myFaction, mySlot, slotFactions, mapSeed, aiSlots, pauseCredits: [3, 3, 3], pausedBySlot: -1 };
  state.mapSeed = mapSeed;
  state.syncDebug = { entityH: 0, creditsH: 0, rngH: 0, shellH: 0, mapH: 0, tick: 0, resyncs: 0, lastDesyncTick: 0, diverged: [], stallCount: 0, nullsSent: 0, log: [], hasWarning: false, cred: [0, 0, 0], entN: [0, 0, 0], entH: [0, 0, 0], hpH: 0, posH: 0, oreH: 0, bprogH: 0 };
  _resetGameState(myFaction, [1500, 1500, 1500]);
  state.gameSpeed = gameSpeed;

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

  if (_netInputHandler) net.off('input', _netInputHandler);
  _netInputHandler = msg => {
    if (msg.slot !== state.net.mySlot) {
      if (msg.cmd?.action === 'set_speed') {
        state.gameSpeed = Math.max(0, Math.min(4, msg.cmd.speed));
        resetAccumulator();
        syncFromGameState();
      }
      onRemoteInput(msg.tick, msg.slot, msg.cmd, applyCommand, _gameTick);
    }
  };
  net.on('input', _netInputHandler);

  _centerCamOn(mySlot);
  syncFromGameState();
  if (state.frameId) { cancelAnimationFrame(state.frameId); clearTimeout(state.frameId); }
  resetAccumulator();
  loop();
}

// ── Shared lifecycle ──────────────────────────────────────────────────────────

export function showMenu() {
  if (_netInputHandler) { net.off('input', _netInputHandler); _netInputHandler = null; }
  state.isRollingBack = false;
  state.net = null;
  state.syncDebug = null;
  state.rollback = null;
  state.gameStarted = false;
  state.gameOver = false;
  state.paused = false;
  state.menuOpen = false;
  state._dirty = false;
  uiStore.setState({ desync: false, netStall: false });
  syncFromGameState();
}

export function togglePause() {
  if (!state.gameStarted || state.gameOver || state.net) return;
  state.paused = !state.paused;
  syncFromGameState();
}

export function requestNetPause() {
  if (!state.net || !state.gameStarted || state.gameOver || state.paused) return;
  const slot = state.net.mySlot;
  if ((state.net.pauseCredits?.[slot] ?? 0) <= 0) return;
  import('./net/netClient.js').then(m => m.net.send({ type: 'net_pause', slot }));
}

export function requestNetResume() {
  if (!state.net || !state.paused) return;
  import('./net/netClient.js').then(m => m.net.send({ type: 'net_resume' }));
}

export function setGameSpeed(index) {
  if (!state.gameStarted) return;
  // Indices 5-6 (2× / 4×) are only available in replay mode
  const maxSpeed = state.replayMode ? 6 : 4;
  const clamped = Math.max(0, Math.min(maxSpeed, index));
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
  const data = { version: 1, endTick: state.tick, mapSeed, slotFactions, aiSlots, inputs: state.rollback.replayLog };
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
  _resetGameState(myFaction, [1500, 1500, 1500]);
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
  state.menuOpen = false;
  state._dirty = false;
  state.gameSpeed = 4;
  state.credits   = [...startCredits];
  state.powerUsed = [0, 0, 0];
  state.powerGen  = [0, 0, 0];
  state.gameOver = false;
  state.gameStarted = true;
  state.statusMsg = '';
  state.statusTimer = 0;
  state.minimapDirty = true;
  state.isRollingBack = false;
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
    state.rollback.replayLog[nextTick] ??= {};
    state.rollback.replayLog[nextTick][state.net.mySlot] = cmd;
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
    const snap = saveSnapshot(true); // JSON-safe: Array.from(row) for mapRows, array for oreHistory
    net.send({ type: 'state_dump', tick: snap.tick, snap });
  },
  handleStateDump: (snap) => {
    if (state.net?.mySlot === 0) return; // host is the source, doesn't apply its own dump
    applyStateDump(snap);
  },
});
