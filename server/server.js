import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ?? 3001;
const wss = new WebSocketServer({ port: PORT });

// Prune connections that dropped without a clean close (mobile, bad networks).
// Uses the ws protocol-level ping/pong, separate from our JSON ping/pong.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);
wss.on('close', () => clearInterval(heartbeat));

// code → { hostWs, slots: Map<slot→ws>, players: PlayerEntry[] }
const rooms = new Map();
// ws → { code, slot }
const clients = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.random() * chars.length | 0]).join(''); }
  while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, excludeWs = null) {
  for (const [, ws] of room.slots) {
    if (ws !== excludeWs) send(ws, msg);
  }
}

function lobbyUpdate(room) {
  broadcast(room, { type: 'lobby_update', players: room.players });
}

function makeAiPlayer(slot, faction) {
  return { slot, name: `AI`, faction, ready: true, isHost: false, isAI: true, latencyMs: 0 };
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const meta = clients.get(ws);

    switch (msg.type) {
      case 'create_room': {
        const code = genCode();
        const player = { slot: 0, name: msg.name || 'Player 1', faction: 0, ready: false, isHost: true, isAI: false, latencyMs: 0 };
        const room = {
          hostWs: ws,
          slots: new Map([[0, ws]]),
          players: [player, makeAiPlayer(1, 1), makeAiPlayer(2, 2)],
        };
        rooms.set(code, room);
        clients.set(ws, { code, slot: 0 });
        send(ws, { type: 'room_created', code, slot: 0, players: room.players });
        break;
      }

      case 'join_room': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { type: 'error', reason: 'room_not_found' }); return; }
        // Find first AI slot to replace
        let slot = -1;
        for (const p of room.players) {
          if (p.isAI) { slot = p.slot; break; }
        }
        if (slot === -1) { send(ws, { type: 'error', reason: 'room_full' }); return; }

        const player = { slot, name: msg.name || `Player ${slot + 1}`, faction: slot, ready: false, isHost: false, isAI: false, latencyMs: 0 };
        room.players[slot] = player;
        room.slots.set(slot, ws);
        clients.set(ws, { code, slot });

        send(ws, { type: 'room_joined', code, slot, players: room.players });
        broadcast(room, { type: 'lobby_update', players: room.players }, ws);
        break;
      }

      case 'lobby_ready': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        room.players[meta.slot].ready = msg.ready;
        lobbyUpdate(room);
        break;
      }

      case 'lobby_faction': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        room.players[meta.slot].faction = msg.faction;
        lobbyUpdate(room);
        break;
      }

      case 'lobby_ai_faction': {
        // Host changes an AI slot's faction
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const p = room.players[msg.slot];
        if (p?.isAI) { p.faction = msg.faction; lobbyUpdate(room); }
        break;
      }

      case 'chat_msg': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        const player = room.players[meta.slot];
        broadcast(room, { type: 'chat_msg', slot: meta.slot, name: player.name, text: String(msg.text).slice(0, 200) });
        break;
      }

      case 'start_game': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const humanPlayers = room.players.filter(p => !p.isAI);
        const allReady = humanPlayers.filter(p => !p.isHost).every(p => p.ready);
        if (!allReady) { send(ws, { type: 'error', reason: 'not_all_ready' }); return; }

        const mapSeed = (Math.random() * 0xffffffff) >>> 0;
        const slotFactions = room.players.map(p => p.faction);
        const aiSlots = room.players.map(p => p.isAI);

        broadcast(room, { type: 'game_start', mapSeed, slotFactions, aiSlots });
        break;
      }

      case 'cmd': {
        // Client → relay to host
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        send(room.hostWs, { type: 'cmd', seq: msg.seq, slot: meta.slot, cmd: msg.cmd });
        break;
      }

      case 'snapshot': {
        // Host → relay to all clients (strip type, re-wrap)
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const packed = JSON.stringify(msg);
        for (const [slot, clientWs] of room.slots) {
          if (clientWs !== ws && clientWs.readyState === 1) clientWs.send(packed);
        }
        break;
      }

      case 'ping':
        send(ws, { type: 'pong', t: msg.t });
        break;
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (!meta) return;
    clients.delete(ws);
    const room = rooms.get(meta.code);
    if (!room) return;

    if (room.hostWs === ws) {
      // Host left — tear down room
      broadcast(room, { type: 'error', reason: 'host_disconnected' });
      rooms.delete(meta.code);
    } else {
      // Replace departing human with AI
      const slot = meta.slot;
      room.slots.delete(slot);
      room.players[slot] = makeAiPlayer(slot, room.players[slot].faction);
      lobbyUpdate(room);
    }
  });
});

console.log(`COMMAND server listening on ws://localhost:${PORT}`);
