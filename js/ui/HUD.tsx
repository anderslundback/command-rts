import React from 'react';
import { useUIStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';

const SPEED_LABELS = ['SLOWEST', 'SLOW', 'NORMAL', 'FAST', 'FASTEST'];

export function HUD(): React.ReactElement {
  const playerFaction = useUIStore(s => s.playerFaction);
  const credits = useUIStore(s => s.credits);
  const powerUsed = useUIStore(s => s.powerUsed);
  const powerGen = useUIStore(s => s.powerGen);
  const statusMsg = useUIStore(s => s.statusMsg);
  const fps = useUIStore(s => s.fps);
  const gameSpeed = useUIStore(s => s.gameSpeed);
  const netState = useUIStore(s => s.net);
  const lobby = useUIStore(s => s.lobby);
  const replayMode = useUIStore(s => s.replayMode);

  const fd = FDATA[playerFaction] as { name: string; color: string };
  const powerOk = powerGen >= powerUsed;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 36,
        background: '#06080e',
        borderBottom: '1px solid #1a2230',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        pointerEvents: 'auto',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {/* Faction name */}
      <span
        style={{
          color: fd.color,
          fontWeight: 'bold',
          fontSize: 13,
          letterSpacing: 2,
          minWidth: 110,
        }}
      >
        {fd.name}
      </span>

      {/* Credits */}
      <span style={{ color: '#8ab', fontSize: 11 }}>
        <span style={{ color: '#668', fontSize: 10 }}>CREDITS </span>
        <span style={{ color: '#fc4', fontWeight: 'bold' }}>
          {credits.toLocaleString()}
        </span>
      </span>

      {/* Power */}
      <span style={{ color: '#8ab', fontSize: 11 }}>
        <span style={{ color: '#668', fontSize: 10 }}>PWR </span>
        <span style={{ color: powerOk ? '#fc4' : '#f44', fontWeight: 'bold' }}>
          {powerUsed}/{powerGen}
        </span>
      </span>

      {/* Replay badge */}
      {replayMode && (
        <span style={{ color: '#f90', fontSize: 10, letterSpacing: 2, fontWeight: 'bold', border: '1px solid #f90', padding: '1px 6px' }}>
          REPLAY
        </span>
      )}

      {/* Status message */}
      {statusMsg && (
        <span
          style={{
            color: '#9ab',
            fontSize: 11,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {statusMsg}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* Game speed control — skirmish always, multiplayer host only */}
      {(netState.role === 'none' || lobby?.isHost) && (
        <SpeedControl speed={gameSpeed} />
      )}

      {/* Net indicator */}
      {netState.role !== 'none' && (
        <span style={{ color: '#3a5060', fontSize: 10, letterSpacing: 1 }}>
          {lobby?.roomCode} NET {netState.latencyMs}ms
        </span>
      )}

      {/* FPS counter */}
      <span style={{ color: '#445', fontSize: 10 }}>{fps} FPS</span>
    </div>
  );
}

function SpeedControl({ speed }: { speed: number }): React.ReactElement {
  const handleDec = () => {
    import('../game.js').then((m: any) => m.setGameSpeed(speed - 1)).catch(console.error);
  };
  const handleInc = () => {
    import('../game.js').then((m: any) => m.setGameSpeed(speed + 1)).catch(console.error);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        userSelect: 'none',
      }}
    >
      <button
        onClick={handleDec}
        disabled={speed <= 0}
        style={{
          background: 'none',
          border: 'none',
          color: speed <= 0 ? '#2a3040' : '#668',
          cursor: speed <= 0 ? 'default' : 'pointer',
          fontSize: 10,
          padding: '0 2px',
          lineHeight: 1,
        }}
      >
        ◄
      </button>
      <span style={{ color: '#557', fontSize: 10, letterSpacing: 1, minWidth: 52, textAlign: 'center' }}>
        {SPEED_LABELS[speed]}
      </span>
      <button
        onClick={handleInc}
        disabled={speed >= 4}
        style={{
          background: 'none',
          border: 'none',
          color: speed >= 4 ? '#2a3040' : '#668',
          cursor: speed >= 4 ? 'default' : 'pointer',
          fontSize: 10,
          padding: '0 2px',
          lineHeight: 1,
        }}
      >
        ►
      </button>
    </div>
  );
}
