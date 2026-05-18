import { TS, HUD_H, SIDEBAR_W, FDATA, FBONUSES, T } from './constants.js';
import { state } from './state.js';
import { genMap, tickOreRegen, startPositions } from './map.js';
import { resetEid, removeDeadEnts } from './entities.js';
import { calcPower, nearestRefinery } from './resources.js';
import { placeBuilding, spawnUnit, spawnNear } from './placement.js';
import { orderHarvest } from './orders.js';
import { updateUnit } from './units.js';
import { updateBuilding, updateSidebarQueues } from './buildings.js';
import { updateParticles } from './particles.js';
import { makeAI } from './ai.js';
import { render, renderMinimap } from './renderer.js';
import { setMsg } from './hud.js';
import { speak } from './audio.js';
import { clampCam } from './input.js';
import { syncFromGameState } from './store.js';

export function startGame(pf) {
  state.playerFaction = pf;
  state.entities = [];
  state.entById = new Map();
  state.particles = [];
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
  state.paused = false;
  state.credits   = [1000, 2000, 2000];
  state.powerUsed = [0, 0, 0];
  state.powerGen  = [0, 0, 0];
  state.gameOver = false;
  state.gameStarted = true;
  state.statusMsg = '';
  state.statusTimer = 0;
  state.minimapDirty = true;
  state.oreHistory = new Set();
  resetEid();

  genMap();

  for (let ty = 0; ty < 60; ty++)
    for (let tx = 0; tx < 80; tx++)
      if (state.map[ty][tx] === T.ORE) state.oreHistory.add(ty * 80 + tx);

  state.AI = [null, null, null];
  for (let i = 0; i < 3; i++) if (i !== pf) state.AI[i] = makeAI(i);

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
  calcPower();

  const [px, py] = starts[pf];
  state.cam.x = px * TS - state.canvas.width  / 2;
  state.cam.y = py * TS - state.canvas.height / 2;
  clampCam();

  syncFromGameState();

  if (state.frameId) cancelAnimationFrame(state.frameId);
  loop();
}

export function showMenu() {
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

function loop() {
  const now = performance.now();
  if (state.fpsLastTime > 0) {
    state.fpsSmooth = state.fpsSmooth * 0.9 + (1000 / (now - state.fpsLastTime)) * 0.1;
  }
  state.fpsLastTime = now;

  state.tick++;

  if (state.paused) {
    render();
    renderMinimap();
    state.frameId = requestAnimationFrame(loop);
    return;
  }

  if (!state.gameOver && state.gameStarted) {
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

    if (!state.gameOver) {
      for (const e of state.entities) {
        if (e.dead) continue;
        if (e.isUnit)     updateUnit(e);
        if (e.isBuilding) updateBuilding(e);
      }
      removeDeadEnts();
      updateSidebarQueues();
      for (let i = 0; i < 3; i++) state.AI[i]?.update();
      updateParticles();
      tickOreRegen();
      if (state.statusTimer > 0) state.statusTimer--;
      let i = state.moveIndicators.length;
      while (i--) { state.moveIndicators[i].t--; if (state.moveIndicators[i].t <= 0) state.moveIndicators.splice(i, 1); }
    }

    syncFromGameState();
  }

  render();
  renderMinimap();
  state.frameId = requestAnimationFrame(loop);
}

function checkVictory() {
  const alive = [false, false, false];
  for (const e of state.entities)
    if (!e.dead && e.isBuilding) alive[e.faction] = true;

  const aliveCount = alive.filter(Boolean).length;
  if (aliveCount > 1) return;

  state.gameOver = true;
}
