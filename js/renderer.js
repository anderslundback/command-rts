import { TS, MW, MH, FDATA, BDEF, TILE_COLORS, T } from './constants.js';
import { state } from './state.js';
import { canPlace } from './placement.js';

export function render() {
  const ctx = state.ctx;
  const VW = state.canvas.width, VH = state.canvas.height;
  ctx.clearRect(0, 0, VW, VH);
  renderTiles(ctx, VW, VH);
  renderBuildPreview(ctx);
  renderMoveIndicators(ctx);
  renderBuildings(ctx, VW, VH);
  renderUnits(ctx, VW, VH);
  renderParticles(ctx);
  renderDragBox(ctx);
}

function renderTiles(ctx, VW, VH) {
  const { cam } = state;
  const tsx = Math.max(0, (cam.x / TS) | 0);
  const tsy = Math.max(0, (cam.y / TS) | 0);
  const tex = Math.min(MW, tsx + (VW / TS | 0) + 2);
  const tey = Math.min(MH, tsy + (VH / TS | 0) + 2);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (let ty = tsy; ty < tey; ty++) {
    for (let tx = tsx; tx < tex; tx++) {
      const t = state.map[ty][tx];
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(tx * TS, ty * TS, TS, TS);
      if (t === T.ORE) {
        const sh = (Math.sin(state.tick * 0.08 + tx * 0.4 + ty * 0.7) + 1) * 0.5;
        ctx.fillStyle = `rgba(80,190,50,${0.12 + sh * 0.1})`;
        ctx.fillRect(tx * TS, ty * TS, TS, TS);
      }
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  for (let ty = tsy; ty < tey; ty++)
    for (let tx = tsx; tx < tex; tx++)
      ctx.strokeRect(tx * TS + 0.5, ty * TS + 0.5, TS - 1, TS - 1);
  ctx.restore();
}

function renderBuildPreview(ctx) {
  if (!state.buildMode) return;
  const d = BDEF[state.buildMode];
  const { tx, ty } = state.mouse;
  const ok = canPlace(state.buildMode, tx, ty, state.playerFaction);
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  ctx.fillStyle = ok ? 'rgba(0,200,100,0.25)' : 'rgba(220,50,50,0.25)';
  ctx.fillRect(tx * TS, ty * TS, d.w * TS, d.h * TS);
  ctx.strokeStyle = ok ? '#00cc66' : '#cc3333';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx * TS + 0.75, ty * TS + 0.75, d.w * TS - 1.5, d.h * TS - 1.5);
  ctx.restore();
}

function renderMoveIndicators(ctx) {
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  for (const m of state.moveIndicators) {
    const alpha = Math.min(1, m.t / 30);
    ctx.strokeStyle = `rgba(100,255,150,${alpha * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.wx, m.wy, Math.max(0, 6 * (1 - alpha) + 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m.wx, m.wy, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(100,255,150,${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

function renderBuildings(ctx, VW, VH) {
  const { cam, tick, selected } = state;
  const LABELS = { command: 'CMD', power: 'PWR', refinery: 'ORE', barracks: 'BRK', factory: 'FAC', depot: 'DEP', radar: 'RDR', airfield: 'AIR', turret: 'TRT', antiair: 'AAA' };
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const e of state.entities) {
    if (!e.isBuilding) continue;
    const bx = e.x * TS, by = e.y * TS, bw = e.w * TS, bh = e.h * TS;
    if (bx + bw < cam.x || bx > cam.x + VW || by + bh < cam.y || by > cam.y + VH) continue;

    const fd = FDATA[e.faction];
    const isSel = selected.includes(e.id);
    const alpha = e.done ? 1 : 0.5 + 0.3 * Math.abs(Math.sin(tick * 0.05));
    const flash = e.hitFlash / 8;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx + 3, by + 3, bw - 2, bh - 2);
    ctx.fillStyle = flash ? `rgba(255,${(1-flash)*80|0},${(1-flash)*80|0},${0.3+flash*0.5})` : fd.dark;
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.strokeStyle = isSel ? '#fff' : fd.color;
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    ctx.strokeStyle = fd.color; ctx.globalAlpha = alpha * 0.25; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = fd.color;
    ctx.font = `bold ${Math.min(10, TS * 0.35)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[e.type] || e.type, bx + bw / 2, by + bh / 2);
    ctx.globalAlpha = 1;

    const hpF = e.hp / e.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(bx + 1, by - 5, bw - 2, 4);
    ctx.fillStyle = hpF > 0.5 ? '#4d8' : hpF > 0.25 ? '#fc4' : '#f44';
    ctx.fillRect(bx + 1, by - 5, (bw - 2) * hpF, 4);
    if (hpF < 0.25 && tick % 20 < 10) {
      ctx.fillStyle = 'rgba(255,50,50,0.15)';
      ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    }
    if (!e.done) {
      ctx.fillStyle = '#112'; ctx.fillRect(bx+1, by+bh-4, bw-2, 3);
      ctx.fillStyle = '#44f'; ctx.fillRect(bx+1, by+bh-4, (bw-2)*e.bprog, 3);
    } else if (e.trainQ.length) {
      const it = e.trainQ[0];
      ctx.fillStyle = '#121'; ctx.fillRect(bx+1, by+bh-4, bw-2, 3);
      ctx.fillStyle = '#4d8'; ctx.fillRect(bx+1, by+bh-4, (bw-2)*(it.t/it.total), 3);
    }
    if (e.repairing && tick % 40 < 20) {
      ctx.strokeStyle = '#4d8';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.65;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.globalAlpha = 1;
    }
    if (e.waypoint && selected.includes(e.id)) {
      const wpx = e.waypoint.tx * TS, wpy = e.waypoint.ty * TS;
      ctx.strokeStyle = fd.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(wpx + TS / 2, wpy + TS);
      ctx.lineTo(wpx + TS / 2, wpy + TS - 12);
      ctx.lineTo(wpx + TS / 2 + 9, wpy + TS - 9);
      ctx.lineTo(wpx + TS / 2, wpy + TS - 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function renderUnits(ctx, VW, VH) {
  const { cam, tick, selected } = state;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const e of state.entities) {
    if (!e.isUnit) continue;
    const cx = e.px + TS/2, cy = e.py + TS/2, r = TS * 0.35;
    if (cx+r < cam.x || cx-r > cam.x+VW || cy+r < cam.y || cy-r > cam.y+VH) continue;
    const fd = FDATA[e.faction];
    const isSel = selected.includes(e.id);
    const flash = e.hitFlash / 8;

    if (isSel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, r+4, r+3, 0, 0, Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx+2, cy+3, r, r*0.45, 0, 0, Math.PI*2); ctx.fill();

    if (e.type === 'tank') {
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.fillRect(e.px+3, e.py+5, TS-6, TS-10);
      ctx.fillStyle = bc; ctx.fillRect(e.px+5, e.py+7, TS-10, TS-14);
      ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(cx, cy, r*0.58, 0, Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing);
      ctx.fillStyle = fd.dark; ctx.fillRect(0, -2, r+5, 4);
      ctx.restore();
    } else if (e.type === 'harvester') {
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.dark;
      ctx.fillStyle = bc; ctx.fillRect(e.px+3, e.py+3, TS-6, TS-6);
      ctx.strokeStyle = flash ? '#f88' : fd.color; ctx.lineWidth = 1.5;
      ctx.strokeRect(e.px+3.75, e.py+3.75, TS-7.5, TS-7.5);
      if (e.ore > 0) {
        ctx.fillStyle = '#4a8a22';
        ctx.fillRect(e.px+4, e.py+TS-8, (TS-8)*(e.ore/e.maxOre), 4);
      }
      ctx.strokeStyle = fd.color; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e.px+7, e.py+7); ctx.lineTo(e.px+TS-7, e.py+TS-7); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.type === 'mcv') {
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.fillRect(e.px+2, e.py+4, TS-4, TS-8);
      ctx.fillStyle = bc; ctx.fillRect(e.px+5, e.py+7, TS-10, TS-14);
      // Satellite dish antenna
      ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy-3); ctx.lineTo(cx+5, cy-8); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx+5, cy-9, 4, Math.PI*0.1, Math.PI*1.0); ctx.stroke();
    } else if (e.type === 'scout' || e.type === 'aatrack') {
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.fillRect(e.px+4, e.py+6, TS-8, TS-12);
      ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px+4.5, e.py+6.5, TS-9, TS-13);
      ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing);
      if (e.type === 'aatrack') {
        ctx.fillStyle = fd.dark;
        ctx.fillRect(1, -3, r+4, 2); ctx.fillRect(1, 1, r+4, 2);
      } else {
        ctx.fillStyle = fd.dark; ctx.fillRect(0, -1.5, r+6, 3);
      }
      ctx.restore();
    } else if (e.type === 'artillery' || e.type === 'v2rocket' || e.type === 'tomahawk') {
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.fillRect(e.px+2, e.py+8, TS-4, TS-16);
      ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px+2.5, e.py+8.5, TS-5, TS-17);
      ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(cx, cy, r*0.42, 0, Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing);
      ctx.fillStyle = fd.dark; ctx.fillRect(0, -1.5, r+11, 3);
      ctx.restore();
    } else if (e.type === 'fighter' || e.type === 'gunship' || e.type === 'drone') {
      const altitude = 12;
      // Ground shadow
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(cx+6, cy+6, r+2, r*0.4, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      // Aircraft body above ground
      const ay = cy - altitude;
      const bc = flash ? `rgb(255,${(1-flash)*80|0},${(1-flash)*80|0})` : fd.color;
      ctx.save(); ctx.translate(cx, ay); ctx.rotate(e.facing + Math.PI / 2);
      ctx.fillStyle = fd.dark;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r*0.6, r*0.6); ctx.lineTo(-r*0.6, r*0.6); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = bc;
      ctx.fillRect(-r*0.9, -r*0.1, r*1.8, r*0.28);
      ctx.restore();
    } else if (e.type === 'rocketeer') {
      const sc = flash ? `rgb(255,${(1-flash)*60|0},${(1-flash)*60|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.beginPath(); ctx.arc(cx, cy, r+1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(cx, cy, r-0.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = fd.dark; ctx.beginPath(); ctx.arc(cx, cy-r*0.3, r*0.32, 0, Math.PI*2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing);
      ctx.fillStyle = fd.color; ctx.fillRect(1, -2.5, r + 4, 5);
      ctx.restore();
    } else {
      const sc = flash ? `rgb(255,${(1-flash)*60|0},${(1-flash)*60|0})` : fd.color;
      ctx.fillStyle = fd.dark; ctx.beginPath(); ctx.arc(cx, cy, r+1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(cx, cy, r-0.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = fd.dark; ctx.beginPath(); ctx.arc(cx, cy-r*0.3, r*0.32, 0, Math.PI*2); ctx.fill();
    }

    const hpF = e.hp / e.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(e.px, e.py-4, TS, 3);
    ctx.fillStyle = hpF > 0.5 ? '#4d8' : hpF > 0.25 ? '#fc4' : '#f44';
    ctx.fillRect(e.px, e.py-4, TS*hpF, 3);
  }
  ctx.restore();
}

function renderParticles(ctx) {
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life);
    ctx.globalAlpha = alpha * (p.type === 'flash' ? 0.7 : 0.9);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * Math.max(0.1, p.life), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function renderDragBox(ctx) {
  if (!state.dragBox) return;
  const { x, y, w, h } = state.dragBox;
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  ctx.fillStyle = 'rgba(80,200,120,0.07)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80,200,120,0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  ctx.restore();
}

export function renderMinimap() {
  if (!state.radar || !state.radarCtx) return;
  const pf = state.playerFaction;
  const hasRadar = state.entities.some(
    e => !e.dead && e.isBuilding && e.faction === pf && e.type === 'radar' && e.done
  );
  if (!hasRadar) {
    const mmx = state.radarCtx, mw = state.radar.width, mh = state.radar.height;
    mmx.fillStyle = '#050810'; mmx.fillRect(0, 0, mw, mh);
    mmx.fillStyle = '#2a3a4a'; mmx.font = 'bold 11px monospace';
    mmx.textAlign = 'center'; mmx.textBaseline = 'middle';
    mmx.fillText('NO RADAR', mw / 2, mh / 2); mmx.textAlign = 'left';
    return;
  }
  if (!state.minimapDirty && state.tick % 4 !== 0) return;
  state.minimapDirty = false;
  const mmx = state.radarCtx;
  const mw = state.radar.width, mh = state.radar.height;
  const sx = mw / MW, sy = mh / MH;

  mmx.fillStyle = '#080c10';
  mmx.fillRect(0, 0, mw, mh);
  for (let ty = 0; ty < MH; ty += 2)
    for (let tx = 0; tx < MW; tx += 2) {
      const t = state.map[ty][tx];
      if (t === T.GRASS) continue;
      mmx.fillStyle = t === T.WATER ? '#0e2235' : t === T.ORE ? '#2a5a18' : '#2a2820';
      mmx.fillRect(tx*sx, ty*sy, sx*2+1, sy*2+1);
    }
  for (const e of state.entities) {
    if (e.dead) continue;
    mmx.fillStyle = FDATA[e.faction].color;
    if (e.isBuilding) mmx.fillRect(e.x*sx, e.y*sy, e.w*sx+1, e.h*sy+1);
    else mmx.fillRect(e.x*sx, e.y*sy, Math.max(2,sx), Math.max(2,sy));
  }
  const vx = state.cam.x / TS * sx, vy = state.cam.y / TS * sy;
  const vw = state.canvas.width / TS * sx, vh = state.canvas.height / TS * sy;
  mmx.strokeStyle = 'rgba(255,255,255,0.45)'; mmx.lineWidth = 1;
  mmx.strokeRect(vx, vy, vw, vh);
}
