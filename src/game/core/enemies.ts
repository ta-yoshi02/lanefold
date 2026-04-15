import {
  BOARD_HEIGHT,
  LANE_COUNT,
  LANEFOLD_CONFIG,
  difficultyTier,
  enemyKillScore,
  tileAttackPower,
} from '../config';
import type {
  AdvanceResolution,
  AttackEvent,
  CombatResolution,
  Enemy,
  EnemyKind,
  EnemySpawnEvent,
  Grid,
  Lanes,
  SpawnResolution,
} from '../types';

function cloneEnemy(enemy: Enemy): Enemy {
  return { ...enemy };
}

export function cloneLanes(lanes: Lanes): Lanes {
  return lanes.map((lane) => lane.map(cloneEnemy));
}

function sortLane(lane: Enemy[]): Enemy[] {
  return [...lane].sort((a, b) => b.progress - a.progress || a.id - b.id);
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function spawnCountForTurn(turn: number): number {
  const extraBursts = Math.floor(turn / LANEFOLD_CONFIG.lanes.spawnBatchEveryTurns);
  return Math.min(
    LANEFOLD_CONFIG.lanes.spawnBatchBase + extraBursts,
    LANEFOLD_CONFIG.lanes.spawnBatchCap,
  );
}

function enemyHp(turn: number, rng: () => number): number {
  const variance = Math.floor(rng() * (LANEFOLD_CONFIG.enemies.hpVariance + 1));
  return Math.round(
    LANEFOLD_CONFIG.enemies.hpBase + turn * LANEFOLD_CONFIG.enemies.hpScalePerTurn + variance,
  );
}

function spawnLaneOrder(lanes: Lanes, rng: () => number): number[] {
  const decorated = Array.from({ length: LANE_COUNT }, (_, lane) => {
    const laneUnits = lanes[lane] ?? [];
    const pressure = laneUnits.reduce((total, enemy) => total + enemy.progress + 1, 0);

    return {
      lane,
      weight: pressure + laneUnits.length * 3 + rng(),
    };
  });

  decorated.sort((a, b) => a.weight - b.weight);
  return decorated.map((entry) => entry.lane);
}

export function resolveCombat(board: Grid, lanes: Lanes): CombatResolution {
  const nextLanes = cloneLanes(lanes).map(sortLane);
  const attacks: AttackEvent[] = [];
  const destroyedEnemyIds: number[] = [];
  let scoreGain = 0;

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const laneEnemies = nextLanes[lane] ?? [];

    if (laneEnemies.length === 0) {
      continue;
    }

    for (let row = BOARD_HEIGHT - 1; row >= 0; row -= 1) {
      const tile = board[row]?.[lane];

      if (!tile || laneEnemies.length === 0) {
        continue;
      }

      let remainingDamage = tileAttackPower(tile.rank, row);

      while (remainingDamage > 0 && laneEnemies.length > 0) {
        const target = laneEnemies[0];
        const appliedDamage = Math.min(remainingDamage, target.hp);

        target.hp -= appliedDamage;
        attacks.push({
          lane,
          enemyId: target.id,
          tileRank: tile.rank,
          sourceRow: row,
          damage: appliedDamage,
          destroyed: target.hp <= 0,
        });

        remainingDamage -= appliedDamage;

        if (target.hp <= 0) {
          destroyedEnemyIds.push(target.id);
          scoreGain += enemyKillScore(target.maxHp);
          laneEnemies.shift();
        }

        if (!LANEFOLD_CONFIG.combat.overflowIntoNextEnemy) {
          break;
        }
      }
    }

    nextLanes[lane] = laneEnemies;
  }

  return {
    lanes: nextLanes,
    attacks,
    destroyedEnemyIds,
    scoreGain,
  };
}

export function advanceEnemies(lanes: Lanes): AdvanceResolution {
  const nextLanes = cloneLanes(lanes).map((lane) =>
    sortLane(
      lane.map((enemy) => ({
        ...enemy,
        progress: enemy.progress + LANEFOLD_CONFIG.lanes.enemyAdvancePerTurn,
      })),
    ),
  );

  let breachedLane: number | null = null;

  for (let lane = 0; lane < nextLanes.length; lane += 1) {
    const frontEnemy = nextLanes[lane]?.[0];

    if (
      frontEnemy &&
      LANEFOLD_CONFIG.loss.loseOnLaneBreach &&
      frontEnemy.progress >= LANEFOLD_CONFIG.loss.breachProgress
    ) {
      breachedLane = lane;
      break;
    }
  }

  return {
    lanes: nextLanes,
    breachedLane,
  };
}

export function spawnEnemies(
  lanes: Lanes,
  turn: number,
  nextId: number,
  rng: () => number,
): SpawnResolution {
  const shouldSpawn =
    turn > 0 && turn % LANEFOLD_CONFIG.lanes.enemySpawnIntervalTurns === 0;

  if (!shouldSpawn) {
    return {
      lanes: cloneLanes(lanes),
      spawnedEnemies: [],
      nextId,
    };
  }

  const nextLanes = cloneLanes(lanes).map(sortLane);
  const spawnedEnemies: EnemySpawnEvent[] = [];
  let currentId = nextId;
  const batchSize = spawnCountForTurn(turn);
  const laneOrder = spawnLaneOrder(nextLanes, rng);
  const chosenLanes = laneOrder.filter(
    (lane) => (nextLanes[lane]?.length ?? 0) < LANEFOLD_CONFIG.lanes.maxEnemiesPerLane,
  );

  for (let index = 0; index < Math.min(batchSize, chosenLanes.length); index += 1) {
    const lane = chosenLanes[index] ?? 0;
    const hp = enemyHp(turn, rng);
    const kind = pick<EnemyKind>(LANEFOLD_CONFIG.enemies.kindPool, rng);
    const enemy: Enemy = {
      id: currentId,
      lane,
      hp,
      maxHp: hp,
      progress: LANEFOLD_CONFIG.lanes.spawnProgress,
      kind,
    };

    nextLanes[lane] = sortLane([...(nextLanes[lane] ?? []), enemy]);
    spawnedEnemies.push({
      enemyId: currentId,
      lane,
      hp,
      kind,
    });
    currentId += 1;
  }

  return {
    lanes: nextLanes,
    spawnedEnemies,
    nextId: currentId,
  };
}

export function computePressure(lanes: Lanes): number {
  return lanes.reduce((total, lane) => {
    const lanePressure = lane.reduce((laneTotal, enemy) => {
      const depthWeight = Math.max(1, enemy.progress + 1);
      return laneTotal + depthWeight + enemy.hp * 0.05;
    }, 0);

    return total + lanePressure;
  }, 0);
}

export function computeDifficulty(turn: number): number {
  return difficultyTier(turn);
}
