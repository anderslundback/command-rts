import { BDEF, UDEF, FBONUSES, BUILD_TYPES, TRAIN_FROM, FDATA } from './constants.js';
import { state } from './state.js';
import { getEnt } from './entities.js';
import { hasPwr } from './resources.js';

export function setMsg(m, dur = 180) {
  state.statusMsg = m;
  state.statusTimer = dur;
  document.getElementById('hud-msg').textContent = m;
}

export function updateHUD() {
  const fd = FDATA[state.playerFaction];
  const el = id => document.getElementById(id);
  el('hud-faction').textContent = fd.name;
  el('hud-faction').style.color = fd.color;
  el('hud-credits').textContent = Math.floor(state.credits[state.playerFaction]);
  const pwr = el('hud-power');
  pwr.textContent = state.powerUsed[state.playerFaction];
  pwr.style.color = hasPwr(state.playerFaction) ? '#fd4' : '#f44';
  el('hud-pmax').textContent = state.powerGen[state.playerFaction];
  if (state.statusTimer <= 0) el('hud-msg').textContent = '';
  updatePowerBar();
  updateInfoPanel();
  updateBuildPanel();
}

function updatePowerBar() {
  const f = state.playerFaction;
  const total = state.powerGen[f] + state.powerUsed[f];
  const pct = total > 0 ? Math.min(1, state.powerGen[f] / total) : 0;
  const fill = document.getElementById('power-bar-fill');
  if (fill) {
    fill.style.width = (pct * 100).toFixed(1) + '%';
    fill.style.background = hasPwr(f) ? '#2d8' : '#d44';
  }
}

function updateInfoPanel() {
  const box = document.getElementById('info-content');
  const sel = state.selected.map(id => getEnt(id)).filter(Boolean);
  if (!sel.length) { box.innerHTML = '<span style="color:#334">No selection</span>'; return; }
  const e = sel[0], fd = FDATA[e.faction];
  const name = e.isBuilding ? BDEF[e.type].name : UDEF[e.type].name;
  const hc = e.hp / e.maxHp > 0.5 ? '#4d8' : e.hp / e.maxHp > 0.25 ? '#fc4' : '#f44';

  let badges = '';
  if (e.isBuilding) {
    if (e.trainQ.length > 0)
      badges += ` <span style="background:#4af;color:#000;border-radius:2px;padding:0 4px;font-size:9px">×${e.trainQ.length}</span>`;
    const bq = e.faction === state.playerFaction ? state.hudBuildQueue[e.faction].length : 0;
    if (bq > 0)
      badges += ` <span style="background:#fd4;color:#000;border-radius:2px;padding:0 4px;font-size:9px">Q:${bq}</span>`;
    const pid = state.primaryBuilding[e.type];
    if (pid === e.id)
      badges += ` <span style="background:#fa4;color:#000;border-radius:2px;padding:0 4px;font-size:9px">★</span>`;
  }

  let html = `<div style="color:${fd.color};font-weight:bold;margin-bottom:4px">${name}${badges}</div>`;
  html += `<div style="margin-bottom:3px">HP: <span style="color:${hc}">${e.hp}</span><span style="color:#445">/${e.maxHp}</span></div>`;
  if (e.isBuilding) {
    if (!e.done) html += `<div style="color:#669">Building: ${(e.bprog*100).toFixed(0)}%</div>`;
    if (e.trainQ.length) {
      const it = e.trainQ[0];
      html += `<div style="color:#9ab;margin-top:4px">Training: ${UDEF[it.type].name} ${(it.t/it.total*100).toFixed(0)}%</div>`;
      if (e.trainQ.length > 1) html += `<div style="color:#445">+${e.trainQ.length-1} queued</div>`;
    }
    if (e.done && e.type === 'turret') {
      html += `<div style="color:#445;margin-top:2px">ATK ${e.dmg} · RNG ${e.range}</div>`;
    }
    if (e.waypoint) {
      html += `<div style="color:#345;margin-top:2px">WP: ${e.waypoint.tx},${e.waypoint.ty}</div>`;
    }
  } else {
    const labels = { idle:'Idle', move:'Moving', attack:'Attacking', harvest:'Harvesting', return:'Returning' };
    html += `<div style="color:#556">${labels[e.state] || e.state}</div>`;
    if (e.type === 'harvester') html += `<div>Ore: <span style="color:#8d5">${e.ore}</span>/${e.maxOre}</div>`;
    if (e.dmg > 0) {
      const wname = { small_arms:'Small Arms', rockets:'Rockets', cannon:'Cannon', gun:'Auto-Gun' };
      html += `<div style="color:#445">ATK ${e.dmg} · RNG ${e.range} · ${wname[e.weaponType] || ''}</div>`;
    }
  }
  if (sel.length > 1) html += `<div style="color:#445;margin-top:4px">+${sel.length-1} selected</div>`;
  box.innerHTML = html;
}

let _panelSig = '';

