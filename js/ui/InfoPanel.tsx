import React from 'react';
import { useUIStore } from '../store';
import type { EntUI } from '../store';

// @ts-ignore
import * as _C from '../constants.js';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import * as _P from '../placement.js';

const BDEF: any = (_C as any).BDEF;
const UDEF: any = (_C as any).UDEF;
const FDATA: any[] = (_C as any).FDATA;
const state: any = (_S as any).state;
const deployMcvInPlace: (mcv: any) => any = (_P as any).deployMcvInPlace;

const UNIT_STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  move: 'Moving',
  attack: 'Attacking',
  harvest: 'Harvesting',
  return: 'Returning',
};

const WEAPON_NAMES: Record<string, string> = {
  small_arms: 'Small Arms',
  rockets: 'Rockets',
  cannon: 'Cannon',
  gun: 'Auto-Gun',
};

// ── HP bar ────────────────────────────────────────────────────────────────────

function HPBar({ hp, maxHp }: { hp: number; maxHp: number }): React.ReactElement {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const color = ratio > 0.5 ? '#4d8' : ratio > 0.25 ? '#fc4' : '#f44';
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          height: 4,
          background: '#1a2230',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 2,
        }}
      >
        <div style={{ height: '100%', width: `${(ratio * 100).toFixed(1)}%`, background: color }} />
      </div>
      <span style={{ color, fontSize: 10 }}>{hp}</span>
      <span style={{ color: '#445', fontSize: 10 }}>/{maxHp}</span>
    </div>
  );
}

// ── Entity detail ─────────────────────────────────────────────────────────────

