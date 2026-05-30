import React from 'react';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import { FDATA } from '../constants.js';
// @ts-ignore
import { applyCommand } from '../commands.js';
// @ts-ignore
import { scheduleInput } from '../net/netClient.js';
import { useUIStore, syncFromGameState, type PlayerEntry } from '../store';

const state: any = (_S as any).state;
const FACTIONS = (FDATA as any[]);

// Route a diplomacy command through the same path as gameplay orders: in
// multiplayer it goes through rollback scheduleInput (recorded + relayed);
// in skirmish we apply directly + nudge the UI store. Either way it ends up
// in the engine's applyCommand switch, so behaviour is identical across modes.
function dispatchDiplomacy(cmd: any): void {
  if (state.net) {
    scheduleInput(cmd);
  } else {
    applyCommand(cmd);
    syncFromGameState();
  }
}

interface Row {
  key: string;
  slot: number | null;
  name: string;
  faction: number | null; // null = spectator
  isYou: boolean;
  isAI: boolean;
  isHost: boolean;
  eliminated: boolean;
}

// Derive the list of "who's in this game" from whichever data is authoritative
// for the current mode: in multiplayer the lobby state carries every named
// player (and spectators sit there as faction === null); in skirmish we fall
// back to inferring from state.net (if a net-game is running without a lobby)
// or the local playerFaction + factionEliminated array.
function buildRows(lobby: any, mySlot: number, playerFaction: number, factionEliminated: boolean[]): Row[] {
  if (lobby) {
    return (lobby.players as PlayerEntry[])
      .filter(p => !p.isEmpty)
      .map(p => ({
        key: `slot-${p.slot}`,
        slot: p.slot,
        name: p.isAI ? `AI · ${FACTIONS[p.faction ?? 0]?.name ?? 'unknown'}` : p.name,
        faction: p.faction,
        isYou: p.slot === mySlot && !p.isAI,
        isAI: p.isAI,
        isHost: p.isHost,
        eliminated: p.faction != null ? !!factionEliminated[p.faction] : false,
      }));
  }
  // Skirmish: three faction slots, derive who's who from the local game state.
  return [0, 1, 2].map(f => ({
    key: `faction-${f}`,
    slot: null,
    name: f === playerFaction ? 'You' : 'AI',
    faction: f,
    isYou: f === playerFaction,
    isAI: f !== playerFaction,
    isHost: false,
    eliminated: !!factionEliminated[f],
  }));
}

function FactionBadge({ faction }: { faction: number | null }) {
  if (faction == null) {
    return (
      <span style={{
        display: 'inline-block', minWidth: 90, padding: '2px 8px',
        background: '#0a0e16', border: '1px solid #1a2230',
        color: '#668', fontSize: 10, letterSpacing: 2, textAlign: 'center',
      }}>
        SPECTATOR
      </span>
    );
  }
  const fd = FACTIONS[faction];
  return (
    <span style={{
      display: 'inline-block', minWidth: 90, padding: '2px 8px',
      background: fd.dark, border: `1px solid ${fd.color}`,
      color: fd.light, fontSize: 10, letterSpacing: 2, textAlign: 'center',
      fontWeight: 'bold',
    }}>
      {fd.name}
    </span>
  );
}

function AllyControl({ row, myFaction }: { row: Row; myFaction: number }) {
  // Show nothing for spectators, your own row, eliminated players, or rows
  // without a faction binding (no one to ally with).
  if (row.faction == null || row.isYou || row.eliminated) return null;
  const a = state.alliances;
  const iAlly = !!(a && a[myFaction] && a[myFaction][row.faction]);
  const theyAlly = !!(a && a[row.faction] && a[row.faction][myFaction]);
  const mutual = iAlly && theyAlly;
  const onToggle = () => {
    dispatchDiplomacy({ action: 'set_ally', faction: myFaction, target: row.faction, on: !iAlly });
  };
  return (
    <button
      onClick={onToggle}
      title={mutual ? 'Mutual alliance' : iAlly ? 'You allied; awaiting reciprocation' : 'Click to ally'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: mutual ? '#0e2a18' : iAlly ? '#1a1808' : 'transparent',
        border: `1px solid ${mutual ? '#4d8' : iAlly ? '#aa7' : '#334'}`,
        color: mutual ? '#4d8' : iAlly ? '#cc8' : '#aab',
        fontFamily: "'Courier New', monospace",
        fontSize: 10, letterSpacing: 1,
        padding: '2px 8px',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1 }}>{iAlly ? '☑' : '☐'}</span>
      ALLY
      {iAlly && !theyAlly && (
        <span style={{ color: '#998', fontSize: 9, marginLeft: 2 }}>· unilateral</span>
      )}
    </button>
  );
}

