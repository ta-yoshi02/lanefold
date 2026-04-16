import {
  LANE_COUNT,
  LANEFOLD_CONFIG,
  difficultyTier,
  tileDisplayValue,
} from '../config';
import {
  canAnyMove,
  createEmptyGrid,
  moveBoard,
  spawnRandomTile,
  spawnTileWithRank,
} from './board';
import {
  advanceEnemies,
  applyDirectLaneDamage,
  computePressure,
  createBoss,
  resolveCombat,
  spawnEliteEnemy,
  spawnEnemyBatch,
  sumRemainingEnemyHp,
} from './enemies';
import {
  createInitialModifiers,
  encounterTypeForTier,
  normalSpawnCountForPhaseTurn,
  normalTurnCount,
} from './progression';
import { rollRewardChoices } from './rewards';
import type {
  AttackEvent,
  Direction,
  EncounterType,
  Lanes,
  RewardDefinition,
  RunPhase,
  RunState,
  TileSpawnEvent,
  TurnSummary,
} from '../types';

function createEmptyLanes(): Lanes {
  return Array.from({ length: LANE_COUNT }, () => []);
}

function hasElite(lanes: Lanes): boolean {
  return lanes.some((lane) => lane.some((enemy) => enemy.kind === 'elite'));
}

function invalidSummary(state: RunState, direction: Direction): TurnSummary {
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
    lossReason: state.lossReason,
    phaseBefore: state.phase,
    phaseAfter: state.phase,
  };
}

export function createInitialRunState(rng: () => number): RunState {
  let board = createEmptyGrid();
  let nextEntityId = 1;

  for (let count = 0; count < LANEFOLD_CONFIG.board.initialTileCount; count += 1) {
    const spawned = spawnRandomTile(board, nextEntityId, rng);
    board = spawned.grid;
    nextEntityId = spawned.nextId;
  }

  return {
    board,
    lanes: createEmptyLanes(),
    boss: null,
    turn: 0,
    tier: 1,
    phase: 'normal',
    phaseTurn: 0,
    encounterType: null,
    score: 0,
    pressure: 0,
    difficulty: 1,
    nextEntityId,
    lossReason: null,
    modifiers: createInitialModifiers(),
    utilitySlot: null,
    freezeAdvanceTurns: 0,
    rewardChoices: [],
  };
}

function resolveProgressionAfterAdvance(params: {
  phase: RunPhase;
  phaseTurn: number;
  tier: number;
  encounterType: EncounterType | null;
  lanes: Lanes;
  nextId: number;
  turn: number;
  rng: () => number;
  encounterCleared: EncounterType | null;
}): {
  phase: RunPhase;
  phaseTurn: number;
  encounterType: EncounterType | null;
  lanes: Lanes;
  bossCreated: ReturnType<typeof createBoss>['boss'] | null;
  nextId: number;
  spawnedEnemies: ReturnType<typeof spawnEnemyBatch>['spawnedEnemies'];
  encounterStarted: EncounterType | null;
  rewardChoices: ReturnType<typeof rollRewardChoices>;
  absorbedHp: number;
} {
  const {
    phase,
    phaseTurn,
    tier,
    encounterType,
    rng,
    turn,
    encounterCleared,
  } = params;
  let nextPhase = phase;
  let nextPhaseTurn = phaseTurn;
  let nextEncounterType = encounterType;
  let nextLanes = params.lanes;
  let nextId = params.nextId;
  let bossCreated: ReturnType<typeof createBoss>['boss'] | null = null;
  let spawnedEnemies: ReturnType<typeof spawnEnemyBatch>['spawnedEnemies'] = [];
  let encounterStarted: EncounterType | null = null;
  let rewardChoices: ReturnType<typeof rollRewardChoices> = [];
  let absorbedHp = 0;

  if (encounterCleared) {
    return {
      phase: 'reward',
      phaseTurn: 0,
      encounterType,
      lanes: nextLanes,
      bossCreated,
      nextId,
      spawnedEnemies,
      encounterStarted,
      rewardChoices: rollRewardChoices(rng),
      absorbedHp,
    };
  }

  if (phase === 'normal') {
    const spawnCount = normalSpawnCountForPhaseTurn(phaseTurn);
    const spawn = spawnEnemyBatch(nextLanes, turn, nextId, rng, spawnCount);
    nextLanes = spawn.lanes;
    spawnedEnemies = spawn.spawnedEnemies;
    nextId = spawn.nextId;
    nextPhaseTurn = phaseTurn + 1;

    if (nextPhaseTurn >= normalTurnCount()) {
      nextPhase = 'warning';
      nextPhaseTurn = 0;
      nextEncounterType = encounterTypeForTier(tier);
    }
  } else if (phase === 'warning') {
    nextPhaseTurn = phaseTurn + 1;

    if (nextPhaseTurn >= LANEFOLD_CONFIG.progression.warningTurns) {
      encounterStarted = encounterType ?? encounterTypeForTier(tier);
      nextPhase = encounterStarted;
      nextPhaseTurn = 0;
      nextEncounterType = encounterStarted;

      if (encounterStarted === 'elite') {
        const eliteSpawn = spawnEliteEnemy(nextLanes, turn, nextId, rng);
        nextLanes = eliteSpawn.lanes;
        spawnedEnemies = eliteSpawn.spawnedEnemies;
        nextId = eliteSpawn.nextId;
      } else {
        absorbedHp = sumRemainingEnemyHp(nextLanes);
        nextLanes = createEmptyLanes();
        const bossSpawn = createBoss(turn, nextId, absorbedHp);
        bossCreated = bossSpawn.boss;
        nextId = bossSpawn.nextId;
      }
    }
  } else if (phase === 'elite' || phase === 'boss') {
    nextPhaseTurn = phaseTurn + 1;
  }

  return {
    phase: nextPhase,
    phaseTurn: nextPhaseTurn,
    encounterType: nextEncounterType,
    lanes: nextLanes,
    bossCreated,
    nextId,
    spawnedEnemies,
    encounterStarted,
    rewardChoices,
    absorbedHp,
  };
}

