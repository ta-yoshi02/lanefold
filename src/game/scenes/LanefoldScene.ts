import { Scene } from 'phaser';

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LANEFOLD_CONFIG,
  tileDisplayValue,
} from '../config';
import { InputController } from '../input/InputController';
import { LanefoldRun } from '../runtime/LanefoldRun';
import { bindTestingRun } from '../runtime/testingHooks';
import type {
  Enemy,
  LossReason,
} from '../types';

interface EnemyView {
  container: Phaser.GameObjects.Container;
  hpText: Phaser.GameObjects.Text;
}

function tilePalette(rank: number): { fill: number; text: string; stroke: number } {
  const fills = [
    0x3a5166,
    0x6ab7c8,
    0xf3b562,
    0xff8c61,
    0xe45d7a,
    0xb880ff,
    0x72e087,
    0xf7d08a,
  ];

  const fill = fills[(rank - 1) % fills.length] ?? fills[0];
  const text = rank >= 4 ? '#091018' : '#f7f0df';
  const stroke = rank >= 4 ? 0x091018 : 0xf7f0df;

  return { fill, text, stroke };
}

function enemyColors(kind: Enemy['kind']): { body: number; core: number } {
  switch (kind) {
    case 'blob':
      return { body: 0xff8f6b, core: 0xffe7bf };
    case 'prism':
      return { body: 0x9d84ff, core: 0xebefff };
    case 'drone':
    default:
      return { body: 0x63d0c7, core: 0xf4f0dd };
  }
}

function formatLoss(reason: LossReason | null): string {
  switch (reason) {
    case 'grid_lock':
      return 'Relay grid jammed';
    case 'lane_breach':
      return 'Lane breach';
    default:
      return 'Run ended';
  }
}

export class LanefoldScene extends Scene {
  private readonly run = new LanefoldRun();

  private readonly layout = {
    boardTop: 344,
    cellSize: 108,
    cellGap: 12,
    laneTop: 180,
    hudTop: 62,
    dangerY: 1020,
  };

  private slotRects: Phaser.GameObjects.Rectangle[][] = [];

  private tileRects: Phaser.GameObjects.Rectangle[][] = [];

  private tileTexts: Phaser.GameObjects.Text[][] = [];

  private laneBeams: Phaser.GameObjects.Rectangle[] = [];

  private laneCaps: Phaser.GameObjects.Rectangle[] = [];

  private laneLabels: Phaser.GameObjects.Text[] = [];

  private enemyViews = new Map<number, EnemyView>();

  private scoreText!: Phaser.GameObjects.Text;

  private turnText!: Phaser.GameObjects.Text;

  private difficultyText!: Phaser.GameObjects.Text;

  private pressureText!: Phaser.GameObjects.Text;

  private statusText!: Phaser.GameObjects.Text;

  private hintText!: Phaser.GameObjects.Text;

  private titleContainer!: Phaser.GameObjects.Container;

  private gameOverContainer!: Phaser.GameObjects.Container;

  private gameOverTitle!: Phaser.GameObjects.Text;

  private gameOverBody!: Phaser.GameObjects.Text;

  private titleGlow!: Phaser.GameObjects.Ellipse;

  private backgroundOrbs: Phaser.GameObjects.Ellipse[] = [];

  constructor() {
    super('LanefoldScene');
  }

  private get boardWidth(): number {
    return BOARD_WIDTH * this.layout.cellSize + (BOARD_WIDTH - 1) * this.layout.cellGap;
  }

  private get boardLeft(): number {
    return (LANEFOLD_CONFIG.viewport.width - this.boardWidth) / 2;
  }

  public create(): void {
    this.run.titleReady();
    bindTestingRun(this.run);

    this.createBackdrop();
    this.createHud();
    this.createBoard();
    this.createOverlayPanels();

    new InputController(this, {
      getMode: () => this.run.getMode(),
      onDirection: (direction) => {
        this.handleDirection(direction);
      },
      onConfirm: () => {
        this.handleConfirm();
      },
      onRestart: () => {
        this.restartRun();
      },
      onToggleFullscreen: () => {
        this.toggleFullscreen();
      },
    });

    this.events.on('shutdown', () => {
      bindTestingRun(null);
    });
    this.events.on('destroy', () => {
      bindTestingRun(null);
    });

    this.renderScene();
  }