function PlayerRow({ row, myFaction }: { row: Row; myFaction: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 10px',
      borderBottom: '1px solid #0e1e2e',
      background: row.isYou ? 'rgba(74,170,255,0.06)' : 'transparent',
      opacity: row.eliminated ? 0.45 : 1,
    }}>
      <FactionBadge faction={row.faction} />
      <span style={{
        flex: 1,
        color: row.isAI ? '#9ab' : (row.faction == null ? '#cce' : '#fff'),
        fontSize: 12, letterSpacing: 1,
        textDecoration: row.eliminated ? 'line-through' : 'none',
      }}>
        {row.name}
        {row.isYou && <span style={{ color: '#4af', marginLeft: 6 }}>(you)</span>}
        {row.isHost && !row.isAI && <span style={{ color: '#cca', marginLeft: 6 }}>HOST</span>}
      </span>
      {row.eliminated && (
        <span style={{ color: '#f88', fontSize: 9, letterSpacing: 2 }}>ELIMINATED</span>
      )}
      <AllyControl row={row} myFaction={myFaction} />
    </div>
  );
}

function Section({ title, rows, myFaction }: { title: string; rows: Row[]; myFaction: number }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        color: '#bbb', fontSize: 9, letterSpacing: 3,
        padding: '0 4px 4px',
      }}>
        {title} · {rows.length}
      </div>
      <div style={{ background: '#06080e', border: '1px solid #0e1e2e' }}>
        {rows.map(r => <PlayerRow key={r.key} row={r} myFaction={myFaction} />)}
      </div>
    </div>
  );
}

function AlliedVictoryToggle({ myFaction }: { myFaction: number }) {
  const on = !!state.alliedVictory?.[myFaction];
  const onToggle = () => {
    dispatchDiplomacy({ action: 'set_allied_victory', faction: myFaction, on: !on });
  };
  return (
    <button
      onClick={onToggle}
      title="Win together with mutually-allied factions when you're the last bloc standing"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%',
        background: on ? '#0e2a18' : '#06080e',
        border: `1px solid ${on ? '#4d8' : '#5a4030'}`,
        color: on ? '#4d8' : '#ffd24a',
        fontFamily: "'Courier New', monospace",
        fontSize: 11, letterSpacing: 2,
        padding: '8px 12px',
        cursor: 'pointer',
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }}>{on ? '☑' : '☐'}</span>
      ALLIED VICTORY
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 9, color: on ? '#9d8' : '#cb9', letterSpacing: 1 }}>
        {on ? 'win together with mutual allies' : 'click to share victory'}
      </span>
    </button>
  );
}

export function DiplomacyPanel(): React.ReactElement {
  const lobby = useUIStore(s => s.lobby);
  const playerFaction = useUIStore(s => s.playerFaction);

  const handleClose = () => {
    state.diplomacyOpen = false;
    syncFromGameState();
  };

  // factionEliminated lives on the engine state singleton (not snapshotted into
  // the UI store), so read it directly. It's an array of 3 booleans set by
  // gameLoop.js when a faction's structures all hit zero.
  const factionEliminated: boolean[] = state.factionEliminated ?? [false, false, false];
  const mySlot: number = state.net?.mySlot ?? 0;

  const rows = buildRows(lobby, mySlot, playerFaction, factionEliminated);
  const players = rows.filter(r => r.faction != null);
  const spectators = rows.filter(r => r.faction == null);

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto', zIndex: 60, fontFamily: "'Courier New', monospace",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: '92vw',
          background: '#040810', border: '1px solid #1a2a40',
          padding: 18, boxShadow: '0 0 48px rgba(74,170,255,0.10)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{
            fontSize: 18, letterSpacing: 6, color: '#4af',
            textShadow: '0 0 12px rgba(74,170,255,0.5)',
          }}>
            DIPLOMACY
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ color: '#446', fontSize: 9, letterSpacing: 2 }}>F1 / ESC</div>
        </div>

        <Section title="PLAYERS" rows={players} myFaction={playerFaction} />
        {players.length > 1 && <AlliedVictoryToggle myFaction={playerFaction} />}
        <Section title="SPECTATORS" rows={spectators} myFaction={playerFaction} />

        {players.length === 0 && spectators.length === 0 && (
          <div style={{ color: '#bbb', fontSize: 11, padding: 12, textAlign: 'center' }}>
            No player info available.
          </div>
        )}
      </div>
    </div>
  );
}
