import {
  LANE_COUNT,
  LANEFOLD_CONFIG,
  difficultyTier,
  enemyKillScore,
  tileDisplayValue,
} from '../config';
import type {
  AdvanceResolution,
  AttackSource,
  AttackEvent,
  BossState,
  CombatResolution,
  Enemy,
  EnemyKind,
  EnemySpawnEvent,
  Grid,
  Lanes,
  RunModifiers,
  SpawnResolution,
} from '../types';

export interface LaneAttackProfile {
  baseDamage: number[];
  splashDamage: number[];
  totalDamage: number[];
  bossEffectiveDamage: number[];
}

function cloneEnemy(enemy: Enemy): Enemy {
  return { ...enemy };
}

function cloneBoss(boss: BossState | null): BossState | null {
  return boss ? { ...boss, occupiedLanes: [...boss.occupiedLanes] } : null;
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

function bossHp(turn: number, absorbedHp: number): number {
  return Math.round(
    LANEFOLD_CONFIG.enemies.hpBase +
      turn * LANEFOLD_CONFIG.enemies.hpScalePerTurn * LANEFOLD_CONFIG.encounters.bossHpMultiplier +
      absorbedHp,
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

function isBossSupportLane(boss: BossState | null, lane: number): boolean {
  return Boolean(boss && !boss.occupiedLanes.includes(lane));
}

function effectiveBossDamage(rawDamage: number, boss: BossState | null, lane: number): number {
  if (!boss) {
    return rawDamage;
  }

  if (isBossSupportLane(boss, lane)) {
    return Math.floor(rawDamage * LANEFOLD_CONFIG.encounters.sideLaneSupportMultiplier);
  }

  return rawDamage;
}

function applyDamageToBoss(
  boss: BossState,
  lane: number,
  laneDamage: number,
  source: AttackSource,
): { boss: BossState; attack: AttackEvent | null; scoreGain: number; bossDefeated: boolean } {
  const effectiveDamage = effectiveBossDamage(laneDamage, boss, lane);

  if (effectiveDamage <= 0 || boss.hp <= 0) {
    return {
      boss,
      attack: null,
      scoreGain: 0,
      bossDefeated: boss.hp <= 0,
    };
  }

  const hpBefore = boss.hp;
  const appliedDamage = Math.min(effectiveDamage, hpBefore);
  const hpAfter = hpBefore - appliedDamage;
  const nextBoss = {
    ...boss,
    hp: hpAfter,
  };
  const bossDefeated = hpAfter <= 0;

  return {
    boss: nextBoss,
    attack: {
      lane,
      enemyId: boss.id,
      laneDamage,
      damage: appliedDamage,
      hpBefore,
      hpAfter,
      destroyed: bossDefeated,
      target: 'boss',
      source,
      support: isBossSupportLane(boss, lane),
    },
    scoreGain: bossDefeated ? enemyKillScore(boss.maxHp) : 0,
    bossDefeated,
  };
}

function applyDamageToLaneEnemies(
  lanes: Lanes,
  lane: number,
  laneDamage: number,
  source: AttackSource,
  modifiers: RunModifiers,
): {
  lanes: Lanes;
  attacks: AttackEvent[];
  destroyedEnemyIds: number[];
  scoreGain: number;
} {
  const nextLanes = cloneLanes(lanes).map(sortLane);
  const laneEnemies = nextLanes[lane] ?? [];
  const attacks: AttackEvent[] = [];
  const destroyedEnemyIds: number[] = [];
  let scoreGain = 0;
  let remainingDamage = laneDamage;

  while (laneEnemies.length > 0 && remainingDamage > 0) {
    const target = laneEnemies[0];
    const hpBefore = target.hp;
    const appliedDamage = Math.min(remainingDamage, hpBefore);
    const hpAfter = hpBefore - appliedDamage;

    target.hp = hpAfter;
    attacks.push({
      lane,
      enemyId: target.id,
      laneDamage,
      damage: appliedDamage,
      hpBefore,
      hpAfter,
      destroyed: hpAfter <= 0,
      target: 'enemy',
      source,
      support: false,
    });

    remainingDamage -= appliedDamage;

    if (target.hp > 0) {
      break;
    }

    destroyedEnemyIds.push(target.id);
    scoreGain += enemyKillScore(target.maxHp);
    laneEnemies.shift();

    if (!modifiers.pierce) {
      break;
    }
  }

  nextLanes[lane] = laneEnemies;

  return {
    lanes: nextLanes,
    attacks,
    destroyedEnemyIds,
    scoreGain,
  };
}

export function computeLaneAttackProfile(
  board: Grid,
  modifiers: RunModifiers,
  boss: BossState | null = null,
): LaneAttackProfile {
  const baseDamage = Array.from({ length: LANE_COUNT }, () => 0);
  const splashDamage = Array.from({ length: LANE_COUNT }, () => 0);

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    baseDamage[lane] = board.reduce((total, row) => {
      const tile = row[lane];
      return total + (tile ? tileDisplayValue(tile.rank) : 0);
    }, 0);
  }

  if (modifiers.splashMatrix) {
    for (let row = 0; row < board.length; row += 1) {
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        const tile = board[row]?.[lane];

        if (!tile) {
          continue;
        }

        const value = tileDisplayValue(tile.rank);

        if (value < LANEFOLD_CONFIG.rewards.splashThresholdValue) {
          continue;
        }

        const splash = Math.floor(value * LANEFOLD_CONFIG.rewards.splashDamageFactor);

        if (lane > 0) {
          splashDamage[lane - 1] += splash;
        }

        if (lane < LANE_COUNT - 1) {
          splashDamage[lane + 1] += splash;
        }
      }
    }
  }

  const totalDamage = baseDamage.map((damage, lane) => damage + (splashDamage[lane] ?? 0));
  const bossEffectiveDamage = totalDamage.map((damage, lane) =>
    effectiveBossDamage(damage, boss, lane),
  );

  return {
    baseDamage,
    splashDamage,
    totalDamage,
    bossEffectiveDamage,
  };
}

export function applyDirectLaneDamage(
  lanes: Lanes,
  boss: BossState | null,
  lane: number,
  laneDamage: number,
  modifiers: RunModifiers,
  source: AttackSource,
): CombatResolution {
  if (laneDamage <= 0) {
    return {
      lanes: cloneLanes(lanes),
      boss: cloneBoss(boss),
      attacks: [],
      destroyedEnemyIds: [],
      scoreGain: 0,
      bossDefeated: boss ? boss.hp <= 0 : false,
    };
  }

  if (boss) {
    const bossResult = applyDamageToBoss(cloneBoss(boss) ?? boss, lane, laneDamage, source);

    return {
      lanes: cloneLanes(lanes),
      boss: bossResult.boss,
      attacks: bossResult.attack ? [bossResult.attack] : [],
      destroyedEnemyIds: [],
      scoreGain: bossResult.scoreGain,
      bossDefeated: bossResult.bossDefeated,
    };
  }

  const laneResult = applyDamageToLaneEnemies(lanes, lane, laneDamage, source, modifiers);

  return {
    lanes: laneResult.lanes,
    boss: null,
    attacks: laneResult.attacks,
    destroyedEnemyIds: laneResult.destroyedEnemyIds,
    scoreGain: laneResult.scoreGain,
    bossDefeated: false,
  };
}

export function resolveCombat(
  board: Grid,
  lanes: Lanes,
  modifiers: RunModifiers,
  boss: BossState | null,
): CombatResolution {
  let nextLanes = cloneLanes(lanes).map(sortLane);
  let nextBoss = cloneBoss(boss);
  const attacks: AttackEvent[] = [];
  const destroyedEnemyIds: number[] = [];
  let scoreGain = 0;
  let bossDefeated = false;
  const attackProfile = computeLaneAttackProfile(board, modifiers, nextBoss);

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const laneDamage = attackProfile.totalDamage[lane] ?? 0;

    if (laneDamage <= 0) {
      continue;
    }

    if (nextBoss) {
      const bossResult = applyDamageToBoss(nextBoss, lane, laneDamage, 'lane');
      nextBoss = bossResult.boss;
      scoreGain += bossResult.scoreGain;
      bossDefeated = bossResult.bossDefeated;

      if (bossResult.attack) {
        attacks.push(bossResult.attack);
      }

      if (bossDefeated) {
        break;
      }

      continue;
    }

    const laneEnemies = nextLanes[lane] ?? [];

    if (laneEnemies.length === 0) {
      continue;
    }

    const laneResult = applyDamageToLaneEnemies(
      nextLanes,
      lane,
      laneDamage,
      'lane',
      modifiers,
    );

    nextLanes = laneResult.lanes;
    attacks.push(...laneResult.attacks);
    destroyedEnemyIds.push(...laneResult.destroyedEnemyIds);
    scoreGain += laneResult.scoreGain;
  }

  return {
    lanes: nextLanes,
    boss: nextBoss && nextBoss.hp > 0 ? nextBoss : null,
    attacks,
    destroyedEnemyIds,
    scoreGain,
    bossDefeated,
  };
}

