import { TS, MW, MH, BDEF, UDEF, FBONUSES, VEHICLE_TYPES } from './constants.js';
import { state } from './state.js';
import { getEnt, getEntAt } from './entities.js';
import { getTile } from './map.js';
import { T } from './constants.js';
import { astar } from './pathfinding.js';
import { canPlace, placeBuilding, deployMcvInPlace, spawnNear } from './placement.js';
import { nearestRefinery, calcPower } from './resources.js';
import { orderMove, orderAttack, orderAttackMove, orderPatrol, orderHarvest } from './orders.js';
import { setMsg, updateBuildPanel, switchTab } from './hud.js';
import { scheduleInput } from './net/netClient.js';

const RED_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cline x1='16' y1='2' x2='16' y2='30' stroke='%23ff2222' stroke-width='2'/%3E%3Cline x1='2' y1='16' x2='30' y2='16' stroke='%23ff2222' stroke-width='2'/%3E%3Ccircle cx='16' cy='16' r='5' fill='none' stroke='%23ff2222' stroke-width='2'/%3E%3C/svg%3E") 16 16, crosshair`;

export function initInput() {
  const canvas = state.canvas;

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onRightClick);
  canvas.addEventListener('wheel', ev => { state.cam.x += ev.deltaX; state.cam.y += ev.deltaY; clampCam(); }, { passive: true });
  window.addEventListener('keydown', onKey);

}

export { onRadarClick };

function screenToWorld(sx, sy) {
  return { wx: sx + state.cam.x, wy: sy + state.cam.y };
}

function worldToTile(wx, wy) {
  return { tx: Math.floor(wx / TS), ty: Math.floor(wy / TS) };
}

export function clampCam() {
  const VW = state.canvas?.width  ?? 800;
  const VH = state.canvas?.height ?? 600;
  state.cam.x = Math.max(0, Math.min(MW * TS - VW, state.cam.x));
  state.cam.y = Math.max(0, Math.min(MH * TS - VH, state.cam.y));
}

function clearModes() {
  state.repairMode = false;
  state.sellMode = false;
  state.canvas.style.cursor = 'default';
  state.entities.forEach(e => { if (e.isBuilding && e.faction === state.playerFaction) e.repairing = false; });
}

function onMouseMove(ev) {
  if (!state.gameStarted) return;
  const r = state.canvas.getBoundingClientRect();
  const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const { wx, wy } = screenToWorld(sx, sy);
  const { tx, ty } = worldToTile(wx, wy);
  state.mouse = { sx, sy, wx, wy, tx, ty };

  if (state.dragStart) {
    const dsx = state.dragStart.wx, dsy = state.dragStart.wy;
    const minX = Math.min(wx, dsx), minY = Math.min(wy, dsy);
    state.dragBox = { x: minX, y: minY, w: Math.abs(wx - dsx), h: Math.abs(wy - dsy) };
  }

  const EDGE = 24, SPD = 10;
  if (sx < EDGE) state.cam.x -= SPD;
  else if (sx > state.canvas.width - EDGE) state.cam.x += SPD;
  if (sy < EDGE) state.cam.y -= SPD;
  else if (sy > state.canvas.height - EDGE) state.cam.y += SPD;
  clampCam();
}

function onMouseDown(ev) {
  if (ev.button !== 0 || !state.gameStarted) return;
  const r = state.canvas.getBoundingClientRect();
  const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const { wx, wy } = screenToWorld(sx, sy);
  state.dragStart = { wx, wy };
  state.dragBox = null;
}

function onMouseUp(ev) {
  if (ev.button !== 0) return;
  const wasDrag = state.dragBox && (state.dragBox.w > 8 || state.dragBox.h > 8);
  state._skipNextClick = wasDrag;
  if (wasDrag && state.gameStarted) {
    const { x, y, w, h } = state.dragBox;
    state.selected = state.entities
      .filter(u => !u.dead && u.isUnit && u.faction === state.playerFaction)
      .filter(u => {
        const cx = u.px + TS / 2, cy = u.py + TS / 2;
        return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
      })
      .map(u => u.id);
    updateBuildPanel();
  }
  state.dragStart = null;
  state.dragBox = null;
}

