import { TS, MW, FDATA, BDEF } from './constants.js';
import { state } from './state.js';

// hitFlash is an integer 0..8; precompute the flash tint strings once instead of per-building per-frame.
const FLASH_BC = [], FLASH_BD = [];
for (let h = 0; h <= 8; h++) {
  const flash = h / 8;
  FLASH_BC[h] = `rgb(255,${((1 - flash) * 60) | 0},${((1 - flash) * 30) | 0})`;
  FLASH_BD[h] = `rgb(${(140 + flash * 80) | 0},${((1 - flash) * 20) | 0},0)`;
}

// Oblique-projection iso helpers shared by all 2.5D buildings.
// Convention: back face shifts by (skewX, skewY) from front face → ~30° dimetric
// view showing south face + east face + roof. Footprint stays axis-aligned for
// hit-tests; the visible building is a parallelogram inscribed in the footprint.
const ISO_SKEW_X = -10;
const ISO_SKEW_Y = -14;

function isoCorners(bx, by, bw, bh, lInset, rInset, sInset, wallH) {
  const swX = bx + lInset, seX = bx + bw - rInset;
  const swY = by + bh - sInset, seY = swY;
  const nwX = swX + ISO_SKEW_X, nwY = swY + ISO_SKEW_Y;
  const neX = seX + ISO_SKEW_X, neY = seY + ISO_SKEW_Y;
  return {
    swX, swY, seX, seY, nwX, nwY, neX, neY,
    swTy: swY - wallH, seTy: seY - wallH,
    nwTy: nwY - wallH, neTy: neY - wallH,
    wallH, wallW: seX - swX,
    // Bilinear point on the roof parallelogram (u: W→E, v: S→N, both 0..1)
    roofPt(u, v) {
      return {
        x: swX + u * (seX - swX) + v * (nwX - swX),
        y: swY - wallH + u * (seY - swY) + v * (nwY - swY),
      };
    },
  };
}

// Draws shell: ground shadow + roof + east wall + plain front wall + pillars.
// Building-specific details (doors/windows/glow) layer on top of this.
function drawIsoShell(ctx, c, bc, bd) {
  // Ground shadow under footprint parallelogram
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.moveTo(c.swX - 1, c.swY + 3);
  ctx.lineTo(c.seX + 3, c.seY + 3);
  ctx.lineTo(c.neX + 3, c.neY + 2);
  ctx.lineTo(c.nwX - 1, c.nwY + 2);
  ctx.closePath(); ctx.fill();

  // Roof
  ctx.fillStyle = bc;
  ctx.beginPath();
  ctx.moveTo(c.swX, c.swTy); ctx.lineTo(c.seX, c.seTy);
  ctx.lineTo(c.neX, c.neTy); ctx.lineTo(c.nwX, c.nwTy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(c.swX, c.swTy, c.wallW, 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 0.5;
  for (let i = 1; i < 5; i++) {
    const u = i / 5;
    const ax = c.swX + u * (c.seX - c.swX), ay = c.swTy + u * (c.seY - c.swY);
    const bX = c.nwX + u * (c.neX - c.nwX), bY = c.nwTy + u * (c.neY - c.nwY);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bX, bY); ctx.stroke();
  }

  // East (right) wall — parallelogram, darkened
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(c.seX, c.seY); ctx.lineTo(c.neX, c.neY);
  ctx.lineTo(c.neX, c.neTy); ctx.lineTo(c.seX, c.seTy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.40)'; ctx.lineWidth = 0.75;
  for (let t = 0.25; t < 1; t += 0.25) {
    const sx = c.seX + t * (c.neX - c.seX);
    const sy = c.seY + t * (c.neY - c.seY);
    ctx.beginPath(); ctx.moveTo(sx, sy - 1); ctx.lineTo(sx, sy - c.wallH + 1); ctx.stroke();
  }

  // Front wall + corner pillars
  ctx.fillStyle = bd;
  ctx.fillRect(c.swX, c.swTy, c.wallW, c.wallH);
  ctx.fillStyle = bc;
  ctx.fillRect(c.swX, c.swTy, 3, c.wallH);
  ctx.fillRect(c.seX - 3, c.swTy, 3, c.wallH);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fillRect(c.swX, c.swTy, 1, c.wallH);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(c.seX - 1, c.swTy, 1, c.wallH);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(c.swX, c.swTy, c.wallW, 2);
}

function drawIsoSelection(ctx, c) {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.swX, c.swY); ctx.lineTo(c.seX, c.seY);
  ctx.lineTo(c.neX, c.neY); ctx.lineTo(c.nwX, c.nwY);
  ctx.closePath(); ctx.stroke();
}

