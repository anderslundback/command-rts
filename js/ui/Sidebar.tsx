import React, { useEffect, useRef } from 'react';
import { useUIStore, uiStore } from '../store';
import { InfoPanel } from './InfoPanel';
import { BuildPanel } from './BuildPanel';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import { onRadarClick } from '../input.js';
const state: any = (_S as any).state;

export function Sidebar(): React.ReactElement {
  const radarRef = useRef<HTMLCanvasElement>(null);
  const powerUsed = useUIStore(s => s.powerUsed);
  const powerGen = useUIStore(s => s.powerGen);
  const activeTab = useUIStore(s => s.activeTab);

  // Wire the radar canvas into the game state so renderer can draw to it
  useEffect(() => {
    if (radarRef.current) {
      (state as any).radar = radarRef.current;
      (state as any).radarCtx = radarRef.current.getContext('2d');
      radarRef.current.addEventListener('click', onRadarClick);
    }
    return () => {
      if (radarRef.current) radarRef.current.removeEventListener('click', onRadarClick);
    };
  }, []);

  const powerOk = powerGen >= powerUsed;
  const total = powerGen + powerUsed;
  const powerPct = total > 0 ? Math.min(1, powerGen / total) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 36,
        right: 0,
        width: 200,
        bottom: 0,
        background: '#06080e',
        borderLeft: '1px solid #1a2230',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
        zIndex: 15,
        overflowY: 'auto',
        overflowX: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Radar canvas */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <canvas
          ref={radarRef}
          id="radar"
          width={200}
          height={160}
          style={{ display: 'block', width: '100%' }}
        />
      </div>

      {/* Power bar strip */}
      <div
        style={{
          height: 6,
          background: '#0a0f18',
          borderTop: '1px solid #1a2230',
          borderBottom: '1px solid #1a2230',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          id="power-bar-fill"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${(powerPct * 100).toFixed(1)}%`,
            background: powerOk ? '#2d8' : '#d44',
            transition: 'width 0.2s',
          }}
        />
      </div>

      {/* Info panel */}
      <InfoPanel />

      {/* Build/Train tab bar */}
      <div
        style={{
          display: 'flex',
          borderTop: '1px solid #1a2230',
          borderBottom: '1px solid #1a2230',
          flexShrink: 0,
        }}
      >
        <TabButton id="tab-build" label="BUILD" active={activeTab === 'build'} tab="build" />
        <TabButton id="tab-train" label="TRAIN" active={activeTab === 'train'} tab="train" />
      </div>

      {/* Build/Train panel */}
      <BuildPanel />
    </div>
  );
}

function TabButton({
  id,
  label,
  active,
  tab,
}: {
  id: string;
  label: string;
  active: boolean;
  tab: 'build' | 'train';
}): React.ReactElement {
  const handleClick = () => {
    state.activeTab = tab;
    uiStore.setState({ activeTab: tab });
  };

  return (
    <button
      id={id}
      onClick={handleClick}
      className={'build-tab' + (active ? ' active' : '')}
      style={{
        flex: 1,
        background: active ? '#0e1a28' : 'transparent',
        border: 'none',
        borderRight: '1px solid #1a2230',
        color: active ? '#4af' : '#668',
        fontFamily: "'Courier New', monospace",
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
        padding: '5px 0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
