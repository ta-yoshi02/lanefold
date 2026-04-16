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
    case 'elite':
      return { body: 0xffc857, core: 0x28180b };
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

  private enemyViews = new Map<number, EnemyView>();

  private scoreText!: Phaser.GameObjects.Text;

  private turnText!: Phaser.GameObjects.Text;

  private difficultyText!: Phaser.GameObjects.Text;

  private pressureText!: Phaser.GameObjects.Text;

  private statusText!: Phaser.GameObjects.Text;

  private hintText!: Phaser.GameObjects.Text;

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

  private titleGlow!: Phaser.GameObjects.Ellipse;

  private backgroundOrbs: Phaser.GameObjects.Ellipse[] = [];

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
      650,
      640,
      880,
      LANEFOLD_CONFIG.visuals.panelDark,
      0.32,
    ).setStrokeStyle(2, LANEFOLD_CONFIG.visuals.panelMid, 0.7);

    for (let lane = 0; lane < BOARD_WIDTH; lane += 1) {
      const x = this.getLaneCenter(lane);
      const columnBack = this.add.rectangle(
        x,
        this.layout.boardTop + this.boardHeight * 0.5,
        this.layout.cellSize + 4,
        this.boardHeight + 8,
        LANEFOLD_CONFIG.visuals.laneBeam,
        0.055,
      );

      const trackBack = this.add.rectangle(
        x,
        this.layout.trackTop + this.trackHeight * 0.5,
        this.layout.cellSize + 4,
        this.trackHeight + 18,
        0x0b1520,
        0.74,
      );

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
          0x172535,
          0.78,
        );

        stepRect.setStrokeStyle(1, 0x35516a, 0.72);
        stepRect.setDepth(2);
        laneSteps.push(stepRect);
      }

      const laneLabel = this.add.text(
        x,
        this.breachY - 38,
        `LANE ${lane + 1}`,
        {
          color: LANEFOLD_CONFIG.visuals.textMuted,
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
          color: LANEFOLD_CONFIG.visuals.textMuted,
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
          color: '#8fc8c5',
          fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
          fontSize: '13px',
          fontStyle: '800',
        },
      ).setOrigin(0.5);

      const breachSegment = this.add.rectangle(
        x,
        this.breachY,
        this.layout.cellSize - 2,
        10,
        LANEFOLD_CONFIG.visuals.laneDanger,
        0.72,
      );

      columnBack.setDepth(1);
      trackBack.setDepth(1);
      laneLabel.setDepth(6);
      threatText.setDepth(6);
      attackText.setDepth(6);
      breachSegment.setDepth(7);
      breachSegment.setStrokeStyle(2, 0xffd0bf, 0.35);

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
      'BREACH EDGE // enemy crossing this line ends the run',
      {
        color: '#ffb29d',
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '16px',
        fontStyle: '800',
        letterSpacing: 1,
      },
    ).setOrigin(0.5).setAlpha(0.9).setDepth(8);
  }

  private createHud(): void {
    this.add.text(72, 34, 'LANEFOLD', {
      color: LANEFOLD_CONFIG.visuals.textMain,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '42px',
      fontStyle: '800',
      letterSpacing: 2,
    });

    this.add.text(74, 84, 'slide, merge, realign the lanes', {
      color: LANEFOLD_CONFIG.visuals.textMuted,
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '18px',
      fontStyle: '500',
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

    this.utilityBack = this.add.rectangle(722, 38, 250, 36, 0x10202b, 0.78);
    this.utilityBack.setStrokeStyle(2, 0x365269, 0.72);
    this.utilityBack.setInteractive({ useHandCursor: true });
    this.utilityBack.on('pointerup', () => {
      this.handleUtility();
    });

    this.utilityText = this.add.text(722, 38, 'UTILITY EMPTY', {
      color: LANEFOLD_CONFIG.visuals.textMuted,
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
    this.boardFrame = this.add.rectangle(
      450,
      this.layout.boardTop + this.boardHeight * 0.5,
      this.boardWidth + 18,
      this.boardHeight + 18,
      0x000000,
      0,
    );
    this.boardFrame.setStrokeStyle(4, 0xf7f0df, 0.16);
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
    this.bossBody = this.add.rectangle(0, 0, width, 52, 0x1b1016, 0.96);
    this.bossBody.setStrokeStyle(3, LANEFOLD_CONFIG.visuals.accentAlert, 0.86);

    const core = this.add.rectangle(-width * 0.42, 0, 24, 24, 0xffc857, 0.96);
    core.setAngle(45);

    this.bossHpText = this.add.text(-width * 0.3, -10, 'BOSS HP', {
      color: '#f8f1de',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '16px',
      fontStyle: '900',
    }).setOrigin(0, 0.5);

    this.bossMetaText = this.add.text(-width * 0.3, 12, 'CENTER LANES', {
      color: '#ffccb8',
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

    this.rewardContainer = this.createPanelContainer(
      450,
      690,
      720,
      520,
      20,
    );
    this.rewardTitle = this.add.text(0, -200, 'Encounter Cleared', {
      color: '#f8f1de',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '50px',
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5);
    this.rewardSubtitle = this.add.text(0, -154, 'Choose one run upgrade. Utility choices overwrite the slot.', {
      color: '#bac6d0',
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
    const body = this.add.rectangle(0, 0, 194, 260, 0x13202b, 0.96);
    body.setStrokeStyle(2, 0x63d0c7, 0.55);

    const categoryText = this.add.text(0, -96, 'CATEGORY', {
      color: '#8fe3dc',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '14px',
      fontStyle: '900',
      align: 'center',
    }).setOrigin(0.5);

    const nameText = this.add.text(0, -46, 'Reward', {
      color: '#f8f1de',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '25px',
      fontStyle: '900',
      align: 'center',
      wordWrap: { width: 160 },
    }).setOrigin(0.5);

    const descriptionText = this.add.text(0, 42, 'Description', {
      color: '#d9dfdf',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '17px',
      fontStyle: '600',
      align: 'center',
      lineSpacing: 5,
      wordWrap: { width: 156 },
    }).setOrigin(0.5);

    const keyText = this.add.text(0, 110, `Press ${index + 1}`, {
      color: '#091018',
      backgroundColor: '#63d0c7',
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
      body.setFillStyle(0x183040, 0.98);
      body.setStrokeStyle(3, 0x9af2ea, 0.85);
    });
    container.on('pointerout', () => {
      body.setFillStyle(0x13202b, 0.96);
      body.setStrokeStyle(2, 0x63d0c7, 0.55);
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

    this.backgroundOrbs[0]?.setPosition(140 + Math.sin(t * 0.6) * 12, 120);
    this.backgroundOrbs[1]?.setPosition(770, 230 + Math.sin(t * 0.45) * 10);
    this.backgroundOrbs[2]?.setPosition(260 + Math.cos(t * 0.35) * 18, 1060);
    this.titleGlow.setScale(1 + Math.sin(t * 0.8) * 0.02);
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
        mode === 'title' ? 0.035 : 0.06 + alphaBoost + pulse * 0.1,
      );
      this.laneTrackBacks[lane]?.setFillStyle(
        0x0b1520,
        mode === 'title' ? 0.52 : 0.74,
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
          stepHasEnemy ? color : nearEdge ? 0x3b2027 : 0x172535,
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
        return '#b6ebe8';
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
    this.pressureText.setColor(
      state.phase === 'warning' ? '#ffccb8' : this.threatTextColor(globalThreat.level),
    );
    this.renderUtilityHud(mode);

    if (mode === 'title') {
      this.statusText.setText('Compact lane tracks show HP and turns-to-breach.');
      this.hintText.setText('Enter or tap Start Run. Use F for fullscreen.');
      return;
    }

    if (mode === 'gameover') {
      this.statusText.setText(formatLoss(this.run.getGameOverReason()));
      this.hintText.setText('Press Enter or tap Restart to begin a fresh run.');
      return;
    }

    if (mode === 'reward') {
      this.statusText.setText('Choose one reward. Board and remaining lanes carry forward.');
      this.statusText.setColor('#f5efdd');
      this.statusText.setAlpha(0.76);
      this.hintText.setText('Press 1 / 2 / 3 or click a reward card.');
      return;
    }

    const lastSummary = this.run.getLastSummary();
    const invalidAlpha = this.run.getInvalidMoveAlpha();

    if (lastSummary?.invalidMove && invalidAlpha > 0) {
      this.statusText.setText('No shift on that vector.');
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
      this.statusText.setText('Emergency Freeze stopped enemy advance for this turn.');
      this.statusText.setColor('#b6ebe8');
      this.statusText.setAlpha(0.82);
    } else if (lastSummary?.changed) {
      this.statusText.setText(
        `last move: ${this.formatCombatSummary(lastSummary.attacks)} // +${lastSummary.scoreGain}`,
      );
      this.statusText.setColor('#f5efdd');
      this.statusText.setAlpha(0.58);
    } else if (state.phase === 'warning') {
      this.statusText.setText('Warning turn: no normal spawn, but existing enemies still advance.');
      this.statusText.setColor('#ffccb8');
      this.statusText.setAlpha(0.72);
    } else if (state.phase === 'boss') {
      this.statusText.setText('Boss HP is shared across center lanes. Edge lanes deal 50% support.');
      this.statusText.setColor('#ffccb8');
      this.statusText.setAlpha(0.7);
    } else {
      this.statusText.setText('Each board column fires into the same numbered lane.');
      this.statusText.setColor('#f5efdd');
      this.statusText.setAlpha(0.62);
    }

    this.hintText.setText(
      state.utilitySlot
        ? 'Arrow keys or swipe to shift. Press U or tap Utility to activate the held utility.'
        : 'Arrow keys or swipe to shift. Matching values merge. Any lane breach ends the run.',
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
      this.utilityBack.setFillStyle(0x163847, 0.9);
      this.utilityBack.setStrokeStyle(2, LANEFOLD_CONFIG.visuals.accentCool, 0.88);
      this.utilityText.setText('FREEZE ARMED // NEXT ADVANCE');
      this.utilityText.setColor('#b6ebe8');
      return;
    }

    if (mode === 'playing' && state.utilitySlot) {
      this.utilityBack.setInteractive({ useHandCursor: true });
      this.utilityBack.setFillStyle(0x302416, 0.9);
      this.utilityBack.setStrokeStyle(2, LANEFOLD_CONFIG.visuals.accentWarm, 0.88);
      this.utilityText.setText(`UTILITY [U] ${state.utilitySlot.name}`);
      this.utilityText.setColor('#ffe6b8');
      return;
    }

    this.utilityBack.disableInteractive();
    this.utilityBack.setFillStyle(0x10202b, 0.62);
    this.utilityBack.setStrokeStyle(2, 0x365269, 0.42);
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
      globalThreat.level === 'clear' ? 0.16 : 0.34,
    );

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
    this.bossBody.setFillStyle(0x1b1016, 0.94);
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
        view.card.setFillStyle(0x0f1a24, isFront ? 0.96 : 0.86);
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
    const card = this.add.rectangle(0, 0, 78, 34, 0x0f1a24, 0.96);
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
      color: '#f7f0df',
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
      color: '#ffdfd4',
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '10px',
      fontStyle: '900',
      backgroundColor: '#7a1f22',
      padding: { x: 5, y: 1 },
    }).setOrigin(0.5);

    card.setStrokeStyle(1, 0x63d0c7, 0.7);
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
        return 0x8fe37d;
      case 'combat':
        return 0xffc857;
      case 'utility':
      default:
        return 0x63d0c7;
    }
  }
}
