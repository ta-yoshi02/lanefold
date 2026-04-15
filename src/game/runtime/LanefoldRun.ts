import { BOARD_HEIGHT, BOARD_WIDTH, LANEFOLD_CONFIG, tileDisplayValue } from '../config';
import { createInitialRunState, resolvePlayerTurn } from '../core/resolveTurn';
import type {
  Direction,
  LossReason,
  RunState,
  ScreenMode,
  TextSnapshot,
  TileSpawnEvent,
  TurnSummary,
} from '../types';

function decay(value: number, amount: number): number {
  return Math.max(0, value - amount);
}

export class LanefoldRun {
  private rng: () => number;

  private state: RunState;

  private mode: ScreenMode = 'title';

  private lanePulseMs = Array.from(
    { length: LANEFOLD_CONFIG.lanes.count },
    () => 0,
  );

  private cellPulse = new Map<string, number>();

  private enemyPulse = new Map<number, number>();

  private invalidMoveMs = 0;

  private idleMs = 0;

  private lastSummary: TurnSummary | null = null;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.state = createInitialRunState(this.rng);
  }

  public startRun(): void {
    this.state = createInitialRunState(this.rng);
    this.mode = 'playing';
    this.lanePulseMs.fill(0);
    this.cellPulse.clear();
    this.enemyPulse.clear();
    this.invalidMoveMs = 0;
    this.lastSummary = null;
  }

  public restart(): void {
    this.startRun();
  }

  public getMode(): ScreenMode {
    return this.mode;
  }

  public getState(): RunState {
    return this.state;
  }

  public getLastSummary(): TurnSummary | null {
    return this.lastSummary;
  }

  public getIdleMs(): number {
    return this.idleMs;
  }

  public getInvalidMoveAlpha(): number {
    return this.invalidMoveMs / 220;
  }

  public getLanePulse(lane: number): number {
    return (this.lanePulseMs[lane] ?? 0) / 260;
  }

  public getCellPulse(row: number, col: number): number {
    const key = `${row}:${col}`;
    return (this.cellPulse.get(key) ?? 0) / 280;
  }

  public getEnemyPulse(enemyId: number): number {
    return (this.enemyPulse.get(enemyId) ?? 0) / 240;
  }

  public move(direction: Direction): TurnSummary {
    if (this.mode !== 'playing') {
      return {
        changed: false,
        direction,
        merges: [],
        changedCells: [],
        attacks: [],
        spawnedEnemies: [],
        spawnedTile: null,
        scoreGain: 0,
        invalidMove: true,
        breachedLane: null,
        lossReason: this.state.lossReason,
      };
    }

    const { state, summary } = resolvePlayerTurn(this.state, direction, this.rng);

    if (!summary.changed) {
      this.invalidMoveMs = 220;
      this.lastSummary = summary;
      return summary;
    }

    this.state = state;
    this.lastSummary = summary;
    this.invalidMoveMs = 0;

    this.cellPulse.clear();
    summary.changedCells.forEach((cell) => {
      this.cellPulse.set(`${cell.row}:${cell.col}`, 280);
    });

    this.lanePulseMs.fill(0);
    summary.attacks.forEach((attack) => {
      this.lanePulseMs[attack.lane] = 260;
      this.enemyPulse.set(attack.enemyId, 240);
    });
    summary.spawnedEnemies.forEach((spawn) => {
      this.lanePulseMs[spawn.lane] = 260;
      this.enemyPulse.set(spawn.enemyId, 240);
    });

    if (summary.lossReason) {
      this.mode = 'gameover';
    }

    return summary;
  }

  public advanceTime(ms: number): void {
    this.idleMs += ms;
    this.invalidMoveMs = decay(this.invalidMoveMs, ms);
    this.lanePulseMs = this.lanePulseMs.map((value) => decay(value, ms));

    this.cellPulse.forEach((value, key) => {
      const nextValue = decay(value, ms);

      if (nextValue <= 0) {
        this.cellPulse.delete(key);
      } else {
        this.cellPulse.set(key, nextValue);
      }
    });

    this.enemyPulse.forEach((value, key) => {
      const nextValue = decay(value, ms);

      if (nextValue <= 0) {
        this.enemyPulse.delete(key);
      } else {
        this.enemyPulse.set(key, nextValue);
      }
    });
  }

  public toTextSnapshot(): TextSnapshot {
    if (this.mode === 'title') {
      return {
        mode: 'title',
        note:
          'rows increase downward, columns increase left to right, enemies descend by lane toward breach progress 5',
      };
    }

    const board = this.state.board.map((row) =>
      row.map((tile) => (tile ? tileDisplayValue(tile.rank) : '.')),
    );
    const lanes = this.state.lanes.map((lane) =>
      lane.map((enemy) => ({
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        progress: enemy.progress,
        turnsToBreach: Math.max(0, LANEFOLD_CONFIG.loss.breachProgress - enemy.progress),
        kind: enemy.kind,
      })),
    );

    return {
      mode: this.mode,
      turn: this.state.turn,
      score: this.state.score,
      difficulty: this.state.difficulty,
      pressure: this.state.pressure,
      board,
      lanes,
      lastMove: this.lastSummary
        ? {
            changed: this.lastSummary.changed,
            invalidMove: this.lastSummary.invalidMove,
            scoreGain: this.lastSummary.scoreGain,
            mergeCount: this.lastSummary.merges.length,
            attackCount: this.lastSummary.attacks.length,
            spawnedEnemies: this.lastSummary.spawnedEnemies.length,
            spawnedTile: this.lastSummary.spawnedTile,
            breachedLane: this.lastSummary.breachedLane,
            lossReason: this.lastSummary.lossReason,
          }
        : undefined,
      note:
        'board uses top-left origin; rows 0-4, cols 0-4. Lane progress 0 is the spawn edge and 5 breaches the relay gate.',
    };
  }

  public renderGameToText(): string {
    return JSON.stringify(this.toTextSnapshot());
  }

  public titleReady(): void {
    this.mode = 'title';
    this.lastSummary = null;
  }

  public getGameOverReason(): LossReason | null {
    return this.state.lossReason;
  }

  public getSpawnedTilePulse(tile: TileSpawnEvent | null): number {
    if (!tile) {
      return 0;
    }

    return this.getCellPulse(tile.row, tile.col);
  }

  public boardOccupancy(): number {
    let occupied = 0;

    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        if (this.state.board[row]?.[col]) {
          occupied += 1;
        }
      }
    }

    return occupied;
  }
}
