import React from 'react';
import { useUIStore } from '../store';
import { HUD } from './HUD';
import { Sidebar } from './Sidebar';
import { Menu } from './Menu';
import { PauseMenu } from './PauseMenu';

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
      {/* Always-visible HUD elements when game is running */}
      {(phase === 'playing' || phase === 'paused') && (
        <>
          <HUD />
          <Sidebar />
        </>
      )}

      {/* Faction select or game-over screen */}
      {(phase === 'menu' || phase === 'gameover') && <Menu />}

      {/* Pause overlay */}
      {phase === 'paused' && <PauseMenu />}
    </div>
  );
}
