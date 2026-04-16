export type ScreenMode = 'title' | 'playing' | 'reward' | 'gameover';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type EnemyKind = 'drone' | 'blob' | 'prism' | 'elite';
export type LossReason = 'lane_breach' | 'grid_lock';
export type Grid = Array<Array<Tile | null>>;
export type Lanes = Enemy[][];
export type RunPhase = 'normal' | 'warning' | 'elite' | 'boss' | 'reward';
export type EncounterType = 'elite' | 'boss';
export type RewardCategory = 'economy' | 'combat' | 'utility';
export type RewardId =
  | 'seeder'
  | 'overcharge'
  | 'pierce'
  | 'splash-matrix'
  | 'emergency-freeze';
export type AttackTarget = 'enemy' | 'boss';
export type AttackSource = 'lane' | 'overcharge';

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

export interface BossState {
  id: number;
  hp: number;
  maxHp: number;
  progress: number;
  occupiedLanes: number[];
  absorbedHp: number;
}

export interface RunModifiers {
  seeder: boolean;
  overcharge: boolean;
  pierce: boolean;
  splashMatrix: boolean;
}

export interface RewardDefinition {
  id: RewardId;
  category: RewardCategory;
  name: string;
  description: string;
}

export interface UtilitySlot {
  id: Extract<RewardId, 'emergency-freeze'>;
  name: string;
  description: string;
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
  target: AttackTarget;
  source: AttackSource;
  support: boolean;
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
  boss: BossState | null;
  attacks: AttackEvent[];
  destroyedEnemyIds: number[];
  scoreGain: number;
  bossDefeated: boolean;
}

export interface AdvanceResolution {
  lanes: Lanes;
  boss: BossState | null;
  breachedLane: number | null;
  breachedByBoss: boolean;
}

export interface SpawnResolution {
  lanes: Lanes;
  spawnedEnemies: EnemySpawnEvent[];
  nextId: number;
}

export interface RunState {
  board: Grid;
  lanes: Lanes;
  boss: BossState | null;
  turn: number;
  tier: number;
  phase: RunPhase;
  phaseTurn: number;
  encounterType: EncounterType | null;
  score: number;
  pressure: number;
  difficulty: number;
  nextEntityId: number;
  lossReason: LossReason | null;
  modifiers: RunModifiers;
  utilitySlot: UtilitySlot | null;
  freezeAdvanceTurns: number;
  rewardChoices: RewardDefinition[];
}

export interface TurnSummary {
  changed: boolean;
  direction: Direction;
  merges: MergeEvent[];
  changedCells: ChangedCell[];
  attacks: AttackEvent[];
  spawnedEnemies: EnemySpawnEvent[];
  spawnedTile: TileSpawnEvent | null;
  extraSpawnedTile: TileSpawnEvent | null;
  scoreGain: number;
  invalidMove: boolean;
  breachedLane: number | null;
  breachedByBoss: boolean;
  lossReason: LossReason | null;
  phaseBefore?: RunPhase;
  phaseAfter?: RunPhase;
  encounterStarted?: EncounterType | null;
  encounterCleared?: EncounterType | null;
  rewardChoices?: RewardDefinition[];
  advanceFrozen?: boolean;
  absorbedHp?: number;
}

export interface TextSnapshot {
  mode: ScreenMode;
  turn?: number;
  tier?: number;
  phase?: RunPhase;
  phaseTurn?: number;
  encounterType?: EncounterType | null;
  score?: number;
  difficulty?: number;
  pressure?: number;
  boss?: {
    hp: number;
    maxHp: number;
    progress: number;
    turnsToBreach: number;
    occupiedLanes: number[];
    absorbedHp: number;
  } | null;
  modifiers?: RunModifiers;
  utilitySlot?: UtilitySlot | null;
  rewardChoices?: Array<{
    id: RewardId;
    category: RewardCategory;
    name: string;
    description: string;
  }>;
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
      target: AttackTarget;
      source: AttackSource;
      support: boolean;
    }>;
    spawnedEnemies: number;
    spawnedTile: TileSpawnEvent | null;
    extraSpawnedTile: TileSpawnEvent | null;
    breachedLane: number | null;
    breachedByBoss: boolean;
    lossReason: LossReason | null;
    phaseBefore?: RunPhase;
    phaseAfter?: RunPhase;
    encounterStarted?: EncounterType | null;
    encounterCleared?: EncounterType | null;
    advanceFrozen?: boolean;
    absorbedHp?: number;
  };
  note: string;
}
