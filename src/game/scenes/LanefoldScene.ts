import { Scene } from 'phaser';

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LANEFOLD_CONFIG,
  tileDisplayValue,
} from '../config';
import { computeLaneAttackProfile } from '../core/enemies';
import { normalTurnCount } from '../core/progression';
import { InputController } from '../input/InputController';
import { LanefoldRun } from '../runtime/LanefoldRun';
import { bindTestingRun } from '../runtime/testingHooks';
import type {
  AttackEvent,
  BossState,
  Enemy,
  LossReason,
  RewardDefinition,
  RunPhase,
} from '../types';

interface EnemyView {
  container: Phaser.GameObjects.Container;
  hpText: Phaser.GameObjects.Text;
  turnsText: Phaser.GameObjects.Text;
  priorityText: Phaser.GameObjects.Text;
  card: Phaser.GameObjects.Rectangle;
}

type DangerLevel = 'clear' | 'watch' | 'warning' | 'critical' | 'breached';

interface LaneThreat {
  level: DangerLevel;
  minTurns: number | null;
  frontEnemyId: number | null;
}

function tilePalette(rank: number): { fill: number; text: string; stroke: number } {
  const fills = LANEFOLD_CONFIG.visuals.tileFills;

  const fill = fills[(rank - 1) % fills.length] ?? fills[0];
  const text = rank >= 4 ? '#fff7dd' : LANEFOLD_CONFIG.visuals.ink;
  const stroke = rank >= 4 ? 0x5a3028 : 0xfff1c1;

  return { fill, text, stroke };
}

