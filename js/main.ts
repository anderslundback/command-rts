import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
// @ts-ignore
import { HUD_H, SIDEBAR_W } from './constants.js';
// @ts-ignore
import { state as _state } from './state.js';
const state: any = _state;
// @ts-ignore
import { initInput, clampCam } from './input.js';

function init() {
  createRoot(document.getElementById('ui-root')!).render(React.createElement(App));

  state.canvas = document.getElementById('canvas');
  state.ctx = state.canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  initInput();

  // Push a sentinel so the browser has a "back" target that stays on this page.
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    if (state.gameStarted && !state.gameOver) {
      history.pushState(null, '', location.href);
    }
  });
  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    if (state.gameStarted && !state.gameOver) {
      e.preventDefault();
    }
  });

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
