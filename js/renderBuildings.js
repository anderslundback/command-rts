import { TS, MW, FDATA, BDEF } from './constants.js';
import { state } from './state.js';

export function renderBuildings(ctx, VW, VH) {
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

    if (isSel && e.dmg > 0 && e.range > 0) {
      const bcx = bx + bw / 2, bcy = by + bh / 2;
      ctx.beginPath(); ctx.arc(bcx, bcy, e.range * TS, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,80,80,0.22)'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

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
  // Drop shadow (skip for flat pad buildings)
  if (e.type !== 'depot') {
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(bx + 4, by + 4, bw, bh);
  }
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

// Service Depot — flat helipad-style service pad — 3×2 (96×64)
function bldDepot(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  // Flat concrete pad
  ctx.fillStyle = '#2c2a27';
  ctx.fillRect(bx, by, bw, bh);
  // Subtle surface sheen
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fillRect(bx, by, bw, 1);
  ctx.fillRect(bx, by, 1, bh);
  // Yellow hazard border
  const sw = 6;
  ctx.fillStyle = '#c49a00';
  ctx.fillRect(bx, by, bw, sw);
  ctx.fillRect(bx, by + bh - sw, bw, sw);
  ctx.fillRect(bx, by + sw, sw, bh - sw * 2);
  ctx.fillRect(bx + bw - sw, by + sw, sw, bh - sw * 2);
  // Black chevron stripes on border
  ctx.fillStyle = '#111'; ctx.globalAlpha = 0.45;
  const chevW = 10;
  for (let i = 0; i < Math.ceil(bw / chevW) + 1; i++) {
    ctx.fillRect(bx + i * chevW, by, chevW / 2, sw);
    ctx.fillRect(bx + i * chevW, by + bh - sw, chevW / 2, sw);
  }
  for (let j = 0; j < Math.ceil(bh / chevW) + 1; j++) {
    ctx.fillRect(bx, by + sw + j * chevW, sw, chevW / 2);
    ctx.fillRect(bx + bw - sw, by + sw + j * chevW, sw, chevW / 2);
  }
  ctx.globalAlpha = 1;
  // Large service circle
  const cr = Math.min(bw, bh) * 0.30;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.strokeStyle = '#c49a00'; ctx.lineWidth = 2.5; ctx.stroke();
  // Cross inside circle
  ctx.strokeStyle = '#c49a00'; ctx.lineWidth = 3; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(cx - cr * 0.65, cy); ctx.lineTo(cx + cr * 0.65, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - cr * 0.65); ctx.lineTo(cx, cy + cr * 0.65); ctx.stroke();
  ctx.globalAlpha = 1;
  // L-shaped corner markers
  const mSz = 8, iX = bx + sw + 3, iY = by + sw + 3, iX2 = bx + bw - sw - 3, iY2 = by + bh - sw - 3;
  ctx.fillStyle = '#c49a00'; ctx.globalAlpha = 0.8;
  for (const [mx, my, sx2, sy2] of [[iX, iY, 1, 1],[iX2, iY, -1, 1],[iX, iY2, 1, -1],[iX2, iY2, -1, -1]]) {
    ctx.fillRect(mx, my, sx2 * mSz, 2);
    ctx.fillRect(mx, my, 2, sy2 * mSz);
  }
  ctx.globalAlpha = 1;
  // Repair sparks when vehicle is on pad
  const occupied = state.entities.some(v =>
    !v.dead && v.isUnit && v.faction === e.faction &&
    v.x >= e.x && v.x < e.x + e.w && v.y >= e.y && v.y < e.y + e.h);
  if (occupied && e.done) {
    const sa = tick * 0.14;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = sa + (i / 4) * Math.PI * 2;
      const spx = cx + Math.cos(a) * cr * 0.5, spy = cy + Math.sin(a) * cr * 0.42;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(tick * 0.4 + i * 1.5);
      ctx.strokeStyle = '#88ffcc';
      ctx.beginPath();
      ctx.moveTo(spx - 3, spy - 3); ctx.lineTo(spx + 3, spy + 3);
      ctx.moveTo(spx + 3, spy - 3); ctx.lineTo(spx - 3, spy + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Status light
  const lit = occupied ? tick % 20 < 10 : tick % 60 < 8;
  ctx.fillStyle = occupied ? (lit ? '#44ff88' : '#092010') : (lit ? '#c49a00' : 'rgba(50,35,0,0.8)');
  ctx.beginPath(); ctx.arc(cx, by + sw - 1, 2.5, 0, Math.PI * 2); ctx.fill();
  // Selection outline
  ctx.strokeStyle = isSel ? '#fff' : bc;
  ctx.lineWidth = isSel ? 2.5 : 1.5;
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