function onClick(ev) {
  if (ev.button !== 0 || !state.gameStarted || state.gameOver) return;
  if (state.paused) { import('./game.js').then(m => m.togglePause()); return; }
  if (state._skipNextClick) { state._skipNextClick = false; return; }

  const r = state.canvas.getBoundingClientRect();
  const tx = Math.floor((ev.clientX - r.left + state.cam.x) / TS);
  const ty = Math.floor((ev.clientY - r.top  + state.cam.y) / TS);
  const f  = state.playerFaction;

  if (state.replayMode) return;

  if (state.atkMoveMode) {
    const myUnits = state.selected.map(id => state.entById.get(id)).filter(u => u?.isUnit && u.faction === f && !u.dead);
    if (myUnits.length) {
      if (state.net) {
        scheduleInput({ action: 'attack_move', ids: myUnits.map(u => u.id), tx, ty, queued: ev.shiftKey });
      } else {
        const cols = Math.ceil(Math.sqrt(myUnits.length));
        myUnits.forEach((u, i) => {
          const offX = (i % cols) - Math.floor(cols / 2);
          const offY = Math.floor(i / cols) - Math.floor(cols / 2);
          orderAttackMove(u, tx + offX, ty + offY, ev.shiftKey);
        });
      }
      state.moveIndicators.push({ wx: tx * TS + TS / 2, wy: ty * TS + TS / 2, t: 30 });
    }
    if (!ev.shiftKey) { state.atkMoveMode = false; state.canvas.style.cursor = 'default'; }
    return;
  }

  if (state.patrolMode) {
    const myUnits = state.selected.map(id => state.entById.get(id)).filter(u => u?.isUnit && u.faction === f && !u.dead && u.dmg > 0);
    if (myUnits.length) {
      if (state.net) {
        scheduleInput({ action: 'patrol', ids: myUnits.map(u => u.id), tx, ty, queued: ev.shiftKey });
      } else {
        const cols = Math.ceil(Math.sqrt(myUnits.length));
        myUnits.forEach((u, i) => {
          const offX = (i % cols) - Math.floor(cols / 2);
          const offY = Math.floor(i / cols) - Math.floor(cols / 2);
          orderPatrol(u, tx + offX, ty + offY, ev.shiftKey);
        });
      }
      state.moveIndicators.push({ wx: tx * TS + TS / 2, wy: ty * TS + TS / 2, t: 30 });
    }
    if (!ev.shiftKey) { state.patrolMode = false; state.canvas.style.cursor = 'default'; }
    return;
  }

  if (state.forceAtkMode) {
    const myUnits = state.selected.map(id => state.entById.get(id)).filter(u => u?.isUnit && u.faction === f && !u.dead && u.dmg > 0);
    if (myUnits.length) {
      const forceTarget = getEntAt(tx, ty);
      if (forceTarget) {
        if (state.net) {
          scheduleInput({ action: 'force_attack', ids: myUnits.map(u => u.id), targetId: forceTarget.id, queued: ev.shiftKey });
        } else {
          myUnits.forEach(u => orderAttack(u, forceTarget, ev.shiftKey));
        }
      } else {
        if (state.net) {
          scheduleInput({ action: 'attack_move', ids: myUnits.map(u => u.id), tx, ty, queued: ev.shiftKey });
        } else {
          const cols = Math.ceil(Math.sqrt(myUnits.length));
          myUnits.forEach((u, i) => {
            const offX = (i % cols) - Math.floor(cols / 2);
            const offY = Math.floor(i / cols) - Math.floor(cols / 2);
            orderAttackMove(u, tx + offX, ty + offY, ev.shiftKey);
          });
        }
        state.moveIndicators.push({ wx: tx * TS + TS / 2, wy: ty * TS + TS / 2, t: 30 });
      }
    }
    if (!ev.shiftKey) { state.forceAtkMode = false; state.canvas.style.cursor = 'default'; }
    return;
  }

  if (state.repairMode) {
    const clicked = getEntAt(tx, ty);
    if (clicked?.isBuilding && clicked.faction === f && clicked.done) {
      if (clicked.hp >= clicked.maxHp) {
        setMsg('Already at full HP', 60);
      } else if (state.net) {
        scheduleInput({ action: 'repair', entId: clicked.id, toggle: !clicked.repairing });
      } else {
        clicked.repairing = !clicked.repairing;
        setMsg(clicked.repairing ? 'Repairing ' + BDEF[clicked.type].name : 'Repair stopped');
      }
    }
    return;
  }

  if (state.sellMode) {
    const clicked = getEntAt(tx, ty);
    if (clicked?.isBuilding && clicked.faction === f && clicked.done) {
      if (state.net) {
        scheduleInput({ action: 'sell', entId: clicked.id });
      } else {
        const refund = Math.floor(BDEF[clicked.type].cost * 0.5 * (clicked.hp / clicked.maxHp));
        state.credits[f] += refund;
        clicked.dead = true;
        calcPower();
        state.minimapDirty = true;
        setMsg('Sold ' + BDEF[clicked.type].name + ' for $' + refund, 150);
        updateBuildPanel();
      }
    }
    return;
  }

  if (state.buildMode) {
    if (!canPlace(state.buildMode, tx, ty, f)) {
      setMsg('Cannot place here!', 90); return;
    }
    if (state.net) {
      scheduleInput({ action: 'place', faction: f, btype: state.buildMode, tx, ty });
    } else {
      const placed = placeBuilding(f, state.buildMode, tx, ty, true);
      if (placed && state.buildReady) {
        for (const q of [state.hudBuildQueue[f], state.hudDefQueue[f]]) {
          const idx = q.findIndex(it => it.type === state.buildMode && it.ready);
          if (idx >= 0) { q.splice(idx, 1); break; }
        }
        if (state.buildMode === 'refinery') {
          const harv = spawnNear(f, 'harvester', placed);
          if (harv) orderHarvest(harv, placed);
        }
      }
    }
    if (!ev.shiftKey) {
      state.buildMode = null;
      state.buildReady = false;
      state.canvas.style.cursor = 'default';
      updateBuildPanel();
    }
    return;
  }

  // Ctrl+click: force attack any entity (even allies) or attack-move to ground
  if ((ev.ctrlKey || ev.metaKey) && !state.replayMode) {
    const myUnits = state.selected
      .map(id => state.entById.get(id))
      .filter(u => u?.isUnit && u.faction === f && !u.dead && u.dmg > 0);
    if (myUnits.length) {
      const forceTarget = getEntAt(tx, ty);
      if (forceTarget) {
        if (state.net) {
          scheduleInput({ action: 'force_attack', ids: myUnits.map(u => u.id), targetId: forceTarget.id, queued: ev.shiftKey });
        } else {
          myUnits.forEach(u => orderAttack(u, forceTarget, ev.shiftKey));
        }
      } else {
        if (state.net) {
          scheduleInput({ action: 'attack_move', ids: myUnits.map(u => u.id), tx, ty, queued: ev.shiftKey });
        } else {
          const cols = Math.ceil(Math.sqrt(myUnits.length));
          myUnits.forEach((u, i) => {
            const offX = (i % cols) - Math.floor(cols / 2);
            const offY = Math.floor(i / cols) - Math.floor(cols / 2);
            orderAttackMove(u, tx + offX, ty + offY, ev.shiftKey);
          });
        }
        state.moveIndicators.push({ wx: tx * TS + TS / 2, wy: ty * TS + TS / 2, t: 30 });
      }
      return;
    }
  }

  const _raw = getEntAt(tx, ty);
  const clicked = (() => {
    if (!_raw || _raw.faction === f) return _raw;
    if (!state.fog?.visible) return _raw;
    const etx = _raw.isBuilding ? (_raw.x + (_raw.w >> 1)) : _raw.x;
    const ety = _raw.isBuilding ? (_raw.y + (_raw.h >> 1)) : _raw.y;
    return state.fog.visible[ety * MW + etx] ? _raw : null;
  })();
  const now = Date.now();

  if (clicked && clicked === state.lastClickEnt && now - state.lastClickTime < 400) {
    if (clicked.isUnit) {
      const type = clicked.type;
      const VW = state.canvas.width, VH = state.canvas.height;
      state.selected = state.entities
        .filter(e => !e.dead && e.isUnit && e.faction === f && e.type === type)
        .filter(e => e.px+TS/2 >= state.cam.x && e.px+TS/2 <= state.cam.x+VW &&
                     e.py+TS/2 >= state.cam.y && e.py+TS/2 <= state.cam.y+VH)
        .map(e => e.id);
    }
    state.lastClickTime = 0; state.lastClickEnt = null;
  } else {
    if (clicked) {
      if (ev.shiftKey) {
        const idx = state.selected.indexOf(clicked.id);
        idx >= 0 ? state.selected.splice(idx, 1) : state.selected.push(clicked.id);
      } else {
        state.selected = [clicked.id];
      }
    } else if (!ev.shiftKey) {
      state.selected = [];
    }
    state.lastClickTime = now;
    state.lastClickEnt = clicked;
  }
  updateBuildPanel();
}

