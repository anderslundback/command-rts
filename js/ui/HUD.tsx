import React, { useState, useCallback } from 'react';
import { useUIStore, SyncDebugState, syncFromGameState } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';
// @ts-ignore
import { state as _gsRaw } from '../state.js';
const _gs: any = _gsRaw;
// @ts-ignore
import { openBugReport } from '../bugReport.js';

// Indices 5-6 are replay-only (enforced in setGameSpeed)
const SPEED_LABELS = ['SLOWEST', 'SLOW', 'NORMAL', 'FAST', 'FASTEST', '2×', '4×'];

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
  const mapSeed = useUIStore(s => s.mapSeed);
  const desync = useUIStore(s => s.desync);
  const netStall = useUIStore(s => s.netStall);
  const syncDebug = useUIStore(s => s.syncDebug);

  const [debugOpen, setDebugOpen] = useState(false);

  const toggleDebug = useCallback(() => {
    const opening = !debugOpen;
    if (opening && _gs.syncDebug) {
      // Clear the warning dot when the panel is opened; next loop() sync picks it up
      _gs.syncDebug.hasWarning = false;
    }
    setDebugOpen(opening);
  }, [debugOpen]);

  const fd = FDATA[playerFaction] as { name: string; color: string };
  const powerOk = powerGen >= powerUsed;
  const hasWarning = !!syncDebug?.hasWarning;

  return (
    <>
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

      {/* Waiting for remote input */}
      {netStall && !desync && (
        <span style={{ color: '#fa0', fontSize: 10, letterSpacing: 2, border: '1px solid #fa0', padding: '1px 6px' }}
              title="Waiting for other player's input">
          WAITING
        </span>
      )}

      {/* Desync warning */}
      {desync && (
        <span style={{ color: '#f44', fontSize: 10, letterSpacing: 2, fontWeight: 'bold', border: '1px solid #f44', padding: '1px 6px' }}
              title="Game states have diverged — simulation is out of sync">
          DESYNC
        </span>
      )}

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

      {/* Game speed control */}
      {/* Replay: always interactive, with extra 2× / 4× steps */}
      {replayMode && (
        <SpeedControl speed={gameSpeed} maxSpeed={6} />
      )}
      {/* Skirmish / multiplayer host: interactive, capped at FASTEST */}
      {!replayMode && (netState.role === 'none' || lobby?.isHost) && (
        <SpeedControl speed={gameSpeed} maxSpeed={4} />
      )}
      {/* Multiplayer client: read-only label */}
      {!replayMode && netState.role !== 'none' && !lobby?.isHost && (
        <span style={{ color: '#557', fontSize: 10, letterSpacing: 1, minWidth: 52, textAlign: 'center' }}>
          {SPEED_LABELS[gameSpeed]}
        </span>
      )}

      {/* Net indicator */}
      {netState.role !== 'none' && (
        <span style={{ color: '#3a5060', fontSize: 10, letterSpacing: 1 }}>
          {lobby?.roomCode} NET {netState.latencyMs}ms
        </span>
      )}

      {/* Map seed */}
      {mapSeed != null && netState.role === 'none' && !replayMode && (
        <span style={{ color: '#334', fontSize: 10, letterSpacing: 1 }}>
          SEED:{mapSeed.toString(16).toUpperCase().padStart(8, '0')}
        </span>
      )}

      {/* FPS counter */}
      <span style={{ color: '#445', fontSize: 10 }}>{fps} FPS</span>

      {/* Bug report */}
      <button
        onClick={() => openBugReport()}
        title="Report a bug"
        style={{
          background: 'none', border: '1px solid #1e1a20',
          color: '#443', cursor: 'pointer', fontSize: 9,
          padding: '1px 5px', letterSpacing: 1,
        }}
      >
        BUG
      </button>

      {/* Debug panel toggle — only in net games */}
      {syncDebug && (
        <button
          onClick={toggleDebug}
          style={{
            background: debugOpen ? '#1a2a1a' : 'none',
            border: `1px solid ${debugOpen ? '#3a6' : '#223'}`,
            color: debugOpen ? '#3a6' : '#334',
            cursor: 'pointer',
            fontSize: 9,
            padding: '1px 5px',
            letterSpacing: 1,
            position: 'relative',
          }}
        >
          DBG
          {!debugOpen && hasWarning && (
            <span style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#fa0',
              display: 'block',
            }} />
          )}
        </button>
      )}
    </div>
    {syncDebug && debugOpen && <SyncDebugPanel debug={syncDebug} />}
    </>
  );
}

