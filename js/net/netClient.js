import { uiStore } from '../store.js';
import { state } from '../state.js';

// ── Callback registry (populated by game.js to avoid circular imports) ────────
const _cb = {};
export function registerGameCallbacks(cb) { Object.assign(_cb, cb); }

// ── WebSocket singleton ───────────────────────────────────────────────────────
const handlers = new Map(); // type → Set<fn>
let _ws = null;
let _pingTimer = null;
let _queue = []; // messages sent before connection opens

export const net = {
  connect(url) {
    if (_ws) _ws.close();
    _ws = new WebSocket(url);
    _queue = [];

    _ws.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const set = handlers.get(msg.type);
      if (set) for (const fn of set) fn(msg);
    };

    _ws.onopen = () => {
      uiStore.setState(st => ({ net: { ...st.net, connected: true } }));
      for (const m of _queue) _ws.send(JSON.stringify(m));
      _queue = [];
      _pingTimer = setInterval(() => {
        if (_ws?.readyState === 1) _ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }, 2000);
    };

    _ws.onclose = () => {
      clearInterval(_pingTimer);
      uiStore.setState(st => ({ net: { ...st.net, connected: false } }));
      const set = handlers.get('_disconnect');
      if (set) for (const fn of set) fn({});
    };

    _ws.onerror = () => _ws?.close();
  },

  disconnect() {
    clearInterval(_pingTimer);
    _ws?.close();
    _ws = null;
    _queue = [];
  },

  send(msg) {
    if (_ws?.readyState === 1) _ws.send(JSON.stringify(msg));
    else if (_ws?.readyState === 0) _queue.push(msg);
  },

  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
  },

  off(type, fn) {
    handlers.get(type)?.delete(fn);
  },
};

// ── Input dispatch (rollback netcode) ────────────────────────────────────────
export function scheduleInput(cmd) {
  // Record input for the NEXT tick (which hasn't been simulated yet).
  _cb.scheduleInput?.(cmd);
}

// Keep dispatchCommand as alias for legacy call sites that haven't been migrated yet.
export { scheduleInput as dispatchCommand };

// ── Game-phase message handlers ───────────────────────────────────────────────

// All players receive game_start and run the same simulation
net.on('game_start', msg => {
  const lobby = uiStore.getState().lobby;
  if (!lobby) return;
  const myFaction = msg.slotFactions[lobby.mySlot];
  uiStore.setState(st => ({
    phase: 'playing',
    net: { ...st.net, connected: true, role: 'player' },
  }));
  _cb.startNetGame?.(msg.mapSeed, lobby.mySlot, myFaction, msg.aiSlots, msg.slotFactions);
});

// Player left during game — notify and hand their faction to AI on host
net.on('player_left', msg => _cb.onPlayerLeft?.(msg));

// Kicked from lobby by host
net.on('kicked', () => {
  uiStore.setState({ phase: 'menu', lobby: null, net: { connected: false, role: 'none', latencyMs: 0 }, bootMsg: 'You were removed from the lobby.' });
  net.disconnect();
});

// Host disconnected — return all clients to menu
net.on('error', msg => {
  if (msg.reason === 'host_disconnected') {
    uiStore.setState({ phase: 'menu', lobby: null, net: { connected: false, role: 'none', latencyMs: 0 }, bootMsg: 'The host disconnected.' });
    net.disconnect();
    _cb.showMenu?.();
  }
});

// Desync detected by server
net.on('desync', msg => {
  uiStore.setState({ desync: true });
  if (state.syncDebug) {
    state.syncDebug.resyncs++;
    state.syncDebug.lastDesyncTick = msg.tick ?? 0;
    state.syncDebug.diverged = msg.diverged ?? [];
  }
});

// Latency measurement
net.on('pong', msg => {
  const latencyMs = Date.now() - (msg.t ?? 0);
  uiStore.setState(st => ({ net: { ...st.net, latencyMs } }));
  if (state.net) state.net.latencyMs = latencyMs;
});

// Server-triggered resync: host dumps full state; non-hosts apply it
net.on('resync_request', msg => {
  _cb.handleResyncRequest?.(msg.sourceSlot);
});

net.on('state_dump', msg => {
  _cb.handleStateDump?.(msg.snap);
});