function onRightClick(ev) {
  ev.preventDefault();
  if (ev.ctrlKey || ev.metaKey) return;
  if (!state.gameStarted || state.gameOver) return;
  if (state.replayMode) return;

  if (state.paused) {
    const f = state.playerFaction;
    const bq = state.hudBuildQueue[f];
    const dq = state.hudDefQueue[f];
    if (bq.length) {
      const item = bq.shift();
      state.credits[f] += BDEF[item.type].cost;
      if (state.buildMode === item.type) { state.buildMode = null; state.buildReady = false; }
      setMsg('Cancelled ' + BDEF[item.type].name + ' — $' + BDEF[item.type].cost + ' refunded', 180);
      updateBuildPanel();
    } else if (dq.length) {
      const item = dq.shift();
      state.credits[f] += BDEF[item.type].cost;
      if (state.buildMode === item.type) { state.buildMode = null; state.buildReady = false; }
      setMsg('Cancelled ' + BDEF[item.type].name + ' — $' + BDEF[item.type].cost + ' refunded', 180);
      updateBuildPanel();
    } else {
      const trainB = state.entities.find(e => !e.dead && e.isBuilding && e.faction === f && e.trainQ.length);
      if (trainB) {
        const item = trainB.trainQ.shift();
        state.credits[f] += UDEF[item.type].cost;
        setMsg('Cancelled ' + UDEF[item.type].name + ' — $' + UDEF[item.type].cost + ' refunded', 180);
        updateBuildPanel();
      } else {
        setMsg('Nothing to cancel', 60);
      }
    }
    return;
  }

  if (state.repairMode || state.sellMode) {
    clearModes();
    updateBuildPanel();
    return;
  }
  if (state.buildMode) {
    state.buildMode = null;
    state.buildReady = false;
    updateBuildPanel();
    return;
  }

  const { tx, ty, wx, wy } = state.mouse;
  const f = state.playerFaction;
  const target = getEntAt(tx, ty);

  // Right-click own building: depot + vehicles selected → send to repair pad; otherwise set primary
  if (target?.isBuilding && target.faction === f) {
    const myVehicles = state.selected
      .map(id => state.entById.get(id))
      .filter(u => u?.isUnit && u.faction === f && !u.dead && VEHICLE_TYPES.has(u.type));
    if (target.type === 'depot' && target.done && myVehicles.length) {
      const tiles = [];
      for (let dy = 0; dy < target.h; dy++)
        for (let dx = 0; dx < target.w; dx++)
          tiles.push({ x: target.x + dx, y: target.y + dy });
      if (state.net) {
        scheduleInput({ action: 'repair_move', ids: myVehicles.map(u => u.id), entId: target.id, queued: ev.shiftKey });
      } else {
        myVehicles.forEach((u, i) => {
          const t = tiles[i % tiles.length];
          orderMove(u, t.x, t.y, ev.shiftKey);
        });
      }
      state.moveIndicators.push({ wx: (target.x + target.w / 2) * TS, wy: (target.y + target.h / 2) * TS, t: 30 });
      return;
    }
    state.primaryBuilding[target.type] = target.id;
    if (state.net) scheduleInput({ action: 'set_primary', btype: target.type, entId: target.id });
    setMsg(BDEF[target.type].name + ' set as primary', 90);
    updateBuildPanel();
    return;
  }

  const myUnits = state.selected
    .map(id => state.entities.find(e => e.id === id))
    .filter(u => u && u.isUnit && u.faction === f && !u.dead);

  // Buildings-only selection + right-click ground → set waypoints; no selection → pause
  if (!myUnits.length && !target) {
    const selBuildings = state.selected
      .map(id => getEnt(id))
      .filter(e => e?.isBuilding && e.faction === f && e.done);
    if (selBuildings.length) {
      if (state.net) {
        selBuildings.forEach(b => scheduleInput({ action: 'waypoint', entId: b.id, tx, ty }));
      } else {
        selBuildings.forEach(b => { b.waypoint = { tx, ty }; });
        setMsg(selBuildings.length === 1
          ? BDEF[selBuildings[0].type].name + ' waypoint set'
          : selBuildings.length + ' waypoints set', 60);
      }
      state.moveIndicators.push({ wx, wy, t: 60 });
      return;
    }
    return;
  }

  if (!myUnits.length) return;

  if (target && target.faction !== f) {
    const attackers = myUnits.filter(u => u.dmg > 0);
    if (state.net) {
      if (attackers.length) scheduleInput({ action: 'attack', ids: attackers.map(u => u.id), targetId: target.id, queued: ev.shiftKey });
    } else {
      attackers.forEach(u => orderAttack(u, target, ev.shiftKey));
    }
  } else if (target?.isBuilding && target.faction === f && target.type === 'refinery') {
    const harvesters = myUnits.filter(u => u.type === 'harvester');
    if (state.net) {
      if (harvesters.length) scheduleInput({ action: 'harvest', ids: harvesters.map(u => u.id), refineryId: target.id });
    } else {
      harvesters.forEach(u => orderHarvest(u, target));
    }
  } else if (getTile(tx, ty) === T.ORE) {
    const harvesters = myUnits.filter(u => u.type === 'harvester');
    if (state.net) {
      if (harvesters.length) {
        const ref = nearestRefinery(f, harvesters[0].x, harvesters[0].y);
        scheduleInput({ action: 'harvest', ids: harvesters.map(u => u.id), refineryId: ref?.id });
      }
    } else {
      for (const u of myUnits) {
        if (u.type !== 'harvester') continue;
        u.harvestTile = { x: tx, y: ty };
        u.state = 'harvest';
        const ref = nearestRefinery(f, u.x, u.y);
        if (ref) u.refineryId = ref.id;
        u.path = astar(u.x, u.y, tx, ty, true);
        u.mprog = 0;
      }
    }
  } else {
    if (state.net) {
      if (myUnits.length) scheduleInput({ action: 'move', ids: myUnits.map(u => u.id), tx, ty, queued: ev.shiftKey });
    } else {
      const cols = Math.ceil(Math.sqrt(myUnits.length));
      myUnits.forEach((u, i) => {
        const offX = (i % cols) - Math.floor(cols / 2);
        const offY = Math.floor(i / cols) - Math.floor(cols / 2);
        orderMove(u, tx + offX, ty + offY, ev.shiftKey);
      });
    }
    state.moveIndicators.push({ wx, wy, t: 30 });
  }
}