export function updateBuildPanel() {
  const box = document.getElementById('build-buttons');
  if (!box) return;

  const f = state.playerFaction;
  const cr = state.credits[f];
  const done = state.entities.filter(e => !e.dead && e.isBuilding && e.faction === f && e.done);

  const doneKey  = done.map(e => e.type).sort().join(',');
  const qFullKey = done.map(b => b.trainQ.length >= 5 ? 1 : 0).join('');
  // Coarse progress bucket (2% steps) so panel doesn't re-render every tick
  const hudKey   = state.hudBuildQueue[f].map(i => i.type + (i.ready ? 'R' : '') + (i.total > 0 ? ((i.t / i.total * 50) | 0) : 0)).join(',');
  const primKey  = Object.entries(state.primaryBuilding).map(([k,v]) => k+':'+v).join(',');
  const bCostKey = Object.values(BDEF).map(d => cr >= d.cost ? 1 : 0).join('');
  const uCostKey = Object.values(UDEF).map(d => cr >= d.cost ? 1 : 0).join('');
  const sig = `${f}|${state.buildMode || ''}|${state.buildReady}|${state.repairMode}|${state.sellMode}|${state.activeTab}|${doneKey}|${qFullKey}|${hudKey}|${primKey}|${bCostKey}|${uCostKey}`;

  if (sig === _panelSig) {
    tickBtnProgress(box, f, done);
    return;
  }
  _panelSig = sig;
  box.innerHTML = '';

  // Ghost placement mode — just show cancel
  if (state.buildMode && state.buildReady) {
    const d = BDEF[state.buildMode];
    const cancelBtn = makeBtn('CANCEL PLACE', d.name, false, () => {
      state.buildMode = null;
      state.buildReady = false;
      updateBuildPanel();
    }, '#f64');
    box.appendChild(cancelBtn);
    return;
  }

  if (state.activeTab === 'build') {
    renderBuildTab(box, f, cr, done);
  } else {
    renderTrainTab(box, f, cr, done);
  }
}

function tickBtnProgress(box, f, done) {
  for (const btn of box.querySelectorAll('.build-btn[data-btype]')) {
    const btype = btn.dataset.btype;
    let prog = btn.querySelector('.btn-progress');

    if (state.activeTab === 'build') {
      const inProg = state.entities.find(
        e => !e.dead && e.isBuilding && e.faction === f && e.type === btype && !e.done
      );
      if (inProg) {
        if (!prog) { prog = document.createElement('div'); prog.className = 'btn-progress'; btn.appendChild(prog); }
        prog.style.width = (inProg.bprog * 100).toFixed(1) + '%';
      } else if (prog) {
        prog.remove();
      }
    } else {
      for (const [bldgType, utypes] of Object.entries(TRAIN_FROM)) {
        if (!utypes.includes(btype)) continue;
        const pid = state.primaryBuilding[bldgType];
        const primaryEnt = pid ? getEnt(pid) : null;
        const bldg = (primaryEnt && !primaryEnt.dead) ? primaryEnt : done.find(b => b.type === bldgType);
        const it = bldg?.trainQ[0];
        if (it && it.type === btype) {
          if (!prog) { prog = document.createElement('div'); prog.className = 'btn-progress'; btn.appendChild(prog); }
          prog.style.width = (it.t / it.total * 100).toFixed(1) + '%';
        } else if (prog) {
          prog.remove();
        }
        break;
      }
    }
  }
}

