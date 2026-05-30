import { TS, MW, FDATA } from './constants.js';
import { state } from './state.js';

// hitFlash is an integer 0..8; precompute the flash tint strings once instead of per-unit per-frame.
const FLASH_BC = [], FLASH_BD = [];
for (let h = 0; h <= 8; h++) {
  const flash = h / 8;
  FLASH_BC[h] = `rgb(255,${((1 - flash) * 60) | 0},${((1 - flash) * 30) | 0})`;
  FLASH_BD[h] = `rgb(${(130 + flash * 80) | 0},${((1 - flash) * 20) | 0},0)`;
}

// ── Iso projection (shared with renderBuildings) ────────────────────────────
// Back face shifts by (ISO_SKEW_X, ISO_SKEW_Y) per tile of world depth from the
// anchor. World y positive = south (toward viewer). Height (z) lifts in screen y.
const ISO_SKEW_X = -10;
const ISO_SKEW_Y = -14;
const ISO_DEPTH_REF = 32;
const SHADE_SE_FILL = 'rgba(0,0,0,0.32)';
const SHADE_SE_DARK = 'rgba(0,0,0,0.50)';
const LIGHT_NW_FILL = 'rgba(255,255,255,0.18)';

// World offset (dx, dy, dz) → screen offset relative to anchor.
function _iso(dx, dy, dz) {
  const depth = -dy / ISO_DEPTH_REF;
  return [dx + depth * ISO_SKEW_X, dy + depth * ISO_SKEW_Y - dz];
}