  public update(_time: number, delta: number): void {
    this.run.advanceTime(delta);
    this.renderScene();
  }

  private createBackdrop(): void {
    this.add.rectangle(
      LANEFOLD_CONFIG.viewport.width * 0.5,
      LANEFOLD_CONFIG.viewport.height * 0.5,
      LANEFOLD_CONFIG.viewport.width,
      LANEFOLD_CONFIG.viewport.height,
      LANEFOLD_CONFIG.visuals.backgroundBottom,
    );

    this.backgroundOrbs = [
      this.add.ellipse(140, 120, 220, 220, 0x2f4d66, 0.6),
      this.add.ellipse(770, 230, 320, 240, 0x143747, 0.45),
      this.add.ellipse(260, 1060, 280, 220, 0x5c2b35, 0.24),
    ];

    this.titleGlow = this.add.ellipse(450, 210, 560, 180, 0x5bc0be, 0.08);

    this.add.rectangle(
      450,
      700,
      720,
      860,
      LANEFOLD_CONFIG.visuals.panelDark,
      0.35,
    ).setStrokeStyle(2, LANEFOLD_CONFIG.visuals.panelMid, 0.7);

    for (let lane = 0; lane < BOARD_WIDTH; lane += 1) {
      const x = this.getLaneCenter(lane);
      const beam = this.add.rectangle(
        x,
        (this.layout.laneTop + this.layout.dangerY) * 0.5,
        this.layout.cellSize - 12,
        this.layout.dangerY - this.layout.laneTop,
        LANEFOLD_CONFIG.visuals.laneBeam,
        0.08,
      );

      const cap = this.add.rectangle(
        x,
        this.layout.dangerY,
        this.layout.cellSize - 18,
        12,
        LANEFOLD_CONFIG.visuals.laneDanger,
        0.4,
      );

      beam.setDepth(1);
      cap.setDepth(1);
      this.laneBeams.push(beam);
      this.laneCaps.push(cap);

      const laneLabel = this.add.text(
        x,
        this.layout.boardTop - 26,
        `L${lane + 1}`,
        {
          color: LANEFOLD_CONFIG.visuals.textMuted,
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '18px',
          fontStyle: '600',
        },
      ).setOrigin(0.5);

      laneLabel.setDepth(6);
      this.laneLabels.push(laneLabel);
    }

    this.add.text(
      450,
      this.layout.dangerY + 28,
      'RELAY GATE // breach ends the run',
      {
        color: '#ffb29d',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '18px',
        fontStyle: '600',
        letterSpacing: 1,
      },
    ).setOrigin(0.5).setAlpha(0.8);
  }

  private createHud(): void {
    this.add.text(60, 36, 'LANEFOLD', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '44px',
      fontStyle: '800',
      letterSpacing: 2,
    });

    this.add.text(62, 90, 'slide, merge, realign the lanes', {
      color: LANEFOLD_CONFIG.visuals.textMuted,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '20px',
      fontStyle: '500',
    });

