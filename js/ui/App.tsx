import React from 'react';
import { useUIStore } from '../store';
import { HUD } from './HUD';
import { Sidebar } from './Sidebar';
import { Menu } from './Menu';
import { PauseMenu } from './PauseMenu';
import { LobbyScreen } from './LobbyScreen';

export function App(): React.ReactElement {
  const phase = useUIStore(s => s.phase);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        fontFamily: "'Courier New', monospace",
      }}
    >
      {(phase === 'playing' || phase === 'paused') && (
        <>
          <HUD />
          <Sidebar />
        </>
      )}

      {(phase === 'menu' || phase === 'gameover') && <Menu />}

      {phase === 'lobby' && <LobbyScreen />}

      {phase === 'paused' && <PauseMenu />}
    </div>
  );
}