// Draws a rotated 3D box at (cx, cy). Local frame: +x = forward, +y = right, +z = up.
// Side faces facing toward the south-east camera are painted with a darkened fill.
// Returns the 4 top-face screen corners {tFL, tFR, tBR, tBL}.
function drawIsoBox(ctx, cx, cy, L, W, H, angle, topColor, sideColor) {
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const lL = L / 2, lW = W / 2;
  const project = (lx, ly, lz) => {
    const wx = cosA * lx - sinA * ly;
    const wy = sinA * lx + cosA * ly;
    const [sx, sy] = _iso(wx, wy, lz);
    return [cx + sx, cy + sy];
  };
  const c = {
    gFL: project(lL, -lW, 0), gFR: project(lL,  lW, 0),
    gBR: project(-lL, lW, 0), gBL: project(-lL, -lW, 0),
    tFL: project(lL, -lW, H), tFR: project(lL,  lW, H),
    tBR: project(-lL, lW, H), tBL: project(-lL, -lW, H),
  };
  // Visible side faces: a face is visible iff its world-outward normal points
  // toward the south-east camera, i.e., normal.x + normal.y > 0.
  // Front normal = (cosA, sinA); Right = (-sinA, cosA); Back = (-cosA, -sinA); Left = (sinA, -cosA).
  const faces = [
    [cosA + sinA, 'gFL', 'gFR', 'tFR', 'tFL'],
    [-sinA + cosA, 'gFR', 'gBR', 'tBR', 'tFR'],
    [-cosA - sinA, 'gBR', 'gBL', 'tBL', 'tBR'],
    [sinA - cosA, 'gBL', 'gFL', 'tFL', 'tBL'],
  ];
  for (const [vis, a, b, t2, t1] of faces) {
    if (vis <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(c[a][0], c[a][1]);
    ctx.lineTo(c[b][0], c[b][1]);
    ctx.lineTo(c[t2][0], c[t2][1]);
    ctx.lineTo(c[t1][0], c[t1][1]);
    ctx.closePath();
    ctx.fillStyle = sideColor; ctx.fill();
    ctx.fillStyle = SHADE_SE_FILL; ctx.fill();
  }
  // Top face
  ctx.beginPath();
  ctx.moveTo(c.tFL[0], c.tFL[1]);
  ctx.lineTo(c.tFR[0], c.tFR[1]);
  ctx.lineTo(c.tBR[0], c.tBR[1]);
  ctx.lineTo(c.tBL[0], c.tBL[1]);
  ctx.closePath();
  ctx.fillStyle = topColor; ctx.fill();
  // Eave shadow under roof along visible side edges (south + east edges in screen space)
  ctx.strokeStyle = SHADE_SE_DARK; ctx.lineWidth = 1;
  for (const [vis, , , t2, t1] of faces) {
    if (vis <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(c[t1][0], c[t1][1]);
    ctx.lineTo(c[t2][0], c[t2][1]);
    ctx.stroke();
  }
  // NW highlight on top edges whose midpoint is west or north of centre
  ctx.strokeStyle = LIGHT_NW_FILL; ctx.lineWidth = 1;
  const topEdges = [['tFL', 'tFR'], ['tFR', 'tBR'], ['tBR', 'tBL'], ['tBL', 'tFL']];
  for (const [a, b] of topEdges) {
    const mx = (c[a][0] + c[b][0]) / 2;
    const my = (c[a][1] + c[b][1]) / 2;
    if (mx > cx + 0.5 && my > cy + 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(c[a][0], c[a][1]);
    ctx.lineTo(c[b][0], c[b][1]);
    ctx.stroke();
  }
  return c;
}

function drawIsoGroundShadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Small ground parallelogram below the unit (not rotated). Matches the building
// selection style for visual cohesion.
function drawIsoSelectionRing(ctx, cx, cy, rx) {
  const halfW = rx + 3, halfD = (rx + 3) * 0.55;
  const [skewX, skewY] = [ISO_SKEW_X * (halfD / ISO_DEPTH_REF), ISO_SKEW_Y * (halfD / ISO_DEPTH_REF)];
  const swX = cx - halfW, swY = cy + halfD;
  const seX = cx + halfW, seY = cy + halfD;
  const nwX = cx - halfW + skewX * 2, nwY = cy - halfD + skewY * 2;
  const neX = cx + halfW + skewX * 2, neY = cy - halfD + skewY * 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(swX, swY);
  ctx.lineTo(seX, seY);
  ctx.lineTo(neX, neY);
  ctx.lineTo(nwX, nwY);
  ctx.closePath();
  ctx.stroke();
}

// World offset from unit centre (dx, dy, dz) → absolute screen point.
function _isoPt(cx, cy, dx, dy, dz) {
  const [sx, sy] = _iso(dx, dy, dz);
  return [cx + sx, cy + sy];
}

// Rotated point at z=H (top of chassis at local (lx, ly)) → absolute screen point.
function _topPt(cx, cy, lx, ly, H, cosA, sinA) {
  const wx = cosA * lx - sinA * ly;
  const wy = sinA * lx + cosA * ly;
  const [sx, sy] = _iso(wx, wy, H);
  return [cx + sx, cy + sy];
}

export function renderUnits(ctx, VW, VH) {
  const { cam, tick, selected } = state;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const e of state.entities) {
    if (!e.isUnit || e.loaded) continue;
    const cx = e.px + TS / 2, cy = e.py + TS / 2, r = TS * 0.35;
    const dr = (e.type === 'transport' || e.type === 'chinook') ? TS * 0.58 : r;
    if (cx + dr < cam.x || cx - dr > cam.x + VW || cy + dr < cam.y || cy - dr > cam.y + VH) continue;
    if (e.faction !== state.playerFaction && state.fog?.visible) {
      if (!state.fog.visible[e.y * MW + e.x]) continue;
    }

    const fd = FDATA[e.faction];
    const isSel = selected.includes(e.id);
    const hf = e.hitFlash > 8 ? 8 : e.hitFlash;
    const bc = hf > 0 ? FLASH_BC[hf] : fd.color;
    const bd = hf > 0 ? FLASH_BD[hf] : fd.dark;

    // Selection ring + attack range ring
    if (isSel) {
      drawIsoSelectionRing(ctx, cx, cy, dr);
      if (e.dmg > 0 && e.range > 0) {
        ctx.beginPath(); ctx.arc(cx, cy, e.range * TS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,80,80,0.22)'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
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
      case 'rocketeer':  unitRocketeer(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'engineer':   unitEngineer(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'medic':      unitMedic(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'mechanic':   unitMechanic(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'chinook':    unitChinook(ctx, e, cx, cy, dr, fd, bc, bd, tick); break;
      case 'cruiser':    unitCruiser(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'destroyer':  unitDestroyer(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'submarine':  unitSubmarine(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
      case 'transport':  unitTransport(ctx, e, cx, cy, dr, fd, bc, bd, tick); break;
      default:           unitInfantry(ctx, e, cx, cy, r, fd, bc, bd, tick); break;
    }

    // HP bar
    const hpF = e.hp / e.maxHp;
    ctx.fillStyle = '#111'; ctx.fillRect(e.px, e.py - 4, TS, 3);
    ctx.fillStyle = hpF > 0.5 ? '#4d8' : hpF > 0.25 ? '#fc4' : '#f44';
    ctx.fillRect(e.px, e.py - 4, TS * hpF, 3);

    // Cargo badge for transports
    if (e.type === 'transport' && e.capacity > 0 && e.cargo?.length > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.px + TS - 12, e.py + TS - 11, 11, 10);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(e.cargo.length + '/' + e.capacity, e.px + TS - 6.5, e.py + TS - 3);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
}

// Legacy alias — all unit renderers call _shadow which now routes to the iso version.
const _shadow = drawIsoGroundShadow;

function unitTank(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const chassis = e.chassisFacing ?? e.facing ?? 0;
  const aim = e.facing ?? chassis;
  _shadow(ctx, cx, cy, r + 1, r * 0.5);
  // Chassis 3D box (rotates with movement)
  drawIsoBox(ctx, cx, cy, 22, 16, 5, chassis, bd, bd);
  // Track strips along left/right sides of chassis
  const cosA = Math.cos(chassis), sinA = Math.sin(chassis);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
  for (const trackY of [-8, 8]) {
    const [ax, ay] = _topPt(cx, cy, 10, trackY, 5, cosA, sinA);
    const [bx, by] = _topPt(cx, cy, -10, trackY, 5, cosA, sinA);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 0.5;
  for (const trackY of [-8, 8]) {
    for (let i = -2; i <= 2; i++) {
      const [tx, ty] = _topPt(cx, cy, i * 5, trackY, 5, cosA, sinA);
      ctx.beginPath(); ctx.moveTo(tx - 1, ty - 1); ctx.lineTo(tx + 1, ty + 1); ctx.stroke();
    }
  }
  // Turret hub (raised above chassis); rotates independently with aim
  const [tcx, tcy] = _isoPt(cx, cy, 0, 0, 5);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(tcx, tcy - 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.25; ctx.stroke();
  ctx.save(); ctx.translate(tcx, tcy - 2); ctx.rotate(aim);
  ctx.fillStyle = bd; ctx.fillRect(1, -3.5, 7, 7);
  ctx.fillStyle = bc; ctx.fillRect(5, -1.5, 14, 3);
  ctx.restore();
}

function unitHarvester(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  _shadow(ctx, cx, cy, r + 2, r * 0.5);

  // Animation phases (cosmetic — driven by event ticks set in units.js)
  const SCOOP_DUR = 30, DUMP_DUR = 40;
  const scoopAge = e.scoopEvent > 0 ? tick - e.scoopEvent : 1e9;
  const dumpAge  = e.dumpEvent  > 0 ? tick - e.dumpEvent  : 1e9;
  const scoopP = scoopAge < SCOOP_DUR ? scoopAge / SCOOP_DUR : 1; // 0→1 over pickup
  const dumpP  = dumpAge  < DUMP_DUR  ? dumpAge  / DUMP_DUR  : 1;  // 0→1 over dump
  // Bed tilt: rises in first half, holds, falls in last quarter. Peaks at ~mid-dump.
  let tilt = 0;
  if (dumpAge < DUMP_DUR) {
    if (dumpP < 0.5) tilt = dumpP * 2;
    else if (dumpP < 0.75) tilt = 1;
    else tilt = 1 - (dumpP - 0.75) * 4;
  }
  const tiltH = tilt * 8; // extra Z lift at the back of the bed

  // ── Bed (rear cargo hopper) ────────────────────────────────────────────────
  // Drawn as a tilted parallelogram: front corners stay at bed-floor height, back
  // corners rise by tiltH when dumping. This sells the garbage-truck tipping motion.
  const bedFrontX = -2, bedBackX = -13;
  const bedHalfW = 8, bedFloorH = 4, bedSideH = 8;
  // Front-floor corners (always at floor height)
  const [bfFLx, bfFLy] = _topPt(cx, cy, bedFrontX, -bedHalfW, bedFloorH, cosA, sinA);
  const [bfFRx, bfFRy] = _topPt(cx, cy, bedFrontX,  bedHalfW, bedFloorH, cosA, sinA);
  // Back-floor corners (raised by tiltH)
  const [bfBLx, bfBLy] = _topPt(cx, cy, bedBackX, -bedHalfW, bedFloorH + tiltH, cosA, sinA);
  const [bfBRx, bfBRy] = _topPt(cx, cy, bedBackX,  bedHalfW, bedFloorH + tiltH, cosA, sinA);
  // Top corners of bed walls (add wall height to each floor corner)
  const [btFLx, btFLy] = _topPt(cx, cy, bedFrontX, -bedHalfW, bedFloorH + bedSideH, cosA, sinA);
  const [btFRx, btFRy] = _topPt(cx, cy, bedFrontX,  bedHalfW, bedFloorH + bedSideH, cosA, sinA);
  const [btBLx, btBLy] = _topPt(cx, cy, bedBackX, -bedHalfW, bedFloorH + bedSideH + tiltH, cosA, sinA);
  const [btBRx, btBRy] = _topPt(cx, cy, bedBackX,  bedHalfW, bedFloorH + bedSideH + tiltH, cosA, sinA);

  // Side wall (visible east face of bed)
  const eastVisible = -sinA + cosA > 0;
  if (eastVisible) {
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(bfFRx, bfFRy); ctx.lineTo(bfBRx, bfBRy);
    ctx.lineTo(btBRx, btBRy); ctx.lineTo(btFRx, btFRy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE_SE_FILL; ctx.fill();
  }
  // Back wall (visible when facing places the rear toward camera)
  const backVisible = -cosA - sinA > 0;
  if (backVisible) {
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(bfBLx, bfBLy); ctx.lineTo(bfBRx, bfBRy);
    ctx.lineTo(btBRx, btBRy); ctx.lineTo(btBLx, btBLy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE_SE_FILL; ctx.fill();
  }
  // Front wall (toward cab)
  const frontVisible = cosA + sinA > 0;
  if (frontVisible) {
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(bfFLx, bfFLy); ctx.lineTo(bfFRx, bfFRy);
    ctx.lineTo(btFRx, btFRy); ctx.lineTo(btFLx, btFLy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE_SE_FILL; ctx.fill();
  }
  // West wall (left side of bed)
  const westVisible = sinA - cosA > 0;
  if (westVisible) {
    ctx.fillStyle = bd;
    ctx.beginPath();
    ctx.moveTo(bfFLx, bfFLy); ctx.lineTo(bfBLx, bfBLy);
    ctx.lineTo(btBLx, btBLy); ctx.lineTo(btFLx, btFLy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SHADE_SE_FILL; ctx.fill();
  }
  // Bed floor (top face) — shows ore pile inside, also tilted
  ctx.fillStyle = bc;
  ctx.beginPath();
  ctx.moveTo(btFLx, btFLy); ctx.lineTo(btFRx, btFRy);
  ctx.lineTo(btBRx, btBRy); ctx.lineTo(btBLx, btBLy);
  ctx.closePath(); ctx.fill();
  // Ore pile inside bed (tinted darker so it reads as ore, scaled by current load)
  const oreF = (e.ore ?? 0) / (e.maxOre ?? 90);
  if (oreF > 0 && tilt < 0.9) {
    const inset = 1.5;
    const oreA = 0.65 * (1 - tilt);
    ctx.fillStyle = `rgba(90,170,40,${oreA})`;
    // Interpolate inner corners
    const ix = (a, b, t) => a + (b - a) * t;
    const inFL = [ix(btFLx, btFRx, inset / (bedHalfW * 2)), ix(btFLy, btFRy, inset / (bedHalfW * 2))];
    const inFR = [ix(btFRx, btFLx, inset / (bedHalfW * 2)), ix(btFRy, btFLy, inset / (bedHalfW * 2))];
    const inBL = [ix(btBLx, btBRx, inset / (bedHalfW * 2)), ix(btBLy, btBRy, inset / (bedHalfW * 2))];
    const inBR = [ix(btBRx, btBLx, inset / (bedHalfW * 2)), ix(btBRy, btBLy, inset / (bedHalfW * 2))];
    ctx.beginPath();
    ctx.moveTo(inFL[0], inFL[1]); ctx.lineTo(inFR[0], inFR[1]);
    ctx.lineTo(inBR[0], inBR[1]); ctx.lineTo(inBL[0], inBL[1]);
    ctx.closePath(); ctx.fill();
  }
  // Bed front-edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(btFLx, btFLy); ctx.lineTo(btFRx, btFRy); ctx.stroke();

  // Falling ore particles during dump (visible at the back of the tilted bed)
  if (dumpAge < DUMP_DUR && dumpP > 0.3 && dumpP < 0.85) {
    const [pBaseX, pBaseY] = _topPt(cx, cy, bedBackX - 2, 0, bedFloorH + tiltH, cosA, sinA);
    ctx.fillStyle = 'rgba(90,170,40,0.85)';
    for (let i = 0; i < 4; i++) {
      const t = ((dumpAge * 1.5 + i * 7) % 20) / 20;
      const px = pBaseX - 4 + (i - 1.5) * 2;
      const py = pBaseY + t * 14 - 4;
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Cab (driver compartment at the front) ─────────────────────────────────
  drawIsoBox(ctx, cx, cy, 10, 14, 9, facing, bd, bd);
  // Windshield tint on front face of cab — drawn in rotated local frame
  const [wcx, wcy] = _isoPt(cx, cy, 0, 0, 9);
  ctx.save(); ctx.translate(wcx, wcy); ctx.rotate(facing);
  ctx.fillStyle = 'rgba(150,210,240,0.45)';
  ctx.fillRect(3, -5, 3, 10);
  ctx.restore();
  // Exhaust stack rising from cab roof
  const [exX, exY] = _topPt(cx, cy, 2, -5, 9, cosA, sinA);
  ctx.fillStyle = 'rgba(40,40,40,0.85)';
  ctx.fillRect(exX - 1, exY - 6, 2.5, 6);
  ctx.fillStyle = 'rgba(60,60,60,0.6)';
  ctx.beginPath(); ctx.arc(exX, exY - 7, 2, 0, Math.PI * 2); ctx.fill();
  // Idle exhaust puff
  if (tick % 30 < 15) {
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(exX + 1, exY - 10, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Scoop arm at the front ────────────────────────────────────────────────
  // The arm hangs forward off the cab; during pickup it lowers and sweeps then
  // returns. Angle 0 = horizontal forward; -π/2 = pointing straight down.
  let armAngle = -0.3; // resting position (slightly raised)
  if (scoopAge < SCOOP_DUR) {
    // Sweep: 0..0.4 lower, 0.4..0.7 dig (low), 0.7..1 raise
    if (scoopP < 0.4) armAngle = -0.3 - scoopP * 2.5;
    else if (scoopP < 0.7) armAngle = -1.3 + Math.sin(scoopP * 30) * 0.1;
    else armAngle = -1.3 + (scoopP - 0.7) * 3.3;
  }
  const armPivotL = 8; // local x on the cab front where the arm pivots
  const [pvX, pvY] = _topPt(cx, cy, armPivotL, 0, 6, cosA, sinA);
  // Arm extends forward in the cab's local frame, but pitches DOWN in world Z by armAngle
  const armLen = 9;
  const armEndLocalX = armPivotL + Math.cos(armAngle) * armLen;
  const armEndZ = 6 + Math.sin(armAngle) * armLen;
  const [aeX, aeY] = _topPt(cx, cy, armEndLocalX, 0, armEndZ, cosA, sinA);
  // Arm shaft
  ctx.strokeStyle = '#4a3a18'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(pvX, pvY); ctx.lineTo(aeX, aeY); ctx.stroke();
  ctx.strokeStyle = '#7a6030'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pvX, pvY); ctx.lineTo(aeX, aeY); ctx.stroke();
  // Scoop bucket at arm tip
  ctx.save(); ctx.translate(aeX, aeY); ctx.rotate(facing);
  ctx.fillStyle = '#4a3a18';
  ctx.beginPath();
  ctx.moveTo(-2, -3); ctx.lineTo(4, -3); ctx.lineTo(5, 3); ctx.lineTo(-2, 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7a6030'; ctx.lineWidth = 1; ctx.stroke();
  // Bucket teeth
  ctx.fillStyle = '#999';
  for (let i = 0; i < 3; i++) ctx.fillRect(3 + i * 0.5, -2 + i * 1.5, 1, 1);
  ctx.restore();

  // Dust kicked up while digging (mid-scoop)
  if (scoopAge < SCOOP_DUR && scoopP > 0.35 && scoopP < 0.7) {
    ctx.fillStyle = 'rgba(140,120,80,0.45)';
    for (let i = 0; i < 4; i++) {
      const t = ((scoopAge + i * 3) % 12) / 12;
      const px = aeX + (i - 1.5) * 2.5;
      const py = aeY + 1 - t * 5;
      ctx.beginPath(); ctx.arc(px, py, 2 - t * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function unitMcv(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  _shadow(ctx, cx, cy, r + 3, r * 0.55);
  // Big wide chassis
  drawIsoBox(ctx, cx, cy, 26, 20, 7, facing, bd, bd);
  // Rear utility pack (smaller box on top, aft of centre)
  const [packCx, packCy] = _topPt(cx, cy, -8, 0, 7, cosA, sinA);
  ctx.save();
  ctx.translate(packCx, packCy);
  ctx.rotate(facing);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-4, -7, 8, 14);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
  ctx.strokeRect(-3.5, -6.5, 7, 13);
  ctx.restore();
  // Folded crane arm rising from top-centre
  const [crBx, crBy] = _topPt(cx, cy, 0, 0, 7, cosA, sinA);
  ctx.strokeStyle = bc; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(crBx, crBy);
  ctx.lineTo(crBx - 1, crBy - 8);
  ctx.lineTo(crBx + 8, crBy - 9);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Satellite dish on the rear-top
  const [dsBx, dsBy] = _topPt(cx, cy, -10, -2, 7, cosA, sinA);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(dsBx, dsBy); ctx.lineTo(dsBx + 4, dsBy - 6); ctx.stroke();
  ctx.beginPath(); ctx.arc(dsBx + 4, dsBy - 6, 3.5, Math.PI * 0.1, Math.PI * 1.0); ctx.stroke();
}

function unitScout(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const chassis = e.chassisFacing ?? e.facing ?? 0;
  const aim = e.facing ?? chassis;
  _shadow(ctx, cx, cy, r, r * 0.4);
  drawIsoBox(ctx, cx, cy, 20, 12, 4, chassis, bd, bd);
  // Speed detail lines trail aft of chassis when moving
  if (e.state === 'moving') {
    const cosA = Math.cos(chassis), sinA = Math.sin(chassis);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.28;
    for (const sy of [-4, 4]) {
      const [aX, aY] = _topPt(cx, cy, -10, sy, 4, cosA, sinA);
      const [bX, bY] = _topPt(cx, cy, -16, sy, 4, cosA, sinA);
      ctx.beginPath(); ctx.moveTo(aX, aY); ctx.lineTo(bX, bY); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Small turret tracks aim
  const [tcx, tcy] = _isoPt(cx, cy, 2, 0, 4);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(tcx, tcy - 1, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); ctx.translate(tcx, tcy - 1); ctx.rotate(aim);
  ctx.fillStyle = bc; ctx.fillRect(2, -1, 12, 2);
  ctx.restore();
}

function unitAatrack(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const chassis = e.chassisFacing ?? e.facing ?? 0;
  const aim = e.facing ?? chassis;
  _shadow(ctx, cx, cy, r, r * 0.42);
  drawIsoBox(ctx, cx, cy, 20, 15, 5, chassis, bd, bd);
  // Radar box on roof rotates with chassis
  const [rcx, rcy] = _isoPt(cx, cy, 0, 0, 5);
  ctx.save(); ctx.translate(rcx, rcy - 1); ctx.rotate(chassis);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-5, -2, 10, 4);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
  ctx.strokeRect(-4.5, -1.5, 9, 3);
  ctx.fillStyle = tick % 24 < 12 ? bc : 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Twin barrels track aim
  ctx.save(); ctx.translate(rcx, rcy - 2); ctx.rotate(aim);
  ctx.fillStyle = bc;
  ctx.fillRect(2, -4, 13, 2.5);
  ctx.fillRect(2, 1.5, 13, 2.5);
  ctx.restore();
}

function unitArtillery(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const chassis = e.chassisFacing ?? e.facing ?? 0;
  const aim = e.facing ?? chassis;
  const cosA = Math.cos(chassis), sinA = Math.sin(chassis);
  _shadow(ctx, cx, cy, r + 1, r * 0.38);
  drawIsoBox(ctx, cx, cy, 26, 12, 4, chassis, bd, bd);
  // Stabilizer legs deploy at the rear corners when idle
  if (e.state !== 'moving') {
    ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
    for (const ly of [-6, 6]) {
      const [hx, hy] = _topPt(cx, cy, -13, ly, 0, cosA, sinA);
      const out = ly < 0 ? -1 : 1;
      const [tx, ty] = _topPt(cx, cy, -16, ly + 4 * out, 0, cosA, sinA);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Long barrel tracks aim
  const [tcx, tcy] = _isoPt(cx, cy, 0, 0, 4);
  ctx.save(); ctx.translate(tcx, tcy - 1); ctx.rotate(aim);
  ctx.fillStyle = bd; ctx.fillRect(-1, -3, 9, 6);
  ctx.fillStyle = bc; ctx.fillRect(5, -1.5, 22, 3);
  ctx.restore();
}

function unitV2(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  _shadow(ctx, cx, cy, r, r * 0.42);
  // Compact chassis
  drawIsoBox(ctx, cx, cy, 20, 14, 5, facing, bd, bd);
  // Upright rocket sitting on top — world-vertical (no facing skew applied to rocket)
  const [rcx, rcy] = _isoPt(cx, cy, 0, 0, 5);
  ctx.fillStyle = bc;
  ctx.fillRect(rcx - 3, rcy - 14, 6, 14);
  // Nose cone
  ctx.beginPath();
  ctx.moveTo(rcx - 3, rcy - 14); ctx.lineTo(rcx, rcy - 19); ctx.lineTo(rcx + 3, rcy - 14);
  ctx.closePath(); ctx.fill();
  // Fins (rotate with chassis facing so they look like they belong)
  ctx.save(); ctx.translate(rcx, rcy); ctx.rotate(facing);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(-7, 1); ctx.lineTo(-2, 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(7, 1); ctx.lineTo(2, 1); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Side highlight on rocket body
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(rcx - 3, rcy - 14, 1, 14);
}

function unitTomahawk(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  const chassis = e.chassisFacing ?? e.facing ?? 0;
  const aim = e.facing ?? chassis;
  const cosA = Math.cos(chassis), sinA = Math.sin(chassis);
  _shadow(ctx, cx, cy, r, r * 0.42);
  drawIsoBox(ctx, cx, cy, 22, 13, 4, chassis, bd, bd);
  // Launcher box mounted on chassis (rotates with chassis)
  const [lcx, lcy] = _topPt(cx, cy, 3, 0, 4, cosA, sinA);
  ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(chassis);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-5, -4, 12, 8);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(-4.5, -3.5, 11, 7);
  ctx.fillStyle = bc;
  ctx.fillRect(-4, -1.5, 9, 3);
  ctx.restore();
  // Short barrel tracks aim
  const [tcx, tcy] = _isoPt(cx, cy, 0, 0, 4);
  ctx.save(); ctx.translate(tcx, tcy - 1); ctx.rotate(aim);
  ctx.fillStyle = bc; ctx.fillRect(2, -1, 14, 2);
  ctx.restore();
}

function unitFighter(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  // Ground shadow (on the ground, not lifted)
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 6, cy + 6, r + 2, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Lifted iso fuselage as a 3D box (facing+π/2 to match the +y-forward sprite convention)
  const facing = (e.facing ?? 0) + Math.PI / 2;
  const ay = cy - 14;
  drawIsoBox(ctx, cx, ay, r * 1.4, r * 0.55, 2, facing, bd, bd);
  // Delta-wing overlay on top — drawn in the rotated local frame at z=2
  const [tcx, tcy] = _isoPt(cx, ay, 0, 0, 2);
  ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
  // Wings (translucent so iso box silhouette shows through)
  ctx.fillStyle = bd; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(r * 0.7, 0);
  ctx.lineTo(r * 0.1, r * 0.85); ctx.lineTo(-r * 0.15, r * 0.25);
  ctx.lineTo(-r * 0.6, 0);
  ctx.lineTo(-r * 0.15, -r * 0.25); ctx.lineTo(r * 0.1, -r * 0.85);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha = 1;
  // Canopy near the nose
  ctx.fillStyle = 'rgba(150,220,255,0.55)';
  ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 0.16, r * 0.10, 0, 0, Math.PI * 2); ctx.fill();
  // Afterburner glow at the tail
  ctx.fillStyle = 'rgba(255,160,40,0.80)';
  ctx.beginPath(); ctx.ellipse(-r * 0.55, -r * 0.13, r * 0.10, r * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-r * 0.55, r * 0.13, r * 0.10, r * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function unitGunship(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 5, cy + 5, r + 3, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const facing = (e.facing ?? 0) + Math.PI / 2;
  const ay = cy - 10;
  // Lifted fuselage
  drawIsoBox(ctx, cx, ay, r * 1.4, r * 0.85, 4, facing, bd, bd);
  // Dome nose on top of front
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  const [noseX, noseY] = _topPt(cx, ay, r * 0.7, 0, 4, cosA, sinA);
  ctx.save(); ctx.translate(noseX, noseY); ctx.rotate(facing);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.4, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.4, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.restore();
  // Weapon pods on the wings
  const [tcx, tcy] = _isoPt(cx, ay, 0, 0, 4);
  ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
  ctx.fillStyle = bc; ctx.globalAlpha = 0.65;
  ctx.fillRect(-r * 0.2, -r * 0.95, r * 0.45, r * 0.25);
  ctx.fillRect(-r * 0.2,  r * 0.7,  r * 0.45, r * 0.25);
  ctx.globalAlpha = 1;
  ctx.restore();
  // Spinning rotor disc above the fuselage
  ctx.save(); ctx.translate(tcx, tcy - 2); ctx.rotate(tick * 0.2);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(-r * 1.0, 0); ctx.lineTo(r * 1.0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.lineTo(0, r * 1.0); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function unitDrone(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 3, cy + 3, r * 0.75, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const facing = (e.facing ?? 0) + Math.PI / 4;
  const ay = cy - 8;
  // Center body as small iso box
  drawIsoBox(ctx, cx, ay, r * 0.7, r * 0.7, 2, facing, bd, bd);
  // Arms + rotors radiating from centre (rotated in local frame so arms cross diagonally)
  const [tcx, tcy] = _isoPt(cx, ay, 0, 0, 2);
  ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.30, Math.sin(a) * r * 0.30);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.stroke();
    // Spinning rotor at arm tip
    ctx.save(); ctx.translate(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.rotate(tick * 0.3);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
    ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  }
  // Camera dot on front face
  ctx.fillStyle = 'rgba(80,80,80,0.9)';
  ctx.beginPath(); ctx.arc(r * 0.18, 0, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Apply NW highlight + SE shading to an infantry body circle. Light from upper-left.
function _infantryShading(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, -Math.PI * 0.25); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.05, Math.PI * 0.85); ctx.fill();
}

function unitRocketeer(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.95, r * 0.38);
  // Bulkier armored body, lifted 1px above the shadow
  const by = cy - 1;
  const ar = r * 1.1;
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, by, ar, 0, Math.PI * 2); ctx.fill();
  _infantryShading(ctx, cx, by, ar);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, by, ar, 0, Math.PI * 2); ctx.stroke();
  // Enclosed helmet with NW highlight
  const hcy = by - ar * 0.56;
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, hcy, ar * 0.37, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.arc(cx, hcy, ar * 0.37, Math.PI, -Math.PI * 0.25); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.arc(cx, hcy, ar * 0.37, 0, Math.PI * 2); ctx.stroke();
  // Targeting visor slit
  ctx.fillStyle = 'rgba(60,210,255,0.65)';
  ctx.fillRect(cx - ar * 0.24, hcy - ar * 0.09, ar * 0.48, ar * 0.17);
  // Shoulder-mounted RPG launcher
  ctx.save(); ctx.translate(cx, by); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = 'rgba(15,15,15,0.75)';
  ctx.fillRect(1, -ar * 0.44, ar + 5, ar * 0.88);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(1.5, -ar * 0.44 + 0.5, ar + 4, ar * 0.88 - 1);
  // Warhead cone
  ctx.fillStyle = '#d86020';
  ctx.beginPath();
  ctx.moveTo(ar + 5, -ar * 0.3); ctx.lineTo(ar + 12, 0); ctx.lineTo(ar + 5, ar * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a04010'; ctx.lineWidth = 0.75; ctx.stroke();
  // Exhaust port
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(-3, -ar * 0.36, 4, ar * 0.72);
  ctx.restore();
}

function unitInfantry(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.78, r * 0.30);
  const by = cy - 1;
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  _infantryShading(ctx, cx, by, r);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Helmet
  const hcy = by - r * 0.52;
  ctx.fillStyle = bc;
  ctx.beginPath(); ctx.arc(cx, hcy, r * 0.33, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.beginPath(); ctx.arc(cx, hcy, r * 0.33, Math.PI, -Math.PI * 0.25); ctx.fill();
  // Rifle
  ctx.save(); ctx.translate(cx, by); ctx.rotate(e.facing ?? 0);
  ctx.fillStyle = bc; ctx.fillRect(2, -1.5, r + 3, 2.5);
  ctx.restore();
}

// ── Special infantry renderers ────────────────────────────────────────────────

function unitEngineer(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.78, r * 0.30);
  const by = cy - 1;
  // Body with construction vest tint
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,0,0.40)';
  ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  _infantryShading(ctx, cx, by, r);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Hard hat with NW highlight
  const hcy = by - r * 0.52;
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath(); ctx.arc(cx, hcy, r * 0.36, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - r * 0.42, hcy, r * 0.84, r * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(cx, hcy, r * 0.36, Math.PI, -Math.PI * 0.25); ctx.fill();
  // Wrench
  ctx.save(); ctx.translate(cx, by); ctx.rotate(e.facing ?? 0);
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(r + 4, 0); ctx.stroke();
  ctx.restore();
  // Capture progress bar
  if (e.captureProgress > 0) {
    const prog = Math.min(1, e.captureProgress / 150);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.px, e.py - 8, TS, 3);
    ctx.fillStyle = '#f84'; ctx.fillRect(e.px, e.py - 8, TS * prog, 3);
  }
}

function unitMedic(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.78, r * 0.30);
  const by = cy - 1;
  // White body
  ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.beginPath(); ctx.arc(cx, by, r, Math.PI, -Math.PI * 0.25); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.arc(cx, by, r, -Math.PI * 0.05, Math.PI * 0.85); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.stroke();
  // Red cross
  ctx.fillStyle = '#e02020';
  ctx.fillRect(cx - r * 0.13, by - r * 0.48, r * 0.26, r * 0.96);
  ctx.fillRect(cx - r * 0.48, by - r * 0.13, r * 0.96, r * 0.26);
  // Head
  ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(cx, by - r * 0.55, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(cx, by - r * 0.55, r * 0.3, Math.PI, -Math.PI * 0.25); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
}

function unitMechanic(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  _shadow(ctx, cx, cy, r * 0.78, r * 0.30);
  const by = cy - 1;
  // Dark overalls body
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(40,40,60,0.5)';
  ctx.beginPath(); ctx.arc(cx, by, r, 0, Math.PI * 2); ctx.fill();
  _infantryShading(ctx, cx, by, r);
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Head
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, by - r * 0.52, r * 0.33, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.beginPath(); ctx.arc(cx, by - r * 0.52, r * 0.33, Math.PI, -Math.PI * 0.25); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // L-shaped wrench
  ctx.save(); ctx.translate(cx, by); ctx.rotate(e.facing ?? 0);
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(r + 5, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r + 2, -3); ctx.lineTo(r + 8, -3); ctx.lineTo(r + 8, 3); ctx.lineTo(r + 2, 3);
  ctx.stroke();
  ctx.restore();
}

function unitChinook(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  // Ground shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx + 5, cy + 6, r * 1.5, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const facing = (e.facing ?? 0) + Math.PI / 2;
  const ay = cy - 12;
  // Long fuselage as iso box (the cigar shape)
  drawIsoBox(ctx, cx, ay, r * 2.3, r * 0.9, 5, facing, bd, bd);
  // Cockpit dome on front
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  const [noseX, noseY] = _topPt(cx, ay, r * 1.1, 0, 5, cosA, sinA);
  ctx.save(); ctx.translate(noseX, noseY); ctx.rotate(facing);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(150,220,255,0.55)';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Cargo bay tint when loaded (drawn on top face)
  const [tcx, tcy] = _isoPt(cx, ay, 0, 0, 5);
  if (e.cargo?.length > 0) {
    ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
    ctx.fillStyle = 'rgba(255,180,0,0.35)';
    ctx.fillRect(-r * 0.3, -r * 0.28, r * 0.6, r * 0.56);
    ctx.restore();
  }
  // Front main rotor (spinning) — positioned over the front of the body
  const [frX, frY] = _topPt(cx, ay, r * 0.5, 0, 5, cosA, sinA);
  ctx.save(); ctx.translate(frX, frY - 2); ctx.rotate(tick * 0.32);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Rear rotor (smaller, opposite spin) — positioned over the back of the body
  const [rrX, rrY] = _topPt(cx, ay, -r * 0.9, 0, 5, cosA, sinA);
  ctx.save(); ctx.translate(rrX, rrY - 2); ctx.rotate(-tick * 0.32);
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Naval unit renderers ──────────────────────────────────────────────────────

function _wake(ctx, e, cx, cy, r, bc, tick) {
  // Animated foam wake behind ship
  const wakeAngle = (e.facing ?? 0) + Math.PI;
  const wa = 0.06 + 0.04 * Math.sin(tick * 0.12);
  ctx.globalAlpha = wa;
  ctx.fillStyle = '#aaddff';
  for (let i = 1; i <= 3; i++) {
    const wx = cx + Math.cos(wakeAngle) * i * r * 0.7;
    const wy = cy + Math.sin(wakeAngle) * i * r * 0.7;
    ctx.beginPath(); ctx.ellipse(wx, wy, r * 0.45 * i, r * 0.22, wakeAngle, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function unitCruiser(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  if (e.state === 'move' || e.state === 'attack') _wake(ctx, e, cx, cy, r * 1.5, bc, tick);
  const hullFacing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(hullFacing), sinA = Math.sin(hullFacing);
  // Turrets track the attack target independently of hull heading
  let tf = hullFacing;
  if (e.target != null) {
    const t = state.entById?.get(e.target);
    if (t) tf = Math.atan2(
      (t.isBuilding ? (t.y + t.h / 2) * 32 : t.py) + 16 - cy,
      (t.isBuilding ? (t.x + t.w / 2) * 32 : t.px) + 16 - cx
    );
  }
  // Long warship hull (low, broad box)
  drawIsoBox(ctx, cx, cy, r * 4.0, r * 1.0, 4, hullFacing, bd, bd);
  // Pointed bow — extend a triangular cap forward
  const [bowAx, bowAy] = _topPt(cx, cy, r * 2.0, 0, 4, cosA, sinA);
  const [bowBx, bowBy] = _topPt(cx, cy, r * 2.6, 0, 4, cosA, sinA);
  const [bowCx, bowCy] = _topPt(cx, cy, r * 2.0, r * 0.5, 4, cosA, sinA);
  const [bowDx, bowDy] = _topPt(cx, cy, r * 2.0, -r * 0.5, 4, cosA, sinA);
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(bowDx, bowDy); ctx.lineTo(bowBx, bowBy); ctx.lineTo(bowCx, bowCy);
  ctx.closePath(); ctx.fill();
  // Bridge superstructure (smaller box on top centre)
  const [brCx, brCy] = _topPt(cx, cy, -r * 0.1, 0, 4, cosA, sinA);
  ctx.save(); ctx.translate(brCx, brCy); ctx.rotate(hullFacing);
  ctx.fillStyle = bd;
  ctx.fillRect(-r * 0.4, -r * 0.28, r * 0.75, r * 0.56);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-r * 0.4, -r * 0.28, r * 0.75, 1);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
  ctx.strokeRect(-r * 0.4, -r * 0.28, r * 0.75, r * 0.56);
  // Radar mast rising straight up (world-Z)
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.28); ctx.lineTo(-r * 0.05, -r * 0.82); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.82); ctx.lineTo(r * 0.15, -r * 0.82); ctx.stroke();
  ctx.restore();
  // Waterline stripe along the visible side of the hull
  const [wlAx, wlAy] = _topPt(cx, cy, r * 1.9, 0, 0, cosA, sinA);
  const [wlBx, wlBy] = _topPt(cx, cy, -r * 1.9, 0, 0, cosA, sinA);
  ctx.strokeStyle = bc; ctx.globalAlpha = 0.20; ctx.lineWidth = 0.75;
  ctx.beginPath(); ctx.moveTo(wlAx, wlAy); ctx.lineTo(wlBx, wlBy); ctx.stroke();
  ctx.globalAlpha = 1;
  // Fore turret (forward of bridge) and aft turret (behind), each tracking the target
  const localTf = tf - hullFacing;
  _cruiserTurret(ctx, cx, cy, hullFacing, r * 0.95, 0, r, bc, bd, localTf);
  _cruiserTurret(ctx, cx, cy, hullFacing, -r * 1.0, 0, r, bc, bd, localTf + Math.PI);
}

function _cruiserTurret(ctx, cx, cy, hullFacing, lx, ly, r, bc, bd, localFacing) {
  const cosA = Math.cos(hullFacing), sinA = Math.sin(hullFacing);
  const [tx, ty] = _topPt(cx, cy, lx, ly, 4, cosA, sinA);
  ctx.save(); ctx.translate(tx, ty - 1); ctx.rotate(hullFacing + localFacing);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  // Twin barrels
  ctx.fillStyle = bc;
  ctx.fillRect(r * 0.22, -r * 0.19, r * 0.82, r * 0.1);
  ctx.fillRect(r * 0.22,  r * 0.09, r * 0.82, r * 0.1);
  ctx.restore();
}

function unitDestroyer(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  if (e.state === 'move' || e.state === 'attack') _wake(ctx, e, cx, cy, r, bc, tick);
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  // Sleek narrow hull
  drawIsoBox(ctx, cx, cy, r * 3.0, r * 0.7, 3, facing, bd, bd);
  // Pointed bow
  const [bowAx, bowAy] = _topPt(cx, cy, r * 1.5, 0, 3, cosA, sinA);
  const [bowBx, bowBy] = _topPt(cx, cy, r * 2.0, 0, 3, cosA, sinA);
  const [bowCx, bowCy] = _topPt(cx, cy, r * 1.5, r * 0.35, 3, cosA, sinA);
  const [bowDx, bowDy] = _topPt(cx, cy, r * 1.5, -r * 0.35, 3, cosA, sinA);
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(bowDx, bowDy); ctx.lineTo(bowBx, bowBy); ctx.lineTo(bowCx, bowCy);
  ctx.closePath(); ctx.fill();
  // Side torpedo tubes (drawn in rotated local frame on top face)
  const [tcx, tcy] = _isoPt(cx, cy, 0, 0, 3);
  ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
  ctx.fillStyle = bc; ctx.globalAlpha = 0.65;
  ctx.fillRect(-r * 0.3, -r * 0.42, r * 0.5, r * 0.18);
  ctx.fillRect(-r * 0.3,  r * 0.24, r * 0.5, r * 0.18);
  ctx.globalAlpha = 1;
  // Fore gun + barrel
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = bc; ctx.fillRect(r * 0.9, -r * 0.07, r * 0.75, r * 0.14);
  // Bridge
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-r * 0.05, -r * 0.22, r * 0.38, r * 0.44);
  ctx.strokeStyle = bc; ctx.lineWidth = 0.5;
  ctx.strokeRect(-r * 0.05, -r * 0.22, r * 0.38, r * 0.44);
  ctx.restore();
}

function unitSubmarine(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  // Submarines ride low — minimal wake
  if (e.state === 'move') {
    ctx.globalAlpha = 0.03 + 0.02 * Math.sin(tick * 0.1);
    ctx.fillStyle = '#aaddff';
    const wakeAngle = (e.facing ?? 0) + Math.PI;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(wakeAngle) * r, cy + Math.sin(wakeAngle) * r, r * 0.9, r * 0.3, wakeAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  // Cigar hull — low rounded box
  drawIsoBox(ctx, cx, cy, r * 3.0, r * 0.75, 2, facing, bd, bd);
  // Hull rounded ends — overlay ellipse caps on bow/stern
  const [hcx, hcy] = _isoPt(cx, cy, 0, 0, 2);
  ctx.save(); ctx.translate(hcx, hcy); ctx.rotate(facing);
  ctx.fillStyle = bd;
  ctx.beginPath(); ctx.ellipse(r * 1.5, 0, r * 0.18, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-r * 1.5, 0, r * 0.18, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  // Conning tower
  ctx.fillStyle = bd;
  ctx.fillRect(-r * 0.1, -r * 0.45, r * 0.45, r * 0.45);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(-r * 0.1, -r * 0.45, r * 0.45, 1);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(-r * 0.1, -r * 0.45, r * 0.45, r * 0.45);
  // Periscope (blinks when idle)
  if (e.state === 'idle' || tick % 40 < 20) {
    ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.45); ctx.lineTo(r * 0.25, -r * 0.78); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.78); ctx.lineTo(r * 0.5, -r * 0.78); ctx.stroke();
  }
  // Ballast ridges across hull top
  ctx.strokeStyle = bc; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.22;
  for (const rx of [-r * 0.7, -r * 0.3, r * 0.4]) {
    ctx.beginPath(); ctx.moveTo(rx, -r * 0.32); ctx.lineTo(rx, r * 0.32); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function unitTransport(ctx, e, cx, cy, r, fd, bc, bd, tick) {
  if (e.state === 'move') _wake(ctx, e, cx, cy, r * 1.1, bc, tick);
  const facing = e.chassisFacing ?? e.facing ?? 0;
  const cosA = Math.cos(facing), sinA = Math.sin(facing);
  // Wide flat hull
  drawIsoBox(ctx, cx, cy, r * 2.4, r * 1.3, 4, facing, bd, bd);
  // Pointed bow
  const [bowBx, bowBy] = _topPt(cx, cy, r * 1.45, 0, 4, cosA, sinA);
  const [bowCx, bowCy] = _topPt(cx, cy, r * 1.2, r * 0.65, 4, cosA, sinA);
  const [bowDx, bowDy] = _topPt(cx, cy, r * 1.2, -r * 0.65, 4, cosA, sinA);
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(bowDx, bowDy); ctx.lineTo(bowBx, bowBy); ctx.lineTo(bowCx, bowCy);
  ctx.closePath(); ctx.fill();
  // Cargo hatches and crane arm on top face in rotated local frame
  const [tcx, tcy] = _isoPt(cx, cy, 0, 0, 4);
  ctx.save(); ctx.translate(tcx, tcy); ctx.rotate(facing);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  for (const hx of [-r * 0.5, -r * 0.05, r * 0.3]) {
    ctx.fillRect(hx, -r * 0.35, r * 0.35, r * 0.7);
    ctx.strokeStyle = bc; ctx.lineWidth = 0.75;
    ctx.strokeRect(hx, -r * 0.35, r * 0.35, r * 0.7);
  }
  // Crane arm
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.35); ctx.lineTo(-r * 0.05, -r * 0.85);
  ctx.lineTo(r * 0.4, -r * 0.85);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
