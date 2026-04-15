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
    spawnBatchEveryTurns: 6,
    spawnBatchCap: 3,
    maxEnemiesPerLane: 5,
    spawnProgress: 0,
  },
  enemies: {
    hpBase: 12,
    hpScalePerTurn: 1.75,
    hpVariance: 4,
    kindPool: enemyKinds,
    killScoreFactor: 5,
  },
  combat: {
    rowPower: [0.72, 0.86, 1.0, 1.18, 1.38],
    attackScalar: 0.5,
    attackTimingMs: 140,
    overflowIntoNextEnemy: true,
  },
  difficulty: {
    turnsPerStep: 5,
  },
  loss: {
    breachProgress: 5,
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

export function tileAttackPower(rank: number, row: number): number {
  const rowPower = LANEFOLD_CONFIG.combat.rowPower[row] ?? 1;
  const raw = tileDisplayValue(rank) * LANEFOLD_CONFIG.combat.attackScalar * rowPower;
  return Math.max(1, Math.round(raw));
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