// Vertical chimney/stack with cap, vent slits, and animated smoke.
// Rooted at a roof point (rooted via roofPt). smokeColor 'gray'|'dark'|'steam'.
function drawIsoStack(ctx, baseX, baseY, w, h, bc, bd, tick, smokeColor = 'dark', smokeSeed = 0) {
  const sx = baseX - w / 2, sTop = baseY - h;
  ctx.fillStyle = bd; ctx.fillRect(sx, sTop, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(sx, sTop, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.40)'; ctx.fillRect(sx + w - 1, sTop, 1, h);
  ctx.fillStyle = bc; ctx.fillRect(sx - 1, sTop - 2, w + 2, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(sx - 1, sTop - 2, w + 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const slits = Math.max(2, ((h - 4) / 5) | 0);
  for (let s = 0; s < slits; s++) ctx.fillRect(sx + 1, sTop + 4 + s * 5, w - 2, 1.5);
  const smA = 0.22 + 0.16 * Math.sin(tick * 0.07 + smokeSeed);
  const col = smokeColor === 'steam' ? '200,200,200' : '75,65,55';
  ctx.fillStyle = `rgba(${col},${smA})`;
  ctx.beginPath(); ctx.arc(sx + w / 2, sTop - 5, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(${col},${smA * 0.55})`;
  ctx.beginPath(); ctx.arc(sx + w / 2 + 3, sTop - 12, 7, 0, Math.PI * 2); ctx.fill();
}

// Bevel/extrusion overlay: NW highlight + SE shade strips on the building face,
// plus a thin "side wall" peeking out the south/east edges to fake height.
function paintBuildingBevel(ctx, bx, by, bw, bh) {
  // NW highlight (top + left, inside the face)
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(bx, by, bw, 1);
  ctx.fillRect(bx, by, 1, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
  ctx.fillRect(bx + 1, by + 1, 1, bh - 2);
  // SE shade (bottom + right, inside the face)
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(bx, by + bh - 1, bw, 1);
  ctx.fillRect(bx + bw - 1, by, 1, bh);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 1);
  ctx.fillRect(bx + bw - 2, by + 1, 1, bh - 2);
}

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
    const hf = e.hitFlash > 8 ? 8 : e.hitFlash;
    ctx.globalAlpha = alpha;

    drawBuilding(ctx, e, bx, by, bw, bh, fd, isSel, hf, tick);

    if (e.type === 'turret' || e.type === 'antiair') paintBuildingBevel(ctx, bx, by, bw, bh);

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

function drawBuilding(ctx, e, bx, by, bw, bh, fd, isSel, hf, tick) {
  const bc = hf > 0 ? FLASH_BC[hf] : fd.color;
  const bd = hf > 0 ? FLASH_BD[hf] : fd.dark;
  // Ground shadow under flat top-down buildings (turret/antiair)
  if (e.type === 'turret' || e.type === 'antiair') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(bx + 5, by + bh + 1, bw, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(bx + bw + 1, by + 5, 5, bh);
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
    case 'navalyard': bldNavalyard(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'turret':    bldTurret(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    case 'antiair':   bldAntiAir(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick); break;
    default:
      ctx.fillStyle = bd; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = isSel ? '#fff' : bc; ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
  }
}


// Command Center — 3×3 — iso shell + central command tower with antennas
function bldCommand(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 14, 6, 12, 30);
  drawIsoShell(ctx, c, bc, bd);

  // Vertical ribs on front wall
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let i = 12; i < c.wallW - 12; i += 10) {
    ctx.beginPath();
    ctx.moveTo(c.swX + i, c.swTy + 4); ctx.lineTo(c.swX + i, c.swY - 1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(c.swX + 4, c.swY - 2, c.wallW - 8, 2);

  // Main double-door at the centre of front wall
  const cFx = (c.swX + c.seX) / 2;
  const doorW = 30, doorH = 18;
  const doorX = cFx - doorW / 2, doorY = c.swY - doorH;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(doorX - 2, doorY - 2, doorW + 4, doorH + 2);
  ctx.fillStyle = bd;
  ctx.fillRect(doorX, doorY, doorW / 2 - 1, doorH);
  ctx.fillRect(doorX + doorW / 2 + 1, doorY, doorW / 2 - 1, doorH);
  ctx.fillStyle = bc; ctx.globalAlpha = 0.55;
  ctx.fillRect(doorX, doorY + doorH * 0.55, doorW / 2 - 1, 1);
  ctx.fillRect(doorX + doorW / 2 + 1, doorY + doorH * 0.55, doorW / 2 - 1, 1);
  ctx.globalAlpha = 1;
  ctx.fillStyle = bc;
  ctx.fillRect(doorX - 3, doorY - 4, doorW + 6, 3);

  // Windows flanking the door
  for (const wx of [c.swX + 6, c.seX - 14]) {
    ctx.fillStyle = 'rgba(120,180,210,0.32)';
    ctx.fillRect(wx, c.swTy + 6, 8, 8);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, c.swTy + 6.5, 7, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.moveTo(wx + 4, c.swTy + 6); ctx.lineTo(wx + 4, c.swTy + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, c.swTy + 10); ctx.lineTo(wx + 8, c.swTy + 10); ctx.stroke();
  }

  // Central command tower rising from the roof
  const towerBase = c.roofPt(0.5, 0.55);
  const twW = 28, twH = 26;
  const twX = towerBase.x - twW / 2;
  const twTop = towerBase.y - twH;
  ctx.fillStyle = bd;
  ctx.fillRect(twX, twTop + 8, twW, twH - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fillRect(twX, twTop + 8, 1, twH - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.fillRect(twX + twW - 1, twTop + 8, 1, twH - 8);
  // Glass observation deck (overhangs slightly)
  ctx.fillStyle = bc;
  ctx.fillRect(twX - 2, twTop, twW + 4, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(twX - 2, twTop, twW + 4, 1);
  ctx.fillStyle = 'rgba(120,180,210,0.55)';
  ctx.fillRect(twX - 1, twTop + 2, twW + 2, 5);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.75;
  ctx.strokeRect(twX - 0.5, twTop + 2.5, twW + 1, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (let i = 1; i < 5; i++) {
    const wx = twX - 1 + i * (twW + 2) / 5;
    ctx.beginPath(); ctx.moveTo(wx, twTop + 2); ctx.lineTo(wx, twTop + 7); ctx.stroke();
  }
  // Antennas with blinking lights
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  for (const mx of [twX + 5, twX + twW - 5]) {
    ctx.beginPath(); ctx.moveTo(mx, twTop); ctx.lineTo(mx, twTop - 12); ctx.stroke();
    ctx.fillStyle = bc;
    ctx.beginPath(); ctx.arc(mx, twTop - 13, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  if (tick % 30 < 15) {
    ctx.fillStyle = '#f64'; ctx.shadowColor = '#f64'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(twX + 5, twTop - 13, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(twX + twW - 5, twTop - 13, 2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Faction emblem on tower face
  ctx.fillStyle = bc; ctx.globalAlpha = 0.7;
  ctx.fillRect(twX + twW / 2 - 1, twTop + 12, 2, 12);
  ctx.fillRect(twX + twW / 2 - 6, twTop + 17, 12, 2);
  ctx.globalAlpha = 1;

  if (isSel) drawIsoSelection(ctx, c);
}

// Power Plant — 2×2 — iso shell + reactor glow on front + twin cooling towers
function bldPower(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 12, 6, 10, 22);
  drawIsoShell(ctx, c, bc, bd);

  // Vent panel on east wall
  const vbx = c.seX + 0.5 * (c.neX - c.seX);
  const vby = c.seY + 0.5 * (c.neY - c.seY);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(vbx - 3, vby - c.wallH + 6, 6, 8);
  ctx.fillStyle = 'rgba(255,235,140,0.20)';
  ctx.fillRect(vbx - 3, vby - c.wallH + 6, 6, 8);

  // Reactor core glowing through grille on front wall
  const cFx = (c.swX + c.seX) / 2;
  const cFy = c.swTy + c.wallH / 2;
  const pulse = 0.35 + 0.4 * (Math.sin(tick * 0.09) * 0.5 + 0.5);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cFx - 11, c.swTy + 4, 22, c.wallH - 6);
  ctx.fillStyle = `rgba(255,225,120,${pulse * 0.45})`;
  ctx.fillRect(cFx - 11, c.swTy + 4, 22, c.wallH - 6);
  ctx.fillStyle = `rgba(255,250,180,${pulse})`;
  ctx.shadowColor = '#ffe070'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cFx, cFy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 5; i++) ctx.fillRect(cFx - 11 + i * 5, c.swTy + 4, 1, c.wallH - 6);

  // Twin cooling towers
  for (const { u, v, seed } of [{ u: 0.22, v: 0.5, seed: 0 }, { u: 0.78, v: 0.5, seed: 1.7 }]) {
    const p = c.roofPt(u, v);
    drawIsoStack(ctx, p.x, p.y, 11, 30, bc, bd, tick, 'steam', seed);
  }

  if (isSel) drawIsoSelection(ctx, c);
}


// Refinery — 3×2 — iso shell + intake bay on front + processing silo on roof
function bldRefinery(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 14, 6, 10, 26);
  drawIsoShell(ctx, c, bc, bd);

  // Vertical ribs
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let i = 6; i < c.wallW - 6; i += 8) {
    ctx.beginPath();
    ctx.moveTo(c.swX + i, c.swTy + 4); ctx.lineTo(c.swX + i, c.swY - 1);
    ctx.stroke();
  }

  // Intake bay on left side of front wall (large dark mouth)
  const inX = c.swX + 4, inW = 26, inY = c.swTy + 3, inH = c.wallH - 4;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(inX, inY, inW, inH);
  ctx.fillStyle = 'rgba(60,140,40,0.35)';
  ctx.fillRect(inX, inY, inW, inH);
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(inX + 2, inY + 3 + i * (inH / 4), inW - 4, 2);
  }
  ctx.fillStyle = bc;
  ctx.fillRect(inX - 2, inY - 3, inW + 4, 3);

  // Processing tank/silo rising tall from the roof (right side)
  const tnkBase = c.roofPt(0.78, 0.5);
  const tnkW = 22, tnkH = 30;
  const tnkX = tnkBase.x - tnkW / 2;
  const tnkTop = tnkBase.y - tnkH;
  ctx.fillStyle = bd;
  ctx.fillRect(tnkX, tnkTop + 4, tnkW, tnkH - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(tnkX, tnkTop + 4, 1, tnkH - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(tnkX + tnkW - 1, tnkTop + 4, 1, tnkH - 4);
  ctx.fillStyle = bc;
  ctx.beginPath(); ctx.ellipse(tnkX + tnkW / 2, tnkTop + 4, tnkW / 2, 5, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(tnkX + tnkW / 2, tnkTop + 4, tnkW / 2, 5, 0, Math.PI, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = bd;
  ctx.fillRect(tnkX + tnkW / 2 - 2, tnkTop - 2, 4, 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tnkX, tnkTop + 14); ctx.lineTo(tnkX + tnkW, tnkTop + 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tnkX, tnkTop + 22); ctx.lineTo(tnkX + tnkW, tnkTop + 22); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tnkX, tnkTop + 13); ctx.lineTo(tnkX + tnkW, tnkTop + 13); ctx.stroke();
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(tnkX + 5, tnkTop + 25, tnkW - 10, 4);
  ctx.fillStyle = '#3a7a18';
  ctx.fillRect(tnkX + 6, tnkTop + 26, tnkW - 12, 2);
  ctx.fillStyle = '#5aaa28';
  ctx.fillRect(tnkX + 6, tnkTop + 26, (tnkW - 12) * 0.4, 2);

  // Two smoking chimneys on roof between bay and silo
  const chPts = [c.roofPt(0.42, 0.4), c.roofPt(0.55, 0.6)];
  for (let i = 0; i < chPts.length; i++) {
    drawIsoStack(ctx, chPts[i].x, chPts[i].y, 6, 18, bc, bd, tick, 'dark', i * 1.7);
  }

  if (isSel) drawIsoSelection(ctx, c);
}

// Barracks — 2×2 — iso shell with arched door (animated) and crenellated parapet
function bldBarracks(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 10, 6, 8, 26);
  drawIsoShell(ctx, c, bc, bd);

  // Brick pattern on front wall
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.5;
  for (let r = 0; r < 4; r++) {
    const ry = c.swTy + 4 + r * 6;
    ctx.beginPath(); ctx.moveTo(c.swX + 2, ry); ctx.lineTo(c.seX - 2, ry); ctx.stroke();
    const ox = (r % 2) * 8;
    for (let x = c.swX + 8 + ox; x < c.seX - 4; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + 6); ctx.stroke();
    }
  }

  // Crenellated parapet along front edge of roof
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5;
    const p = c.roofPt(u, 0.05);
    const mx = p.x - 4;
    ctx.fillStyle = bd; ctx.fillRect(mx, p.y - 6, 8, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(mx, p.y - 6, 8, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(mx + 7, p.y - 6, 1, 6);
  }

  // Side windows
  for (const wx of [c.swX + 4, c.seX - 12]) {
    ctx.fillStyle = 'rgba(120,180,210,0.32)';
    ctx.fillRect(wx, c.swTy + 6, 8, 10);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, c.swTy + 6.5, 7, 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.moveTo(wx, c.swTy + 11); ctx.lineTo(wx + 8, c.swTy + 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx + 4, c.swTy + 6); ctx.lineTo(wx + 4, c.swTy + 16); ctx.stroke();
  }

  // Arched entrance centred on front wall
  const cFx = (c.swX + c.seX) / 2;
  const archR = 9, doorH = c.wallH - 6;
  const doorY = c.swTy + 4;
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath(); ctx.arc(cFx, doorY + archR, archR, Math.PI, 0); ctx.fill();
  ctx.fillRect(cFx - archR, doorY + archR, archR * 2, doorH - archR);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cFx, doorY + archR, archR, Math.PI, 0); ctx.stroke();

  const trainRatio = e.trainQ?.length ? e.trainQ[0].t / e.trainQ[0].total : 0;
  const doorIsOpen = (e.doorEvent > 0 && tick - e.doorEvent < 60) || trainRatio >= 0.85;
  if (!doorIsOpen) {
    ctx.fillStyle = bd;
    ctx.fillRect(cFx - archR + 1, doorY + archR, archR - 1, doorH - archR - 1);
    ctx.fillRect(cFx, doorY + archR, archR - 1, doorH - archR - 1);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.55;
    ctx.strokeRect(cFx - archR + 1.5, doorY + archR + 0.5, archR - 2, doorH - archR - 2);
    ctx.strokeRect(cFx + 0.5, doorY + archR + 0.5, archR - 2, doorH - archR - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bc; ctx.globalAlpha = 0.65;
    ctx.fillRect(cFx - 3, doorY + archR + (doorH - archR) * 0.45, 2, 4);
    ctx.fillRect(cFx + 1, doorY + archR + (doorH - archR) * 0.45, 2, 4);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = 'rgba(255,200,80,0.22)';
    ctx.fillRect(cFx - archR + 1, doorY + archR, archR * 2 - 2, doorH - archR - 1);
    ctx.beginPath(); ctx.arc(cFx, doorY + archR, archR - 1, Math.PI, 0); ctx.fill();
    ctx.fillStyle = bd; ctx.globalAlpha = 0.7;
    ctx.fillRect(cFx - archR + 1, doorY + archR, 2, doorH - archR - 1);
    ctx.fillRect(cFx + archR - 3, doorY + archR, 2, doorH - archR - 1);
    ctx.globalAlpha = 1;
  }

  if (isSel) drawIsoSelection(ctx, c);
}

// War Factory — 3×2 — iso shell with bay door (animated), windows, stack + crane
function bldFactory(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 14, 6, 8, 28);
  drawIsoShell(ctx, c, bc, bd);

  // Vertical ribs across front wall (between door and pillars)
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
  for (let i = 6; i < c.wallW - 6; i += 7) {
    ctx.beginPath();
    ctx.moveTo(c.swX + i, c.swTy + 3); ctx.lineTo(c.swX + i, c.swY - 1);
    ctx.stroke();
  }
  // Floor trim
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(c.swX + 4, c.swY - 2, c.wallW - 8, 2);

  // Bay door (front face)
  const doorW = Math.min(46, c.wallW - 22), doorH = c.wallH - 6;
  const doorX = c.swX + (c.wallW - doorW) / 2, doorY = c.swTy + 3;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(doorX - 2, doorY - 2, doorW + 4, doorH + 2);
  ctx.fillStyle = '#161616';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  const trainRatio = e.trainQ?.length ? e.trainQ[0].t / e.trainQ[0].total : 0;
  const training = trainRatio >= 0.85 || (e.doorEvent > 0 && tick - e.doorEvent < 60);
  if (training) {
    ctx.fillStyle = 'rgba(255,180,40,0.22)';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = bd; ctx.fillRect(doorX, doorY, doorW, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(doorX, doorY + 5, doorW, 1);
    if (tick % 4 < 2) {
      ctx.fillStyle = 'rgba(255,230,90,0.85)';
      const sx = doorX + 6 + ((tick * 7) % (doorW - 12));
      ctx.fillRect(sx, doorY + doorH - 2, 2, 2);
    }
  } else {
    ctx.fillStyle = bd;
    for (let i = 0; i < 7; i++) ctx.fillRect(doorX + 1, doorY + 1 + i * 4, doorW - 2, 3);
    ctx.fillStyle = bc; ctx.globalAlpha = 0.6;
    ctx.fillRect(doorX + 2, doorY + doorH * 0.55, doorW - 4, 1.5);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = bc;
  ctx.fillRect(doorX - 3, doorY - 4, doorW + 6, 3);

  // Side windows
  for (const wx of [c.swX + 5, c.seX - 12]) {
    ctx.fillStyle = 'rgba(120,180,210,0.32)';
    ctx.fillRect(wx, c.swTy + 8, 7, 6);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, c.swTy + 8.5, 6, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.moveTo(wx + 3.5, c.swTy + 8); ctx.lineTo(wx + 3.5, c.swTy + 14); ctx.stroke();
  }

  // Exhaust stack on left-back of roof
  const stkBase = c.roofPt(0.15, 0.55);
  drawIsoStack(ctx, stkBase.x, stkBase.y, 8, 22, bc, bd, tick, 'dark', 0);

  // Crane gantry on right-back of roof
  const grBase = c.roofPt(0.82, 0.55);
  const grW = 22, grTop = grBase.y - 14;
  ctx.fillStyle = bd;
  ctx.fillRect(grBase.x - grW / 2, grTop, 4, 14);
  ctx.fillRect(grBase.x + grW / 2 - 4, grTop, 4, 14);
  ctx.fillStyle = bc;
  ctx.fillRect(grBase.x - grW / 2 - 2, grTop, grW + 4, 3);
  ctx.fillStyle = tick % 30 < 15 ? '#ff9900' : 'rgba(80,35,0,0.65)';
  ctx.shadowColor = '#ff9900'; ctx.shadowBlur = tick % 30 < 15 ? 4 : 0;
  ctx.beginPath(); ctx.arc(grBase.x, grTop - 2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  if (isSel) drawIsoSelection(ctx, c);
}


// Service Depot — 3×2 — open-front iso workshop with lift bay + tool rack
function bldDepot(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 12, 6, 8, 24);
  drawIsoShell(ctx, c, bc, bd);

  // Open service bay carved into the front wall — interior visible
  const bayW = c.wallW - 16, bayH = c.wallH - 4;
  const bayX = c.swX + 8, bayY = c.swTy + 2;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(bayX, bayY, bayW, bayH);
  // Frame/lintel above the bay
  ctx.fillStyle = bc;
  ctx.fillRect(bayX - 2, bayY - 3, bayW + 4, 3);

  // Hydraulic lift platform inside the bay
  const liftY = bayY + bayH - 6;
  ctx.fillStyle = '#4a3a18';
  ctx.fillRect(bayX + 4, liftY, bayW - 8, 5);
  ctx.fillStyle = '#c49a00';
  ctx.fillRect(bayX + 4, liftY, bayW - 8, 1);
  ctx.fillRect(bayX + 4, liftY + 4, bayW - 8, 1);
  // Hazard chevron edges on lift
  ctx.fillStyle = '#111';
  for (let i = 0; i < bayW - 8; i += 5) {
    ctx.fillRect(bayX + 4 + i, liftY, 2, 1);
    ctx.fillRect(bayX + 4 + i, liftY + 4, 2, 1);
  }
  // Hydraulic column rising from floor to lift
  const liftCx = bayX + bayW / 2;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(liftCx - 1.5, bayY + 5, 3, liftY - bayY - 4);

  // Tool rack across the back of the bay
  ctx.fillStyle = '#555';
  ctx.fillRect(bayX + 4, bayY + 3, bayW - 8, 2);
  for (let i = 0; i < 5; i++) {
    const tx = bayX + 6 + i * (bayW - 14) / 5;
    ctx.fillStyle = '#888';
    ctx.fillRect(tx, bayY + 5, 1, 3);
    ctx.fillRect(tx - 1, bayY + 8, 3, 1);
  }

  // Repair sparks when vehicle is being serviced
  const occupied = state.entities.some(v =>
    !v.dead && v.isUnit && v.faction === e.faction &&
    v.x >= e.x && v.x < e.x + e.w && v.y >= e.y && v.y < e.y + e.h);
  if (occupied && e.done) {
    const sa = tick * 0.14;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = sa + (i / 4) * Math.PI * 2;
      const spx = liftCx + Math.cos(a) * (bayW * 0.25);
      const spy = liftY - 3 + Math.sin(a) * 4;
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(tick * 0.4 + i * 1.5);
      ctx.strokeStyle = '#88ffcc';
      ctx.beginPath();
      ctx.moveTo(spx - 3, spy - 3); ctx.lineTo(spx + 3, spy + 3);
      ctx.moveTo(spx + 3, spy - 3); ctx.lineTo(spx - 3, spy + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Status light above the bay
  const lit = occupied ? tick % 20 < 10 : tick % 60 < 8;
  ctx.fillStyle = occupied ? (lit ? '#44ff88' : '#092010') : (lit ? '#c49a00' : 'rgba(50,35,0,0.8)');
  ctx.shadowColor = '#44ff88'; ctx.shadowBlur = lit && occupied ? 4 : 0;
  ctx.beginPath(); ctx.arc(bayX + bayW / 2, bayY - 6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Small rooftop vents (signal mechanical/utility nature)
  const v1 = c.roofPt(0.25, 0.5);
  const v2 = c.roofPt(0.75, 0.5);
  for (const p of [v1, v2]) {
    ctx.fillStyle = bd;
    ctx.fillRect(p.x - 3, p.y - 5, 6, 5);
    ctx.fillStyle = bc;
    ctx.fillRect(p.x - 4, p.y - 6, 8, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - 2, p.y - 3, 4, 1);
    ctx.fillRect(p.x - 2, p.y - 1, 4, 1);
  }

  if (isSel) drawIsoSelection(ctx, c);
}


// Radar — 2×2 — iso ops shack + tall lattice mast + spinning dish + pulse rings
function bldRadar(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 10, 6, 8, 22);
  drawIsoShell(ctx, c, bc, bd);

  // Door centred on front wall
  const cFx = (c.swX + c.seX) / 2;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cFx - 5, c.swTy + 4, 10, c.wallH - 4);
  ctx.fillStyle = bd;
  ctx.fillRect(cFx - 4, c.swTy + 5, 4, c.wallH - 6);
  ctx.fillRect(cFx, c.swTy + 5, 4, c.wallH - 6);
  ctx.fillStyle = bc; ctx.globalAlpha = 0.6;
  ctx.fillRect(cFx - 5, c.swTy + 4, 10, 1);
  ctx.globalAlpha = 1;
  // Side windows
  for (const wx of [c.swX + 5, c.seX - 12]) {
    ctx.fillStyle = 'rgba(120,180,210,0.32)';
    ctx.fillRect(wx, c.swTy + 5, 7, 6);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.75;
    ctx.strokeRect(wx + 0.5, c.swTy + 5.5, 6, 5);
  }

  // Lattice mast rising from roof centre (the structure the user liked)
  const mastBase = c.roofPt(0.5, 0.5);
  const mastH = 24, mastW = 8;
  const mTop = mastBase.y - mastH;
  const mX = mastBase.x - mastW / 2;
  ctx.fillStyle = bd;
  ctx.fillRect(mX, mTop, mastW, mastH);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(mX, mTop, 1, mastH);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(mX + mastW - 1, mTop, 1, mastH);
  // Cross-braces (the lattice X pattern)
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.55;
  for (let i = 0; i < 4; i++) {
    const cy_ = mTop + 3 + i * 5;
    ctx.beginPath(); ctx.moveTo(mX, cy_); ctx.lineTo(mX + mastW, cy_ + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mX + mastW, cy_); ctx.lineTo(mX, cy_ + 4); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Platform at mast top
  ctx.fillStyle = bc;
  ctx.fillRect(mastBase.x - 11, mTop - 3, 22, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(mastBase.x - 11, mTop - 3, 22, 1);

  // Spinning radar dish
  const dCY = mTop - 3;
  ctx.save(); ctx.translate(mastBase.x, dCY); ctx.rotate(tick * 0.04);
  ctx.strokeStyle = bc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI * 0.9, 0.05); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 9, -Math.PI * 0.75, -0.1); ctx.stroke();
  ctx.strokeStyle = bd; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 5); ctx.stroke();
  ctx.restore();

  // Signal pulse rings
  for (let i = 1; i <= 3; i++) {
    const pa = Math.max(0, (0.3 - i * 0.08) * (0.5 + 0.5 * Math.sin(tick * 0.1 + i * 1.2)));
    ctx.globalAlpha = pa; ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.arc(mastBase.x, dCY, 10 + i * 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Blinking LED on the roof corner
  const ledP = c.roofPt(0.12, 0.2);
  ctx.fillStyle = tick % 30 < 15 ? bc : 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(ledP.x, ledP.y - 1, 2, 0, Math.PI * 2); ctx.fill();

  if (isSel) drawIsoSelection(ctx, c);
}

// Airfield — 3×2 — iso hangar + control tower + runway markings on the apron
function bldAirfield(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 8, 4, 10, 24);
  // Custom shell — replace the front face's lower portion with runway tarmac
  drawIsoShell(ctx, c, bc, bd);

  // Tarmac strip overlaid on the iso ground projection (the parallelogram)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c.swX, c.swY); ctx.lineTo(c.seX, c.seY);
  ctx.lineTo(c.neX, c.neY); ctx.lineTo(c.nwX, c.nwY);
  ctx.closePath();
  ctx.clip();
  // Tarmac front strip
  ctx.fillStyle = '#353535';
  ctx.fillRect(c.swX, c.swY - 6, c.wallW, 6);
  ctx.restore();

  // Door + windows on the front wall (operations area)
  const cFx = (c.swX + c.seX) / 2;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cFx - 6, c.swTy + 4, 12, c.wallH - 4);
  ctx.fillStyle = bd;
  ctx.fillRect(cFx - 5, c.swTy + 5, 5, c.wallH - 6);
  ctx.fillRect(cFx, c.swTy + 5, 5, c.wallH - 6);
  ctx.fillStyle = bc; ctx.globalAlpha = 0.6;
  ctx.fillRect(cFx - 6, c.swTy + 4, 12, 1);
  ctx.globalAlpha = 1;
  // Two windows
  for (const wx of [c.swX + 5, c.seX - 13]) {
    ctx.fillStyle = 'rgba(120,180,210,0.32)';
    ctx.fillRect(wx, c.swTy + 6, 8, 6);
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.75;
    ctx.strokeRect(wx + 0.5, c.swTy + 6.5, 7, 5);
  }

  // Hangar bay door on right portion of front face
  const hgW = 26, hgH = c.wallH - 6;
  const hgX = c.seX - hgW - 4, hgY = c.swTy + 3;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(hgX - 2, hgY - 2, hgW + 4, hgH + 2);
  ctx.fillStyle = '#161616';
  ctx.fillRect(hgX, hgY, hgW, hgH);
  // Arch hint above hangar door
  ctx.fillStyle = bc;
  ctx.fillRect(hgX - 3, hgY - 4, hgW + 6, 3);
  ctx.fillStyle = bd;
  for (let i = 0; i < 6; i++) ctx.fillRect(hgX + 1, hgY + 1 + i * 4, hgW - 2, 3);
  // Lit interior (always — aircraft on standby)
  ctx.fillStyle = 'rgba(255,180,40,0.10)';
  ctx.fillRect(hgX + 1, hgY + hgH - 5, hgW - 2, 4);

  // Control tower rising tall from back-left of roof
  const towerBase = c.roofPt(0.15, 0.65);
  const twW = 14, twH = 30;
  const twX = towerBase.x - twW / 2;
  const twTop = towerBase.y - twH;
  ctx.fillStyle = bd;
  ctx.fillRect(twX, twTop + 9, twW, twH - 9);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(twX, twTop + 9, 1, twH - 9);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(twX + twW - 1, twTop + 9, 1, twH - 9);
  // Glass deck
  ctx.fillStyle = bc;
  ctx.fillRect(twX - 2, twTop, twW + 4, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(twX - 2, twTop, twW + 4, 1);
  ctx.fillStyle = 'rgba(120,180,210,0.55)';
  ctx.fillRect(twX - 1, twTop + 2, twW + 2, 6);
  ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.75;
  ctx.strokeRect(twX - 0.5, twTop + 2.5, twW + 1, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  for (let i = 1; i < 3; i++) {
    const wx = twX - 1 + i * (twW + 2) / 3;
    ctx.beginPath(); ctx.moveTo(wx, twTop + 2); ctx.lineTo(wx, twTop + 7); ctx.stroke();
  }
  // Antenna with beacon
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(twX + twW / 2, twTop); ctx.lineTo(twX + twW / 2, twTop - 10); ctx.stroke();
  ctx.fillStyle = tick % 30 < 15 ? '#f64' : 'rgba(80,0,0,0.5)';
  ctx.shadowColor = '#f64'; ctx.shadowBlur = tick % 30 < 15 ? 4 : 0;
  ctx.beginPath(); ctx.arc(twX + twW / 2, twTop - 11, 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Windsock on roof front-right
  const wsBase = c.roofPt(0.7, 0.4);
  ctx.strokeStyle = 'rgba(200,200,200,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(wsBase.x, wsBase.y); ctx.lineTo(wsBase.x, wsBase.y - 14); ctx.stroke();
  ctx.fillStyle = bc; ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(wsBase.x, wsBase.y - 12);
  ctx.lineTo(wsBase.x + 8, wsBase.y - 12);
  ctx.lineTo(wsBase.x + 1, wsBase.y - 8);
  ctx.lineTo(wsBase.x, wsBase.y - 8);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  if (isSel) drawIsoSelection(ctx, c);
}



// Naval Yard — 3×2 — iso dock platform on water + tall gantry crane + slip
function bldNavalyard(ctx, e, bx, by, bw, bh, fd, bc, bd, isSel, tick) {
  const c = isoCorners(bx, by, bw, bh, 8, 4, 6, 12);

  // Water ripples around the dock
  const rA = 0.10 + 0.06 * Math.sin(tick * 0.07);
  ctx.fillStyle = `rgba(80,160,220,${rA})`;
  for (let i = 0; i < 5; i++) {
    const wy = by + bh - 10 + i * 2 + Math.sin(tick * 0.05 + i) * 1;
    ctx.fillRect(bx, wy, bw, 1);
  }

  // Iso platform shell (low height — it's a dock, not a building)
  drawIsoShell(ctx, c, bc, bd);

  // Dock surface details on roof (planks running W→E)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.75;
  for (let i = 1; i < 4; i++) {
    const u = i / 4;
    const ax = c.swX + u * (c.nwX - c.swX);
    const ay = c.swTy + u * (c.nwY - c.swY);
    const bX = c.seX + u * (c.neX - c.seX);
    const bY = c.seTy + u * (c.neY - c.seY);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bX, bY); ctx.stroke();
  }

  // Dry-dock slip cut into the platform (dark cavity for ship construction)
  const slipSW = c.roofPt(0.25, 0.1);
  const slipSE = c.roofPt(0.75, 0.1);
  const slipNW = c.roofPt(0.25, 0.6);
  const slipNE = c.roofPt(0.75, 0.6);
  ctx.fillStyle = '#0e2235';
  ctx.beginPath();
  ctx.moveTo(slipSW.x, slipSW.y); ctx.lineTo(slipSE.x, slipSE.y);
  ctx.lineTo(slipNE.x, slipNE.y); ctx.lineTo(slipNW.x, slipNW.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.stroke();
  // Slip water shimmer line
  ctx.fillStyle = `rgba(80,160,220,${rA})`;
  ctx.fillRect(slipSW.x, slipSW.y - 4, slipSE.x - slipSW.x, 1);

  // Bollards on dock corners
  for (const p of [c.roofPt(0.1, 0.15), c.roofPt(0.9, 0.15), c.roofPt(0.1, 0.85), c.roofPt(0.9, 0.85)]) {
    ctx.fillStyle = bc;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 1, 0, Math.PI * 2); ctx.fill();
  }

  // Gantry crane towers at left & right of slip rising tall
  const gtH = 24;
  const tLBase = c.roofPt(0.18, 0.35);
  const tRBase = c.roofPt(0.82, 0.35);
  for (const tb of [tLBase, tRBase]) {
    const tx = tb.x - 3, tw = 6;
    const tTop = tb.y - gtH;
    ctx.fillStyle = bd; ctx.fillRect(tx, tTop, tw, gtH);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(tx, tTop, 1, gtH);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(tx + tw - 1, tTop, 1, gtH);
    // Lattice cross-braces
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 4; i++) {
      const cy_ = tTop + 3 + i * 5;
      ctx.beginPath(); ctx.moveTo(tx, cy_); ctx.lineTo(tx + tw, cy_ + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx + tw, cy_); ctx.lineTo(tx, cy_ + 4); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Beam between towers
  const beamY = Math.min(tLBase.y, tRBase.y) - gtH + 1;
  ctx.fillStyle = bc;
  ctx.fillRect(tLBase.x - 3, beamY, tRBase.x - tLBase.x + 6, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(tLBase.x - 3, beamY, tRBase.x - tLBase.x + 6, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(tLBase.x - 3, beamY + 4, tRBase.x - tLBase.x + 6, 1);
  // Hanging hook bobbing
  const hookCx = (tLBase.x + tRBase.x) / 2;
  const hookY = beamY + 6 + Math.sin(tick * 0.06) * 3;
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hookCx, beamY + 5); ctx.lineTo(hookCx, hookY); ctx.stroke();
  ctx.beginPath(); ctx.arc(hookCx + 3, hookY + 2, 3, 0, Math.PI); ctx.stroke();
  // Beacon
  ctx.fillStyle = tick % 30 < 15 ? '#ff9900' : 'rgba(80,35,0,0.65)';
  ctx.shadowColor = '#ff9900'; ctx.shadowBlur = tick % 30 < 15 ? 4 : 0;
  ctx.beginPath(); ctx.arc(hookCx, beamY - 2, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Small control shack on dock (back-left)
  const csBase = c.roofPt(0.12, 0.78);
  const csW = 12, csH = 10;
  const csX = csBase.x - csW / 2, csY = csBase.y - csH;
  ctx.fillStyle = bd; ctx.fillRect(csX, csY, csW, csH);
  ctx.fillStyle = bc; ctx.fillRect(csX, csY - 2, csW, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(csX, csY, 1, csH);
  ctx.fillStyle = 'rgba(120,180,210,0.45)';
  ctx.fillRect(csX + 2, csY + 2, csW - 4, 3);

  if (isSel) drawIsoSelection(ctx, c);
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
