import React from 'react';
import { useUIStore, uiStore, type PlayerEntry } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';
// @ts-ignore
import { net } from '../net/netClient.js';

const FACTION_NAMES = (FDATA as any[]).map((f: any) => f.name);

function PlayerRow({ player, mySlot, isHost }: { player: PlayerEntry; mySlot: number; isHost: boolean }) {
  const isMe = player.slot === mySlot;
  const canEditFaction = isMe || (isHost && player.isAI);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #0e1e2e' }}>
      <span style={{ color: '#446', fontSize: 10, width: 20, textAlign: 'right' }}>{player.slot}</span>
      <span style={{ flex: 1, color: player.isAI ? '#3a5060' : '#9ab', fontSize: 12, letterSpacing: 1 }}>
        {player.isAI ? 'AI' : player.name}
        {isMe && <span style={{ color: '#4af', marginLeft: 6 }}>(you)</span>}
        {player.isHost && !player.isAI && <span style={{ color: '#668', marginLeft: 6 }}>HOST</span>}
      </span>
      <select
        value={player.faction}
        disabled={!canEditFaction}
        onChange={e => {
          const faction = Number(e.target.value);
          if (player.isAI && isHost) {
            net.send({ type: 'lobby_ai_faction', slot: player.slot, faction });
          } else if (isMe) {
            net.send({ type: 'lobby_faction', faction });
          }
        }}
        style={{
          background: '#060d14', border: '1px solid #1a2230', color: '#9ab',
          fontFamily: "'Courier New', monospace", fontSize: 10, padding: '2px 4px',
          opacity: canEditFaction ? 1 : 0.4, cursor: canEditFaction ? 'pointer' : 'default',
        }}
      >
        {FACTION_NAMES.map((name: string, i: number) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>
      <span style={{ width: 60, textAlign: 'center', fontSize: 10 }}>
        {player.isAI
          ? <span style={{ color: '#3a5060' }}>AI</span>
          : player.ready
          ? <span style={{ color: '#4d8' }}>● READY</span>
          : <span style={{ color: '#668' }}>○ waiting</span>
        }
      </span>
    </div>
  );
}

export function LobbyScreen(): React.ReactElement {
  const lobby = useUIStore(s => s.lobby);
  const [chatInput, setChatInput] = React.useState('');
  const chatRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!lobby) return;

    const onLobbyUpdate = (msg: any) => {
      uiStore.setState((st: any) => ({
        lobby: st.lobby ? { ...st.lobby, players: msg.players } : null,
      }));
    };
    const onChatMsg = (msg: any) => {
      uiStore.setState((st: any) => ({
        lobby: st.lobby
          ? { ...st.lobby, chatMessages: [...st.lobby.chatMessages, { slot: msg.slot, name: msg.name, text: msg.text }].slice(-50) }
          : null,
      }));
    };
    const onDisconnect = () => {
      uiStore.setState({ phase: 'menu', lobby: null, net: { connected: false, role: 'none', latencyMs: 0 } });
    };

    net.on('lobby_update', onLobbyUpdate);
    net.on('chat_msg', onChatMsg);
    net.on('_disconnect', onDisconnect);
    return () => {
      net.off('lobby_update', onLobbyUpdate);
      net.off('chat_msg', onChatMsg);
      net.off('_disconnect', onDisconnect);
    };
  }, [!!lobby]);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [lobby?.chatMessages.length]);

  if (!lobby) return <></>;

  const { roomCode, players, chatMessages, mySlot, isHost } = lobby;
  const humanPlayers = players.filter(p => !p.isAI);
  const allGuestsReady = humanPlayers.filter(p => !p.isHost).every(p => p.ready);
  const myPlayer = players[mySlot];
  const amReady = myPlayer?.ready ?? false;

  const handleReady = () => net.send({ type: 'lobby_ready', ready: !amReady });
  const handleStart = () => net.send({ type: 'start_game' });

  const handleLeave = () => {
    net.disconnect();
    uiStore.setState({ phase: 'menu', lobby: null, net: { connected: false, role: 'none', latencyMs: 0 } });
  };

  const handleChat = () => {
    if (!chatInput.trim()) return;
    net.send({ type: 'chat_msg', text: chatInput.trim() });
    setChatInput('');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {});
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto', zIndex: 50, fontFamily: "'Courier New', monospace",
      }}
    >
      <div style={{ width: 600, maxWidth: '96vw' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: 8, color: '#4af', textShadow: '0 0 16px #4af8' }}>
            COMMAND
          </div>
          <button
            onClick={handleCopyCode}
            title="Click to copy"
            style={{
              background: '#080e18', border: '1px solid #1a2230', color: '#668',
              fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 3,
              padding: '3px 8px', cursor: 'pointer',
            }}
          >
            ROOM: {roomCode}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left: players + controls */}
          <div style={{ flex: '0 0 280px' }}>
            <div style={{ color: '#446', fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>PLAYERS</div>
            <div style={{ border: '1px solid #0e1e2e', padding: '4px 8px', marginBottom: 12, background: '#06080e' }}>
              {players.map(p => (
                <PlayerRow key={p.slot} player={p} mySlot={mySlot} isHost={isHost} />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!isHost && (
                <button
                  onClick={handleReady}
                  style={{
                    background: amReady ? '#0a2a18' : '#06080e',
                    border: `2px solid ${amReady ? '#4d8' : '#1a2230'}`,
                    color: amReady ? '#4d8' : '#9ab',
                    fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 2,
                    padding: '8px 0', cursor: 'pointer', width: '100%',
                  }}
                >
                  {amReady ? '● READY' : '○ NOT READY'}
                </button>
              )}
              {isHost && (
                <button
                  onClick={handleStart}
                  disabled={!allGuestsReady}
                  style={{
                    background: allGuestsReady ? '#0a2a18' : '#06080e',
                    border: `2px solid ${allGuestsReady ? '#4d8' : '#1a2230'}`,
                    color: allGuestsReady ? '#4d8' : '#3a5060',
                    fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 'bold',
                    letterSpacing: 2, padding: '8px 0', cursor: allGuestsReady ? 'pointer' : 'default', width: '100%',
                  }}
                >
                  START GAME
                </button>
              )}
              <button
                onClick={handleLeave}
                style={{
                  background: '#06080e', border: '1px solid #3a1818', color: '#644',
                  fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 2,
                  padding: '6px 0', cursor: 'pointer', width: '100%',
                }}
              >
                LEAVE
              </button>
            </div>
          </div>

          {/* Right: chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#446', fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>CHAT</div>
            <div
              ref={chatRef}
              style={{
                flex: 1, minHeight: 180, background: '#06080e', border: '1px solid #0e1e2e',
                padding: '6px 8px', overflowY: 'auto', marginBottom: 8,
              }}
            >
              {chatMessages.length === 0 && (
                <div style={{ color: '#3a5060', fontSize: 10, letterSpacing: 1 }}>No messages yet</div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: '#4af' }}>{m.name}</span>
                  <span style={{ color: '#446' }}>: </span>
                  <span style={{ color: '#9ab' }}>{m.text}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                maxLength={200}
                placeholder="Type a message..."
                style={{
                  flex: 1, background: '#060d14', border: '1px solid #1a2230', color: '#9ab',
                  fontFamily: "'Courier New', monospace", fontSize: 10, padding: '5px 8px', outline: 'none',
                }}
              />
              <button
                onClick={handleChat}
                style={{
                  background: '#06080e', border: '1px solid #1a2230', color: '#668',
                  fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1,
                  padding: '5px 10px', cursor: 'pointer',
                }}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