    this.scoreText = this.add.text(60, this.layout.hudTop + 66, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '24px',
      fontStyle: '700',
    });

    this.turnText = this.add.text(300, this.layout.hudTop + 66, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '24px',
      fontStyle: '700',
    });

    this.difficultyText = this.add.text(500, this.layout.hudTop + 66, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '24px',
      fontStyle: '700',
    });

    this.pressureText = this.add.text(836, this.layout.hudTop + 66, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '24px',
      fontStyle: '700',
      align: 'right',
    }).setOrigin(1, 0);

    this.statusText = this.add.text(450, 288, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '22px',
      fontStyle: '600',
      align: 'center',
    }).setOrigin(0.5);

    this.hintText = this.add.text(450, 1126, '', {
      color: LANEFOLD_CONFIG.visuals.textMuted,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '20px',
      fontStyle: '500',
      align: 'center',
    }).setOrigin(0.5);
  }

  private createBoard(): void {
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      const slotRow: Phaser.GameObjects.Rectangle[] = [];
      const tileRow: Phaser.GameObjects.Rectangle[] = [];
      const textRow: Phaser.GameObjects.Text[] = [];

      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const x = this.getCellCenterX(col);
        const y = this.getCellCenterY(row);
        const slot = this.add.rectangle(
          x,
          y,
          this.layout.cellSize,
          this.layout.cellSize,
          0x1d2938,
          0.86,
        );

        slot.setStrokeStyle(2, 0x30465d, 0.8);
        slot.setDepth(3);

        const tile = this.add.rectangle(
          x,
          y,
          this.layout.cellSize - 16,
          this.layout.cellSize - 16,
          0x253646,
          0.15,
        );

        tile.setStrokeStyle(2, 0x557086, 0.2);
        tile.setDepth(4);

        const label = this.add.text(x, y, '', {
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '34px',
          fontStyle: '800',
          color: '#f7f0df',
        });

        label.setOrigin(0.5);
        label.setDepth(5);

        slotRow.push(slot);
        tileRow.push(tile);
        textRow.push(label);
      }

      this.slotRects.push(slotRow);
      this.tileRects.push(tileRow);
      this.tileTexts.push(textRow);
    }
  }

  private createOverlayPanels(): void {
    this.titleContainer = this.createPanelContainer(
      450,
      730,
      640,
      520,
      18,
    );

    const title = this.add.text(0, -168, 'Lanefold', {
      color: '#f8f1de',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '70px',
      fontStyle: '800',
      align: 'center',
    }).setOrigin(0.5);

    const subtitle = this.add.text(
      0,
      -86,
      'A relay-grid skirmish of sliding merges and lane defense.',
      {
        color: '#bac6d0',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '24px',
        fontStyle: '500',
        align: 'center',
        wordWrap: { width: 520 },
      },
    ).setOrigin(0.5);

    const rules = this.add.text(
      0,
      10,
      [
        'Arrow keys or swipe to shift the whole 5x5 grid.',
        'Equal pulses merge into larger relays.',
        'Each column fires down its matching lane after every move.',
        'Enemies advance after combat. Any breach ends the run.',
      ].join('\n'),
      {
        color: '#f2ebd8',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '24px',
        fontStyle: '500',
        align: 'center',
        lineSpacing: 8,
      },
    ).setOrigin(0.5);

    const startButton = this.createButton(0, 170, 270, 74, 'Start Run');
    startButton.container.on('pointerup', () => {
      this.handleConfirm();
    });

    this.titleContainer.add([title, subtitle, rules, startButton.container]);

    this.gameOverContainer = this.createPanelContainer(
      450,
      730,
      600,
      360,
      20,
    );

    this.gameOverTitle = this.add.text(0, -90, 'Run Ended', {
      color: '#f8f1de',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '58px',
      fontStyle: '800',
      align: 'center',
    }).setOrigin(0.5);

    this.gameOverBody = this.add.text(0, 0, '', {
      color: '#f2ebd8',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '25px',
      fontStyle: '500',
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5);

    const restartButton = this.createButton(0, 112, 270, 72, 'Restart');
    restartButton.container.on('pointerup', () => {
      this.restartRun();
    });

    this.gameOverContainer.add([
      this.gameOverTitle,
      this.gameOverBody,
      restartButton.container,
    ]);

    this.gameOverContainer.setVisible(false);
  }

  private createPanelContainer(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const backing = this.add.rectangle(0, 0, width, height, 0x0e1620, 0.9);

    backing.setStrokeStyle(2, 0x385166, 0.9);
    backing.setDepth(20);

    const accent = this.add.rectangle(0, -height / 2 + 8, width - 48, 4, 0x63d0c7, 0.9);

    backing.setDisplayOrigin(width / 2, height / 2);
    accent.setOrigin(0.5);
    backing.setSize(width, height);
    backing.setRounded?.(radius);

    container.add([backing, accent]);
    container.setDepth(20);
    return container;
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
  ): { container: Phaser.GameObjects.Container } {
    const container = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, width, height, 0x63d0c7, 0.92);
    const outline = this.add.rectangle(0, 0, width, height, 0, 0);
    const text = this.add.text(0, 0, label, {
      color: '#081119',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '30px',
      fontStyle: '800',
    }).setOrigin(0.5);

    outline.setStrokeStyle(2, 0xf7f0df, 0.6);
    container.add([body, outline, text]);
    container.setSize(width, height);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      body.setFillStyle(0x7ce4db, 1);
    });
    container.on('pointerout', () => {
      body.setFillStyle(0x63d0c7, 0.92);
    });
    return { container };
  }

  private handleConfirm(): void {
    const mode = this.run.getMode();

    if (mode === 'title') {
      this.run.startRun();
      return;
    }

    if (mode === 'gameover') {
      this.restartRun();
    }
  }

  private handleDirection(direction: 'up' | 'down' | 'left' | 'right'): void {
    this.run.move(direction);
  }

  private restartRun(): void {
    this.run.restart();
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
    }
  }

  private getCellCenterX(col: number): number {
    return (
      this.boardLeft +
      col * (this.layout.cellSize + this.layout.cellGap) +
      this.layout.cellSize * 0.5
    );
  }

  private getCellCenterY(row: number): number {
    return (
      this.layout.boardTop +
      row * (this.layout.cellSize + this.layout.cellGap) +
      this.layout.cellSize * 0.5
    );
  }

  private getLaneCenter(lane: number): number {
    return this.getCellCenterX(lane);
  }

  private renderScene(): void {
    this.renderBackdropMotion();
    this.renderHud();
    this.renderBoardState();
    this.renderEnemies();
    this.renderOverlays();
  }

  private renderBackdropMotion(): void {
    const t = this.run.getIdleMs() * 0.001;

    this.backgroundOrbs[0]?.setPosition(140 + Math.sin(t * 0.6) * 12, 120);
    this.backgroundOrbs[1]?.setPosition(770, 230 + Math.sin(t * 0.45) * 10);
    this.backgroundOrbs[2]?.setPosition(260 + Math.cos(t * 0.35) * 18, 1060);
    this.titleGlow.setScale(1 + Math.sin(t * 0.8) * 0.02);

    for (let lane = 0; lane < this.laneBeams.length; lane += 1) {
      const pulse = this.run.getLanePulse(lane);
      this.laneBeams[lane]?.setFillStyle(
        LANEFOLD_CONFIG.visuals.laneBeam,
        0.08 + pulse * 0.18,
      );
      this.laneCaps[lane]?.setFillStyle(
        LANEFOLD_CONFIG.visuals.laneDanger,
        0.28 + pulse * 0.38,
      );
    }
  }

  private renderHud(): void {
    const mode = this.run.getMode();
    const state = this.run.getState();
    const hudAlpha = mode === 'title' ? 0 : 1;

    this.scoreText.setText(`Score ${state.score}`);
    this.turnText.setText(`Turn ${state.turn}`);
    this.difficultyText.setText(`Tier ${state.difficulty}`);
    this.pressureText.setText(`Pressure ${state.pressure}`);
    this.scoreText.setAlpha(hudAlpha);
    this.turnText.setAlpha(hudAlpha);
    this.difficultyText.setAlpha(hudAlpha);
    this.pressureText.setAlpha(hudAlpha);
    this.laneLabels.forEach((label) => {
      label.setAlpha(mode === 'title' ? 0.28 : 0.8);
    });

    if (mode === 'title') {
      this.statusText.setText('Shape the relay grid before the lanes flood.');
      this.hintText.setText('Enter or tap Start Run. Use F for fullscreen.');
      return;
    }

    if (mode === 'gameover') {
      this.statusText.setText(formatLoss(this.run.getGameOverReason()));
      this.hintText.setText('Press Enter or tap Restart to begin a fresh run.');
      return;
    }

    const lastSummary = this.run.getLastSummary();
    const invalidAlpha = this.run.getInvalidMoveAlpha();

    if (lastSummary?.invalidMove && invalidAlpha > 0) {
      this.statusText.setText('No shift on that vector.');
      this.statusText.setColor('#ffbf9f');
      this.statusText.setAlpha(0.7 + invalidAlpha * 0.3);
    } else if (lastSummary?.lossReason) {
      this.statusText.setText(formatLoss(lastSummary.lossReason));
      this.statusText.setColor('#ffbf9f');
      this.statusText.setAlpha(1);
    } else if (lastSummary?.changed) {
      this.statusText.setText(
        `+${lastSummary.scoreGain} score // ${lastSummary.attacks.length} strikes // ${lastSummary.spawnedEnemies.length} intruders`,
      );
      this.statusText.setColor('#f5efdd');
      this.statusText.setAlpha(0.95);
    } else {
      this.statusText.setText('Push the matrix. Each column fires after the slide.');
      this.statusText.setColor('#f5efdd');
      this.statusText.setAlpha(0.85);
    }

    this.hintText.setText(
      'Arrow keys or swipe to shift. Matching values merge. Any lane breach ends the run.',
    );
  }

  private renderBoardState(): void {
    const state = this.run.getState();

    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const slot = this.slotRects[row]?.[col];
        const tileRect = this.tileRects[row]?.[col];
        const label = this.tileTexts[row]?.[col];
        const tile = state.board[row]?.[col];
        const pulse = this.run.getCellPulse(row, col);

        slot?.setFillStyle(0x1b2734, 0.88);
        slot?.setStrokeStyle(2, 0x365269, 0.9);

        if (!tile) {
          tileRect?.setFillStyle(0x253646, 0.12);
          tileRect?.setStrokeStyle(2, 0x557086, 0.16);
          tileRect?.setScale(1);
          label?.setText('');
          continue;
        }

        const palette = tilePalette(tile.rank);
        tileRect?.setFillStyle(palette.fill, 0.95);
        tileRect?.setStrokeStyle(2, palette.stroke, 0.42);
        tileRect?.setScale(1 + pulse * 0.08);
        label?.setText(`${tileDisplayValue(tile.rank)}`);
        label?.setColor(palette.text);
        label?.setScale(1 + pulse * 0.05);
      }
    }
  }

  private renderEnemies(): void {
    const state = this.run.getState();
    const activeEnemyIds = new Set<number>();
    const travel = this.layout.dangerY - this.layout.laneTop;
    const idle = this.run.getIdleMs() * 0.001;

    state.lanes.forEach((lane, laneIndex) => {
      lane.forEach((enemy) => {
        activeEnemyIds.add(enemy.id);

        let view = this.enemyViews.get(enemy.id);

        if (!view) {
          view = this.createEnemyView(enemy);
          this.enemyViews.set(enemy.id, view);
        }

        const pulse = this.run.getEnemyPulse(enemy.id);
        const bob = Math.sin(idle * 2 + enemy.id) * 5;
        const x = this.getLaneCenter(laneIndex);
        const y = this.layout.laneTop + (enemy.progress / LANEFOLD_CONFIG.loss.breachProgress) * travel + bob;

        view.container.setPosition(x, y);
        view.container.setScale(1 + pulse * 0.12);
        view.container.setAlpha(0.9 + pulse * 0.1);
        view.hpText.setText(`${enemy.hp}`);
      });
    });

    this.enemyViews.forEach((view, enemyId) => {
      if (activeEnemyIds.has(enemyId)) {
        return;
      }

      view.container.destroy(true);
      this.enemyViews.delete(enemyId);
    });
  }

  private createEnemyView(enemy: Enemy): EnemyView {
    const colors = enemyColors(enemy.kind);
    const body =
      enemy.kind === 'prism'
        ? this.add.rectangle(0, 0, 44, 44, colors.body, 0.96).setAngle(45)
        : enemy.kind === 'blob'
          ? this.add.ellipse(0, 0, 58, 46, colors.body, 0.96)
          : this.add.ellipse(0, 0, 62, 36, colors.body, 0.96);

    const core =
      enemy.kind === 'prism'
        ? this.add.rectangle(0, 0, 10, 26, colors.core, 0.94)
        : enemy.kind === 'blob'
          ? this.add.ellipse(0, -2, 20, 20, colors.core, 0.92)
          : this.add.rectangle(0, 0, 16, 16, colors.core, 0.95);

    const hpText = this.add.text(0, 34, `${enemy.hp}`, {
      color: '#f7f0df',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '20px',
      fontStyle: '700',
    }).setOrigin(0.5);

    const container = this.add.container(0, 0, [body, core, hpText]);
    container.setDepth(2);
    return { container, hpText };
  }

  private renderOverlays(): void {
    const mode = this.run.getMode();
    const state = this.run.getState();

    this.titleContainer.setVisible(mode === 'title');
    this.gameOverContainer.setVisible(mode === 'gameover');

    if (mode !== 'gameover') {
      return;
    }

    this.gameOverTitle.setText(formatLoss(state.lossReason));
    this.gameOverBody.setText(
      `Score ${state.score}\nTurn ${state.turn}\nDifficulty ${state.difficulty}\nPressure ${state.pressure}`,
    );
  }
}
