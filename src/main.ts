import { AUTO, Game, Scale } from 'phaser';

import './style.css';
import { LANEFOLD_CONFIG } from './game/config';
import { LanefoldScene } from './game/scenes/LanefoldScene';
import './game/runtime/testingHooks';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Expected #app container for Lanefold.');
}

const game = new Game({
  type: AUTO,
  parent: app,
  width: LANEFOLD_CONFIG.viewport.width,
  height: LANEFOLD_CONFIG.viewport.height,
  backgroundColor: '#091018',
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
  },
  render: {
    antialias: true,
  },
  scene: [LanefoldScene],
});

declare global {
  interface Window {
    lanefoldGame?: Game;
  }
}

window.lanefoldGame = game;
