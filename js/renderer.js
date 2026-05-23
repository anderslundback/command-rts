import { TS, MW, MH, FDATA, BDEF, TILE_COLORS, T } from './constants.js';
import { state } from './state.js';
import { canPlace } from './placement.js';

// Stable per-tile pseudo-random value — same result every frame for a given tx,ty,n
const _sr = (tx, ty, n) =>
  Math.abs(Math.sin(tx * 127.1 + ty * 311.7 + n * 74.3) * 43758.5453 % 1);

export function render() {
  const ctx = state.ctx;
  const VW = state.canvas.width, VH = state.canvas.height;
  ctx.clearRect(0, 0, VW, VH);
  renderTiles(ctx, VW, VH);
  renderFog(ctx, VW, VH);
  renderBuildPreview(ctx);
  renderMoveIndicators(ctx);
  renderBuildings(ctx, VW, VH);
  renderUnits(ctx, VW, VH);
  renderParticles(ctx);
  renderShells(ctx);
  renderDragBox(ctx);
  if (state.gameOver && state.gameOverDelay > 0) renderVictoryAnnouncement(ctx, VW, VH);
}

// ── Tile rendering ────────────────────────────────────────────────────────────

function renderTiles(ctx, VW, VH) {
  const { cam, tick } = state;
  const tsx = Math.max(0, (cam.x / TS) | 0);
  const tsy = Math.max(0, (cam.y / TS) | 0);
  const tex = Math.min(MW, tsx + (VW / TS | 0) + 2);
  const tey = Math.min(MH, tsy + (VH / TS | 0) + 2);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (let ty = tsy; ty < tey; ty++) {
    for (let tx = tsx; tx < tex; tx++) {
      const t = state.map[ty][tx];
      const px = tx * TS, py = ty * TS;
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(px, py, TS, TS);

      if (t === T.GRASS) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(px, py, TS, 1);
        for (let n = 0; n < 4; n++) {
          const gx = px + (_sr(tx, ty, n * 3) * (TS - 2)) | 0;
          const gy = py + (_sr(tx, ty, n * 3 + 1) * (TS - 4)) | 0;
          const gh = 2 + (_sr(tx, ty, n * 3 + 2) * 4) | 0;
          ctx.fillStyle = `rgba(70,110,35,${0.09 + _sr(tx, ty, n + 50) * 0.07})`;
          ctx.fillRect(gx, gy, 1, gh);
        }
      } else if (t === T.WATER) {
        const w1y = py + 7 + Math.sin(tick * 0.035 + tx * 0.38 + ty * 0.2) * 2.5;
        const w2y = py + 19 + Math.sin(tick * 0.035 + tx * 0.38 + ty * 0.2 + 1.8) * 2.5;
        ctx.fillStyle = 'rgba(90,170,255,0.09)';
        ctx.fillRect(px, w1y, TS, 1);
        ctx.fillStyle = 'rgba(70,140,255,0.06)';
        ctx.fillRect(px, w2y, TS, 1);
      } else if (t === T.ORE) {
        const sh = (Math.sin(tick * 0.08 + tx * 0.4 + ty * 0.7) + 1) * 0.5;
        ctx.fillStyle = `rgba(80,190,50,${0.12 + sh * 0.1})`;
        ctx.fillRect(px, py, TS, TS);
        for (let n = 0; n < 5; n++) {
          const dx = px + 3 + (_sr(tx, ty, n * 4) * (TS - 6)) | 0;
          const dy = py + 3 + (_sr(tx, ty, n * 4 + 1) * (TS - 6)) | 0;
          const ds = 1 + (_sr(tx, ty, n * 4 + 2) * 2.5) | 0;
          ctx.fillStyle = `rgba(140,235,65,${0.30 + sh * 0.25})`;
          ctx.beginPath();
          ctx.moveTo(dx, dy - ds); ctx.lineTo(dx + ds, dy);
          ctx.lineTo(dx, dy + ds); ctx.lineTo(dx - ds, dy);
          ctx.closePath(); ctx.fill();
        }
      } else if (t === T.ROCK) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(px, py, TS, 1); ctx.fillRect(px, py, 1, TS);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px + TS - 1, py, 1, TS); ctx.fillRect(px, py + TS - 1, TS, 1);
        for (let n = 0; n < 2; n++) {
          const cx0 = px + (_sr(tx, ty, n * 5 + 10) * (TS - 6)) | 0;
          const cy0 = py + (_sr(tx, ty, n * 5 + 11) * (TS - 6)) | 0;
          const len = 4 + (_sr(tx, ty, n * 5 + 12) * 9) | 0;
          const ang = _sr(tx, ty, n * 5 + 13) * Math.PI;
          ctx.strokeStyle = 'rgba(0,0,0,0.30)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx0, cy0);
          ctx.lineTo(cx0 + Math.cos(ang) * len, cy0 + Math.sin(ang) * len);
          ctx.stroke();
        }
      }
    }
  }

  // Grid
  ctx.lineWidth = 0.5;
  for (let ty = tsy; ty < tey; ty++) {
    for (let tx = tsx; tx < tex; tx++) {
      ctx.strokeStyle = state.map[ty][tx] === T.GRASS
        ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
      ctx.strokeRect(tx * TS + 0.5, ty * TS + 0.5, TS - 1, TS - 1);
    }
  }
  ctx.restore();
}

// ── Build preview & move indicators (unchanged) ────────────────────────────

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

// ── Building rendering ────────────────────────────────────────────────────────

