import React, { useState } from 'react';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import * as _A from '../audio.js';

const state: any = (_S as any).state;
const setVolume: (v: number) => void = (_A as any).setVolume;

export function PauseMenu(): React.ReactElement {
  const [volume, setVolumeState] = useState<number>(() => state.volume ?? 0.5);

  const handleResume = () => {
    // @ts-ignore
    import('../game.js').then((m: any) => m.togglePause()).catch(console.error);
  };

  const handleQuit = () => {
    // @ts-ignore
    import('../game.js').then((m: any) => m.showMenu()).catch(console.error);
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
        background: 'rgba(0,0,0,0.72)',
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
      {/* Title */}
      <div
        style={{
          fontSize: 32,
          fontWeight: 'bold',
          letterSpacing: 8,
          color: '#fc4',
          textShadow: '0 0 20px #fc48',
        }}
      >
        PAUSED
      </div>

      {/* Volume control */}
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
        <label htmlFor="pause-volume" style={{ color: '#668', fontSize: 10, letterSpacing: 2 }}>
          VOLUME
        </label>
        <input
          id="pause-volume"
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

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PauseBtn label="RESUME" color="#4d8" onClick={handleResume} />
        <PauseBtn label="QUIT TO MENU" color="#f64" onClick={handleQuit} />
      </div>
    </div>
  );
}

function PauseBtn({
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
        letterSpacing: 3,
        padding: '10px 36px',
        cursor: 'pointer',
        width: 220,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}
