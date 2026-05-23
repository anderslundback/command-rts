import { state } from './state.js';
import { Building, Unit } from './entities.js';
import { net } from './net/netClient.js';
import { applyCommand } from './commands.js';

// ── Snapshot (save/restore full game state for rollback) ──────────────────────

export function saveSnapshot() {
  return {
    tick: state.tick,
    rngState: state.rng.getState(),
    entities: state.entities.map(snapshotEnt),
    credits: [...state.credits],
    powerUsed: [...state.powerUsed],
    powerGen: [...state.powerGen],
    hudBuildQueue: state.hudBuildQueue.map(q => q.map(it => ({ ...it }))),
    hudDefQueue:   state.hudDefQueue.map(q => q.map(it => ({ ...it }))),
    shells: state.shells.map(s => ({ ...s })),
    factionEliminated: [...state.factionEliminated],
    gameOver: state.gameOver,
    gameOverDelay: state.gameOverDelay,
    gameStats: { ...state.gameStats, powerHistory: [...state.gameStats.powerHistory] },
    oreHistory: new Set(state.oreHistory),
    statusMsg: state.statusMsg,
    statusTimer: state.statusTimer,
  };
}

function snapshotEnt(e) {
  return Object.assign({}, e, {
    _isBuilding: e.isBuilding,
    path: e.path ? [...e.path] : null,
    trainQ: e.trainQ ? e.trainQ.map(q => ({ ...q })) : null,
    harvestTile: e.harvestTile ? { ...e.harvestTile } : null,
    waypoint: e.waypoint ? { ...e.waypoint } : null,
  });
}

export function restoreSnapshot(snap) {
  state.rng.setState(snap.rngState);
  state.tick = snap.tick;
  state.entities = snap.entities.map(restoreEnt);
  state.entById = new Map(state.entities.map(e => [e.id, e]));
  state.credits = [...snap.credits];
  state.powerUsed = [...snap.powerUsed];
  state.powerGen = [...snap.powerGen];
  state.hudBuildQueue = snap.hudBuildQueue.map(q => q.map(it => ({ ...it })));
  state.hudDefQueue   = snap.hudDefQueue.map(q => q.map(it => ({ ...it })));
  state.shells = snap.shells.map(s => ({ ...s }));
  state.factionEliminated = [...snap.factionEliminated];
  state.gameOver = snap.gameOver;
  state.gameOverDelay = snap.gameOverDelay;
  state.gameStats = { ...snap.gameStats, powerHistory: [...snap.gameStats.powerHistory] };
  state.oreHistory = new Set(snap.oreHistory);
  state.statusMsg = snap.statusMsg;
  state.statusTimer = snap.statusTimer;
}

function restoreEnt(s) {
  const proto = s._isBuilding ? Building.prototype : Unit.prototype;
  const e = Object.create(proto);
  Object.assign(e, s);
  delete e._isBuilding;
  if (s.path) e.path = [...s.path];
  if (s.trainQ) e.trainQ = s.trainQ.map(q => ({ ...q }));
  return e;
}

// ── Input scheduling ──────────────────────────────────────────────────────────

export function scheduleInput(cmd) {
  if (!state.rollback) return; // skirmish — should not reach here
  const tick = state.tick;
  state.rollback.inputHistory[tick] ??= {};
  state.rollback.inputHistory[tick][state.net.mySlot] = cmd;
  net.send({ type: 'input', tick, slot: state.net.mySlot, cmd });
}

// Called when a remote input arrives. Triggers rollback if the prediction was wrong.
// simulateTickFn must be game.js's _gameTick (passed to avoid circular import).
export function onRemoteInput(tick, slot, cmd, _applyCmd, simulateTickFn) {
  if (!state.rollback) return;
  state.rollback.inputHistory[tick] ??= {};
  const predicted = state.rollback.inputHistory[tick][slot]; // null = predicted no-input; undefined = future tick
  state.rollback.inputHistory[tick][slot] = cmd ?? null;

  // Only rollback if the tick has already been simulated and the prediction was wrong
  const mispredicted = tick <= state.tick && JSON.stringify(predicted ?? null) !== JSON.stringify(cmd ?? null);

  if (mispredicted) {
    rollbackAndReplay(tick, state.tick, simulateTickFn);
  }
}

// ── Rollback ──────────────────────────────────────────────────────────────────

function rollbackAndReplay(fromTick, toTick, simulateTickFn) {
  const snapIdx = (fromTick - 1) % state.rollback.buffer.length;
  const snap = state.rollback.buffer[snapIdx];
  if (!snap || snap.tick !== fromTick - 1) return; // guard against buffer miss (too deep)

  state.isRollingBack = true;
  restoreSnapshot(snap);

  for (let t = fromTick; t <= toTick; t++) {
    const inputs = state.rollback.inputHistory[t] ?? {};
    for (const cmd of Object.values(inputs)) {
      if (cmd) applyCommand(cmd);
    }
    simulateTickFn(); // increments state.tick and stores snapshot internally
  }

  state.isRollingBack = false;
}

// Store snapshot after each tick. Called from gameTick() when rollback is active.
export function storeTickSnapshot() {
  if (!state.rollback) return;
  state.rollback.buffer[state.tick % state.rollback.buffer.length] = saveSnapshot();
}

// Record our null prediction for a remote slot's input this tick.
export function recordPrediction(tick, slot) {
  if (!state.rollback) return;
  state.rollback.predictions[tick] ??= {};
  state.rollback.predictions[tick][slot] = null; // predict: no input
}

// ── State hash for desync detection ──────────────────────────────────────────

export function entityHash(entities) {
  let h = 0;
  for (const e of entities) {
    if (e.dead) continue;
    h ^= (e.id * 73856093) ^ ((e.hp | 0) * 19349663) ^ (Math.round(e.px) * 83492791) ^ (Math.round(e.py) * 95452411);
    h = (h ^ (h >>> 13)) * 1540483477;
    h = h >>> 0;
  }
  return h;
}