function renderBuildTab(box, f, cr, done) {
  const repairBtn = makeBtn(
    state.repairMode ? 'REPAIRING' : 'REPAIR',
    'click bldg',
    false,
    () => {
      state.repairMode = !state.repairMode;
      state.sellMode = false;
      state.buildMode = null;
      state.buildReady = false;
      state.canvas.style.cursor = state.repairMode ? 'crosshair' : 'default';
      if (!state.repairMode) {
        state.entities.forEach(e => { if (e.isBuilding && e.faction === f) e.repairing = false; });
      }
      updateBuildPanel();
    },
    state.repairMode ? '#4d8' : null
  );
  box.appendChild(repairBtn);

  const sellBtn = makeBtn(
    state.sellMode ? 'SELLING' : 'SELL',
    '50% refund',
    false,
    () => {
      state.sellMode = !state.sellMode;
      state.repairMode = false;
      state.buildMode = null;
      state.buildReady = false;
      state.canvas.style.cursor = state.sellMode ? 'crosshair' : 'default';
      if (!state.sellMode) {
        state.entities.forEach(e => { if (e.isBuilding && e.faction === f) e.repairing = false; });
      }
      updateBuildPanel();
    },
    state.sellMode ? '#fa4' : null
  );
  box.appendChild(sellBtn);

  // Sidebar construction queue
  const queue = state.hudBuildQueue[f];
  if (queue.length) {
    const qHeader = document.createElement('div');
    qHeader.style.cssText = 'width:100%;padding:4px 2px 2px;font-size:9px;color:#334;letter-spacing:1px';
    qHeader.textContent = 'CONSTRUCTING:';
    box.appendChild(qHeader);

    queue.forEach((item, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'width:100%;display:flex;align-items:center;gap:3px;padding:2px 2px;position:relative;overflow:hidden';

      const pct = item.total > 0 ? Math.min(1, item.t / item.total) : 1;
      const progressBg = document.createElement('div');
      progressBg.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${(pct*100).toFixed(1)}%;background:rgba(0,100,60,0.18);pointer-events:none`;
      row.appendChild(progressBg);

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex:1;font-size:9px;color:' + (item.ready ? '#4d8' : '#678') + ';overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
      nameSpan.textContent = BDEF[item.type].name + (item.ready ? ' ✓' : ' ' + (pct*100).toFixed(0) + '%');
      row.appendChild(nameSpan);

      if (item.ready) {
        const placeBtn = document.createElement('button');
        placeBtn.type = 'button';
        placeBtn.style.cssText = 'font-size:8px;padding:1px 4px;background:#0a2a18;border:1px solid #4d8;color:#4d8;cursor:pointer;font-family:monospace;flex-shrink:0';
        placeBtn.textContent = 'PLACE';
        placeBtn.addEventListener('click', e => {
          e.stopPropagation();
          state.buildMode = item.type;
          state.buildReady = true;
          updateBuildPanel();
        });
        row.appendChild(placeBtn);
      }

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.style.cssText = 'font-size:8px;padding:1px 4px;background:#1a0808;border:1px solid #633;color:#966;cursor:pointer;font-family:monospace;flex-shrink:0';
      cancelBtn.textContent = 'X';
      cancelBtn.addEventListener('click', e => {
        e.stopPropagation();
        state.credits[f] += item.paid || 0;
        queue.splice(i, 1);
        if (i === 0) { state.buildMode = null; state.buildReady = false; }
        updateBuildPanel();
      });
      row.appendChild(cancelBtn);
      box.appendChild(row);
    });

    const sep = document.createElement('div');
    sep.style.cssText = 'width:100%;border-top:1px solid #1a2230;margin:3px 0 2px';
    box.appendChild(sep);
  }

  // Build type buttons
  for (const type of BUILD_TYPES) {
    const d = BDEF[type];
    const prereqOk = !d.prereq || done.some(b => b.type === d.prereq);
    const canAfford = cr >= d.cost;
    const disabled = !prereqOk;
    const btn = makeBtn(d.name, '$' + d.cost, disabled, () => {
      queue.push({ type, t: 0, total: BDEF[type].btime * 60, paid: 0, ready: false, notified: false });
      updateBuildPanel();
    }, null, canAfford);
    btn.dataset.btype = type;

    // Show AI building progress on buttons (only AI buildings have bprog animation now)
    const beingBuilt = state.entities.find(e => !e.dead && e.isBuilding && e.faction === f && e.type === type && !e.done);
    if (beingBuilt) {
      const prog = document.createElement('div');
      prog.className = 'btn-progress';
      prog.style.width = (beingBuilt.bprog * 100).toFixed(1) + '%';
      btn.appendChild(prog);
    }
    box.appendChild(btn);
  }
}

function renderTrainTab(box, f, cr, done) {
  let any = false;
  for (const [btype, utypes] of Object.entries(TRAIN_FROM)) {
    if (!done.some(b => b.type === btype)) continue;

    const pid = state.primaryBuilding[btype];
    const primaryEnt = pid ? getEnt(pid) : null;
    const building = (primaryEnt && !primaryEnt.dead && primaryEnt.type === btype)
      ? primaryEnt : done.find(b => b.type === btype);

    for (const utype of utypes) {
      const d = UDEF[utype];
      const fb = FBONUSES[f];
      const canAfford = cr >= d.cost;
      const qFull = building.trainQ.length >= 5;
      const btn = makeBtn(d.name, '$' + d.cost, qFull, () => {
        if (building.trainQ.length < 5) {
          building.trainQ.push({ type: utype, t: 0, total: (d.ttime * fb.trainMult * 60) | 0 });
        }
      }, null, canAfford);
      btn.dataset.btype = utype;
      if (building.trainQ.length && building.trainQ[0].type === utype) {
        const it = building.trainQ[0];
        const prog = document.createElement('div');
        prog.className = 'btn-progress';
        prog.style.width = (it.t / it.total * 100).toFixed(1) + '%';
        btn.appendChild(prog);
      }
      any = true;
      box.appendChild(btn);
    }
  }
  if (!any) {
    const info = document.createElement('div');
    info.style.cssText = 'color:#345;font-size:10px;padding:8px;line-height:1.6';
    info.textContent = 'Build Barracks or War Factory to train units.';
    box.appendChild(info);
  }
}

function makeBtn(label, sub, disabled, cb, color = null, affordable = true) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'build-btn' + (disabled ? ' disabled' : '');
  if (color) { btn.style.color = color; btn.style.borderColor = color; }
  btn.innerHTML = `<span class="btn-name">${label}</span><span class="btn-cost ${!affordable ? 'no' : ''}">${sub}</span>`;
  if (!disabled) btn.addEventListener('click', e => { e.stopPropagation(); cb(); });
  return btn;
}

export function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.build-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  updateBuildPanel();
}