function onKey(ev) {
  if (!state.gameStarted) return;
  if (state.paused && ev.key !== 'Escape') return;
  const SPD = 80;
  if (ev.key === 'Escape') {
    if (state.paused) { import('./game.js').then(m => m.togglePause()); return; }
    if (state.atkMoveMode) { state.atkMoveMode = false; state.canvas.style.cursor = 'default'; return; }
    if (state.patrolMode) { state.patrolMode = false; state.canvas.style.cursor = 'default'; return; }
    if (state.forceAtkMode) { state.forceAtkMode = false; state.canvas.style.cursor = 'default'; return; }
    if (state.buildMode || state.repairMode || state.sellMode) {
      state.buildMode = null; state.buildReady = false; clearModes(); updateBuildPanel(); return;
    }
    if (state.selected.length) { state.selected = []; updateBuildPanel(); return; }
    import('./game.js').then(m => m.togglePause());
  }
  if (ev.key === 'ArrowLeft')  state.cam.x -= SPD;
  if (ev.key === 'ArrowRight') state.cam.x += SPD;
  if (ev.key === 'ArrowUp')    state.cam.y -= SPD;
  if (ev.key === 'ArrowDown')  state.cam.y += SPD;
  if (!state.replayMode) {
    // Control groups: Ctrl+1-9 assign, 1-9 recall (double-tap to center camera)
    const digit = parseInt(ev.key, 10);
    if (digit >= 1 && digit <= 9) {
      if (ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        state.controlGroups[digit - 1] = [...state.selected];
        setMsg('Group ' + digit + ' assigned', 60);
        updateBuildPanel();
      } else if (!ev.ctrlKey && !ev.metaKey) {
        const group = state.controlGroups[digit - 1].filter(id => {
          const e = state.entById.get(id);
          return e && !e.dead;
        });
        state.controlGroups[digit - 1] = group;
        state.selected = [...group];
        const now = Date.now();
        if (state._lastGroupKey === digit && now - state._lastGroupTime < 400 && group.length) {
          const first = state.entById.get(group[0]);
          if (first) {
            state.cam.x = first.px - state.canvas.width / 2;
            state.cam.y = first.py - state.canvas.height / 2;
            clampCam();
          }
        }
        state._lastGroupKey = digit;
        state._lastGroupTime = now;
        updateBuildPanel();
      }
    }

    // Attack-move mode: A key
    if ((ev.key === 'a' || ev.key === 'A') && !ev.ctrlKey && !ev.metaKey && !state.paused) {
      const hasAttackers = state.selected.some(id => {
        const u = state.entById.get(id);
        return u?.isUnit && u.faction === state.playerFaction && !u.dead && u.dmg > 0;
      });
      if (hasAttackers) { state.atkMoveMode = true; state.canvas.style.cursor = RED_CURSOR; }
    }
    // Patrol mode: P key
    if ((ev.key === 'p' || ev.key === 'P') && !ev.ctrlKey && !ev.metaKey && !state.paused) {
      const hasAttackers = state.selected.some(id => {
        const u = state.entById.get(id);
        return u?.isUnit && u.faction === state.playerFaction && !u.dead && u.dmg > 0;
      });
      if (hasAttackers) { state.patrolMode = true; state.canvas.style.cursor = 'crosshair'; }
    }
  }

  if (!state.replayMode) {
    if (ev.key === 'h' || ev.key === 'H') {
      const cmd = state.entities.find(e => !e.dead && e.isBuilding && e.faction === state.playerFaction && e.type === 'command');
      if (cmd) { state.cam.x = cmd.x * TS - state.canvas.width / 2; state.cam.y = cmd.y * TS - state.canvas.height / 2; }
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'a') {
      ev.preventDefault();
      state.selected = state.entities.filter(e => !e.dead && e.isUnit && e.faction === state.playerFaction).map(e => e.id);
      updateBuildPanel();
    }
    if (ev.key === 's' || ev.key === 'S') {
      const ids = state.selected.filter(id => {
        const u = state.entities.find(e => e.id === id);
        return u?.isUnit && u.faction === state.playerFaction;
      });
      if (state.net) {
        if (ids.length) scheduleInput({ action: 'stop', ids });
      } else {
        ids.forEach(id => {
          const u = state.entities.find(e => e.id === id);
          if (u) { u.state = 'idle'; u.path = []; u.target = null; }
        });
      }
    }
    if (ev.key === 'f' || ev.key === 'F') {
      const mcv = state.entities.find(e => !e.dead && e.isUnit && e.type === 'mcv' &&
        e.faction === state.playerFaction && state.selected.includes(e.id));
      if (mcv) {
        if (state.net) {
          scheduleInput({ action: 'deploy_mcv', unitId: mcv.id });
        } else {
          const b = deployMcvInPlace(mcv);
          if (b) {
            state.selected = [b.id];
            setMsg('MCV deployed — Command Center established', 180);
            updateBuildPanel();
          } else {
            setMsg('No space to deploy — move MCV to open ground', 150);
          }
        }
      } else {
        const hasAttackers = state.selected.some(id => {
          const u = state.entById.get(id);
          return u?.isUnit && u.faction === state.playerFaction && !u.dead && u.dmg > 0;
        });
        if (hasAttackers) { state.forceAtkMode = true; state.canvas.style.cursor = RED_CURSOR; }
      }
    }
    if (ev.key === 'b' || ev.key === 'B') switchTab('build');
    if (ev.key === 't' || ev.key === 'T') switchTab('train');
  }
  clampCam();
}

function onRadarClick(ev) {
  const r = state.radar.getBoundingClientRect();
  const wx = ((ev.clientX - r.left) / state.radar.width) * MW * TS;
  const wy = ((ev.clientY - r.top) / state.radar.height) * MH * TS;
  state.cam.x = wx - state.canvas.width / 2;
  state.cam.y = wy - state.canvas.height / 2;
  clampCam();
}