function enemyColors(kind: Enemy['kind']): { body: number; core: number } {
  switch (kind) {
    case 'elite':
      return { body: 0xc94f3d, core: 0xffe4a3 };
    case 'blob':
      return { body: 0x6f9f55, core: 0xf4e6b0 };
    case 'prism':
      return { body: 0x5fb7b1, core: 0xfff7dd };
    case 'drone':
    default:
      return { body: 0xe27a4b, core: 0xfff7dd };
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

function formatPhase(phase: RunPhase): string {
  switch (phase) {
    case 'warning':
      return 'WARNING';
    case 'elite':
      return 'ELITE';
    case 'boss':
      return 'BOSS';
    case 'reward':
      return 'REWARD';
    case 'normal':
    default:
      return 'NORMAL';
  }
}

function remainingTurns(enemy: Enemy): number {
  return Math.max(0, LANEFOLD_CONFIG.loss.breachProgress - enemy.progress);
}

function bossRemainingTurns(boss: BossState): number {
  return Math.max(0, LANEFOLD_CONFIG.loss.breachProgress - boss.progress);
}

function dangerLevelForTurns(turns: number | null): DangerLevel {
  if (turns === null) {
    return 'clear';
  }

  if (turns <= 0) {
    return 'breached';
  }

  if (turns === 1) {
    return 'critical';
  }

  if (turns <= 2) {
    return 'warning';
  }

  if (turns <= 3) {
    return 'watch';
  }

  return 'clear';
}

function dangerColor(level: DangerLevel): number {
  switch (level) {
    case 'breached':
      return 0xff3f3f;
    case 'critical':
      return 0xff6f59;
    case 'warning':
      return 0xf3b562;
    case 'watch':
      return 0x84d6d1;
    case 'clear':
    default:
      return 0x35516a;
  }
}

export class LanefoldScene extends Scene {
  private readonly run = new LanefoldRun();

  private readonly layout = {
    boardTop: 452,
    cellSize: 90,
    cellGap: 10,
    trackTop: 188,
    trackStepHeight: 25,
    trackStepGap: 6,
    hudTop: 46,
    statusY: 978,
  };

  private slotRects: Phaser.GameObjects.Rectangle[][] = [];

  private tileRects: Phaser.GameObjects.Rectangle[][] = [];

  private tileTexts: Phaser.GameObjects.Text[][] = [];

  private boardFrame!: Phaser.GameObjects.Rectangle;

  private laneColumnBacks: Phaser.GameObjects.Rectangle[] = [];

  private laneTrackBacks: Phaser.GameObjects.Rectangle[] = [];

  private laneStepRects: Phaser.GameObjects.Rectangle[][] = [];

  private laneThreatTexts: Phaser.GameObjects.Text[] = [];

  private laneAttackTexts: Phaser.GameObjects.Text[] = [];

  private breachSegments: Phaser.GameObjects.Rectangle[] = [];

  private laneLabels: Phaser.GameObjects.Text[] = [];

  private breachText!: Phaser.GameObjects.Text;

  private hudBadgeBacks: Phaser.GameObjects.Rectangle[] = [];

  private enemyViews = new Map<number, EnemyView>();

  private scoreText!: Phaser.GameObjects.Text;

  private turnText!: Phaser.GameObjects.Text;

  private difficultyText!: Phaser.GameObjects.Text;

  private pressureText!: Phaser.GameObjects.Text;

  private statusText!: Phaser.GameObjects.Text;

  private hintText!: Phaser.GameObjects.Text;

  private hudTagline!: Phaser.GameObjects.Text;

  private utilityBack!: Phaser.GameObjects.Rectangle;

  private utilityText!: Phaser.GameObjects.Text;

  private bossContainer!: Phaser.GameObjects.Container;

  private bossBody!: Phaser.GameObjects.Rectangle;

  private bossHpText!: Phaser.GameObjects.Text;

  private bossMetaText!: Phaser.GameObjects.Text;

  private titleContainer!: Phaser.GameObjects.Container;

  private gameOverContainer!: Phaser.GameObjects.Container;

  private gameOverTitle!: Phaser.GameObjects.Text;

  private gameOverBody!: Phaser.GameObjects.Text;

  private rewardContainer!: Phaser.GameObjects.Container;

  private rewardTitle!: Phaser.GameObjects.Text;

  private rewardSubtitle!: Phaser.GameObjects.Text;

  private rewardCards: Array<{
    container: Phaser.GameObjects.Container;
    body: Phaser.GameObjects.Rectangle;
    categoryText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    descriptionText: Phaser.GameObjects.Text;
  }> = [];

  private titleGlow!: Phaser.GameObjects.Rectangle;

  private backgroundShapes: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('LanefoldScene');
  }

  private get boardWidth(): number {
    return BOARD_WIDTH * this.layout.cellSize + (BOARD_WIDTH - 1) * this.layout.cellGap;
  }

  private get boardHeight(): number {
    return BOARD_HEIGHT * this.layout.cellSize + (BOARD_HEIGHT - 1) * this.layout.cellGap;
  }

  private get boardLeft(): number {
    return (LANEFOLD_CONFIG.viewport.width - this.boardWidth) / 2;
  }

  private get trackHeight(): number {
    return (
      LANEFOLD_CONFIG.loss.breachProgress * this.layout.trackStepHeight +
      (LANEFOLD_CONFIG.loss.breachProgress - 1) * this.layout.trackStepGap
    );
  }

  private get breachY(): number {
    return this.layout.boardTop - 18;
  }

  public create(): void {
    this.run.titleReady();
    bindTestingRun(this.run);

    this.createBackdrop();
    this.createHud();
    this.createBoard();
    this.createBossView();
    this.createOverlayPanels();

    new InputController(this, {
      getMode: () => this.run.getMode(),
      onDirection: (direction) => {
        this.handleDirection(direction);
      },
      onConfirm: () => {
        this.handleConfirm();
      },
      onRewardChoice: (index) => {
        this.handleRewardChoice(index);
      },
      onUtility: () => {
        this.handleUtility();
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
      0xf3d88d,
    );

    this.add.rectangle(450, 130, 900, 260, LANEFOLD_CONFIG.visuals.backgroundTop, 1);
    this.add.rectangle(450, 270, 900, 88, 0xbbe4d5, 0.95);
    this.add.ellipse(176, 258, 420, 116, 0x77aa69, 0.88);
    this.add.ellipse(705, 272, 520, 128, 0x6d9c5f, 0.84);
    this.add.rectangle(450, 372, 900, 140, 0xc9a05d, 0.88);
    this.add.rectangle(450, 1118, 900, 124, 0x8d6842, 0.22);

    this.backgroundShapes = [
      this.add.rectangle(136, 126, 112, 28, 0xffffff, 0.72),
      this.add.rectangle(182, 116, 76, 22, 0xffffff, 0.62),
      this.add.rectangle(740, 164, 142, 30, 0xffffff, 0.58),
      this.add.rectangle(690, 152, 88, 24, 0xffffff, 0.46),
    ];

    this.titleGlow = this.add.rectangle(450, 330, 520, 30, 0xfff1c1, 0.24);

    this.add.rectangle(
      450,
      650,
      640,
      880,
      0xf5e2a8,
      0.2,
    ).setStrokeStyle(3, 0x6b4f30, 0.18);

    this.add.rectangle(450, this.breachY + 18, 628, 36, 0x6f4a36, 0.78);
    this.add.rectangle(296, this.breachY + 20, 24, 62, 0x5b3e2e, 0.86);
    this.add.rectangle(604, this.breachY + 20, 24, 62, 0x5b3e2e, 0.86);

    for (let lane = 0; lane < BOARD_WIDTH; lane += 1) {
      const x = this.getLaneCenter(lane);
      const columnBack = this.add.rectangle(
        x,
        this.layout.boardTop + this.boardHeight * 0.5,
        this.layout.cellSize + 4,
        this.boardHeight + 8,
        LANEFOLD_CONFIG.visuals.laneBeam,
        0.16,
      );

      const trackBack = this.add.rectangle(
        x,
        this.layout.trackTop + this.trackHeight * 0.5,
        this.layout.cellSize + 4,
        this.trackHeight + 18,
        0xf7df9b,
        0.86,
      );
      trackBack.setStrokeStyle(3, 0x79563a, 0.3);

      const laneSteps: Phaser.GameObjects.Rectangle[] = [];

      for (let step = 0; step < LANEFOLD_CONFIG.loss.breachProgress; step += 1) {
        const stepY =
          this.layout.trackTop +
          step * (this.layout.trackStepHeight + this.layout.trackStepGap) +
          this.layout.trackStepHeight * 0.5;
        const stepRect = this.add.rectangle(
          x,
          stepY,
          this.layout.cellSize - 16,
          this.layout.trackStepHeight,
          step % 2 === 0 ? 0xe7bf67 : 0xf0ce7b,
          0.88,
        );

        stepRect.setStrokeStyle(2, 0x8b633f, 0.35);
        stepRect.setDepth(2);
        laneSteps.push(stepRect);
      }

      const laneLabel = this.add.text(
        x,
        this.breachY - 38,
        `LANE ${lane + 1}`,
        {
          color: '#3f563c',
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '15px',
          fontStyle: '800',
        },
      ).setOrigin(0.5);

      const threatText = this.add.text(
        x,
        this.layout.trackTop - 22,
        'CLEAR',
        {
          color: '#3f563c',
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '17px',
          fontStyle: '800',
        },
      ).setOrigin(0.5);

      const attackText = this.add.text(
        x,
        this.layout.trackTop - 42,
        'ATK 0',
        {
          color: '#2f6564',
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '13px',
          fontStyle: '800',
        },
      ).setOrigin(0.5);

      const breachSegment = this.add.rectangle(
        x,
        this.breachY,
        this.layout.cellSize - 2,
        12,
        LANEFOLD_CONFIG.visuals.laneDanger,
        0.88,
      );

      columnBack.setDepth(1);
      trackBack.setDepth(1);
      laneLabel.setDepth(6);
      threatText.setDepth(6);
      attackText.setDepth(6);
      breachSegment.setDepth(7);
      breachSegment.setStrokeStyle(2, 0xfff0b8, 0.58);

      this.laneColumnBacks.push(columnBack);
      this.laneTrackBacks.push(trackBack);
      this.laneStepRects.push(laneSteps);
      this.laneLabels.push(laneLabel);
      this.laneThreatTexts.push(threatText);
      this.laneAttackTexts.push(attackText);
      this.breachSegments.push(breachSegment);
    }

    this.breachText = this.add.text(
      450,
      this.breachY - 14,
      'DEPOT GATE // stop every runner before this line',
      {
        color: '#fff3c2',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '16px',
        fontStyle: '800',
        letterSpacing: 1,
      },
    ).setOrigin(0.5).setAlpha(0.9).setDepth(8);
  }

  private createHud(): void {
    this.add.text(72, 34, 'LANEFOLD', {
      color: '#243332',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '42px',
      fontStyle: '800',
      letterSpacing: 2,
    });

    this.hudTagline = this.add.text(74, 84, 'fold parcels into lane shots', {
      color: '#315a50',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '18px',
      fontStyle: '700',
    });

    this.hudBadgeBacks = [
      this.add.rectangle(140, this.layout.hudTop + 76, 150, 48, 0x5d7254, 0.42),
      this.add.rectangle(420, this.layout.hudTop + 76, 250, 48, 0x5d7254, 0.38),
      this.add.rectangle(708, this.layout.hudTop + 78, 160, 42, 0x5d7254, 0.38),
      this.add.rectangle(756, this.layout.hudTop + 46, 170, 38, 0x5d7254, 0.38),
    ];
    this.hudBadgeBacks.forEach((badge) => {
      badge.setStrokeStyle(2, 0xfff1c1, 0.32);
    });

    this.turnText = this.add.text(72, this.layout.hudTop + 60, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '28px',
      fontStyle: '800',
    });

    this.pressureText = this.add.text(320, this.layout.hudTop + 60, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '28px',
      fontStyle: '800',
    });

    this.difficultyText = this.add.text(640, this.layout.hudTop + 63, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '20px',
      fontStyle: '700',
    });

    this.scoreText = this.add.text(836, this.layout.hudTop + 34, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '18px',
      fontStyle: '700',
      align: 'right',
    }).setOrigin(1, 0);

    this.utilityBack = this.add.rectangle(722, 38, 250, 36, 0x3e5f64, 0.88);
    this.utilityBack.setStrokeStyle(2, 0xfff1c1, 0.62);
    this.utilityBack.setInteractive({ useHandCursor: true });
    this.utilityBack.on('pointerup', () => {
      this.handleUtility();
    });

    this.utilityText = this.add.text(722, 38, 'UTILITY EMPTY', {
      color: '#d8f4ff',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '15px',
      fontStyle: '800',
      align: 'center',
    }).setOrigin(0.5);

    this.statusText = this.add.text(450, this.layout.statusY, '', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '17px',
      fontStyle: '700',
      align: 'center',
      lineSpacing: 4,
      wordWrap: { width: 760 },
    }).setOrigin(0.5);

    this.hintText = this.add.text(450, 1126, '', {
      color: '#3e5f64',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '20px',
      fontStyle: '500',
      align: 'center',
    }).setOrigin(0.5);
  }

  private createBoard(): void {
    this.boardFrame = this.add.rectangle(
      450,
      this.layout.boardTop + this.boardHeight * 0.5,
      this.boardWidth + 18,
      this.boardHeight + 18,
      0xe7bf67,
      0.42,
    );
    this.boardFrame.setStrokeStyle(4, 0x6b4f30, 0.48);
    this.boardFrame.setDepth(2);

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
          0xf7e6aa,
          0.92,
        );

        slot.setStrokeStyle(2, 0x8b633f, 0.32);
        slot.setDepth(3);

        const tile = this.add.rectangle(
          x,
          y,
          this.layout.cellSize - 16,
          this.layout.cellSize - 16,
          0xfff1c1,
          0.22,
        );

        tile.setStrokeStyle(2, 0x8b633f, 0.2);
        tile.setDepth(4);

        const label = this.add.text(x, y, '', {
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '31px',
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

  private createBossView(): void {
    const width =
      this.getLaneCenter(3) - this.getLaneCenter(1) + this.layout.cellSize - 12;
    this.bossContainer = this.add.container(this.getLaneCenter(2), this.layout.trackTop);
    this.bossBody = this.add.rectangle(0, 0, width, 52, 0x7c3f37, 0.96);
    this.bossBody.setStrokeStyle(3, LANEFOLD_CONFIG.visuals.accentAlert, 0.86);

    const core = this.add.rectangle(-width * 0.42, 0, 24, 24, 0xffd36c, 0.96);
    core.setAngle(45);

    this.bossHpText = this.add.text(-width * 0.3, -10, 'BOSS HP', {
      color: '#fff7dd',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '16px',
      fontStyle: '900',
    }).setOrigin(0, 0.5);

    this.bossMetaText = this.add.text(-width * 0.3, 12, 'CENTER LANES', {
      color: '#ffd9bb',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '12px',
      fontStyle: '800',
    }).setOrigin(0, 0.5);

    this.bossContainer.add([this.bossBody, core, this.bossHpText, this.bossMetaText]);
    this.bossContainer.setDepth(6);
    this.bossContainer.setVisible(false);
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
      color: '#fff7dd',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '70px',
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5);

    const subtitle = this.add.text(
      0,
      -86,
      'Fold a parcel yard into clean lanes before runners reach the gate.',
      {
        color: '#e6f4e7',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '24px',
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: 520 },
      },
    ).setOrigin(0.5);

    const rules = this.add.text(
      0,
      36,
      [
        'Arrow keys or swipe to shift the whole 5x5 grid.',
        'Matching parcels stack into heavier bundles.',
        'Each column launches its bundle down the same lane.',
        'Runners advance after combat.',
        'Any depot breach ends the run.',
      ].join('\n'),
      {
        color: '#fff9e8',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '20px',
        fontStyle: '500',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: 540 },
      },
    ).setOrigin(0.5);

    const startButton = this.createButton(0, 185, 270, 74, 'Open Depot');
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

    this.rewardContainer = this.createPanelContainer(
      450,
      690,
      720,
      520,
      20,
    );
    this.rewardTitle = this.add.text(0, -200, 'Encounter Cleared', {
      color: '#fff7dd',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '50px',
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5);
    this.rewardSubtitle = this.add.text(0, -154, 'Choose one run upgrade. Utility choices overwrite the slot.', {
      color: '#d9eadb',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '18px',
      fontStyle: '600',
      align: 'center',
    }).setOrigin(0.5);

    this.rewardContainer.add([this.rewardTitle, this.rewardSubtitle]);

    [-220, 0, 220].forEach((x, index) => {
      const card = this.createRewardCard(x, 42, index);
      this.rewardCards.push(card);
      this.rewardContainer.add(card.container);
    });
    this.rewardContainer.setVisible(false);
  }

  private createRewardCard(
    x: number,
    y: number,
    index: number,
  ): {
    container: Phaser.GameObjects.Container;
    body: Phaser.GameObjects.Rectangle;
    categoryText: Phaser.GameObjects.Text;
    nameText: Phaser.GameObjects.Text;
    descriptionText: Phaser.GameObjects.Text;
  } {
    const container = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, 194, 260, 0x5f7553, 0.96);
    body.setStrokeStyle(3, 0xffe2a2, 0.72);

    const categoryText = this.add.text(0, -96, 'CATEGORY', {
      color: '#ffe2a2',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '14px',
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5);

    const nameText = this.add.text(0, -46, 'Reward', {
      color: '#fff7dd',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '25px',
      fontStyle: '900',
      align: 'center',
      wordWrap: { width: 160 },
    }).setOrigin(0.5);

    const descriptionText = this.add.text(0, 42, 'Description', {
      color: '#edf5dd',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '17px',
      fontStyle: '600',
      align: 'center',
      lineSpacing: 5,
      wordWrap: { width: 156 },
    }).setOrigin(0.5);

    const keyText = this.add.text(0, 110, `Press ${index + 1}`, {
      color: LANEFOLD_CONFIG.visuals.ink,
      backgroundColor: '#f2b84b',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '14px',
      fontStyle: '900',
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5);

    container.add([body, categoryText, nameText, descriptionText, keyText]);
    container.setSize(194, 260);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-97, -130, 194, 260),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      body.setFillStyle(0x738a5e, 0.98);
      body.setStrokeStyle(4, 0xf2b84b, 0.9);
    });
    container.on('pointerout', () => {
      body.setFillStyle(0x5f7553, 0.96);
      body.setStrokeStyle(3, 0xffe2a2, 0.72);
    });
    container.on('pointerup', () => {
      this.handleRewardChoice(index);
    });

    return {
      container,
      body,
      categoryText,
      nameText,
      descriptionText,
    };
  }

  private createPanelContainer(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const backing = this.add.rectangle(0, 0, width, height, 0x3e5f64, 0.94);

    backing.setStrokeStyle(3, 0xffe2a2, 0.58);
    backing.setDepth(20);

    const accent = this.add.rectangle(0, -height / 2 + 8, width - 48, 6, 0xf2b84b, 0.95);

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
    const body = this.add.rectangle(0, 0, width, height, 0xf2b84b, 0.96);
    const outline = this.add.rectangle(0, 0, width, height, 0, 0);
    const text = this.add.text(0, 0, label, {
      color: LANEFOLD_CONFIG.visuals.ink,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '30px',
      fontStyle: '800',
    }).setOrigin(0.5);

    outline.setStrokeStyle(3, 0xffffff, 0.64);
    container.add([body, outline, text]);
    container.setSize(width, height);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      body.setFillStyle(0xffcf6b, 1);
    });
    container.on('pointerout', () => {
      body.setFillStyle(0xf2b84b, 0.96);
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

  private handleRewardChoice(index: number): void {
    this.run.selectReward(index);
  }

  private handleUtility(): void {
    this.run.activateUtility();
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
    this.renderThreatTracks();
    this.renderHud();
    this.renderBoardState();
    this.renderBoss();
    this.renderEnemies();
    this.renderOverlays();
  }

  private renderBackdropMotion(): void {
    const t = this.run.getIdleMs() * 0.001;

    this.backgroundShapes[0]?.setPosition(132 + Math.sin(t * 0.6) * 12, 132);
    this.backgroundShapes[1]?.setPosition(758, 174 + Math.sin(t * 0.45) * 10);
    this.backgroundShapes[2]?.setPosition(245 + Math.cos(t * 0.35) * 18, 1048);
    this.backgroundShapes[3]?.setPosition(730 + Math.sin(t * 0.4) * 10, 1040);
    this.titleGlow.setScale(1 + Math.sin(t * 0.8) * 0.025, 1);
  }

  private renderThreatTracks(): void {
    const mode = this.run.getMode();
    const state = this.run.getState();
    const attackProfile = computeLaneAttackProfile(
      state.board,
      state.modifiers,
      state.boss,
    );

    for (let lane = 0; lane < BOARD_WIDTH; lane += 1) {
      const threat = this.getLaneThreat(lane);
      const color = dangerColor(threat.level);
      const pulse = this.run.getLanePulse(lane);
      const alphaBoost = threat.level === 'critical' || threat.level === 'breached' ? 0.16 : 0;
      const labelAlpha = mode === 'title' ? 0.32 : 1;

      this.laneColumnBacks[lane]?.setFillStyle(
        color,
        mode === 'title' ? 0.055 : 0.11 + alphaBoost + pulse * 0.1,
      );
      this.laneTrackBacks[lane]?.setFillStyle(
        0xf7df9b,
        mode === 'title' ? 0.54 : 0.86,
      );
      this.laneTrackBacks[lane]?.setStrokeStyle(2, color, 0.28 + pulse * 0.26);
      this.breachSegments[lane]?.setFillStyle(
        color,
        mode === 'title' ? 0.26 : 0.58 + alphaBoost + pulse * 0.22,
      );
      this.breachSegments[lane]?.setStrokeStyle(
        threat.level === 'critical' || threat.level === 'breached' ? 3 : 2,
        color,
        0.78,
      );
      this.laneLabels[lane]?.setColor(
        threat.level === 'critical' || threat.level === 'breached'
          ? '#ffe1d6'
          : LANEFOLD_CONFIG.visuals.textMuted,
      );
      this.laneLabels[lane]?.setAlpha(labelAlpha);
      this.laneThreatTexts[lane]?.setAlpha(labelAlpha);
      this.laneThreatTexts[lane]?.setColor(this.threatTextColor(threat.level));
      this.laneThreatTexts[lane]?.setText(this.formatLaneThreat(threat));
      this.laneAttackTexts[lane]?.setAlpha(mode === 'title' ? 0.26 : 0.8);
      this.laneAttackTexts[lane]?.setText(
        this.formatLaneAttackLabel(
          lane,
          attackProfile.totalDamage[lane] ?? 0,
          attackProfile.bossEffectiveDamage[lane] ?? 0,
        ),
      );
      this.laneAttackTexts[lane]?.setColor(
        (attackProfile.totalDamage[lane] ?? 0) > 0 ? '#a8e6df' : '#536879',
      );

      for (let step = 0; step < LANEFOLD_CONFIG.loss.breachProgress; step += 1) {
        const stepRect = this.laneStepRects[lane]?.[step];
        const stepHasNormalEnemy = (state.lanes[lane] ?? []).some(
          (enemy) =>
            Math.min(LANEFOLD_CONFIG.loss.breachProgress - 1, enemy.progress) === step,
        );
        const stepHasBoss =
          state.boss?.occupiedLanes.includes(lane) &&
          Math.min(LANEFOLD_CONFIG.loss.breachProgress - 1, state.boss.progress) === step;
        const stepHasEnemy = stepHasNormalEnemy || stepHasBoss;
        const nearEdge = step === LANEFOLD_CONFIG.loss.breachProgress - 1;
        const stepAlpha = stepHasEnemy ? 0.88 : nearEdge ? 0.48 : 0.32;

        stepRect?.setFillStyle(
          stepHasEnemy ? color : nearEdge ? 0x9b5b48 : step % 2 === 0 ? 0xe7bf67 : 0xf0ce7b,
          mode === 'title' ? stepAlpha * 0.45 : stepAlpha,
        );
        stepRect?.setStrokeStyle(
          nearEdge ? 2 : 1,
          nearEdge ? LANEFOLD_CONFIG.visuals.laneDanger : color,
          nearEdge ? 0.8 : 0.44,
        );
      }
    }

    const globalThreat = this.getGlobalThreat();
    this.breachText.setColor(this.threatTextColor(globalThreat.level));
    this.breachText.setAlpha(mode === 'title' ? 0.45 : 0.86);
  }

  private getLaneThreat(laneIndex: number): LaneThreat {
    const state = this.run.getState();
    const boss = state.boss;

    if (boss?.occupiedLanes.includes(laneIndex)) {
      const minTurns = bossRemainingTurns(boss);

      return {
        level: dangerLevelForTurns(minTurns),
        minTurns,
        frontEnemyId: boss.id,
      };
    }

    const enemies = state.lanes[laneIndex] ?? [];

    if (enemies.length === 0) {
      return {
        level: 'clear',
        minTurns: null,
        frontEnemyId: null,
      };
    }

    const frontEnemy = enemies.reduce((front, enemy) =>
      enemy.progress > front.progress ? enemy : front,
    );
    const minTurns = remainingTurns(frontEnemy);

    return {
      level: dangerLevelForTurns(minTurns),
      minTurns,
      frontEnemyId: frontEnemy.id,
    };
  }

  private formatLaneAttackLabel(
    laneIndex: number,
    totalDamage: number,
    bossEffectiveDamage: number,
  ): string {
    const boss = this.run.getState().boss;

    if (boss && !boss.occupiedLanes.includes(laneIndex)) {
      return `SUP ${bossEffectiveDamage}`;
    }

    return `ATK ${totalDamage}`;
  }

  private getGlobalThreat(): LaneThreat & { lane: number | null } {
    let bestThreat: (LaneThreat & { lane: number }) | null = null;

    for (let lane = 0; lane < BOARD_WIDTH; lane += 1) {
      const threat = this.getLaneThreat(lane);

      if (threat.minTurns === null) {
        continue;
      }

      if (!bestThreat || threat.minTurns < (bestThreat.minTurns ?? Number.POSITIVE_INFINITY)) {
        bestThreat = {
          ...threat,
          lane,
        };
      }
    }

    return (
      bestThreat ?? {
        level: 'clear',
        minTurns: null,
        frontEnemyId: null,
        lane: null,
      }
    );
  }

  private threatTextColor(level: DangerLevel): string {
    switch (level) {
      case 'breached':
      case 'critical':
        return '#ffd2c7';
      case 'warning':
        return '#f7d69a';
      case 'watch':
        return '#d7f0f0';
      case 'clear':
      default:
        return LANEFOLD_CONFIG.visuals.textMuted;
    }
  }

  private formatLaneThreat(threat: LaneThreat): string {
    if (threat.minTurns === null) {
      return 'CLEAR';
    }

    if (threat.minTurns <= 0) {
      return 'BREACH';
    }

    return `T-${threat.minTurns}`;
  }

  private formatCombatSummary(attacks: AttackEvent[]): string {
    if (attacks.length === 0) {
      return 'no lane targets hit';
    }

    const totalDamage = attacks.reduce((total, attack) => total + attack.damage, 0);
    const parts = attacks
      .slice()
      .sort((a, b) => a.lane - b.lane)
      .slice(0, 2)
      .map((attack) => {
        const prefix = attack.source === 'overcharge' ? 'OVR' : attack.support ? 'SUP' : 'ATK';
        const target = attack.target === 'boss' ? 'BOSS' : 'HP';
        return `L${attack.lane + 1} ${prefix} ${attack.laneDamage}: ${target} ${attack.hpBefore}->${attack.hpAfter}`;
      });
    const overflow = attacks.length > parts.length ? ` +${attacks.length - parts.length} lanes` : '';

    return `${parts.join(' | ')}${overflow} // ${totalDamage} dmg`;
  }

  private renderHud(): void {
    const mode = this.run.getMode();
    const state = this.run.getState();
    const hudAlpha = mode === 'title' ? 0 : 1;
    const globalThreat = this.getGlobalThreat();
    const upcomingEncounter = state.encounterType
      ? `${state.encounterType.toUpperCase()} NEXT`
      : '';
    const normalStep =
      state.phase === 'normal'
        ? ` ${Math.min(state.phaseTurn + 1, normalTurnCount())}/${normalTurnCount()}`
        : '';

    this.turnText.setText(`TURN ${state.turn}`);
    this.pressureText.setText(
      state.phase === 'warning' && upcomingEncounter
        ? `WARN ${upcomingEncounter}`
        : globalThreat.lane === null
        ? 'DANGER CLEAR'
        : `DANGER L${globalThreat.lane + 1} T-${globalThreat.minTurns}`,
    );
    this.difficultyText.setText(`Tier ${state.tier} // ${formatPhase(state.phase)}${normalStep}`);
    this.scoreText.setText(`Score ${state.score}`);
    this.turnText.setAlpha(hudAlpha);
    this.pressureText.setAlpha(hudAlpha);
    this.difficultyText.setAlpha(hudAlpha);
    this.scoreText.setAlpha(mode === 'title' ? 0 : 0.72);
    this.hudTagline.setAlpha(mode === 'title' ? 1 : 0);
    this.hudBadgeBacks.forEach((badge) => {
      badge.setAlpha(mode === 'title' ? 0 : 1);
    });
    this.pressureText.setColor(
      state.phase === 'warning' ? '#ffccb8' : this.threatTextColor(globalThreat.level),
    );
    this.renderUtilityHud(mode);

    if (mode === 'title') {
      this.statusText.setText('Stack parcels, launch lane shots, keep the depot gate shut.');
      this.statusText.setColor('#5a3d2b');
      this.statusText.setAlpha(0.78);
      this.hintText.setText('Enter or tap Open Depot. Use F for fullscreen.');
      return;
    }

    if (mode === 'gameover') {
      this.statusText.setText(formatLoss(this.run.getGameOverReason()));
      this.hintText.setText('Press Enter or tap Restart to begin a fresh run.');
      return;
    }

    if (mode === 'reward') {
      this.statusText.setText('Pick a depot upgrade. The board and lanes carry forward.');
      this.statusText.setColor('#5a3d2b');
      this.statusText.setAlpha(0.82);
      this.hintText.setText('Press 1 / 2 / 3 or click a reward card.');
      return;
    }

    const lastSummary = this.run.getLastSummary();
    const invalidAlpha = this.run.getInvalidMoveAlpha();

    if (lastSummary?.invalidMove && invalidAlpha > 0) {
      this.statusText.setText('No slide there.');
      this.statusText.setColor('#ffbf9f');
      this.statusText.setAlpha(0.54 + invalidAlpha * 0.22);
    } else if (lastSummary?.lossReason) {
      this.statusText.setText(formatLoss(lastSummary.lossReason));
      this.statusText.setColor('#ffbf9f');
      this.statusText.setAlpha(0.82);
    } else if (lastSummary?.encounterStarted === 'boss') {
      this.statusText.setText(
        `boss breach vector formed // absorbed ${lastSummary.absorbedHp ?? 0} normal HP`,
      );
      this.statusText.setColor('#ffccb8');
      this.statusText.setAlpha(0.82);
    } else if (lastSummary?.encounterStarted === 'elite') {
      this.statusText.setText('elite signal entered the lanes // no normal spawn this turn');
      this.statusText.setColor('#f7d69a');
      this.statusText.setAlpha(0.78);
    } else if (lastSummary?.advanceFrozen) {
      this.statusText.setText('Emergency Freeze stopped every runner for this turn.');
      this.statusText.setColor('#b6ebe8');
      this.statusText.setAlpha(0.82);
    } else if (lastSummary?.changed) {
      this.statusText.setText(
        `last move: ${this.formatCombatSummary(lastSummary.attacks)} // +${lastSummary.scoreGain}`,
      );
      this.statusText.setColor('#5a3d2b');
      this.statusText.setAlpha(0.76);
    } else if (state.phase === 'warning') {
      this.statusText.setText('Warning turn: no normal spawn, but existing enemies still advance.');
      this.statusText.setColor('#ffccb8');
      this.statusText.setAlpha(0.72);
    } else if (state.phase === 'boss') {
      this.statusText.setText('Boss HP is shared across center lanes. Edge lanes deal 50% support.');
      this.statusText.setColor('#ffccb8');
      this.statusText.setAlpha(0.7);
    } else {
      this.statusText.setText('Each stacked column launches into the matching lane.');
      this.statusText.setColor('#5a3d2b');
      this.statusText.setAlpha(0.72);
    }

    this.hintText.setText(
      state.utilitySlot
        ? 'Arrow keys or swipe to shift. Press U or tap Utility to activate the held utility.'
        : 'Arrow keys or swipe to shift. Matching values merge. Any depot breach ends the run.',
    );
  }

  private renderUtilityHud(mode: string): void {
    const state = this.run.getState();
    const hidden = mode === 'title' || mode === 'gameover';

    this.utilityBack.setAlpha(hidden ? 0 : 0.92);
    this.utilityText.setAlpha(hidden ? 0 : 1);

    if (hidden) {
      this.utilityBack.disableInteractive();
      return;
    }

    if (state.freezeAdvanceTurns > 0) {
      this.utilityBack.disableInteractive();
      this.utilityBack.setFillStyle(0x5fb7b1, 0.9);
      this.utilityBack.setStrokeStyle(2, LANEFOLD_CONFIG.visuals.accentCool, 0.88);
      this.utilityText.setText('FREEZE READY');
      this.utilityText.setColor('#efffff');
      return;
    }

    if (mode === 'playing' && state.utilitySlot) {
      this.utilityBack.setInteractive({ useHandCursor: true });
      this.utilityBack.setFillStyle(0x8b633f, 0.9);
      this.utilityBack.setStrokeStyle(2, LANEFOLD_CONFIG.visuals.accentWarm, 0.88);
      this.utilityText.setText(`[U] ${state.utilitySlot.name}`);
      this.utilityText.setColor('#fff8d8');
      return;
    }

    this.utilityBack.disableInteractive();
    this.utilityBack.setFillStyle(0x3e5f64, 0.62);
    this.utilityBack.setStrokeStyle(2, 0xffe2a2, 0.36);
    this.utilityText.setText('UTILITY EMPTY');
    this.utilityText.setColor(LANEFOLD_CONFIG.visuals.textMuted);
    this.utilityText.setAlpha(hidden ? 0 : 0.62);
  }

  private renderBoardState(): void {
    const state = this.run.getState();
    const globalThreat = this.getGlobalThreat();
    const frameColor =
      globalThreat.level === 'critical' || globalThreat.level === 'breached'
        ? LANEFOLD_CONFIG.visuals.laneDanger
        : 0xf7f0df;

    this.boardFrame.setStrokeStyle(
      globalThreat.level === 'critical' || globalThreat.level === 'breached' ? 5 : 4,
      frameColor,
      globalThreat.level === 'clear' ? 0.28 : 0.5,
    );

    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const slot = this.slotRects[row]?.[col];
        const tileRect = this.tileRects[row]?.[col];
        const label = this.tileTexts[row]?.[col];
        const tile = state.board[row]?.[col];
        const pulse = this.run.getCellPulse(row, col);

        slot?.setFillStyle(0xf7e6aa, 0.88);
        slot?.setStrokeStyle(2, 0x8b633f, 0.34 + pulse * 0.3);

        if (!tile) {
          tileRect?.setFillStyle(0xfff1c1, 0.18);
          tileRect?.setStrokeStyle(2, 0x8b633f, 0.18);
          tileRect?.setScale(1);
          label?.setText('');
          continue;
        }

        const palette = tilePalette(tile.rank);
        tileRect?.setFillStyle(palette.fill, 0.95);
        tileRect?.setStrokeStyle(3, palette.stroke, 0.62);
        tileRect?.setScale(1 + pulse * 0.1);
        label?.setText(`${tileDisplayValue(tile.rank)}`);
        label?.setColor(palette.text);
        label?.setScale(1 + pulse * 0.05);
      }
    }
  }

  private renderBoss(): void {
    const state = this.run.getState();
    const boss = state.boss;

    if (!boss || this.run.getMode() === 'title') {
      this.bossContainer.setVisible(false);
      return;
    }

    const slot = Math.min(
      LANEFOLD_CONFIG.loss.breachProgress - 1,
      Math.max(0, boss.progress),
    );
    const pulse = this.run.getEnemyPulse(boss.id);
    const y =
      this.layout.trackTop +
      slot * (this.layout.trackStepHeight + this.layout.trackStepGap) +
      this.layout.trackStepHeight * 0.5;

    this.bossContainer.setVisible(true);
    this.bossContainer.setPosition(this.getLaneCenter(2), y);
    this.bossContainer.setScale(1 + pulse * 0.06);
    this.bossBody.setFillStyle(0x7c3f37, 0.94);
    this.bossBody.setStrokeStyle(
      bossRemainingTurns(boss) <= 1 ? 4 : 3,
      bossRemainingTurns(boss) <= 1 ? 0xff3f3f : LANEFOLD_CONFIG.visuals.accentAlert,
      0.9,
    );
    this.bossHpText.setText(`BOSS HP ${boss.hp}/${boss.maxHp}`);
    this.bossMetaText.setText(
      `T-${bossRemainingTurns(boss)} // center lanes // edges support 50%`,
    );
  }

  private renderEnemies(): void {
    const state = this.run.getState();
    const activeEnemyIds = new Set<number>();

    state.lanes.forEach((lane, laneIndex) => {
      const slotCounts = new Map<number, number>();
      const slotTotals = new Map<number, number>();

      lane.forEach((enemy) => {
        const slot = Math.min(
          LANEFOLD_CONFIG.loss.breachProgress - 1,
          Math.max(0, enemy.progress),
        );
        slotTotals.set(slot, (slotTotals.get(slot) ?? 0) + 1);
      });

      lane.forEach((enemy) => {
        activeEnemyIds.add(enemy.id);

        let view = this.enemyViews.get(enemy.id);

        if (!view) {
          view = this.createEnemyView(enemy);
          this.enemyViews.set(enemy.id, view);
        }

        const slot = Math.min(
          LANEFOLD_CONFIG.loss.breachProgress - 1,
          Math.max(0, enemy.progress),
        );
        const slotIndex = slotCounts.get(slot) ?? 0;
        const slotTotal = slotTotals.get(slot) ?? 1;
        const laneThreat = this.getLaneThreat(laneIndex);
        const isFront = laneThreat.frontEnemyId === enemy.id;
        const threatColor = dangerColor(dangerLevelForTurns(remainingTurns(enemy)));
        const pulse = this.run.getEnemyPulse(enemy.id);
        const x = this.getLaneCenter(laneIndex);
        const xOffset = (slotIndex - (slotTotal - 1) / 2) * 16;
        const y =
          this.layout.trackTop +
          slot * (this.layout.trackStepHeight + this.layout.trackStepGap) +
          this.layout.trackStepHeight * 0.5;

        slotCounts.set(slot, slotIndex + 1);
        view.container.setPosition(x + xOffset, y);
        view.container.setScale((isFront ? 1 : 0.86) + pulse * 0.08);
        view.container.setAlpha(isFront ? 1 : 0.78);
        view.card.setFillStyle(0x6d5038, isFront ? 0.96 : 0.84);
        view.card.setStrokeStyle(isFront ? 2 : 1, threatColor, isFront ? 0.95 : 0.58);
        view.hpText.setText(`HP ${enemy.hp}`);
        view.turnsText.setText(`T-${remainingTurns(enemy)}`);
        view.turnsText.setColor(this.threatTextColor(dangerLevelForTurns(remainingTurns(enemy))));
        view.priorityText.setVisible(isFront && remainingTurns(enemy) <= 2);
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
    const card = this.add.rectangle(0, 0, 78, 34, 0x6d5038, 0.96);
    const body =
      enemy.kind === 'prism'
        ? this.add.rectangle(-29, 0, 16, 16, colors.body, 0.96).setAngle(45)
        : enemy.kind === 'blob'
          ? this.add.ellipse(-29, 0, 20, 16, colors.body, 0.96)
          : this.add.ellipse(-29, 0, 22, 14, colors.body, 0.96);

    const core =
      enemy.kind === 'prism'
        ? this.add.rectangle(-29, 0, 4, 12, colors.core, 0.94)
        : enemy.kind === 'blob'
          ? this.add.ellipse(-29, -1, 7, 7, colors.core, 0.92)
          : this.add.rectangle(-29, 0, 7, 7, colors.core, 0.95);

    const hpText = this.add.text(-12, -8, `HP ${enemy.hp}`, {
      color: '#fff9e8',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '12px',
      fontStyle: '700',
    }).setOrigin(0, 0.5);

    const turnsText = this.add.text(-12, 8, `T-${remainingTurns(enemy)}`, {
      color: '#f7d69a',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '12px',
      fontStyle: '800',
    }).setOrigin(0, 0.5);

    const priorityText = this.add.text(0, -26, 'KILL', {
      color: '#fff7cf',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '10px',
      fontStyle: '900',
      backgroundColor: '#c7355a',
      padding: { x: 5, y: 1 },
    }).setOrigin(0.5);

    card.setStrokeStyle(2, 0xffe2a2, 0.7);
    const container = this.add.container(0, 0, [
      card,
      body,
      core,
      hpText,
      turnsText,
      priorityText,
    ]);
    container.setDepth(5);
    return { container, hpText, turnsText, priorityText, card };
  }

  private renderOverlays(): void {
    const mode = this.run.getMode();
    const state = this.run.getState();

    this.titleContainer.setVisible(mode === 'title');
    this.gameOverContainer.setVisible(mode === 'gameover');
    this.rewardContainer.setVisible(mode === 'reward');

    if (mode === 'reward') {
      this.renderRewardChoices(state.rewardChoices);
      return;
    }

    if (mode !== 'gameover') {
      return;
    }

    const breachedLane = this.run.getLastSummary()?.breachedLane;
    const breachedByBoss = this.run.getLastSummary()?.breachedByBoss;
    const lossTitle =
      state.lossReason === 'lane_breach' && breachedByBoss
        ? 'Boss breached center lanes'
        : state.lossReason === 'lane_breach' && breachedLane !== null && breachedLane !== undefined
          ? `Lane ${breachedLane + 1} breached`
          : formatLoss(state.lossReason);
    const lossCause =
      state.lossReason === 'lane_breach' && breachedByBoss
        ? 'The boss crossed the shared breach edge across the center lanes.'
        : state.lossReason === 'lane_breach' && breachedLane !== null && breachedLane !== undefined
          ? `An enemy crossed the breach edge in lane ${breachedLane + 1}.`
          : 'The relay grid has no safe shift left.';

    this.gameOverTitle.setText(lossTitle);
    this.gameOverBody.setText(
      `${lossCause}\nScore ${state.score} // Turn ${state.turn}\nTier ${state.tier} // Pressure ${state.pressure}`,
    );
  }

  private renderRewardChoices(rewards: RewardDefinition[]): void {
    this.rewardTitle.setText(
      `${formatPhase(this.run.getLastSummary()?.encounterCleared ?? 'reward')} Cleared`,
    );
    this.rewardSubtitle.setText(
      `Choose one reward for Tier ${this.run.getState().tier + 1}. Utility rewards overwrite the held slot.`,
    );

    this.rewardCards.forEach((card, index) => {
      const reward = rewards[index];

      if (!reward) {
        card.container.setVisible(false);
        return;
      }

      card.container.setVisible(true);
      card.categoryText.setText(reward.category.toUpperCase());
      card.nameText.setText(reward.name);
      card.descriptionText.setText(reward.description);
      card.body.setStrokeStyle(2, this.rewardCategoryColor(reward.category), 0.72);
    });
  }

  private rewardCategoryColor(category: RewardDefinition['category']): number {
    switch (category) {
      case 'economy':
        return LANEFOLD_CONFIG.visuals.accentLeaf;
      case 'combat':
        return LANEFOLD_CONFIG.visuals.accentWarm;
      case 'utility':
      default:
        return LANEFOLD_CONFIG.visuals.accentCool;
    }
  }
}