function SyncDebugPanel({ debug }: { debug: SyncDebugState }): React.ReactElement {
  const { entityH, creditsH, rngH, shellH, mapH, tick, resyncs, lastDesyncTick, diverged, stallCount, nullsSent, log, cred } = debug;
  const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const diff = (k: string) => diverged.includes(k);
  const FACTION_LABELS = ['ALN', 'BRO', 'SYN'];
  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      left: 8,
      background: 'rgba(0,0,0,0.88)',
      border: '1px solid #1a2230',
      padding: '6px 10px',
      fontFamily: 'monospace',
      fontSize: 10,
      color: '#8ab',
      lineHeight: 1.7,
      zIndex: 30,
      pointerEvents: 'none',
      userSelect: 'none',
      minWidth: 220,
    }}>
      <div style={{ color: '#557', marginBottom: 2, letterSpacing: 1 }}>SYNC DEBUG</div>
      <div>tick {tick}{'  '}resyncs: <span style={{ color: resyncs > 0 ? '#f44' : '#8ab' }}>{resyncs}</span></div>
      <div>stalls: <span style={{ color: stallCount > 0 ? '#fa0' : '#3a8' }}>{stallCount}</span>{'  '}nulls: {nullsSent}</div>
      {(['entityH', 'creditsH', 'rngH', 'shellH', 'mapH'] as const).map(k => {
        const val = { entityH, creditsH, rngH, shellH, mapH }[k];
        const label = { entityH: 'entity ', creditsH: 'credits', rngH: 'rng    ', shellH: 'shells ', mapH: 'map    ' }[k];
        const isDiff = diff(k);
        return (
          <div key={k} style={{ color: isDiff ? '#f44' : '#556' }}>
            {label}{'  '}{hex(val)}{isDiff ? '  ◄ DIFF' : ''}
          </div>
        );
      })}
      {cred && (
        <div style={{ color: '#445', marginTop: 2 }}>
          {cred.map((c, i) => (
            <span key={i} style={{ marginRight: 8 }}>
              {FACTION_LABELS[i]}:{Math.floor(c)}
            </span>
          ))}
        </div>
      )}
      {log && log.length > 0 && (
        <>
          <div style={{ color: '#334', marginTop: 4, marginBottom: 1 }}>── events ──</div>
          {log.map((line, i) => (
            <div key={i} style={{ color: line.includes('DESYNC') ? '#f44' : line.includes('STALL') || line.includes('TIMEOUT') ? '#fa0' : '#557' }}>
              {line}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SpeedControl({ speed, maxSpeed }: { speed: number; maxSpeed: number }): React.ReactElement {
  const handleDec = () => {
    import('../game.js').then((m: any) => m.setGameSpeed(speed - 1)).catch(console.error);
  };
  const handleInc = () => {
    import('../game.js').then((m: any) => m.setGameSpeed(speed + 1)).catch(console.error);
  };

  // 2× and 4× labels are wider — give them a bit more room
  const labelWidth = speed >= 5 ? 28 : 52;

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
      <span style={{ color: speed >= 5 ? '#f90' : '#557', fontSize: 10, letterSpacing: 1, minWidth: labelWidth, textAlign: 'center' }}>
        {SPEED_LABELS[speed]}
      </span>
      <button
        onClick={handleInc}
        disabled={speed >= maxSpeed}
        style={{
          background: 'none',
          border: 'none',
          color: speed >= maxSpeed ? '#2a3040' : '#668',
          cursor: speed >= maxSpeed ? 'default' : 'pointer',
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
