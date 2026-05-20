import React from 'react';
import { useUIStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface PowerPoint { tick: number; scores: number[] }

function PowerGraph({ history }: { history: PowerPoint[] }): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const PAD = { l: 8, r: 8, t: 8, b: 20 };
    const gW = W - PAD.l - PAD.r;
    const gH = H - PAD.t - PAD.b;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060d14';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + gH * (i / 4);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    }

    if (history.length < 2) {
      ctx.fillStyle = '#3a5060';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NO DATA', W / 2, H / 2);
      return;
    }

    const maxScore = Math.max(...history.flatMap(p => p.scores), 1);

    for (let f = 0; f < 3; f++) {
      const fd = (FDATA as any[])[f];
      ctx.beginPath();
      ctx.strokeStyle = fd.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      history.forEach((pt, i) => {
        const x = PAD.l + (i / (history.length - 1)) * gW;
        const y = PAD.t + gH - (pt.scores[f] / maxScore) * gH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // End-of-line dot
      const last = history[history.length - 1];
      const lx = W - PAD.r;
      const ly = PAD.t + gH - (last.scores[f] / maxScore) * gH;
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = fd.color; ctx.fill();
    }

    // Legend at bottom
    ctx.textBaseline = 'bottom';
    ctx.font = '9px monospace';
    const itemW = gW / 3;
    for (let f = 0; f < 3; f++) {
      const fd = (FDATA as any[])[f];
      const lx = PAD.l + f * itemW;
      const ly = H - 2;
      ctx.fillStyle = fd.color;
      ctx.fillRect(lx, ly - 7, 14, 2);
      ctx.fillText(fd.name, lx + 18, ly);
    }
  }, [history]);

  return (
    <canvas
      ref={canvasRef}
      width={460}
      height={160}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    />
  );
}

interface FactionDef {
  name: string;
  color: string;
  dark: string;
  light: string;
}

function FactionButton({
  index,
  fd,
  onSelect,
}: {
  index: number;
  fd: FactionDef;
  onSelect: (i: number) => void;
}): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={() => onSelect(index)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? fd.dark : '#06080e',
        border: `2px solid ${hovered ? fd.color : '#1a2230'}`,
        color: fd.color,
        fontFamily: "'Courier New', monospace",
        fontSize: 15,
        fontWeight: 'bold',
        letterSpacing: 3,
        padding: '14px 32px',
        cursor: 'pointer',
        width: 220,
        transition: 'all 0.12s',
      }}
    >
      {fd.name}
    </button>
  );
}

export function Menu(): React.ReactElement {
  const phase = useUIStore(s => s.phase);
  const winnerFaction = useUIStore(s => s.winnerFaction);
  const winnerName = useUIStore(s => s.winnerName);
  const playerFaction = useUIStore(s => s.playerFaction);
  const gameStats = useUIStore(s => s.gameStats);

  const handleFactionSelect = (i: number) => {
    // @ts-ignore
    import('../game.js').then((m: any) => m.startGame(i)).catch(console.error);
  };

  const handleReturnToMenu = () => {
    // @ts-ignore
    import('../game.js').then((m: any) => m.showMenu()).catch(console.error);
  };

  const isWin = phase === 'gameover' && winnerFaction === playerFaction;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        zIndex: 50,
        gap: 24,
        fontFamily: "'Courier New', monospace",
      }}
    >
      {phase === 'menu' && (
        <>
          {/* Title */}
          <div
            style={{
              fontSize: 42,
              fontWeight: 'bold',
              letterSpacing: 10,
              color: '#4af',
              textShadow: '0 0 24px #4af8',
              marginBottom: 8,
            }}
          >
            COMMAND
          </div>

          <div style={{ color: '#668', fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>
            SELECT YOUR FACTION
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(FDATA as FactionDef[]).map((fd, i) => (
              <FactionButton key={i} index={i} fd={fd} onSelect={handleFactionSelect} />
            ))}
          </div>
        </>
      )}

      {phase === 'gameover' && (
        <>
          <div
            style={{
              fontSize: 64,
              fontWeight: 'bold',
              letterSpacing: 10,
              color: isWin ? '#4dff88' : '#ff6644',
              textShadow: `0 0 50px ${isWin ? '#4dff88' : '#ff6644'}`,
              marginBottom: 4,
            }}
          >
            {isWin ? 'VICTORY' : 'DEFEAT'}
          </div>

          <div style={{ color: '#9ab', fontSize: 14, letterSpacing: 3, marginBottom: 20 }}>
            {winnerFaction >= 0 ? `${winnerName} wins the battle` : 'All factions destroyed'}
          </div>

          <div style={{ width: 460, marginBottom: 20 }}>
            <div style={{ color: '#4a6a7a', fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
              POWER HISTORY
            </div>
            <div style={{ border: '1px solid #0e1e2e', overflow: 'hidden' }}>
              <PowerGraph history={gameStats.powerHistory} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 2, marginBottom: 32 }}>
            {[
              { label: 'DURATION',          value: formatDuration(gameStats.duration) },
              { label: 'ENEMIES DESTROYED', value: String(gameStats.enemiesKilled)   },
              { label: 'UNITS LOST',        value: String(gameStats.unitsLost)        },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: '#080e18',
                  border: `1px solid ${isWin ? '#1a3a28' : '#3a1a18'}`,
                  padding: '16px 24px',
                  textAlign: 'center',
                  minWidth: 130,
                }}
              >
                <div style={{ color: '#6a8a9a', fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>
                  {label}
                </div>
                <div style={{ color: '#ddeeff', fontSize: 30, fontWeight: 'bold' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleReturnToMenu}
            style={{
              background: '#06080e',
              border: '2px solid #1a2230',
              color: '#8ab',
              fontFamily: "'Courier New', monospace",
              fontSize: 13,
              letterSpacing: 2,
              padding: '10px 28px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => ((e.target as HTMLButtonElement).style.borderColor = '#4af')}
            onMouseLeave={e => ((e.target as HTMLButtonElement).style.borderColor = '#1a2230')}
          >
            RETURN TO MENU
          </button>
        </>
      )}
    </div>
  );
}
