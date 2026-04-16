import { BOARD_HEIGHT, BOARD_WIDTH, LANEFOLD_CONFIG, tileDisplayValue } from '../config';
import { computePressure } from '../core/enemies';
import { createInitialRunState, resolvePlayerTurn } from '../core/resolveTurn';
import { applyRewardToState } from '../core/rewards';
import type {
  Direction,
  LossReason,
  RewardDefinition,
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
        extraSpawnedTile: null,
        scoreGain: 0,
        invalidMove: true,
        breachedLane: null,
        breachedByBoss: false,
        lossReason: this.state.lossReason,
        phaseBefore: this.state.phase,
        phaseAfter: this.state.phase,
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
    if (summary.encounterStarted === 'boss' && this.state.boss) {
      this.enemyPulse.set(this.state.boss.id, 280);
      this.state.boss.occupiedLanes.forEach((lane) => {
        this.lanePulseMs[lane] = 260;
      });
    }

    if (summary.lossReason) {
      this.mode = 'gameover';
    } else if (state.phase === 'reward') {
      this.mode = 'reward';
    }

    return summary;
  }

  public selectReward(index: number): RewardDefinition | null {
    if (this.mode !== 'reward') {
      return null;
    }

    const reward = this.state.rewardChoices[index];

    if (!reward) {
      return null;
    }

    const rewardedState = applyRewardToState(this.state, reward);
    this.state = {
      ...rewardedState,
      tier: rewardedState.tier + 1,
      phase: 'normal',
      phaseTurn: 0,
      encounterType: null,
      boss: null,
      rewardChoices: [],
      pressure: Math.round(computePressure(rewardedState.lanes, null)),
    };
    this.mode = 'playing';
    this.lastSummary = null;
    this.invalidMoveMs = 0;
    return reward;
  }

  public activateUtility(): boolean {
    if (this.mode !== 'playing' || !this.state.utilitySlot) {
      return false;
    }

    this.state = {
      ...this.state,
      utilitySlot: null,
      freezeAdvanceTurns: Math.max(
        this.state.freezeAdvanceTurns,
        LANEFOLD_CONFIG.rewards.emergencyFreezeTurns,
      ),
    };
    return true;
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
          `rows increase downward, columns increase left to right, enemies descend by lane toward breach progress ${LANEFOLD_CONFIG.loss.breachProgress}`,
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
    const boss = this.state.boss
      ? {
          hp: this.state.boss.hp,
          maxHp: this.state.boss.maxHp,
          progress: this.state.boss.progress,
          turnsToBreach: Math.max(
            0,
            LANEFOLD_CONFIG.loss.breachProgress - this.state.boss.progress,
          ),
          occupiedLanes: [...this.state.boss.occupiedLanes],
          absorbedHp: this.state.boss.absorbedHp,
        }
      : null;

    return {
      mode: this.mode,
      turn: this.state.turn,
      tier: this.state.tier,
      phase: this.state.phase,
      phaseTurn: this.state.phaseTurn,
      encounterType: this.state.encounterType,
      score: this.state.score,
      difficulty: this.state.difficulty,
      pressure: this.state.pressure,
      boss,
      modifiers: this.state.modifiers,
      utilitySlot: this.state.utilitySlot,
      rewardChoices: this.state.rewardChoices.map((reward) => ({
        id: reward.id,
        category: reward.category,
        name: reward.name,
        description: reward.description,
      })),
      board,
      lanes,
      lastMove: this.lastSummary
        ? {
            changed: this.lastSummary.changed,
            invalidMove: this.lastSummary.invalidMove,
            scoreGain: this.lastSummary.scoreGain,
            mergeCount: this.lastSummary.merges.length,
            attackCount: this.lastSummary.attacks.length,
            attacks: this.lastSummary.attacks.map((attack) => ({
              lane: attack.lane,
              laneDamage: attack.laneDamage,
              damage: attack.damage,
              hpBefore: attack.hpBefore,
              hpAfter: attack.hpAfter,
              destroyed: attack.destroyed,
              target: attack.target,
              source: attack.source,
              support: attack.support,
            })),
            spawnedEnemies: this.lastSummary.spawnedEnemies.length,
            spawnedTile: this.lastSummary.spawnedTile,
            extraSpawnedTile: this.lastSummary.extraSpawnedTile,
            breachedLane: this.lastSummary.breachedLane,
            breachedByBoss: this.lastSummary.breachedByBoss,
            lossReason: this.lastSummary.lossReason,
            phaseBefore: this.lastSummary.phaseBefore,
            phaseAfter: this.lastSummary.phaseAfter,
            encounterStarted: this.lastSummary.encounterStarted,
            encounterCleared: this.lastSummary.encounterCleared,
            advanceFrozen: this.lastSummary.advanceFrozen,
            absorbedHp: this.lastSummary.absorbedHp,
          }
        : undefined,
      note:
        `board uses top-left origin; rows 0-4, cols 0-4. Lane progress 0 is the spawn edge and ${LANEFOLD_CONFIG.loss.breachProgress} breaches the relay gate.`,
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
