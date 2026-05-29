import React, { useState } from 'react';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import * as _A from '../audio.js';
import { useUIStore, syncFromGameState } from '../store';

const state: any = (_S as any).state;
const setVolume: (v: number) => void = (_A as any).setVolume;

export function NetGameMenu(): React.ReactElement {
  const [volume, setVolumeState] = useState<number>(() => state.volume ?? 0.5);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const netPauseCredits = useUIStore(s => s.netPauseCredits);
  const lobby = useUIStore(s => s.lobby);

  const mySlot: number = state.net?.mySlot ?? 0;
  const myCredits = netPauseCredits[mySlot] ?? 0;
  const canPause = myCredits > 0;

  const handleClose = () => {
    state.menuOpen = false;
    syncFromGameState();
  };

  const handlePause = () => {
    if (!canPause) return;
    handleClose();
    import('../game.js').then((m: any) => m.requestNetPause()).catch(console.error);
  };

  const handleQuit = () => {
    import('../game.js').then((m: any) => m.showMenu()).catch(console.error);
  };

  const handleSurrender = () => {
    import('../game.js').then((m: any) => m.surrender()).catch(console.error);
  };

  const handleVolume = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(ev.target.value);
    setVolumeState(v);
    state.volume = v;
    setVolume(v);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        zIndex: 60,
        gap: 20,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          letterSpacing: 8,
          color: '#8ab',
          textShadow: '0 0 16px #8ab4',
        }}
      >
        MENU
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          background: '#06080e',
          border: '1px solid #1a2230',
          padding: '14px 24px',
        }}
      >
        <label style={{ color: '#668', fontSize: 10, letterSpacing: 2 }}>VOLUME</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolume}
          style={{ width: 160, accentColor: '#4af' }}
        />
        <span style={{ color: '#9ab', fontSize: 10 }}>{Math.round(volume * 100)}%</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <NetMenuBtn
          label={canPause ? `PAUSE GAME  (${myCredits} LEFT)` : 'PAUSE GAME  (USED UP)'}
          color="#fc4"
          onClick={handlePause}
          disabled={!canPause}
        />
        {confirmSurrender ? (
          <>
            <div style={{ color: '#f86', fontSize: 11, letterSpacing: 1, textAlign: 'center', maxWidth: 260 }}>
              Surrender? All your units and structures will be destroyed.
            </div>
            <NetMenuBtn label="CONFIRM SURRENDER" color="#f64" onClick={handleSurrender} />
            <NetMenuBtn label="CANCEL" color="#8ab" onClick={() => setConfirmSurrender(false)} />
          </>
        ) : (
          <NetMenuBtn label="SURRENDER" color="#f64" onClick={() => setConfirmSurrender(true)} />
        )}
        <NetMenuBtn label="QUIT TO MENU" color="#f64" onClick={handleQuit} />
        <NetMenuBtn label="CLOSE" color="#4d8" onClick={handleClose} />
      </div>
    </div>
  );
}

function NetMenuBtn({
  label,
  color,
  onClick,
  disabled = false,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        background: hovered && !disabled ? '#0a1018' : '#06080e',
        border: `2px solid ${hovered && !disabled ? color : '#1a2230'}`,
        color: disabled ? '#334' : hovered ? color : '#8ab',
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 3,
        padding: '10px 36px',
        cursor: disabled ? 'default' : 'pointer',
        width: 260,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}