function renderBuildings(ctx, VW, VH) {
  const { cam, tick, selected } = state;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const e of state.entities) {
    if (!e.isBuilding) continue;
    const bx = e.x * TS, by = e.y * TS, bw = e.w * TS, bh = e.h * TS;
    if (bx + bw < cam.x || bx > cam.x + VW || by + bh < cam.y || by > cam.y + VH) continue;
    if (e.faction !== state.playerFaction && state.fog?.visible) {
      if (!state.fog.visible[(e.y + (e.h >> 1)) * MW + e.x + (e.w >> 1)]) continue;
    }

    const fd = FDATA[e.faction];
    const isSel = selected.includes(e.id);
    const alpha = e.done ? 1 : 0.5 + 0.3 * Math.abs(Math.sin(tick * 0.05));
    const flash = e.hitFlash / 8;
    ctx.globalAlpha = alpha;

    drawBuilding(ctx, e, bx, by, bw, bh, fd, isSel, flash, tick);

    ctx.globalAlpha = alpha;
    const hpF = e.hp / e.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(bx + 1, by - 5, bw - 2, 4);
    ctx.fillStyle = hpF > 0.5 ? '#4d8' : hpF > 0.25 ? '#fc4' : '#f44';
    ctx.fillRect(bx + 1, by - 5, (bw - 2) * hpF, 4);

    if (hpF < 0.25 && tick % 20 < 10) {
      ctx.fillStyle = 'rgba(255,50,50,0.12)';
      ctx.fillRect(bx, by, bw, bh);
    }
    if (!e.done) {
      ctx.fillStyle = '#112'; ctx.fillRect(bx + 1, by + bh - 4, bw - 2, 3);
      ctx.fillStyle = '#44f'; ctx.fillRect(bx + 1, by + bh - 4, (bw - 2) * e.bprog, 3);
    } else if (e.trainQ?.length) {
      const it = e.trainQ[0];
      ctx.fillStyle = '#121'; ctx.fillRect(bx + 1, by + bh - 4, bw - 2, 3);
      ctx.fillStyle = '#4d8'; ctx.fillRect(bx + 1, by + bh - 4, (bw - 2) * (it.t / it.total), 3);
    }
    if (e.repairing && tick % 40 < 20) {
      ctx.strokeStyle = '#4d8'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    }
    if (e.waypoint && isSel) {
      const wpx = e.waypoint.tx * TS, wpy = e.waypoint.ty * TS;
      ctx.strokeStyle = fd.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(wpx + TS / 2, wpy + TS); ctx.lineTo(wpx + TS / 2, wpy + TS - 12);
      ctx.lineTo(wpx + TS / 2 + 9, wpy + TS - 9); ctx.lineTo(wpx + TS / 2, wpy + TS - 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBuilding(ctx, e, bx, by, bw, bh, fd, isSel, flash, tick) {
  const bc = flash > 0 ? `rgb(255,${((1 - flash) * 60) | 0},${((1 - flash) * 30) | 0})` : fd.color;
  const bd = flash > 0 ? `rgb(${(140 + flash * 80) | 0},${((1 - flash) * 20) | 0},0)` : fd.dark;
  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.fillRect(bx + 4, by + 4, bw, bh);
  switch (e.type) {
    case 'command':  bldCommand(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'power':    bldPower(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'refinery': bldRefinery(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'barracks': bldBarracks(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'factory':  bldFactory(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'depot':    bldDepot(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'radar':    bldRadar(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'airfield': bldAirfield(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'turret':   bldTurret(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'antiair':  bldAntiAir(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    default:
      ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
  }
}

// Command Center — 3×3 (96×96)
function bldCommand(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  // Base
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Corner turret bumps
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (const [ox, oy] of [[0,0],[bw-10,0],[0,bh-10],[bw-10,bh-10]])
    ctx.fillRect(bx + ox, by + oy, 10, 10);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
  for (const [ox, oy] of [[0,0],[bw-10,0],[0,bh-10],[bw-10,bh-10]])
    ctx.strokeRect(bx + ox + 0.5, by + oy + 0.5, 9, 9);
  // Outer perimeter wall
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  // Inner courtyard line
  ctx.strokeStyle = bc; ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.2;
  ctx.strokeRect(bx + 6, by + 6, bw - 12, bh - 12);
  ctx.globalAlpha = 1;
  // Central tower
  const tw = 28, th = 40;
  const tx0 = cx - tw / 2, ty0 = cy - th / 2 - 4;
  ctx.fillStyle = bd; ctx.fillRect(tx0, ty0, tw, th);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(tx0, ty0, tw, 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(tx0 + 0.75, ty0 + 0.75, tw - 1.5, th - 1.5);
  // Dome on tower top
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(cx, ty0, 12, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, ty0, 12, Math.PI, 0); ctx.stroke();
  // Antenna masts
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  for (const mx of [tx0 + 5, tx0 + tw - 5]) {
    ctx.beginPath(); ctx.moveTo(mx, ty0 - 1); ctx.lineTo(mx, ty0 - 11); ctx.stroke();
    ctx.fillStyle = bc;
    ctx.beginPath(); ctx.arc(mx, ty0 - 12, 2, 0, Math.PI * 2); ctx.fill();
  }
  // Faction cross on tower face
  const tmy = ty0 + th * 0.55;
  ctx.fillStyle = bc; ctx.globalAlpha = 0.55;
  ctx.fillRect(cx - 1, tmy - 6, 2, 12);
  ctx.fillRect(cx - 6, tmy - 1, 12, 2);
  ctx.globalAlpha = 1;
  // Selection
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Power Plant — 2×2 (64×64)
function bldPower(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Base platform
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 4, by + bh - 12, bw - 8, 12);
  // Two cooling stacks
  const stackW = 13, stackH = 30;
  for (const sx of [bx + 10, bx + 41]) {
    ctx.fillStyle = bd; ctx.fillRect(sx, by + 14, stackW, stackH);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(sx, by + 14, stackW, 4);
    ctx.strokeStyle = bc; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, by + 14.5, stackW - 1, stackH - 1);
    // Stack cap
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(sx - 1, by + 13, stackW + 2, 3);
    // Vent slits
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let s = 0; s < 4; s++) ctx.fillRect(sx + 2, by + 20 + s * 6, stackW - 4, 2);
  }
  // Connecting conduit pipes between stacks
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.25;
  for (const py2 of [by + 26, by + 34, by + 41])
    { ctx.beginPath(); ctx.moveTo(bx + 23, py2); ctx.lineTo(bx + 41, py2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // Glowing core between stacks
  const pulse = 0.35 + 0.4 * (Math.sin(tick * 0.09) * 0.5 + 0.5);
  ctx.beginPath(); ctx.arc(cx, by + 42, 9, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,160,${pulse * 0.25})`; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, by + 42, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,180,${pulse})`; ctx.fill();
  // Selection
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Refinery — 3×2 (96×64)
function bldRefinery(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Intake bay (left)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx + 4, by + 8, 24, bh - 16);
  // Funnel/intake mouth outline
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx + 4, by + 8); ctx.lineTo(bx + 28, by + 16);
  ctx.lineTo(bx + 28, by + bh - 16); ctx.lineTo(bx + 4, by + bh - 8);
  ctx.closePath(); ctx.stroke();
  // Diagonal stripe in bay
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.12;
  for (let i = 0; i < 5; i++)
    { ctx.beginPath(); ctx.moveTo(bx + 5 + i * 5, by + 9); ctx.lineTo(bx + 5, by + 9 + i * 5); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // Processing drum/tank (right)
  const tx0 = bx + 60, ty0 = by + 8, dw = 18, dh = bh - 16;
  ctx.fillStyle = bd; ctx.fillRect(tx0, ty0, dw, dh);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(tx0 + 0.75, ty0 + 0.75, dw - 1.5, dh - 1.5);
  // Drum dome cap
  ctx.beginPath(); ctx.arc(tx0 + dw / 2, ty0, dw / 2, Math.PI, 0);
  ctx.fillStyle = bd; ctx.fill(); ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Mid-ring on drum
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
  ctx.strokeRect(tx0, ty0 + dh * 0.45, dw, 2);
  ctx.globalAlpha = 1;
  // Ore fill indicator (bottom of drum)
  ctx.fillStyle = '#3a7a18';
  ctx.fillRect(tx0 + 2, ty0 + dh - 5, dw - 4, 4);
  ctx.fillStyle = '#5aaa28';
  ctx.fillRect(tx0 + 2, ty0 + dh - 5, (dw - 4) * 0.4, 4);
  // Bottom connecting pipe
  ctx.fillStyle = bc; ctx.globalAlpha = 0.4;
  ctx.fillRect(bx + 28, by + bh - 10, 32, 3);
  ctx.globalAlpha = 1;
  // Middle section panel
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.2;
  ctx.strokeRect(bx + 32, by + 10, 24, bh - 20);
  ctx.globalAlpha = 1;
  // Selection
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Barracks — 2×2 (64×64)
function bldBarracks(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Roof crenellations (4 merlons along top)
  ctx.fillStyle = bd;
  for (let i = 0; i < 4; i++) {
    const mx = bx + 6 + i * 14;
    ctx.fillRect(mx, by - 5, 9, 6);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
    ctx.strokeRect(mx + 0.5, by - 4.5, 8, 5);
  }
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
  // Roof accent line
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx + 1, by + 5); ctx.lineTo(bx + bw - 1, by + 5); ctx.stroke();
  // Windows either side
  for (const wx of [bx + 7, bx + 45]) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(wx, by + 14, 8, 14);
    ctx.strokeStyle = bc; ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, by + 14.5, 7, 13);
    // Window cross-bar
    ctx.strokeStyle = bc; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(wx, by + 21); ctx.lineTo(wx + 8, by + 21); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Entrance arch
  const archX = cx - 10, archY = by + 36;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath(); ctx.arc(cx, archY, 10, Math.PI, 0); ctx.fill();
  ctx.fillRect(archX, archY, 20, bh - archY + by);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, archY, 10, Math.PI, 0); ctx.stroke();
  ctx.strokeRect(archX + 0.75, archY + 0.75, 18.5, bh - archY + by - 0.75);
  // Steps at entrance
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(cx - 12, by + bh - 6, 24, 3);
  ctx.fillRect(cx - 9, by + bh - 3, 18, 3);
  // Sandbag row at base
  ctx.fillStyle = '#4a3a20';
  for (let i = 0; i < 5; i++) {
    const sx = bx + 4 + i * 12;
    ctx.beginPath(); ctx.ellipse(sx, by + bh - 3, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// War Factory — 3×2 (96×64)
function bldFactory(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Side wing panels with ribs
  for (const [wx, ww] of [[bx, 20],[bx + 76, 20]]) {
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.18;
    for (let i = 1; i < 4; i++)
      { ctx.beginPath(); ctx.moveTo(wx + i * (ww / 4), by + 6); ctx.lineTo(wx + i * (ww / 4), by + bh - 6); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // Center bay area
  const bayX = bx + 22, bayW = 52, bayY = by + 10, bayH = bh - 20;
  ctx.fillStyle = 'rgba(0,0,0,0.50)'; ctx.fillRect(bayX, bayY, bayW, bayH);
  const training = e.trainQ?.length > 0;
  // Bay door frame
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.strokeRect(bayX + 0.75, bayY + 0.75, bayW - 1.5, bayH - 1.5);
  // Bay door frame vertical lines
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(bayX + 2, bayY); ctx.lineTo(bayX + 2, bayY + bayH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bayX + bayW - 2, bayY); ctx.lineTo(bayX + bayW - 2, bayY + bayH); ctx.stroke();
  ctx.globalAlpha = 1;
  // Shutter lines (or open gap if training)
  if (training) {
    const gapH = 9, topH = 14;
    ctx.fillStyle = bd;
    ctx.fillRect(bayX + 3, bayY + 2, bayW - 6, topH);
    ctx.fillRect(bayX + 3, bayY + topH + gapH, bayW - 6, bayH - topH - gapH - 2);
    ctx.fillStyle = 'rgba(255,180,40,0.12)'; ctx.fillRect(bayX + 3, bayY + topH, bayW - 6, gapH);
  } else {
    ctx.fillStyle = bd;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(bayX + 3, bayY + 3 + i * (bayH / 4 - 1), bayW - 6, bayH / 4 - 3);
      ctx.strokeStyle = bc; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.15;
      ctx.strokeRect(bayX + 3, bayY + 3 + i * (bayH / 4 - 1), bayW - 6, bayH / 4 - 3);
      ctx.globalAlpha = 1;
    }
  }
  // Overhead crane beam
  ctx.fillStyle = bd; ctx.fillRect(bayX + 4, by + 8, bayW - 8, 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
  ctx.strokeRect(bayX + 4.5, by + 8.5, bayW - 9, 3);
  // Drop line + hook
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(cx, by + 12); ctx.lineTo(cx, by + 22); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 3, by + 24, 3, 0, Math.PI); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Service Depot — 3×2 (96×64)
function bldDepot(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cy = by + bh / 2;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Wide open bay
  const bayX = bx + 20, bayW = 56, bayY = by + 12, bayH = bh - 24;
  ctx.fillStyle = 'rgba(0,0,0,0.50)'; ctx.fillRect(bayX, bayY, bayW, bayH);
  // Bay floor grid lines for depth
  ctx.strokeStyle = bc; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.12;
  for (let i = 1; i < 3; i++) {
    const ly = bayY + i * (bayH / 3);
    ctx.beginPath(); ctx.moveTo(bayX, ly); ctx.lineTo(bayX + bayW, ly); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(bayX + 0.75, bayY + 0.75, bayW - 1.5, bayH - 1.5);
  // Repair arm (right side of bay, L-shape)
  const armX = bayX + bayW + 6;
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(armX - 10, cy - 5); ctx.lineTo(armX, cy - 5); ctx.lineTo(armX, cy + 8); ctx.stroke();
  ctx.beginPath(); ctx.arc(armX, cy + 10, 4, 0, Math.PI * 2);
  ctx.fillStyle = bc; ctx.fill();
  // Tool rack on left wall
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
  for (let i = 0; i < 3; i++) {
    const tx2 = bx + 6 + i * 5;
    ctx.beginPath(); ctx.moveTo(tx2, by + 16); ctx.lineTo(tx2, by + 38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx2 - 3, by + 22 + i * 5); ctx.lineTo(tx2 + 3, by + 22 + i * 5); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Status light (blink green)
  const lit = tick % 40 < 20;
  ctx.fillStyle = lit ? '#4d8' : 'rgba(0,60,20,0.8)';
  ctx.beginPath(); ctx.arc(bx + bw / 2, by + 7, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Radar — 2×2 (64×64)
function bldRadar(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, dishY = by + 28;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Support pillar
  ctx.fillStyle = bd;
  ctx.fillRect(cx - 5, dishY, 10, bh - 28);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 4.5, dishY + 0.5, 9, bh - 29);
  // Platform at pillar top
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx - 14, dishY - 3, 28, 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.strokeRect(cx - 13.5, dishY - 2.5, 27, 3);
  // Spinning radar dish
  ctx.save(); ctx.translate(cx, dishY); ctx.rotate(tick * 0.04);
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 18, -Math.PI * 0.9, 0.05); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 12, -Math.PI * 0.75, -0.1); ctx.stroke();
  ctx.strokeStyle = bd; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
  ctx.restore();
  // Signal pulse rings
  for (let i = 1; i <= 3; i++) {
    const pa = Math.max(0, (0.3 - i * 0.08) * (0.5 + 0.5 * Math.sin(tick * 0.1 + i * 1.2)));
    ctx.globalAlpha = pa; ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.arc(cx, dishY, 10 + i * 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Blink LED
  ctx.fillStyle = tick % 30 < 15 ? bc : 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(cx, by + 6, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Airfield — 3×2 (96×64)
function bldAirfield(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
  // Tarmac runway strip
  ctx.fillStyle = '#353535'; ctx.fillRect(bx, cy - 5, bw, 10);
  // Runway centerline dashes
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(bx + 8 + i * 19, cy - 1, 10, 2);
  // Threshold bars at ends
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(bx + 2, cy - 5, 3, 10); ctx.fillRect(bx + bw - 5, cy - 5, 3, 10);
  // Hangar hump above runway
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 28, 14, 0, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 28, 14, 0, Math.PI, 0); ctx.stroke();
  // Hangar bay door lines
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 6); ctx.lineTo(cx - 10, cy + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 6); ctx.lineTo(cx + 10, cy + 4); ctx.stroke();
  ctx.globalAlpha = 1;
  // Control tower (right side)
  const twX = bx + bw - 14;
  ctx.fillStyle = bd; ctx.fillRect(twX, by + 6, 10, 24);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(twX + 0.5, by + 6.5, 9, 23);
  ctx.fillStyle = 'rgba(180,230,255,0.25)'; ctx.fillRect(twX + 1, by + 8, 8, 5);
  // Tower blink light
  ctx.fillStyle = tick % 30 < 15 ? '#f64' : 'rgba(80,0,0,0.5)';
  ctx.beginPath(); ctx.arc(twX + 5, by + 5, 2, 0, Math.PI * 2); ctx.fill();
  // Windsock (left)
  ctx.strokeStyle = 'rgba(200,200,200,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + 10, by + 12); ctx.lineTo(bx + 10, by + 22); ctx.stroke();
  ctx.fillStyle = bc; ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(bx + 10, by + 14); ctx.lineTo(bx + 18, by + 14); ctx.lineTo(bx + 10, by + 18);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2.5 : 1.5;
  ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
}

// Turret — 1×1 (32×32)
function bldTurret(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  // Sandbag ring
  ctx.fillStyle = '#4a3a20';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 5, 3, a, 0, Math.PI * 2); ctx.fill();
  }
  // Octagonal base
  ctx.fillStyle = bd; ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10)
            : ctx.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.stroke();
  // Inner ring
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  // Barrel aimed at target or default right
  let facing = 0;
  if (e.target != null) {
    const t = state.entById?.get(e.target);
    if (t) facing = Math.atan2((t.py ?? t.y * TS) + TS/2 - cy, (t.px ?? t.x * TS) + TS/2 - cx);
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(facing);
  ctx.fillStyle = bd; ctx.fillRect(0, -4, 9, 8);
  ctx.fillStyle = bc; ctx.fillRect(6, -2, 14, 4);
  ctx.restore();
  if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke(); }
}

// Anti-Air — 1×1 (32×32)
function bldAntiAir(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  // Small sandbag ring
  ctx.fillStyle = '#4a3a20';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 4, 2.5, a, 0, Math.PI * 2); ctx.fill();
  }
  // Octagonal base (smaller)
  ctx.fillStyle = bd; ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5)
            : ctx.lineTo(cx + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.stroke();
  let facing = 0;
  if (e.target != null) {
    const t = state.entById?.get(e.target);
    if (t) facing = Math.atan2((t.py ?? t.y * TS) + TS/2 - cy, (t.px ?? t.x * TS) + TS/2 - cx);
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(facing);
  // Mini radar dish behind
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(-7, 0, 5, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  ctx.globalAlpha = 1;
  // Twin barrels
  ctx.fillStyle = bc;
  ctx.fillRect(2, -4, 13, 2.5);
  ctx.fillRect(2, 1.5, 13, 2.5);
  ctx.restore();
  // Tracking blink light
  ctx.fillStyle = tick % 30 < 15 ? '#f64' : 'rgba(80,0,0,0.6)';
  ctx.beginPath(); ctx.arc(cx, cy - 9, 2, 0, Math.PI * 2); ctx.fill();
  if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke(); }
}

// ── Unit rendering ────────────────────────────────────────────────────────────

function renderUnits(ctx, VW, VH) {
  const { cam, tick, selected } = state;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const e of state.entities) {
    if (!e.isUnit) continue;
    const cx = e.px + TS / 2, cy = e.py + TS / 2, r = TS * 0.35;
    if (cx + r < cam.x || cx - r > cam.x + VW || cy + r < cam.y || cy - r > cam.y + VH) continue;
    if (e.faction !== state.playerFaction && state.fog?.visible) {
      if (!state.fog.visible[e.y * MW + e.x]) continue;
    }

    const fd = FDATA[e.faction];
    const isSel = selected.includes(e.id);
    const flash = e.hitFlash / 8;
    const bc = flash > 0 ? `rgb(255,${((1-flash)*60)|0},${((1-flash)*30)|0})` : fd.color;
    const bd = flash > 0 ? `rgb(${(130+flash*80)|0},${((1-flash)*20)|0},0)` : fd.dark;

    // Selection ring
    if (isSel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, r + 4, r + 3, 0, 0, Math.PI * 2); ctx.stroke();
    }

    switch (e.type) {
      case 'tank':      unitTank(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'harvester': unitHarvester(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'mcv':       unitMcv(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'scout':     unitScout(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'aatrack':   unitAatrack(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'artillery': unitArtillery(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'v2rocket':  unitV2(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'tomahawk':  unitTomahawk(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'fighter':   unitFighter(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'gunship':   unitGunship(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'drone':     unitDrone(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'rocketeer': unitRocketeer(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      default:          unitInfantry(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
    }

    // HP bar
    const hpF = e.hp / e.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(e.px, e.py - 4, TS, 3);
    ctx.fillStyle = hpF > 0.5 ? '#4d8' : hpF > 0.25 ? '#fc4' : '#f44';
    ctx.fillRect(e.px, e.py - 4, TS * hpF, 3);
  }
  ctx.restore();
}

function _shadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function unitTank(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r, r * 0.45);
  // Hull
  ctx.fillStyle = bd; ctx.fillRect(e.px + 3, e.py + 6, TS - 6, TS - 12);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(e.px + 3.5, e.py + 6.5, TS - 7, TS - 13);
  // Track strips top/bottom
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(e.px + 2, e.py + 3, TS - 4, 4);
  ctx.fillRect(e.px + 2, e.py + TS - 7, TS - 4, 4);
  // Track links
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(e.px + 4 + i * 7, e.py + 3); ctx.lineTo(e.px + 4 + i * 7, e.py + 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.px + 4 + i * 7, e.py + TS - 7); ctx.lineTo(e.px + 4 + i * 7, e.py + TS - 3); ctx.stroke();
  }
  // Hull sheen
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(e.px + 4, e.py + 7, TS - 8, 3);
  // Turret
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.stroke();
  // Barrel
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bd; ctx.fillRect(1, -4, 8, 8);
  ctx.fillStyle = bc; ctx.fillRect(6, -1.5, 14, 3);
  ctx.restore();
}

function unitHarvester(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r + 1, r * 0.5);
  // Main hull (blocky)
  ctx.fillStyle = bd; ctx.fillRect(e.px + 3, e.py + 4, TS - 6, TS - 8);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(e.px + 3.5, e.py + 4.5, TS - 7, TS - 9);
  // Front scoop
  ctx.fillStyle = '#4a3a18';
  ctx.beginPath();
  ctx.moveTo(e.px + 3, e.py + 8); ctx.lineTo(e.px - 5, e.py + 7);
  ctx.lineTo(e.px - 5, e.py + TS - 7); ctx.lineTo(e.px + 3, e.py + TS - 8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7a6030'; ctx.lineWidth = 1; ctx.stroke();
  // Ore cargo indicator (right side)
  const oreF = (e.ore ?? 0) / (e.maxOre ?? 90);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.px + TS - 8, e.py + 6, 5, TS - 12);
  if (oreF > 0) {
    ctx.fillStyle = '#5aaa22';
    ctx.fillRect(e.px + TS - 8, e.py + 6 + (TS - 12) * (1 - oreF), 5, (TS - 12) * oreF);
  }
  // Exhaust stacks
  ctx.fillStyle = 'rgba(40,40,40,0.8)';
  ctx.fillRect(e.px + TS - 11, e.py + 5, 3, 6);
  ctx.fillRect(e.px + TS - 7, e.py + 5, 3, 6);
  // Hull highlight
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(e.px + 4, e.py + 5, TS - 13, 3);
}

function unitMcv(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r + 2, r * 0.5);
  // Wide hull body
  ctx.fillStyle = bd; ctx.fillRect(e.px + 1, e.py + 5, TS - 2, TS - 10);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.strokeRect(e.px + 1.5, e.py + 5.5, TS - 3, TS - 11);
  // Rear pack section
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(e.px + TS - 8, e.py + 7, 7, TS - 14);
  // Folded crane arm (top center)
  ctx.strokeStyle = bc; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(cx - 2, e.py + 5); ctx.lineTo(cx - 2, e.py - 2); ctx.lineTo(cx + 7, e.py - 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Satellite dish (rear-top)
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx + 5, e.py + 6); ctx.lineTo(cx + 10, e.py + 1); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 10, e.py, 4, Math.PI * 0.1, Math.PI * 1.0); ctx.stroke();
  // Hull sheen
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(e.px + 2, e.py + 6, TS - 11, 3);
}

function unitScout(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.9, r * 0.38);
  // Sleek hull
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(e.px + 5, e.py + 8); ctx.lineTo(e.px + TS - 3, e.py + 9);
  ctx.lineTo(e.px + TS - 3, e.py + TS - 9); ctx.lineTo(e.px + 5, e.py + TS - 8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Speed detail lines when moving
  if (e.state === 'moving') {
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.moveTo(e.px + 2, e.py + 12); ctx.lineTo(e.px - 4, e.py + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.px + 2, e.py + TS - 12); ctx.lineTo(e.px - 4, e.py + TS - 12); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Small turret
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(cx - 1, cy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); ctx.translate(cx - 1, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc; ctx.fillRect(3, -1, 12, 2);
  ctx.restore();
}

function unitAatrack(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r, r * 0.4);
  // Hull
  ctx.fillStyle = bd; ctx.fillRect(e.px + 3, e.py + 7, TS - 6, TS - 14);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px + 3.5, e.py + 7.5, TS - 7, TS - 15);
  // Radar box on roof
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 5, e.py + 7, 10, 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.strokeRect(cx - 4.5, e.py + 7.5, 9, 3);
  // Blink on radar
  ctx.fillStyle = tick % 24 < 12 ? bc : 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.arc(cx, e.py + 9, 1.5, 0, Math.PI * 2); ctx.fill();
  // Twin upward-angled barrels
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc;
  ctx.fillRect(2, -4.5, 13, 2.5);
  ctx.fillRect(2, 2, 13, 2.5);
  ctx.restore();
}

function unitArtillery(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r + 1, r * 0.38);
  // Long low hull
  ctx.fillStyle = bd; ctx.fillRect(e.px + 2, e.py + 8, TS - 4, TS - 16);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px + 2.5, e.py + 8.5, TS - 5, TS - 17);
  // Stabilizer legs when not moving
  if (e.state !== 'moving') {
    ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(e.px + 5, e.py + TS - 8); ctx.lineTo(e.px + 1, e.py + TS - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.px + TS - 5, e.py + TS - 8); ctx.lineTo(e.px + TS - 1, e.py + TS - 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Very long barrel
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bd; ctx.fillRect(0, -3, 8, 6);
  ctx.fillStyle = bc; ctx.fillRect(5, -1.5, 20, 3);
  ctx.restore();
}

function unitV2(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r, r * 0.38);
  // Compact hull
  ctx.fillStyle = bd; ctx.fillRect(e.px + 4, e.py + 8, TS - 8, TS - 16);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px + 4.5, e.py + 8.5, TS - 9, TS - 17);
  // Vertical rocket on back (upright missile)
  ctx.fillStyle = bc; ctx.fillRect(cx - 3, e.py + 2, 6, 14);
  // Rocket nose cone
  ctx.fillStyle = bc;
  ctx.beginPath();
  ctx.moveTo(cx - 3, e.py + 2); ctx.lineTo(cx, e.py - 3); ctx.lineTo(cx + 3, e.py + 2);
  ctx.closePath(); ctx.fill();
  // Rocket fins
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.moveTo(cx - 3, e.py + 14); ctx.lineTo(cx - 7, e.py + 18); ctx.lineTo(cx - 3, e.py + 18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 3, e.py + 14); ctx.lineTo(cx + 7, e.py + 18); ctx.lineTo(cx + 3, e.py + 18); ctx.closePath(); ctx.fill();
}

function unitTomahawk(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r, r * 0.38);
  // Sleek hull
  ctx.fillStyle = bd; ctx.fillRect(e.px + 3, e.py + 9, TS - 6, TS - 18);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px + 3.5, e.py + 9.5, TS - 7, TS - 19);
  // Launcher box on top-front
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(e.px + 8, e.py + 7, 12, 8);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.strokeRect(e.px + 8.5, e.py + 7.5, 11, 7);
  // Missile visible in slot
  ctx.fillStyle = bc; ctx.fillRect(e.px + 9, e.py + 9, 9, 3);
  // Barrel
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc; ctx.fillRect(2, -1, 14, 2);
  ctx.restore();
}

function unitFighter(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  // Ground shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 6, cy + 6, r + 2, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Elevated body
  const ay = cy - 14;
  ctx.save(); ctx.translate(cx, ay); ctx.rotate(e.facing + Math.PI / 2);
  // Delta wing body
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(0, -r);              // nose
  ctx.lineTo(r * 0.85, r * 0.65); // right wingtip
  ctx.lineTo(r * 0.25, r * 0.2);  // right body
  ctx.lineTo(0, r * 0.45);        // tail
  ctx.lineTo(-r * 0.25, r * 0.2); // left body
  ctx.lineTo(-r * 0.85, r * 0.65);// left wingtip
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Canopy
  ctx.fillStyle = 'rgba(150,220,255,0.45)';
  ctx.beginPath(); ctx.ellipse(0, -r * 0.28, r * 0.16, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  // Afterburner glow
  ctx.fillStyle = `rgba(255,160,40,0.75)`;
  ctx.beginPath(); ctx.ellipse(-r * 0.18, r * 0.55, r * 0.11, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.18, r * 0.55, r * 0.11, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function unitGunship(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 5, cy + 5, r + 3, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const ay = cy - 10;
  ctx.save(); ctx.translate(cx, ay); ctx.rotate(e.facing + Math.PI / 2);
  // Fuselage
  ctx.fillStyle = bd; ctx.fillRect(-r * 0.5, -r * 0.65, r, r * 1.3);
  ctx.beginPath(); ctx.arc(0, -r * 0.65, r * 0.5, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(-r * 0.5, -r * 0.65, r, r * 1.3);
  ctx.beginPath(); ctx.arc(0, -r * 0.65, r * 0.5, Math.PI, 0); ctx.stroke();
  // Weapon pods
  ctx.fillStyle = bc; ctx.globalAlpha = 0.6;
  ctx.fillRect(-r * 0.85, -r * 0.15, r * 0.3, r * 0.7);
  ctx.fillRect(r * 0.55, -r * 0.15, r * 0.3, r * 0.7);
  ctx.globalAlpha = 1;
  // Spinning rotor disc
  ctx.save(); ctx.rotate(tick * 0.2);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(-r * 1.0, 0); ctx.lineTo(r * 1.0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.lineTo(0, r * 1.0); ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();
  ctx.restore();
}

function unitDrone(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 3, cy + 3, r * 0.75, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const ay = cy - 8;
  ctx.save(); ctx.translate(cx, ay);
  // Four arms (rotate with facing so it looks intentional)
  ctx.save(); ctx.rotate(e.facing + Math.PI / 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.stroke();
    // Spinning rotor at arm tip
    ctx.save(); ctx.translate(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.rotate(tick * 0.3);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }
  ctx.restore();
  // Center disc
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.42, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Camera dot
  ctx.fillStyle = 'rgba(80,80,80,0.9)';
  ctx.beginPath(); ctx.arc(0, r * 0.1, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function unitRocketeer(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.8, r * 0.3);
  // Body
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Head
  ctx.fillStyle = bc;
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.55, r * 0.35, 0, Math.PI * 2); ctx.fill();
  // Rocket launcher (large tube)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc; ctx.fillRect(2, -3, r + 5, 5.5);
  ctx.strokeStyle = bd; ctx.lineWidth = 1;
  ctx.strokeRect(2.5, -2.5, r + 4, 4.5);
  ctx.restore();
  // Backpack
  ctx.fillStyle = bd;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillRect(-r * 0.3, 3, 5, 5);
  ctx.restore();
}

function unitInfantry(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.75, r * 0.28);
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = bc;
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.52, r * 0.33, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc; ctx.fillRect(2, -1.5, r + 3, 2.5);
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────

function renderParticles(ctx) {
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  for (const p of state.particles) {
    const life = Math.max(0, p.life);
    if (p.type === 'spark') {
      ctx.globalAlpha = life * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.max(0.1, life), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'flash') {
      ctx.globalAlpha = life * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.max(0.1, life), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = life * 0.38;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.5 - life * 0.5), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'debris') {
      ctx.globalAlpha = life * 0.85;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.angle ?? 0);
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Drag box ──────────────────────────────────────────────────────────────────

function renderDragBox(ctx) {
  if (!state.dragBox) return;
  const { x, y, w, h } = state.dragBox;
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  ctx.fillStyle = 'rgba(80,200,120,0.07)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(80,200,120,0.65)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

// ── Fog of war ────────────────────────────────────────────────────────────────

function renderFog(ctx, VW, VH) {
  if (!state.fog?.visible) return;
  const { cam } = state;
  const tsx = Math.max(0, (cam.x / TS) | 0);
  const tsy = Math.max(0, (cam.y / TS) | 0);
  const tex = Math.min(MW, tsx + (VW / TS | 0) + 2);
  const tey = Math.min(MH, tsy + (VH / TS | 0) + 2);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  for (let ty = tsy; ty < tey; ty++)
    for (let tx = tsx; tx < tex; tx++)
      if (!state.fog.explored[ty * MW + tx])
        ctx.rect(tx * TS, ty * TS, TS, TS);
  ctx.fill();
  ctx.globalAlpha = 0.62;
  ctx.beginPath();
  for (let ty = tsy; ty < tey; ty++)
    for (let tx = tsx; tx < tex; tx++) {
      const idx = ty * MW + tx;
      if (state.fog.explored[idx] && !state.fog.visible[idx])
        ctx.rect(tx * TS, ty * TS, TS, TS);
    }
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Shells ────────────────────────────────────────────────────────────────────

function renderShells(ctx) {
  if (!state.shells.length) return;
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  for (const sh of state.shells) {
    // Trail
    if (sh.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(sh.trail[0].x, sh.trail[0].y);
      for (let i = 1; i < sh.trail.length; i++) ctx.lineTo(sh.trail[i].x, sh.trail[i].y);
      ctx.lineTo(sh.x, sh.y);
      ctx.strokeStyle = sh.color;
      ctx.lineWidth = sh.type === 'gunship' ? 2.5 : 1.5;
      ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    }

    if (sh.type === 'v2rocket' || sh.type === 'tomahawk') {
      const ang = Math.atan2(sh.ty - sh.y, sh.tx - sh.x);
      ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(ang);
      ctx.fillStyle = sh.color;
      ctx.fillRect(-sh.r * 1.8, -sh.r * 0.5, sh.r * 3.5, sh.r);
      ctx.beginPath();
      ctx.moveTo(sh.r * 1.7, 0); ctx.lineTo(sh.r * 3.2, -sh.r * 0.45);
      ctx.lineTo(sh.r * 3.2, sh.r * 0.45); ctx.closePath(); ctx.fill();
      // Exhaust
      ctx.fillStyle = 'rgba(255,140,30,0.6)';
      ctx.beginPath(); ctx.arc(-sh.r * 1.8, 0, sh.r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (sh.type === 'artillery' || sh.type === 'gunship') {
      // Cannon ball with glint
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fillStyle = sh.color; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(sh.x - sh.r * 0.35, sh.y - sh.r * 0.35, sh.r * 0.35, 0, Math.PI * 2); ctx.fill();
    } else {
      // Generic projectile
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fillStyle = sh.color; ctx.fill();
    }
    // Glow halo
    ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = sh.color; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ── Victory announcement ──────────────────────────────────────────────────────

function renderVictoryAnnouncement(ctx, VW, VH) {
  const progress = 1 - state.gameOverDelay / 210;
  const isWin = !state.factionEliminated[state.playerFaction];
  const color = isWin ? '#4dff88' : '#ff6644';
  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.80, progress * 2.8)})`;
  ctx.fillRect(0, 0, VW, VH);
  if (progress < 0.07) return;
  const textAlpha = Math.min(1, (progress - 0.07) * 7);
  const pulse = 1 + Math.sin(progress * Math.PI * 5) * 0.025 * Math.max(0, 1 - progress * 1.5);
  ctx.save();
  ctx.translate(VW / 2, VH / 2 - 20); ctx.scale(pulse, pulse);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 88px monospace';
  ctx.globalAlpha = textAlpha;
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 50;
  ctx.fillText(isWin ? 'VICTORY' : 'DEFEAT', 0, 0);
  ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
  if (progress > 0.38) {
    const subAlpha = Math.min(1, (progress - 0.38) * 5) * textAlpha;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '16px monospace';
    ctx.fillStyle = `rgba(180,205,225,${subAlpha})`;
    ctx.fillText(
      isWin ? FDATA[state.playerFaction].name + ' wins the battle' : 'All structures destroyed',
      VW / 2, VH / 2 + 36
    );
    ctx.restore();
  }
}

// ── Minimap ───────────────────────────────────────────────────────────────────

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
  mmx.fillStyle = '#080c10'; mmx.fillRect(0, 0, mw, mh);
  for (let ty = 0; ty < MH; ty += 2)
    for (let tx = 0; tx < MW; tx += 2) {
      const fogIdx = ty * MW + tx;
      if (state.fog?.explored && !state.fog.explored[fogIdx]) continue;
      const t = state.map[ty][tx];
      if (t === T.GRASS) continue;
      const vis = !state.fog?.visible || state.fog.visible[fogIdx];
      mmx.globalAlpha = vis ? 1 : 0.35;
      mmx.fillStyle = t === T.WATER ? '#0e2235' : t === T.ORE ? '#2a5a18' : '#2a2820';
      mmx.fillRect(tx * sx, ty * sy, sx * 2 + 1, sy * 2 + 1);
    }
  mmx.globalAlpha = 1;
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e.faction !== pf && state.fog?.visible) {
      const etx = e.isBuilding ? (e.x + (e.w >> 1)) : e.x;
      const ety = e.isBuilding ? (e.y + (e.h >> 1)) : e.y;
      if (!state.fog.visible[ety * MW + etx]) continue;
    }
    mmx.fillStyle = FDATA[e.faction].color;
    if (e.isBuilding) mmx.fillRect(e.x * sx, e.y * sy, e.w * sx + 1, e.h * sy + 1);
    else mmx.fillRect(e.x * sx, e.y * sy, Math.max(2, sx), Math.max(2, sy));
  }
  const vx = state.cam.x / TS * sx, vy = state.cam.y / TS * sy;
  const vw = state.canvas.width / TS * sx, vh = state.canvas.height / TS * sy;
  mmx.strokeStyle = 'rgba(255,255,255,0.45)'; mmx.lineWidth = 1;
  mmx.strokeRect(vx, vy, vw, vh);
}
