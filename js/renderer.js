import { TS, MW, MH, FDATA, BDEF, TILE_COLORS, T } from './constants.js';
import { state } from './state.js';
import { canPlace } from './placement.js';
import { renderBuildings } from './renderBuildings.js';
import { renderUnits } from './renderUnits.js';
import { hasPwr } from './resources.js';

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
  renderDamageNumbers(ctx);
  renderDragBox(ctx);
  if (state.gameOver && state.gameOverDelay > 0) renderVictoryAnnouncement(ctx, VW, VH);
  if (state.underAttackTimer > 0) {
    const pulse = 0.35 + 0.35 * Math.sin(Date.now() / 120);
    ctx.save();
    ctx.strokeStyle = `rgba(255,0,0,${pulse})`;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, VW - 6, VH - 6);
    ctx.restore();
  }
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

// ── Build preview & move indicators ──────────────────────────────────────────

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

function renderDamageNumbers(ctx) {
  if (!state.damageNumbers.length) return;
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  for (const d of state.damageNumbers) {
    ctx.globalAlpha = Math.max(0, 1 - d.age / 50);
    ctx.fillStyle = '#ff4444';
    ctx.fillText(d.val, d.x, d.y);
  }
  ctx.globalAlpha = 1;
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
      ctx.fillStyle = 'rgba(255,140,30,0.6)';
      ctx.beginPath(); ctx.arc(-sh.r * 1.8, 0, sh.r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (sh.type === 'artillery' || sh.type === 'gunship') {
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fillStyle = sh.color; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(sh.x - sh.r * 0.35, sh.y - sh.r * 0.35, sh.r * 0.35, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
      ctx.fillStyle = sh.color; ctx.fill();
    }
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
  const radarOnline = hasRadar && hasPwr(pf);
  if (!radarOnline) {
    const mmx = state.radarCtx, mw = state.radar.width, mh = state.radar.height;
    mmx.fillStyle = '#050810'; mmx.fillRect(0, 0, mw, mh);
    mmx.fillStyle = '#2a3a4a'; mmx.font = 'bold 11px monospace';
    mmx.textAlign = 'center'; mmx.textBaseline = 'middle';
    mmx.fillText(hasRadar ? 'RADAR OFFLINE' : 'NO RADAR', mw / 2, mh / 2); mmx.textAlign = 'left';
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