export function advanceEnemies(lanes: Lanes, boss: BossState | null = null): AdvanceResolution {
  const nextLanes = cloneLanes(lanes).map((lane) =>
    sortLane(
      lane.map((enemy) => ({
        ...enemy,
        progress: enemy.progress + LANEFOLD_CONFIG.lanes.enemyAdvancePerTurn,
      })),
    ),
  );
  const nextBoss = boss
    ? {
        ...boss,
        progress: boss.progress + LANEFOLD_CONFIG.lanes.enemyAdvancePerTurn,
      }
    : null;

  let breachedLane: number | null = null;
  let breachedByBoss = false;

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

  if (
    breachedLane === null &&
    nextBoss &&
    LANEFOLD_CONFIG.loss.loseOnLaneBreach &&
    nextBoss.progress >= LANEFOLD_CONFIG.loss.breachProgress
  ) {
    breachedLane = nextBoss.occupiedLanes[Math.floor(nextBoss.occupiedLanes.length / 2)] ?? 0;
    breachedByBoss = true;
  }

  return {
    lanes: nextLanes,
    boss: nextBoss,
    breachedLane,
    breachedByBoss,
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
  const batchSize = spawnCountForTurn(turn);

  return spawnEnemyBatch(nextLanes, turn, nextId, rng, batchSize);
}

export function spawnEnemyBatch(
  lanes: Lanes,
  turn: number,
  nextId: number,
  rng: () => number,
  batchSize: number,
  hpMultiplier = 1,
  forcedKind: EnemyKind | null = null,
): SpawnResolution {
  if (batchSize <= 0) {
    return {
      lanes: cloneLanes(lanes),
      spawnedEnemies: [],
      nextId,
    };
  }

  const nextLanes = cloneLanes(lanes).map(sortLane);
  const spawnedEnemies: EnemySpawnEvent[] = [];
  let currentId = nextId;
  const laneOrder = spawnLaneOrder(nextLanes, rng);
  const chosenLanes = laneOrder.filter(
    (lane) => (nextLanes[lane]?.length ?? 0) < LANEFOLD_CONFIG.lanes.maxEnemiesPerLane,
  );

  for (let index = 0; index < Math.min(batchSize, chosenLanes.length); index += 1) {
    const lane = chosenLanes[index] ?? 0;
    const hp = Math.round(enemyHp(turn, rng) * hpMultiplier);
    const kind = forcedKind ?? pick<EnemyKind>(LANEFOLD_CONFIG.enemies.kindPool, rng);
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

export function spawnEliteEnemy(
  lanes: Lanes,
  turn: number,
  nextId: number,
  rng: () => number,
): SpawnResolution {
  return spawnEnemyBatch(
    lanes,
    turn,
    nextId,
    rng,
    1,
    LANEFOLD_CONFIG.encounters.eliteHpMultiplier,
    'elite',
  );
}

export function sumRemainingEnemyHp(lanes: Lanes): number {
  return lanes.reduce(
    (total, lane) => total + lane.reduce((laneTotal, enemy) => laneTotal + enemy.hp, 0),
    0,
  );
}

export function createBoss(
  turn: number,
  nextId: number,
  absorbedHp: number,
): { boss: BossState; nextId: number } {
  const hp = bossHp(turn, absorbedHp);

  return {
    boss: {
      id: nextId,
      hp,
      maxHp: hp,
      progress: LANEFOLD_CONFIG.encounters.bossSpawnProgress,
      occupiedLanes: [...LANEFOLD_CONFIG.encounters.bossCenterLanes],
      absorbedHp,
    },
    nextId: nextId + 1,
  };
}

export function computePressure(lanes: Lanes, boss: BossState | null = null): number {
  const lanePressure = lanes.reduce((total, lane) => {
    const lanePressure = lane.reduce((laneTotal, enemy) => {
      const depthWeight = Math.max(1, enemy.progress + 1);
      return laneTotal + depthWeight + enemy.hp * 0.05;
    }, 0);

    return total + lanePressure;
  }, 0);

  if (!boss) {
    return lanePressure;
  }

  return lanePressure + boss.occupiedLanes.length * (boss.progress + 1) + boss.hp * 0.04;
}

export function computeDifficulty(turn: number): number {
  return difficultyTier(turn);
}