export function resolvePlayerTurn(
  state: RunState,
  direction: Direction,
  rng: () => number,
): { state: RunState; summary: TurnSummary } {
  const moved = moveBoard(state.board, direction, state.nextEntityId);

  if (!moved.changed) {
    return {
      state,
      summary: invalidSummary(state, direction),
    };
  }

  const turn = state.turn + 1;
  const phaseBefore = state.phase;
  let lanes = state.lanes;
  let boss = state.boss;
  let nextEntityId = moved.nextId;
  let scoreGain = moved.scoreGain;
  let bossDefeated = false;
  const attacks: AttackEvent[] = [];

  if (state.modifiers.overcharge) {
    for (const merge of moved.merges) {
      const overchargeDamage = Math.floor(
        tileDisplayValue(merge.rank) * LANEFOLD_CONFIG.rewards.overchargeDamageFactor,
      );
      const overcharge = applyDirectLaneDamage(
        lanes,
        boss,
        merge.col,
        overchargeDamage,
        state.modifiers,
        'overcharge',
      );

      lanes = overcharge.lanes;
      boss = overcharge.boss;
      scoreGain += overcharge.scoreGain;
      bossDefeated = bossDefeated || overcharge.bossDefeated;
      attacks.push(...overcharge.attacks);

      if (bossDefeated) {
        break;
      }
    }
  }

  if (!bossDefeated) {
    const combat = resolveCombat(moved.grid, lanes, state.modifiers, boss);
    lanes = combat.lanes;
    boss = combat.boss;
    scoreGain += combat.scoreGain;
    bossDefeated = combat.bossDefeated;
    attacks.push(...combat.attacks);
  }

  const encounterCleared =
    phaseBefore === 'boss' && bossDefeated
      ? 'boss'
      : phaseBefore === 'elite' && !hasElite(lanes)
        ? 'elite'
        : null;
  const advanceFrozen = state.freezeAdvanceTurns > 0;
  const advanced = advanceFrozen
    ? {
        lanes,
        boss,
        breachedLane: null,
        breachedByBoss: false,
      }
    : advanceEnemies(lanes, boss);

  lanes = advanced.lanes;
  boss = advanced.boss;

  let lossReason = state.lossReason;

  if (advanced.breachedLane !== null) {
    lossReason = 'lane_breach';
  }

  let spawnedEnemies: ReturnType<typeof spawnEnemyBatch>['spawnedEnemies'] = [];
  let phase = state.phase;
  let phaseTurn = state.phaseTurn;
  let encounterType = state.encounterType;
  let encounterStarted: EncounterType | null = null;
  let rewardChoices: RewardDefinition[] = state.rewardChoices;
  let absorbedHp = 0;

  if (!lossReason) {
    const progression = resolveProgressionAfterAdvance({
      phase,
      phaseTurn,
      tier: state.tier,
      encounterType,
      lanes,
      nextId: nextEntityId,
      turn,
      rng,
      encounterCleared,
    });

    phase = progression.phase;
    phaseTurn = progression.phaseTurn;
    encounterType = progression.encounterType;
    lanes = progression.lanes;
    boss = progression.bossCreated ?? boss;
    nextEntityId = progression.nextId;
    spawnedEnemies = progression.spawnedEnemies;
    encounterStarted = progression.encounterStarted;
    rewardChoices = progression.rewardChoices;
    absorbedHp = progression.absorbedHp;
    scoreGain += spawnedEnemies.length * tileDisplayValue(difficultyTier(turn));
  }

  const spawnedTile = spawnRandomTile(moved.grid, nextEntityId, rng);
  nextEntityId = spawnedTile.nextId;
  let board = spawnedTile.grid;
  let extraSpawnedTile: TileSpawnEvent | null = null;

  if (state.modifiers.seeder && moved.merges.length > 0) {
    const seeded = spawnTileWithRank(board, nextEntityId, rng, 1);
    board = seeded.grid;
    nextEntityId = seeded.nextId;
    extraSpawnedTile = seeded.spawnedTile;
  }

  if (!lossReason && LANEFOLD_CONFIG.loss.loseOnGridLock && !canAnyMove(board)) {
    lossReason = 'grid_lock';
  }

  const nextState: RunState = {
    ...state,
    board,
    lanes,
    boss,
    turn,
    phase,
    phaseTurn,
    encounterType,
    score: state.score + scoreGain,
    pressure: Math.round(computePressure(lanes, boss)),
    difficulty: difficultyTier(turn),
    nextEntityId,
    lossReason,
    freezeAdvanceTurns: advanceFrozen
      ? Math.max(0, state.freezeAdvanceTurns - 1)
      : state.freezeAdvanceTurns,
    rewardChoices,
  };

  return {
    state: nextState,
    summary: {
      changed: true,
      direction,
      merges: moved.merges,
      changedCells: moved.changedCells,
      attacks,
      spawnedEnemies,
      spawnedTile: spawnedTile.spawnedTile,
      extraSpawnedTile,
      scoreGain,
      invalidMove: false,
      breachedLane: advanced.breachedLane,
      breachedByBoss: advanced.breachedByBoss,
      lossReason,
      phaseBefore,
      phaseAfter: phase,
      encounterStarted,
      encounterCleared,
      rewardChoices,
      advanceFrozen,
      absorbedHp,
    },
  };
}
