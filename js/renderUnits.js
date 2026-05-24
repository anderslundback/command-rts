import { TS, MW, FDATA } from './constants.js';
import { state } from './state.js';

export function renderUnits(ctx, VW, VH) {
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

    // Selection ring + attack range ring
    if (isSel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, r + 4, r + 3, 0, 0, Math.PI * 2); ctx.stroke();
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
  _shadow(ctx, cx, cy, r * 0.9, r * 0.35);
  // Bulkier armored body
  const ar = r * 1.1;
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, cy, ar, 0, Math.PI * 2); ctx.fill();
  // Chest armour plate sheen
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.arc(cx, cy, ar, -Math.PI * 0.75, -Math.PI * 0.05); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, ar, 0, Math.PI * 2); ctx.stroke();
  // Enclosed helmet (larger, full-dome — no exposed face)
  const hcy = cy - ar * 0.56;
  ctx.fillStyle = bd; ctx.beginPath(); ctx.arc(cx, hcy, ar * 0.37, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.arc(cx, hcy, ar * 0.37, 0, Math.PI * 2); ctx.stroke();
  // Targeting visor slit (cyan tint)
  ctx.fillStyle = 'rgba(60,210,255,0.65)';
  ctx.fillRect(cx - ar * 0.24, hcy - ar * 0.09, ar * 0.48, ar * 0.17);
  // Shoulder-mounted RPG launcher (thick tube)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.facing ?? 0);
  // Launcher body
  ctx.fillStyle = 'rgba(15,15,15,0.75)'; ctx.fillRect(1, -ar * 0.44, ar + 5, ar * 0.88);
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.strokeRect(1.5, -ar * 0.44 + 0.5, ar + 4, ar * 0.88 - 1);
  // Rocket warhead cone at muzzle
  ctx.fillStyle = '#d86020';
  ctx.beginPath();
  ctx.moveTo(ar + 5, -ar * 0.3); ctx.lineTo(ar + 12, 0); ctx.lineTo(ar + 5, ar * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a04010'; ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(ar + 5, -ar * 0.3); ctx.lineTo(ar + 12, 0); ctx.lineTo(ar + 5, ar * 0.3);
  ctx.closePath(); ctx.stroke();
  // Open back exhaust port
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(-3, -ar * 0.36, 4, ar * 0.72);
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
