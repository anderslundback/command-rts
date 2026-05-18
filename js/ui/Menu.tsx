import React from 'react';
import { useUIStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';

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
  const { phase, winnerFaction, winnerName, playerFaction } = useUIStore(s => ({
    phase: s.phase,
    winnerFaction: s.winnerFaction,
    winnerName: s.winnerName,
    playerFaction: s.playerFaction,
  }));

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
              fontSize: 48,
              fontWeight: 'bold',
              letterSpacing: 8,
              color: isWin ? '#4d8' : '#f64',
              textShadow: `0 0 30px ${isWin ? '#4d8' : '#f64'}88`,
            }}
          >
            {isWin ? 'VICTORY' : 'DEFEAT'}
          </div>

          <div style={{ color: '#9ab', fontSize: 14, letterSpacing: 2 }}>
            {winnerFaction >= 0 ? `${winnerName} wins` : 'All factions destroyed'}
          </div>

          <button
            onClick={handleReturnToMenu}
            style={{
              marginTop: 16,
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
