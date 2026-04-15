export type ScreenMode = 'title' | 'playing' | 'gameover';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type EnemyKind = 'drone' | 'blob' | 'prism';
export type LossReason = 'lane_breach' | 'grid_lock';
export type Grid = Array<Array<Tile | null>>;
export type Lanes = Enemy[][];

export interface Position {
  row: number;
  col: number;
}

export interface Tile {
  id: number;
  rank: number;
}

export interface Enemy {
  id: number;
  lane: number;
  hp: number;
  maxHp: number;
  progress: number;
  kind: EnemyKind;
}

export interface ChangedCell extends Position {
  rank: number;
}

export interface MergeEvent extends Position {
  rank: number;
  value: number;
}

export interface TileSpawnEvent extends Position {
  rank: number;
}

export interface AttackEvent {
  lane: number;
  enemyId: number;
  laneDamage: number;
  damage: number;
  hpBefore: number;
  hpAfter: number;
  destroyed: boolean;
}

export interface EnemySpawnEvent {
  enemyId: number;
  lane: number;
  hp: number;
  kind: EnemyKind;
}

export interface MoveResolution {
  changed: boolean;
  grid: Grid;
  merges: MergeEvent[];
  changedCells: ChangedCell[];
  scoreGain: number;
  nextId: number;
}

export interface CombatResolution {
  lanes: Lanes;
  attacks: AttackEvent[];
  destroyedEnemyIds: number[];
  scoreGain: number;
}

export interface AdvanceResolution {
  lanes: Lanes;
  breachedLane: number | null;
}

export interface SpawnResolution {
  lanes: Lanes;
  spawnedEnemies: EnemySpawnEvent[];
  nextId: number;
}

export interface RunState {
  board: Grid;
  lanes: Lanes;
  turn: number;
  score: number;
  pressure: number;
  difficulty: number;
  nextEntityId: number;
  lossReason: LossReason | null;
}

export interface TurnSummary {
  changed: boolean;
  direction: Direction;
  merges: MergeEvent[];
  changedCells: ChangedCell[];
  attacks: AttackEvent[];
  spawnedEnemies: EnemySpawnEvent[];
  spawnedTile: TileSpawnEvent | null;
  scoreGain: number;
  invalidMove: boolean;
  breachedLane: number | null;
  lossReason: LossReason | null;
}

export interface TextSnapshot {
  mode: ScreenMode;
  turn?: number;
  score?: number;
  difficulty?: number;
  pressure?: number;
  board?: Array<Array<number | '.'>>;
  lanes?: Array<
    Array<{
      hp: number;
      maxHp: number;
      progress: number;
      turnsToBreach: number;
      kind: EnemyKind;
    }>
  >;
  lastMove?: {
    changed: boolean;
    invalidMove: boolean;
    scoreGain: number;
    mergeCount: number;
    attackCount: number;
    attacks: Array<{
      lane: number;
      laneDamage: number;
      damage: number;
      hpBefore: number;
      hpAfter: number;
      destroyed: boolean;
    }>;
    spawnedEnemies: number;
    spawnedTile: TileSpawnEvent | null;
    breachedLane: number | null;
    lossReason: LossReason | null;
  };
  note: string;
}
