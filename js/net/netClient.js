import { uiStore } from '../store.js';

// ── Callback registry (populated by game.js to avoid circular imports) ────────
const _cb = {};
export function registerGameCallbacks(cb) { Object.assign(_cb, cb); }

// ── WebSocket singleton ───────────────────────────────────────────────────────
const handlers = new Map(); // type → Set<fn>
let _ws = null;
let _pingTimer = null;

export const net = {
  connect(url) {
    if (_ws) _ws.close();
    _ws = new WebSocket(url);

    _ws.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const set = handlers.get(msg.type);
      if (set) for (const fn of set) fn(msg);
    };

    _ws.onopen = () => {
      uiStore.setState(st => ({ net: { ...st.net, connected: true } }));
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
  },

  send(msg) {
    if (_ws?.readyState === 1) _ws.send(JSON.stringify(msg));
  },

  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
  },

  off(type, fn) {
    handlers.get(type)?.delete(fn);
  },
};

// ── Command dispatch (client → server relay → host) ───────────────────────────
let _seq = 0;
export function dispatchCommand(cmd) {
  net.send({ type: 'cmd', seq: ++_seq, cmd });
}

// ── Game-phase message handlers ───────────────────────────────────────────────

// Host receives relayed commands from clients
net.on('cmd', msg => _cb.onCmd?.(msg));

// Clients receive state snapshots from host
net.on('snapshot', msg => _cb.applySnapshot?.(msg));

// All players receive game_start — host and clients both call startNetGame
net.on('game_start', msg => {
  const lobby = uiStore.getState().lobby;
  if (!lobby) return;
  const role = lobby.isHost ? 'host' : 'client';
  const myFaction = msg.slotFactions[lobby.mySlot];
  uiStore.setState(st => ({
    phase: 'playing',
    net: { ...st.net, connected: true, role },
  }));
  _cb.startNetGame?.(msg.mapSeed, myFaction, role, msg.aiSlots);
});

// Host disconnected — return all clients to menu
net.on('error', msg => {
  if (msg.reason === 'host_disconnected') {
    uiStore.setState({ phase: 'menu', lobby: null, net: { connected: false, role: 'none', latencyMs: 0 } });
    net.disconnect();
    _cb.showMenu?.();
  }
});

// Latency measurement
net.on('pong', msg => {
  uiStore.setState(st => ({ net: { ...st.net, latencyMs: Date.now() - (msg.t ?? 0) } }));
});
