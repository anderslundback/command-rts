import React from 'react';
import { useUIStore, uiStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';
// @ts-ignore
import { net } from '../net/netClient.js';
// @ts-ignore
import { state as _gameState } from '../state.js';

const state: any = _gameState;

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

      const last = history[history.length - 1];
      const lx = W - PAD.r;
      const ly = PAD.t + gH - (last.scores[f] / maxScore) * gH;
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = fd.color; ctx.fill();
    }

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

function handleReturnToMenu() {
  import('../game.js').then((m: any) => m.showMenu()).catch(console.error);
  uiStore.setState({ lobby: null, net: { connected: false, role: 'none', latencyMs: 0 } });
  net.disconnect();
}

export function SurrenderScreen(): React.ReactElement {
  const gameStats = useUIStore(s => s.gameStats);

  const handleSpectate = () => {
    import('../game.js').then((m: any) => m.spectate()).catch(console.error);
  };

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
      <div
        style={{
          fontSize: 64,
          fontWeight: 'bold',
          letterSpacing: 10,
          color: '#ff6644',
          textShadow: '0 0 50px #ff6644',
          marginBottom: 4,
        }}
      >
        DEFEAT
      </div>

      <div style={{ color: '#9ab', fontSize: 14, letterSpacing: 3, marginBottom: 20 }}>
        You surrendered
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
              border: '1px solid #3a1a18',
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

      <div style={{ display: 'flex', gap: 10 }}>
        {state.rollback && (
          <SBtn
            label="SAVE REPLAY"
            color="#fa0"
            onClick={() => { import('../game.js').then((m: any) => m.saveReplay()).catch(console.error); }}
          />
        )}
        <SBtn label="SPECTATE" color="#4d8" onClick={handleSpectate} />
        <SBtn label="RETURN TO MENU" color="#8ab" onClick={handleReturnToMenu} />
      </div>
    </div>
  );
}

function SBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0a1018' : '#06080e',
        border: `2px solid ${hovered ? color : '#1a2230'}`,
        color: hovered ? color : '#8ab',
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 2,
        padding: '10px 28px',
        cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}
