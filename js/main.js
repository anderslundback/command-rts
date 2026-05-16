import { HUD_H, SIDEBAR_W } from './constants.js';
import { state } from './state.js';
import { initInput, clampCam } from './input.js';
import { switchTab } from './hud.js';
import { setVolume } from './audio.js';

function init() {
  state.canvas = document.getElementById('canvas');
  state.ctx    = state.canvas.getContext('2d');
  state.radar  = document.getElementById('radar');
  state.radarCtx = state.radar.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  initInput();

  // Expose switchTab globally for inline HTML onclick (build-tabs)
  window.UI = { switchTab };

  // Pause menu wiring
  document.getElementById('pause-resume')?.addEventListener('click', () => {
    import('./game.js').then(m => m.togglePause());
  });
  document.getElementById('pause-settings')?.addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('pause-quit')?.addEventListener('click', () => {
    import('./game.js').then(m => m.showMenu());
  });
  const volSlider = document.getElementById('vol-slider');
  if (volSlider) {
    volSlider.value = state.volume;
    volSlider.addEventListener('input', ev => {
      state.volume = +ev.target.value;
      setVolume(state.volume);
    });
  }

  // Menu idle background
  const menuLoop = () => {
    if (!state.gameStarted) {
      state.ctx.fillStyle = '#050810';
      state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
      requestAnimationFrame(menuLoop);
    }
  };
  menuLoop();
}

function resize() {
  state.canvas.width  = window.innerWidth  - SIDEBAR_W;
  state.canvas.height = window.innerHeight - HUD_H;
  clampCam();
}

init();
