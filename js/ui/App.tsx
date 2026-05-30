import React from 'react';
import { useUIStore } from '../store';
import { HUD } from './HUD';
import { Sidebar } from './Sidebar';
import { Menu } from './Menu';
import { PauseMenu } from './PauseMenu';
import { NetGameMenu } from './NetGameMenu';
import { DiplomacyPanel } from './DiplomacyPanel';
import { LobbyScreen } from './LobbyScreen';
import { BugReportModal } from './BugReportModal';
import { SurrenderScreen } from './SurrenderScreen';
import { SpectateBar } from './SpectateBar';

export function App(): React.ReactElement {
  const phase = useUIStore(s => s.phase);
  const bugReportOpen = useUIStore(s => s.bugReportOpen);
  const menuOpen = useUIStore(s => s.menuOpen);
  const diplomacyOpen = useUIStore(s => s.diplomacyOpen);
  const surrendered = useUIStore(s => s.surrendered);
  const spectating = useUIStore(s => s.spectating);

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
      {spectating ? (
        <SpectateBar />
      ) : surrendered ? (
        <SurrenderScreen />
      ) : (
        <>
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
          {(phase === 'playing' || phase === 'paused') && diplomacyOpen && <DiplomacyPanel />}
        </>
      )}

      {bugReportOpen && <BugReportModal />}
    </div>
  );
}
