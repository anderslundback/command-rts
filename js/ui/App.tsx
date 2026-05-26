import React from 'react';
import { useUIStore } from '../store';
import { HUD } from './HUD';
import { Sidebar } from './Sidebar';
import { Menu } from './Menu';
import { PauseMenu } from './PauseMenu';
import { NetGameMenu } from './NetGameMenu';
import { LobbyScreen } from './LobbyScreen';
import { BugReportModal } from './BugReportModal';

export function App(): React.ReactElement {
  const phase = useUIStore(s => s.phase);
  const bugReportOpen = useUIStore(s => s.bugReportOpen);
  const menuOpen = useUIStore(s => s.menuOpen);

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

      {phase === 'playing' && menuOpen && <NetGameMenu />}
      {phase === 'paused' && <PauseMenu />}

      {bugReportOpen && <BugReportModal />}
    </div>
  );
}
