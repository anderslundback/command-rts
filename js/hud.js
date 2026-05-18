import { state } from './state.js';
import { syncFromGameState } from './store.js';

export function setMsg(m, dur = 180) {
  state.statusMsg = m;
  state.statusTimer = dur;
}

export function updateHUD() {
  syncFromGameState();
}

export function updateBuildPanel() {
  syncFromGameState();
}

export function switchTab(tab) {
  state.activeTab = tab;
  syncFromGameState();
}
