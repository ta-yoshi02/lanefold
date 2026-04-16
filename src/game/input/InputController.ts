import { Scene } from 'phaser';

import { LANEFOLD_CONFIG } from '../config';
import type { Direction, ScreenMode } from '../types';

interface InputControllerOptions {
  getMode: () => ScreenMode;
  onDirection: (direction: Direction) => void;
  onConfirm: () => void;
  onRewardChoice: (index: number) => void;
  onUtility: () => void;
  onRestart: () => void;
  onToggleFullscreen: () => void;
}

const keyToDirection: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
};

export class InputController {
  private pointerDown: { x: number; y: number } | null = null;

  constructor(
    private scene: Scene,
    private options: InputControllerOptions,
  ) {
    this.bindKeyboard();
    this.bindPointer();
  }

  private bindKeyboard(): void {
    this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      const key = event.key;
      const mode = this.options.getMode();

      if (key.toLowerCase() === 'f') {
        this.options.onToggleFullscreen();
        return;
      }

      if (key === 'Enter' || key === ' ') {
        if (mode === 'title') {
          this.options.onConfirm();
        } else if (mode === 'gameover') {
          this.options.onRestart();
        }
        return;
      }

      if (mode === 'reward' && ['1', '2', '3'].includes(key)) {
        this.options.onRewardChoice(Number(key) - 1);
        return;
      }

      if (mode !== 'playing') {
        return;
      }

      if (key.toLowerCase() === 'u') {
        this.options.onUtility();
        return;
      }

      const direction = keyToDirection[key] ?? keyToDirection[key.toLowerCase()];

      if (direction) {
        event.preventDefault();
        this.options.onDirection(direction);
      }
    });
  }

  private bindPointer(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDown = {
        x: pointer.worldX,
        y: pointer.worldY,
      };
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const start = this.pointerDown;

      if (!start || this.options.getMode() !== 'playing') {
        this.pointerDown = null;
        return;
      }

      const deltaX = pointer.worldX - start.x;
      const deltaY = pointer.worldY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      this.pointerDown = null;

      if (
        absX < LANEFOLD_CONFIG.input.swipeThreshold &&
        absY < LANEFOLD_CONFIG.input.swipeThreshold
      ) {
        return;
      }

      if (absX > absY) {
        this.options.onDirection(deltaX > 0 ? 'right' : 'left');
      } else {
        this.options.onDirection(deltaY > 0 ? 'down' : 'up');
      }
    });
  }
}
