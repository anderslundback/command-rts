import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ?? 3001;
const wss = new WebSocketServer({ port: PORT });

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);
wss.on('close', () => clearInterval(heartbeat));

// code → { hostWs, slots: Map<slot→ws>, players: PlayerEntry[], gameStarted }
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
  return { slot, name: 'AI', faction, ready: true, isHost: false, isAI: true, isEmpty: false, latencyMs: 0 };
}

function makeEmptySlot(slot) {
  return { slot, name: '—', faction: null, ready: true, isHost: false, isAI: false, isEmpty: true, latencyMs: 0 };
}

function pickFreeFaction(players, excludeSlot) {
  const taken = new Set(players.filter((p, i) => i !== excludeSlot && !p.isEmpty).map(p => p.faction));
  for (let f = 0; f < 3; f++) if (!taken.has(f)) return f;
  return 0;
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
        const player = { slot: 0, name: msg.name || 'Player 1', faction: 0, ready: false, isHost: true, isAI: false, isEmpty: false, latencyMs: 0 };
        const room = {
          hostWs: ws,
          slots: new Map([[0, ws]]),
          players: [player, makeEmptySlot(1), makeEmptySlot(2)],
          gameStarted: false,
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
        if (room.gameStarted) { send(ws, { type: 'error', reason: 'game_in_progress' }); return; }
        // Replace an AI slot first; fall back to an empty (open) slot
        let slot = -1;
        for (const p of room.players) {
          if (p.isAI) { slot = p.slot; break; }
        }
        if (slot === -1) {
          for (const p of room.players) {
            if (p.isEmpty) { slot = p.slot; break; }
          }
        }
        if (slot === -1) { send(ws, { type: 'error', reason: 'room_full' }); return; }

        const faction = pickFreeFaction(room.players, slot);
        const player = { slot, name: msg.name || `Player ${slot + 1}`, faction, ready: false, isHost: false, isAI: false, isEmpty: false, latencyMs: 0 };
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
        if (room.players.some((p, i) => i !== meta.slot && !p.isEmpty && p.faction === msg.faction)) {
          send(ws, { type: 'error', reason: 'faction_taken' }); return;
        }
        room.players[meta.slot].faction = msg.faction;
        lobbyUpdate(room);
        break;
      }

      case 'lobby_ai_faction': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const p = room.players[msg.slot];
        if (!p?.isAI) return;
        if (room.players.some((q, i) => i !== msg.slot && !q.isEmpty && q.faction === msg.faction)) {
          send(ws, { type: 'error', reason: 'faction_taken' }); return;
        }
        p.faction = msg.faction;
        lobbyUpdate(room);
        break;
      }

      case 'lobby_remove_slot': {
        // Host removes an AI slot (makes it empty) or kicks a human player
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const p = room.players[msg.slot];
        if (!p || p.isHost || p.isEmpty) return;
        if (!p.isAI) {
          const kickWs = room.slots.get(msg.slot);
          if (kickWs) { send(kickWs, { type: 'kicked' }); kickWs.close(); }
          room.slots.delete(msg.slot);
        }
        room.players[msg.slot] = makeEmptySlot(msg.slot);
        lobbyUpdate(room);
        break;
      }

      case 'lobby_add_ai': {
        // Host restores an empty slot as AI
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || room.hostWs !== ws) return;
        const p = room.players[msg.slot];
        if (!p?.isEmpty) return;
        const faction = pickFreeFaction(room.players, msg.slot);
        room.players[msg.slot] = makeAiPlayer(msg.slot, faction);
        lobbyUpdate(room);
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
        const humanPlayers = room.players.filter(p => !p.isAI && !p.isEmpty);
        const allReady = humanPlayers.filter(p => !p.isHost).every(p => p.ready);
        if (!allReady) { send(ws, { type: 'error', reason: 'not_all_ready' }); return; }
        // Validate unique factions among active slots
        const active = room.players.filter(p => !p.isEmpty);
        const factions = active.map(p => p.faction);
        if (new Set(factions).size !== factions.length) {
          send(ws, { type: 'error', reason: 'duplicate_factions' }); return;
        }
        const mapSeed = (Math.random() * 0xffffffff) >>> 0;
        const slotFactions = room.players.map(p => p.isEmpty ? null : p.faction);
        const aiSlots = room.players.map(p => !p.isEmpty && p.isAI);
        room.mapSeed = mapSeed; room.slotFactions = slotFactions; room.aiSlots = aiSlots;
        broadcast(room, { type: 'game_start', mapSeed, slotFactions, aiSlots });
        room.gameStarted = true;
        break;
      }

      case 'input': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        // Broadcast input to all other players in the room
        broadcast(room, { type: 'input', tick: msg.tick, slot: meta.slot, cmd: msg.cmd }, ws);
        // Also relay to spectators (they simulate from real inputs with a delay buffer)
        for (const specWs of room.spectators ?? []) {
          send(specWs, { type: 'input', tick: msg.tick, slot: meta.slot, cmd: msg.cmd });
        }
        break;
      }

      case 'state_hash': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room) return;
        room.hashes ??= {};
        room.canonicalTick ??= 0;
        room.hashes[msg.tick] ??= {};
        room.hashes[msg.tick][meta.slot] = { hash: msg.hash, debug: msg.debug ?? null };
        const entries = Object.values(room.hashes[msg.tick]);
        const humanCount = room.players.filter(p => !p.isAI && !p.isEmpty).length;
        if (entries.length >= humanCount) {
          const hashes = entries.map(e => e.hash);
          if (hashes.every(h => h === hashes[0])) {
            room.canonicalTick = Math.max(room.canonicalTick, msg.tick);
          } else {
            // Find which components diverged
            const debugEntries = entries.map(e => e.debug).filter(Boolean);
            const diverged = debugEntries.length >= 2
              ? ['entityH', 'creditsH', 'rngH', 'shellH', 'mapH'].filter(
                  k => !debugEntries.every(d => d[k] === debugEntries[0][k])
                )
              : [];
            broadcast(room, { type: 'desync', tick: msg.tick, diverged });
            // Rate-limit: at most one resync per 100 ticks
            if (!room._resyncing && (!room._lastResyncTick || msg.tick > room._lastResyncTick + 100)) {
              room._resyncing = true;
              room._lastResyncTick = msg.tick;
              broadcast(room, { type: 'resync_request', canonicalTick: room.canonicalTick, sourceSlot: 0 });
            }
          }
        }
        // Prune old hash entries
        for (const t of Object.keys(room.hashes)) {
          if (Number(t) < msg.tick - 40) delete room.hashes[t];
        }
        break;
      }

      case 'state_dump': {
        if (!meta) return;
        const room = rooms.get(meta.code);
        if (!room || !room.gameStarted) break;
        // Relay dump to all other players; clear resync lock so future desyncs can trigger another
        broadcast(room, { type: 'state_dump', snap: msg.snap }, ws);
        for (const specWs of room.spectators ?? []) send(specWs, { type: 'state_dump', snap: msg.snap });
        room._resyncing = false;
        break;
      }

      case 'spectate_room': {
        const code = msg.code?.toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { type: 'error', reason: 'room_not_found' }); return; }
        room.spectators ??= new Set();
        room.spectators.add(ws);
        clients.set(ws, { code, slot: -1, isSpectator: true });
        send(ws, { type: 'spectate_ok', mapSeed: room.mapSeed, slotFactions: room.slotFactions, aiSlots: room.aiSlots });
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

    // Spectator disconnect — just remove from the set
    if (meta.isSpectator) {
      room.spectators?.delete(ws);
      return;
    }

    const slot = meta.slot;
    const name = room.players[slot]?.name ?? 'Player';
    room.slots.delete(slot);
    if (room.gameStarted) {
      // Notify all players; each client will hand the departed faction to AI locally
      broadcast(room, { type: 'player_left', slot, name });
      if (room.slots.size === 0) { rooms.delete(meta.code); return; }
    } else {
      // In lobby: replace with AI
      room.players[slot] = makeAiPlayer(slot, room.players[slot]?.faction ?? slot);
      // If the host left, promote another human or dissolve
      if (room.hostWs === ws) {
        const newHost = [...room.slots.values()][0];
        if (newHost) {
          room.hostWs = newHost;
          const newMeta = clients.get(newHost);
          if (newMeta) room.players[newMeta.slot].isHost = true;
        } else {
          rooms.delete(meta.code);
          return;
        }
      }
      lobbyUpdate(room);
    }
  });
});

console.log(`COMMAND server listening on ws://localhost:${PORT}`);
