import { TS, HUD_H, SIDEBAR_W, FDATA, FBONUSES, T, BDEF, UDEF } from './constants.js';
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

// ── Skirmish (single-player vs AI) ───────────────────────────────────────────

export function startGame(pf) {
  state.net = null;
  _resetGameState(pf, [1000, 2000, 2000]);

  genMap();
  _populateOreHistory();
  state.AI = [null, null, null];
  for (let i = 0; i < 3; i++) if (i !== pf) state.AI[i] = makeAI(i);
  _placeStartingEntities();
  calcPower();
  initFog();
  updateFog();
  recordPower();
  _centerCamOn(pf);
  syncFromGameState();
  if (state.frameId) cancelAnimationFrame(state.frameId);
  loop();
}

// ── Multiplayer host/client entry ────────────────────────────────────────────

export function startNetGame(mapSeed, myFaction, role, aiSlots) {
  state.net = { role, myFaction, commandQueue: [], snapshotTick: 0 };
  _resetGameState(myFaction, [1000, 2000, 2000]);

  genMapFromSeed(mapSeed);
  _populateOreHistory();
  state.AI = [null, null, null];

  if (role === 'host') {
    for (let i = 0; i < 3; i++) if (aiSlots[i]) state.AI[i] = makeAI(i);
    _placeStartingEntities();
    calcPower();
    initFog();
    updateFog();
    recordPower();
  } else {
    initFog();
  }

  _centerCamOn(myFaction);
  syncFromGameState();
  if (state.frameId) cancelAnimationFrame(state.frameId);
  loop();
}

// ── Snapshot serialization (host → server → clients) ─────────────────────────

function serializeEnt(e) {
  const s = {
    id: e.id, type: e.type, faction: e.faction, isBuilding: !!e.isBuilding,
    x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
    armorType: e.armorType, weaponType: e.weaponType, dmg: e.dmg, range: e.range,
  };
  if (e.isBuilding) {
    s.w = e.w; s.h = e.h; s.bprog = e.bprog;
    s.trainQ = e.trainQ ? e.trainQ.map(it => ({ ...it })) : [];
    s.repairing = !!e.repairing;
    s.waypoint = e.waypoint ? { ...e.waypoint } : null;
    s.atimer = e.atimer; s.target = e.target;
  } else {
    s.state = e.state; s.target = e.target; s.mprog = e.mprog; s.facing = e.facing;
    s.ore = e.ore; s.maxOre = e.maxOre;
    s.harvestTile = e.harvestTile ? { ...e.harvestTile } : null;
    s.refineryId = e.refineryId; s.destPx = e.destPx; s.destPy = e.destPy;
    s.splash = e.splash; s.speed = e.speed; s.aspd = e.aspd;
  }
  return s;
}

function broadcastSnapshot() {
  net.send({
    type: 'snapshot',
    tick: state.tick,
    credits: [...state.credits],
    powerUsed: [...state.powerUsed],
    powerGen:  [...state.powerGen],
    hudBuildQueue: state.hudBuildQueue.map(q => q.map(it => ({ ...it }))),
    hudDefQueue:   state.hudDefQueue.map(q => q.map(it => ({ ...it }))),
    entities: state.entities.filter(e => !e.dead).map(serializeEnt),
    gameOver: state.gameOver,
    gameOverDelay: state.gameOverDelay,
    factionEliminated: [...state.factionEliminated],
    gameStats: { ...state.gameStats, powerHistory: [...state.gameStats.powerHistory] },
  });
}

// ── Snapshot application (client side) ───────────────────────────────────────

