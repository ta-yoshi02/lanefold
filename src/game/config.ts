import type { EnemyKind } from './types';

const enemyKinds: EnemyKind[] = ['drone', 'blob', 'prism'];

export const LANEFOLD_CONFIG = {
  meta: {
    title: 'Lanefold',
  },
  viewport: {
    width: 900,
    height: 1180,
  },
  board: {
    width: 5,
    height: 5,
    baseValue: 2,
    mergeRankStep: 1,
    initialTileCount: 5,
    newTileRankPool: [1, 1, 1, 1, 2, 2, 3],
    mergeScoreFactor: 8,
  },
  lanes: {
    count: 5,
    enemyAdvancePerTurn: 1,
    enemySpawnIntervalTurns: 1,
    spawnBatchBase: 1,
    spawnBatchEveryTurns: 10,
    spawnBatchCap: 3,
    maxEnemiesPerLane: 6,
    spawnProgress: 0,
  },
  enemies: {
    hpBase: 6,
    hpScalePerTurn: 1.5,
    hpVariance: 5,
    kindPool: enemyKinds,
    killScoreFactor: 5,
  },
  combat: {
    attackTimingMs: 140,
  },
  progression: {
    normalSpawnPattern: [1, 2, 2, 3, 3],
    warningTurns: 1,
    bossEveryNTiers: 3,
  },
  encounters: {
    eliteHpMultiplier: 2.6,
    bossHpMultiplier: 7.5,
    bossCenterLanes: [1, 2, 3],
    bossSpawnProgress: 0,
    sideLaneSupportMultiplier: 0.5,
  },
  rewards: {
    overchargeDamageFactor: 0.5,
    splashThresholdValue: 32,
    splashDamageFactor: 0.25,
    emergencyFreezeTurns: 1,
  },
  difficulty: {
    turnsPerStep: 5,
  },
  loss: {
    breachProgress: 6,
    loseOnLaneBreach: true,
    loseOnGridLock: true,
  },
  input: {
    swipeThreshold: 36,
  },
  visuals: {
    backgroundTop: 0x22324a,
    backgroundBottom: 0x091018,
    panelDark: 0x111a24,
    panelMid: 0x1d2b3d,
    laneBeam: 0x5bc0be,
    laneDanger: 0xff7a59,
    textMain: '#f5efdd',
    textMuted: '#b6bcc8',
    accentWarm: 0xf3b562,
    accentCool: 0x64d2cc,
    accentAlert: 0xff6f59,
  },
} as const;

export const BOARD_WIDTH = LANEFOLD_CONFIG.board.width;
export const BOARD_HEIGHT = LANEFOLD_CONFIG.board.height;
export const LANE_COUNT = LANEFOLD_CONFIG.lanes.count;

export function tileDisplayValue(rank: number): number {
  return LANEFOLD_CONFIG.board.baseValue ** rank;
}

export function mergeScore(rank: number): number {
  return tileDisplayValue(rank) * LANEFOLD_CONFIG.board.mergeScoreFactor;
}

export function enemyKillScore(maxHp: number): number {
  return Math.max(
    6,
    Math.round(maxHp * LANEFOLD_CONFIG.enemies.killScoreFactor * 0.5),
  );
}

export function difficultyTier(turn: number): number {
  return 1 + Math.floor(turn / LANEFOLD_CONFIG.difficulty.turnsPerStep);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
