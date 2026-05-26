import { uiStore } from './store.js';
import { state } from './state.js';

// ── Ring Buffer ────────────────────────────────────────────────────────────

const RING_SIZE = 50;
const _buf = new Array(RING_SIZE);
let _head = 0, _count = 0;

function _push(level, args) {
  _buf[_head] = {
    t: new Date().toISOString(),
    level,
    msg: args.map(a => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
      try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
      catch { return '[unserializable]'; }
    }).join(' '),
  };
  _head = (_head + 1) % RING_SIZE;
  if (_count < RING_SIZE) _count++;
}

export function initRingBuffer() {
  const origError = console.error.bind(console);
  const origWarn  = console.warn.bind(console);
  console.error = (...args) => { _push('error', args); origError(...args); };
  console.warn  = (...args) => { _push('warn',  args); origWarn(...args); };

  window.addEventListener('error', e => {
    _push('uncaught', [`${e.message} @ ${e.filename}:${e.lineno}`]);
    if (state.gameStarted && !state.gameOver) _autoOpen();
  });
  window.addEventListener('unhandledrejection', e => {
    _push('rejection', [String(e.reason)]);
    if (state.gameStarted && !state.gameOver) _autoOpen();
  });
}

// Debounced so a burst of errors only opens the modal once
let _autoOpenTimer = null;
function _autoOpen() {
  if (_autoOpenTimer) return;
  _autoOpenTimer = setTimeout(() => {
    _autoOpenTimer = null;
    if (!uiStore.getState().bugReportOpen) openBugReport(true);
  }, 500);
}

function _getLogs() {
  const out = [];
  const start = _count < RING_SIZE ? 0 : _head;
  for (let i = 0; i < _count; i++) out.push(_buf[(start + i) % RING_SIZE]);
  return out;
}

// ── Captured data (set synchronously at open time) ─────────────────────────

let _screenshot = null;
let _gameState  = null;
let _wasManuallyPaused = false;
let _autoTriggered = false;

export function getCaptured() {
  return { screenshot: _screenshot, gameState: _gameState, autoTriggered: _autoTriggered };
}

// ── Open / Close ───────────────────────────────────────────────────────────

export function openBugReport(auto = false) {
  _screenshot    = _captureScreenshot(state.canvas);
  _gameState     = _captureGameState();
  _autoTriggered = auto;

  _wasManuallyPaused = state.paused;
  if (!state.net) state.paused = true;

  uiStore.setState({ bugReportOpen: true });
}

export function closeBugReport() {
  if (!state.net && !_wasManuallyPaused) state.paused = false;
  _screenshot    = null;
  _gameState     = null;
  _autoTriggered = false;
  uiStore.setState({ bugReportOpen: false });
}

// ── Screenshot ─────────────────────────────────────────────────────────────

function _captureScreenshot(canvas) {
  if (!canvas) return null;
  const MAX_W = 960, MAX_H = 540;
  const scale = Math.min(1, MAX_W / canvas.width, MAX_H / canvas.height);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
  return tmp.toDataURL('image/jpeg', 0.6);
}

// ── Game State ─────────────────────────────────────────────────────────────

function _captureGameState() {
  return {
    tick: state.tick,
    mapSeed: state.mapSeed ?? null,
    playerFaction: state.playerFaction,
    credits: [...state.credits],
    unitCount:     state.entities.filter(e => !e.dead && !e.isBuilding).length,
    buildingCount: state.entities.filter(e => !e.dead &&  e.isBuilding).length,
    isMultiplayer: !!state.net,
    elapsedTicks:  state.tick - (state.gameStats?.startTick ?? 0),
  };
}

// ── Rate Limiting (client-side guard) ──────────────────────────────────────

const COOLDOWN_MS  = 60_000;
const COOLDOWN_KEY = 'cmdLastBugReport';

export function getCooldownRemaining() {
  return Math.max(0, COOLDOWN_MS - (Date.now() - Number(localStorage.getItem(COOLDOWN_KEY) ?? 0)));
}

// ── Submit ─────────────────────────────────────────────────────────────────

const PENDING_KEY = 'cmdPendingBugReport';

function _apiBase() {
  const ws = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001').replace(/\/$/, '');
  return ws.replace(/^wss/, 'https').replace(/^ws/, 'http');
}

async function _post(payload) {
  const res = await fetch(`${_apiBase()}/api/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function submitBugReport(description) {
  const payload = {
    description,
    screenshot: _screenshot,
    systemInfo: {
      userAgent:  navigator.userAgent,
      resolution: `${screen.width}x${screen.height}`,
      viewport:   `${window.innerWidth}x${window.innerHeight}`,
      ts: new Date().toISOString(),
    },
    gameState: _gameState,
    logs: _getLogs(),
  };

  try {
    await _post(payload);
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    localStorage.removeItem(PENDING_KEY);
    return { ok: true };
  } catch {
    // Screenshot is too large for localStorage — drop it for the offline copy
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, screenshot: null }));
    return { ok: false };
  }
}

export async function retryPendingReport() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    await _post(JSON.parse(raw));
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch { /* will retry next boot */ }
}