export function applySnapshot(snap) {
  if (state.net?.role !== 'client') return;

  state.tick          = snap.tick;
  state.credits       = snap.credits;
  state.powerUsed     = snap.powerUsed;
  state.powerGen      = snap.powerGen;
  state.hudBuildQueue = snap.hudBuildQueue;
  state.hudDefQueue   = snap.hudDefQueue;
  state.gameOver      = snap.gameOver;
  state.gameOverDelay = snap.gameOverDelay;
  state.factionEliminated = snap.factionEliminated;
  state.gameStats     = snap.gameStats;
  state.net.snapshotTick = snap.tick;

  state.entById.clear();
  state.entities = snap.entities.map(s => {
    const e = s.isBuilding ? deserializeBuilding(s) : deserializeUnit(s);
    state.entById.set(e.id, e);
    return e;
  });
}

function deserializeBuilding(s) {
  const e = Object.create(Building.prototype);
  const d = BDEF[s.type] ?? {};
  Object.assign(e, {
    id: s.id, faction: s.faction, type: s.type, isBuilding: true,
    x: s.x, y: s.y, px: s.x * TS, py: s.y * TS,
    hp: s.hp, maxHp: s.maxHp, dead: false, hitFlash: 0,
    w: s.w ?? d.w ?? 1, h: s.h ?? d.h ?? 1,
    bprog: s.bprog ?? 1,
    btotal: (d.btime ?? 0) * 60,
    trainQ: s.trainQ ?? [],
    repairing: !!s.repairing,
    waypoint: s.waypoint ?? null,
    atimer: s.atimer ?? 0,
    target: s.target ?? null,
    armorType:  s.armorType  ?? 'building',
    weaponType: s.weaponType ?? null,
    dmg:   s.dmg   ?? d.dmg   ?? 0,
    range: s.range ?? d.range ?? 0,
    aspd:  d.aspd  ?? 0,
    power: d.power ?? 0,
  });
  return e;
}

function deserializeUnit(s) {
  const e = Object.create(Unit.prototype);
  const d = UDEF[s.type] ?? {};
  Object.assign(e, {
    id: s.id, faction: s.faction, type: s.type, isUnit: true,
    x: s.x, y: s.y, px: s.x * TS, py: s.y * TS,
    hp: s.hp, maxHp: s.maxHp, dead: false, hitFlash: 0,
    state: s.state ?? 'idle',
    path: [], mprog: s.mprog ?? 0, atimer: 0,
    target: s.target ?? null,
    harvestTile: s.harvestTile ?? null,
    refineryId: s.refineryId ?? null,
    ore: s.ore ?? 0, maxOre: s.maxOre ?? 90,
    facing: s.facing ?? 0,
    speed: s.speed ?? d.speed ?? 1,
    dmg:   s.dmg   ?? d.dmg  ?? 0,
    range: s.range ?? d.range ?? 1,
    aspd:  s.aspd  ?? d.aspd ?? 60,
    armorType:  s.armorType  ?? 'infantry',
    weaponType: s.weaponType ?? null,
    splash: s.splash ?? d.splash ?? 0,
    destPx: s.destPx, destPy: s.destPy,
  });
  return e;
}

// ── Command application (host side) ──────────────────────────────────────────

function applyQueuedCommands() {
  if (!state.net.commandQueue.length) return;
  for (const { cmd } of state.net.commandQueue.splice(0)) applyCommand(cmd);
}

