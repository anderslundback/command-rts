import { state } from './state.js';
import { Building, Unit, getEid, setEid } from './entities.js';
import { net } from './net/netClient.js';
import { applyCommand } from './commands.js';
import { uiStore } from './store.js';

// ── Snapshot (save/restore full game state for rollback) ──────────────────────

export function saveSnapshot() {
  return {
    tick: state.tick,
    eid: getEid(),
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
    mapRows: state.map.map(row => Array.from(row)),
    statusMsg: state.statusMsg,
    statusTimer: state.statusTimer,
    gameSpeed: state.gameSpeed,
    aiTimers: state.AI.map(ai => ai ? { btimer: ai.btimer, wtimer: ai.wtimer, htimer: ai.htimer } : null),
  };
}

function snapshotEnt(e) {
  return Object.assign({}, e, {
    _isBuilding: e.isBuilding,
    path: e.path ? [...e.path] : null,
    trainQ: e.trainQ ? e.trainQ.map(q => ({ ...q })) : null,
    harvestTile: e.harvestTile ? { ...e.harvestTile } : null,
    waypoint: e.waypoint ? { ...e.waypoint } : null,
    orderQueue: e.orderQueue ? e.orderQueue.map(o => ({ ...o })) : [],
    atkMoveDest: e.atkMoveDest ? { ...e.atkMoveDest } : null,
    patrolA: e.patrolA ? { ...e.patrolA } : null,
    patrolB: e.patrolB ? { ...e.patrolB } : null,
  });
}

export function restoreSnapshot(snap) {
  if (snap.eid != null) setEid(snap.eid);
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
  if (snap.mapRows) {
    for (let y = 0; y < snap.mapRows.length; y++) {
      const row = snap.mapRows[y];
      for (let x = 0; x < row.length; x++) state.map[y][x] = row[x];
    }
  }
  state.statusMsg = snap.statusMsg;
  state.statusTimer = snap.statusTimer;
  state.gameSpeed = snap.gameSpeed ?? 2;
  if (snap.aiTimers) {
    for (let i = 0; i < 3; i++) {
      if (state.AI[i] && snap.aiTimers[i]) {
        state.AI[i].btimer = snap.aiTimers[i].btimer;
        state.AI[i].wtimer = snap.aiTimers[i].wtimer;
        state.AI[i].htimer = snap.aiTimers[i].htimer;
      }
    }
  }
}

function restoreEnt(s) {
  const proto = s._isBuilding ? Building.prototype : Unit.prototype;
  const e = Object.create(proto);
  Object.assign(e, s);
  delete e._isBuilding;
  if (s.path) e.path = [...s.path];
  if (s.trainQ) e.trainQ = s.trainQ.map(q => ({ ...q }));
  e.orderQueue = s.orderQueue ? s.orderQueue.map(o => ({ ...o })) : [];
  if (s.atkMoveDest) e.atkMoveDest = { ...s.atkMoveDest };
  if (s.patrolA) e.patrolA = { ...s.patrolA };
  if (s.patrolB) e.patrolB = { ...s.patrolB };
  return e;
}

// ── Input scheduling ──────────────────────────────────────────────────────────

export function scheduleInput(cmd) {
  if (!state.rollback) return; // skirmish — should not reach here
  const tick = state.tick;
  state.rollback.inputHistory[tick] ??= {};
  state.rollback.inputHistory[tick][state.net.mySlot] = cmd;
  state.rollback.replayLog[tick] ??= {};
  state.rollback.replayLog[tick][state.net.mySlot] = cmd;
  net.send({ type: 'input', tick, slot: state.net.mySlot, cmd });
}

// Called when a remote input arrives. Triggers rollback if the prediction was wrong.
// simulateTickFn must be game.js's _gameTick (passed to avoid circular import).
export function onRemoteInput(tick, slot, cmd, _applyCmd, simulateTickFn) {
  if (!state.rollback) return;
  state.rollback.inputHistory[tick] ??= {};
  const predicted = state.rollback.inputHistory[tick][slot]; // null = predicted no-input; undefined = future tick
  state.rollback.inputHistory[tick][slot] = cmd ?? null;
  if (cmd != null) {
    state.rollback.replayLog[tick] ??= {};
    state.rollback.replayLog[tick][slot] = cmd;
  }

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
  if (!snap || snap.tick !== fromTick - 1) {
    // Input arrived too late to recover — states have permanently diverged
    console.warn(`[lockstep] buffer miss: need snap for tick ${fromTick - 1}, current tick ${toTick}. States diverged.`);
    uiStore.setState({ desync: true });
    return;
  }

  state.isRollingBack = true;
  restoreSnapshot(snap);

  for (let t = fromTick; t <= toTick; t++) {
    simulateTickFn(); // increments state.tick, applies inputHistory[tick], stores snapshot
  }

  state.isRollingBack = false;
}

// Store snapshot after each tick. Called from gameTick() when rollback is active.
export function storeTickSnapshot() {
  if (!state.rollback) return;
  state.rollback.buffer[state.tick % state.rollback.buffer.length] = saveSnapshot();
  // Prune old input history to prevent unbounded memory growth (keep last 200 ticks)
  if (state.tick % 50 === 0) {
    const pruneBelow = state.tick - 400;
    for (const t of Object.keys(state.rollback.inputHistory)) {
      if (+t < pruneBelow) delete state.rollback.inputHistory[t];
    }
  }
}

// Record our null prediction for a remote slot's input this tick.
export function recordPrediction(tick, slot) {
  if (!state.rollback) return;
  state.rollback.predictions[tick] ??= {};
  state.rollback.predictions[tick][slot] = null; // predict: no input
}

// ── State hash for desync detection ──────────────────────────────────────────

export function entityHash(entities, extraState) {
  let h = 0;
  for (const e of entities) {
    if (e.dead) continue;
    h ^= (e.id * 73856093) ^ ((e.hp | 0) * 19349663) ^ (Math.round(e.px) * 83492791) ^ (Math.round(e.py) * 95452411);
    if (e.ore) h ^= (e.ore * 4256233) >>> 0;
    h = (h ^ (h >>> 13)) * 1540483477;
    h = h >>> 0;
  }
  if (extraState) {
    for (let f = 0; f < 3; f++) {
      h ^= (extraState.credits[f] * 100 | 0) * (31337 * (f + 1));
      h = (h ^ (h >>> 13)) * 1540483477;
      h = h >>> 0;
    }
    h ^= (extraState.rng.getState() * 7919) >>> 0;
    h = (h ^ (h >>> 13)) * 1540483477;
    h ^= extraState.shells.length * 104729;
    h = h >>> 0;
  }
  return h;
}

export function mapHash() {
  const map = state.map;
  let h = 0;
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 0) { // skip GRASS (most tiles)
        h ^= (y * 80 + x) * 1000003 ^ (row[x] * 999983);
        h = (h ^ (h >>> 13)) * 1540483477;
        h = h >>> 0;
      }
    }
  }
  return h;
}

// Apply a state dump from the host to resync after a desync event.
export function applyStateDump(snap) {
  restoreSnapshot(snap);
  state.isRollingBack = false;
  if (state.rollback) {
    state.rollback._stallStart = null;
    state.rollback.buffer[snap.tick % state.rollback.buffer.length] = saveSnapshot();
    for (const t of Object.keys(state.rollback.inputHistory)) {
      if (+t <= snap.tick) delete state.rollback.inputHistory[t];
    }
  }
}
