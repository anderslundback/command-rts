import React from 'react';
import { uiStore } from '../store';
// @ts-ignore
import { net } from '../net/netClient.js';

function handleReturnToMenu() {
  import('../game.js').then((m: any) => m.showMenu()).catch(console.error);
  uiStore.setState({ lobby: null, net: { connected: false, role: 'none', latencyMs: 0 } });
  net.disconnect();
}

function handleShowResults() {
  import('../game.js').then((m: any) => m.showResults()).catch(console.error);
}

export function SpectateBar(): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        pointerEvents: 'auto',
        zIndex: 60,
        fontFamily: "'Courier New', monospace",
      }}
    >
      <span style={{ color: '#668', fontSize: 11, letterSpacing: 2, alignSelf: 'center', padding: '0 8px' }}>
        SPECTATING
      </span>
      <SBtn label="RESULTS" color="#4af" onClick={handleShowResults} />
      <SBtn label="QUIT TO MENU" color="#f64" onClick={handleReturnToMenu} />
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
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
        padding: '6px 18px',
        cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
  );
}