function applyCommand(cmd) {
  switch (cmd.action) {
    case 'move':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && !u.dead) orderMove(u, cmd.tx, cmd.ty); }
      break;
    case 'attack': {
      const t = state.entById.get(cmd.targetId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && t && !u.dead) orderAttack(u, t); }
      break;
    }
    case 'stop':
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u) orderStop(u); }
      break;
    case 'harvest': {
      const ref = state.entById.get(cmd.refineryId);
      for (const id of cmd.ids) { const u = state.entById.get(id); if (u && ref) orderHarvest(u, ref); }
      break;
    }
    case 'place':
      placeBuilding(cmd.faction, cmd.btype, cmd.tx, cmd.ty, false);
      break;
    case 'queue_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q) q.push({ type: cmd.btype, t: 0, total: (BDEF[cmd.btype]?.btime ?? 20) * 60, paid: 0, ready: false });
      break;
    }
    case 'cancel_build': {
      const q = cmd.queueType === 'def' ? state.hudDefQueue[cmd.faction] : state.hudBuildQueue[cmd.faction];
      if (q && cmd.index < q.length) {
        state.credits[cmd.faction] += BDEF[q[cmd.index].type]?.cost ?? 0;
        q.splice(cmd.index, 1);
      }
      break;
    }
    case 'queue_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && b.trainQ.length < 5)
        b.trainQ.push({ type: cmd.utype, t: 0, total: (UDEF[cmd.utype]?.ttime ?? 20) * 60 });
      break;
    }
    case 'cancel_train': {
      const b = state.entById.get(cmd.bldgId);
      if (b && b.trainQ && cmd.index < b.trainQ.length) {
        state.credits[b.faction] += UDEF[b.trainQ[cmd.index].type]?.cost ?? 0;
        b.trainQ.splice(cmd.index, 1);
      }
      break;
    }
    case 'sell': {
      const b = state.entById.get(cmd.entId);
      if (b && !b.dead) { state.credits[b.faction] += (BDEF[b.type]?.cost ?? 0) * 0.5; b.dead = true; }
      break;
    }
    case 'repair': {
      const b = state.entById.get(cmd.entId);
      if (b) b.repairing = cmd.toggle;
      break;
    }
    case 'deploy_mcv': {
      const u = state.entById.get(cmd.unitId);
      if (u && !u.dead) deployMcvInPlace(u);
      break;
    }
    case 'waypoint': {
      const b = state.entById.get(cmd.entId);
      if (b) b.waypoint = { tx: cmd.tx, ty: cmd.ty };
      break;
    }
    case 'set_primary':
      state.primaryBuilding[cmd.btype] = cmd.entId;
      break;
  }
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

// ── Game loop ─────────────────────────────────────────────────────────────────

function loop() {
  const now = performance.now();
  if (state.fpsLastTime > 0) {
    state.fpsSmooth = state.fpsSmooth * 0.9 + (1000 / (now - state.fpsLastTime)) * 0.1;
  }
  state.fpsLastTime = now;

  state.tick++;

  // Client-only: render received state, no simulation
  if (state.net?.role === 'client') {
    updateFog();
    updateParticles();
    syncFromGameState();
    render();
    renderMinimap();
    state.frameId = requestAnimationFrame(loop);
    return;
  }

  if (state.paused) {
    render();
    renderMinimap();
    state.frameId = requestAnimationFrame(loop);
    return;
  }

  if (state.gameStarted) {
    if (!state.gameOver) {
      for (let fi = 0; fi < 3; fi++) {
        if (!state.factionEliminated[fi]) {
          const hasBuildings = state.entities.some(e => !e.dead && e.isBuilding && e.faction === fi);
          if (!hasBuildings) {
            state.factionEliminated[fi] = true;
            if (fi !== state.playerFaction) {
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
      if (state.net?.role === 'host') applyQueuedCommands();
      updateShells();
      updateFog();
      if (state.tick % 300 === 1) recordPower();
      tickOreRegen();
      if (state.statusTimer > 0) state.statusTimer--;
      let i = state.moveIndicators.length;
      while (i--) { state.moveIndicators[i].t--; if (state.moveIndicators[i].t <= 0) state.moveIndicators.splice(i, 1); }
    }
    updateParticles();
    if (state.net?.role === 'host' && state.tick % 6 === 0) broadcastSnapshot();
    syncFromGameState();
  }

  render();
  renderMinimap();
  state.frameId = requestAnimationFrame(loop);
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

function _placeStartingEntities() {
  const starts = startPositions();
  for (let f = 0; f < 3; f++) {
    const [sx, sy] = starts[f];
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

function _centerCamOn(faction) {
  const [px, py] = startPositions()[faction];
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
  applySnapshot,
  startNetGame,
  showMenu: () => showMenu(),
  onCmd: (msg) => { if (state.net?.role === 'host') state.net.commandQueue.push(msg); },
});