function EntityDetail({
  e,
  playerFaction,
}: {
  e: EntUI;
  playerFaction: number;
}): React.ReactElement {
  const fd = FDATA[e.faction] as { name: string; color: string };
  const defName: string = e.isBuilding
    ? (BDEF[e.type]?.name ?? e.type)
    : (UDEF[e.type]?.name ?? e.type);

  const isPrimary = e.isBuilding && state.primaryBuilding?.[e.type] === e.id;

  const handleDeploy = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    const liveEnt = state.entities.find((ent: any) => ent.id === e.id);
    if (!liveEnt) return;
    const b = deployMcvInPlace(liveEnt);
    if (b) {
      state.selected = [b.id];
      // Notify via hud setMsg — lazy import avoids circular dependency
      // @ts-ignore
      import('../hud.js')
        .then((m: any) => m.setMsg('MCV deployed — Command Center established', 180))
        .catch(() => {});
    } else {
      // @ts-ignore
      import('../hud.js')
        .then((m: any) => m.setMsg('No space to deploy here — move MCV to open ground', 150))
        .catch(() => {});
    }
    // Force immediate store sync
    // @ts-ignore
    import('../store.js')
      .then((m: any) => m.syncFromGameState())
      .catch(() => {});
  };

  return (
    <div>
      {/* Name */}
      <div
        style={{
          color: fd.color,
          fontWeight: 'bold',
          fontSize: 11,
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {defName}
        {e.isBuilding && e.trainQ.length > 0 && (
          <span
            style={{
              background: '#4af',
              color: '#000',
              borderRadius: 2,
              padding: '0 3px',
              fontSize: 9,
              marginLeft: 4,
            }}
          >
            ×{e.trainQ.length}
          </span>
        )}
        {isPrimary && (
          <span
            style={{
              background: '#fa4',
              color: '#000',
              borderRadius: 2,
              padding: '0 3px',
              fontSize: 9,
              marginLeft: 4,
            }}
          >
            ★
          </span>
        )}
      </div>

      <HPBar hp={e.hp} maxHp={e.maxHp} />

      {/* Building info */}
      {e.isBuilding && (
        <>
          {!e.done && (
            <div style={{ color: '#99c', fontSize: 10, marginBottom: 2 }}>
              Building: {(e.bprog * 100).toFixed(0)}%
            </div>
          )}
          {e.done && e.trainQ.length > 0 && (
            <>
              <div style={{ color: '#9ab', fontSize: 10, marginBottom: 1 }}>
                Training: {UDEF[e.trainQ[0].type]?.name ?? e.trainQ[0].type}{' '}
                {e.trainQ[0].total > 0
                  ? ((e.trainQ[0].t / e.trainQ[0].total) * 100).toFixed(0)
                  : 0}%
              </div>
              {e.trainQ.length > 1 && (
                <div style={{ color: '#789', fontSize: 10 }}>+{e.trainQ.length - 1} queued</div>
              )}
            </>
          )}
          {e.done && e.dmg > 0 && (
            <div style={{ color: '#789', fontSize: 10, marginTop: 2 }}>
              ATK {e.dmg} · RNG {e.range}
            </div>
          )}
          {e.waypoint && (
            <div style={{ color: '#789', fontSize: 10, marginTop: 2 }}>
              WP: {e.waypoint.tx},{e.waypoint.ty}
            </div>
          )}
          {e.repairing && (
            <div style={{ color: '#4d8', fontSize: 10, marginTop: 2 }}>Repairing…</div>
          )}
        </>
      )}

      {/* Unit info */}
      {!e.isBuilding && (
        <>
          <div style={{ color: '#899', fontSize: 10, marginBottom: 2 }}>
            {UNIT_STATE_LABELS[e.unitState] ?? e.unitState}
          </div>
          {e.type === 'harvester' && (
            <div style={{ fontSize: 10 }}>
              Ore: <span style={{ color: '#8d5' }}>{e.ore}</span>
              <span style={{ color: '#445' }}>/{e.maxOre}</span>
            </div>
          )}
          {e.dmg > 0 && (
            <div style={{ color: '#789', fontSize: 10, marginTop: 2 }}>
              ATK {e.dmg} · RNG {e.range}
              {e.weaponType ? ` · ${WEAPON_NAMES[e.weaponType] ?? e.weaponType}` : ''}
            </div>
          )}
          {e.cargoCapacity > 0 && (
            <div style={{ fontSize: 10, marginTop: 2 }}>
              Troops: <span style={{ color: e.cargoCount > 0 ? '#4af' : '#445' }}>{e.cargoCount}</span>
              <span style={{ color: '#445' }}>/{e.cargoCapacity}</span>
            </div>
          )}
          {e.cargoCapacity > 0 && e.cargoCount > 0 && e.faction === playerFaction && (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                if (state.net) {
                  // @ts-ignore
                  import('../net/netClient.js').then((m: any) => m.scheduleInput({ action: 'unload_transport', transportId: e.id })).catch(() => {});
                } else {
                  // @ts-ignore
                  import('../commands.js').then((m: any) => {
                    m.applyCommand({ action: 'unload_transport', transportId: e.id });
                    // @ts-ignore
                    import('../store.js').then((s: any) => s.syncFromGameState()).catch(() => {});
                  }).catch(() => {});
                }
              }}
              className="build-btn"
              style={{ marginTop: 6, width: '100%', color: '#4af', borderColor: '#2a4a6a' }}
            >
              UNLOAD [F]
            </button>
          )}
          {e.type === 'mcv' && e.faction === playerFaction && (
            <button
              onClick={handleDeploy}
              className="build-btn"
              style={{ marginTop: 6, width: '100%', color: '#4af', borderColor: '#2a4a6a' }}
            >
              DEPLOY MCV [F]
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Info panel ────────────────────────────────────────────────────────────────

export function InfoPanel(): React.ReactElement {
  const sel = useUIStore(s => s.sel);
  const playerFaction = useUIStore(s => s.playerFaction);

  return (
    <div
      style={{
        padding: 8,
        borderBottom: '1px solid #1a2230',
        minHeight: 80,
        flexShrink: 0,
      }}
    >
      {sel.length === 0 ? (
        <span style={{ color: '#668', fontSize: 10 }}>No selection</span>
      ) : (
        <>
          <EntityDetail e={sel[0]} playerFaction={playerFaction} />
          {sel.length > 1 && (
            <div style={{ color: '#789', fontSize: 10, marginTop: 4 }}>
              +{sel.length - 1} selected
            </div>
          )}
        </>
      )}
    </div>
  );
}
