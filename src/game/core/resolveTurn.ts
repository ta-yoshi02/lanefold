import { LANE_COUNT, LANEFOLD_CONFIG, difficultyTier, tileDisplayValue } from '../config';
import { canAnyMove, createEmptyGrid, moveBoard, spawnRandomTile } from './board';
import {
  advanceEnemies,
  computePressure,
  resolveCombat,
  spawnEnemies,
} from './enemies';
import type {
  Direction,
  RunState,
  TurnSummary,
} from '../types';

function createEmptyLanes() {
  return Array.from({ length: LANE_COUNT }, () => []);
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
    turn: 0,
    score: 0,
    pressure: 0,
    difficulty: 1,
    nextEntityId,
    lossReason: null,
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
      summary: {
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
        lossReason: state.lossReason,
      },
    };
  }

  const turn = state.turn + 1;
  const combat = resolveCombat(moved.grid, state.lanes);
  const advanced = advanceEnemies(combat.lanes);
  const spawnedEnemies = spawnEnemies(
    advanced.lanes,
    turn,
    moved.nextId,
    rng,
  );
  const spawnedTile = spawnRandomTile(
    moved.grid,
    spawnedEnemies.nextId,
    rng,
  );

  let lossReason = state.lossReason;

  if (advanced.breachedLane !== null) {
    lossReason = 'lane_breach';
  }

  if (!lossReason && LANEFOLD_CONFIG.loss.loseOnGridLock && !canAnyMove(spawnedTile.grid)) {
    lossReason = 'grid_lock';
  }

  const nextState: RunState = {
    board: spawnedTile.grid,
    lanes: spawnedEnemies.lanes,
    turn,
    score:
      state.score +
      moved.scoreGain +
      combat.scoreGain +
      spawnedEnemies.spawnedEnemies.length * tileDisplayValue(difficultyTier(turn)),
    pressure: Math.round(computePressure(spawnedEnemies.lanes)),
    difficulty: difficultyTier(turn),
    nextEntityId: spawnedTile.nextId,
    lossReason,
  };

  return {
    state: nextState,
    summary: {
      changed: true,
      direction,
      merges: moved.merges,
      changedCells: moved.changedCells,
      attacks: combat.attacks,
      spawnedEnemies: spawnedEnemies.spawnedEnemies,
      spawnedTile: spawnedTile.spawnedTile,
      scoreGain:
        moved.scoreGain +
        combat.scoreGain +
        spawnedEnemies.spawnedEnemies.length * tileDisplayValue(difficultyTier(turn)),
      invalidMove: false,
      breachedLane: advanced.breachedLane,
      lossReason,
    },
  };
}
